const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'scraped_data');
fs.ensureDirSync(dataDir);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Superior Reading Backend Server is running'
    });
});

// Main endpoint to receive scraped content
app.post('/api/scrape', async (req, res) => {
    try {
        const { url, title, content, timestamp, domain, wordCount } = req.body;
        
        // Validate required fields
        if (!url || !content) {
            return res.status(400).json({ 
                error: 'Missing required fields: url and content are required' 
            });
        }

        // Create filename based on domain and timestamp
        const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
        const dateStr = moment().format('YYYY-MM-DD');
        const timeStr = moment().format('HH-mm-ss');
        const filename = `${safeDomain}_${dateStr}_${timeStr}.json`;
        
        // Prepare data to save
        const scrapedData = {
            url,
            title: title || 'Untitled',
            content,
            timestamp: timestamp || new Date().toISOString(),
            domain: domain || new URL(url).hostname,
            wordCount: wordCount || content.split(/\s+/).length,
            scrapedAt: new Date().toISOString(),
            fileSize: JSON.stringify({ content }).length
        };

        // Save to file
        const filePath = path.join(dataDir, filename);
        await fs.writeJson(filePath, scrapedData, { spaces: 2 });

        // Also save a summary entry
        const summaryFile = path.join(dataDir, 'scraping_summary.json');
        let summary = [];
        
        if (await fs.pathExists(summaryFile)) {
            summary = await fs.readJson(summaryFile);
        }
        
        summary.push({
            filename,
            url,
            title: scrapedData.title,
            domain: scrapedData.domain,
            wordCount: scrapedData.wordCount,
            scrapedAt: scrapedData.scrapedAt,
            fileSize: scrapedData.fileSize
        });

        // Keep only last 100 entries in summary
        if (summary.length > 100) {
            summary = summary.slice(-100);
        }

        await fs.writeJson(summaryFile, summary, { spaces: 2 });

        console.log(`✅ Content scraped and saved: ${filename}`);
        console.log(`   URL: ${url}`);
        console.log(`   Title: ${title}`);
        console.log(`   Word Count: ${wordCount}`);
        console.log(`   Domain: ${domain}`);

        res.json({ 
            success: true, 
            message: 'Content saved successfully',
            filename,
            wordCount: scrapedData.wordCount
        });

    } catch (error) {
        console.error('❌ Error processing scraped content:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Get scraping summary
app.get('/api/summary', async (req, res) => {
    try {
        const summaryFile = path.join(dataDir, 'scraping_summary.json');
        
        if (await fs.pathExists(summaryFile)) {
            const summary = await fs.readJson(summaryFile);
            res.json({ 
                success: true, 
                summary,
                totalEntries: summary.length 
            });
        } else {
            res.json({ 
                success: true, 
                summary: [], 
                totalEntries: 0 
            });
        }
    } catch (error) {
        console.error('Error reading summary:', error);
        res.status(500).json({ 
            error: 'Failed to read summary',
            message: error.message 
        });
    }
});
//Test
// Get specific scraped content
app.get('/api/content/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(dataDir, filename);
        
        if (await fs.pathExists(filePath)) {
            const content = await fs.readJson(filePath);
            res.json({ success: true, content });
        } else {
            res.status(404).json({ 
                error: 'File not found',
                filename 
            });
        }
    } catch (error) {
        console.error('Error reading content file:', error); 
        res.status(500).json({ 
            error: 'Failed to read content file',
            message: error.message 
        });
    }
});

// List all scraped files
app.get('/api/files', async (req, res) => {
    try {
        const files = await fs.readdir(dataDir);
        const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'scraping_summary.json');
        
        const fileList = await Promise.all(
            jsonFiles.map(async (file) => {
                const filePath = path.join(dataDir, file);
                const stats = await fs.stat(filePath);
                return {
                    filename: file,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            })
        );

        res.json({ 
            success: true, 
            files: fileList.sort((a, b) => b.created - a.created) 
        });
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ 
            error: 'Failed to list files',
            message: error.message 
        });
    }
});

// Delete specific file
app.delete('/api/content/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(dataDir, filename);
        
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            console.log(`🗑️ Deleted file: ${filename}`);
            res.json({ success: true, message: 'File deleted successfully' });
        } else {
            res.status(404).json({ 
                error: 'File not found',
                filename 
            });
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ 
            error: 'Failed to delete file',
            message: error.message 
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Superior Reading Backend Server started');
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log(`📁 Data will be saved to: ${dataDir}`);
    console.log('🔧 Available endpoints:');
    console.log('   GET  /api/health - Health check');
    console.log('   POST /api/scrape - Receive scraped content');
    console.log('   GET  /api/summary - Get scraping summary');
    console.log('   GET  /api/files - List all scraped files');
    console.log('   GET  /api/content/:filename - Get specific content');
    console.log('   DELETE /api/content/:filename - Delete specific file');
    console.log('');
    console.log('💡 Make sure to install dependencies: npm install');
    console.log('💡 Start the server: npm start');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});
