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
  const filter = req.query.filter || 'all'; // 'dead', 'healthy', 'all'
  
  let filteredPages = crawler.pages;
  
  // Apply link status filter
  if (filter === 'dead') {
    // Dead links: errors with 404 or any error status
    filteredPages = filteredPages.filter(p => p.status === 'error');
  } else if (filter === 'healthy') {
    // Healthy links: success status
    filteredPages = filteredPages.filter(p => p.status === 'success');
  }
  // 'all' shows everything
  
  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase();
    filteredPages = filteredPages.filter(p => 
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
  
  const filter = req.query.filter || 'all'; // 'dead', 'healthy', 'all'
  
  let filteredPages = crawler.pages;
  
  // Apply link status filter
  if (filter === 'dead') {
    filteredPages = filteredPages.filter(p => p.status === 'error');
  } else if (filter === 'healthy') {
    filteredPages = filteredPages.filter(p => p.status === 'success');
  }
  
  const csvHeader = 'URL,Title,Status,Error,Retry Count,Discovered At\n';
  const csvRows = filteredPages.map(p => {
    const escapedTitle = `"${(p.title || '').replace(/"/g, '""')}"`;
    const escapedUrl = `"${p.url.replace(/"/g, '""')}"`;
    const escapedError = p.error ? `"${p.error.replace(/"/g, '""')}"` : '';
    const retryCount = p.retryCount || 0;
    return `${escapedUrl},${escapedTitle},${p.status},${escapedError},${retryCount},${p.discoveredAt}`;
  }).join('\n');
  
  const csv = csvHeader + csvRows;
  
  const filterSuffix = filter === 'dead' ? '-dead-links' : filter === 'healthy' ? '-healthy-links' : '-all';
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="crawl-results-${req.params.sessionId}${filterSuffix}.csv"`);
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

// Generate sitemap
router.get('/crawl/:sessionId/sitemap', (req, res) => {
  const crawler = getSession(req.params.sessionId);
  if (!crawler) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const type = req.query.type || 'all'; // 'all' or 'healthy'
  const priority = req.query.priority || 'manual'; // 'manual' or 'intelligent'
  
  let filteredPages = crawler.pages;
  
  // Filter by type
  if (type === 'healthy') {
    filteredPages = filteredPages.filter(p => p.status === 'success');
  }
  
  // Calculate priority for each URL
  const getPriority = (url) => {
    if (priority === 'manual') {
      return 0.5;
    }
    
    // Intelligent priority based on URL patterns
    const urlLower = url.toLowerCase();
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const depth = pathname.split('/').filter(Boolean).length;
    
    // Homepage gets highest priority
    if (pathname === '/' || pathname === '') {
      return 1.0;
    }
    
    // Important sections get high priority
    if (urlLower.match(/\/(product|item|shop|category|collection|service)[s]?[\/-]/i)) {
      return 0.9;
    }
    
    // Blog/article pages
    if (urlLower.match(/\/(blog|article|news|post)[s]?[\/-]/i)) {
      return 0.7;
    }
    
    // About/contact pages
    if (urlLower.match(/\/(about|contact|help|support|faq)[\/-]?/i)) {
      return 0.6;
    }
    
    // Calculate based on depth (shallower = higher priority)
    if (depth === 1) return 0.8;
    if (depth === 2) return 0.6;
    if (depth === 3) return 0.4;
    return 0.3;
  };
  
  // Build sitemap XML
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  const xmlFooter = '</urlset>';
  
  const xmlUrls = filteredPages.map(page => {
    const priorityValue = getPriority(page.url);
    const lastmod = new Date(page.discoveredAt || Date.now()).toISOString().split('T')[0];
    
    return `  <url>
    <loc>${escapeXml(page.url)}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priorityValue.toFixed(1)}</priority>
  </url>`;
  }).join('\n');
  
  const xml = xmlHeader + xmlUrls + '\n' + xmlFooter;
  
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="sitemap-${type}-${priority}.xml"`);
  res.send(xml);
});

// Helper function to escape XML special characters
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

module.exports = router;
