import fs from 'node:fs';
import path from 'node:path';

export type ModuleState = {
  enabled: boolean;
  status: 'active' | 'disabled' | 'mock' | 'missing_config' | 'ready_later';
  message: string;
  details?: Record<string, unknown>;
};

export type RuntimeInfo = {
  appName: string;
  mode: string;
  nodeEnv: string;
  port: number;
  host: string;
  rootDir: string;
  distDir: string;
  startedAt: string;
  modules: {
    web: ModuleState;
    api: ModuleState;
    discord: ModuleState;
    stracker: ModuleState;
    users: ModuleState;
  };
};

function exists(targetPath: string) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

export function resolveProjectPaths(serverDirname: string) {
  const rootDir = path.resolve(serverDirname, '../..');
  const distDir = path.join(rootDir, 'dist');

  return { rootDir, distDir };
}

export function createBaseRuntimeInfo(options: {
  rootDir: string;
  distDir: string;
  port: number;
  host: string;
}): RuntimeInfo {
  return {
    appName: 'grasscutters-node',
    mode: 'hostinger-modular-base',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: options.port,
    host: options.host,
    rootDir: options.rootDir,
    distDir: options.distDir,
    startedAt: new Date().toISOString(),
    modules: {
      web: {
        enabled: true,
        status: exists(options.distDir) ? 'active' : 'missing_config',
        message: exists(options.distDir)
          ? 'Web Astro estática servida desde dist.'
          : 'No existe dist. Ejecuta npm run build antes de arrancar.'
      },
      api: {
        enabled: true,
        status: 'active',
        message: 'API Express modular activa.'
      },
      discord: {
        enabled: false,
        status: 'disabled',
        message: 'Discord pendiente de activar.'
      },
      stracker: {
        enabled: false,
        status: 'disabled',
        message: 'stracker.db3 pendiente de conectar.'
      },
      users: {
        enabled: false,
        status: 'mock',
        message: 'Área de pilotos en modo maqueta.'
      }
    }
  };
}
