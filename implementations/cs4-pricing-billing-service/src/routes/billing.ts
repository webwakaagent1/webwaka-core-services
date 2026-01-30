import { Router, Request, Response } from 'express';
import { BillingEngine } from '../services/BillingEngine';
import { AuditService } from '../services/AuditService';
import { logger } from '../utils/logger';
import { BillingCycleType, BillingCycleStatus, ScopeType, ActorRole, DeploymentType } from '../types';

const router = Router();
const billingEngine = new BillingEngine();
const auditService = new AuditService();

router.post('/cycles', async (req: Request, res: Response) => {
  try {
    const { tenantId, scopeId, scopeType, cycleType, startDate, endDate } = req.body;

    if (!tenantId || !scopeId || !scopeType || !cycleType || !startDate) {
      return res.status(400).json({ error: 'Missing required fields: tenantId, scopeId, scopeType, cycleType, startDate' });
    }

    const cycle = await billingEngine.createBillingCycle(
      tenantId, scopeId, scopeType as ScopeType, cycleType as BillingCycleType,
      new Date(startDate), { endDate: endDate ? new Date(endDate) : undefined }
    );

    res.status(201).json(cycle);
  } catch (error) {
    logger.error('Failed to create billing cycle', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/cycles', async (req: Request, res: Response) => {
  try {
    const { tenantId, scopeId, scopeType, status, fromDate, toDate, limit, offset } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const result = await billingEngine.listBillingCycles(tenantId as string, {
      scopeId: scopeId as string | undefined,
      scopeType: scopeType as ScopeType | undefined,
      status: status as BillingCycleStatus | undefined,
      fromDate: fromDate ? new Date(fromDate as string) : undefined,
      toDate: toDate ? new Date(toDate as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    logger.error('Failed to list billing cycles', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/cycles/:id', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const cycle = await billingEngine.getBillingCycle(tenantId as string, id);
    if (!cycle) {
      return res.status(404).json({ error: 'Billing cycle not found' });
    }

    res.json(cycle);
  } catch (error) {
    logger.error('Failed to get billing cycle', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/cycles/:id/summary', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const summary = await billingEngine.getCycleSummary(tenantId as string, id);
    res.json(summary);
  } catch (error) {
    logger.error('Failed to get cycle summary', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/cycles/:id/items', async (req: Request, res: Response) => {
  try {
    const { tenantId, pricingModelId, itemType, quantity, scopeType, scopeId, description, metadata, deploymentType } = req.body;
    const { id: billingCycleId } = req.params;

    if (!tenantId || !pricingModelId || !itemType || quantity === undefined || !scopeType) {
      return res.status(400).json({ error: 'Missing required fields: tenantId, pricingModelId, itemType, quantity, scopeType' });
    }

    const item = await billingEngine.addBillingItem(
      tenantId, billingCycleId, pricingModelId, itemType, parseFloat(quantity),
      scopeType as ScopeType, scopeId,
      { description, metadata, deploymentType: deploymentType as DeploymentType | undefined }
    );

    res.status(201).json(item);
  } catch (error) {
    logger.error('Failed to add billing item', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/cycles/:id/items', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    const { id: billingCycleId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const items = await billingEngine.listBillingItems(tenantId as string, billingCycleId);
    res.json(items);
  } catch (error) {
    logger.error('Failed to list billing items', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/cycles/:id/close', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body;
    const { id } = req.params;
    const closedBy = req.headers['x-user-id'] as string || 'system';
    const closedByRole = (req.headers['x-user-role'] as ActorRole) || 'super_admin';

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const cycle = await billingEngine.closeBillingCycle(tenantId, id, closedBy, closedByRole);
    res.json(cycle);
  } catch (error) {
    logger.error('Failed to close billing cycle', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch('/cycles/:id/status', async (req: Request, res: Response) => {
  try {
    const { tenantId, status } = req.body;
    const { id } = req.params;
    const updatedBy = req.headers['x-user-id'] as string || 'system';
    const updatedByRole = (req.headers['x-user-role'] as ActorRole) || 'super_admin';

    if (!tenantId || !status) {
      return res.status(400).json({ error: 'tenantId and status are required' });
    }

    const cycle = await billingEngine.updateCycleStatus(tenantId, id, status as BillingCycleStatus, updatedBy, updatedByRole);
    res.json(cycle);
  } catch (error) {
    logger.error('Failed to update cycle status', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/audit', async (req: Request, res: Response) => {
  try {
    const { tenantId, entityType, action, actorId, actorRole, fromDate, toDate, limit, offset } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const result = await auditService.searchAuditLogs(
      tenantId as string,
      {
        entityType: entityType as string | undefined,
        action: action as string | undefined,
        actorId: actorId as string | undefined,
        actorRole: actorRole as ActorRole | undefined,
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined,
      },
      {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      }
    );

    res.json(result);
  } catch (error) {
    logger.error('Failed to search audit logs', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/audit/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const { tenantId, limit, offset } = req.query;
    const { entityType, entityId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const result = await auditService.getAuditHistory(tenantId as string, entityType, entityId, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    logger.error('Failed to get audit history', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/audit/:id/reverse', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body;
    const { id } = req.params;
    const reversedBy = req.headers['x-user-id'] as string || 'system';
    const reversedByRole = (req.headers['x-user-role'] as ActorRole) || 'super_admin';

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const result = await auditService.reverseAction(tenantId, id, reversedBy, reversedByRole);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to reverse action', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
