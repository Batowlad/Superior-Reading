# OAuth Flow Test Guide

## Overview
This document describes how to test the complete OAuth flow: popup → background → OAuth window → callback → popup notification.

## Test Flow Steps

### 1. Pre-Test Setup
- [ ] Extension is loaded in Chrome (Developer mode)
- [ ] Spotify Client ID is configured in `spotify_auth.js`
- [ ] Redirect URI is added to Spotify app settings at https://developer.spotify.com/dashboard
- [ ] Chrome DevTools are open for both popup and background script

### 2. Open Extension Popup
- [ ] Click extension icon to open popup
- [ ] Verify popup displays "Not Connected" status
- [ ] Verify "Connect to Spotify" button is visible and enabled

### 3. Start Authentication
- [ ] Open Chrome DevTools Console (for popup)
- [ ] Open Chrome DevTools → Application → Service Workers (for background)
- [ ] Click "Connect to Spotify" button
- [ ] **Expected Console Logs (Popup):**
  ```
  [Popup] ===== AUTHENTICATION STARTED =====
  [Popup] Auth button clicked at: [timestamp]
  [Popup] Sending authentication request to background script...
  [Popup] Authentication request sent, waiting for status updates...
  ```
- [ ] **Expected Console Logs (Background):**
  ```
  [Background] Authentication request received from popup
  [Spotify Auth] ===== AUTHENTICATE CALLED =====
  [Spotify Auth] Starting authentication flow
  [Spotify Auth] Launching web auth flow...
  ```

### 4. OAuth Window Opens
- [ ] Verify OAuth window opens (Spotify login page)
- [ ] **Critical:** Popup should remain open (or can close, but background continues)
- [ ] Verify you can see Spotify login page
- [ ] Enter Spotify credentials and click "AGREE"
- [ ] **Expected:** OAuth window closes automatically after clicking AGREE

### 5. Authentication Callback
- [ ] **Expected Console Logs (Background):**
  ```
  [Spotify Auth] launchWebAuthFlow callback invoked
  [Spotify Auth] Authorization code received, exchanging for tokens...
  [Spotify Auth] Token exchange response received
  [Spotify Auth] Tokens stored successfully
  [Spotify Auth] Authentication successful and verified!
  [Background] Authentication successful
  ```

### 6. Popup Notification
- [ ] **Expected Console Logs (Popup):**
  ```
  [Popup] Authentication status update: authenticating Starting authentication...
  [Popup] Authentication status update: success Authentication successful
  [Popup] Authentication successful, loading token...
  [Popup] Token loaded, initializing player...
  [Popup] Player initialized successfully
  [Popup] ===== AUTHENTICATION COMPLETE =====
  ```
- [ ] **Expected UI Changes:**
  - Status changes from "Not Connected" → "Connecting..." → "Initializing player..." → "Connected"
  - "Connect to Spotify" button disappears
  - Player controls appear (play/pause, next, previous buttons)
  - Player status shows "Ready"

### 7. Verify Token Storage
- [ ] Open Chrome DevTools → Application → Storage → Local Storage
- [ ] Verify `spotify_access_token` is stored
- [ ] Verify `spotify_refresh_token` is stored
- [ ] Verify `spotify_expires_at` is stored

### 8. Test Edge Cases

#### Test Case 8.1: Popup Closes During OAuth
- [ ] Start authentication
- [ ] Close popup while OAuth window is open
- [ ] Complete OAuth flow (click AGREE)
- [ ] **Expected:** Background script completes authentication
- [ ] Reopen popup
- [ ] **Expected:** Popup detects authentication and shows "Connected" status

#### Test Case 8.2: User Cancels OAuth
- [ ] Start authentication
- [ ] Close OAuth window without clicking AGREE
- [ ] **Expected Console Logs (Background):**
  ```
  [Spotify Auth] OAuth flow was cancelled or failed
  ```
- [ ] **Expected Console Logs (Popup):**
  ```
  [Popup] Authentication status update: error Authentication failed: OAuth flow was cancelled
  ```
- [ ] **Expected UI:** Status shows error, button re-enabled

#### Test Case 8.3: Invalid Redirect URI
- [ ] Remove redirect URI from Spotify app settings
- [ ] Start authentication
- [ ] **Expected:** Error message about redirect URI mismatch
- [ ] **Expected:** Helpful error message with redirect URI to add

## Verification Checklist

### Code Flow Verification
- [x] Popup sends `{ action: 'authenticate' }` message to background
- [x] Background receives message and calls `SpotifyAuth.authenticate()`
- [x] Background sends `authStatus: 'authenticating'` message to popup
- [x] `chrome.identity.launchWebAuthFlow()` opens OAuth window
- [x] OAuth callback is handled in background context
- [x] Tokens are stored in `chrome.storage.local`
- [x] Background sends `authStatus: 'success'` message to popup
- [x] Popup receives message and initializes player

### Message Passing Verification
- [x] Popup → Background: `chrome.runtime.sendMessage({ action: 'authenticate' })`
- [x] Background → Popup: `chrome.runtime.sendMessage({ action: 'authStatus', status: '...' })`
- [x] Popup listener: `chrome.runtime.onMessage.addListener()` handles `authStatus` messages
- [x] Background listener: `chrome.runtime.onMessage.addListener()` handles `authenticate` action

### Error Handling Verification
- [x] Background catches errors and sends `authStatus: 'error'` to popup
- [x] Popup handles error messages and updates UI
- [x] Timeout handling (60 seconds) in popup
- [x] Error messages are user-friendly

## Common Issues and Solutions

### Issue: Popup closes when OAuth window opens
**Solution:** This is fixed! OAuth now runs in background script which persists.

### Issue: Authentication succeeds but popup doesn't update
**Solution:** Check that popup message listener is registered before sending message.

### Issue: "SpotifyAuth not available in background script"
**Solution:** Verify `spotify_auth.js` is imported in `background.js` using `importScripts()`.

### Issue: Redirect URI mismatch
**Solution:** 
1. Get redirect URI from console: `chrome.identity.getRedirectURL()`
2. Add exact URI to Spotify app settings (including trailing slash if present)

## Test Results Template

```
Test Date: ___________
Tester: ___________

Test 1: Basic OAuth Flow
- [ ] Pass / [ ] Fail
- Notes: ___________

Test 2: Popup Closes During OAuth
- [ ] Pass / [ ] Fail
- Notes: ___________

Test 3: User Cancels OAuth
- [ ] Pass / [ ] Fail
- Notes: ___________

Overall Result: [ ] Pass / [ ] Fail
```

