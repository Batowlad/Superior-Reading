// Background service worker for Chrome extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('Superior Reading extension installed');
});

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
