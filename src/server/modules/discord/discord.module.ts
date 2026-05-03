import type { ModuleState } from '../../lib/runtime-info';

export async function bootstrapDiscordModule(): Promise<ModuleState> {
  const enabled = process.env.DISCORD_ENABLED === 'true';

  if (!enabled) {
    return {
      enabled: false,
      status: 'disabled',
      message: 'Discord desactivado. No se inicia el bot en este deploy.'
    };
  }

  if (!process.env.DISCORD_TOKEN) {
    return {
      enabled: true,
      status: 'missing_config',
      message: 'DISCORD_ENABLED=true, pero falta DISCORD_TOKEN.'
    };
  }

  return {
    enabled: true,
    status: 'ready_later',
    message: 'Discord configurado, pero el bot real todavía no se arranca en este paquete.'
  };
}
