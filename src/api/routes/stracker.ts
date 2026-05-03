import type { Router } from 'express';
import { getHotlapsPreview, listStrackerTables } from '../../stracker/strackerService';
import { getLeaderboard } from '../../rankings/rankingService';

export function registerStrackerRoutes(router: Router) {
  router.get('/stracker/tables', (_req, res) => {
    res.json(listStrackerTables());
  });

  router.get('/hotlaps', (_req, res) => {
    res.json(getHotlapsPreview());
  });

  router.get('/leaderboard', (_req, res) => {
    res.json(getLeaderboard());
  });
}
