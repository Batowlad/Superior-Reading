// Popup script for Chrome extension - Minimalistic version
document.addEventListener('DOMContentLoaded', function() {
    const testBtn = document.getElementById('testBtn');
    const testModeToggle = document.getElementById('testModeToggle');
    const autoFetchToggle = document.getElementById('autoFetchToggle');
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
    let authTimeoutId = null;
    
    // Storage keys for player state
    const PLAYER_STORAGE_KEYS = {
        DEVICE_ID: 'spotify_player_device_id',
        PLAYER_READY: 'spotify_player_ready',
        PLAYER_READY_TIMESTAMP: 'spotify_player_ready_timestamp'
    };
    
    /**
     * Save player state to storage
     */
    function savePlayerState() {
        chrome.storage.local.set({
            [PLAYER_STORAGE_KEYS.DEVICE_ID]: deviceId,
            [PLAYER_STORAGE_KEYS.PLAYER_READY]: isPlayerReady,
            [PLAYER_STORAGE_KEYS.PLAYER_READY_TIMESTAMP]: isPlayerReady ? Date.now() : null
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('[Popup] Error saving player state:', chrome.runtime.lastError);
            } else {
                console.log('[Popup] Player state saved:', { deviceId, isPlayerReady });
            }
        });
    }
    
    /**
     * Restore player state from storage
     */
    async function restorePlayerState() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                PLAYER_STORAGE_KEYS.DEVICE_ID,
                PLAYER_STORAGE_KEYS.PLAYER_READY,
                PLAYER_STORAGE_KEYS.PLAYER_READY_TIMESTAMP
            ], (result) => {
                if (chrome.runtime.lastError) {
                    console.error('[Popup] Error restoring player state:', chrome.runtime.lastError);
                    resolve(false);
                    return;
                }
                
                const storedDeviceId = result[PLAYER_STORAGE_KEYS.DEVICE_ID];
                const storedReady = result[PLAYER_STORAGE_KEYS.PLAYER_READY];
                const storedTimestamp = result[PLAYER_STORAGE_KEYS.PLAYER_READY_TIMESTAMP];
                
                // Only restore if state is recent (within last hour)
                const isRecent = storedTimestamp && (Date.now() - storedTimestamp < 60 * 60 * 1000);
                
                if (storedDeviceId && storedReady && isRecent) {
                    console.log('[Popup] Restoring player state from storage:', {
                        deviceId: storedDeviceId,
                        isPlayerReady: storedReady,
                        age: storedTimestamp ? Math.round((Date.now() - storedTimestamp) / 1000) + 's' : 'unknown'
                    });
                    
                    deviceId = storedDeviceId;
                    isPlayerReady = storedReady;
                    
                    // Update UI to show player is ready
                    updatePlayerStatus('Ready', 'ready');
                    showPlayerControls();
                    playPauseBtn.disabled = false;
                    nextBtn.disabled = false;
                    prevBtn.disabled = false;
                    
                    resolve(true);
                } else {
                    console.log('[Popup] No valid stored player state found or state expired');
                    resolve(false);
                }
            });
        });
    }
    
    /**
     * Clear player state from storage and reset local variables
     */
    function clearPlayerState() {
        chrome.storage.local.remove([
            PLAYER_STORAGE_KEYS.DEVICE_ID,
            PLAYER_STORAGE_KEYS.PLAYER_READY,
            PLAYER_STORAGE_KEYS.PLAYER_READY_TIMESTAMP
        ], () => {
            if (chrome.runtime.lastError) {
                console.error('[Popup] Error clearing player state:', chrome.runtime.lastError);
            } else {
                console.log('[Popup] Player state cleared from storage');
            }
        });
        
        // Reset local state
        deviceId = null;
        isPlayerReady = false;
    }
    
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

    // Toggle test mode (preset recommendations)
    function toggleTestMode() {
        testModeToggle.classList.toggle('active');
        const isActive = testModeToggle.classList.contains('active');
        
        // Store preference
        chrome.storage.sync.set({testMode: isActive}, () => {
            if (isActive) {
                updateStatus('TEST MODE ON (Preset)', 'info');
            } else {
                updateStatus('TEST MODE OFF (AI)', 'info');
            }
        });
    }
    
    // Toggle auto-fetch recommendations
    function toggleAutoFetch() {
        autoFetchToggle.classList.toggle('active');
        const isActive = autoFetchToggle.classList.contains('active');
        
        // Store preference
        chrome.storage.sync.set({autoFetchRecommendations: isActive}, () => {
            if (isActive) {
                updateStatus('AUTO-FETCH ON', 'info');
            } else {
                updateStatus('AUTO-FETCH OFF', 'info');
            }
        });
    }
    
    // Load saved preferences
    chrome.storage.sync.get(['testMode', 'autoFetchRecommendations'], (result) => {
        if (result.testMode !== undefined) {
            if (result.testMode) {
                testModeToggle.classList.add('active');
            } else {
                testModeToggle.classList.remove('active');
            }
        }
        
        if (result.autoFetchRecommendations !== undefined) {
            if (result.autoFetchRecommendations) {
                autoFetchToggle.classList.add('active');
            } else {
                autoFetchToggle.classList.remove('active');
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
        
        // Check if test mode is enabled
        const isTestMode = testModeToggle.classList.contains('active');
        updateStatus(isTestMode ? 'FETCHING PRESET RECOMMENDATIONS...' : 'FETCHING RECOMMENDATIONS...', 'processing');
        
        try {
            const url = isTestMode 
                ? 'http://localhost:3000/api/recommendations/latest?preset=true'
                : 'http://localhost:3000/api/recommendations/latest';
            
            // Fetch recommendations from backend
            const response = await fetch(url);
            
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
    testBtn.addEventListener('click', testConnection);
    testModeToggle.addEventListener('click', toggleTestMode);
    autoFetchToggle.addEventListener('click', toggleAutoFetch);
    playRecommendationsBtn.addEventListener('click', playRecommendationsFromBackend);

    // Initial status
    updateStatus('READY', 'info');

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
            
            // First, try to restore player state from storage
            const stateRestored = await restorePlayerState();
            if (stateRestored && deviceId && isPlayerReady) {
                console.log('[Popup] Player state restored from storage, verifying with token...');
                // Still need to load token for API calls
                try {
                    await loadPlayerAccessToken();
                    // Re-initialize player to reconnect (but state is already restored)
                    await initializePlayer();
                    return; // State already restored, no need to continue
                } catch (error) {
                    console.warn('[Popup] Error loading token after state restore:', error);
                    // Continue with normal flow
                }
            }
            
            const authenticated = await window.SpotifyAuth.isAuthenticated();
            console.log('[Popup] Authentication status:', authenticated);
            
            if (authenticated) {
                try {
                    await loadPlayerAccessToken();
                    console.log('[Popup] Token loaded successfully, isAuthenticated flag set to:', isAuthenticated);
                    
                    // Only initialize if player isn't already ready
                    if (!isPlayerReady || !deviceId) {
                        updatePlayerStatus('Initializing...', 'default');
                        await initializePlayer();
                        console.log('[Popup] Player initialization started');
                    } else {
                        console.log('[Popup] Player already ready, skipping initialization');
                        updatePlayerStatus('Ready', 'ready');
                        showPlayerControls();
                    }
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
                        // Clear stored state
                        clearPlayerState();
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
                // Clear stored state
                clearPlayerState();
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
     * Handle authentication status messages from background script
     */
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'authStatus') {
            console.log('[Popup] Authentication status update:', message.status, message.message);
            
            switch (message.status) {
                case 'authenticating':
                    updatePlayerStatus(message.message || 'Connecting...', 'default');
                    break;
                    
                case 'success':
                    // Authentication successful, continue with player initialization
                    (async () => {
                        try {
                            clearTimeout(authTimeoutId);
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
                            console.error('[Popup] ===== POST-AUTHENTICATION ERROR =====');
                            console.error('[Popup] Error after authentication success:', error);
                            console.error('[Popup] Error stack:', error.stack);
                            console.error('[Popup] Error name:', error.name);
                            console.error('[Popup] Error message:', error.message);
                            console.error('[Popup] ====================================');
                            
                            const errorMsg = error.message || 'Failed to initialize player';
                            updatePlayerStatus(errorMsg.length > 40 ? errorMsg.substring(0, 40) + '...' : errorMsg, 'error');
                            authButton.disabled = false;
                        }
                    })();
                    break;
                    
                case 'error':
                    // Authentication failed
                    clearTimeout(authTimeoutId);
                    console.error('[Popup] ===== AUTHENTICATION ERROR =====');
                    console.error('[Popup] Authentication error from background:', message.message);
                    console.error('[Popup] ================================');
                    
                    const errorMsg = message.message || 'Authentication failed';
                    updatePlayerStatus(errorMsg.length > 40 ? errorMsg.substring(0, 40) + '...' : errorMsg, 'error');
                    authButton.disabled = false;
                    break;
            }
        }
    });
    
    /**
     * Handle authentication button click
     */
    authButton.addEventListener('click', async () => {
        console.log('[Popup] ===== AUTHENTICATION STARTED =====');
        console.log('[Popup] Auth button clicked at:', new Date().toISOString());
        authButton.disabled = true;
        updatePlayerStatus('Connecting...', 'default');
        
        // Add timeout to detect if authentication hangs
        authTimeoutId = setTimeout(() => {
            console.warn('[Popup] Authentication timeout - no response after 60 seconds');
            updatePlayerStatus('Authentication timeout - check console', 'error');
            authButton.disabled = false;
        }, 60000);
        
        try {
            console.log('[Popup] Sending authentication request to background script...');
            
            // Send authentication request to background script
            chrome.runtime.sendMessage(
                { action: 'authenticate' },
                (response) => {
                    // Handle immediate response (if any)
                    if (chrome.runtime.lastError) {
                        clearTimeout(authTimeoutId);
                        console.error('[Popup] Error sending authentication request:', chrome.runtime.lastError);
                        updatePlayerStatus('Failed to start authentication', 'error');
                        authButton.disabled = false;
                        return;
                    }
                    
                    // The actual authentication status will come via onMessage listener
                    // This response is just for the initial send confirmation
                    if (response && response.success === false) {
                        clearTimeout(authTimeoutId);
                        console.error('[Popup] Authentication failed:', response.error);
                        updatePlayerStatus(response.error || 'Authentication failed', 'error');
                        authButton.disabled = false;
                    } else {
                        console.log('[Popup] Authentication request sent, waiting for status updates...');
                        // Status updates will come via onMessage listener
                    }
                }
            );
        } catch (error) {
            clearTimeout(authTimeoutId);
            console.error('[Popup] ===== AUTHENTICATION ERROR =====');
            console.error('[Popup] Error sending authentication request:', error);
            console.error('[Popup] Error stack:', error.stack);
            console.error('[Popup] Error name:', error.name);
            console.error('[Popup] Error message:', error.message);
            console.error('[Popup] ================================');
            
            const errorMsg = error.message || 'Authentication failed';
            updatePlayerStatus(errorMsg.length > 40 ? errorMsg.substring(0, 40) + '...' : errorMsg, 'error');
            authButton.disabled = false;
        }
    });
    
    /**
     * Get available Spotify devices using Web API
     * This can be used as a fallback if the player ready event doesn't fire
     */
    async function getSpotifyDevices() {
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to get devices: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('[Popup] Available Spotify devices:', data.devices);
            
            // Find the device with our player name
            const ourDevice = data.devices.find(device => 
                device.name === 'Superior Reading Extension' || 
                device.name.includes('Superior Reading')
            );
            
            if (ourDevice) {
                console.log('[Popup] Found our device:', ourDevice);
                return ourDevice.id;
            }
            
            // Skip "Web Player" and find an active device that's not "Web Player"
            const activeDevice = data.devices.find(device => 
                device.is_active && device.name !== 'Web Player (Chrome)'
            );
            if (activeDevice) {
                console.log('[Popup] Using active device (excluding Web Player):', activeDevice);
                return activeDevice.id;
            }
            
            // Fallback: if we have at least 2 devices, use the second one (index 1)
            // This will use the computer instead of "Web Player" (which is typically first)
            if (data.devices && data.devices.length >= 2) {
                const secondDevice = data.devices[1];
                console.log('[Popup] Using second available device as fallback:', secondDevice);
                return secondDevice.id;
            }
            
            // Last resort: use first device if only one is available
            if (data.devices && data.devices.length > 0) {
                const firstDevice = data.devices[0];
                console.log('[Popup] Using first available device as last resort:', firstDevice);
                return firstDevice.id;
            }
            
            return null;
        } catch (error) {
            console.error('[Popup] Error getting Spotify devices:', error);
            return null;
        }
    }
    
    /**
     * Initialize Spotify player via sandbox
     */
    async function initializePlayer() {
        if (!accessToken) {
            throw new Error('No access token available');
        }

        updatePlayerStatus('Initializing...', 'default');
        console.log('[Popup] Initializing player, checking iframe...');
        
        // Ensure iframe is loaded
        return new Promise((resolve, reject) => {
            const sendInitMessage = () => {
                try {
                    if (!sandboxFrame.contentWindow) {
                        throw new Error('Sandbox iframe contentWindow not available');
                    }
                    
                    console.log('[Popup] Sending init_player message to sandbox');
                    sandboxFrame.contentWindow.postMessage({
                        type: 'init_player',
                        access_token: accessToken
                    }, '*');
                    
                    // Give it a moment to process
                    setTimeout(() => {
                        resolve();
                    }, 100);
                } catch (error) {
                    console.error('[Popup] Error sending init message:', error);
                    reject(error);
                }
            };
            
            // Check if iframe is already loaded
            if (sandboxFrame.contentWindow) {
                console.log('[Popup] Iframe already loaded');
                sendInitMessage();
            } else {
                console.log('[Popup] Waiting for iframe to load...');
                // Wait for iframe to load
                const onLoad = () => {
                    console.log('[Popup] Iframe loaded');
                    sandboxFrame.removeEventListener('load', onLoad);
                    sendInitMessage();
                };
                
                sandboxFrame.addEventListener('load', onLoad);
                
                // Timeout if iframe doesn't load
                setTimeout(() => {
                    if (!sandboxFrame.contentWindow) {
                        sandboxFrame.removeEventListener('load', onLoad);
                        reject(new Error('Sandbox iframe failed to load within 5 seconds'));
                    }
                }, 5000);
            }
        });
    }
    
    /**
     * Handle messages from sandbox iframe
     */
    window.addEventListener('message', (event) => {
        const message = event.data;
        
        // Only process messages that look like they're from our sandbox
        // (have our message types)
        if (!message || !message.type) {
            return;
        }
        
        // Check if it's one of our sandbox message types
        const isSandboxMessage = Object.values(SANDBOX_MESSAGE_TYPES).includes(message.type);
        if (!isSandboxMessage) {
            return;
        }
        
        console.log('[Popup] Message received from sandbox:', message.type, message);
        
        switch (message.type) {
            case SANDBOX_MESSAGE_TYPES.DEVICE_ID:
            case SANDBOX_MESSAGE_TYPES.PLAYER_READY:
                console.log('[Popup] Player ready message received', {
                    device_id: message.device_id,
                    hasPendingRecommendations: !!pendingRecommendations,
                    pendingCount: pendingRecommendations ? pendingRecommendations.length : 0
                });
                
                deviceId = message.device_id;
                isPlayerReady = true;
                
                // Save state to storage
                savePlayerState();
                
                updatePlayerStatus('Ready', 'ready');
                showPlayerControls();
                
                // Enable controls
                playPauseBtn.disabled = false;
                nextBtn.disabled = false;
                prevBtn.disabled = false;
                
                // If we have pending recommendations, play them
                if (pendingRecommendations) {
                    console.log('[Popup] Playing pending recommendations now that player is ready');
                    const recsToPlay = pendingRecommendations;
                    pendingRecommendations = null; // Clear before playing to avoid re-triggering
                    playRecommendations(recsToPlay);
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
                // Clear stored state
                clearPlayerState();
                break;

            default:
                console.log('Unknown message from sandbox:', message.type);
        }
    });
    
    /**
     * Play recommendations using Spotify Web API
     */
    async function playRecommendations(recommendations) {
        console.log('[Popup] playRecommendations called', {
            isPlayerReady,
            hasDeviceId: !!deviceId,
            hasAccessToken: !!accessToken,
            recommendationsCount: recommendations.length
        });
        
        // Check current state first
        if (!isPlayerReady || !deviceId || !accessToken) {
            console.log('[Popup] Player not ready, attempting to ensure it is ready...');
            
            // Try to ensure player is ready
            const playerReady = await ensurePlayerReady();
            
            // Double-check after ensurePlayerReady
            if (!playerReady || !isPlayerReady || !deviceId || !accessToken) {
                console.log('[Popup] Player still not ready after ensurePlayerReady, storing recommendations for later');
                console.log('[Popup] Player state:', {
                    isPlayerReady,
                    deviceId,
                    hasAccessToken: !!accessToken,
                    isAuthenticated,
                    playerReady
                });
                
                pendingRecommendations = recommendations;
                
                // Update status to inform user
                if (!isAuthenticated) {
                    updatePlayerStatus('Please connect to Spotify first', 'error');
                } else if (!isPlayerReady) {
                    updatePlayerStatus('Initializing player...', 'default');
                }
                
                return;
            }
        }
        
        // Player is ready, proceed with playback
        console.log('[Popup] Player is ready, proceeding with playback');

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
            console.log('[Popup] Checking for pending recommendations from storage...');
            const result = await chrome.storage.local.get(['pendingRecommendations', 'recommendationsTimestamp']);
            
            if (result.pendingRecommendations && result.recommendationsTimestamp) {
                // Only use recommendations if they're recent (within last 5 minutes)
                const age = Date.now() - result.recommendationsTimestamp;
                console.log('[Popup] Found pending recommendations, age:', age, 'ms');
                
                if (age < 5 * 60 * 1000) {
                    const recommendations = result.pendingRecommendations;
                    console.log('[Popup] Recommendations are recent, attempting to play', {
                        count: recommendations.length,
                        isAuthenticated,
                        isPlayerReady
                    });
                    
                    // Clear the stored recommendations
                    await chrome.storage.local.remove(['pendingRecommendations', 'recommendationsTimestamp']);
                    
                    // Play the recommendations
                    if (!isAuthenticated) {
                        console.log('[Popup] Not authenticated, initializing auth...');
                        await initializePlayerAuth();
                    }
                    
                    if (isAuthenticated) {
                        console.log('[Popup] Authenticated, playing recommendations');
                        playRecommendations(recommendations);
                    } else {
                        console.log('[Popup] Not authenticated after init, storing recommendations');
                        pendingRecommendations = recommendations;
                    }
                } else {
                    console.log('[Popup] Recommendations are too old, ignoring');
                }
            } else {
                console.log('[Popup] No pending recommendations found in storage');
            }
        } catch (error) {
            console.error('[Popup] Error checking pending recommendations:', error);
        }
    }
    
    /**
     * Listen for storage changes (when background script stores recommendations)
     */
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.pendingRecommendations) {
            console.log('[Popup] Pending recommendations detected in storage change');
            checkPendingRecommendations();
        }
        
        // Listen for Spotify token storage changes
        if (areaName === 'local' && (changes.spotify_access_token || changes.spotify_refresh_token)) {
            console.log('[Popup] Spotify tokens detected in storage, re-checking authentication...');
            // Re-check authentication status when tokens are stored
            initializePlayerAuth();
        }
    });
    
    /**
     * Ensure player is ready before playing recommendations
     * If not ready, initialize it and wait for it to become ready
     */
    async function ensurePlayerReady() {
        // If already ready, return immediately
        if (isPlayerReady && deviceId && accessToken) {
            console.log('[Popup] Player is already ready');
            return true;
        }
        
        console.log('[Popup] Player not ready, checking authentication...');
        
        // Check if authenticated
        if (!isAuthenticated) {
            const authenticated = await window.SpotifyAuth.isAuthenticated();
            if (authenticated) {
                try {
                    await loadPlayerAccessToken();
                    isAuthenticated = true;
                } catch (error) {
                    console.error('[Popup] Failed to load access token:', error);
                    return false;
                }
            } else {
                console.log('[Popup] Not authenticated, cannot initialize player');
                return false;
            }
        }
        
        // If authenticated but player not ready, initialize it and wait
        if (isAuthenticated && accessToken && !isPlayerReady) {
            console.log('[Popup] Initializing player and waiting for ready state...');
            try {
                await initializePlayer();
                
                // Wait for player to become ready (with timeout and fallback)
                return new Promise(async (resolve) => {
                    // Check immediately in case player is already ready
                    if (isPlayerReady && deviceId) {
                        console.log('[Popup] Player already ready after initialization');
                        resolve(true);
                        return;
                    }
                    
                    const timeout = setTimeout(async () => {
                        console.warn('[Popup] Player initialization timeout after 5 seconds');
                        console.warn('[Popup] Current state:', {
                            isPlayerReady,
                            deviceId,
                            hasAccessToken: !!accessToken
                        });
                        window.removeEventListener('message', readyHandler);
                        
                        // Try fallback: get device ID from Web API
                        console.log('[Popup] Attempting fallback: getting device ID from Web API...');
                        const fallbackDeviceId = await getSpotifyDevices();
                        if (fallbackDeviceId) {
                            console.log('[Popup] Got device ID from Web API:', fallbackDeviceId);
                            deviceId = fallbackDeviceId;
                            isPlayerReady = true;
                            
                            // Save state to storage
                            savePlayerState();
                            
                            updatePlayerStatus('Ready', 'ready');
                            showPlayerControls();
                            playPauseBtn.disabled = false;
                            nextBtn.disabled = false;
                            prevBtn.disabled = false;
                            resolve(true);
                        } else {
                            console.warn('[Popup] Fallback also failed - no device ID available');
                            resolve(false);
                        }
                    }, 20000); // 20 second timeout
                    
                    // Create a one-time listener for player ready
                    const readyHandler = (event) => {
                        const message = event.data;
                        
                        // Only process our sandbox message types
                        if (!message || !message.type) {
                            return;
                        }
                        
                        const isSandboxMessage = Object.values(SANDBOX_MESSAGE_TYPES).includes(message.type);
                        if (!isSandboxMessage) {
                            return;
                        }
                        
                        if (message.type === SANDBOX_MESSAGE_TYPES.DEVICE_ID || 
                            message.type === SANDBOX_MESSAGE_TYPES.PLAYER_READY) {
                            console.log('[Popup] Player became ready while waiting');
                            clearTimeout(timeout);
                            window.removeEventListener('message', readyHandler);
                            resolve(true);
                        } else if (message.type === SANDBOX_MESSAGE_TYPES.PLAYER_ERROR) {
                            console.error('[Popup] Player error during initialization:', message.error);
                            clearTimeout(timeout);
                            window.removeEventListener('message', readyHandler);
                            resolve(false);
                        }
                    };
                    
                    window.addEventListener('message', readyHandler);
                    
                    // Also periodically check if player became ready (in case message was missed)
                    const checkInterval = setInterval(() => {
                        if (isPlayerReady && deviceId) {
                            console.log('[Popup] Player ready detected via polling');
                            clearTimeout(timeout);
                            clearInterval(checkInterval);
                            window.removeEventListener('message', readyHandler);
                            resolve(true);
                        }
                    }, 100); // Check every 100ms
                    
                    // Clear interval when timeout fires
                    setTimeout(() => {
                        clearInterval(checkInterval);
                    }, 5000);
                });
            } catch (error) {
                console.error('[Popup] Failed to initialize player:', error);
                return false;
            }
        }
        
        return isPlayerReady && deviceId && accessToken;
    }
    
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
    
    /**
     * Diagnostic function to check player state
     */
    function diagnosePlayerState() {
        console.log('[Popup] === Player State Diagnostics ===');
        console.log('[Popup] isAuthenticated:', isAuthenticated);
        console.log('[Popup] isPlayerReady:', isPlayerReady);
        console.log('[Popup] deviceId:', deviceId);
        console.log('[Popup] hasAccessToken:', !!accessToken);
        console.log('[Popup] sandboxFrame exists:', !!sandboxFrame);
        console.log('[Popup] sandboxFrame.contentWindow:', !!sandboxFrame?.contentWindow);
        console.log('[Popup] sandboxFrame.src:', sandboxFrame?.src);
        
        // Check storage for tokens
        chrome.storage.local.get(['spotify_access_token', 'spotify_refresh_token'], (result) => {
            console.log('[Popup] Storage - has access token:', !!result.spotify_access_token);
            console.log('[Popup] Storage - has refresh token:', !!result.spotify_refresh_token);
        });
        
        console.log('[Popup] =================================');
    }
    
    // Make diagnosePlayerState available globally for debugging
    window.diagnosePlayerState = diagnosePlayerState;
    
    // Initialize player on popup open
    initializePlayerAuth();
    checkPendingRecommendations();
});
