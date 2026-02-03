import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import checkInsRoutes from './routes/check-ins';
import energyRoutes from './routes/energy';
import feedbackRoutes from './routes/feedback';
import healthDataRoutes from './routes/health-data';
import userRoutes from './routes/user';
import insightsRoutes from './routes/insights';
import aiRoutes from './routes/ai';
import habitsRoutes from './routes/habits';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/check-ins', checkInsRoutes);
app.use('/api/energy', energyRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/health-data', healthDataRoutes);
app.use('/api/user', userRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/habits', habitsRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Clarity API server running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
