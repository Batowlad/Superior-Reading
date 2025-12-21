// Spotify Web Playback SDK Sandbox
// This script runs in a sandboxed page to load and initialize the Spotify Web Playback SDK
// It communicates with the parent page via postMessage

let spotifyPlayer = null;
let deviceId = null;
let accessToken = null;
let errorSent = false; // Track if we've already sent an error to avoid duplicates

// Message types for communication with parent
const MESSAGE_TYPES = {
    INIT_PLAYER: 'init_player',
    PLAYER_READY: 'player_ready',
    PLAYER_ERROR: 'player_error',
    DEVICE_ID: 'device_id',
    PLAYER_STATE: 'player_state',
    NOT_AUTHENTICATED: 'not_authenticated'
};

/**
 * Send a message to the parent page
 * @param {string} type - Message type
 * @param {Object} data - Message data
 */
function sendToParent(type, data = {}) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type,
            ...data
        }, '*');
    } else {
        console.log('[Sandbox] Message to parent:', type, data);
    }
}

/**
 * Load the Spotify Web Playback SDK script
 * @returns {Promise<void>}
 */
function loadSpotifySDK() {
    return new Promise((resolve, reject) => {
        // Check if SDK is already loaded
        if (window.Spotify) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        
        script.onload = () => {
            console.log('[Sandbox] Spotify SDK loaded');
            resolve();
        };
        
        script.onerror = (error) => {
            console.error('[Sandbox] Failed to load Spotify SDK:', error);
            sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                error: 'Failed to load Spotify Web Playback SDK'
            });
            reject(new Error('Failed to load Spotify SDK'));
        };
        
        document.head.appendChild(script);
    });
}

/**
 * Initialize the Spotify Player
 * @param {string} token - Spotify access token
 */
async function initializePlayer(token) {
    console.log('[Sandbox] ===== INITIALIZE PLAYER CALLED =====');
    console.log('[Sandbox] Token provided:', !!token, 'Length:', token ? token.length : 0);
    
    if (!window.Spotify) {
        console.log('[Sandbox] Spotify SDK not loaded, loading now...');
        try {
            await loadSpotifySDK();
            console.log('[Sandbox] SDK loaded successfully');
        } catch (error) {
            console.error('[Sandbox] Failed to load SDK:', error);
            sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                error: 'Failed to load SDK: ' + error.message
            });
            return;
        }
    } else {
        console.log('[Sandbox] Spotify SDK already loaded');
    }

    if (!window.Spotify || !window.Spotify.Player) {
        console.error('[Sandbox] Spotify.Player not available after SDK load');
        sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
            error: 'Spotify.Player is not available'
        });
        return;
    }

    console.log('[Sandbox] Spotify.Player is available');
    accessToken = token;

    try {
        // Clean up existing player if any
        if (spotifyPlayer) {
            console.log('[Sandbox] Disconnecting existing player...');
            try {
                await spotifyPlayer.disconnect();
            } catch (e) {
                console.warn('[Sandbox] Error disconnecting old player:', e);
            }
            spotifyPlayer = null;
        }
        
        // Create a new Spotify Player instance
        console.log('[Sandbox] Creating new Spotify Player instance...');
        spotifyPlayer = new window.Spotify.Player({
            name: 'Superior Reading Extension',
            getOAuthToken: (callback) => {
                console.log('[Sandbox] getOAuthToken called, providing token');
                // Provide the access token to the SDK
                callback(accessToken);
            },
            volume: 0.5
        });
        console.log('[Sandbox] Player instance created');

        // Set up event handlers BEFORE connecting
        console.log('[Sandbox] Setting up event handlers...');
        setupPlayerHandlers();
        console.log('[Sandbox] Event handlers set up');

        // Reset error flag for new connection attempt
        errorSent = false;
        
        // Connect to Spotify and wait for ready event or error
        console.log('[Sandbox] Attempting to connect player...');
        const connected = await spotifyPlayer.connect();
        console.log('[Sandbox] Connect() returned:', connected);
        
        if (!connected) {
            // Connection failed immediately - this usually means:
            // 1. Invalid token
            // 2. Missing Premium subscription
            // 3. Network issue
            console.warn('[Sandbox] Connection failed immediately, waiting for error events...');
            // We'll wait a bit for error events to fire, then send generic error if none received
            setTimeout(() => {
                // If no error event was received, send generic error
                if (!errorSent) {
                    errorSent = true;
                    console.error('[Sandbox] No error event received after 2 seconds, sending generic error');
                    sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                        error: 'Failed to connect to Spotify. Please check:\n1. Your Spotify Premium subscription\n2. Your internet connection\n3. Try re-authenticating'
                    });
                }
            }, 2000);
            return;
        }

        // Connection initiated successfully - wait for ready event
        // The ready event will be handled by setupPlayerHandlers()
        console.log('[Sandbox] Spotify Player connection initiated successfully, waiting for ready event...');
        console.log('[Sandbox] Event listeners should be set up, ready event should fire soon...');
        
        // Add a timeout to check if ready event fires
        // Note: Device ID is only available from the 'ready' event, not from getCurrentState()
        setTimeout(() => {
            if (!deviceId) {
                console.warn('[Sandbox] Player still not ready after 5 seconds');
                console.warn('[Sandbox] Current state:', {
                    hasPlayer: !!spotifyPlayer,
                    hasDeviceId: !!deviceId,
                    hasAccessToken: !!accessToken,
                    errorSent: errorSent
                });
                
                // Try to get current state to see if player is connected
                if (spotifyPlayer) {
                    spotifyPlayer.getCurrentState().then(state => {
                        console.log('[Sandbox] Current player state:', state);
                        if (state) {
                            console.log('[Sandbox] Player has state but no device_id - ready event may not have fired');
                            console.warn('[Sandbox] This could indicate:');
                            console.warn('[Sandbox] 1. Premium subscription issue');
                            console.warn('[Sandbox] 2. Token expiration');
                            console.warn('[Sandbox] 3. Network connectivity issue');
                        } else {
                            console.warn('[Sandbox] Player state is null - player may not be connected');
                        }
                    }).catch(err => {
                        console.error('[Sandbox] Error getting player state:', err);
                    });
                }
            }
        }, 5000);
    } catch (error) {
        console.error('[Sandbox] Error initializing player:', error);
        console.error('[Sandbox] Error stack:', error.stack);
        sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
            error: 'Failed to initialize player: ' + error.message
        });
    }
}

/**
 * Set up event handlers for the Spotify Player
 */
function setupPlayerHandlers() {
    if (!spotifyPlayer) {
        console.error('[Sandbox] setupPlayerHandlers called but spotifyPlayer is null');
        return;
    }

    console.log('[Sandbox] Setting up event handlers for player...');

    // Ready event - player is ready and device_id is available
    spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('[Sandbox] ===== PLAYER READY EVENT FIRED =====');
        console.log('[Sandbox] Device ID received:', device_id);
        deviceId = device_id;
        
        // Send both messages to ensure parent receives it
        console.log('[Sandbox] Sending DEVICE_ID message to parent...');
        sendToParent(MESSAGE_TYPES.DEVICE_ID, {
            device_id: device_id
        });
        console.log('[Sandbox] Sending PLAYER_READY message to parent...');
        sendToParent(MESSAGE_TYPES.PLAYER_READY, {
            device_id: device_id
        });
        
        console.log('[Sandbox] Ready messages sent to parent');
    });
    
    console.log('[Sandbox] Ready listener added');

    // Not authenticated event
    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.warn('[Sandbox] ===== PLAYER NOT READY EVENT =====');
        console.warn('[Sandbox] Device ID:', device_id);
        console.warn('[Sandbox] This usually means the player failed to initialize');
        sendToParent(MESSAGE_TYPES.NOT_AUTHENTICATED, {
            device_id: device_id
        });
    });
    
    console.log('[Sandbox] Not ready listener added');

    // Authentication error
    spotifyPlayer.addListener('authentication_error', ({ message }) => {
        console.error('[Sandbox] ===== AUTHENTICATION ERROR EVENT =====');
        console.error('[Sandbox] Error message:', message);
        if (!errorSent) {
            errorSent = true;
            sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                error: 'Authentication failed. Please try re-authenticating. Error: ' + message
            });
        }
    });
    
    console.log('[Sandbox] Authentication error listener added');

    // Account error (e.g., Premium required)
    spotifyPlayer.addListener('account_error', ({ message }) => {
        console.error('[Sandbox] ===== ACCOUNT ERROR EVENT =====');
        console.error('[Sandbox] Error message:', message);
        console.error('[Sandbox] This usually means Premium subscription is required');
        if (!errorSent) {
            errorSent = true;
            sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                error: 'Spotify Premium required. The Web Playback SDK requires a Premium subscription. Error: ' + message
            });
        }
    });
    
    console.log('[Sandbox] Account error listener added');

    // Playback state updates
    spotifyPlayer.addListener('player_state_changed', (state) => {
        if (state) {
            sendToParent(MESSAGE_TYPES.PLAYER_STATE, {
                state: {
                    paused: state.paused,
                    position: state.position,
                    duration: state.duration,
                    track: state.track_window?.current_track ? {
                        id: state.track_window.current_track.id,
                        name: state.track_window.current_track.name,
                        artist: state.track_window.current_track.artists.map(a => a.name).join(', '),
                        album: state.track_window.current_track.album.name,
                        image: state.track_window.current_track.album.images[0]?.url
                    } : null
                }
            });
        }
    });

    // Initialization error
    spotifyPlayer.addListener('initialization_error', ({ message }) => {
        console.error('[Sandbox] ===== INITIALIZATION ERROR EVENT =====');
        console.error('[Sandbox] Error message:', message);
        if (!errorSent) {
            errorSent = true;
            sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                error: 'Failed to initialize Spotify player. Please try refreshing. Error: ' + message
            });
        }
    });
    
    console.log('[Sandbox] Initialization error listener added');
    console.log('[Sandbox] All event listeners set up');

    // Playback error
    spotifyPlayer.addListener('playback_error', ({ message }) => {
        console.error('[Sandbox] Playback error:', message);
        // Playback errors can happen after connection, so we don't check errorSent here
        sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
            error: 'Playback error: ' + message
        });
    });
}

/**
 * Handle messages from the parent page
 */
window.addEventListener('message', async (event) => {
    // In a sandboxed page, we should verify the origin, but for extension pages
    // we'll accept messages from the extension origin
    const message = event.data;

    // Only log and process messages that are from our parent (have our message types)
    // Ignore messages from Spotify SDK or other sources
    if (!message || !message.type) {
        return; // Silently ignore messages without type
    }

    // Only process our known message types
    const isOurMessage = Object.values(MESSAGE_TYPES).includes(message.type);
    if (!isOurMessage) {
        // Silently ignore non-our messages (like "SP MESSAGE" from Spotify SDK)
        return;
    }

    console.log('[Sandbox] Received our message:', message.type);

    switch (message.type) {
        case MESSAGE_TYPES.INIT_PLAYER:
            console.log('[Sandbox] INIT_PLAYER message received');
            if (!message.access_token) {
                console.error('[Sandbox] No access token provided');
                sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                    error: 'No access token provided'
                });
                return;
            }
            console.log('[Sandbox] Starting player initialization with token');
            await initializePlayer(message.access_token);
            break;

        default:
            console.log('[Sandbox] Unknown message type (but in our types):', message.type);
    }
});

/**
 * Diagnostic function to check player state
 * Can be called from console: window.checkSandboxState()
 */
window.checkSandboxState = async function() {
    console.log('[Sandbox] === SANDBOX STATE DIAGNOSTICS ===');
    console.log('[Sandbox] Spotify SDK loaded:', !!window.Spotify);
    console.log('[Sandbox] Spotify.Player available:', !!(window.Spotify && window.Spotify.Player));
    console.log('[Sandbox] spotifyPlayer instance:', !!spotifyPlayer);
    console.log('[Sandbox] deviceId:', deviceId);
    console.log('[Sandbox] hasAccessToken:', !!accessToken);
    console.log('[Sandbox] errorSent:', errorSent);
    
    if (spotifyPlayer) {
        try {
            const state = await spotifyPlayer.getCurrentState();
            console.log('[Sandbox] Current player state:', state);
            if (state) {
                console.log('[Sandbox] Player is connected and has state');
            } else {
                console.warn('[Sandbox] Player exists but state is null - may not be connected');
            }
        } catch (error) {
            console.error('[Sandbox] Error getting player state:', error);
        }
        
        try {
            const connected = await spotifyPlayer.connect();
            console.log('[Sandbox] Connect() result:', connected);
        } catch (error) {
            console.error('[Sandbox] Error calling connect():', error);
        }
    } else {
        console.warn('[Sandbox] No player instance exists');
    }
    
    console.log('[Sandbox] ====================================');
};

// Log that the sandbox script has loaded
console.log('[Sandbox] Spotify sandbox script loaded');
console.log('[Sandbox] Use window.checkSandboxState() in console to check player state');
