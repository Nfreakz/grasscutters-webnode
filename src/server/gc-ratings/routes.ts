import type { Express, Request } from 'express';
import { getGcRatingsService } from './ratingService';

type RouteOptions = {
  isAdmin?: (req: Request) => Promise<boolean>;
};

export function registerGcRatingRoutes(app: Express, options: RouteOptions = {}) {
  const service = getGcRatingsService();
  const cronSecret = String(process.env.GC_RATINGS_CRON_SECRET || '').trim();

  function readCronSecret(req: Request) {
    return String(req.header('x-gc-cron-secret') || req.query.secret || '').trim();
  }

  async function requireAdmin(req: Request) {
    if (!options.isAdmin) return true;
    return options.isAdmin(req);
  }

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
      res.json(await service.getDiagnostics());
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/gc/ratings/process-new-events', async (req, res) => {
    try {
      if (!cronSecret || readCronSecret(req) !== cronSecret) {
        return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Cron secret invalido.' });
      }
      const payload = await service.processNewEvents();
      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        mode: payload.mode,
        generatedAt: payload.snapshot.generatedAt,
        processedEvents: payload.processedEvents,
        skippedEvents: payload.skippedEvents,
        newEvents: payload.newEvents,
        storage: payload.snapshot.storage,
        message: payload.message
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/gc/ratings/recalculate', async (req, res) => {
    try {
      const mode = String(req.query.mode || req.body?.mode || '').trim().toLowerCase();
      if (mode === 'rebuild') {
        const allowed = await requireAdmin(req);
        if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });
        const payload = await service.rebuild();
        return res.json({
          ok: true,
          source: 'gc-ratings-v1',
          generatedAt: payload.snapshot.generatedAt,
          mode: payload.mode,
          processedEvents: payload.processedEvents,
          rebuiltEvents: payload.rebuiltEvents,
          storage: payload.snapshot.storage,
          message: payload.message
        });
      }

      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });
      const payload = await service.processNewEvents();
      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,
        mode: payload.mode,
        processedEvents: payload.processedEvents,
        skippedEvents: payload.skippedEvents,
        newEvents: payload.newEvents,
        storage: payload.snapshot.storage,
        message: payload.message
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/gc/ratings/rebuild', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });
      const payload = await service.rebuild();
      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,
        mode: payload.mode,
        processedEvents: payload.processedEvents,
        rebuiltEvents: payload.rebuiltEvents,
        storage: payload.snapshot.storage,
        message: payload.message
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });
}

