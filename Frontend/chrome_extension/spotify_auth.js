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
 * @returns {string} Code verifier (43-128 characters, base64url encoded)
 */
function generateCodeVerifier() {
    // Generate 32 random bytes (256 bits of entropy)
    // Base64 encoding of 32 bytes = 44 characters (within 43-128 range)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    
    // Convert to base64url format (RFC 4648 §5)
    // This ensures we use only unreserved characters: A-Z, a-z, 0-9, -, ., _, ~
    const base64 = btoa(String.fromCharCode(...array));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    
    console.log('[Spotify Auth] Exchange tokens - code verifier length:', codeVerifier.length);
    console.log('[Spotify Auth] Exchange tokens - redirect URI:', redirectUri);
    
    const body = new URLSearchParams({
        client_id: SPOTIFY_CONFIG.clientId,
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
    });

    console.log('[Spotify Auth] Token exchange request body length:', body.toString().length);
    console.log('[Spotify Auth] Token exchange request (without sensitive data):', {
        client_id: SPOTIFY_CONFIG.clientId,
        grant_type: 'authorization_code',
        code_length: authCode.length,
        redirect_uri: redirectUri,
        code_verifier_length: codeVerifier.length
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
        console.error('[Spotify Auth] Token exchange failed response:', {
            status: response.status,
            statusText: response.statusText,
            errorText: errorText
        });
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
                console.error('[Spotify Auth] Error storing tokens:', chrome.runtime.lastError);
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                // Verify tokens were stored correctly
                chrome.storage.local.get([
                    STORAGE_KEYS.ACCESS_TOKEN,
                    STORAGE_KEYS.REFRESH_TOKEN
                ], (result) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Spotify Auth] Error verifying stored tokens:', chrome.runtime.lastError);
                        reject(new Error('Failed to verify token storage: ' + chrome.runtime.lastError.message));
                    } else if (!result[STORAGE_KEYS.ACCESS_TOKEN] || !result[STORAGE_KEYS.REFRESH_TOKEN]) {
                        console.error('[Spotify Auth] Tokens not found after storage:', result);
                        reject(new Error('Tokens were not stored correctly'));
                    } else {
                        console.log('[Spotify Auth] Tokens stored and verified successfully');
                        resolve();
                    }
                });
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
    console.log('[Spotify Auth] ===== AUTHENTICATE CALLED =====');
    
    // Check if chrome.identity is available
    if (!chrome || !chrome.identity) {
        const error = 'Chrome identity API not available. Make sure "identity" permission is in manifest.json';
        console.error('[Spotify Auth]', error);
        throw new Error(error);
    }
    
    if (!chrome.identity.launchWebAuthFlow) {
        const error = 'chrome.identity.launchWebAuthFlow not available';
        console.error('[Spotify Auth]', error);
        throw new Error(error);
    }
    
    if (!SPOTIFY_CONFIG.clientId) {
        throw new Error('Spotify Client ID not configured. Please set SPOTIFY_CONFIG.clientId in spotify_auth.js');
    }

    // Validate redirect URI
    const redirectUri = getRedirectUri();
    console.log('[Spotify Auth] Redirect URI from getRedirectUri():', redirectUri);
    
    if (!redirectUri || !redirectUri.includes('chromiumapp.org')) {
        const error = 'Invalid redirect URI. Make sure the extension is properly installed. Got: ' + redirectUri;
        console.error('[Spotify Auth]', error);
        throw new Error(error);
    }

    console.log('[Spotify Auth] Starting authentication flow');
    console.log('[Spotify Auth] Redirect URI:', redirectUri);
    console.log('[Spotify Auth] Client ID:', SPOTIFY_CONFIG.clientId);
    console.log('[Spotify Auth] Chrome identity API available:', !!chrome.identity);

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    console.log('[Spotify Auth] Code verifier generated, length:', codeVerifier.length);
    console.log('[Spotify Auth] Code verifier format check (should be 43-128 chars):', 
        codeVerifier.length >= 43 && codeVerifier.length <= 128 ? 'VALID' : 'INVALID');
    
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    console.log('[Spotify Auth] Code challenge generated, length:', codeChallenge.length);

    // Build authorization URL
    const authUrl = buildAuthUrl(codeChallenge);
    console.log('[Spotify Auth] Authorization URL length:', authUrl.length);

    // Launch OAuth flow
    // Note: We keep codeVerifier in closure - no need to store it since this is a single async flow
    return new Promise((resolve, reject) => {
        console.log('[Spotify Auth] Launching web auth flow with URL:', authUrl.substring(0, 100) + '...');
        
        try {
            chrome.identity.launchWebAuthFlow(
                { url: authUrl, interactive: true },
                async (redirectUrl) => {
                    console.log('[Spotify Auth] launchWebAuthFlow callback invoked');
                    console.log('[Spotify Auth] redirectUrl:', redirectUrl ? redirectUrl.substring(0, 100) : 'null');
                    console.log('[Spotify Auth] chrome.runtime.lastError:', chrome.runtime.lastError);
                    
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message;
                        console.error('[Spotify Auth] Chrome identity error:', errorMsg);
                        console.error('[Spotify Auth] Full error object:', chrome.runtime.lastError);
                        
                        // Provide helpful error messages based on common issues
                        if (errorMsg.includes('authorization page could not be loaded')) {
                            const detailedError = 'Authorization page could not be loaded. Please check:\n' +
                                '1. Your redirect URI in Spotify app settings: ' + redirectUri + '\n' +
                                '2. Make sure the redirect URI matches exactly (including trailing slash)\n' +
                                '3. Check your internet connection\n' +
                                '4. Verify your Spotify Client ID is correct';
                            console.error('[Spotify Auth] Detailed error:', detailedError);
                            reject(new Error(detailedError));
                        } else if (errorMsg.includes('redirect_uri_mismatch')) {
                            const detailedError = 'Redirect URI mismatch. Please add this exact URI to your Spotify app:\n' +
                                redirectUri + '\n' +
                                'Go to: https://developer.spotify.com/dashboard → Your App → Edit Settings → Redirect URIs';
                            console.error('[Spotify Auth] Detailed error:', detailedError);
                            reject(new Error(detailedError));
                        } else {
                            console.error('[Spotify Auth] Generic error:', errorMsg);
                            reject(new Error('Authentication failed: ' + errorMsg));
                        }
                        return;
                    }

                    if (!redirectUrl) {
                        console.error('[Spotify Auth] No redirect URL received - user may have cancelled');
                        reject(new Error('OAuth flow was cancelled or failed. Please try again.'));
                        return;
                    }

                    console.log('[Spotify Auth] Received redirect URL:', redirectUrl.substring(0, 200));

                    // Extract authorization code
                    const authCode = extractAuthCode(redirectUrl);
                    if (!authCode) {
                        console.error('[Spotify Auth] No authorization code found in redirect URL');
                        // Check if there's an error in the URL
                        try {
                            const url = new URL(redirectUrl);
                            const error = url.searchParams.get('error');
                            const errorDescription = url.searchParams.get('error_description');
                            console.error('[Spotify Auth] Error in URL params:', { error, errorDescription });
                            if (error) {
                                const errorMsg = `Spotify authorization error: ${error}${errorDescription ? ' - ' + errorDescription : ''}`;
                                console.error('[Spotify Auth] Rejecting with:', errorMsg);
                                reject(new Error(errorMsg));
                                return;
                            }
                        } catch (e) {
                            console.error('[Spotify Auth] Error parsing redirect URL:', e);
                            // URL parsing failed, continue with generic error
                        }
                        reject(new Error('Authorization code not found in redirect URL'));
                        return;
                    }

                    console.log('[Spotify Auth] Authorization code received, exchanging for tokens...');
                    console.log('[Spotify Auth] Auth code length:', authCode ? authCode.length : 0);
                    console.log('[Spotify Auth] Code verifier available:', !!codeVerifier);
                    console.log('[Spotify Auth] Code verifier length:', codeVerifier ? codeVerifier.length : 0);
                    console.log('[Spotify Auth] Code verifier format (first 20 chars):', codeVerifier ? codeVerifier.substring(0, 20) : 'N/A');

                    try {
                        // Exchange code for tokens using the code verifier from closure
                        const tokenData = await exchangeCodeForTokens(authCode, codeVerifier);
                        
                        console.log('[Spotify Auth] Token exchange response received');
                        console.log('[Spotify Auth] Has access_token:', !!tokenData.access_token);
                        console.log('[Spotify Auth] Has refresh_token:', !!tokenData.refresh_token);
                        console.log('[Spotify Auth] Expires in:', tokenData.expires_in);
                        
                        if (!tokenData.access_token || !tokenData.refresh_token) {
                            throw new Error('Token response missing required fields: ' + JSON.stringify(Object.keys(tokenData)));
                        }
                        
                        console.log('[Spotify Auth] Tokens received, storing...');
                        
                        // Store tokens
                        await storeTokens(
                            tokenData.access_token,
                            tokenData.refresh_token,
                            tokenData.expires_in
                        );

                        console.log('[Spotify Auth] Tokens stored successfully');
                        
                        // Verify tokens were stored
                        const verifyAuth = await isAuthenticated();
                        console.log('[Spotify Auth] Post-storage authentication check:', verifyAuth);
                        
                        if (!verifyAuth) {
                            throw new Error('Tokens were stored but authentication verification failed');
                        }

                        console.log('[Spotify Auth] Authentication successful and verified!');
                        resolve();
                    } catch (error) {
                        console.error('[Spotify Auth] Token exchange failed:', error);
                        console.error('[Spotify Auth] Token exchange error stack:', error.stack);
                        console.error('[Spotify Auth] Token exchange error name:', error.name);
                        console.error('[Spotify Auth] Token exchange error message:', error.message);
                        reject(error);
                    }
                }
            );
        } catch (error) {
            console.error('[Spotify Auth] Error launching web auth flow:', error);
            console.error('[Spotify Auth] Launch error stack:', error.stack);
            reject(error);
        }
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
