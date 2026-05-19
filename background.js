// Global state
let isRunning = false;
let tabSwitchInterval = null;
let mouseMoveTimerId = null;
let nativePort = null;
let lastScreenX = null;
let lastScreenY = null;

const NATIVE_HOST_NAME = 'com.autoscroll.mouse_mover';

let currentSettings = {
  scrollSpeed: 'medium',
  tabSwitchInterval: 20,
  mouseMoveInterval: 20
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    startAutomation(message.settings);
    sendResponse({ success: true });
  } else if (message.action === 'stop') {
    stopAutomation();
    sendResponse({ success: true });
  } else if (message.action === 'getStatus') {
    sendResponse({ isRunning });
  } else if (message.action === 'getNativeHostStatus') {
    checkNativeHost().then(sendResponse);
    return true;
  }
  return true;
});

function connectNativeHost() {
  if (nativePort) {
    return nativePort;
  }

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    nativePort.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        console.error('Native host disconnected:', chrome.runtime.lastError.message);
      }
      nativePort = null;
    });
  } catch (error) {
    console.error('Native host connect failed:', error);
    nativePort = null;
  }

  return nativePort;
}

function disconnectNativeHost() {
  if (nativePort) {
    try {
      nativePort.disconnect();
    } catch (error) {
      // ignore
    }
    nativePort = null;
  }
}

function checkNativeHost() {
  return new Promise((resolve) => {
    let port;
    let settled = false;

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      try {
        port?.disconnect();
      } catch (error) {
        // ignore
      }
      resolve(result);
    }

    try {
      port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    } catch (error) {
      finish({
        connected: false,
        error: 'Could not connect. Run native-host/install-native-host.sh with your extension ID.'
      });
      return;
    }

    const timeout = setTimeout(() => {
      finish({
        connected: false,
        error: 'Native host did not respond. Run install-native-host.sh and restart Chrome.'
      });
    }, 3000);

    port.onMessage.addListener((msg) => {
      if (msg.error) {
        finish({ connected: false, error: msg.error });
        return;
      }
      finish({ connected: true, tool: msg.tool || 'ok' });
    });

    port.onDisconnect.addListener(() => {
      if (!settled && chrome.runtime.lastError) {
        finish({
          connected: false,
          error: chrome.runtime.lastError.message
        });
      }
    });

    port.postMessage({ action: 'ping' });
  });
}

function scheduleNextMouseMove() {
  if (mouseMoveTimerId || !isRunning) {
    return;
  }

  const intervalSeconds = currentSettings.mouseMoveInterval || 20;
  const intervalMs = intervalSeconds * 1000;
  const randomFactor = 0.8 + Math.random() * 0.4;
  const nextMoveTime = intervalMs * randomFactor;

  mouseMoveTimerId = setTimeout(async () => {
    mouseMoveTimerId = null;
    if (!isRunning) {
      return;
    }

    await performNativeMouseMove();
    scheduleNextMouseMove();
  }, nextMoveTime);
}

async function performNativeMouseMove() {
  const port = connectNativeHost();
  if (!port) {
    return;
  }

  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const focused = windows.find((w) => w.focused) || windows[0];
  if (!focused || focused.width == null || focused.top == null) {
    return;
  }

  const toolbarHeight = 90;
  const margin = 50;
  const minX = focused.left + margin;
  const maxX = focused.left + focused.width - margin;
  const minY = focused.top + toolbarHeight;
  const maxY = focused.top + focused.height - margin;

  if (maxX <= minX || maxY <= minY) {
    return;
  }

  // Target not too close to last position (more natural travel distance)
  let toX;
  let toY;
  let attempts = 0;
  do {
    toX = minX + Math.random() * (maxX - minX);
    toY = minY + Math.random() * (maxY - minY);
    attempts++;
  } while (
    lastScreenX != null &&
    lastScreenY != null &&
    Math.hypot(toX - lastScreenX, toY - lastScreenY) < 80 &&
    attempts < 8
  );

  const fromX = lastScreenX ?? toX;
  const fromY = lastScreenY ?? toY;

  port.postMessage({
    action: 'move',
    fromX,
    fromY,
    toX,
    toY
  });

  lastScreenX = toX;
  lastScreenY = toY;
}

function startNativeMouseMovement() {
  stopNativeMouseMovementTimers();
  connectNativeHost();
  scheduleNextMouseMove();
}

function stopNativeMouseMovementTimers() {
  if (mouseMoveTimerId) {
    clearTimeout(mouseMoveTimerId);
    mouseMoveTimerId = null;
  }
  lastScreenX = null;
  lastScreenY = null;
}

// Start automation
async function startAutomation(settings) {
  if (isRunning) {
    return;
  }

  isRunning = true;
  currentSettings = { ...currentSettings, ...settings };

  startNativeMouseMovement();

  await activateRandomTabAndScroll();

  const minInterval = currentSettings.tabSwitchInterval * 1000;
  const maxInterval = (currentSettings.tabSwitchInterval + 10) * 1000;
  const randomInterval = Math.random() * (maxInterval - minInterval) + minInterval;

  tabSwitchInterval = setInterval(async () => {
    await activateRandomTabAndScroll();
  }, randomInterval);
}

// Stop automation
async function stopAutomation() {
  if (!isRunning) {
    return;
  }

  isRunning = false;

  if (tabSwitchInterval) {
    clearInterval(tabSwitchInterval);
    tabSwitchInterval = null;
  }

  stopNativeMouseMovementTimers();
  disconnectNativeHost();

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
      } catch (error) {
        // Tab might not have content script loaded, ignore
      }
    }
  }
}

async function activateRandomTabAndScroll() {
  try {
    const tabs = await chrome.tabs.query({});

    const validTabs = tabs.filter(tab =>
      tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
    );

    if (validTabs.length === 0) {
      return;
    }

    const randomIndex = Math.floor(Math.random() * validTabs.length);
    const selectedTab = validTabs[randomIndex];

    await chrome.tabs.update(selectedTab.id, { active: true });

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      await chrome.tabs.sendMessage(selectedTab.id, {
        action: 'start',
        settings: currentSettings
      });
    } catch (error) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: selectedTab.id },
          files: ['content.js']
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        await chrome.tabs.sendMessage(selectedTab.id, {
          action: 'start',
          settings: currentSettings
        });
      } catch (err) {
        console.error('Error starting scroll on tab:', err);
      }
    }
  } catch (error) {
    console.error('Error in activateRandomTabAndScroll:', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Orion installed');
});
