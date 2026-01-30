import { Router, Request, Response } from 'express';
import { PricingModelService } from '../services/PricingModelService';
import { PricingCalculator } from '../services/PricingCalculator';
import { ScopeService } from '../services/ScopeService';
import { OverrideService } from '../services/OverrideService';
import { logger } from '../utils/logger';
import { PricingModelType, ActorRole, ScopeType, DeploymentType } from '../types';

const router = Router();
const pricingModelService = new PricingModelService();
const pricingCalculator = new PricingCalculator();
const scopeService = new ScopeService();
const overrideService = new OverrideService();

router.post('/models', async (req: Request, res: Response) => {
  try {
    const { tenantId, name, modelType, config, description, isSystem } = req.body;
    const createdBy = req.headers['x-user-id'] as string || 'system';
    const createdByRole = (req.headers['x-user-role'] as ActorRole) || 'super_admin';

    if (!tenantId || !name || !modelType || !config) {
      return res.status(400).json({ error: 'Missing required fields: tenantId, name, modelType, config' });
    }

    const model = await pricingModelService.createPricingModel(
      tenantId, name, modelType as PricingModelType, config,
      createdBy, createdByRole, description, isSystem
    );

    res.status(201).json(model);
  } catch (error) {
    logger.error('Failed to create pricing model', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/models', async (req: Request, res: Response) => {
  try {
    const { tenantId, modelType, isActive, isSystem, limit, offset } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const result = await pricingModelService.listPricingModels(tenantId as string, {
      modelType: modelType as PricingModelType | undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      isSystem: isSystem !== undefined ? isSystem === 'true' : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    logger.error('Failed to list pricing models', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/models/:id', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const model = await pricingModelService.getPricingModel(tenantId as string, id);
    if (!model) {
      return res.status(404).json({ error: 'Pricing model not found' });
    }

    res.json(model);
  } catch (error) {
    logger.error('Failed to get pricing model', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/models/:id', async (req: Request, res: Response) => {
  try {
    const { tenantId, name, description, config, isActive, reason } = req.body;
    const { id } = req.params;
    const updatedBy = req.headers['x-user-id'] as string || 'system';
    const updatedByRole = (req.headers['x-user-role'] as ActorRole) || 'super_admin';

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const model = await pricingModelService.updatePricingModel(
      tenantId, id, { name, description, config, isActive },
      updatedBy, updatedByRole, reason
    );

    if (!model) {
      return res.status(404).json({ error: 'Pricing model not found' });
    }

    res.json(model);
  } catch (error) {
    logger.error('Failed to update pricing model', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/models/:id', async (req: Request, res: Response) => {
  try {
    const { tenantId, reason } = req.query;
    const { id } = req.params;
    const deletedBy = req.headers['x-user-id'] as string || 'system';
    const deletedByRole = (req.headers['x-user-role'] as ActorRole) || 'super_admin';

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const deleted = await pricingModelService.deletePricingModel(
      tenantId as string, id, deletedBy, deletedByRole, reason as string | undefined
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Pricing model not found' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete pricing model', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/models/:id/rules', async (req: Request, res: Response) => {
  try {
    const { tenantId, name, ruleType, conditions, actions, description, priority, effectiveFrom, effectiveTo } = req.body;
    const { id: pricingModelId } = req.params;

    if (!tenantId || !name || !ruleType || !conditions || !actions) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const rule = await pricingModelService.createRule(
      tenantId, pricingModelId, name, ruleType, conditions, actions,
      { description, priority, effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined, effectiveTo: effectiveTo ? new Date(effectiveTo) : undefined }
    );

    res.status(201).json(rule);
  } catch (error) {
    logger.error('Failed to create pricing rule', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/models/:id/rules', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    const { id: pricingModelId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const rules = await pricingModelService.listRules(tenantId as string, pricingModelId);
    res.json(rules);
  } catch (error) {
    logger.error('Failed to list pricing rules', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const { tenantId, pricingModelId, scopeType, scopeId, deploymentType, itemType, quantity, metadata } = req.body;

    if (!tenantId || !scopeType || !itemType || quantity === undefined) {
      return res.status(400).json({ error: 'Missing required fields: tenantId, scopeType, itemType, quantity' });
    }

    const result = await pricingCalculator.calculatePrice({
      tenantId,
      pricingModelId,
      scopeType: scopeType as ScopeType,
      scopeId,
      deploymentType: deploymentType as DeploymentType | undefined,
      itemType,
      quantity: parseFloat(quantity),
      metadata,
    });

    res.json(result);
  } catch (error) {
    logger.error('Failed to calculate price', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/scopes', async (req: Request, res: Response) => {
  try {
    const { tenantId, pricingModelId, scopeType, scopeId, deploymentType, isOverride, parentScopeId } = req.body;

    if (!tenantId || !pricingModelId || !scopeType) {
      return res.status(400).json({ error: 'Missing required fields: tenantId, pricingModelId, scopeType' });
    }

    const scope = await scopeService.createScope(
      tenantId, pricingModelId, scopeType as ScopeType,
      { scopeId, deploymentType: deploymentType as DeploymentType | undefined, isOverride, parentScopeId }
    );

    res.status(201).json(scope);
  } catch (error) {
    logger.error('Failed to create pricing scope', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/scopes', async (req: Request, res: Response) => {
  try {
    const { tenantId, pricingModelId, scopeType, deploymentType } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const scopes = await scopeService.listScopes(tenantId as string, {
      pricingModelId: pricingModelId as string | undefined,
      scopeType: scopeType as ScopeType | undefined,
      deploymentType: deploymentType as DeploymentType | undefined,
    });

    res.json(scopes);
  } catch (error) {
    logger.error('Failed to list scopes', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/overrides', async (req: Request, res: Response) => {
  try {
    const { tenantId, pricingModelId, scopeId, overrideType, overrideValue, reason, effectiveFrom, effectiveTo, requiresApproval } = req.body;
    const createdBy = req.headers['x-user-id'] as string || 'system';
    const createdByRole = (req.headers['x-user-role'] as ActorRole) || 'super_admin';

    if (!tenantId || !pricingModelId || !scopeId || !overrideType || !overrideValue || !reason || !effectiveFrom) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const override = await overrideService.createOverride(
      tenantId, pricingModelId, scopeId, overrideType, overrideValue, reason,
      new Date(effectiveFrom), createdBy, createdByRole,
      { effectiveTo: effectiveTo ? new Date(effectiveTo) : undefined, requiresApproval }
    );

    res.status(201).json(override);
  } catch (error) {
    logger.error('Failed to create override', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/overrides', async (req: Request, res: Response) => {
  try {
    const { tenantId, pricingModelId, scopeId, isActive, includeExpired, limit, offset } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const result = await overrideService.listOverrides(tenantId as string, {
      pricingModelId: pricingModelId as string | undefined,
      scopeId: scopeId as string | undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      includeExpired: includeExpired === 'true',
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    logger.error('Failed to list overrides', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/overrides/:id/approve', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body;
    const { id } = req.params;
    const approvedBy = req.headers['x-user-id'] as string || 'system';
    const approvedByRole = (req.headers['x-user-role'] as ActorRole) || 'super_admin';

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const override = await overrideService.approveOverride(tenantId, id, approvedBy, approvedByRole);
    if (!override) {
      return res.status(404).json({ error: 'Override not found' });
    }

    res.json(override);
  } catch (error) {
    logger.error('Failed to approve override', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/overrides/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const { tenantId, reason } = req.body;
    const { id } = req.params;
    const deactivatedBy = req.headers['x-user-id'] as string || 'system';
    const deactivatedByRole = (req.headers['x-user-role'] as ActorRole) || 'super_admin';

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const override = await overrideService.deactivateOverride(tenantId, id, deactivatedBy, deactivatedByRole, reason);
    if (!override) {
      return res.status(404).json({ error: 'Override not found' });
    }

    res.json(override);
  } catch (error) {
    logger.error('Failed to deactivate override', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
