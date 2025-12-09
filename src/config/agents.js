const http = require('http');
const https = require('https');

// Connection pooling for maximum performance
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 500,
  maxFreeSockets: 200,
  timeout: 5000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 500,
  maxFreeSockets: 200,
  timeout: 5000,
});

module.exports = {
  httpAgent,
  httpsAgent
};
