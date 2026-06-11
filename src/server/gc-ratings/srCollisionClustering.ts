export type SrCollisionLike = {
  driverKey: string;
  timestampMs: number;
  type?: string;
  opponentKey?: string;
  lap?: number | null;
};

export type SrCollisionCluster = {
  driverKey: string;
  startedAtMs: number;
  endedAtMs: number;
  events: SrCollisionLike[];
  rawCount: number;
  uniqueOpponents: number;
};

export function clusterSrCollisions(
  collisions: SrCollisionLike[],
  windowSeconds = 10
): SrCollisionCluster[] {
  const windowMs = Math.max(0, windowSeconds) * 1000;
  const byDriver = new Map<string, SrCollisionLike[]>();

  for (const event of collisions) {
    if (!event?.driverKey || !Number.isFinite(event.timestampMs)) continue;
    const list = byDriver.get(event.driverKey) || [];
    list.push(event);
    byDriver.set(event.driverKey, list);
  }

  const clusters: SrCollisionCluster[] = [];

  for (const [driverKey, events] of byDriver.entries()) {
    const sorted = [...events].sort((a, b) => a.timestampMs - b.timestampMs);
    let current: SrCollisionCluster | null = null;

    for (const event of sorted) {
      if (!current) {
        current = {
          driverKey,
          startedAtMs: event.timestampMs,
          endedAtMs: event.timestampMs,
          events: [event],
          rawCount: 1,
          uniqueOpponents: event.opponentKey ? 1 : 0
        };
        continue;
      }

      const insideWindow = event.timestampMs - current.startedAtMs <= windowMs;

      if (insideWindow) {
        current.events.push(event);
        current.endedAtMs = Math.max(current.endedAtMs, event.timestampMs);
        current.rawCount += 1;
        current.uniqueOpponents = new Set(
          current.events.map((item) => item.opponentKey).filter(Boolean)
        ).size;
      } else {
        clusters.push(current);
        current = {
          driverKey,
          startedAtMs: event.timestampMs,
          endedAtMs: event.timestampMs,
          events: [event],
          rawCount: 1,
          uniqueOpponents: event.opponentKey ? 1 : 0
        };
      }
    }

    if (current) clusters.push(current);
  }

  return clusters;
}
