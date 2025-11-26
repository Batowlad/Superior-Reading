// Popup script for Chrome extension - Y2K Edition
document.addEventListener('DOMContentLoaded', function() {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const testBtn = document.getElementById('testBtn');
    const autoToggle = document.getElementById('autoToggle');
    const status = document.getElementById('status');
    const serverStatus = document.getElementById('serverStatus');

    // Y2K-style status update with animations
    function updateStatus(message, type = 'info') {
        const statusSpan = status.querySelector('span') || status;
        statusSpan.textContent = message;
        
        // Add sparkle effect
        status.style.animation = 'none';
        setTimeout(() => {
            status.style.animation = 'shine 3s infinite';
        }, 10);
        
        // Color coding based on type
        if (type === 'success') {
            status.style.background = 'linear-gradient(135deg, rgba(0, 255, 0, 0.4), rgba(255, 255, 0, 0.4))';
            status.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.8), inset 0 0 20px rgba(255, 255, 0, 0.4)';
        } else if (type === 'error') {
            status.style.background = 'linear-gradient(135deg, rgba(255, 0, 0, 0.4), rgba(255, 100, 0, 0.4))';
            status.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.8), inset 0 0 20px rgba(255, 100, 0, 0.4)';
        } else if (type === 'processing') {
            status.style.background = 'linear-gradient(135deg, rgba(255, 0, 255, 0.4), rgba(0, 255, 255, 0.4))';
            status.style.boxShadow = '0 0 25px rgba(255, 0, 255, 0.9), inset 0 0 25px rgba(0, 255, 255, 0.5)';
        } else {
            status.style.background = 'linear-gradient(135deg, rgba(255, 0, 255, 0.4), rgba(0, 255, 255, 0.4))';
            status.style.boxShadow = '0 0 15px rgba(255, 0, 255, 0.6), inset 0 0 15px rgba(0, 255, 255, 0.3)';
        }
    }

    // Test server connection with Y2K flair
    async function testConnection() {
        testBtn.disabled = true;
        updateStatus('🔍 Testing connection...', 'processing');
        
        try {
            const response = await fetch('http://localhost:3000/api/health');
            if (response.ok) {
                serverStatus.textContent = 'ONLINE';
                serverStatus.className = 'status-indicator connected';
                updateStatus('✅ Server connection successful! 🎉', 'success');
                
                // Add celebration effect
                createSparkleEffect(testBtn);
            } else {
                throw new Error('Server not responding');
            }
        } catch (error) {
            serverStatus.textContent = 'OFFLINE';
            serverStatus.className = 'status-indicator disconnected';
            updateStatus('❌ Server connection failed. Make sure backend is running. 🔌', 'error');
        } finally {
            testBtn.disabled = false;
        }
    }

    // Create sparkle effect for buttons
    function createSparkleEffect(element) {
        const sparkles = ['✨', '⭐', '💫', '🌟'];
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const sparkle = document.createElement('span');
                sparkle.textContent = sparkles[Math.floor(Math.random() * sparkles.length)];
                sparkle.style.position = 'absolute';
                sparkle.style.fontSize = '20px';
                sparkle.style.pointerEvents = 'none';
                sparkle.style.left = (Math.random() * 100) + '%';
                sparkle.style.top = (Math.random() * 100) + '%';
                sparkle.style.animation = 'sparkle 1s ease-out forwards';
                sparkle.style.zIndex = '1000';
                
                const rect = element.getBoundingClientRect();
                sparkle.style.left = (rect.left + Math.random() * rect.width) + 'px';
                sparkle.style.top = (rect.top + Math.random() * rect.height) + 'px';
                
                document.body.appendChild(sparkle);
                
                setTimeout(() => {
                    sparkle.remove();
                }, 1000);
            }, i * 100);
        }
    }

    // Manual scrape function with Y2K animations
    function manualScrape() {
        updateStatus('🎵 Scraping current page... 🎶', 'processing');
        scrapeBtn.disabled = true;
        scrapeBtn.textContent = '⏳ Processing...';
        
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
                    updateStatus('✨ Scraping completed! 🎉', 'success');
                    scrapeBtn.disabled = false;
                    scrapeBtn.textContent = '🎯 Scrape Current Page';
                    createSparkleEffect(scrapeBtn);
                }, 2000);
            } else {
                updateStatus('❌ No active tab found', 'error');
                scrapeBtn.disabled = false;
                scrapeBtn.textContent = '🎯 Scrape Current Page';
            }
        });
    }

    // Toggle auto-scrape with visual feedback
    function toggleAutoScrape() {
        autoToggle.classList.toggle('active');
        const isActive = autoToggle.classList.contains('active');
        
        // Store preference
        chrome.storage.sync.set({autoScrape: isActive}, () => {
            if (isActive) {
                updateStatus('🎛️ Auto-scrape enabled! 🚀', 'success');
                createSparkleEffect(autoToggle);
            } else {
                updateStatus('🎛️ Auto-scrape disabled', 'info');
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

    // Event listeners with Y2K sound effects (visual only)
    scrapeBtn.addEventListener('click', () => {
        createSparkleEffect(scrapeBtn);
        manualScrape();
    });
    
    testBtn.addEventListener('click', () => {
        createSparkleEffect(testBtn);
        testConnection();
    });
    
    autoToggle.addEventListener('click', () => {
        createSparkleEffect(autoToggle);
        toggleAutoScrape();
    });

    // Initial status
    updateStatus('🎵 Ready to scrape content! 📚', 'info');

    // Test connection on popup open
    testConnection();
});
