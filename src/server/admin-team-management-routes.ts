import type express from 'express';

type StorageDeps = {
  requireAdmin: (req: express.Request, res: express.Response) => Promise<any>;
  useMysqlStorage: () => boolean;
  useSqliteStorage: () => boolean;
  ensureMysqlSchema: () => Promise<void>;
  mysqlQuery: (sql: string, values?: unknown[]) => Promise<any[]>;
  mysqlExecute: (sql: string, values?: unknown[]) => Promise<any>;
  withAppSqliteDb: (callback: (db: any) => any, write?: boolean) => Promise<any>;
  sqliteQuery: (db: any, sql: string, values?: unknown[]) => any[];
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

export function registerAdminTeamManagementRoutes(app: express.Express, deps: StorageDeps) {
  const {
    requireAdmin,
    useMysqlStorage,
    useSqliteStorage,
    ensureMysqlSchema,
    mysqlQuery,
    mysqlExecute,
    withAppSqliteDb,
    sqliteQuery
  } = deps;

  app.get('/api/admin/teams', async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!useMysqlStorage() && !useSqliteStorage()) {
      res.status(400).json({ ok: false, teams: [], message: 'El sistema de equipos requiere MySQL o SQLite.' });
      return;
    }

    try {
      if (useMysqlStorage()) await ensureMysqlSchema();
      const teamRows = useMysqlStorage()
        ? await mysqlQuery(`SELECT t.*
            FROM gc_teams t
            WHERE t.status <> 'archived'
            ORDER BY t.name ASC, t.created_at ASC`)
        : await withAppSqliteDb((db) => sqliteQuery(db, `SELECT t.*
            FROM gc_teams t
            WHERE t.status <> 'archived'
            ORDER BY t.name ASC, t.created_at ASC`));

      const membershipRows = useMysqlStorage()
        ? await mysqlQuery(`SELECT m.id AS membership_id, m.team_id, m.user_id, m.role, m.status, m.joined_at,
              d.id AS driver_profile_id, d.driver_name, d.display_name, d.steam_guid, d.player_id
            FROM gc_team_memberships m
            JOIN gc_driver_profiles d ON d.id = m.driver_profile_id
            JOIN gc_teams t ON t.id = m.team_id
            WHERE m.status = 'active' AND t.status <> 'archived'
            ORDER BY m.team_id, CASE m.role WHEN 'owner' THEN 1 WHEN 'captain' THEN 2 WHEN 'driver' THEN 3 ELSE 4 END,
              d.display_name ASC, d.driver_name ASC`)
        : await withAppSqliteDb((db) => sqliteQuery(db, `SELECT m.id AS membership_id, m.team_id, m.user_id, m.role, m.status, m.joined_at,
              d.id AS driver_profile_id, d.driver_name, d.display_name, d.steam_guid, d.player_id
            FROM gc_team_memberships m
            JOIN gc_driver_profiles d ON d.id = m.driver_profile_id
            JOIN gc_teams t ON t.id = m.team_id
            WHERE m.status = 'active' AND t.status <> 'archived'
            ORDER BY m.team_id, d.display_name ASC, d.driver_name ASC`));

      const membersByTeam = new Map<string, any[]>();
      for (const row of membershipRows || []) {
        const teamId = text(row.team_id);
        const members = membersByTeam.get(teamId) || [];
        members.push({
          membershipId: text(row.membership_id),
          driverProfileId: text(row.driver_profile_id),
          userId: text(row.user_id) || null,
          displayName: text(row.display_name || row.driver_name) || 'Piloto sin nombre',
          driverName: text(row.driver_name) || null,
          steamGuid: text(row.steam_guid) || null,
          playerId: row.player_id ?? null,
          role: text(row.role) || 'driver',
          joinedAt: row.joined_at || null
        });
        membersByTeam.set(teamId, members);
      }

      const teams = (teamRows || []).map((row: any) => ({
        id: text(row.id),
        slug: text(row.slug),
        name: text(row.name) || 'Equipo sin nombre',
        shortName: text(row.short_name) || null,
        status: text(row.status) || 'active',
        createdAt: row.created_at || null,
        members: membersByTeam.get(text(row.id)) || []
      }));
      res.json({ ok: true, teams, count: teams.length });
    } catch (error) {
      console.error('[GC ADMIN TEAMS] list:', error);
      res.status(500).json({ ok: false, teams: [], message: 'No se pudieron cargar los equipos.' });
    }
  });

  app.delete('/api/admin/teams/:teamId/members/:membershipId', async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const teamId = text(req.params.teamId);
    const membershipId = text(req.params.membershipId);
    if (!teamId || !membershipId) {
      res.status(400).json({ ok: false, message: 'Equipo o membresía no válidos.' });
      return;
    }

    try {
      const now = new Date().toISOString();
      const rows = useMysqlStorage()
        ? await mysqlQuery(`SELECT m.id, m.user_id, t.name AS team_name, d.display_name, d.driver_name
            FROM gc_team_memberships m
            JOIN gc_teams t ON t.id = m.team_id
            JOIN gc_driver_profiles d ON d.id = m.driver_profile_id
            WHERE m.id = ? AND m.team_id = ? AND m.status = 'active' LIMIT 1`, [membershipId, teamId])
        : await withAppSqliteDb((db) => sqliteQuery(db, `SELECT m.id, m.user_id, t.name AS team_name, d.display_name, d.driver_name
            FROM gc_team_memberships m
            JOIN gc_teams t ON t.id = m.team_id
            JOIN gc_driver_profiles d ON d.id = m.driver_profile_id
            WHERE m.id = ? AND m.team_id = ? AND m.status = 'active' LIMIT 1`, [membershipId, teamId]));
      const member = rows?.[0];
      if (!member) {
        res.status(404).json({ ok: false, message: 'La membresía activa ya no existe.' });
        return;
      }

      if (useMysqlStorage()) {
        await mysqlExecute(`UPDATE gc_team_memberships SET status='removed', left_at=?, updated_at=?
          WHERE id=? AND team_id=? AND status='active'`, [now, now, membershipId, teamId]);
        if (member.user_id) {
          await mysqlExecute(`UPDATE gc_users SET team_name=NULL, team_logo_url=NULL, team_role=NULL, updated_at=?
            WHERE id=? AND team_name=?`, [now, member.user_id, member.team_name]);
        }
      } else {
        await withAppSqliteDb((db) => {
          db.run(`UPDATE gc_team_memberships SET status='removed', left_at=?, updated_at=?
            WHERE id=? AND team_id=? AND status='active'`, [now, now, membershipId, teamId]);
          if (member.user_id) db.run(`UPDATE gc_users SET team_name=NULL, team_logo_url=NULL, team_role=NULL, updated_at=?
            WHERE id=? AND team_name=?`, [now, member.user_id, member.team_name]);
        }, true);
      }
      res.json({ ok: true, message: `${text(member.display_name || member.driver_name) || 'Piloto'} eliminado del equipo.` });
    } catch (error) {
      console.error('[GC ADMIN TEAMS] remove member:', error);
      res.status(500).json({ ok: false, message: 'No se pudo eliminar el piloto del equipo.' });
    }
  });

  app.delete('/api/admin/teams/:teamId', async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const teamId = text(req.params.teamId);
    const confirmation = text(req.body?.confirmation);
    if (!teamId) {
      res.status(400).json({ ok: false, message: 'Equipo no válido.' });
      return;
    }

    try {
      const rows = useMysqlStorage()
        ? await mysqlQuery(`SELECT id, name FROM gc_teams WHERE id=? AND status <> 'archived' LIMIT 1`, [teamId])
        : await withAppSqliteDb((db) => sqliteQuery(db, `SELECT id, name FROM gc_teams WHERE id=? AND status <> 'archived' LIMIT 1`, [teamId]));
      const team = rows?.[0];
      if (!team) {
        res.status(404).json({ ok: false, message: 'El equipo ya no existe o ya está archivado.' });
        return;
      }
      if (confirmation !== text(team.name)) {
        res.status(400).json({ ok: false, message: 'La confirmación no coincide con el nombre exacto del equipo.' });
        return;
      }

      const now = new Date().toISOString();
      if (useMysqlStorage()) {
        await mysqlExecute(`UPDATE gc_users u
          JOIN gc_team_memberships m ON m.user_id = u.id
          SET u.team_name=NULL, u.team_logo_url=NULL, u.team_role=NULL, u.updated_at=?
          WHERE m.team_id=? AND m.status='active'`, [now, teamId]);
        await mysqlExecute(`UPDATE gc_team_memberships SET status='removed', left_at=?, updated_at=?
          WHERE team_id=? AND status='active'`, [now, now, teamId]);
        await mysqlExecute(`UPDATE gc_teams SET status='archived', updated_at=? WHERE id=?`, [now, teamId]);
      } else {
        await withAppSqliteDb((db) => {
          db.run(`UPDATE gc_users SET team_name=NULL, team_logo_url=NULL, team_role=NULL, updated_at=?
            WHERE id IN (SELECT user_id FROM gc_team_memberships WHERE team_id=? AND status='active' AND user_id IS NOT NULL)`, [now, teamId]);
          db.run(`UPDATE gc_team_memberships SET status='removed', left_at=?, updated_at=?
            WHERE team_id=? AND status='active'`, [now, now, teamId]);
          db.run(`UPDATE gc_teams SET status='archived', updated_at=? WHERE id=?`, [now, teamId]);
        }, true);
      }
      res.json({ ok: true, message: `${text(team.name)} eliminado de los equipos activos.` });
    } catch (error) {
      console.error('[GC ADMIN TEAMS] archive:', error);
      res.status(500).json({ ok: false, message: 'No se pudo eliminar el equipo.' });
    }
  });
}
