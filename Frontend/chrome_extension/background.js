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
    } else if (request.action === 'scrapingComplete') {
        // Handle automatic fetching of recommendations after scraping
        (async () => {
            try {
                console.log('[Background] Scraping complete, checking auto-fetch preference...');
                
                // Check if auto-fetch is enabled
                const prefs = await chrome.storage.sync.get(['autoFetchRecommendations', 'testMode']);
                
                if (!prefs.autoFetchRecommendations) {
                    console.log('[Background] Auto-fetch is disabled, skipping recommendation fetch');
                    return;
                }
                
                console.log('[Background] Auto-fetch is enabled, fetching recommendations...');
                
                // Determine URL based on test mode
                const isTestMode = prefs.testMode === true;
                const url = isTestMode 
                    ? 'http://localhost:3000/api/recommendations/latest?preset=true'
                    : 'http://localhost:3000/api/recommendations/latest';
                
                // Fetch recommendations from backend
                const response = await fetch(url);
                
                if (!response.ok) {
                    if (response.status === 404) {
                        console.log('[Background] No scraped content found for recommendations');
                        return;
                    }
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || `Server error: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (!data.music_recommendations || !data.music_recommendations.recommendations) {
                    console.log('[Background] No recommendations found in response');
                    return;
                }
                
                const recommendations = data.music_recommendations.recommendations;
                
                // Filter to only recommendations with spotify_id
                const spotifyRecommendations = recommendations.filter(rec => rec.spotify_id);
                
                if (spotifyRecommendations.length === 0) {
                    console.log('[Background] No Spotify tracks found in recommendations');
                    return;
                }
                
                console.log(`[Background] Found ${spotifyRecommendations.length} Spotify track(s), storing for playback`);
                
                // Store recommendations in chrome.storage for the popup player to pick up
                await chrome.storage.local.set({
                    pendingRecommendations: spotifyRecommendations,
                    recommendationsTimestamp: Date.now()
                });
                
                console.log('[Background] Recommendations stored, popup will play them automatically');
                
            } catch (error) {
                console.error('[Background] Error in auto-fetch recommendations:', error);
            }
        })();
        // Don't wait for async operation
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
