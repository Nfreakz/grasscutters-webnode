import type { Router } from 'express';
import { env } from '../../config/env';

export function registerStatusRoutes(router: Router) {
  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'grasscutters-node',
      env: env.NODE_ENV
    });
  });

  router.get('/status', (_req, res) => {
    res.json({
      ok: true,
      message: 'GC API funcionando',
      modules: {
        web: true,
        api: true,
        discord: env.DISCORD_ENABLED,
        stracker: true,
        users: true
      }
    });
  });
}
