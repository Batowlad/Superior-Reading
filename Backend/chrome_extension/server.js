const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'scraped_data');
fs.ensureDirSync(dataDir);

// Configuration for automatic cleanup
const CLEANUP_CONFIG = {
    enabled: true,
    deleteAfterMinutes: 1, // Delete all files after 1 minute
    cleanupIntervalMinutes: 1 // Run cleanup every 1 minute
};

// Automatic cleanup function - deletes all files after 1 minute
async function cleanupOldFiles() {
    if (!CLEANUP_CONFIG.enabled) return;
    
    try {
        console.log('🧹 Starting automatic cleanup...');
        
        const files = await fs.readdir(dataDir);
        const jsonFiles = files.filter(file => 
            file.endsWith('.json') && 
            file !== 'scraping_summary.json'
        );
        
        if (jsonFiles.length === 0) {
            console.log('📁 No files to clean up');
            return;
        }
        
        // Get file stats and check age
        const fileStats = await Promise.all(
            jsonFiles.map(async (file) => {
                const filePath = path.join(dataDir, file);
                const stats = await fs.stat(filePath);
                return {
                    filename: file,
                    filePath: filePath,
                    created: stats.birthtime,
                    size: stats.size
                };
            })
        );
        
        const now = new Date();
        const maxAge = CLEANUP_CONFIG.deleteAfterMinutes * 60 * 1000; // Convert to milliseconds
        let deletedCount = 0;
        let deletedSize = 0;
        
        // Delete all files older than 1 minute
        for (const file of fileStats) {
            const age = now - file.created;
            if (age > maxAge) {
                await fs.remove(file.filePath);
                deletedCount++;
                deletedSize += file.size;
                console.log(`🗑️ Deleted file: ${file.filename} (${Math.round(age / 1000)}s old)`);
            }
        }
        
        if (deletedCount > 0) {
            console.log(`✅ Cleanup completed: Deleted ${deletedCount} files (${Math.round(deletedSize / 1024)}KB freed)`);
        } else {
            console.log('✅ Cleanup completed: No files needed deletion');
        }
        
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    }
}

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

// Manual cleanup endpoint
app.post('/api/cleanup', async (req, res) => {
    try {
        await cleanupOldFiles();
        res.json({ 
            success: true, 
            message: 'Cleanup completed successfully' 
        });
    } catch (error) {
        console.error('Error during manual cleanup:', error);
        res.status(500).json({ 
            error: 'Cleanup failed',
            message: error.message 
        });
    }
});

// Helper function to find the latest scraped file
async function findLatestScrapedFile() {
    try {
        const files = await fs.readdir(dataDir);
        const jsonFiles = files.filter(file => 
            file.endsWith('.json') && 
            file !== 'scraping_summary.json'
        );
        
        if (jsonFiles.length === 0) {
            return null;
        }
        
        // Get file stats and find the most recently modified
        const fileStats = await Promise.all(
            jsonFiles.map(async (file) => {
                const filePath = path.join(dataDir, file);
                const stats = await fs.stat(filePath);
                return {
                    filename: file,
                    filePath: filePath,
                    modified: stats.mtime
                };
            })
        );
        
        // Sort by modification time (most recent first)
        fileStats.sort((a, b) => b.modified - a.modified);
        
        return fileStats[0].filePath;
    } catch (error) {
        console.error('Error finding latest scraped file:', error);
        return null;
    }
}

// Get latest recommendations endpoint
app.get('/api/recommendations/latest', async (req, res) => {
    try {
        // Find the latest scraped file
        const latestFile = await findLatestScrapedFile();
        
        if (!latestFile) {
            return res.status(404).json({ 
                error: 'No scraped content found',
                message: 'Please scrape some content first before requesting recommendations'
            });
        }
        
        // Read the scraped content
        const scrapedData = await fs.readJson(latestFile);
        const content = scrapedData.content;
        
        if (!content || !content.trim()) {
            return res.status(400).json({ 
                error: 'No content in scraped file',
                message: 'The scraped file does not contain any content to analyze'
            });
        }
        
        // Path to the Python CLI script
        const pythonScriptPath = path.join(__dirname, '..', 'AI Agent', 'run_agent_cli.py');
        const pythonScriptDir = path.join(__dirname, '..', 'AI Agent');
        
        // Try to use venv Python interpreter, fallback to system python3
        const projectRoot = path.join(__dirname, '..', '..');
        const venvPython = process.platform === 'win32' 
            ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
            : path.join(projectRoot, '.venv', 'bin', 'python3');
        
        // Check if venv Python exists, otherwise use system python3
        let pythonCommand = 'python3';
        let pythonArgs = [pythonScriptPath];
        
        try {
            if (fs.existsSync(venvPython)) {
                pythonCommand = venvPython;
                console.log(`Using venv Python: ${pythonCommand}`);
            } else {
                console.log('Venv Python not found, using system python3');
            }
        } catch (err) {
            console.warn('Could not check for venv Python, using system python3:', err.message);
        }
        
        // Spawn Python process to run the agent
        return new Promise((resolve, reject) => {
            console.log(`🚀 Starting Python agent process...`);
            console.log(`   Command: ${pythonCommand}`);
            console.log(`   Script: ${pythonScriptPath}`);
            console.log(`   Content length: ${content.length} characters`);
            
            const pythonProcess = spawn(pythonCommand, pythonArgs, {
                cwd: pythonScriptDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env, // Pass through all environment variables (including .env)
                    PYTHONUNBUFFERED: '1' // Ensure Python output is not buffered
                }
            });
            
            let stdout = '';
            let stderr = '';
            
            // Set a timeout for the Python process (5 minutes)
            const timeout = setTimeout(() => {
                if (!pythonProcess.killed) {
                    console.error('⏱️ Python process timeout after 5 minutes');
                    pythonProcess.kill('SIGTERM');
                    res.status(500).json({ 
                        error: 'Python agent timeout',
                        message: 'The Python agent process took too long to complete (>5 minutes)'
                    });
                    resolve();
                }
            }, 5 * 60 * 1000);
            
            // Send content to Python process via stdin
            pythonProcess.stdin.write(content, 'utf8');
            pythonProcess.stdin.end();
            
            // Collect stdout
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            // Collect stderr
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            // Handle process completion
            pythonProcess.on('close', (code, signal) => {
                clearTimeout(timeout); // Clear the timeout
                
                if (code !== 0) {
                    console.error(`❌ Python process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`);
                    console.error('Python stderr:', stderr);
                    console.error('Python stdout (if any):', stdout);
                    
                    // Try to parse error from stdout if it's JSON
                    let errorDetails = stderr || 'Python agent process failed';
                    try {
                        const errorJson = JSON.parse(stdout);
                        if (errorJson.error) {
                            errorDetails = errorJson.error;
                        }
                    } catch (e) {
                        // Not JSON, use stderr or default message
                    }
                    
                    res.status(500).json({ 
                        error: 'Failed to generate recommendations',
                        message: errorDetails,
                        code: code,
                        signal: signal,
                        stderr: stderr.substring(0, 500), // Limit stderr length
                        hint: code === 127 ? 'Python interpreter not found. Make sure Python 3 and dependencies are installed.' : 
                              code === 1 ? 'Python script execution failed. Check dependencies and environment variables.' :
                              signal === 'SIGTERM' ? 'Process was terminated (likely timeout).' :
                              'Check Python script and dependencies.'
                    });
                    resolve(); // Resolve after sending error response
                    return;
                }
                
                try {
                    // Parse JSON response from Python
                    const result = JSON.parse(stdout);
                    
                    // Return the music_recommendations
                    console.log('✅ Successfully generated recommendations');
                    res.json({
                        success: true,
                        ...result,
                        sourceFile: path.basename(latestFile)
                    });
                    resolve(); // Resolve after sending success response
                } catch (parseError) {
                    console.error('❌ Error parsing Python output:', parseError);
                    console.error('Python stdout:', stdout);
                    console.error('Python stderr:', stderr);
                    res.status(500).json({ 
                        error: 'Failed to parse recommendations',
                        message: 'Invalid JSON response from Python agent',
                        details: parseError.message,
                        stdout: stdout.substring(0, 500), // Limit stdout length
                        stderr: stderr.substring(0, 500)  // Limit stderr length
                    });
                    resolve(); // Resolve after sending error response
                }
            });
            
            // Handle process errors
            pythonProcess.on('error', (error) => {
                console.error('Error spawning Python process:', error);
                res.status(500).json({ 
                    error: 'Failed to start Python agent',
                    message: error.message,
                    hint: 'Make sure Python 3 is installed and accessible as "python3"'
                });
                resolve(); // Resolve after sending error response
            });
        });
        
    } catch (error) {
        console.error('Error in recommendations endpoint:', error);
        res.status(500).json({ 
            error: 'Internal server error',
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
    console.log('   POST /api/cleanup - Manual cleanup trigger');
    console.log('   GET  /api/recommendations/latest - Get latest music recommendations');
    console.log('');
    console.log('🧹 Automatic cleanup:');
    console.log(`   - Enabled: ${CLEANUP_CONFIG.enabled}`);
    console.log(`   - Delete after: ${CLEANUP_CONFIG.deleteAfterMinutes} minute(s)`);
    console.log(`   - Check interval: ${CLEANUP_CONFIG.cleanupIntervalMinutes} minute(s)`);
    console.log('');
    console.log('💡 Make sure to install dependencies: npm install');
    console.log('💡 Start the server: npm start');
    
    // Start automatic cleanup timer
    if (CLEANUP_CONFIG.enabled) {
        // Run cleanup immediately on startup
        setTimeout(cleanupOldFiles, 10000); // Wait 10 seconds after startup
        
        // Set up recurring cleanup every minute
        setInterval(cleanupOldFiles, CLEANUP_CONFIG.cleanupIntervalMinutes * 60 * 1000);
        console.log('⏰ Automatic cleanup timer started - files will be deleted after 1 minute');
    }
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
