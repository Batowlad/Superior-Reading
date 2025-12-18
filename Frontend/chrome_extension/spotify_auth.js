// Spotify OAuth PKCE implementation for Chrome Extension
// This module handles authentication with Spotify using OAuth 2.0 Authorization Code Flow with PKCE

// Configuration - Set your Spotify Client ID here
// Get this from https://developer.spotify.com/dashboard
const SPOTIFY_CONFIG = {
    clientId: '2d35b413966c45379815f8d6aa664e67', // TODO: Set your Spotify Client ID
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: [
        'streaming',
        'user-modify-playback-state',
        'user-read-playback-state',
        'user-read-email',
        'user-read-private'
    ].join(' ')
};

// Storage keys
const STORAGE_KEYS = {
    ACCESS_TOKEN: 'spotify_access_token',
    REFRESH_TOKEN: 'spotify_refresh_token',
    EXPIRES_AT: 'spotify_expires_at',
    CODE_VERIFIER: 'spotify_code_verifier' // Temporary storage during auth flow
};

/**
 * Generate a cryptographically secure random code verifier for PKCE
 * @returns {string} Code verifier (43-128 characters)
 */
function generateCodeVerifier() {
    const array = new Uint8Array(96); // 96 bytes = 192 hex chars, well within 43-128 char requirement
    crypto.getRandomValues(array);
    return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join('');
}

/**
 * Generate code challenge from code verifier using SHA-256
 * @param {string} codeVerifier - The code verifier
 * @returns {Promise<string>} Base64 URL-encoded code challenge
 */
async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
    // Convert to base64url format (RFC 4648 §5)
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Get the redirect URI for this Chrome extension
 * @returns {string} Redirect URI in format https://<extension-id>.chromiumapp.org/
 */
function getRedirectUri() {
    return chrome.identity.getRedirectURL();
}

/**
 * Build the authorization URL with PKCE parameters
 * @param {string} codeChallenge - The code challenge
 * @returns {string} Complete authorization URL
 */
function buildAuthUrl(codeChallenge) {
    const redirectUri = getRedirectUri();
    const params = new URLSearchParams({
        client_id: SPOTIFY_CONFIG.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        scope: SPOTIFY_CONFIG.scopes
    });
    return `${SPOTIFY_CONFIG.authUrl}?${params.toString()}`;
}

/**
 * Extract authorization code from redirect URL
 * @param {string} redirectUrl - The redirect URL from OAuth callback
 * @returns {string|null} Authorization code or null if not found
 */
function extractAuthCode(redirectUrl) {
    try {
        const url = new URL(redirectUrl);
        return url.searchParams.get('code');
    } catch (error) {
        console.error('Error parsing redirect URL:', error);
        return null;
    }
}

/**
 * Exchange authorization code for access and refresh tokens
 * @param {string} authCode - Authorization code from OAuth callback
 * @param {string} codeVerifier - Original code verifier used in auth request
 * @returns {Promise<Object>} Token data with access_token, refresh_token, expires_in
 */
async function exchangeCodeForTokens(authCode, codeVerifier) {
    const redirectUri = getRedirectUri();
    const body = new URLSearchParams({
        client_id: SPOTIFY_CONFIG.clientId,
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
    });

    const response = await fetch(SPOTIFY_CONFIG.tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
}

/**
 * Store tokens in chrome.storage
 * @param {string} accessToken - Access token
 * @param {string} refreshToken - Refresh token
 * @param {number} expiresIn - Token expiration time in seconds
 * @returns {Promise<void>}
 */
async function storeTokens(accessToken, refreshToken, expiresIn) {
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({
            [STORAGE_KEYS.ACCESS_TOKEN]: accessToken,
            [STORAGE_KEYS.REFRESH_TOKEN]: refreshToken,
            [STORAGE_KEYS.EXPIRES_AT]: expiresAt
        }, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve();
            }
        });
    });
}

/**
 * Refresh access token using refresh token
 * @returns {Promise<string>} New access token
 */
async function refreshAccessToken() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([STORAGE_KEYS.REFRESH_TOKEN], async (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            const refreshToken = result[STORAGE_KEYS.REFRESH_TOKEN];
            if (!refreshToken) {
                reject(new Error('No refresh token available'));
                return;
            }

            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: SPOTIFY_CONFIG.clientId
            });

            try {
                const response = await fetch(SPOTIFY_CONFIG.tokenUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: body.toString()
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const tokenData = await response.json();
                const accessToken = tokenData.access_token;
                const expiresIn = tokenData.expires_in || 3600; // Default to 1 hour if not provided

                // Update stored tokens
                await storeTokens(
                    accessToken,
                    refreshToken, // Refresh token may or may not be returned
                    expiresIn
                );

                resolve(accessToken);
            } catch (error) {
                reject(error);
            }
        });
    });
}

/**
 * Get current access token, refreshing if necessary
 * @returns {Promise<string>} Valid access token
 */
async function getAccessToken() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([
            STORAGE_KEYS.ACCESS_TOKEN,
            STORAGE_KEYS.EXPIRES_AT
        ], async (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            const accessToken = result[STORAGE_KEYS.ACCESS_TOKEN];
            const expiresAt = result[STORAGE_KEYS.EXPIRES_AT];

            // Check if token exists and is still valid (with 5 minute buffer)
            if (accessToken && expiresAt && Date.now() < (expiresAt - 5 * 60 * 1000)) {
                resolve(accessToken);
                return;
            }

            // Token expired or doesn't exist, try to refresh
            try {
                const newToken = await refreshAccessToken();
                resolve(newToken);
            } catch (error) {
                // If refresh fails, user needs to re-authenticate
                reject(new Error('Token expired and refresh failed. Please re-authenticate.'));
            }
        });
    });
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>} True if authenticated
 */
async function isAuthenticated() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            STORAGE_KEYS.ACCESS_TOKEN,
            STORAGE_KEYS.REFRESH_TOKEN
        ], (result) => {
            if (chrome.runtime.lastError) {
                resolve(false);
                return;
            }
            resolve(!!(result[STORAGE_KEYS.ACCESS_TOKEN] && result[STORAGE_KEYS.REFRESH_TOKEN]));
        });
    });
}

/**
 * Clear stored tokens (logout)
 * @returns {Promise<void>}
 */
async function clearTokens() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove([
            STORAGE_KEYS.ACCESS_TOKEN,
            STORAGE_KEYS.REFRESH_TOKEN,
            STORAGE_KEYS.EXPIRES_AT,
            STORAGE_KEYS.CODE_VERIFIER
        ], () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve();
            }
        });
    });
}

/**
 * Initiate Spotify OAuth flow with PKCE
 * @returns {Promise<void>}
 */
async function authenticate() {
    if (!SPOTIFY_CONFIG.clientId) {
        throw new Error('Spotify Client ID not configured. Please set SPOTIFY_CONFIG.clientId in spotify_auth.js');
    }

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Build authorization URL
    const authUrl = buildAuthUrl(codeChallenge);

    // Launch OAuth flow
    // Note: We keep codeVerifier in closure - no need to store it since this is a single async flow
    return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
            { url: authUrl, interactive: true },
            async (redirectUrl) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (!redirectUrl) {
                    reject(new Error('OAuth flow was cancelled or failed'));
                    return;
                }

                // Extract authorization code
                const authCode = extractAuthCode(redirectUrl);
                if (!authCode) {
                    reject(new Error('Authorization code not found in redirect URL'));
                    return;
                }

                try {
                    // Exchange code for tokens using the code verifier from closure
                    const tokenData = await exchangeCodeForTokens(authCode, codeVerifier);
                    
                    // Store tokens
                    await storeTokens(
                        tokenData.access_token,
                        tokenData.refresh_token,
                        tokenData.expires_in
                    );

                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        authenticate,
        getAccessToken,
        refreshAccessToken,
        isAuthenticated,
        clearTokens,
        getRedirectUri,
        SPOTIFY_CONFIG
    };
} else {
    // Browser/Chrome extension environment
    window.SpotifyAuth = {
        authenticate,
        getAccessToken,
        refreshAccessToken,
        isAuthenticated,
        clearTokens,
        getRedirectUri,
        SPOTIFY_CONFIG
    };
}
