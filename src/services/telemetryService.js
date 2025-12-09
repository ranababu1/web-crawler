const { google } = require('googleapis');

class TelemetryService {
  constructor() {
    this.enabled = process.env.GOOGLE_SHEETS_ENABLED === 'true';
    this.initialized = false;
    
    if (this.enabled) {
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        this.sheets = google.sheets({ version: 'v4', auth });
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
        this.sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
        this.initializeSheet();
        console.log('✓ Google Sheets telemetry initialized');
      } catch (error) {
        console.error('Failed to initialize Google Sheets telemetry:', error.message);
        this.enabled = false;
      }
    } else {
      console.log('Google Sheets telemetry disabled');
    }
  }

  async initializeSheet() {
    try {
      // Check if sheet exists and has headers
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:K1`,
      });

      // If no headers, add them
      if (!response.data.values || response.data.values.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A1:K1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[
              'Timestamp',
              'Session ID',
              'Domain',
              'IP',
              'User Agent',
              'Browser',
              'OS',
              'Pages Found',
              'Errors',
              'Duration (s)',
              'Status'
            ]],
          },
        });
        console.log('✓ Telemetry headers initialized');
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize sheet headers:', error.message);
      console.log('Please ensure the sheet tab name in Google Sheets matches:', this.sheetName);
      this.initialized = true; // Continue anyway
    }
  }

  async logCrawl(data) {
    if (!this.enabled || !this.initialized) return;

    try {
      const row = [
        new Date().toISOString(),
        data.sessionId,
        data.domain,
        data.ip,
        data.userAgent,
        data.browser,
        data.os,
        data.pagesFound || 0,
        data.errors || 0,
        data.duration || 0,
        data.status || 'started'
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:K`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [row],
        },
      });

      console.log(`✓ Telemetry logged for ${data.domain} (Session: ${data.sessionId})`);
    } catch (error) {
      console.error('Failed to log telemetry:', error.message);
    }
  }

  async updateCrawl(sessionId, updates) {
    if (!this.enabled || !this.initialized) return;

    try {
      // Find the row with this sessionId
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!B:B`,
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === sessionId);

      if (rowIndex === -1) return;

      // Update specific columns (rowIndex + 2 because: +1 for 1-indexed, +1 for header row)
      const rowNumber = rowIndex + 2;
      const updateData = [];

      if (updates.pagesFound !== undefined) {
        updateData.push({
          range: `${this.sheetName}!H${rowNumber}`,
          values: [[updates.pagesFound]],
        });
      }
      if (updates.errors !== undefined) {
        updateData.push({
          range: `${this.sheetName}!I${rowNumber}`,
          values: [[updates.errors]],
        });
      }
      if (updates.duration !== undefined) {
        updateData.push({
          range: `${this.sheetName}!J${rowNumber}`,
          values: [[updates.duration]],
        });
      }
      if (updates.status !== undefined) {
        updateData.push({
          range: `${this.sheetName}!K${rowNumber}`,
          values: [[updates.status]],
        });
      }

      if (updateData.length > 0) {
        await this.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            data: updateData,
            valueInputOption: 'RAW',
          },
        });
        console.log(`✓ Telemetry updated for session ${sessionId}`);
      }
    } catch (error) {
      console.error('Failed to update telemetry:', error.message);
    }
  }

  // Helper to parse user agent
  parseUserAgent(userAgent) {
    const ua = userAgent || '';
    
    let browser = 'Unknown';
    let os = 'Unknown';

    // Detect browser
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

    // Detect OS
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return { browser, os };
  }
}

module.exports = new TelemetryService();
