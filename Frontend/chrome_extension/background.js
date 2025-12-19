// Background service worker for Chrome extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('Superior Reading extension installed');
});

// Player is now in the popup, no need for separate page management

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape') {
        // Forward scrape request to content script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    function: () => {
                        if (window.superiorReadingScrape) {
                            window.superiorReadingScrape();
                        }
                    }
                });
            }
        });
        sendResponse({success: true});
    } else if (request.action === 'startPlayback') {
        // Handle playback request - store recommendations for popup to pick up
        (async () => {
            try {
                // Store recommendations in chrome.storage for the popup player to pick up
                await chrome.storage.local.set({
                    pendingRecommendations: request.recommendations,
                    recommendationsTimestamp: Date.now()
                });
                
                // Popup will check storage for pending recommendations when it opens
                sendResponse({success: true});
            } catch (error) {
                console.error('Error starting playback:', error);
                sendResponse({success: false, error: error.message});
            }
        })();
        return true; // Keep channel open for async response
    }
});

// Listen for tab updates to auto-scrape on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        // Small delay to ensure content script has loaded
        setTimeout(() => {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                function: () => {
                    if (window.superiorReadingScrape) {
                        window.superiorReadingScrape();
                    }
                }
            });
        }, 1000);
    }
});
