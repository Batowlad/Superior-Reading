// Popup script for Chrome extension - Minimalistic version
document.addEventListener('DOMContentLoaded', function() {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const testBtn = document.getElementById('testBtn');
    const autoToggle = document.getElementById('autoToggle');
    const status = document.getElementById('status');
    const serverStatus = document.getElementById('serverStatus');

    // Simple status update
    function updateStatus(message, type = 'info') {
        status.textContent = message;
        
        // Color coding based on type
        if (type === 'success') {
            status.style.background = '#e8f5e9';
            status.style.borderLeftColor = '#2e7d32';
            status.style.color = '#1b5e20';
        } else if (type === 'error') {
            status.style.background = '#ffebee';
            status.style.borderLeftColor = '#c62828';
            status.style.color = '#b71c1c';
        } else if (type === 'processing') {
            status.style.background = '#e3f2fd';
            status.style.borderLeftColor = '#1976d2';
            status.style.color = '#0d47a1';
        } else {
            status.style.background = '#f5f5f5';
            status.style.borderLeftColor = '#666';
            status.style.color = '#444';
        }
    }

    // Test server connection
    async function testConnection() {
        testBtn.disabled = true;
        updateStatus('Testing connection...', 'processing');
        
        try {
            const response = await fetch('http://localhost:3000/api/health');
            if (response.ok) {
                serverStatus.textContent = 'Online';
                serverStatus.className = 'status-indicator connected';
                updateStatus('Server connection successful', 'success');
            } else {
                throw new Error('Server not responding');
            }
        } catch (error) {
            serverStatus.textContent = 'Offline';
            serverStatus.className = 'status-indicator disconnected';
            updateStatus('Server connection failed. Make sure backend is running.', 'error');
        } finally {
            testBtn.disabled = false;
        }
    }

    // Manual scrape function
    function manualScrape() {
        updateStatus('Scraping current page...', 'processing');
        scrapeBtn.disabled = true;
        scrapeBtn.textContent = 'Processing...';
        
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    function: () => {
                        if (window.superiorReadingScrape) {
                            window.superiorReadingScrape();
                        }
                    }
                });
                
                setTimeout(() => {
                    updateStatus('Scraping completed', 'success');
                    scrapeBtn.disabled = false;
                    scrapeBtn.textContent = 'Scrape Current Page';
                }, 2000);
            } else {
                updateStatus('No active tab found', 'error');
                scrapeBtn.disabled = false;
                scrapeBtn.textContent = 'Scrape Current Page';
            }
        });
    }

    // Toggle auto-scrape
    function toggleAutoScrape() {
        autoToggle.classList.toggle('active');
        const isActive = autoToggle.classList.contains('active');
        
        // Store preference
        chrome.storage.sync.set({autoScrape: isActive}, () => {
            if (isActive) {
                updateStatus('Auto-scrape enabled', 'success');
            } else {
                updateStatus('Auto-scrape disabled', 'info');
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
    updateStatus('Ready to scrape content', 'info');

    // Test connection on popup open
    testConnection();
});
