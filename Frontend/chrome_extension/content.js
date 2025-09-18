// Content script for scraping web page content
(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        serverUrl: 'http://localhost:3000/api/scrape',
        autoScrape: true,
        scrapeDelay: 2000, // 2 seconds delay after page load
        maxRetries: 3
    };

    // Main content extraction function
    function extractMainContent() {
        try {
            // Remove script and style elements
            const scripts = document.querySelectorAll('script, style, nav, header, footer, aside, .advertisement, .ads, .sidebar');
            scripts.forEach(el => el.remove());

            // Try multiple strategies to find main content
            let content = '';
            
            // Strategy 1: Look for common main content selectors
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
                const element = document.querySelector(selector);
                if (element && element.textContent.trim().length > 100) {
                    content = element.textContent.trim();
                    break;
                }
            }

            // Strategy 2: If no main content found, use body but filter out navigation
            if (!content) {
                const body = document.body.cloneNode(true);
                
                // Remove common non-content elements
                const elementsToRemove = [
                    'nav', 'header', 'footer', 'aside', 'script', 'style',
                    '.navigation', '.nav', '.menu', '.sidebar', '.advertisement',
                    '.ads', '.ad', '.social', '.share', '.comments', '.related'
                ];
                
                elementsToRemove.forEach(selector => {
                    const elements = body.querySelectorAll(selector);
                    elements.forEach(el => el.remove());
                });

                content = body.textContent.trim();
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

    // Main scraping function
    async function scrapeAndSend() {
        console.log('🚀 Starting content scraping...');
        console.log('📍 Current URL:', window.location.href);
        console.log('📍 Current title:', document.title);
        
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
            return;
        }

        console.log(`✅ Scraped content: ${contentData.wordCount} words from ${contentData.url}`);
        console.log(`📄 Content preview: ${contentData.content.substring(0, 200)}...`);
        
        // Send to server
        const success = await sendToServer(contentData);
        if (success) {
            console.log('🎉 Content successfully sent to backend server');
        } else {
            console.error('💥 Failed to send content to backend server');
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
