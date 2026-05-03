import 'dotenv/config';
import { z } from 'zod';

function parseBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    return clean === 'true' || clean === '1' || clean === 'yes' || clean === 'on';
  }
  return false;
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4321),
  PUBLIC_SITE_URL: z.string().default('http://localhost:4321'),
  JWT_SECRET: z.string().default('dev-secret-change-me'),
  APP_DB_PATH: z.string().default('./data/app/grasscutters-app.db'),
  STRACKER_DB_PATH: z.string().default('./data/stracker/stracker.db3'),
  STRACKER_READONLY: z.preprocess(parseBoolean, z.boolean()).default(true),
  DISCORD_ENABLED: z.preprocess(parseBoolean, z.boolean()).default(false),
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_CHANNEL_ID: z.string().optional()
});

export const env = schema.parse(process.env);
