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
    if (!window.Spotify) {
        try {
            await loadSpotifySDK();
        } catch (error) {
            sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                error: 'Failed to load SDK: ' + error.message
            });
            return;
        }
    }

    if (!window.Spotify || !window.Spotify.Player) {
        sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
            error: 'Spotify.Player is not available'
        });
        return;
    }

    accessToken = token;

    try {
        // Create a new Spotify Player instance
        spotifyPlayer = new window.Spotify.Player({
            name: 'Superior Reading Extension',
            getOAuthToken: (callback) => {
                // Provide the access token to the SDK
                callback(accessToken);
            },
            volume: 0.5
        });

        // Set up event handlers BEFORE connecting
        setupPlayerHandlers();

        // Reset error flag for new connection attempt
        errorSent = false;
        
        // Connect to Spotify and wait for ready event or error
        const connected = await spotifyPlayer.connect();
        
        if (!connected) {
            // Connection failed immediately - this usually means:
            // 1. Invalid token
            // 2. Missing Premium subscription
            // 3. Network issue
            // We'll wait a bit for error events to fire, then send generic error if none received
            setTimeout(() => {
                // If no error event was received, send generic error
                if (!errorSent) {
                    errorSent = true;
                    sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                        error: 'Failed to connect to Spotify. Please check:\n1. Your Spotify Premium subscription\n2. Your internet connection\n3. Try re-authenticating'
                    });
                }
            }, 2000);
            return;
        }

        // Connection initiated successfully - wait for ready event
        // The ready event will be handled by setupPlayerHandlers()
        console.log('[Sandbox] Spotify Player connection initiated, waiting for ready event...');
    } catch (error) {
        console.error('[Sandbox] Error initializing player:', error);
        sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
            error: 'Failed to initialize player: ' + error.message
        });
    }
}

/**
 * Set up event handlers for the Spotify Player
 */
function setupPlayerHandlers() {
    if (!spotifyPlayer) return;

    // Ready event - player is ready and device_id is available
    spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('[Sandbox] Player ready with device_id:', device_id);
        deviceId = device_id;
        sendToParent(MESSAGE_TYPES.DEVICE_ID, {
            device_id: device_id
        });
        sendToParent(MESSAGE_TYPES.PLAYER_READY, {
            device_id: device_id
        });
    });

    // Not authenticated event
    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.warn('[Sandbox] Player not ready, device_id:', device_id);
        sendToParent(MESSAGE_TYPES.NOT_AUTHENTICATED, {
            device_id: device_id
        });
    });

    // Authentication error
    spotifyPlayer.addListener('authentication_error', ({ message }) => {
        console.error('[Sandbox] Authentication error:', message);
        if (!errorSent) {
            errorSent = true;
            sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                error: 'Authentication failed. Please try re-authenticating. Error: ' + message
            });
        }
    });

    // Account error (e.g., Premium required)
    spotifyPlayer.addListener('account_error', ({ message }) => {
        console.error('[Sandbox] Account error:', message);
        if (!errorSent) {
            errorSent = true;
            sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                error: 'Spotify Premium required. The Web Playback SDK requires a Premium subscription. Error: ' + message
            });
        }
    });

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
        console.error('[Sandbox] Initialization error:', message);
        if (!errorSent) {
            errorSent = true;
            sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                error: 'Failed to initialize Spotify player. Please try refreshing. Error: ' + message
            });
        }
    });

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

    if (!message || !message.type) {
        return;
    }

    switch (message.type) {
        case MESSAGE_TYPES.INIT_PLAYER:
            if (!message.access_token) {
                sendToParent(MESSAGE_TYPES.PLAYER_ERROR, {
                    error: 'No access token provided'
                });
                return;
            }
            await initializePlayer(message.access_token);
            break;

        default:
            console.log('[Sandbox] Unknown message type:', message.type);
    }
});

// Log that the sandbox script has loaded
console.log('[Sandbox] Spotify sandbox script loaded');
