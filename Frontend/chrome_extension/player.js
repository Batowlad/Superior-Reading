// Player page script for Spotify playback
// This page coordinates OAuth, receives recommendations, and calls Spotify Web API

// UI elements
const statusEl = document.getElementById('status');
const authSection = document.getElementById('authSection');
const playerSection = document.getElementById('playerSection');
const authButton = document.getElementById('authButton');
const deviceInfo = document.getElementById('deviceInfo');
const trackInfo = document.getElementById('trackInfo');
const playPauseBtn = document.getElementById('playPauseBtn');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const sandboxFrame = document.getElementById('sandboxFrame');

// State
let accessToken = null;
let deviceId = null;
let isAuthenticated = false;
let isPlayerReady = false;
let currentTrack = null;
let isPlaying = false;
let pendingRecommendations = null;

// Message types from sandbox
const SANDBOX_MESSAGE_TYPES = {
    DEVICE_ID: 'device_id',
    PLAYER_READY: 'player_ready',
    PLAYER_ERROR: 'player_error',
    PLAYER_STATE: 'player_state',
    NOT_AUTHENTICATED: 'not_authenticated'
};

/**
 * Update status message
 */
function updateStatus(message, type = 'loading') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
}

/**
 * Show authentication section
 */
function showAuthSection() {
    authSection.classList.remove('hidden');
    playerSection.classList.add('hidden');
}

/**
 * Show player section
 */
function showPlayerSection() {
    authSection.classList.add('hidden');
    playerSection.classList.remove('hidden');
}

/**
 * Initialize authentication check
 */
async function initializeAuth() {
    try {
        const authenticated = await window.SpotifyAuth.isAuthenticated();
        
        if (authenticated) {
            await loadAccessToken();
            await initializePlayer();
        } else {
            updateStatus('Please connect to Spotify to start playback', 'authenticating');
            showAuthSection();
        }
    } catch (error) {
        console.error('Error checking authentication:', error);
        updateStatus('Error checking authentication', 'error');
        showAuthSection();
    }
}

/**
 * Load access token from storage
 */
async function loadAccessToken() {
    try {
        accessToken = await window.SpotifyAuth.getAccessToken();
        isAuthenticated = true;
        return accessToken;
    } catch (error) {
        console.error('Error loading access token:', error);
        throw error;
    }
}

/**
 * Handle authentication button click
 */
authButton.addEventListener('click', async () => {
    authButton.disabled = true;
    updateStatus('Authenticating with Spotify...', 'authenticating');
    
    try {
        await window.SpotifyAuth.authenticate();
        await loadAccessToken();
        await initializePlayer();
        updateStatus('Connected to Spotify!', 'ready');
    } catch (error) {
        console.error('Authentication error:', error);
        updateStatus(`Authentication failed: ${error.message}`, 'error');
        authButton.disabled = false;
    }
});

/**
 * Initialize Spotify player via sandbox
 */
async function initializePlayer() {
    if (!accessToken) {
        throw new Error('No access token available');
    }

    updateStatus('Initializing player...', 'loading');
    showPlayerSection();
    
    // Send access token to sandbox to initialize player
    if (sandboxFrame.contentWindow) {
        sandboxFrame.contentWindow.postMessage({
            type: 'init_player',
            access_token: accessToken
        }, '*');
    } else {
        // Wait for iframe to load
        sandboxFrame.onload = () => {
            sandboxFrame.contentWindow.postMessage({
                type: 'init_player',
                access_token: accessToken
            }, '*');
        };
    }
}

/**
 * Handle messages from sandbox iframe
 */
window.addEventListener('message', (event) => {
    // Accept messages from sandbox (same origin in extension context)
    const message = event.data;
    
    if (!message || !message.type) {
        return;
    }

    switch (message.type) {
        case SANDBOX_MESSAGE_TYPES.DEVICE_ID:
        case SANDBOX_MESSAGE_TYPES.PLAYER_READY:
            deviceId = message.device_id;
            isPlayerReady = true;
            deviceInfo.textContent = `Device: ${deviceId}`;
            updateStatus('Player ready!', 'ready');
            
            // Enable controls
            playPauseBtn.disabled = false;
            nextBtn.disabled = false;
            prevBtn.disabled = false;
            
            // If we have pending recommendations, play them
            if (pendingRecommendations) {
                playRecommendations(pendingRecommendations);
                pendingRecommendations = null;
            }
            break;

        case SANDBOX_MESSAGE_TYPES.PLAYER_ERROR:
            console.error('Player error:', message.error);
            updateStatus(`Error: ${message.error}`, 'error');
            break;

        case SANDBOX_MESSAGE_TYPES.PLAYER_STATE:
            if (message.state) {
                isPlaying = !message.state.paused;
                currentTrack = message.state.track;
                
                // Update UI
                playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
                
                if (currentTrack) {
                    trackInfo.innerHTML = `
                        <h3>${currentTrack.name}</h3>
                        <p>${currentTrack.artist}</p>
                        ${currentTrack.album ? `<p style="font-size: 12px; opacity: 0.7;">${currentTrack.album}</p>` : ''}
                    `;
                } else {
                    trackInfo.innerHTML = `<p>No track playing</p>`;
                }
            }
            break;

        case SANDBOX_MESSAGE_TYPES.NOT_AUTHENTICATED:
            updateStatus('Authentication required', 'error');
            showAuthSection();
            isAuthenticated = false;
            break;

        default:
            console.log('Unknown message from sandbox:', message.type);
    }
});

/**
 * Play recommendations using Spotify Web API
 */
async function playRecommendations(recommendations) {
    if (!isPlayerReady || !deviceId || !accessToken) {
        console.log('Player not ready, storing recommendations for later');
        pendingRecommendations = recommendations;
        return;
    }

    // Extract Spotify track IDs from recommendations
    const trackUris = recommendations
        .filter(rec => rec.spotify_id)
        .map(rec => `spotify:track:${rec.spotify_id}`);

    if (trackUris.length === 0) {
        updateStatus('No valid Spotify tracks found in recommendations', 'error');
        return;
    }

    updateStatus(`Playing ${trackUris.length} track(s)...`, 'loading');

    try {
        const response = await fetch(
            `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uris: trackUris
                })
            }
        );

        if (response.status === 204) {
            updateStatus('Playing!', 'ready');
        } else if (response.status === 404) {
            // No active device, but we should have one
            updateStatus('Device not found. Please try again.', 'error');
        } else {
            const errorText = await response.text();
            throw new Error(`Playback failed: ${response.status} - ${errorText}`);
        }
    } catch (error) {
        console.error('Error starting playback:', error);
        updateStatus(`Playback error: ${error.message}`, 'error');
    }
}

/**
 * Control playback
 */
async function controlPlayback(action) {
    if (!accessToken || !deviceId) {
        updateStatus('Player not ready', 'error');
        return;
    }

    try {
        const endpoint = `https://api.spotify.com/v1/me/player/${action}?device_id=${deviceId}`;
        const response = await fetch(endpoint, {
            method: action === 'play' || action === 'pause' ? 'PUT' : 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status !== 204 && response.status !== 200) {
            const errorText = await response.text();
            throw new Error(`Control failed: ${response.status} - ${errorText}`);
        }
    } catch (error) {
        console.error(`Error ${action}:`, error);
        updateStatus(`Error: ${error.message}`, 'error');
    }
}

// Control button handlers
playPauseBtn.addEventListener('click', () => {
    if (isPlaying) {
        controlPlayback('pause');
    } else {
        controlPlayback('play');
    }
});

nextBtn.addEventListener('click', () => {
    controlPlayback('next');
});

prevBtn.addEventListener('click', () => {
    controlPlayback('previous');
});

/**
 * Check for pending recommendations from storage
 */
async function checkPendingRecommendations() {
    try {
        const result = await chrome.storage.local.get(['pendingRecommendations', 'recommendationsTimestamp']);
        
        if (result.pendingRecommendations && result.recommendationsTimestamp) {
            // Only use recommendations if they're recent (within last 5 minutes)
            const age = Date.now() - result.recommendationsTimestamp;
            if (age < 5 * 60 * 1000) {
                const recommendations = result.pendingRecommendations;
                
                // Clear the stored recommendations
                await chrome.storage.local.remove(['pendingRecommendations', 'recommendationsTimestamp']);
                
                // Play the recommendations
                if (!isAuthenticated) {
                    // Try to authenticate first
                    await initializeAuth();
                }
                
                if (isAuthenticated) {
                    playRecommendations(recommendations);
                } else {
                    // Store for later
                    pendingRecommendations = recommendations;
                }
            }
        }
    } catch (error) {
        console.error('Error checking pending recommendations:', error);
    }
}

/**
 * Handle messages from background script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'playRecommendations') {
        const recommendations = request.recommendations;
        
        if (!isAuthenticated) {
            // Try to authenticate first
            initializeAuth().then(() => {
                if (isAuthenticated) {
                    playRecommendations(recommendations);
                }
            });
        } else {
            playRecommendations(recommendations);
        }
        
        sendResponse({ success: true });
        return true; // Keep channel open for async response
    }
    
    return false;
});

/**
 * Listen for storage changes (when background script stores recommendations)
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.pendingRecommendations) {
        checkPendingRecommendations();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();
    // Check for pending recommendations
    checkPendingRecommendations();
});
