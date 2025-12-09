const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
  }

  configure(config) {
    try {
      this.transporter = nodemailer.createTransport({
        host: config.host || process.env.SMTP_HOST,
        port: config.port || process.env.SMTP_PORT || 587,
        secure: config.secure || process.env.SMTP_SECURE === 'true',
        auth: {
          user: config.user || process.env.SMTP_USER,
          pass: config.pass || process.env.SMTP_PASS
        }
      });
      this.isConfigured = true;
      console.log('✅ Email service configured');
    } catch (error) {
      console.error('Failed to configure email service:', error.message);
      this.isConfigured = false;
    }
  }

  async sendCrawlReport(recipient, crawlData) {
    if (!this.isConfigured) {
      throw new Error('Email service not configured. Please set SMTP credentials.');
    }

    const { domain, pagesFound, errors, startTime, endTime, sessionId } = crawlData;
    const duration = endTime ? Math.round((new Date(endTime) - new Date(startTime)) / 1000) : 0;
    
    const successPages = crawlData.pages.filter(p => p.status === 'success').length;
    const errorPages = crawlData.pages.filter(p => p.status === 'error').length;
    const nonHtmlPages = crawlData.pages.filter(p => p.status === 'non-html').length;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .stats { display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0; }
          .stat-card { flex: 1; min-width: 150px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .stat-value { font-size: 32px; font-weight: bold; color: #667eea; }
          .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
          .success { color: #10b981; }
          .error { color: #ef4444; }
          .warning { color: #f59e0b; }
          .section { margin: 20px 0; }
          .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #667eea; }
          .error-list { background: white; padding: 15px; border-radius: 8px; }
          .error-item { padding: 10px; border-bottom: 1px solid #eee; }
          .error-item:last-child { border-bottom: none; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .btn { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🕷️ Web Crawler Report</h1>
            <p>${domain}</p>
          </div>
          <div class="content">
            <div class="stats">
              <div class="stat-card">
                <div class="stat-value success">${successPages}</div>
                <div class="stat-label">Successful Pages</div>
              </div>
              <div class="stat-card">
                <div class="stat-value error">${errorPages}</div>
                <div class="stat-label">Errors</div>
              </div>
              <div class="stat-card">
                <div class="stat-value warning">${nonHtmlPages}</div>
                <div class="stat-label">Non-HTML</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${pagesFound}</div>
                <div class="stat-label">Total Pages</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Crawl Summary</div>
              <p><strong>Domain:</strong> ${domain}</p>
              <p><strong>Started:</strong> ${new Date(startTime).toLocaleString()}</p>
              <p><strong>Completed:</strong> ${endTime ? new Date(endTime).toLocaleString() : 'N/A'}</p>
              <p><strong>Duration:</strong> ${duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`}</p>
              <p><strong>Session ID:</strong> ${sessionId}</p>
            </div>

            ${errorPages > 0 ? `
            <div class="section">
              <div class="section-title">Error Summary (Top 10)</div>
              <div class="error-list">
                ${crawlData.pages.filter(p => p.status === 'error').slice(0, 10).map(page => `
                  <div class="error-item">
                    <div style="font-size: 12px; color: #666; word-break: break-all;">${page.url}</div>
                    <div style="color: #ef4444; font-size: 13px; margin-top: 5px;">${page.error || 'Unknown error'}</div>
                  </div>
                `).join('')}
              </div>
              ${errorPages > 10 ? `<p style="margin-top: 10px; color: #666; font-size: 14px;">... and ${errorPages - 10} more errors</p>` : ''}
            </div>
            ` : ''}

            <div style="text-align: center;">
              <a href="${process.env.APP_URL || 'http://localhost:3001'}" class="btn">View Full Report</a>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated crawl report from Web Crawler</p>
            <p>Session ID: ${sessionId}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Web Crawler Report - ${domain}

SUMMARY
=======
Total Pages Found: ${pagesFound}
Successful Pages: ${successPages}
Errors: ${errorPages}
Non-HTML Pages: ${nonHtmlPages}

Started: ${new Date(startTime).toLocaleString()}
Completed: ${endTime ? new Date(endTime).toLocaleString() : 'N/A'}
Duration: ${duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`}

${errorPages > 0 ? `
ERROR SUMMARY (Top 10)
=====================
${crawlData.pages.filter(p => p.status === 'error').slice(0, 10).map(page => 
  `- ${page.url}\n  Error: ${page.error || 'Unknown error'}`
).join('\n\n')}
${errorPages > 10 ? `\n... and ${errorPages - 10} more errors` : ''}
` : ''}

Session ID: ${sessionId}
View full report: ${process.env.APP_URL || 'http://localhost:3001'}
    `;

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipient,
      subject: `Web Crawler Report: ${domain} - ${pagesFound} pages found`,
      text: textContent,
      html: htmlContent
    };

    await this.transporter.sendMail(mailOptions);
    console.log(`📧 Report sent to ${recipient}`);
  }

  async testConnection() {
    if (!this.isConfigured) {
      throw new Error('Email service not configured');
    }
    return await this.transporter.verify();
  }
}

module.exports = new EmailService();
