import type { Router } from 'express';
import { getDemoSessionUser } from '../../auth/session';
import { createDriverProfile, listDriverProfiles } from '../../users/userService';

export function registerUserRoutes(router: Router) {
  router.get('/pilots', (_req, res) => {
    res.json({
      ok: true,
      items: listDriverProfiles()
    });
  });

  router.get('/pilots/me', (_req, res) => {
    res.json({
      ok: true,
      user: getDemoSessionUser()
    });
  });

  router.post('/pilots/demo', (req, res) => {
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : 'Piloto demo';

    res.status(201).json({
      ok: true,
      item: createDriverProfile(displayName)
    });
  });
}
