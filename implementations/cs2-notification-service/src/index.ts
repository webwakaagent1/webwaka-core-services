import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger';
import { testConnection, closePool } from './config/database';
import routes from './routes';
import { getAvailableChannels } from './providers';

const app = express();
const PORT = parseInt(process.env.PORT || '5001');
const HOST = process.env.HOST || 'localhost';

app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get('/health', async (_req: Request, res: Response) => {
  const dbHealthy = await testConnection();
  const channels = getAvailableChannels();

  const status = dbHealthy ? 'healthy' : 'unhealthy';
  const statusCode = dbHealthy ? 200 : 503;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
      channels,
    },
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'WebWaka CS-2 Notification Service',
    version: '1.0.0',
    status: 'running',
    channels: getAvailableChannels(),
    endpoints: {
      health: '/health',
      notifications: '/api/v1/notifications',
      templates: '/api/v1/templates',
      preferences: '/api/v1/preferences',
    },
  });
});

app.use('/api/v1', routes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  try {
    logger.info('Starting WebWaka CS-2 Notification Service...');

    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    const channels = getAvailableChannels();
    logger.info('Available notification channels', { channels });

    app.listen(PORT, HOST, () => {
      logger.info(`Server running at http://${HOST}:${PORT}`);
      logger.info('Available endpoints:');
      logger.info('  GET  /                        - API info');
      logger.info('  GET  /health                  - Health check');
      logger.info('  POST /api/v1/notifications    - Send notification');
      logger.info('  GET  /api/v1/notifications    - List notifications');
      logger.info('  GET  /api/v1/notifications/stats - Get stats');
      logger.info('  POST /api/v1/templates        - Create template');
      logger.info('  GET  /api/v1/templates        - List templates');
      logger.info('  POST /api/v1/preferences      - Set preference');
      logger.info('  GET  /api/v1/preferences/user/:userId - Get user preferences');
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  await closePool();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
