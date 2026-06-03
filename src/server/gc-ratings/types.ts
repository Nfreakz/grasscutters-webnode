export type PlainObject = Record<string, any>;

export type MatchDebug = {
  confidence: number;
  method: string;
  bestLapDiffMs: number | null;
  lapDiff: number | null;
  strackerPlayerInSessionId: number | null;
  strackerSessionId: number | null;
};

export type RatingIncidentType =
  | 'OFF_TRACK'
  | 'CAR_CONTACT'
  | 'ENV_CONTACT'
  | 'DNF'
  | 'DSQ'
  | 'OFFICIAL_PENALTY';

export type RatingIncident = {
  id: string;
  eventResultId: string;
  eventId: string;
  driverKey: string;
  lapNumber: number | null;
  type: RatingIncidentType;
  count: number;
  srDelta: number;
  description: string;
  source: string;
};

export type RatingLapDetail = {
  id: string;
  eventResultId: string;
  lapNumber: number;
  lapTimeMs: number;
  valid: boolean;
  cuts: number;
  collisionsCar: number;
  collisionsEnv: number;
  srDelta: number;
  notes: string;
};

export type DriverRatingState = {
  driverKey: string;
  steamGuid: string | null;
  strackerPlayerId: number | null;
  displayName: string;
  srScore: number;
  srClass: string;
  gsrMu: number;
  gsrSigma: number;
  gsrRating: number;
  gsrClass: string;
  racesCount: number;
  cleanRaces: number;
  wins: number;
  podiums: number;
  incidentPointsTotal: number;
  lastDeltaSr: number;
  lastDeltaGsr: number;
  lastEventId: string | null;
  lastRaceAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RatingEventResult = {
  id: string;
  eventId: string;
  eventName: string;
  eventDate: string | null;
  strackerSessionId: number | null;
  driverKey: string;
  steamGuid: string | null;
  strackerPlayerId: number | null;
  displayName: string;
  car: string;
  position: number;
  points: number;
  laps: number;
  bestLapMs: number;
  bestLap: string;
  oldSr: number;
  newSr: number;
  deltaSr: number;
  oldGsr: number;
  newGsr: number;
  deltaGsr: number;
  gsrMuBefore: number;
  gsrMuAfter: number;
  gsrSigmaBefore: number;
  gsrSigmaAfter: number;
  incidentPoints: number;
  cleanRace: boolean;
  dnf: boolean;
  dsq: boolean;
  processedAt: string;
  incidents: RatingIncident[];
  lapsDetail: RatingLapDetail[];
  match: MatchDebug;
  notes: string[];
};

export type RecalculationLog = {
  id: string;
  eventId: string | null;
  mode: 'event' | 'championship';
  status: 'ok' | 'error';
  message: string;
  createdAt: string;
};

export type RatingsSnapshot = {
  version: 1;
  championshipId: string;
  championshipName: string;
  source: string;
  storage: 'json' | 'mysql';
  strackerDbPath: string | null;
  generatedAt: string;
  processedEventIds: string[];
  drivers: DriverRatingState[];
  eventResults: RatingEventResult[];
  recalculationLogs: RecalculationLog[];
};

export type ChampionshipRatingPayload = {
  ok: boolean;
  source: string;
  generatedAt: string;
  championship: PlainObject;
  leaderboard: {
    sr: PlainObject[];
    gsr: PlainObject[];
  };
  diagnostics: PlainObject;
};

