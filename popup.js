// DOM elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const scrollSpeedSelect = document.getElementById('scrollSpeed');
const tabIntervalSelect = document.getElementById('tabInterval');
const mouseMoveIntervalSelect = document.getElementById('mouseMoveInterval');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const nativeHostStatus = document.getElementById('nativeHostStatus');

// Load saved preferences and current status
async function loadPreferences() {
  try {
    const result = await chrome.storage.local.get(['scrollSpeed', 'tabSwitchInterval', 'mouseMoveInterval']);
    
    if (result.scrollSpeed) {
      scrollSpeedSelect.value = result.scrollSpeed;
    }
    
    if (result.tabSwitchInterval) {
      tabIntervalSelect.value = result.tabSwitchInterval;
    }
    
    if (result.mouseMoveInterval) {
      mouseMoveIntervalSelect.value = result.mouseMoveInterval;
    }

    const nativeStatus = await chrome.runtime.sendMessage({ action: 'getNativeHostStatus' });
    updateNativeHostStatus(nativeStatus);

    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    if (response && response.isRunning) {
      updateUI(true);
    } else {
      updateUI(false);
    }
  } catch (error) {
    console.error('Error loading preferences:', error);
  }
}

// Save preferences
async function savePreferences() {
  const preferences = {
    scrollSpeed: scrollSpeedSelect.value,
    tabSwitchInterval: parseInt(tabIntervalSelect.value),
    mouseMoveInterval: parseInt(mouseMoveIntervalSelect.value)
  };
  
  await chrome.storage.local.set(preferences);
  return preferences;
}

function updateNativeHostStatus(status) {
  if (!nativeHostStatus) {
    return;
  }

  if (status?.connected) {
    nativeHostStatus.textContent = `System bridge ready (${status.tool})`;
    nativeHostStatus.className = 'native-host-status ok';
    return;
  }

  const error = status?.error || 'System bridge not connected';
  nativeHostStatus.textContent = `${error}. Run: native-host/install-native-host.sh YOUR_EXTENSION_ID`;
  nativeHostStatus.className = 'native-host-status error';
}

// Update UI based on running state
function updateUI(isRunning) {
  if (isRunning) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = 'Running';
    statusDot.className = 'status-dot running';
    scrollSpeedSelect.disabled = true;
    tabIntervalSelect.disabled = true;
    mouseMoveIntervalSelect.disabled = true;
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = 'Stopped';
    statusDot.className = 'status-dot stopped';
    scrollSpeedSelect.disabled = false;
    tabIntervalSelect.disabled = false;
    mouseMoveIntervalSelect.disabled = false;
  }
}

// Start button handler
startBtn.addEventListener('click', async () => {
  try {
    const preferences = await savePreferences();
    
    const response = await chrome.runtime.sendMessage({
      action: 'start',
      settings: preferences
    });

    const nativeStatus = await chrome.runtime.sendMessage({ action: 'getNativeHostStatus' });
    updateNativeHostStatus(nativeStatus);

    if (!nativeStatus?.connected) {
      alert(
        'Presence interval needs a one-time setup.\n\n' +
        '1. Install: sudo apt install xdotool\n' +
        '2. Run: native-host/install-native-host.sh YOUR_EXTENSION_ID\n' +
        '3. Restart Chrome completely'
      );
    }

    if (response && response.success) {
      updateUI(true);
    }
  } catch (error) {
    console.error('Error starting automation:', error);
    alert('Failed to start automation. Please try again.');
  }
});

// Stop button handler
stopBtn.addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'stop' });

    if (response && response.success) {
      updateUI(false);
    }
  } catch (error) {
    console.error('Error stopping automation:', error);
    alert('Failed to stop automation. Please try again.');
  }
});

// Save preferences when changed (only when not running)
scrollSpeedSelect.addEventListener('change', async () => {
  if (!startBtn.disabled) {
    await savePreferences();
  }
});

tabIntervalSelect.addEventListener('change', async () => {
  if (!startBtn.disabled) {
    await savePreferences();
  }
});

mouseMoveIntervalSelect.addEventListener('change', async () => {
  if (!startBtn.disabled) {
    await savePreferences();
  }
});

// Initialize on load
loadPreferences();

