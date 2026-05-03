import { ActivityType, Client, GatewayIntentBits } from 'discord.js';
import { env } from '../config/env';
import { logger } from '../shared/logger';

let client: Client | null = null;

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

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  client.once('ready', () => {
    logger.info('discord', `Bot conectado como ${client?.user?.tag ?? 'desconocido'}`);

    client?.user?.setPresence({
      activities: [
        {
          name: 'GrassCutters Racing',
          type: ActivityType.Watching
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
