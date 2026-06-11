import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSrComputation } from './srModel';
import { clusterSrCollisions } from './srCollisionClustering';

test('clusters repeated collisions from the same driver into one incident window', () => {
  const clusters = clusterSrCollisions([
    { driverKey: 'driver-a', timestampMs: 120_000, type: 'CAR_CONTACT' },
    { driverKey: 'driver-a', timestampMs: 122_000, type: 'CAR_CONTACT' },
    { driverKey: 'driver-a', timestampMs: 126_000, type: 'CAR_CONTACT' },
    { driverKey: 'driver-a', timestampMs: 129_000, type: 'CAR_CONTACT' }
  ]);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].driverKey, 'driver-a');
  assert.equal(clusters[0].rawCount, 4);
});

test('splits collisions separated by more than the window', () => {
  const clusters = clusterSrCollisions([
    { driverKey: 'driver-a', timestampMs: 120_000, type: 'CAR_CONTACT' },
    { driverKey: 'driver-a', timestampMs: 145_000, type: 'CAR_CONTACT' }
  ]);

  assert.equal(clusters.length, 2);
});

test('keeps separate clusters per driver inside the same time window', () => {
  const clusters = clusterSrCollisions([
    { driverKey: 'driver-a', timestampMs: 120_000, type: 'CAR_CONTACT' },
    { driverKey: 'driver-b', timestampMs: 122_000, type: 'CAR_CONTACT' }
  ]);

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((cluster) => cluster.driverKey).sort(), ['driver-a', 'driver-b']);
});

test('buildSrComputation uses clustered collision counts while preserving raw diagnostics', () => {
  const result = buildSrComputation({
    eventId: 'event-1',
    eventResultId: 'result-1',
    driverKey: 'driver-a',
    oldSr: 80,
    laps: [
      { lapNumber: 1, lapTimeMs: 90_000, sessionTimeMs: 120_000, collisionsCar: 2, collisionsEnv: 1, cuts: 0, valid: true },
      { lapNumber: 2, lapTimeMs: 89_000, sessionTimeMs: 122_000, collisionsCar: 1, collisionsEnv: 0, cuts: 0, valid: true },
      { lapNumber: 3, lapTimeMs: 91_000, sessionTimeMs: 126_000, collisionsCar: 1, collisionsEnv: 0, cuts: 1, valid: false },
      { lapNumber: 4, lapTimeMs: 92_000, sessionTimeMs: 129_000, collisionsCar: 0, collisionsEnv: 0, cuts: 0, valid: true }
    ],
    officialResult: {
      numLaps: 4,
      status: 'FINISHED',
      __srTelemetryReliable: true
    },
    matchedRow: { PlayerInSessionId: 7 },
    maxRaceLaps: 4
  });

  assert.equal(result.breakdown.rawCollisionCount, 4);
  assert.equal(result.breakdown.collisionClusterCount, 1);
  assert.equal(result.breakdown.suppressedCollisionCount, 3);
  assert.equal(result.breakdown.clusterWindowSeconds, 10);
  assert.equal(result.breakdown.collisionsCar, 1);
  assert.equal(result.incidents.find((incident) => incident.type === 'CAR_CONTACT')?.count, 1);
});
