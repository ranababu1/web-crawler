require('dotenv').config();
const app = require('./app');
const { startSessionCleanup } = require('./services/sessionManager');
const emailService = require('./services/emailService');

const PORT = process.env.PORT || 3001;

// Start session cleanup service
startSessionCleanup();

// Configure email service if credentials are provided
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  emailService.configure({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  });
}

app.listen(PORT, () => {
  console.log(`Web Crawler Server running on http://localhost:${PORT}`);
  console.log(`- Homepage: http://localhost:${PORT}`);
  console.log(`- Previous Crawls: http://localhost:${PORT}/previous-crawls.html`);
  console.log(`- Email Reports: ${emailService.isConfigured ? '✅ Enabled' : '⚠️  Not configured'}`);
});
