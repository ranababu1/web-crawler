const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { URL } = require('url');
const os = require('os');
const { getRandomUserAgent, randomDelay } = require('../utils/helpers');
const { httpAgent, httpsAgent } = require('../config/agents');

class WebCrawler {
  constructor(domain, maxPages = 10000) {
    this.domain = domain;
    this.baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    this.maxPages = maxPages;
    this.visited = new Set();
    this.toVisit = [];
    this.pages = [];
    this.isRunning = false;
    this.errors = [];
    this.failedPages = new Map(); // url -> {count, lastError, lastAttempt}
    this.maxRetries = 3;
    this.requestCount = 0;
    this.lastRequestTime = Date.now();
  }

  normalizeUrl(url) {
    try {
      const parsed = new URL(url, this.baseUrl);
      // Remove hash, query params, and trailing slash for primary pages only
      parsed.hash = '';
      parsed.search = ''; // Remove all query parameters
      let normalized = parsed.href;
      if (normalized.endsWith('/') && normalized !== this.baseUrl + '/') {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return null;
    }
  }

  isSameDomain(url) {
    try {
      const parsed = new URL(url, this.baseUrl);
      const baseParsed = new URL(this.baseUrl);
      // Only allow exact hostname match (no subdomains)
      return parsed.hostname === baseParsed.hostname;
    } catch {
      return false;
    }
  }

  isValidUrl(url) {
    if (!url) return false;
    // Skip non-page resources
    const skipExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
                           '.css', '.js', '.pdf', '.doc', '.docx', '.xls', '.xlsx',
                           '.zip', '.rar', '.tar', '.gz', '.mp3', '.mp4', '.avi',
                           '.mov', '.wmv', '.flv', '.woff', '.woff2', '.ttf', '.eot'];
    const lowerUrl = url.toLowerCase();
    return !skipExtensions.some(ext => lowerUrl.endsWith(ext));
  }

  async fetchPage(url) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      // Add small random delay to avoid request pattern detection
      await randomDelay(10, 50);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'DNT': '1',
        },
        redirect: 'follow',
        compress: true,
        agent: url.startsWith('https') ? httpsAgent : httpAgent,
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        const statusMessages = {
          400: 'Bad Request',
          401: 'Unauthorized',
          403: 'Forbidden',
          404: 'Not Found',
          500: 'Internal Server Error',
          502: 'Bad Gateway',
          503: 'Service Unavailable',
          504: 'Gateway Timeout'
        };
        const message = statusMessages[response.status] || 'HTTP Error';
        throw new Error(`${response.status} ${message}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        return { url, title: url, links: [], status: 'non-html' };
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Get page title
      const title = $('title').first().text().trim() || url;
      
      // Extract all links
      const links = [];
      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          const normalizedUrl = this.normalizeUrl(href);
          if (normalizedUrl && this.isSameDomain(normalizedUrl) && this.isValidUrl(normalizedUrl)) {
            links.push(normalizedUrl);
          }
        }
      });
      
      return { url, title, links, status: 'success' };
    } catch (error) {
      let errorReason = error.message;
      
      // Categorize errors with clear reasons
      if (error.name === 'AbortError') {
        errorReason = 'Timeout - Page took longer than 5 seconds to respond';
      } else if (error.message.includes('ENOTFOUND')) {
        errorReason = 'DNS Error - Domain not found';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorReason = 'Connection Refused - Server not accepting connections';
      } else if (error.message.includes('ETIMEDOUT')) {
        errorReason = 'Connection Timeout - Could not connect to server';
      } else if (error.message.includes('ECONNRESET')) {
        errorReason = 'Connection Reset - Server closed connection';
      } else if (error.message.includes('certificate')) {
        errorReason = 'SSL Certificate Error';
      }
      
      return { url, title: url, links: [], status: 'error', error: errorReason, shouldRetry: true };
    }
  }

  async crawl(onProgress) {
    this.isRunning = true;
    const startUrl = this.normalizeUrl(this.baseUrl);
    this.toVisit.push(startUrl);
    
    // Aggressive concurrency for high-RAM systems (96GB+)
    const cpuCount = os.cpus().length;
    const totalMemoryGB = os.totalmem() / (1024 ** 3);
    
    // Scale concurrency based on available resources
    // For 96GB+ RAM: 200-400+ concurrent connections
    let concurrency;
    if (totalMemoryGB >= 64) {
      concurrency = cpuCount * 25; // Aggressive scaling for high-RAM systems
    } else if (totalMemoryGB >= 32) {
      concurrency = cpuCount * 15;
    } else {
      concurrency = cpuCount * 10;
    }
    concurrency = Math.max(concurrency, 200); // Minimum 200 for high-end systems
    
    // Adaptive rate limiting
    let consecutiveErrors = 0;
    let dynamicConcurrency = concurrency;
    let backoffDelay = 0;
    
    console.log(`Starting crawl with concurrency: ${concurrency} (${cpuCount} CPU cores, ${totalMemoryGB.toFixed(1)}GB RAM)`);
    
    while (this.toVisit.length > 0 && this.pages.length < this.maxPages && this.isRunning) {
      // Apply backoff delay if getting rate limited
      if (backoffDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
      
      // Process massive batches for maximum speed
      const batch = [];
      while (batch.length < dynamicConcurrency && this.toVisit.length > 0) {
        const url = this.toVisit.shift();
        if (!this.visited.has(url)) {
          this.visited.add(url);
          batch.push(url);
        }
      }
      
      if (batch.length === 0) continue;
      
      const results = await Promise.allSettled(batch.map(url => this.fetchPage(url)));
      
      let batchErrors = 0;
      let rateLimitDetected = false;
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const pageData = result.value;
          if (pageData.status === 'success' || pageData.status === 'non-html') {
            this.pages.push({
              url: pageData.url,
              title: pageData.title,
              status: pageData.status,
              discoveredAt: new Date().toISOString()
            });
            
            // Add new links to queue
            for (const link of pageData.links) {
              if (!this.visited.has(link) && !this.toVisit.includes(link)) {
                this.toVisit.push(link);
              }
            }
          } else if (pageData.status === 'error') {
            batchErrors++;
            // Detect rate limiting (429, 503, or too many errors)
            if (pageData.error && (pageData.error.includes('429') || pageData.error.includes('503') || pageData.error.includes('Too Many Requests'))) {
              rateLimitDetected = true;
            }
          }
        } else {
          batchErrors++;
        }
      }
      
      // Adaptive rate limiting: back off if too many errors
      const errorRate = batchErrors / batch.length;
      if (rateLimitDetected || errorRate > 0.3) {
        consecutiveErrors++;
        dynamicConcurrency = Math.max(Math.floor(dynamicConcurrency * 0.5), 10); // Reduce concurrency by 50%
        backoffDelay = Math.min(consecutiveErrors * 1000, 5000); // Up to 5 second delay
        console.log(`⚠️  Rate limiting detected. Reducing concurrency to ${dynamicConcurrency}, adding ${backoffDelay}ms delay`);
      } else if (errorRate < 0.1) {
        // Gradually recover concurrency if things are going well
        consecutiveErrors = Math.max(0, consecutiveErrors - 1);
        if (dynamicConcurrency < concurrency) {
          dynamicConcurrency = Math.min(Math.floor(dynamicConcurrency * 1.2), concurrency);
          backoffDelay = Math.max(0, backoffDelay - 500);
        }
      }
      
      if (onProgress) {
        onProgress({
          pagesFound: this.pages.length,
          pagesQueued: this.toVisit.length,
          errors: this.errors.length
        });
      }
      
      // No delay for maximum speed
    }
    
    // Retry failed pages up to 3 times with 5-second gaps
    await this.retryFailedPages(onProgress);
    
    this.isRunning = false;
    return this.pages;
  }

  async retryFailedPages(onProgress) {
    const failedUrls = this.pages
      .filter(p => p.status === 'error')
      .map(p => p.url);
    
    if (failedUrls.length === 0) return;
    
    console.log(`Retrying ${failedUrls.length} failed pages...`);
    
    for (let retryCount = 1; retryCount <= this.maxRetries; retryCount++) {
      if (!this.isRunning) break;
      
      const urlsToRetry = [];
      for (const url of failedUrls) {
        const failureInfo = this.failedPages.get(url) || { count: 0, lastAttempt: 0 };
        
        // Only retry if we haven't exceeded max retries and enough time has passed
        if (failureInfo.count < retryCount && Date.now() - failureInfo.lastAttempt >= 5000) {
          urlsToRetry.push(url);
        }
      }
      
      if (urlsToRetry.length === 0) break;
      
      console.log(`Retry attempt ${retryCount}/${this.maxRetries} for ${urlsToRetry.length} pages`);
      
      // Process retries in larger batches for high-speed systems
      const retryBatchSize = 50; // Increased from 10
      for (let i = 0; i < urlsToRetry.length; i += retryBatchSize) {
        if (!this.isRunning) break;
        
        const batch = urlsToRetry.slice(i, i + retryBatchSize);
        const results = await Promise.allSettled(batch.map(url => this.fetchPage(url)));
        
        for (let j = 0; j < results.length; j++) {
          const url = batch[j];
          const result = results[j];
          
          // Update failure tracking
          this.failedPages.set(url, {
            count: retryCount,
            lastAttempt: Date.now(),
            lastError: result.status === 'fulfilled' ? result.value.error : 'Unknown error'
          });
          
          if (result.status === 'fulfilled' && result.value.status === 'success') {
            // Update the page entry from error to success
            const pageIndex = this.pages.findIndex(p => p.url === url);
            if (pageIndex !== -1) {
              this.pages[pageIndex] = {
                url: result.value.url,
                title: result.value.title,
                status: 'success',
                discoveredAt: this.pages[pageIndex].discoveredAt,
                retriedAt: new Date().toISOString(),
                retryCount: retryCount
              };
              
              // Add newly discovered links
              for (const link of result.value.links) {
                if (!this.visited.has(link) && !this.toVisit.includes(link)) {
                  this.visited.add(link);
                  this.toVisit.push(link);
                }
              }
            }
          } else if (result.status === 'fulfilled') {
            // Update error information
            const pageIndex = this.pages.findIndex(p => p.url === url);
            if (pageIndex !== -1) {
              this.pages[pageIndex].error = result.value.error;
              this.pages[pageIndex].retryCount = retryCount;
            }
          }
        }
        
        if (onProgress) {
          onProgress({
            pagesFound: this.pages.length,
            pagesQueued: this.toVisit.length,
            errors: this.pages.filter(p => p.status === 'error').length
          });
        }
        
        // 5-second gap between retry batches
        if (i + retryBatchSize < urlsToRetry.length) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      // Gap between retry attempts
      if (retryCount < this.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Log final errors
    const finalErrors = this.pages.filter(p => p.status === 'error');
    if (finalErrors.length > 0) {
      console.log(`${finalErrors.length} pages still failed after ${this.maxRetries} retries`);
      this.errors = finalErrors.map(p => ({ url: p.url, error: p.error, retries: p.retryCount || 0 }));
    }
  }

  stop() {
    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      pagesFound: this.pages.length,
      pagesQueued: this.toVisit.length,
      errors: this.errors.length
    };
  }
}

module.exports = WebCrawler;
