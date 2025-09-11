// Popup script for Chrome extension
document.addEventListener('DOMContentLoaded', function() {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const testBtn = document.getElementById('testBtn');
    const autoToggle = document.getElementById('autoToggle');
    const status = document.getElementById('status');
    const serverStatus = document.getElementById('serverStatus');

    // Test server connection
    async function testConnection() {
        try {
            const response = await fetch('http://localhost:3000/api/health');
            if (response.ok) {
                serverStatus.textContent = 'Connected';
                serverStatus.style.color = '#4CAF50';
                status.textContent = 'Server connection successful';
            } else {
                throw new Error('Server not responding');
            }
        } catch (error) {
            serverStatus.textContent = 'Disconnected';
            serverStatus.style.color = '#f44336';
            status.textContent = 'Server connection failed. Make sure backend is running.';
        }
    }

    // Manual scrape function
    function manualScrape() {
        status.textContent = 'Scraping current page...';
        scrapeBtn.disabled = true;
        
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
                    status.textContent = 'Scraping completed';
                    scrapeBtn.disabled = false;
                }, 2000);
            }
        });
    }

    // Toggle auto-scrape
    function toggleAutoScrape() {
        autoToggle.classList.toggle('active');
        const isActive = autoToggle.classList.contains('active');
        
        // Store preference
        chrome.storage.sync.set({autoScrape: isActive}, () => {
            status.textContent = isActive ? 'Auto-scrape enabled' : 'Auto-scrape disabled';
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

    // Test connection on popup open
    testConnection();
});
