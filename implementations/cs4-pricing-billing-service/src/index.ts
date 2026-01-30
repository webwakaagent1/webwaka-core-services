import express from 'express';
import { initializeDatabase, runMigrations } from './config/database';
import { logger } from './utils/logger';
import pricingRoutes from './routes/pricing';
import billingRoutes from './routes/billing';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.get('/', (req, res) => {
  res.json({
    service: 'WebWaka CS-4 Pricing & Billing Service',
    version: '1.0.0',
    description: 'Flexible, data-driven pricing engine with multi-actor authority and auditability',
    endpoints: {
      pricing: {
        models: '/api/v1/pricing/models',
        rules: '/api/v1/pricing/models/:id/rules',
        calculate: '/api/v1/pricing/calculate',
        scopes: '/api/v1/pricing/scopes',
        overrides: '/api/v1/pricing/overrides',
      },
      billing: {
        cycles: '/api/v1/billing/cycles',
        items: '/api/v1/billing/cycles/:id/items',
        summary: '/api/v1/billing/cycles/:id/summary',
        audit: '/api/v1/billing/audit',
      },
    },
    features: [
      'Multi-Actor Pricing Authority (Super Admin, Partners, Clients, Merchants, Agents, Staff)',
      'Composable Pricing Models (Flat, Usage-Based, Tiered, Subscription, Revenue-Share, Hybrid)',
      'Decoupled Billing Engine with Declarative Rules',
      'Deployment-Aware Pricing (Shared SaaS, Partner-Deployed, Self-Hosted)',
      'Versioned, Auditable, and Reversible Overrides',
    ],
    invariants: {
      'INV-001': 'Pricing Flexibility - data-driven, declarative pricing',
      'INV-002': 'Tenant Isolation - all operations scoped by tenant_id',
    },
  });
});

app.get('/health', async (req, res) => {
  try {
    await initializeDatabase();
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: (error as Error).message });
  }
});

app.use('/api/v1/pricing', pricingRoutes);
app.use('/api/v1/billing', billingRoutes);

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    logger.info('Starting WebWaka CS-4 Pricing & Billing Service...');
    
    await initializeDatabase();
    await runMigrations();
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`CS-4 Pricing & Billing Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start service', error);
    process.exit(1);
  }
}

start();
