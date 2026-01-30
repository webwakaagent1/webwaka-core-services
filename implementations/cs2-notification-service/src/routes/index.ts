import { Router } from 'express';
import notificationRoutes from './notifications';
import templateRoutes from './templates';
import preferenceRoutes from './preferences';

const router = Router();

router.use('/notifications', notificationRoutes);
router.use('/templates', templateRoutes);
router.use('/preferences', preferenceRoutes);

export default router;
