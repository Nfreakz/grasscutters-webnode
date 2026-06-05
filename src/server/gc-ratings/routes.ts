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

  function parseBooleanish(value: unknown, fallback: boolean | undefined = undefined) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
      return fallback;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'off', 'no'].includes(normalized)) return false;
      return fallback;
    }
    return fallback;
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
      let eventId = String(req.params.eventId || '');
      try {
        eventId = decodeURIComponent(eventId);
      } catch {}
      const payload = await service.getEvent(eventId);
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


  app.get('/api/gc/ratings/stracker-candidates', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });
      const payload = await service.getStrackerRaceCandidates({
        limit: req.query.limit,
        minDrivers: req.query.minDrivers,
        minTotalLaps: req.query.minTotalLaps
      });
      res.json(payload);
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/gc/ratings/process-stracker-session', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });
      const sessionId = Number(req.body?.sessionId || req.query.sessionId || 0);
      if (!Number.isFinite(sessionId) || sessionId <= 0) {
        return res.status(400).json({ ok: false, source: 'gc-ratings-v1', message: 'sessionId requerido.' });
      }
      const bodyCountsForRatings = parseBooleanish(req.body?.countsForRatings, undefined);
      const queryCountsForRatings = parseBooleanish(req.query.countsForRatings, undefined);
      const countsForRatings = bodyCountsForRatings ?? queryCountsForRatings ?? true;
      const payload = await service.processStrackerSession(sessionId, {
        name: req.body?.name ?? req.query.name,
        minDrivers: req.body?.minDrivers ?? req.query.minDrivers,
        reason: req.body?.reason ?? req.query.reason,
        countsForRatings
      });
      const reviewed = (payload as any).reviewed || null;
      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,
        processedEvents: payload.processedEvents,
        skippedEvents: payload.skippedEvents,
        newEvents: payload.newEvents,
        reviewed,
        countsForRatingsReceived: countsForRatings,
        ratingEligible: reviewed ? false : true,
        mode: reviewed ? 'reviewed-unrated' : 'rated',
        storage: payload.snapshot.storage,
        message: payload.message
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });


  app.post('/api/gc/ratings/remove-stracker-session', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });

      const sessionId = Number(req.body?.sessionId || req.query.sessionId || 0);
      const eventId = String(req.body?.eventId || req.query.eventId || '').trim();
      if ((!Number.isFinite(sessionId) || sessionId <= 0) && !eventId) {
        return res.status(400).json({ ok: false, source: 'gc-ratings-v1', message: 'sessionId o eventId requerido.' });
      }

      const payload = await service.removeStrackerSession({
        sessionId,
        eventId,
        reason: req.body?.reason || req.query.reason
      });

      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,
        removedEvents: payload.removedEvents,
        removedRows: payload.removedRows,
        eventId: payload.eventId,
        storage: payload.snapshot.storage,
        message: payload.message
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });


  app.post('/api/gc/ratings/ignore-stracker-session', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });

      const sessionId = Number(req.body?.sessionId || req.query.sessionId || 0);
      const eventId = String(req.body?.eventId || req.query.eventId || '').trim();
      if ((!Number.isFinite(sessionId) || sessionId <= 0) && !eventId) {
        return res.status(400).json({ ok: false, source: 'gc-ratings-v1', message: 'sessionId o eventId requerido.' });
      }

      const payload = await service.ignoreStrackerSession({
        sessionId,
        eventId,
        reason: req.body?.reason || req.query.reason
      });

      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,
        eventId: payload.eventId,
        sessionId: payload.sessionId,
        ignored: payload.ignored,
        storage: payload.snapshot.storage,
        message: payload.message
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });


  app.post('/api/gc/ratings/unignore-stracker-session', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });

      const sessionId = Number(req.body?.sessionId || req.query.sessionId || 0);
      const eventId = String(req.body?.eventId || req.query.eventId || '').trim();
      if ((!Number.isFinite(sessionId) || sessionId <= 0) && !eventId) {
        return res.status(400).json({ ok: false, source: 'gc-ratings-v1', message: 'sessionId o eventId requerido.' });
      }

      const payload = await service.unignoreStrackerSession({ sessionId, eventId });

      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,
        eventId: payload.eventId,
        sessionId: payload.sessionId,
        recovered: payload.recovered,
        storage: payload.snapshot.storage,
        message: payload.message
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/gc/ratings/unreview-stracker-session', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });

      const sessionId = Number(req.body?.sessionId || req.query.sessionId || 0);
      const eventId = String(req.body?.eventId || req.query.eventId || '').trim();
      if ((!Number.isFinite(sessionId) || sessionId <= 0) && !eventId) {
        return res.status(400).json({ ok: false, source: 'gc-ratings-v1', message: 'sessionId o eventId requerido.' });
      }

      const payload = await service.unreviewStrackerSession({ sessionId, eventId });

      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,
        eventId: payload.eventId,
        sessionId: payload.sessionId,
        recovered: payload.recovered,
        storage: payload.snapshot.storage,
        message: payload.message
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });


  app.post('/api/gc/ratings/auto-process-stracker', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });
      const payload = await service.autoProcessStrackerSessions({
        limit: req.body?.limit ?? req.query.limit,
        limitToProcess: req.body?.limitToProcess ?? req.query.limitToProcess,
        minDrivers: req.body?.minDrivers ?? req.query.minDrivers,
        minTotalLaps: req.body?.minTotalLaps ?? req.query.minTotalLaps
      });
      res.status(409).json(payload);
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
