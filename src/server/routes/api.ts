import type { Express } from 'express';
import type { RuntimeInfo } from '../lib/runtime-info';
import { mockPilots } from '../modules/users/users.module';

export function registerApiRoutes(app: Express, runtime: RuntimeInfo) {
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: runtime.appName,
      mode: runtime.mode,
      startedAt: runtime.startedAt
    });
  });

  app.get('/api/status', (_req, res) => {
    res.json({
      ok: true,
      message: 'GC API modular funcionando en Hostinger',
      mode: runtime.mode,
      modules: {
        web: runtime.modules.web.enabled,
        api: runtime.modules.api.enabled,
        discord: runtime.modules.discord.enabled,
        stracker: runtime.modules.stracker.enabled,
        users: runtime.modules.users.enabled
      },
      moduleStatus: runtime.modules,
      note: 'Paquete modular seguro: web y API activas; Discord, stracker y usuarios reales aún no arrancan.'
    });
  });

  app.get('/api/modules', (_req, res) => {
    res.json({
      ok: true,
      modules: runtime.modules
    });
  });

  app.get('/api/discord/status', (_req, res) => {
    res.json({
      ok: true,
      discord: runtime.modules.discord
    });
  });

  app.get('/api/stracker/status', (_req, res) => {
    res.json({
      ok: true,
      stracker: runtime.modules.stracker
    });
  });

  app.get('/api/stracker/tables', (_req, res) => {
    res.json({
      ok: false,
      tables: [],
      message: 'Detector de tablas pendiente. Este paquete solo comprueba estructura y estabilidad.'
    });
  });

  app.get('/api/hotlaps', (_req, res) => {
    res.json({
      ok: false,
      items: [],
      message: 'Hotlaps pendiente de lectura real de stracker.db3.'
    });
  });

  app.get('/api/pilots', (_req, res) => {
    res.json({
      ok: true,
      mode: 'mock',
      items: mockPilots,
      message: 'Área de pilotos en maqueta. La base real se activará en el siguiente bloque.'
    });
  });

  app.get('/api/events/upcoming', (_req, res) => {
    res.json({
      ok: true,
      items: [],
      message: 'Eventos pendientes de base de datos.'
    });
  });

  app.get('/api/debug/runtime', (_req, res) => {
    res.json({
      ok: true,
      runtime: {
        appName: runtime.appName,
        mode: runtime.mode,
        nodeEnv: runtime.nodeEnv,
        startedAt: runtime.startedAt,
        port: runtime.port,
        host: runtime.host,
        distDir: runtime.distDir
      }
    });
  });
}
