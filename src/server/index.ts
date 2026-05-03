import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { bootstrapDiscordModule } from './modules/discord/discord.module';
import { bootstrapStrackerModule } from './modules/stracker/stracker.module';
import { bootstrapUsersModule } from './modules/users/users.module';
import { createBaseRuntimeInfo, resolveProjectPaths } from './lib/runtime-info';
import { registerApiRoutes } from './routes/api';
import { serveAstroStatic } from './lib/serve-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { rootDir, distDir } = resolveProjectPaths(__dirname);

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const runtime = createBaseRuntimeInfo({
  rootDir,
  distDir,
  port: PORT,
  host: HOST
});

runtime.modules.discord = await bootstrapDiscordModule();
runtime.modules.stracker = await bootstrapStrackerModule(rootDir);
runtime.modules.users = await bootstrapUsersModule();

registerApiRoutes(app, runtime);
serveAstroStatic(app, distDir);

app.listen(PORT, HOST, () => {
  console.log(`[GC] Servidor activo en ${HOST}:${PORT}`);
  console.log(`[GC] Modo: ${runtime.mode}`);
  console.log(`[GC] Web: ${runtime.modules.web.status}`);
  console.log(`[GC] Discord: ${runtime.modules.discord.status}`);
  console.log(`[GC] Stracker: ${runtime.modules.stracker.status}`);
  console.log(`[GC] Users: ${runtime.modules.users.status}`);
});
