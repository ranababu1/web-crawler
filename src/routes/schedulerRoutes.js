const express = require('express');
const router = express.Router();
const schedulerService = require('../services/schedulerService');
// Email service temporarily disabled
// const emailService = require('../services/emailService');

// Get all scheduled jobs
router.get('/jobs', (req, res) => {
  const jobs = schedulerService.getAllJobs();
  res.json({ jobs });
});

// Get specific job
router.get('/jobs/:id', (req, res) => {
  const job = schedulerService.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Create new scheduled job
router.post('/jobs', (req, res) => {
  try {
    const job = schedulerService.scheduleJob(req.body);
    res.json({ message: 'Job scheduled successfully', job });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update scheduled job
router.put('/jobs/:id', (req, res) => {
  try {
    const job = schedulerService.updateJob(req.params.id, req.body);
    res.json({ message: 'Job updated successfully', job });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete scheduled job
router.delete('/jobs/:id', (req, res) => {
  try {
    schedulerService.stopJob(req.params.id);
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get job history
router.get('/history', (req, res) => {
  const history = schedulerService.getHistory();
  res.json({ history });
});

// Email endpoints temporarily disabled - uncomment when ready to use
// Configure email settings
// router.post('/email/configure', (req, res) => {
//   try {
//     emailService.configure(req.body);
//     res.json({ message: 'Email service configured successfully' });
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// Test email connection
// router.post('/email/test', async (req, res) => {
//   try {
//     await emailService.testConnection();
//     res.json({ message: 'Email connection successful' });
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// Send test email
// router.post('/email/send-test', async (req, res) => {
//   const { recipient } = req.body;
//   if (!recipient) {
//     return res.status(400).json({ error: 'Recipient email is required' });
//   }

//   try {
//     await emailService.sendCrawlReport(recipient, {
//       domain: 'example.com',
//       pagesFound: 42,
//       errors: 3,
//       startTime: new Date(Date.now() - 120000).toISOString(),
//       endTime: new Date().toISOString(),
//       sessionId: 'test-session-123',
//       pages: [
//         { url: 'https://example.com/', status: 'success', title: 'Example' },
//         { url: 'https://example.com/about', status: 'success', title: 'About' },
//         { url: 'https://example.com/error', status: 'error', error: '404 Not Found' }
//       ]
//     });
//     res.json({ message: 'Test email sent successfully' });
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

module.exports = router;
