import type { ModuleState } from '../../lib/runtime-info';

export type PilotPreview = {
  id: string;
  name: string;
  role: 'driver' | 'admin';
  status: 'mock';
};

export const mockPilots: PilotPreview[] = [
  {
    id: 'gc-demo-001',
    name: 'Piloto demo',
    role: 'driver',
    status: 'mock'
  }
];

export async function bootstrapUsersModule(): Promise<ModuleState> {
  return {
    enabled: false,
    status: 'mock',
    message: 'Usuarios en modo maqueta. Login y base de datos pendientes.'
  };
}
