/*
 * MySQL Backend Server for Tag Database
 * Provides API endpoints for tag queries
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { tagRoutes } from './routes/tags';
import { getConnectionString } from './config/database';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Tag database routes
app.use('/api/tags', tagRoutes);

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 MySQL Tag Database Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 API base: http://localhost:${PORT}/api/tags`);
    console.log(`💾 Connection: ${getConnectionString()}`);
    console.log('');
    console.log('📖 See server/INSTALL.md for setup instructions');
});

export default app;

