import type { Express, Request } from 'express';
import { getGcRatingsService } from './ratingService';
import { getStrackerMirrorDiagnostics, getStrackerMirrorSqlitePath, getStrackerRaceCandidatesFromMirror, syncStrackerToSqlMirror } from './strackerSqlMirror';

type RouteOptions = {
  isAdmin?: (req: Request) => Promise<boolean>;
};

export function registerGcRatingRoutes(app: Express, options: RouteOptions = {}) {
  const service = getGcRatingsService();
  const cronSecret = String(process.env.GC_RATINGS_CRON_SECRET || '').trim();

  function readCronSecret(req: Request) {
    return String(req.header('x-gc-cron-secret') || req.query.secret || '').trim();
  }

  function formatStrackerMirrorError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      source: 'gc-ratings-v1',
      mirrorDriver: String((error as any)?.mirrorDriver || 'sqlite'),
      sqlitePath: String((error as any)?.sqlitePath || getStrackerMirrorSqlitePath()),
      phase: String((error as any)?.phase || 'sync'),
      message
    };
  }

  function extractStrackerSessionId(eventId: unknown) {
    const text = String(eventId || '').trim();
    const match = text.match(/^stracker:(\d+)$/i);
    return match ? Number(match[1]) : 0;
  }

  function buildStrackerExclusionSets(snapshot: any) {
    const processed = new Set<string>(Array.isArray(snapshot?.processedEventIds) ? snapshot.processedEventIds.map((value: any) => String(value)) : []);
    const ignored = new Set<number>(Array.isArray(snapshot?.ignoredStrackerSessions) ? snapshot.ignoredStrackerSessions.map((row: any) => Number(row.sessionId || extractStrackerSessionId(row.eventId))).filter((value: number) => Number.isFinite(value) && value > 0) : []);
    const reviewed = new Set<number>(Array.isArray(snapshot?.reviewedStrackerSessions) ? snapshot.reviewedStrackerSessions.map((row: any) => Number(row.sessionId || extractStrackerSessionId(row.eventId))).filter((value: number) => Number.isFinite(value) && value > 0) : []);
    return { processed, ignored, reviewed };
  }

  function filterCandidateRows(rows: any[], snapshot: any) {
    const exclusions = buildStrackerExclusionSets(snapshot);
    return rows.filter((candidate) => {
      const sessionId = Number(candidate?.sessionId || 0);
      const eventId = String(candidate?.eventId || `stracker:${sessionId}`);
      if (!sessionId) return false;
      if (exclusions.processed.has(eventId)) return false;
      if (exclusions.ignored.has(sessionId)) return false;
      if (exclusions.reviewed.has(sessionId)) return false;
      if (candidate?.alreadyProcessed || candidate?.ignored || candidate?.reviewed || candidate?.linkedToAcsm) return false;
      return true;
    });
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
      const source = req.query.source || req.query.series || 'weekly';
      const refresh = String(req.query.refresh || '') === '1';
      const adminRefresh = refresh && await requireAdmin(req);
      let autoProcess: any = null;

      if (adminRefresh) {
        try {
          autoProcess = await service.processNewEvents({ source });
        } catch (error) {
          autoProcess = { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
      }

      const payload = await service.getChampionshipPayload(refresh, source);
      res.json({
        ...payload,
        refresh,
        autoProcess: adminRefresh ? autoProcess : null
      });
    } catch (error) {
      res.status(200).json(formatStrackerMirrorError(error));
    }
  });

  app.get('/api/gc/ratings/event/:eventId', async (req, res) => {
    try {
      let eventId = String(req.params.eventId || '');
      try {
        eventId = decodeURIComponent(eventId);
      } catch {}
      const fallbackEnabled = String(req.query.fallback || '').trim() === '1';
      const payload = await service.getEvent(eventId, { fallback: fallbackEnabled });
      if (!payload) return res.status(404).json({ ok: false, source: 'gc-ratings-v1', eventSource: 'none', message: 'Evento no encontrado.' });
      res.status(payload.ok === false ? 404 : 200).json(payload);
    } catch (error) {
      res.status(200).json(formatStrackerMirrorError(error));
    }
  });

  app.get('/api/gc/ratings/driver/:driverKey', async (req, res) => {
    try {
      const payload = await service.getDriver(String(req.params.driverKey || ''));
      if (!payload) return res.status(404).json({ ok: false, source: 'gc-ratings-v1', message: 'Piloto no encontrado.' });
      res.json(payload);
    } catch (error) {
      res.status(200).json(formatStrackerMirrorError(error));
    }
  });

  app.get('/api/gc/ratings/leaderboard', async (_req, res) => {
    try {
      res.json(await service.getLeaderboard());
    } catch (error) {
      res.status(200).json(formatStrackerMirrorError(error));
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
      const payload = await service.processNewEvents({ source: req.query.source || req.body?.source || 'weekly' });
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
        const payload = await service.rebuild({ source: req.query.source || req.body?.source || 'weekly' });
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
      const payload = await service.processNewEvents({ source: req.query.source || req.body?.source || 'weekly' });
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
      const fallbackEnabled = String(req.query.fallback || '').trim() === '1';
      const mirrorDiagnostics = await getStrackerMirrorDiagnostics();
      const snapshot = await service.getSnapshot();
      const minDrivers = 3;
      const minTotalLaps = 1;

      let candidateSource: 'sql-mirror' | 'stracker-db3-fallback' | 'none' = 'none';
      let candidates: any[] = [];
      let syncRequired = true;

      if (mirrorDiagnostics.mirrorDriver) {
        const mirrorPayload = await getStrackerRaceCandidatesFromMirror({
          limit: req.query.limit
        });
        candidates = filterCandidateRows(mirrorPayload.candidates || [], snapshot);
        const hasMirrorData = Number(mirrorDiagnostics.sessionsImported || 0) > 0 || candidates.length > 0;
        if (hasMirrorData) {
          candidateSource = 'sql-mirror';
          syncRequired = false;
        } else if (fallbackEnabled) {
          const fallbackPayload = await service.getStrackerRaceCandidates({
            limit: req.query.limit,
            minDrivers,
            minTotalLaps
          });
          candidates = filterCandidateRows((fallbackPayload.candidates || []).map((candidate: any) => ({
            ...candidate,
            source: 'stracker-db3-fallback',
            mirrorDriver: mirrorDiagnostics.mirrorDriver
          })), snapshot);
          candidateSource = 'stracker-db3-fallback';
          syncRequired = false;
        } else {
          candidates = [];
          candidateSource = 'none';
          syncRequired = Number(mirrorDiagnostics.sessionsImported || 0) === 0;
        }
      } else if (fallbackEnabled) {
        const fallbackPayload = await service.getStrackerRaceCandidates({
          limit: req.query.limit,
          minDrivers,
          minTotalLaps
        });
        candidates = filterCandidateRows((fallbackPayload.candidates || []).map((candidate: any) => ({
          ...candidate,
          source: 'stracker-db3-fallback',
          mirrorDriver: 'sqlite'
        })), snapshot);
        candidateSource = 'stracker-db3-fallback';
        syncRequired = false;
      }

      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        candidateSource,
        mirrorDriver: mirrorDiagnostics.mirrorDriver || 'sqlite',
        minDrivers,
        minTotalLaps,
        syncRequired,
        candidates,
        ignoredSessions: Array.isArray(snapshot?.ignoredStrackerSessions) ? snapshot.ignoredStrackerSessions : [],
        reviewedSessions: Array.isArray(snapshot?.reviewedStrackerSessions) ? snapshot.reviewedStrackerSessions : []
      });
    } catch (error) {
      res.status(200).json(formatStrackerMirrorError(error));
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

  app.post('/api/gc/ratings/sync-stracker-mysql', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });
      const payload = await syncStrackerToSqlMirror({
        limit: req.body?.limit ?? req.query.limit
      });

      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        storage: payload.storage,
        sessionsSeen: payload.sessionsSeen,
        sessionsImported: payload.sessionsImported,
        driversImported: payload.driversImported,
        lapsImported: payload.lapsImported,
        incidentsImported: payload.incidentsImported,
        fullSync: payload.fullSync ?? false,
        limit: payload.limit ?? null,
        sourceSessionsTotal: payload.sourceSessionsTotal ?? payload.sessionsSeen,
        durationMs: payload.durationMs
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/gc/ratings/stracker-mysql-diagnostics', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });

      const mirrorDiagnostics = await getStrackerMirrorDiagnostics();
      const snapshot = await service.getSnapshot();

      res.json({
        ok: mirrorDiagnostics.ok,
        source: 'gc-ratings-v1',
        mirrorDriver: mirrorDiagnostics.mirrorDriver,
        storage: snapshot.storage,
        mysqlConfigured: mirrorDiagnostics.mysqlConfigured,
        dbName: mirrorDiagnostics.dbName || null,
        tables: mirrorDiagnostics.tables,
        sessionsImported: mirrorDiagnostics.sessionsImported ?? 0,
        latestSync: mirrorDiagnostics.latestSync ?? null,
        latestSession: mirrorDiagnostics.latestSession ?? null,
        strackerDbPath: mirrorDiagnostics.strackerDbPath ?? null,
        strackerDbExists: Boolean(mirrorDiagnostics.strackerDbExists)
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/gc/ratings/sync-stracker-sql', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });
      const payload = await syncStrackerToSqlMirror({
        limit: req.body?.limit ?? req.query.limit
      });

      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        storage: payload.storage,
        sessionsSeen: payload.sessionsSeen,
        sessionsImported: payload.sessionsImported,
        driversImported: payload.driversImported,
        lapsImported: payload.lapsImported,
        incidentsImported: payload.incidentsImported,
        fullSync: payload.fullSync ?? false,
        limit: payload.limit ?? null,
        sourceSessionsTotal: payload.sourceSessionsTotal ?? payload.sessionsSeen,
        durationMs: payload.durationMs
      });
    } catch (error) {
      res.status(200).json({ ok: false, source: 'gc-ratings-v1', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/gc/ratings/stracker-sql-diagnostics', async (req, res) => {
    try {
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });

      const mirrorDiagnostics = await getStrackerMirrorDiagnostics();
      const snapshot = await service.getSnapshot();

      res.json({
        ok: mirrorDiagnostics.ok,
        source: 'gc-ratings-v1',
        mirrorDriver: mirrorDiagnostics.mirrorDriver,
        storage: snapshot.storage,
        mysqlConfigured: mirrorDiagnostics.mysqlConfigured,
        dbName: mirrorDiagnostics.dbName || null,
        sqlitePath: mirrorDiagnostics.sqlitePath,
        sqliteExists: mirrorDiagnostics.sqliteExists,
        strackerDbPath: mirrorDiagnostics.strackerDbPath ?? null,
        strackerDbExists: Boolean(mirrorDiagnostics.strackerDbExists),
        tables: mirrorDiagnostics.tables,
        sessionsImported: mirrorDiagnostics.sessionsImported ?? 0,
        latestSync: mirrorDiagnostics.latestSync ?? null,
        latestSession: mirrorDiagnostics.latestSession ?? null,
        message: mirrorDiagnostics.message ?? null
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
      const payload = await service.rebuild({ source: req.query.source || req.body?.source || 'weekly' });
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
