import { createHash } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';

// GC_PHASE4H3_1_1_IDENTITY_MEMBERSHIP_COLLISION_DIAGNOSTICS_V1
const VERSION = 'GC_PHASE4H3_1_1_IDENTITY_MEMBERSHIP_COLLISION_DIAGNOSTICS_V1';

type IdentityMapping = {
  sourceProfileId: string;
  sourceDriverKey: string;
  canonicalProfileId: string;
  canonicalDriverKey: string;
  canonicalUserId?: string;
  displayName: string;
};

const mappings: IdentityMapping[] = [
  {
    sourceProfileId: 'drv_4b9e4286-bfaa-4fc9-8ab9-74192cbb3bb2',
    sourceDriverKey: 'name:police1370',
    canonicalProfileId: 'drv_24c9311c-5041-4d4e-8c42-e9727a1e5eac',
    canonicalDriverKey: 'steam:sha256#4ff0f10016835ea513a026a8708409aa9094304c3246ee0503757ec9c341aa5c',
    canonicalUserId: '9e5e76c6-8497-4d93-9e6c-83006ffcdb46',
    displayName: 'Police1370'
  },
  {
    sourceProfileId: 'drv_0b21fc11-1a65-4130-92e2-1a4f7dfef343',
    sourceDriverKey: 'name:pedro diaz',
    canonicalProfileId: 'drv_56d82b6c-84f7-4b02-b759-7d58cff205f9',
    canonicalDriverKey: 'steam:sha256#e1561220de2cf9b7247134c9b78ecfd59dad86638e993d4f8ed77a3135ff78ad',
    displayName: 'Pedro Diaz'
  },
  {
    sourceProfileId: 'drv_121b0c86-06d8-4f75-bea2-20a0ac0857d5',
    sourceDriverKey: 'name:neo',
    canonicalProfileId: 'drv_fce29813-f6ea-4d5d-90ae-09040ba34423',
    canonicalDriverKey: 'steam:sha256#882f3749605f88db5da6a53844ad0a6cb3366cc4427a137874abd800cf9e73cb',
    displayName: 'NEO'
  },
  {
    sourceProfileId: 'drv_3c4185e5-f2cd-476d-83b3-7f48181c9eef',
    sourceDriverKey: 'name:xan',
    canonicalProfileId: 'drv_71c4969f-e500-4863-8367-b75f21983016',
    canonicalDriverKey: 'steam:sha256#550e210571f1207127361a6ee59afb8928fbbd70c9f8374f50a50548e0e723d7',
    displayName: 'Xan'
  },
  {
    sourceProfileId: 'drv_7c72a2e6-9b71-4623-8e6c-b72a040b2eed',
    sourceDriverKey: 'player:27',
    canonicalProfileId: 'drv_eb8b2f76-b42b-4b34-9f20-a3936757ea3e',
    canonicalDriverKey: 'steam:sha256#395fed6144d462abb6504fc8173d6b9da33e1fcfb1a0b2302511caebf1bea70c',
    displayName: 'Player 27'
  },
  {
    sourceProfileId: 'drv_8dc2956f-34f3-42e0-8eeb-6e58d12c9d9e',
    sourceDriverKey: 'name:angel',
    canonicalProfileId: 'drv_d8a3945f-66f3-4590-b9da-cbf2a92c41c2',
    canonicalDriverKey: 'steam:sha256#6d5447c6b678d64852edae3909bb871b963dde0a2b66b7bc52634b16adfbfd26',
    displayName: 'Angel'
  },
  {
    sourceProfileId: 'drv_9de16504-359c-4866-a378-46658f043f81',
    sourceDriverKey: 'name:fran',
    canonicalProfileId: 'drv_cd255453-501c-4f13-b94f-334800a6fce0',
    canonicalDriverKey: 'steam:sha256#a6beaebae5a051c8329951606671893cee8e2a27207f28f0f3b283b0f567f487',
    displayName: 'Fran'
  },
  {
    sourceProfileId: 'drv_e846c750-ef0f-437b-8fd4-4a810513f2a2',
    sourceDriverKey: 'player:4',
    canonicalProfileId: 'drv_d8a3945f-66f3-4590-b9da-cbf2a92c41c2',
    canonicalDriverKey: 'steam:sha256#6d5447c6b678d64852edae3909bb871b963dde0a2b66b7bc52634b16adfbfd26',
    displayName: 'Angel'
  }
];

const planTokenMappings = mappings.map(({ displayName: _displayName, ...item }) => item);
const planHash = createHash('sha256').update(JSON.stringify(planTokenMappings)).digest('hex');
const sourceIds = mappings.map((item) => item.sourceProfileId);
const canonicalIds = [...new Set(mappings.map((item) => item.canonicalProfileId))];
const profileIds = [...new Set([...sourceIds, ...canonicalIds])];
const placeholders = (items: readonly unknown[]) => items.map(() => '?').join(',');
const text = (value: unknown) => String(value ?? '').trim();

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST?.trim() || process.env.DB_HOST?.trim(),
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    database: process.env.MYSQL_DATABASE?.trim() || process.env.DB_NAME?.trim(),
    user: process.env.MYSQL_USER?.trim() || process.env.DB_USER?.trim(),
    password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4',
    timezone: 'Z'
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function confirmationToken(snapshot: unknown) {
  return createHash('sha256')
    .update(`${planHash}:${stableJson(snapshot)}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
}

async function readState(pool: Pool) {
  const [profiles] = await pool.query<RowDataPacket[]>(
    `SELECT id, driver_key, linked_user_id, updated_at
       FROM gc_driver_profiles
      WHERE id IN (${placeholders(profileIds)})
      ORDER BY id`,
    profileIds
  );
  const [memberships] = await pool.query<RowDataPacket[]>(
    `SELECT m.id, m.driver_profile_id, m.team_id, m.user_id, m.role, m.status,
            m.joined_at, m.left_at, m.created_at, m.updated_at,
            t.name AS team_name, t.short_name AS team_short_name, t.status AS team_status
       FROM gc_team_memberships m
       LEFT JOIN gc_teams t ON t.id = m.team_id
      WHERE m.driver_profile_id IN (${placeholders(profileIds)})
      ORDER BY m.id`,
    profileIds
  );
  const [users] = await pool.query<RowDataPacket[]>(
    `SELECT id, pilot_player_id, pilot_steam_guid, pilot_stracker_name, updated_at
       FROM gc_users
      WHERE id = ?`,
    ['9e5e76c6-8497-4d93-9e6c-83006ffcdb46']
  );
  return {
    profiles: profiles as any[],
    memberships: memberships as any[],
    users: users as any[]
  };
}

function validateState(state: Awaited<ReturnType<typeof readState>>) {
  const blockers: string[] = [];
  const profileById = new Map(state.profiles.map((row) => [text(row.id), row]));

  for (const item of mappings) {
    const source = profileById.get(item.sourceProfileId);
    const canonical = profileById.get(item.canonicalProfileId);
    if (!source) {
      blockers.push(`Falta el perfil origen ${item.sourceProfileId}.`);
    } else if (text(source.driver_key) !== item.sourceDriverKey) {
      blockers.push(`${item.sourceProfileId}: driver_key cambió (${text(source.driver_key)}).`);
    }
    if (!canonical) {
      blockers.push(`Falta el perfil canónico ${item.canonicalProfileId}.`);
    } else if (text(canonical.driver_key) !== item.canonicalDriverKey) {
      blockers.push(`${item.canonicalProfileId}: driver_key canónico cambió (${text(canonical.driver_key)}).`);
    }
    if (item.canonicalUserId && canonical && text(canonical.linked_user_id) !== item.canonicalUserId) {
      blockers.push(`${item.canonicalProfileId}: no está enlazado a la cuenta canónica esperada.`);
    }
  }

  const police = state.users.find((row) => text(row.id) === '9e5e76c6-8497-4d93-9e6c-83006ffcdb46');
  if (!police) {
    blockers.push('Falta la cuenta canónica de Police1370.');
  } else {
    if (Number(police.pilot_player_id) !== 29) blockers.push('Police1370: pilot_player_id ya no es 29.');
    if (text(police.pilot_steam_guid) !== 'sha256#4ff0f10016835ea513a026a8708409aa9094304c3246ee0503757ec9c341aa5c') {
      blockers.push('Police1370: Steam ya no coincide con el preview.');
    }
  }

  const canonicalStatus = new Map<string, any>();
  for (const row of state.memberships) {
    if (!canonicalIds.includes(text(row.driver_profile_id))) continue;
    canonicalStatus.set(`${text(row.driver_profile_id)}::${text(row.status)}`, row);
  }
  for (const row of state.memberships) {
    const item = mappings.find((entry) => entry.sourceProfileId === text(row.driver_profile_id));
    if (!item) continue;
    const collision = canonicalStatus.get(`${item.canonicalProfileId}::${text(row.status)}`);
    if (collision) {
      blockers.push(
        `Colisión de membresía: ${text(row.id)} y ${text(collision.id)} quedarían en ${item.canonicalProfileId} con estado ${text(row.status)}.`
      );
    }
  }
  return blockers;
}

function membershipView(row: any) {
  return {
    membershipId: text(row.id),
    profileId: text(row.driver_profile_id),
    teamId: text(row.team_id),
    teamName: text(row.team_name) || null,
    teamShortName: text(row.team_short_name) || null,
    teamStatus: text(row.team_status) || null,
    userId: text(row.user_id) || null,
    role: text(row.role) || null,
    status: text(row.status),
    joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : null,
    leftAt: row.left_at ? new Date(row.left_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function collisionDetails(state: Awaited<ReturnType<typeof readState>>) {
  const canonicalStatus = new Map<string, any>();
  for (const row of state.memberships) {
    if (!canonicalIds.includes(text(row.driver_profile_id))) continue;
    canonicalStatus.set(`${text(row.driver_profile_id)}::${text(row.status)}`, row);
  }
  const collisions: any[] = [];
  for (const source of state.memberships) {
    const item = mappings.find((entry) => entry.sourceProfileId === text(source.driver_profile_id));
    if (!item) continue;
    const canonical = canonicalStatus.get(`${item.canonicalProfileId}::${text(source.status)}`);
    if (!canonical) continue;
    collisions.push({
      displayName: item.displayName,
      canonicalProfileId: item.canonicalProfileId,
      sameTeam: text(source.team_id) === text(canonical.team_id),
      sameUser: text(source.user_id) === text(canonical.user_id),
      sameRole: text(source.role) === text(canonical.role),
      source: membershipView(source),
      canonical: membershipView(canonical)
    });
  }
  return collisions;
}

function snapshotForToken(state: Awaited<ReturnType<typeof readState>>) {
  return {
    profiles: state.profiles.map((row) => ({
      id: text(row.id),
      driverKey: text(row.driver_key),
      linkedUserId: text(row.linked_user_id) || null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    })),
    memberships: state.memberships.map((row) => ({
      id: text(row.id),
      profileId: text(row.driver_profile_id),
      teamId: text(row.team_id),
      status: text(row.status),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    })),
    users: state.users.map((row) => ({
      id: text(row.id),
      playerId: row.pilot_player_id == null ? null : Number(row.pilot_player_id),
      steamGuid: text(row.pilot_steam_guid) || null,
      name: text(row.pilot_stracker_name) || null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    }))
  };
}

export async function runMysqlIdentityConsolidationPreflightV1() {
  const config = mysqlConfig();
  if (!config.host || !config.database || !config.user) {
    throw new Error('El preflight 4H.3 requiere MySQL configurado en producción.');
  }
  const mod: any = await import('mysql2/promise');
  const mysql = mod.default ?? mod;
  const pool: Pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 2 });
  try {
    const state = await readState(pool);
    const blockers = validateState(state);
    const sourceMemberships = state.memberships.filter((row) => sourceIds.includes(text(row.driver_profile_id)));
    const token = blockers.length ? null : confirmationToken(snapshotForToken(state));
    return {
      ok: true,
      source: 'gc-ratings-v1:identity-consolidation-preflight:mysql',
      version: VERSION,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      writesAvailable: false,
      destructiveChangesApplied: false,
      readyForApplyDesign: blockers.length === 0,
      planHash,
      confirmationToken: token,
      summary: {
        sourceProfiles: sourceIds.length,
        canonicalProfiles: canonicalIds.length,
        membershipsToMove: sourceMemberships.length,
        usersVerified: state.users.length,
        blockers: blockers.length
      },
      blockers,
      collisionDetails: collisionDetails(state),
      plan: mappings.map((item) => ({
        displayName: item.displayName,
        sourceProfileId: item.sourceProfileId,
        sourceDriverKey: item.sourceDriverKey,
        canonicalProfileId: item.canonicalProfileId,
        canonicalDriverKey: item.canonicalDriverKey,
        membershipsToMove: sourceMemberships.filter((row) => text(row.driver_profile_id) === item.sourceProfileId).length
      })),
      message: blockers.length
        ? 'Preflight bloqueado. No se ha modificado MySQL.'
        : 'Preflight superado. No se ha modificado MySQL; la aplicación web todavía no está habilitada.'
    };
  } finally {
    await pool.end();
  }
}
