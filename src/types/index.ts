export interface DriverProfile {
  id: string;
  displayName: string;
  steamGuid?: string;
  discordId?: string;
  avatarUrl?: string;
}

export interface HotlapEntry {
  id: string;
  driverName: string;
  car: string;
  track: string;
  lapTimeMs: number;
  sectors?: number[];
  createdAt?: string;
}

export interface GcEvent {
  id: string;
  title: string;
  description?: string;
  track?: string;
  car?: string;
  startsAt?: string;
}
