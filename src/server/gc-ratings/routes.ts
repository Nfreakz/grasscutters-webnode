import type { Express, Request } from 'express';
import { getGcRatingsService } from './ratingService';

type RouteOptions = {
  isAdmin?: (req: Request) => Promise<boolean>;
};

export function registerGcRatingRoutes(app: Express, options: RouteOptions = {}) {
  const service = getGcRatingsService();

  app.get('/api/gc/ratings/championship', async (req, res) => {
    try {
      const payload = await service.getChampionshipPayload(String(req.query.refresh || '') === '1');
      res.json(payload);
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/gc/ratings/event/:eventId', async (req, res) => {
    try {
      const payload = await service.getEvent(String(req.params.eventId || ''));
      if (!payload) return res.status(404).json({ ok: false, source: 'gc-ratings-v1', message: 'Evento no encontrado.' });
      res.json(payload);
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/gc/ratings/driver/:driverKey', async (req, res) => {
    try {
      const payload = await service.getDriver(String(req.params.driverKey || ''));
      if (!payload) return res.status(404).json({ ok: false, source: 'gc-ratings-v1', message: 'Piloto no encontrado.' });
      res.json(payload);
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/gc/ratings/leaderboard', async (_req, res) => {
    try {
      res.json(await service.getLeaderboard());
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/gc/ratings/diagnostics', async (_req, res) => {
    try {
      const payload = await service.getChampionshipPayload(false);
      res.json({ ok: true, source: 'gc-ratings-v1', generatedAt: payload.generatedAt, diagnostics: payload.diagnostics });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/gc/ratings/recalculate', async (req, res) => {
    try {
      if (options.isAdmin) {
        const allowed = await options.isAdmin(req);
        if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });
      }
      const eventId = String(req.body?.eventId || req.query.eventId || '').trim() || null;
      const mode = eventId ? 'event' : 'championship';
      const payload = await service.recalculate(mode, eventId);
      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,
        mode,
        eventId,
        processedEvents: payload.snapshot.processedEventIds.length
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });
}

