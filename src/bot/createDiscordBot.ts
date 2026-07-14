import { createRequire } from 'node:module';
import { env } from '../config/env';
import { logger } from '../shared/logger';

const require = createRequire(import.meta.url);

type DiscordUserLike = {
  tag?: string;
  setPresence?: (presence: unknown) => unknown;
};

type DiscordClientLike = {
  user?: DiscordUserLike | null;
  once: (event: string, listener: () => void) => unknown;
  login: (token: string) => Promise<unknown>;
};

type DiscordRuntime = {
  Client: new (options: unknown) => DiscordClientLike;
  GatewayIntentBits: {
    Guilds: number;
    GuildMessages: number;
  };
  ActivityType: {
    Watching: number;
  };
};

let client: DiscordClientLike | null = null;
let loadAttempted = false;
let runtime: DiscordRuntime | null = null;

function loadDiscordRuntime(): DiscordRuntime | null {
  if (runtime) return runtime;
  if (loadAttempted) return null;
  loadAttempted = true;

  try {
    runtime = require('discord.js') as DiscordRuntime;
    return runtime;
  } catch (error) {
    logger.warn(
      'discord',
      'DISCORD_ENABLED=true, pero discord.js no está instalado. El bot queda desactivado sin afectar a la web.',
      error
    );
    return null;
  }
}

export async function startDiscordBot() {
  if (!env.DISCORD_ENABLED) {
    logger.info('discord', 'Bot desactivado por DISCORD_ENABLED=false');
    return null;
  }

  if (!env.DISCORD_TOKEN) {
    logger.warn('discord', 'DISCORD_ENABLED=true pero falta DISCORD_TOKEN');
    return null;
  }

  if (client) return client;

  const discord = loadDiscordRuntime();
  if (!discord) return null;

  client = new discord.Client({
    intents: [
      discord.GatewayIntentBits.Guilds,
      discord.GatewayIntentBits.GuildMessages
    ]
  });

  client.once('ready', () => {
    logger.info('discord', `Bot conectado como ${client?.user?.tag ?? 'desconocido'}`);

    client?.user?.setPresence?.({
      activities: [
        {
          name: 'GrassCutters Racing',
          type: discord.ActivityType.Watching
        }
      ],
      status: 'online'
    });
  });

  await client.login(env.DISCORD_TOKEN);
  return client;
}

export function getDiscordClient() {
  return client;
}
