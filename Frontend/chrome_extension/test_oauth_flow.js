/**
 * OAuth Flow Test Script
 * 
 * This script can be run in the Chrome DevTools console to verify
 * the OAuth flow message passing logic.
 * 
 * Usage:
 * 1. Open extension popup
 * 2. Open DevTools Console
 * 3. Paste and run this script
 * 4. Check console output for test results
 */

(function testOAuthFlow() {
    console.log('=== OAuth Flow Test Started ===');
    
    const tests = {
        passed: 0,
        failed: 0,
        results: []
    };
    
    function test(name, condition, message) {
        if (condition) {
            console.log(`✓ PASS: ${name}`);
            tests.passed++;
            tests.results.push({ name, status: 'PASS', message });
        } else {
            console.error(`✗ FAIL: ${name} - ${message}`);
            tests.failed++;
            tests.results.push({ name, status: 'FAIL', message });
        }
    }
    
    // Test 1: Check if SpotifyAuth is available in popup context
    test(
        'SpotifyAuth available in popup',
        typeof window.SpotifyAuth !== 'undefined',
        'window.SpotifyAuth should be defined'
    );
    
    // Test 2: Check if SpotifyAuth has required methods
    if (typeof window.SpotifyAuth !== 'undefined') {
        test(
            'SpotifyAuth.authenticate exists',
            typeof window.SpotifyAuth.authenticate === 'function',
            'authenticate method should be a function'
        );
        
        test(
            'SpotifyAuth.isAuthenticated exists',
            typeof window.SpotifyAuth.isAuthenticated === 'function',
            'isAuthenticated method should be a function'
        );
        
        test(
            'SpotifyAuth.getAccessToken exists',
            typeof window.SpotifyAuth.getAccessToken === 'function',
            'getAccessToken method should be a function'
        );
        
        test(
            'SpotifyAuth.getRedirectUri exists',
            typeof window.SpotifyAuth.getRedirectUri === 'function',
            'getRedirectUri method should be a function'
        );
    }
    
    // Test 3: Check if chrome.runtime.sendMessage is available
    test(
        'chrome.runtime.sendMessage available',
        typeof chrome !== 'undefined' && 
        typeof chrome.runtime !== 'undefined' && 
        typeof chrome.runtime.sendMessage === 'function',
        'chrome.runtime.sendMessage should be available'
    );
    
    // Test 4: Check if chrome.runtime.onMessage listener is set up
    // Note: We can't directly test if listener is registered, but we can verify
    // the API is available
    test(
        'chrome.runtime.onMessage available',
        typeof chrome !== 'undefined' && 
        typeof chrome.runtime !== 'undefined' && 
        typeof chrome.runtime.onMessage !== 'undefined',
        'chrome.runtime.onMessage should be available'
    );
    
    // Test 5: Check if chrome.identity is available (for background script)
    test(
        'chrome.identity API available',
        typeof chrome !== 'undefined' && 
        typeof chrome.identity !== 'undefined',
        'chrome.identity should be available (required for OAuth)'
    );
    
    // Test 6: Verify redirect URI can be generated
    if (typeof window.SpotifyAuth !== 'undefined' && 
        typeof window.SpotifyAuth.getRedirectUri === 'function') {
        try {
            const redirectUri = window.SpotifyAuth.getRedirectUri();
            test(
                'Redirect URI generated',
                redirectUri && redirectUri.includes('chromiumapp.org'),
                `Redirect URI: ${redirectUri}`
            );
        } catch (error) {
            test(
                'Redirect URI generated',
                false,
                `Error generating redirect URI: ${error.message}`
            );
        }
    }
    
    // Test 7: Check if message listener can be registered
    let messageListenerRegistered = false;
    try {
        chrome.runtime.onMessage.addListener(() => {});
        messageListenerRegistered = true;
        // Remove test listener
        chrome.runtime.onMessage.removeListener(() => {});
    } catch (error) {
        // Listener registration failed
    }
    
    test(
        'Message listener can be registered',
        messageListenerRegistered,
        'Should be able to register message listeners'
    );
    
    // Test 8: Check if we can send a test message (will fail if background isn't ready)
    // This is async, so we'll just check if the function exists
    test(
        'Can send messages to background',
        typeof chrome.runtime.sendMessage === 'function',
        'sendMessage function should be available'
    );
    
    // Print summary
    console.log('\n=== Test Summary ===');
    console.log(`Total Tests: ${tests.passed + tests.failed}`);
    console.log(`Passed: ${tests.passed}`);
    console.log(`Failed: ${tests.failed}`);
    console.log(`Success Rate: ${((tests.passed / (tests.passed + tests.failed)) * 100).toFixed(1)}%`);
    
    if (tests.failed === 0) {
        console.log('\n✓ All tests passed! OAuth flow setup looks correct.');
        console.log('\nNext steps:');
        console.log('1. Test the actual OAuth flow by clicking "Connect to Spotify"');
        console.log('2. Monitor console logs in both popup and background script');
        console.log('3. Follow the test guide in OAUTH_FLOW_TEST.md');
    } else {
        console.log('\n✗ Some tests failed. Please check the errors above.');
    }
    
    console.log('\n=== Detailed Results ===');
    tests.results.forEach(result => {
        const icon = result.status === 'PASS' ? '✓' : '✗';
        console.log(`${icon} ${result.name}: ${result.message}`);
    });
    
    return tests;
})();

