# Web Crawler Application

A full-stack web crawler that discovers all pages on a domain and displays them with pagination, search, and CSV export.

## Features

- 🕷️ **Domain Crawling**: Enter any domain to discover all its pages
- 📊 **Pagination**: View results paginated by 1000 pages at a time
- 🔍 **Search**: Filter discovered pages by URL or title
- 📥 **CSV Export**: Download all discovered links as a CSV file
- ⏹️ **Stop Control**: Stop crawling at any time
- 📈 **Real-time Stats**: See pages found, queue size, and errors in real-time

## Quick Start

### Prerequisites
- Node.js 16+ installed on your machine

### Installation

1. Extract or copy all files to a folder
2. Open terminal in that folder
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open your browser to: `http://localhost:3001`

## Usage

1. Enter a domain name (e.g., `example.com` or `https://example.com`)
2. Click "Start Crawl"
3. Watch as pages are discovered in real-time
4. Use the search box to filter results
5. Navigate pages with pagination controls
6. Click "Download CSV" when finished to export all links

## Configuration

You can modify these settings in `server.js`:

- `maxPages`: Maximum pages to crawl (default: 10,000)
- `PORT`: Server port (default: 3001)
- Concurrent requests: Batch size for parallel fetching (default: 5)
- Request delay: Delay between batches (default: 100ms)

## Technical Details

### Backend (Node.js + Express)
- Express server with REST API
- Cheerio for HTML parsing
- node-fetch for HTTP requests
- Concurrent crawling with configurable batch size
- Session-based crawl management

### Frontend (React + Tailwind)
- Single-page React application
- Real-time status updates
- Responsive design with glass-morphism UI
- Client-side search and pagination

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/crawl` | Start a new crawl |
| GET | `/api/crawl/:id/status` | Get crawl status |
| GET | `/api/crawl/:id/pages` | Get paginated pages |
| GET | `/api/crawl/:id/download` | Download CSV |
| POST | `/api/crawl/:id/stop` | Stop crawling |

## Notes

- The crawler respects server responses and uses polite delays
- Non-HTML resources (images, PDFs, etc.) are skipped
- External domains are not crawled
- Sessions expire after 1 hour

## License

MIT License - Feel free to modify and use as needed!
