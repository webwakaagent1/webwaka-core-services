import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { notificationService, deliveryService } from '../services';
import { NotificationChannel, NotificationPriority, NotificationStatus } from '../models/types';

const router = Router();

const createNotificationSchema = Joi.object({
  tenantId: Joi.string().required(),
  userId: Joi.string().optional(),
  channel: Joi.string().valid('email', 'sms', 'push', 'whatsapp').required(),
  templateId: Joi.string().uuid().optional(),
  templateData: Joi.object().optional(),
  subject: Joi.string().optional(),
  content: Joi.string().optional(),
  recipient: Joi.string().required(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  metadata: Joi.object().optional(),
  scheduledAt: Joi.date().iso().optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = createNotificationSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const notification = await notificationService.createNotification(value);
    res.status(201).json({ data: notification });
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
    
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const filter = {
      tenantId,
      userId: req.query.userId as string | undefined,
      channel: req.query.channel as NotificationChannel | undefined,
      status: req.query.status as NotificationStatus | undefined,
      priority: req.query.priority as NotificationPriority | undefined,
    };

    const notifications = await notificationService.listNotifications(filter, limit, offset);
    res.json({ data: notifications, limit, offset });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }
    
    const filter = {
      tenantId,
      channel: req.query.channel as NotificationChannel | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    };

    const stats = await deliveryService.getStats(filter);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }
    
    const notification = await notificationService.getNotification(req.params.id, tenantId);
    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.json({ data: notification });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }
    
    const notification = await notificationService.cancelNotification(req.params.id, tenantId);
    res.json({ data: notification, message: 'Notification cancelled' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/delivery-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }
    
    const logs = await deliveryService.getDeliveryLogs(req.params.id, tenantId);
    res.json({ data: logs });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/track/open', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string || req.body.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }
    
    await deliveryService.trackOpen(req.params.id, tenantId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/:id/track/click', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string || req.body.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }
    
    const { url } = req.body;
    await deliveryService.trackClick(req.params.id, tenantId, url);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
