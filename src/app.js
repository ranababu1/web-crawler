const express = require('express');
const cors = require('cors');
const path = require('path');
const crawlRoutes = require('./routes/crawlRoutes');
const schedulerRoutes = require('./routes/schedulerRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', crawlRoutes);
app.use('/api/scheduler', schedulerRoutes);

module.exports = app;
