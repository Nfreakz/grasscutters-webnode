import type { RowDataPacket } from 'mysql2/promise';
import { getDatabasePool } from '@/server/database/client';
import { siteConfig } from '@/config/site';

interface SourceRow extends RowDataPacket {
  sourceKey: 'main' | 'gt4';
  label: string;
  championshipKey: string | null;
  serverIp: string | null;
  lastImportFinishedAt: Date | string | null;
  lastImportStatus: string | null;
  totalLaps: number | string;
  validLaps: number | string;
  drivers: number | string;
  tracks: number | string;
  cars: number | string;
  latestTrack: string | null;
  latestCar: string | null;
  newestLapUnix: number | string | null;
}

interface SessionRow extends RowDataPacket {
  sessionId: number;
  type: string;
  track: string | null;
  startTime: Date | string | null;
  endTime: Date | string | null;
  playerCount: number | string;
  lapCount: number | string;
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function unixIso(value: number | string | null | undefined): string | null {
  const timestamp = num(value);
  return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}

export interface PublicChampionship {
  key: 'weekly' | 'gt4';
  sourceKey: 'main' | 'gt4';
  name: string;
  accent: 'lime' | 'teal';
  signupUrl: string;
  joinUrl: string;
  championshipUrl: string;
  sourceStatus: string | null;
  lastImportFinishedAt: string | null;
  totalLaps: number;
  validLaps: number;
  drivers: number;
  tracks: number;
  cars: number;
  latestCombo: {
    track: string | null;
    car: string | null;
    newestLapAt: string | null;
  } | null;
  recentSessions: Array<{
    sessionId: number;
    type: string;
    track: string | null;
    startTime: string | null;
    endTime: string | null;
    playerCount: number;
    lapCount: number;
  }>;
  acsmIntegrated: false;
}

export interface PublicChampionshipsData {
  ok: true;
  generatedAt: string;
  championships: PublicChampionship[];
  limitations: string[];
}

export async function getPublicChampionshipsData(): Promise<PublicChampionshipsData> {
  const pool = getDatabasePool();

  const [sourceRows] = await pool.query<SourceRow[]>(`
    SELECT
      s.source_key AS sourceKey,
      s.label,
      s.championship_key AS championshipKey,
      s.server_ip AS serverIp,
      s.last_import_finished_at AS lastImportFinishedAt,
      s.last_import_status AS lastImportStatus,
      COUNT(l.lap_uid) AS totalLaps,
      COALESCE(SUM(l.valid = 1), 0) AS validLaps,
      COUNT(DISTINCT NULLIF(TRIM(l.steam_guid), '')) AS drivers,
      COUNT(DISTINCT NULLIF(TRIM(l.track_display), '')) AS tracks,
      COUNT(DISTINCT NULLIF(TRIM(l.car_display), '')) AS cars,
      (
        SELECT l2.track_display
        FROM gc_stracker2_lap l2
        WHERE l2.source_key = s.source_key
          AND l2.timestamp_unix IS NOT NULL
        ORDER BY l2.timestamp_unix DESC
        LIMIT 1
      ) AS latestTrack,
      (
        SELECT l3.car_display
        FROM gc_stracker2_lap l3
        WHERE l3.source_key = s.source_key
          AND l3.timestamp_unix IS NOT NULL
        ORDER BY l3.timestamp_unix DESC
        LIMIT 1
      ) AS latestCar,
      (
        SELECT l4.timestamp_unix
        FROM gc_stracker2_lap l4
        WHERE l4.source_key = s.source_key
          AND l4.timestamp_unix IS NOT NULL
        ORDER BY l4.timestamp_unix DESC
        LIMIT 1
      ) AS newestLapUnix
    FROM gc_stracker2_source s
    LEFT JOIN gc_stracker2_lap l
      ON l.source_key = s.source_key
    WHERE s.source_key IN ('main', 'gt4')
    GROUP BY
      s.source_key,
      s.label,
      s.championship_key,
      s.server_ip,
      s.last_import_finished_at,
      s.last_import_status
    ORDER BY FIELD(s.source_key, 'main', 'gt4')
  `);

  const [sessionRows] = await pool.query<SessionRow[]>(`
    SELECT
      session_id AS sessionId,
      type,
      track_display AS track,
      start_time AS startTime,
      end_time AS endTime,
      player_count AS playerCount,
      lap_count AS lapCount
    FROM gc_stracker_session
    ORDER BY COALESCE(start_time, imported_at) DESC
    LIMIT 8
  `);

  const sourceMap = new Map(sourceRows.map((row) => [row.sourceKey, row]));
  const ligaConfig = siteConfig.servers[0];
  const gt4Config = siteConfig.servers[1];

  const definitions = [
    {
      key: 'weekly' as const,
      sourceKey: 'main' as const,
      config: ligaConfig,
      accent: 'lime' as const,
      championshipUrl:
        'http://145.239.131.153:8840/championship/ad89ce26-0206-40f2-adec-451cf221d4e6'
    },
    {
      key: 'gt4' as const,
      sourceKey: 'gt4' as const,
      config: gt4Config,
      accent: 'teal' as const,
      championshipUrl:
        'http://5.39.68.161:8840/championship/bef21906-b596-4514-aebb-7235ec02bd50'
    }
  ];

  const championships: PublicChampionship[] = definitions.map((definition) => {
    const source = sourceMap.get(definition.sourceKey);

    return {
      key: definition.key,
      sourceKey: definition.sourceKey,
      name: definition.config.championshipName,
      accent: definition.accent,
      signupUrl: definition.config.signupUrl,
      joinUrl: definition.config.joinUrl,
      championshipUrl: definition.championshipUrl,
      sourceStatus: source?.lastImportStatus ?? null,
      lastImportFinishedAt: iso(source?.lastImportFinishedAt),
      totalLaps: num(source?.totalLaps),
      validLaps: num(source?.validLaps),
      drivers: num(source?.drivers),
      tracks: num(source?.tracks),
      cars: num(source?.cars),
      latestCombo: source
        ? {
            track: source.latestTrack,
            car: source.latestCar,
            newestLapAt: unixIso(source.newestLapUnix)
          }
        : null,
      recentSessions:
        definition.sourceKey === 'main'
          ? sessionRows.map((row) => ({
              sessionId: row.sessionId,
              type: row.type,
              track: row.track,
              startTime: iso(row.startTime),
              endTime: iso(row.endTime),
              playerCount: num(row.playerCount),
              lapCount: num(row.lapCount)
            }))
          : [],
      acsmIntegrated: false
    };
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    championships,
    limitations: [
      'Los datos deportivos proceden de la última importación sTracker/MySQL.',
      'Calendario, inscritos y clasificación oficial seguirán enlazando a ACSM hasta completar su ingesta normalizada.',
      'No se mezclan puntos, inscritos ni sesiones entre Liga y GT4.'
    ]
  };
}
