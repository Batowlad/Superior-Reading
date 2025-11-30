// Content script for scraping web page content - Y2K Edition
(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        serverUrl: 'http://localhost:3000/api/scrape',
        autoScrape: true,
        scrapeDelay: 2000, // 2 seconds delay after page load
        maxRetries: 3
    };

    // Y2K-style notification overlay
    function createY2KNotification(message, type = 'info', duration = 3000) {
        // Remove existing notification if any
        const existing = document.getElementById('superior-reading-notification');
        if (existing) {
            existing.remove();
        }

        const notification = document.createElement('div');
        notification.id = 'superior-reading-notification';
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 999999;
                padding: 20px 25px;
                background: linear-gradient(135deg, 
                    rgba(255, 0, 255, 0.95), 
                    rgba(0, 255, 255, 0.95),
                    rgba(255, 255, 0, 0.95));
                background-size: 200% 200%;
                border: 3px solid rgba(255, 255, 255, 0.9);
                border-radius: 20px;
                color: white;
                font-family: 'Arial Black', sans-serif;
                font-weight: 900;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 1px;
                box-shadow: 
                    0 0 30px rgba(255, 0, 255, 0.8),
                    0 0 60px rgba(0, 255, 255, 0.6),
                    inset 0 0 30px rgba(255, 255, 255, 0.3);
                animation: notificationSlideIn 0.5s ease-out, 
                           notificationPulse 2s ease-in-out infinite,
                           gradientShift 3s ease infinite;
                backdrop-filter: blur(10px);
                min-width: 250px;
                text-align: center;
                pointer-events: none;
            ">
                <div style="font-size: 24px; margin-bottom: 8px;">${type === 'success' ? '✨' : type === 'error' ? '❌' : '🎵'}</div>
                <div>${message}</div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes notificationSlideIn {
                from {
                    transform: translateX(400px) scale(0.8);
                    opacity: 0;
                }
                to {
                    transform: translateX(0) scale(1);
                    opacity: 1;
                }
            }
            @keyframes notificationPulse {
                0%, 100% {
                    box-shadow: 
                        0 0 30px rgba(255, 0, 255, 0.8),
                        0 0 60px rgba(0, 255, 255, 0.6),
                        inset 0 0 30px rgba(255, 255, 255, 0.3);
                }
                50% {
                    box-shadow: 
                        0 0 50px rgba(255, 0, 255, 1),
                        0 0 100px rgba(0, 255, 255, 0.8),
                        inset 0 0 40px rgba(255, 255, 255, 0.5);
                }
            }
            @keyframes gradientShift {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        // Auto-remove after duration
        setTimeout(() => {
            notification.style.animation = 'notificationSlideIn 0.5s ease-out reverse';
            setTimeout(() => {
                notification.remove();
                style.remove();
            }, 500);
        }, duration);
    }

    // Main content extraction function
    function extractMainContent() {
        try {
            // Create a clone of the document to work with, so we don't modify the original page
            const clonedBody = document.body.cloneNode(true);
            
            // Remove script and style elements from the CLONE only
            const scripts = clonedBody.querySelectorAll('script, style, nav, header, footer, aside, .advertisement, .ads, .sidebar');
            scripts.forEach(el => el.remove());

            // Try multiple strategies to find main content
            let content = '';
            
            // Strategy 1: Look for common main content selectors in the CLONE
            const mainSelectors = [
                'main',
                'article',
                '[role="main"]',
                '.main-content',
                '.content',
                '.post-content',
                '.entry-content',
                '.article-content',
                '#content',
                '#main',
                '.main'
            ];

            for (const selector of mainSelectors) {
                const element = clonedBody.querySelector(selector);
                if (element && element.textContent.trim().length > 100) {
                    content = element.textContent.trim();
                    break;
                }
            }

            // Strategy 2: If no main content found, use cloned body but filter out navigation
            if (!content) {
                // Remove common non-content elements from the CLONE
                const elementsToRemove = [
                    'nav', 'header', 'footer', 'aside', 'script', 'style',
                    '.navigation', '.nav', '.menu', '.sidebar', '.advertisement',
                    '.ads', '.ad', '.social', '.share', '.comments', '.related'
                ];
                
                elementsToRemove.forEach(selector => {
                    const elements = clonedBody.querySelectorAll(selector);
                    elements.forEach(el => el.remove());
                });

                content = clonedBody.textContent.trim();
            }

            // Clean up the content
            content = content
                .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
                .replace(/\n\s*\n/g, '\n') // Remove empty lines
                .trim();

            return {
                url: window.location.href,
                title: document.title,
                content: content,
                timestamp: new Date().toISOString(),
                domain: window.location.hostname,
                wordCount: content.split(/\s+/).length
            };

        } catch (error) {
            console.error('Error extracting content:', error);
            return null;
        }
    }

    // Send data to backend server
    async function sendToServer(data) {
        try {
            console.log('🔄 Attempting to send data to server:', CONFIG.serverUrl);
            console.log('📊 Data being sent:', {
                url: data.url,
                title: data.title,
                wordCount: data.wordCount,
                domain: data.domain
            });
            
            const response = await fetch(CONFIG.serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            console.log('📡 Server response status:', response.status);
            console.log('📡 Server response headers:', response.headers);

            if (response.ok) {
                const responseData = await response.json();
                console.log('✅ Content successfully sent to server:', responseData);
                return true;
            } else {
                const errorText = await response.text();
                console.error('❌ Failed to send content to server:', response.status, errorText);
                return false;
            }
        } catch (error) {
            console.error('❌ Error sending data to server:', error);
            console.error('❌ Error details:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });
            return false;
        }
    }

    // Main scraping function with Y2K visual feedback
    async function scrapeAndSend() {
        console.log('🚀 Starting content scraping...');
        console.log('📍 Current URL:', window.location.href);
        console.log('📍 Current title:', document.title);
        
        // Show Y2K notification
        createY2KNotification('🎵 Scraping Content... 📚', 'info', 2000);
        
        const contentData = extractMainContent();
        if (!contentData || !contentData.content) {
            console.log('❌ No meaningful content found to scrape');
            console.log('🔍 Page content length:', document.body.textContent.length);
            console.log('🔍 Available selectors:', {
                main: document.querySelector('main'),
                article: document.querySelector('article'),
                content: document.querySelector('.content'),
                body: document.body
            });
            createY2KNotification('❌ No Content Found', 'error', 3000);
            return;
        }

        console.log(`✅ Scraped content: ${contentData.wordCount} words from ${contentData.url}`);
        console.log(`📄 Content preview: ${contentData.content.substring(0, 200)}...`);
        
        // Send to server
        const success = await sendToServer(contentData);
        if (success) {
            console.log('🎉 Content successfully sent to backend server');
            createY2KNotification(`✨ Scraped ${contentData.wordCount} Words! 🎉`, 'success', 4000);
        } else {
            console.error('💥 Failed to send content to backend server');
            createY2KNotification('❌ Failed to Send', 'error', 3000);
        }
    }

    // Auto-scrape functionality
    if (CONFIG.autoScrape) {
        // Wait for page to fully load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(scrapeAndSend, CONFIG.scrapeDelay);
            });
        } else {
            setTimeout(scrapeAndSend, CONFIG.scrapeDelay);
        }
    }

    // Listen for messages from popup or background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'scrape') {
            scrapeAndSend().then(() => {
                sendResponse({success: true});
            }).catch(error => {
                console.error('Scraping error:', error);
                sendResponse({success: false, error: error.message});
            });
            return true; // Keep message channel open for async response
        }
    });

    // Expose scrape function globally for manual testing
    window.superiorReadingScrape = scrapeAndSend;

})();
