// Popup script for Chrome extension - Minimalistic version
document.addEventListener('DOMContentLoaded', function() {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const testBtn = document.getElementById('testBtn');
    const autoToggle = document.getElementById('autoToggle');
    const status = document.getElementById('status');
    const serverStatus = document.getElementById('serverStatus');
    
    // Player elements
    const playerSection = document.getElementById('playerSection');
    const playerStatus = document.getElementById('playerStatus');
    const playerContent = document.getElementById('playerContent');
    const playerControls = document.getElementById('playerControls');
    const authButton = document.getElementById('authButton');
    const trackName = document.getElementById('trackName');
    const trackArtist = document.getElementById('trackArtist');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const sandboxFrame = document.getElementById('sandboxFrame');
    
    // Player state
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

    // Neo-brutalist status update
    function updateStatus(message, type = 'info') {
        status.textContent = message;
        
        // Bold color coding for neo-brutalist style
        if (type === 'success') {
            status.style.background = '#7bf1a8';
            status.style.color = '#000000';
        } else if (type === 'error') {
            status.style.background = '#ff006e';
            status.style.color = '#ffffff';
        } else if (type === 'processing') {
            status.style.background = '#00f0ff';
            status.style.color = '#000000';
        } else {
            status.style.background = '#ffd60a';
            status.style.color = '#000000';
        }
    }

    // Test server connection
    async function testConnection() {
        testBtn.disabled = true;
        updateStatus('TESTING CONNECTION...', 'processing');
        
        try {
            const response = await fetch('http://localhost:3000/api/health');
            if (response.ok) {
                serverStatus.textContent = 'Online';
                serverStatus.className = 'status-indicator connected';
                updateStatus('SERVER ONLINE!', 'success');
            } else {
                throw new Error('Server not responding');
            }
        } catch (error) {
            serverStatus.textContent = 'Offline';
            serverStatus.className = 'status-indicator disconnected';
            updateStatus('SERVER OFFLINE', 'error');
        } finally {
            testBtn.disabled = false;
        }
    }

    // Manual scrape function
    async function manualScrape() {
        updateStatus('SCRAPING PAGE...', 'processing');
        scrapeBtn.disabled = true;
        scrapeBtn.textContent = 'PROCESSING...';
        
        try {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (!tabs[0]) {
                updateStatus('NO ACTIVE TAB', 'error');
                scrapeBtn.disabled = false;
                scrapeBtn.textContent = 'Scrape Current Page';
                return;
            }

            // Wrap chrome.tabs.sendMessage in a Promise to properly await it
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tabs[0].id, {action: 'scrape'}, (response) => {
                    // Check for Chrome runtime errors
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(response);
                });
            });

            // Handle response from content script
            if (response && response.success) {
                updateStatus('SCRAPING COMPLETE!', 'success');
            } else {
                const errorMsg = response?.error || 'Unknown error';
                console.error('Scraping failed:', errorMsg);
                updateStatus('SCRAPING FAILED', 'error');
            }
        } catch (error) {
            console.error('Error during scraping:', error);
            updateStatus('SCRAPING FAILED', 'error');
        } finally {
            // Always reset button state, regardless of success or failure
            scrapeBtn.disabled = false;
            scrapeBtn.textContent = 'Scrape Current Page';
        }
    }

    // Toggle auto-scrape
    function toggleAutoScrape() {
        autoToggle.classList.toggle('active');
        const isActive = autoToggle.classList.contains('active');
        
        // Store preference
        chrome.storage.sync.set({autoScrape: isActive}, () => {
            if (isActive) {
                updateStatus('AUTO-SCRAPE ON', 'success');
            } else {
                updateStatus('AUTO-SCRAPE OFF', 'info');
            }
        });
    }

    // Load saved preferences
    chrome.storage.sync.get(['autoScrape'], (result) => {
        if (result.autoScrape !== undefined) {
            if (result.autoScrape) {
                autoToggle.classList.add('active');
            } else {
                autoToggle.classList.remove('active');
            }
        }
    });

    // Play Recommendations button
    const playRecommendationsBtn = document.getElementById('playRecommendationsBtn');
    
    /**
     * Fetch recommendations and start playback
     */
    async function playRecommendationsFromBackend() {
        playRecommendationsBtn.disabled = true;
        playRecommendationsBtn.textContent = 'LOADING...';
        updateStatus('FETCHING RECOMMENDATIONS...', 'processing');
        
        try {
            // Fetch recommendations from backend
            const response = await fetch('http://localhost:3000/api/recommendations/latest');
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('No scraped content found. Please scrape a page first.');
                }
                const errorData = await response.json();
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.music_recommendations || !data.music_recommendations.recommendations) {
                throw new Error('No recommendations found in response');
            }
            
            const recommendations = data.music_recommendations.recommendations;
            
            // Filter to only recommendations with spotify_id
            const spotifyRecommendations = recommendations.filter(rec => rec.spotify_id);
            
            if (spotifyRecommendations.length === 0) {
                updateStatus('NO SPOTIFY TRACKS FOUND', 'error');
                playRecommendationsBtn.disabled = false;
                playRecommendationsBtn.textContent = 'Play Recommendations';
                return;
            }
            
            updateStatus(`FOUND ${spotifyRecommendations.length} TRACK(S)`, 'success');
            
            // Send to background script to start playback
            chrome.runtime.sendMessage({
                action: 'startPlayback',
                recommendations: spotifyRecommendations
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending playback request:', chrome.runtime.lastError);
                    updateStatus('PLAYBACK REQUEST FAILED', 'error');
                    playRecommendationsBtn.disabled = false;
                    playRecommendationsBtn.textContent = 'Play Recommendations';
                } else if (response && response.success) {
                    updateStatus('PLAYBACK STARTED!', 'success');
                    // Reset button after a delay
                    setTimeout(() => {
                        playRecommendationsBtn.disabled = false;
                        playRecommendationsBtn.textContent = 'Play Recommendations';
                    }, 2000);
                } else {
                    updateStatus('PLAYBACK FAILED', 'error');
                    playRecommendationsBtn.disabled = false;
                    playRecommendationsBtn.textContent = 'Play Recommendations';
                }
            });
            
        } catch (error) {
            console.error('Error fetching recommendations:', error);
            updateStatus(`ERROR: ${error.message}`, 'error');
            playRecommendationsBtn.disabled = false;
            playRecommendationsBtn.textContent = 'Play Recommendations';
        }
    }
    
    // Event listeners
    scrapeBtn.addEventListener('click', manualScrape);
    testBtn.addEventListener('click', testConnection);
    autoToggle.addEventListener('click', toggleAutoScrape);
    playRecommendationsBtn.addEventListener('click', playRecommendationsFromBackend);

    // Initial status
    updateStatus('READY TO SCRAPE', 'info');

    // Test connection on popup open
    testConnection();
    
    // ========== SPOTIFY PLAYER FUNCTIONALITY ==========
    
    /**
     * Update player status
     */
    function updatePlayerStatus(message, type = 'default') {
        // For error messages, show first line in status, full message in console
        if (type === 'error' && message.includes('\n')) {
            const firstLine = message.split('\n')[0];
            playerStatus.textContent = firstLine;
            playerStatus.className = `player-status ${type}`;
            console.error('[Player] Full error:', message);
            
            // If it's a redirect URI error, log the redirect URI for easy copying
            if (message.includes('redirect URI') || message.includes('Redirect URI')) {
                try {
                    const uri = window.SpotifyAuth.getRedirectUri();
                    console.log('[Player] Your redirect URI:', uri);
                    console.log('[Player] Copy this URI and add it to your Spotify app settings at:');
                    console.log('[Player] https://developer.spotify.com/dashboard → Your App → Edit Settings → Redirect URIs');
                } catch (err) {
                    console.error('[Player] Could not get redirect URI:', err);
                }
            }
        } else {
            playerStatus.textContent = message.length > 30 ? message.substring(0, 30) + '...' : message;
            playerStatus.className = `player-status ${type}`;
        }
    }
    
    /**
     * Show authentication UI
     */
    function showAuthUI() {
        playerContent.classList.remove('hidden');
        playerControls.classList.add('hidden');
    }
    
    /**
     * Show player controls
     */
    function showPlayerControls() {
        playerContent.classList.add('hidden');
        playerControls.classList.remove('hidden');
    }
    
    /**
     * Initialize authentication check
     */
    async function initializePlayerAuth() {
        try {
            console.log('[Popup] Checking authentication status...');
            const authenticated = await window.SpotifyAuth.isAuthenticated();
            console.log('[Popup] Authentication status:', authenticated);
            
            if (authenticated) {
                try {
                    await loadPlayerAccessToken();
                    console.log('[Popup] Token loaded successfully, isAuthenticated flag set to:', isAuthenticated);
                    updatePlayerStatus('Initializing...', 'default');
                    await initializePlayer();
                    console.log('[Popup] Player initialization started');
                    // Status will be updated when sandbox sends PLAYER_READY message
                    // Don't show auth UI since we're authenticated
                } catch (error) {
                    console.error('[Popup] Error loading token or initializing player:', error);
                    console.error('[Popup] Error details:', {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    });
                    // If token refresh failed, show helpful message
                    const errorMsg = error.message || 'Authentication failed';
                    if (errorMsg.includes('re-authenticate') || errorMsg.includes('expired')) {
                        updatePlayerStatus('Please re-authenticate', 'error');
                        showAuthUI();
                        isAuthenticated = false;
                    } else {
                        // For other errors, still show as connected but with error status
                        updatePlayerStatus('Connected (error initializing)', 'error');
                    }
                }
            } else {
                console.log('[Popup] Not authenticated, showing auth UI');
                updatePlayerStatus('Not Connected', 'error');
                showAuthUI();
                isAuthenticated = false;
            }
        } catch (error) {
            console.error('[Popup] Error checking authentication:', error);
            console.error('[Popup] Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            updatePlayerStatus('Error checking auth', 'error');
            showAuthUI();
            isAuthenticated = false;
        }
    }
    
    /**
     * Load access token from storage
     */
    async function loadPlayerAccessToken() {
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
        console.log('[Popup] ===== AUTHENTICATION STARTED =====');
        console.log('[Popup] Auth button clicked at:', new Date().toISOString());
        authButton.disabled = true;
        updatePlayerStatus('Connecting...', 'default');
        
        // Add timeout to detect if authentication hangs
        const timeoutId = setTimeout(() => {
            console.warn('[Popup] Authentication timeout - no response after 60 seconds');
            updatePlayerStatus('Authentication timeout - check console', 'error');
            authButton.disabled = false;
        }, 60000);
        
        try {
            console.log('[Popup] Starting authentication...');
            console.log('[Popup] SpotifyAuth object:', window.SpotifyAuth);
            console.log('[Popup] authenticate function:', typeof window.SpotifyAuth?.authenticate);
            
            if (!window.SpotifyAuth || typeof window.SpotifyAuth.authenticate !== 'function') {
                throw new Error('SpotifyAuth not available. Please reload the extension.');
            }
            
            const authPromise = window.SpotifyAuth.authenticate();
            console.log('[Popup] Authentication promise created, waiting...');
            
            await authPromise;
            clearTimeout(timeoutId);
            console.log('[Popup] Authentication successful, loading token...');
            
            // Verify authentication status after token storage
            const authCheck = await window.SpotifyAuth.isAuthenticated();
            console.log('[Popup] Authentication verification:', authCheck);
            if (!authCheck) {
                throw new Error('Authentication verification failed - tokens may not have been stored correctly');
            }
            
            await loadPlayerAccessToken();
            console.log('[Popup] Token loaded, initializing player...');
            
            // Update UI immediately after successful authentication
            updatePlayerStatus('Initializing player...', 'default');
            
            await initializePlayer();
            console.log('[Popup] Player initialized successfully');
            updatePlayerStatus('Connected', 'ready');
            
            // Note: Player controls will be shown when sandbox sends PLAYER_READY message
            // But we can hide the auth button since authentication is complete
            authButton.disabled = false;
            console.log('[Popup] ===== AUTHENTICATION COMPLETE =====');
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('[Popup] ===== AUTHENTICATION ERROR =====');
            console.error('[Popup] Authentication error caught:', error);
            console.error('[Popup] Error stack:', error.stack);
            console.error('[Popup] Error name:', error.name);
            console.error('[Popup] Error message:', error.message);
            console.error('[Popup] Error toString:', error.toString());
            console.error('[Popup] ================================');
            
            const errorMsg = error.message || 'Authentication failed';
            updatePlayerStatus(errorMsg.length > 40 ? errorMsg.substring(0, 40) + '...' : errorMsg, 'error');
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

        updatePlayerStatus('Initializing...', 'default');
        
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
        const message = event.data;
        
        if (!message || !message.type) {
            return;
        }

        switch (message.type) {
            case SANDBOX_MESSAGE_TYPES.DEVICE_ID:
            case SANDBOX_MESSAGE_TYPES.PLAYER_READY:
                deviceId = message.device_id;
                isPlayerReady = true;
                updatePlayerStatus('Ready', 'ready');
                showPlayerControls();
                
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
                // Display the actual error message to help user troubleshoot
                const errorMsg = message.error || 'Unknown error occurred';
                updatePlayerStatus(errorMsg.length > 50 ? errorMsg.substring(0, 50) + '...' : errorMsg, 'error');
                // Show auth UI if it's an authentication/account error
                if (errorMsg.includes('Authentication') || errorMsg.includes('Premium') || errorMsg.includes('Account')) {
                    showAuthUI();
                    isAuthenticated = false;
                }
                break;

            case SANDBOX_MESSAGE_TYPES.PLAYER_STATE:
                if (message.state) {
                    isPlaying = !message.state.paused;
                    currentTrack = message.state.track;
                    
                    // Update UI
                    playPauseBtn.textContent = isPlaying ? '⏸' : '▶';
                    
                    if (currentTrack) {
                        trackName.textContent = currentTrack.name || 'Unknown Track';
                        trackArtist.textContent = currentTrack.artist || '';
                    } else {
                        trackName.textContent = 'No track playing';
                        trackArtist.textContent = '';
                    }
                }
                break;

            case SANDBOX_MESSAGE_TYPES.NOT_AUTHENTICATED:
                updatePlayerStatus('Not Connected', 'error');
                showAuthUI();
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
            updatePlayerStatus('No tracks', 'error');
            return;
        }

        updatePlayerStatus('Playing...', 'default');

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
                updatePlayerStatus('Playing', 'ready');
            } else if (response.status === 404) {
                updatePlayerStatus('Device not found', 'error');
            } else {
                const errorText = await response.text();
                throw new Error(`Playback failed: ${response.status} - ${errorText}`);
            }
        } catch (error) {
            console.error('Error starting playback:', error);
            updatePlayerStatus('Playback error', 'error');
        }
    }
    
    /**
     * Control playback
     */
    async function controlPlayback(action) {
        if (!accessToken || !deviceId) {
            updatePlayerStatus('Not ready', 'error');
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
            updatePlayerStatus('Control error', 'error');
        }
    }

    // Initialize control buttons as disabled
    playPauseBtn.disabled = true;
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    
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
                        await initializePlayerAuth();
                    }
                    
                    if (isAuthenticated) {
                        playRecommendations(recommendations);
                    } else {
                        pendingRecommendations = recommendations;
                    }
                }
            }
        } catch (error) {
            console.error('Error checking pending recommendations:', error);
        }
    }
    
    /**
     * Listen for storage changes (when background script stores recommendations)
     */
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.pendingRecommendations) {
            checkPendingRecommendations();
        }
        
        // Listen for Spotify token storage changes
        if (areaName === 'local' && (changes.spotify_access_token || changes.spotify_refresh_token)) {
            console.log('[Popup] Spotify tokens detected in storage, re-checking authentication...');
            // Re-check authentication status when tokens are stored
            initializePlayerAuth();
        }
    });
    
    // Diagnostic function to check setup
    function checkSetup() {
        console.log('[Popup] === Setup Diagnostics ===');
        console.log('[Popup] SpotifyAuth available:', typeof window.SpotifyAuth !== 'undefined');
        console.log('[Popup] SpotifyAuth.authenticate:', typeof window.SpotifyAuth?.authenticate);
        console.log('[Popup] SpotifyAuth.getRedirectUri:', typeof window.SpotifyAuth?.getRedirectUri);
        console.log('[Popup] SPOTIFY_CONFIG:', window.SpotifyAuth?.SPOTIFY_CONFIG);
        
        if (window.SpotifyAuth?.getRedirectUri) {
            try {
                const redirectUri = window.SpotifyAuth.getRedirectUri();
                console.log('[Popup] Redirect URI:', redirectUri);
            } catch (e) {
                console.error('[Popup] Error getting redirect URI:', e);
            }
        }
        console.log('[Popup] ========================');
    }
    
    // Check setup when popup loads
    setTimeout(() => {
        checkSetup();
    }, 100);
    
    // Initialize player on popup open
    initializePlayerAuth();
    checkPendingRecommendations();
});
