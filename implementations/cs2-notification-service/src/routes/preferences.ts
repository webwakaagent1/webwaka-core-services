import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { preferenceService } from '../services';

const router = Router();

const createPreferenceSchema = Joi.object({
  tenantId: Joi.string().required(),
  userId: Joi.string().required(),
  channel: Joi.string().valid('email', 'sms', 'push', 'whatsapp').required(),
  enabled: Joi.boolean().default(true),
  frequency: Joi.string().valid('realtime', 'daily', 'weekly', 'never').default('realtime'),
  quietHoursStart: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  timezone: Joi.string().default('Africa/Lagos'),
  metadata: Joi.object().optional(),
});

const updatePreferenceSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  frequency: Joi.string().valid('realtime', 'daily', 'weekly', 'never').optional(),
  quietHoursStart: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(null).optional(),
  quietHoursEnd: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(null).optional(),
  timezone: Joi.string().optional(),
  metadata: Joi.object().optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = createPreferenceSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const preference = await preferenceService.upsertPreference(value);
    res.status(201).json({ data: preference });
  } catch (err) {
    next(err);
  }
});

router.get('/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }

    const preferences = await preferenceService.getUserPreferences(tenantId, req.params.userId);
    res.json({ data: preferences });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const preference = await preferenceService.getPreference(req.params.id);
    if (!preference) {
      res.status(404).json({ error: 'Preference not found' });
      return;
    }
    res.json({ data: preference });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = updatePreferenceSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const preference = await preferenceService.updatePreference(req.params.id, value);
    res.json({ data: preference });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await preferenceService.deletePreference(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, userId, preferences } = req.body;

    if (!tenantId || !userId || !Array.isArray(preferences)) {
      res.status(400).json({ error: 'tenantId, userId, and preferences array are required' });
      return;
    }

    const results = await Promise.all(
      preferences.map((pref: any) =>
        preferenceService.upsertPreference({
          tenantId,
          userId,
          ...pref,
        })
      )
    );

    res.status(201).json({ data: results });
  } catch (err) {
    next(err);
  }
});

export default router;
