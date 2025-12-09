require('dotenv').config();
const app = require('./app');
const os = require('os');
const { startSessionCleanup } = require('./services/sessionManager');
// Email service temporarily disabled
// const emailService = require('./services/emailService');

const PORT = process.env.PORT || 3001;

// Start session cleanup service
startSessionCleanup();

// Email service disabled - uncomment when ready to use
// if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
//   emailService.configure({
//     host: process.env.SMTP_HOST,
//     port: process.env.SMTP_PORT,
//     secure: process.env.SMTP_SECURE === 'true',
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS
//   });
// }

app.listen(PORT, () => {
  const totalMemoryGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
  const cpuCount = os.cpus().length;
  
  console.log(`\n🚀 Web Crawler Server running on http://localhost:${PORT}`);
  console.log(`📊 System Resources:`);
  console.log(`   - CPU Cores: ${cpuCount}`);
  console.log(`   - Total RAM: ${totalMemoryGB}GB`);
  console.log(`   - Concurrency: ${totalMemoryGB < 2 ? '5-10' : totalMemoryGB < 8 ? cpuCount * 3 : cpuCount * 5} concurrent requests`);
  console.log(`\n📄 Pages:`);
  console.log(`   - Homepage: http://localhost:${PORT}`);
  console.log(`   - Previous Crawls: http://localhost:${PORT}/previous-crawls.html`);
  console.log(`\n📧 Email Reports: ⚠️  Disabled (enable in server.js when needed)\n`);
});
