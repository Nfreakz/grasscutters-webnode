import fs from 'node:fs';
import path from 'node:path';
import type { ModuleState } from '../../lib/runtime-info';

export type StrackerModule = ModuleState & {
  dbPath?: string;
};

export async function bootstrapStrackerModule(rootDir: string): Promise<StrackerModule> {
  const rawDbPath = process.env.STRACKER_DB_PATH;

  if (!rawDbPath) {
    return {
      enabled: false,
      status: 'disabled',
      message: 'STRACKER_DB_PATH no está definido. stracker queda apagado.'
    };
  }

  const dbPath = path.isAbsolute(rawDbPath) ? rawDbPath : path.join(rootDir, rawDbPath);
  const fileExists = fs.existsSync(dbPath);

  return {
    enabled: fileExists,
    status: fileExists ? 'ready_later' : 'missing_config',
    message: fileExists
      ? 'stracker.db3 existe, pero todavía no se lee en este paquete.'
      : 'STRACKER_DB_PATH está definido, pero el archivo no existe en Hostinger.',
    dbPath,
    details: {
      fileExists
    }
  };
}
