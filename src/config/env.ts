import 'dotenv/config';

type NodeEnvironment = 'development' | 'test' | 'production';

function text(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function optionalText(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function numberValue(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  const clean = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'si', 'sí'].includes(clean)) return true;
  if (['false', '0', 'no', 'off'].includes(clean)) return false;
  return fallback;
}

function nodeEnvironment(): NodeEnvironment {
  const value = String(process.env.NODE_ENV || '').trim().toLowerCase();
  return value === 'production' || value === 'test' ? value : 'development';
}

/**
 * Configuración ligera para módulos auxiliares.
 *
 * El servidor principal mantiene su propia lectura de variables en
 * src/server/index.ts. Este módulo no debe introducir una dependencia de
 * runtime adicional solo para leer valores sencillos.
 */
export const env = Object.freeze({
  NODE_ENV: nodeEnvironment(),
  PORT: numberValue('PORT', 3000),
  PUBLIC_SITE_URL: text('PUBLIC_SITE_URL', 'http://localhost:4321'),
  JWT_SECRET: text('JWT_SECRET', 'dev-secret-change-me'),
  APP_DB_PATH: text('APP_DB_PATH', './data/app/grasscutters-app.db'),
  STRACKER_DB_PATH: text('STRACKER_DB_PATH', './data/stracker/stracker.db3'),
  STRACKER_READONLY: booleanValue('STRACKER_READONLY', true),
  DISCORD_ENABLED: booleanValue('DISCORD_ENABLED', false),
  DISCORD_TOKEN: optionalText('DISCORD_TOKEN'),
  DISCORD_CHANNEL_ID: optionalText('DISCORD_CHANNEL_ID')
});
