import express from 'express';
import type { Express } from 'express';
import { registerEventRoutes } from './routes/events';
import { registerStatusRoutes } from './routes/status';
import { registerStrackerRoutes } from './routes/stracker';
import { registerUserRoutes } from './routes/users';

export function registerApiRoutes(app: Express) {
  const router = express.Router();

  router.use(express.json({ limit: '1mb' }));

  registerStatusRoutes(router);
  registerStrackerRoutes(router);
  registerUserRoutes(router);
  registerEventRoutes(router);

  app.use('/api', router);
}
