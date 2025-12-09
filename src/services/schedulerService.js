const cron = require('node-cron');
const WebCrawler = require('../crawler/WebCrawler');
const emailService = require('./emailService');
const { generateSessionId, setSession } = require('./sessionManager');

class SchedulerService {
  constructor() {
    this.scheduledJobs = new Map();
    this.jobHistory = [];
  }

  // Schedule a crawl with cron syntax
  scheduleJob(jobConfig) {
    const { 
      id, 
      domain, 
      schedule, 
      maxPages = 10000, 
      emailRecipients = [],
      enabled = true 
    } = jobConfig;

    if (!id || !domain || !schedule) {
      throw new Error('Job id, domain, and schedule are required');
    }

    // Validate cron expression
    if (!cron.validate(schedule)) {
      throw new Error('Invalid cron schedule format');
    }

    // Stop existing job if any
    if (this.scheduledJobs.has(id)) {
      this.stopJob(id);
    }

    const job = {
      id,
      domain,
      schedule,
      maxPages,
      emailRecipients,
      enabled,
      task: null,
      lastRun: null,
      nextRun: null,
      status: 'scheduled'
    };

    if (enabled) {
      job.task = cron.schedule(schedule, async () => {
        await this.executeCrawl(job);
      });
      job.nextRun = this.getNextRunTime(schedule);
      console.log(`📅 Scheduled job "${id}" for ${domain} with schedule: ${schedule}`);
    }

    this.scheduledJobs.set(id, job);
    return job;
  }

  async executeCrawl(job) {
    console.log(`🚀 Starting scheduled crawl for ${job.domain}`);
    job.status = 'running';
    job.lastRun = new Date().toISOString();

    const sessionId = generateSessionId();
    const crawler = new WebCrawler(job.domain, job.maxPages);
    setSession(sessionId, crawler);

    const startTime = new Date().toISOString();

    try {
      await crawler.crawl(() => {
        // Progress tracking
      });

      const endTime = new Date().toISOString();
      job.status = 'completed';
      job.nextRun = this.getNextRunTime(job.schedule);

      // Add to history
      this.jobHistory.unshift({
        jobId: job.id,
        domain: job.domain,
        sessionId,
        startTime,
        endTime,
        pagesFound: crawler.pages.length,
        errors: crawler.errors.length,
        status: 'completed'
      });

      // Keep only last 50 history entries
      if (this.jobHistory.length > 50) {
        this.jobHistory = this.jobHistory.slice(0, 50);
      }

      console.log(`✅ Scheduled crawl completed for ${job.domain}: ${crawler.pages.length} pages`);

      // Send email report if recipients configured
      if (job.emailRecipients && job.emailRecipients.length > 0) {
        for (const recipient of job.emailRecipients) {
          try {
            await emailService.sendCrawlReport(recipient, {
              domain: job.domain,
              pagesFound: crawler.pages.length,
              errors: crawler.errors.length,
              startTime,
              endTime,
              sessionId,
              pages: crawler.pages
            });
          } catch (err) {
            console.error(`Failed to send email to ${recipient}:`, err.message);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Scheduled crawl failed for ${job.domain}:`, error.message);
      job.status = 'failed';
      job.nextRun = this.getNextRunTime(job.schedule);

      this.jobHistory.unshift({
        jobId: job.id,
        domain: job.domain,
        sessionId,
        startTime,
        endTime: new Date().toISOString(),
        pagesFound: 0,
        errors: 0,
        status: 'failed',
        error: error.message
      });
    }
  }

  stopJob(id) {
    const job = this.scheduledJobs.get(id);
    if (job && job.task) {
      job.task.stop();
      console.log(`⏸️  Stopped scheduled job: ${id}`);
    }
    this.scheduledJobs.delete(id);
  }

  stopAllJobs() {
    for (const [id, job] of this.scheduledJobs.entries()) {
      if (job.task) {
        job.task.stop();
      }
    }
    this.scheduledJobs.clear();
    console.log('⏸️  All scheduled jobs stopped');
  }

  getJob(id) {
    return this.scheduledJobs.get(id);
  }

  getAllJobs() {
    return Array.from(this.scheduledJobs.values()).map(job => ({
      id: job.id,
      domain: job.domain,
      schedule: job.schedule,
      maxPages: job.maxPages,
      emailRecipients: job.emailRecipients,
      enabled: job.enabled,
      status: job.status,
      lastRun: job.lastRun,
      nextRun: job.nextRun
    }));
  }

  getHistory() {
    return this.jobHistory;
  }

  updateJob(id, updates) {
    const job = this.scheduledJobs.get(id);
    if (!job) {
      throw new Error('Job not found');
    }

    // If schedule changed, reschedule
    if (updates.schedule && updates.schedule !== job.schedule) {
      if (!cron.validate(updates.schedule)) {
        throw new Error('Invalid cron schedule format');
      }
      if (job.task) {
        job.task.stop();
      }
      Object.assign(job, updates);
      if (job.enabled) {
        job.task = cron.schedule(job.schedule, async () => {
          await this.executeCrawl(job);
        });
        job.nextRun = this.getNextRunTime(job.schedule);
      }
    } else {
      Object.assign(job, updates);
    }

    this.scheduledJobs.set(id, job);
    return job;
  }

  getNextRunTime(schedule) {
    // Simple approximation - for exact calculation, would need more complex logic
    try {
      const parts = schedule.split(' ');
      if (parts.length === 5) {
        return 'Calculated based on cron expression';
      }
    } catch (e) {
      return null;
    }
    return null;
  }
}

module.exports = new SchedulerService();
