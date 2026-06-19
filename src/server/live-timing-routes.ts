import type { Express } from 'express';
import { getLiveTimingPayload, getLiveTimingResponseStatus } from './live-timing-core';

export function registerLiveTimingRoutes(app: Express) {
  app.get('/api/live-timing', async (_req, res) => {
    const payload = await getLiveTimingPayload();
    res.status(getLiveTimingResponseStatus(payload)).json(payload);
  });
}
