const express = require('express');
const router = express.Router();
const WebCrawler = require('../crawler/WebCrawler');
const { generateSessionId, getSession, setSession } = require('../services/sessionManager');

// Start crawling
router.post('/crawl', async (req, res) => {
  const { domain, maxPages = 10000 } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  const sessionId = generateSessionId();
  const crawler = new WebCrawler(domain, maxPages);
  setSession(sessionId, crawler);
  
  // Start crawling in background
  crawler.crawl((progress) => {
    // Progress is tracked internally
  }).then(() => {
    console.log(`Crawl completed for ${domain}: ${crawler.pages.length} pages found`);
  }).catch(err => {
    console.error(`Crawl error for ${domain}:`, err);
  });
  
  res.json({ sessionId, message: 'Crawl started' });
});

// Get crawl status
router.get('/crawl/:sessionId/status', (req, res) => {
  const crawler = getSession(req.params.sessionId);
  if (!crawler) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(crawler.getStatus());
});

// Get pages (paginated)
router.get('/crawl/:sessionId/pages', (req, res) => {
  const crawler = getSession(req.params.sessionId);
  if (!crawler) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 1000;
  const search = req.query.search || '';
  
  let filteredPages = crawler.pages;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredPages = crawler.pages.filter(p => 
      p.url.toLowerCase().includes(searchLower) || 
      p.title.toLowerCase().includes(searchLower)
    );
  }
  
  const totalPages = Math.ceil(filteredPages.length / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedPages = filteredPages.slice(startIndex, endIndex);
  
  res.json({
    pages: paginatedPages,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: filteredPages.length,
      itemsPerPage: limit
    }
  });
});

// Download CSV
router.get('/crawl/:sessionId/download', (req, res) => {
  const crawler = getSession(req.params.sessionId);
  if (!crawler) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const csvHeader = 'URL,Title,Status,Error,Retry Count,Discovered At\n';
  const csvRows = crawler.pages.map(p => {
    const escapedTitle = `"${(p.title || '').replace(/"/g, '""')}"`;
    const escapedUrl = `"${p.url.replace(/"/g, '""')}"`;
    const escapedError = p.error ? `"${p.error.replace(/"/g, '""')}"` : '';
    const retryCount = p.retryCount || 0;
    return `${escapedUrl},${escapedTitle},${p.status},${escapedError},${retryCount},${p.discoveredAt}`;
  }).join('\n');
  
  const csv = csvHeader + csvRows;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="crawl-results-${req.params.sessionId}.csv"`);
  res.send(csv);
});

// Stop crawling
router.post('/crawl/:sessionId/stop', (req, res) => {
  const crawler = getSession(req.params.sessionId);
  if (!crawler) {
    return res.status(404).json({ error: 'Session not found' });
  }
  crawler.stop();
  res.json({ message: 'Crawl stopped' });
});

module.exports = router;
