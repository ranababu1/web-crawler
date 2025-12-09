// Store active crawl sessions
const crawlSessions = new Map();

// Clean up old sessions periodically
const startSessionCleanup = () => {
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, crawler] of crawlSessions.entries()) {
      // Remove sessions older than 1 hour
      const sessionTime = parseInt(sessionId.split('').slice(0, 8).join(''), 36);
      if (now - sessionTime > 3600000) {
        crawlSessions.delete(sessionId);
        console.log(`Cleaned up session: ${sessionId}`);
      }
    }
  }, 300000); // Run every 5 minutes
};

const generateSessionId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

const getSession = (sessionId) => {
  return crawlSessions.get(sessionId);
};

const setSession = (sessionId, crawler) => {
  crawlSessions.set(sessionId, crawler);
};

const deleteSession = (sessionId) => {
  return crawlSessions.delete(sessionId);
};

module.exports = {
  startSessionCleanup,
  generateSessionId,
  getSession,
  setSession,
  deleteSession
};
