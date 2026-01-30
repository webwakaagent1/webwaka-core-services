import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { templateService } from '../services';
import { NotificationChannel } from '../models/types';

const router = Router();

const createTemplateSchema = Joi.object({
  tenantId: Joi.string().required(),
  name: Joi.string().required(),
  slug: Joi.string().required(),
  channel: Joi.string().valid('email', 'sms', 'push', 'whatsapp').required(),
  subject: Joi.string().optional(),
  bodyTemplate: Joi.string().required(),
  locale: Joi.string().default('en'),
  metadata: Joi.object().optional(),
});

const updateTemplateSchema = Joi.object({
  name: Joi.string().optional(),
  subject: Joi.string().optional(),
  bodyTemplate: Joi.string().optional(),
  locale: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
  metadata: Joi.object().optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = createTemplateSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const template = await templateService.createTemplate(value);
    res.status(201).json({ data: template });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }

    const channel = req.query.channel as NotificationChannel | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const templates = await templateService.listTemplates(tenantId, channel, limit, offset);
    res.json({ data: templates, limit, offset });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await templateService.getTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

router.get('/by-slug/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string;
    const channel = req.query.channel as NotificationChannel;
    const locale = (req.query.locale as string) || 'en';

    if (!tenantId || !channel) {
      res.status(400).json({ error: 'tenantId and channel are required' });
      return;
    }

    const template = await templateService.getTemplateBySlug(tenantId, req.params.slug, channel, locale);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = updateTemplateSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const template = await templateService.updateTemplate(req.params.id, value);
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await templateService.deleteTemplate(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { templateId, data } = req.body;

    if (!templateId) {
      res.status(400).json({ error: 'templateId is required' });
      return;
    }

    const template = await templateService.getTemplate(templateId);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const rendered = templateService.renderTemplate(template, data || {});
    res.json({ data: rendered });
  } catch (err) {
    next(err);
  }
});

export default router;
