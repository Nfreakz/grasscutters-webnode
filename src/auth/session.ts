export interface SessionUser {
  id: string;
  displayName: string;
  roles: string[];
}

export function getDemoSessionUser(): SessionUser {
  return {
    id: 'demo-driver',
    displayName: 'Piloto demo',
    roles: ['driver']
  };
}
