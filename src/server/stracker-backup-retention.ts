import fs from 'node:fs/promises';
import path from 'node:path';

let retentionStarted = false;
let retentionRunning = false;

function envBool(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function envInt(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getStrackerBackupDir() {
  const explicitDir = process.env.STRACKER_BACKUP_DIR?.trim();
  if (explicitDir) return explicitDir;

  const dbPath = process.env.STRACKER_DB_PATH?.trim();
  if (dbPath) return path.dirname(dbPath);

  return path.resolve(process.cwd(), 'data', 'stracker');
}

async function listBackupFiles(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const backups: Array<{ name: string; fullPath: string; mtimeMs: number }> = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith('stracker.db3.backup-')) continue;

    const fullPath = path.join(dir, entry.name);
    try {
      const stat = await fs.stat(fullPath);
      backups.push({ name: entry.name, fullPath, mtimeMs: stat.mtimeMs });
    } catch {
      // Ignore files deleted while scanning.
    }
  }

  backups.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return backups;
}

export async function pruneStrackerBackups(reason = 'manual') {
  const started = Date.now();
  const enabled = envBool('STRACKER_BACKUP_RETENTION_ENABLED', true);
  if (!enabled) return { ok: true, enabled: false, deleted: 0, kept: 0, found: 0, durationMs: Date.now() - started };

  if (retentionRunning) {
    return { ok: true, enabled: true, skipped: true, reason: 'already-running', deleted: 0, kept: 0, found: 0, durationMs: Date.now() - started };
  }

  retentionRunning = true;
  const dir = getStrackerBackupDir();
  const keep = envInt('STRACKER_BACKUP_RETENTION_KEEP', 2);

  try {
    await fs.mkdir(dir, { recursive: true });
    const backups = await listBackupFiles(dir);
    const toDelete = backups.slice(keep);
    let deleted = 0;

    for (const backup of toDelete) {
      if (!path.basename(backup.fullPath).startsWith('stracker.db3.backup-')) continue;
      try {
        await fs.unlink(backup.fullPath);
        deleted += 1;
      } catch {
        // Keep app safe if one delete fails.
      }
    }

    const durationMs = Date.now() - started;
    console.log(`[GC STRacker Retention] ${reason}: found=${backups.length} kept=${Math.min(keep, backups.length)} deleted=${deleted} duration=${durationMs}ms dir=${dir}`);

    return { ok: true, enabled: true, dir, keep, found: backups.length, kept: Math.min(keep, backups.length), deleted, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    console.warn('[GC STRacker Retention] cleanup failed:', error);
    return { ok: false, enabled: true, dir, keep, found: 0, kept: 0, deleted: 0, durationMs, error: error instanceof Error ? error.message : String(error) };
  } finally {
    retentionRunning = false;
  }
}

export function startStrackerBackupRetention() {
  if (retentionStarted) return;
  retentionStarted = true;

  const enabled = envBool('STRACKER_BACKUP_RETENTION_ENABLED', true);
  if (!enabled) {
    console.log('[GC STRacker Retention] disabled by STRACKER_BACKUP_RETENTION_ENABLED=false');
    return;
  }

  const syncInterval = envInt('STRACKER_AUTO_SYNC_INTERVAL_MINUTES', 5);
  const intervalMinutes = envInt('STRACKER_BACKUP_RETENTION_INTERVAL_MINUTES', syncInterval || 5);
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  console.log(`[GC STRacker Retention] enabled · keep=${envInt('STRACKER_BACKUP_RETENTION_KEEP', 2)} · every=${intervalMinutes}min · dir=${getStrackerBackupDir()}`);

  setTimeout(() => {
    void pruneStrackerBackups('startup');
  }, 15000).unref?.();

  setInterval(() => {
    void pruneStrackerBackups('interval');
  }, intervalMs).unref?.();
}
