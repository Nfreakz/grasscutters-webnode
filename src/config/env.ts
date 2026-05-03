import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4321),
  PUBLIC_SITE_URL: z.string().default('http://localhost:4321'),
  JWT_SECRET: z.string().default('dev-secret-change-me'),
  APP_DB_PATH: z.string().default('./data/app/grasscutters-app.db'),
  STRACKER_DB_PATH: z.string().default('./data/stracker/stracker.db3'),
  STRACKER_READONLY: z.coerce.boolean().default(true),
  DISCORD_ENABLED: z.coerce.boolean().default(false),
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_CHANNEL_ID: z.string().optional()
});

export const env = schema.parse(process.env);
