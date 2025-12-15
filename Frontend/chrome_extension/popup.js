// Popup script for Chrome extension - Minimalistic version
document.addEventListener('DOMContentLoaded', function() {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const testBtn = document.getElementById('testBtn');
    const autoToggle = document.getElementById('autoToggle');
    const status = document.getElementById('status');
    const serverStatus = document.getElementById('serverStatus');

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
            if (tabs[0]) {
                // Send message to content script and wait for actual completion
                chrome.tabs.sendMessage(tabs[0].id, {action: 'scrape'}, (response) => {
                    // Handle response from content script
                    if (chrome.runtime.lastError) {
                        // Content script might not be loaded or error occurred
                        console.error('Error communicating with content script:', chrome.runtime.lastError);
                        updateStatus('SCRAPING FAILED', 'error');
                        scrapeBtn.disabled = false;
                        scrapeBtn.textContent = 'Scrape Current Page';
                        return;
                    }
                    
                    if (response && response.success) {
                        updateStatus('SCRAPING COMPLETE!', 'success');
                    } else {
                        const errorMsg = response?.error || 'Unknown error';
                        console.error('Scraping failed:', errorMsg);
                        updateStatus('SCRAPING FAILED', 'error');
                    }
                    
                    scrapeBtn.disabled = false;
                    scrapeBtn.textContent = 'Scrape Current Page';
                });
            } else {
                updateStatus('NO ACTIVE TAB', 'error');
                scrapeBtn.disabled = false;
                scrapeBtn.textContent = 'Scrape Current Page';
            }
        } catch (error) {
            console.error('Error during scraping:', error);
            updateStatus('SCRAPING FAILED', 'error');
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

    // Event listeners
    scrapeBtn.addEventListener('click', manualScrape);
    testBtn.addEventListener('click', testConnection);
    autoToggle.addEventListener('click', toggleAutoScrape);

    // Initial status
    updateStatus('READY TO SCRAPE', 'info');

    // Test connection on popup open
    testConnection();
});
