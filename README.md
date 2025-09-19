# Superior Reading - Chrome Extension

A Chrome extension that automatically scrapes the main content from web pages and sends it to your local PC without any human interaction.

## Features

- 🤖 **Automatic Content Scraping**: Automatically extracts main content from any webpage
- 📡 **Real-time Data Transfer**: Sends scraped content to your local server instantly
- 🎯 **Smart Content Detection**: Uses multiple strategies to identify the main content area
- 🚫 **No Human Interaction**: Fully automated operation
- 📊 **Content Analytics**: Tracks word count, domain, and scraping statistics
- 💾 **Local Storage**: Saves all scraped content to your PC
- 🎨 **Modern UI**: Clean and intuitive popup interface

## Project Structure

```
Superior Reading/
├── Frontend/
│   └── chrome_extension/
│       ├── manifest.json          # Extension manifest
│       ├── content.js             # Content scraping script
│       ├── background.js          # Background service worker
│       ├── popup.html             # Extension popup UI
│       ├── popup.js               # Popup functionality
│       └── icons/
│           └── book_icon.png      # Extension icons
├── Backend/
│   └── chrome_extension/
│       ├── package.json           # Node.js dependencies
│       ├── server.js              # Express server
│       └── scraped_data/          # Directory for saved content (auto-created)
└── README.md
```

## Setup Instructions

### 1. Backend Server Setup

1. **Navigate to the backend directory:**
   ```bash
   cd "Backend\chrome_extension"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   
   The server will start on `http://localhost:3000`

### 2. Chrome Extension Setup

1. **Open Chrome and go to Extensions:**
   - Open Chrome browser
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)

2. **Load the extension:**
   - Click "Load unpacked"
   - Navigate to and select the `Frontend\chrome_extension` folder
   - The extension should now appear in your extensions list

3. **Pin the extension (optional):**
   - Click the puzzle piece icon in Chrome toolbar
   - Find "Superior Reading - Content Scraper"
   - Click the pin icon to pin it to your toolbar

### 3. Usage

1. **Automatic Mode (Default):**
   - The extension automatically scrapes content from any webpage you visit
   - Content is sent to your local server without any interaction needed
   - Check the backend console to see scraped content being received

2. **Manual Mode:**
   - Click the extension icon in your toolbar
   - Click "Scrape Current Page" to manually scrape the current page
   - Click "Test Connection" to verify the backend server is running

3. **View Scraped Data:**
   - All scraped content is saved in `Backend\chrome_extension\scraped_data\`
   - Files are named by domain, date, and time
   - A summary file tracks all scraping activity

## API Endpoints

The backend server provides several endpoints:

- `GET /api/health` - Health check
- `POST /api/scrape` - Receive scraped content (used by extension)
- `GET /api/summary` - Get scraping summary
- `GET /api/files` - List all scraped files
- `GET /api/content/:filename` - Get specific content
- `DELETE /api/content/:filename` - Delete specific file

## Configuration

### Content Scraping Settings

The extension uses smart content detection with multiple strategies:

1. **Main Content Selectors**: Looks for common main content areas
2. **Body Filtering**: Removes navigation, ads, and sidebar content
3. **Content Cleaning**: Removes extra whitespace and formatting

### Auto-scrape Settings

- **Default**: Automatically scrapes content 2 seconds after page load
- **Manual Override**: Can be disabled in the popup interface
- **Smart Detection**: Only scrapes pages with meaningful content

## Troubleshooting

### Extension Not Working
1. Check that the backend server is running on `http://localhost:3000`
2. Verify the extension is loaded and enabled
3. Check browser console for any error messages
4. Try the "Test Connection" button in the popup

### Backend Server Issues
1. Ensure Node.js is installed
2. Run `npm install` in the backend directory
3. Check that port 3000 is not being used by another application
4. Verify all dependencies are installed correctly

### Content Not Being Scraped
1. Some websites may block content scraping
2. Check if the website has anti-bot protection
3. Try refreshing the page and waiting a few seconds
4. Use the manual scrape button as a test

## Data Storage

All scraped content is stored locally in JSON format with the following structure:

```json
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "content": "Main article content...",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "domain": "example.com",
  "wordCount": 1500,
  "scrapedAt": "2024-01-01T12:00:00.000Z",
  "fileSize": 50000
}
```
### Using the AI Agent to read the latest scraped content

The Python module at `Backend/AI Agent/ai_agent.py` exposes a variable `text` that automatically loads the `content` from the most recently modified scraped JSON file in `Backend/chrome_extension/scraped_data/` whose filename matches `_YYYY-MM-DD_HH-MM-SS.json` (optionally prefixed with `@`).

Usage example:

```python
from pathlib import Path
from Backend.AI Agent.ai_agent import text

print(text)  # Prints the latest scraped page content or an empty string if none
```

Notes:
- The agent only reads local files and does not modify them.
- If the directory does not exist or no matching files are found, `text` will be an empty string.

## Security Notes

- The extension only runs on web pages (not chrome:// pages)
- All data is stored locally on your PC
- No data is sent to external servers
- The backend server only accepts connections from localhost

## Development

### Running in Development Mode

1. **Backend with auto-restart:**
   ```bash
   cd "Backend\chrome_extension"
   npm run dev
   ```

2. **Extension reload:**
   - Make changes to extension files
   - Go to `chrome://extensions/`
   - Click the refresh icon on the extension

### Adding New Features

- **Content Script**: Modify `Frontend\chrome_extension\content.js`
- **Background Script**: Modify `Frontend\chrome_extension\background.js`
- **Popup UI**: Modify `Frontend\chrome_extension\popup.html` and `popup.js`
- **Backend API**: Modify `Backend\chrome_extension\server.js`

## License

MIT License - Feel free to modify and distribute as needed.

## Support

If you encounter any issues:
1. Check the browser console for error messages
2. Verify the backend server is running
3. Test the connection using the popup interface
4. Check the scraped_data directory for saved content
