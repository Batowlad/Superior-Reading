// Background service worker for Chrome extension
// Import spotify_auth.js to use authentication functions
importScripts('spotify_auth.js');

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
    } else if (request.action === 'authenticate') {
        // Handle OAuth authentication request from popup
        // This runs in the background service worker, which persists even when popup closes
        (async () => {
            try {
                console.log('[Background] Authentication request received from popup');
                
                // Check if SpotifyAuth is available
                if (!SpotifyAuth || typeof SpotifyAuth.authenticate !== 'function') {
                    throw new Error('SpotifyAuth not available in background script');
                }
                
                // Send initial status update
                chrome.runtime.sendMessage({
                    action: 'authStatus',
                    status: 'authenticating',
                    message: 'Starting authentication...'
                }).catch(() => {
                    // Ignore errors if popup is closed
                });
                
                // Perform authentication in background context
                await SpotifyAuth.authenticate();
                
                console.log('[Background] Authentication successful');
                
                // Verify authentication
                const isAuth = await SpotifyAuth.isAuthenticated();
                if (!isAuth) {
                    throw new Error('Authentication verification failed');
                }
                
                // Send success status
                chrome.runtime.sendMessage({
                    action: 'authStatus',
                    status: 'success',
                    message: 'Authentication successful'
                }).catch(() => {
                    // Ignore errors if popup is closed
                });
                
                sendResponse({success: true});
            } catch (error) {
                console.error('[Background] Authentication error:', error);
                
                // Send error status
                chrome.runtime.sendMessage({
                    action: 'authStatus',
                    status: 'error',
                    message: error.message || 'Authentication failed'
                }).catch(() => {
                    // Ignore errors if popup is closed
                });
                
                sendResponse({success: false, error: error.message});
            }
        })();
        return true; // Keep channel open for async response
    }
});

// Note: Auto-scraping is handled by content.js to avoid duplicate scraping
// The content script automatically scrapes when pages load
