// Internal state to prevent duplicate intervals
let scrollInterval = null;
let isScrolling = false;
let scrollDirection = 'down'; // 'down' or 'up'
let currentSettings = {
  scrollSpeed: 'medium'
};
let scrollContainer = null; // The element that actually scrolls

// Find the scroll container (document, body, or a div with overflow)
function findScrollContainer() {
  // Check if document/body is scrollable
  if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
    return {
      element: document.documentElement,
      isWindow: true
    };
  }
  
  if (document.body.scrollHeight > document.body.clientHeight) {
    return {
      element: document.body,
      isWindow: true
    };
  }
  
  // Look for common scroll containers (divs with overflow)
  // Try common selectors first (for ChatGPT and similar apps)
  const commonSelectors = [
    'main',
    '[role="main"]',
    '.overflow-auto',
    '.overflow-y-auto',
    '.overflow-scroll',
    '.overflow-y-scroll',
    '[style*="overflow"]',
    'div[class*="scroll"]',
    'div[class*="overflow"]'
  ];
  
  for (const selector of commonSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        const hasOverflow = style.overflow === 'auto' || style.overflow === 'scroll' || 
                            style.overflowY === 'auto' || style.overflowY === 'scroll';
        
        if (hasOverflow && el.scrollHeight > el.clientHeight && el.scrollHeight > 200) {
          // Found a scrollable container
          return {
            element: el,
            isWindow: false
          };
        }
      }
    } catch (e) {
      // Invalid selector, continue
    }
  }
  
  // Fallback: Look through all elements
  const allElements = document.querySelectorAll('*');
  let bestMatch = null;
  let maxScrollHeight = 0;
  
  for (const el of allElements) {
    const style = window.getComputedStyle(el);
    const hasOverflow = style.overflow === 'auto' || style.overflow === 'scroll' || 
                        style.overflowY === 'auto' || style.overflowY === 'scroll';
    
    if (hasOverflow && el.scrollHeight > el.clientHeight && el.scrollHeight > maxScrollHeight) {
      maxScrollHeight = el.scrollHeight;
      bestMatch = el;
    }
  }
  
  if (bestMatch && maxScrollHeight > 200) {
    return {
      element: bestMatch,
      isWindow: false
    };
  }
  
  // Default to document
  return {
    element: document.documentElement,
    isWindow: true
  };
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    if (message.settings) {
      currentSettings = { ...currentSettings, ...message.settings };
    }
    // Find scroll container when starting
    scrollContainer = findScrollContainer();
    startScrolling();
    sendResponse({ success: true });
  } else if (message.action === 'stop') {
    stopScrolling();
    sendResponse({ success: true });
  }
  return true;
});

// Start scrolling
function startScrolling() {
  if (isScrolling) {
    return; // Already scrolling
  }

  isScrolling = true;
  scrollDirection = 'down';

  // Determine scroll delay and distance based on speed setting
  let minDelay, maxDelay, minDistance, maxDistance;
  switch (currentSettings.scrollSpeed) {
    case 'slow':
      minDelay = 800;  // 0.8 seconds
      maxDelay = 1500; // 1.5 seconds
      minDistance = 5;  // Smaller scroll distance
      maxDistance = 15;
      break;
    case 'fast':
      minDelay = 100;
      maxDelay = 250;
      minDistance = 15;
      maxDistance = 40;
      break;
    case 'medium':
    default:
      minDelay = 400;  // 0.4 seconds
      maxDelay = 800;  // 0.8 seconds
      minDistance = 8;
      maxDistance = 25;
      break;
  }

  performScroll(minDelay, maxDelay, minDistance, maxDistance);
}

// Stop scrolling
function stopScrolling() {
  isScrolling = false;
  if (scrollInterval) {
    clearTimeout(scrollInterval);
    scrollInterval = null;
  }
}

// Perform a single scroll action
function performScroll(minDelay, maxDelay, minDistance, maxDistance) {
  if (!isScrolling) {
    return; // Stop was called
  }

  // Re-find scroll container periodically in case page structure changed (for SPAs like ChatGPT)
  // Check every 10 scrolls or if container is null
  if (!scrollContainer || Math.random() < 0.1) {
    scrollContainer = findScrollContainer();
  }

  const container = scrollContainer.element;
  const isWindow = scrollContainer.isWindow;

  // Get scroll properties
  let scrollHeight, clientHeight, scrollTop;
  
  if (isWindow) {
    scrollHeight = document.documentElement.scrollHeight;
    clientHeight = document.documentElement.clientHeight;
    scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
  } else {
    scrollHeight = container.scrollHeight;
    clientHeight = container.clientHeight;
    scrollTop = container.scrollTop;
  }

  // Random scroll distance based on speed setting
  const distanceRange = maxDistance - minDistance;
  const scrollDistance = Math.floor(Math.random() * (distanceRange + 1)) + minDistance;

  if (scrollDirection === 'down') {
    // Check if we're at the bottom
    if (scrollTop + clientHeight >= scrollHeight - 5) {
      // Reached bottom, switch to scrolling up
      scrollDirection = 'up';
    } else {
      // Scroll down
      if (isWindow) {
        window.scrollBy({
          top: scrollDistance,
          behavior: 'smooth'
        });
      } else {
        container.scrollBy({
          top: scrollDistance,
          behavior: 'smooth'
        });
      }
    }
  } else {
    // Scrolling up
    if (scrollTop <= 5) {
      // Reached top, switch to scrolling down
      scrollDirection = 'down';
    } else {
      // Scroll up
      if (isWindow) {
        window.scrollBy({
          top: -scrollDistance,
          behavior: 'smooth'
        });
      } else {
        container.scrollBy({
          top: -scrollDistance,
          behavior: 'smooth'
        });
      }
    }
  }

  // Schedule next scroll with random delay
  const nextDelay = getRandomDelay(minDelay, maxDelay);
  scrollInterval = setTimeout(() => {
    performScroll(minDelay, maxDelay, minDistance, maxDistance);
  }, nextDelay);
}

// Get random delay between min and max
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  stopScrolling();
});
