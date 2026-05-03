import type { Router } from 'express';
import { listUpcomingEvents } from '../../events/eventService';

export function registerEventRoutes(router: Router) {
  router.get('/events/upcoming', (_req, res) => {
    res.json({
      ok: true,
      items: listUpcomingEvents()
    });
  });
}
