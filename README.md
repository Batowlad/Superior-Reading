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
- 🎵 **Spotify Integration**: AI-powered music recommendations based on scraped content with Spotify Premium playback

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
│   ├── chrome_extension/
│   │   ├── package.json           # Node.js dependencies
│   │   ├── server.js              # Express server
│   │   ├── preset_recommendations.json  # Preset music recommendations for testing
│   │   └── scraped_data/          # Directory for saved content (auto-created)
│   └── AI Agent/
│       ├── ai_agent.py            # AI agent for content analysis
│       ├── run_agent_cli.py       # CLI interface for AI agent
│       └── requirements.txt       # Python dependencies
└── README.md
```

## Setup Instructions

### Prerequisites: Python Virtual Environment (for AI Agent)

If you plan to use the AI Agent component, it's recommended to use a Python virtual environment to manage dependencies.

#### Creating a Virtual Environment

**On macOS/Linux:**
```bash
cd "Backend/AI Agent"
python3 -m venv venv
```

**On Windows:**
```bash
cd "Backend\AI Agent"
python -m venv venv
```

#### Activating a Virtual Environment

**On macOS/Linux:**
```bash
source venv/bin/activate
```

**On Windows:**
```bash
venv\Scripts\activate
```

After activation, you'll see `(venv)` at the beginning of your command prompt.

#### Installing Dependencies

Once the virtual environment is activated:
```bash
pip install -r requirements.txt
```

#### Deactivating a Virtual Environment

To exit the virtual environment when you're done:
```bash
deactivate
```

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
- `GET /api/recommendations/latest` - Get music recommendations for latest scraped content
- `GET /api/recommendations/latest?preset=true` - Get preset recommendations (test mode, no OpenAI tokens)

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

### Spotify Premium Playback Integration

The extension includes Spotify Premium playback integration that uses AI to generate music recommendations based on scraped content.

#### Prerequisites

- **Spotify Premium Account**: The Web Playback SDK requires a Spotify Premium subscription
- **Spotify Developer App**: You need to create a Spotify app to get a Client ID

#### Setting Up Spotify Developer App

1. **Create a Spotify App:**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Log in with your Spotify account
   - Click "Create an app"
   - Fill in the app details:
     - App name: "Superior Reading Extension" (or any name you prefer)
     - App description: "Chrome extension for content-based music recommendations"
     - Redirect URI: You'll add this in the next step
   - Accept the terms and click "Save"

2. **Get Your Client ID:**
   - After creating the app, you'll see your **Client ID**
   - Copy this Client ID

3. **Configure Redirect URI:**
   - In your Spotify app settings, click "Edit Settings"
   - You need to add a redirect URI for Chrome extensions
   - First, load the extension in Chrome (see Chrome Extension Setup section)
   - Open the extension popup and check the browser console, or:
   - The redirect URI format is: `https://<extension-id>.chromiumapp.org/`
   - To find your extension ID:
     - Go to `chrome://extensions/`
     - Find "Superior Reading - Content Scraper"
     - Copy the ID shown (e.g., `abcdefghijklmnopqrstuvwxyz123456`)
     - Your redirect URI will be: `https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/`
   - Add this exact URI to your Spotify app's "Redirect URIs" list
   - Click "Add" and then "Save"

4. **Configure the Extension:**
   - Open `Frontend/chrome_extension/spotify_auth.js`
   - Find the line: `clientId: '2d35b413966c45379815f8d6aa664e67'`
   - Replace the Client ID with your own Client ID from step 2
   - Save the file

#### Required Spotify Scopes

The extension requests the following scopes (configured automatically):
- `streaming` - Required for Web Playback SDK
- `user-modify-playback-state` - Control playback
- `user-read-playback-state` - Read current playback state
- `user-read-email` - Read user email (optional)
- `user-read-private` - Read user profile (optional)

#### Using Music Recommendations

1. **Scrape Content:**
   - Navigate to any webpage
   - The extension will automatically scrape the content, or click "Scrape Current Page"

2. **Get Recommendations:**
   - Click the "Play Recommendations" button in the extension popup
   - The extension will:
     - Fetch the latest scraped content
     - Send it to the AI agent for analysis
     - Generate music recommendations based on theme and mood
     - Search Spotify for matching tracks

3. **Connect to Spotify:**
   - If not already connected, click "Connect to Spotify" in the player section
   - Authorize the extension with your Spotify Premium account
   - The player will initialize automatically

4. **Play Music:**
   - Once recommendations are generated and you're connected to Spotify
   - The recommended tracks will start playing automatically
   - Use the player controls (play/pause, next, previous) to control playback

#### Test Mode (Preset Recommendations)

To test the extension without using OpenAI tokens, you can use preset recommendations:

1. **Enable Test Mode:**
   - Open the extension popup
   - In the settings section, toggle "Test Mode (Preset)" to ON
   - This will use preset recommendations instead of AI-generated ones

2. **Using Preset Recommendations:**
   - With test mode enabled, click "Play Recommendations"
   - The extension will fetch preset recommendations from `Backend/chrome_extension/preset_recommendations.json`
   - These include 5 classic tracks with valid Spotify IDs:
     - Bohemian Rhapsody - Queen
     - Stairway to Heaven - Led Zeppelin
     - Hotel California - Eagles
     - Comfortably Numb - Pink Floyd
     - The Sound of Silence - Simon & Garfunkel

3. **Customizing Preset Recommendations:**
   - Edit `Backend/chrome_extension/preset_recommendations.json`
   - Add or modify tracks with valid Spotify IDs
   - The file follows the same structure as AI-generated recommendations
   - Ensure each track has a `spotify_id` field for playback to work

**Note:** Test mode is useful for:
- Testing the extension without consuming OpenAI API tokens
- Verifying Spotify playback functionality
- Development and debugging

#### Troubleshooting Spotify Integration

- **"Authentication error"**: Check that your Client ID is correct in `spotify_auth.js`
- **"Redirect URI mismatch"**: Ensure the redirect URI in Spotify app matches exactly (including trailing slash)
- **"Account error"**: Verify you have a Spotify Premium subscription
- **"No tracks found"**: The AI may not have found matching Spotify tracks. Try scraping different content
- **"Device not found"**: The player may not be ready. Wait a few seconds and try again

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
