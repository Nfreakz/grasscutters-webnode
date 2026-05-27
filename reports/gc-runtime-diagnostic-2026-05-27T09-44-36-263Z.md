# GC Runtime Diff Diagnostic v15.29.2

Generated: 2026-05-27T09:44:36.096Z
Root: `G:\Web Node\grasscutters-webnode`

## 1. Git local

```txt
branch: main
commit: e7f1b45056d132092f97b440ceb73f660b43f35d
last: e7f1b45 Add persistent pilot avatar system 8.2

status:
?? scripts/apply-performance-core-v15-29-1.cjs
?? scripts/apply-performance-core-v15-29.cjs
?? scripts/gc-runtime-diff-diagnostic-v15-29-2.cjs
```

## 2. Key files

| File | Exists | Size | SHA16 |
|---|---:|---:|---|
| src/server/index.ts | true | 259007 | b4d237b5cbeb7773 |
| server.cjs | true | 1549 | 0e44f8c843884798 |
| astro.config.mjs | true | 533 | aeaa481413fe843e |
| package.json | true | 1382 | b933eb2eeed0a0ba |
| src/layouts/MarketingLayout.astro | true | 18331 | 159446fc2352236f |
| src/layouts/AppLayout.astro | true | 6463 | 6afd76e30e0f7aaa |

## 3. Environment summary

```txt
- NODE_ENV: not set
- PORT: not set
- HOST: not set
- PUBLIC_SITE_URL: not set
- STRACKER_DB_PATH: not set
- STRACKER_REMOTE_URL: not set
- STRACKER_REMOTE_DOWNLOAD_URL: not set
- STRACKER_SYNC_SECRET: not set
- GC_PERF_LOG: not set
- STRACKER_QUERY_CACHE_TTL_MS: not set
- STRACKER_JOINED_LAPS_CACHE_TTL_MS: not set
- GC_PUBLIC_HTTP_CACHE_SECONDS: not set
- USE_MYSQL_STORAGE: not set
- MYSQL_HOST: not set
- MYSQL_DATABASE: not set
- MYSQL_USER: not set
```

## 4. stracker/performance code search in src/server/index.ts


### Match around line 25

```ts
   22 | const rootDir = process.env.GC_RUNTIME_ROOT ? path.resolve(process.env.GC_RUNTIME_ROOT) : path.resolve(__dirname, '../..');
   23 | const distDir = path.join(rootDir, 'dist');
   24 | const defaultAppDataDirRelativePath = './data';
   25 | const defaultStrackerRelativePath = './data/stracker/stracker.db3';
   26 | const defaultUsersRelativePath = './data/app/users.json';
   27 | const defaultDisplayNamesRelativePath = './data/app/display-names.json';
   28 | const defaultAppSqliteRelativePath = './data/app/gc-local.sqlite';
```

### Match around line 238

```ts
  235 | async function getAppSqlJs() {
  236 |   if (!appSqlJsPromise) {
  237 |     appSqlJsPromise = (async () => {
  238 |       const initSqlJsModule = await import('sql.js');
  239 |       const initSqlJs = initSqlJsModule.default;
  240 |       return initSqlJs();
  241 |     })();
```

### Match around line 265

```ts
  262 |   ensureDirForFile(sqlitePath);
  263 |   const SQL = await getAppSqlJs();
  264 |   const bytes = fs.existsSync(sqlitePath) ? new Uint8Array(fs.readFileSync(sqlitePath)) : undefined;
  265 |   const db = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
  266 |   return { db, sqlitePath };
  267 | }
  268 | 
```

### Match around line 1581

```ts
 1578 | function getStrackerConfig() {
 1579 |   const envPath = process.env.STRACKER_DB_PATH?.trim();
 1580 |   const source = envPath ? 'env' : process.env.APP_DATA_DIR ? 'app_data_dir' : 'default';
 1581 |   const configuredPath = envPath || path.join(process.env.APP_DATA_DIR?.trim() || defaultAppDataDirRelativePath, 'stracker/stracker.db3');
 1582 |   const resolvedPath = envPath ? resolveProjectPath(envPath) : path.join(getAppDataRoot(), 'stracker/stracker.db3');
 1583 |   const exists = resolvedPath ? fs.existsSync(resolvedPath) : false;
 1584 |   const stats = exists && resolvedPath ? fs.statSync(resolvedPath) : null;
```

### Match around line 1582

```ts
 1579 |   const envPath = process.env.STRACKER_DB_PATH?.trim();
 1580 |   const source = envPath ? 'env' : process.env.APP_DATA_DIR ? 'app_data_dir' : 'default';
 1581 |   const configuredPath = envPath || path.join(process.env.APP_DATA_DIR?.trim() || defaultAppDataDirRelativePath, 'stracker/stracker.db3');
 1582 |   const resolvedPath = envPath ? resolveProjectPath(envPath) : path.join(getAppDataRoot(), 'stracker/stracker.db3');
 1583 |   const exists = resolvedPath ? fs.existsSync(resolvedPath) : false;
 1584 |   const stats = exists && resolvedPath ? fs.statSync(resolvedPath) : null;
 1585 | 
```

### Match around line 1777

```ts
 1774 |       enabled: stracker.exists,
 1775 |       status: stracker.exists ? 'file_detected' : 'waiting_sync',
 1776 |       message: stracker.exists
 1777 |         ? 'stracker.db3 detectado. Endpoints reales activos: /api/hotlaps, /api/drivers, /api/cars, /api/tracks.'
 1778 |         : 'stracker preparado. Sincroniza desde GTX con /api/stracker/sync.',
 1779 |       db: stracker,
 1780 |       remote,
```

### Match around line 1885

```ts
 1882 |   ) as PlainObject[];
 1883 | }
 1884 | 
 1885 | async function withStrackerDb<T>(dbPath: string, callback: (db: SqlJsDatabase) => T | Promise<T>) {
 1886 |   const initSqlJsModule = await import('sql.js');
 1887 |   const initSqlJs = initSqlJsModule.default;
 1888 |   const SQL = await initSqlJs();
```

### Match around line 1886

```ts
 1883 | }
 1884 | 
 1885 | async function withStrackerDb<T>(dbPath: string, callback: (db: SqlJsDatabase) => T | Promise<T>) {
 1886 |   const initSqlJsModule = await import('sql.js');
 1887 |   const initSqlJs = initSqlJsModule.default;
 1888 |   const SQL = await initSqlJs();
 1889 |   const fileBuffer = fs.readFileSync(dbPath);
```

### Match around line 1890

```ts
 1887 |   const initSqlJs = initSqlJsModule.default;
 1888 |   const SQL = await initSqlJs();
 1889 |   const fileBuffer = fs.readFileSync(dbPath);
 1890 |   const db = new SQL.Database(new Uint8Array(fileBuffer));
 1891 | 
 1892 |   try {
 1893 |     return await callback(db);
```

### Match around line 1899

```ts
 1896 |   }
 1897 | }
 1898 | 
 1899 | async function runStrackerQuery(dbPath: string, sql: string) {
 1900 |   return withStrackerDb(dbPath, (db) => toObjects(db.exec(sql)));
 1901 | }
 1902 | 
```

### Match around line 1900

```ts
 1897 | }
 1898 | 
 1899 | async function runStrackerQuery(dbPath: string, sql: string) {
 1900 |   return withStrackerDb(dbPath, (db) => toObjects(db.exec(sql)));
 1901 | }
 1902 | 
 1903 | function getSafeStrackerOrRespond(res: express.Response) {
```

### Match around line 1911

```ts
 1908 |       ok: false,
 1909 |       stracker,
 1910 |       message: stracker.exists
 1911 |         ? 'stracker.db3 existe, pero no parece SQLite vÃ¡lido.'
 1912 |         : 'No se ha encontrado stracker.db3. Sincroniza desde GTX con /api/stracker/sync.'
 1913 |     });
 1914 |     return null;
```

### Match around line 1912

```ts
 1909 |       stracker,
 1910 |       message: stracker.exists
 1911 |         ? 'stracker.db3 existe, pero no parece SQLite vÃ¡lido.'
 1912 |         : 'No se ha encontrado stracker.db3. Sincroniza desde GTX con /api/stracker/sync.'
 1913 |     });
 1914 |     return null;
 1915 |   }
```

### Match around line 1921

```ts
 1918 | }
 1919 | 
 1920 | async function readStrackerTables(dbPath: string) {
 1921 |   return withStrackerDb(dbPath, (db) => {
 1922 |     const tableResult = db.exec(`
 1923 |       SELECT name
 1924 |       FROM sqlite_master
```

### Match around line 1971

```ts
 1968 | async function previewStrackerTable(dbPath: string, tableName: string, limit = 5) {
 1969 |   const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 25));
 1970 | 
 1971 |   return withStrackerDb(dbPath, (db) => {
 1972 |     const tableResult = db.exec(`
 1973 |       SELECT name
 1974 |       FROM sqlite_master
```

### Match around line 1986

```ts
 1983 |         ok: false,
 1984 |         columns: [],
 1985 |         rows: [],
 1986 |         message: `La tabla ${tableName} no existe en stracker.db3.`
 1987 |       };
 1988 |     }
 1989 | 
```

### Match around line 2056

```ts
 2053 |     return {
 2054 |       ok: false,
 2055 |       statusCode: 400,
 2056 |       message: 'No se pudo resolver la ruta local de stracker.db3.'
 2057 |     };
 2058 |   }
 2059 | 
```

### Match around line 2116

```ts
 2113 |     return {
 2114 |       ok: true,
 2115 |       statusCode: 200,
 2116 |       message: 'stracker.db3 sincronizado correctamente desde GTX.',
 2117 |       sync: lastSyncResult,
 2118 |       stracker: getStrackerConfig()
 2119 |     };
```

### Match around line 2140

```ts
 2137 |     return {
 2138 |       ok: false,
 2139 |       statusCode: 500,
 2140 |       message: 'No se pudo sincronizar stracker.db3 desde GTX.',
 2141 |       sync: lastSyncResult
 2142 |     };
 2143 |   } finally {
```

### Match around line 2155

```ts
 2152 |   }
 2153 | }
 2154 | 
 2155 | const joinedLapsSql = `
 2156 |   SELECT
 2157 |     L.LapId,
 2158 |     L.PlayerInSessionId,
```

### Match around line 2352

```ts
 2349 |   };
 2350 | }
 2351 | 
 2352 | async function readJoinedLaps(dbPath: string) {
 2353 |   await readDisplayNameStoreAsync();
 2354 |   const rows = await runStrackerQuery(dbPath, `${joinedLapsSql} ORDER BY L.LapTime ASC`);
 2355 |   return rows.map(mapLapRow);
```

### Match around line 2354

```ts
 2351 | 
 2352 | async function readJoinedLaps(dbPath: string) {
 2353 |   await readDisplayNameStoreAsync();
 2354 |   const rows = await runStrackerQuery(dbPath, `${joinedLapsSql} ORDER BY L.LapTime ASC`);
 2355 |   return rows.map(mapLapRow);
 2356 | }
 2357 | 
```

### Match around line 2519

```ts
 2516 | 
 2517 | 
 2518 | async function getPilotStatsByPlayerId(dbPath: string, playerId: number) {
 2519 |   const laps = await readJoinedLaps(dbPath);
 2520 |   const drivers = reduceDriverStats(laps);
 2521 |   return drivers.find((driver) => Number(driver.id) === Number(playerId)) ?? null;
 2522 | }
```

### Match around line 2905

```ts
 2902 |     legacyTracks: trackStats.slice(0, 20),
 2903 |     sectors: bestSectors,
 2904 |     message: user.pilotLink
 2905 |       ? 'Perfil Pro generado desde la cuenta web y stracker.db3.'
 2906 |       : 'Cuenta activa sin piloto vinculado todavÃ­a.'
 2907 |   };
 2908 | }
```

### Match around line 2959

```ts
 2956 |     authenticated: false,
 2957 |     user: null,
 2958 |     session: null,
 2959 |     message: 'Perfil pÃºblico generado desde stracker.db3.'
 2960 |   };
 2961 | }
 2962 | 
```

### Match around line 2971

```ts
 2968 | 
 2969 |   const stracker = getStrackerConfig();
 2970 |   if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
 2971 |     return { ok: false as const, message: 'No hay stracker.db3 vÃ¡lido para vincular piloto.' };
 2972 |   }
 2973 | 
 2974 |   const pilot = await getPilotStatsByPlayerId(stracker.resolvedPath, playerId);
```

### Match around line 2976

```ts
 2973 | 
 2974 |   const pilot = await getPilotStatsByPlayerId(stracker.resolvedPath, playerId);
 2975 |   if (!pilot) {
 2976 |     return { ok: false as const, message: 'No se encontrÃ³ ese piloto en stracker.db3.' };
 2977 |   }
 2978 | 
 2979 |   return {
```

### Match around line 3104

```ts
 3101 | }
 3102 | 
 3103 | async function getCombos(dbPath: string) {
 3104 |   const rows = await runStrackerQuery(
 3105 |     dbPath,
 3106 |     `
 3107 |       SELECT
```

### Match around line 3636

```ts
 3633 |     recentLaps,
 3634 |     drivers,
 3635 |     invalidHotspots,
 3636 |     message: 'Combo lÃ³gico generado desde stracker.db3: mismo circuito y paquete de coches compatible. Si el 75% de los coches son nuevos, se crea otro combo.'
 3637 |   };
 3638 | }
 3639 | 
```

### Match around line 3682

```ts
 3679 | 
 3680 | async function getSessions(dbPath: string, limit: number) {
 3681 |   const safeLimit = Math.max(1, Math.min(limit, 250));
 3682 |   const rows = await runStrackerQuery(
 3683 |     dbPath,
 3684 |     `
 3685 |       SELECT
```

### Match around line 5037

```ts
 5034 |       ok: false,
 5035 |       profile: null,
 5036 |       stracker,
 5037 |       message: 'stracker.db3 no estÃ¡ disponible para generar el perfil pÃºblico.'
 5038 |     });
 5039 |     return;
 5040 |   }
```

### Match around line 5043

```ts
 5040 |   }
 5041 | 
 5042 |   try {
 5043 |     const allLaps = await readJoinedLaps(stracker.resolvedPath);
 5044 |     const profile = buildPublicPilotProfile(playerId, allLaps);
 5045 | 
 5046 |     if (!profile) {
```

### Match around line 5051

```ts
 5048 |         ok: false,
 5049 |         profile: null,
 5050 |         playerId,
 5051 |         message: 'No se encontrÃ³ actividad para ese piloto en stracker.db3.'
 5052 |       });
 5053 |       return;
 5054 |     }
```

### Match around line 5070

```ts
 5067 |       ok: false,
 5068 |       profile: null,
 5069 |       playerId,
 5070 |       message: 'No se pudo generar el perfil pÃºblico desde stracker.db3.',
 5071 |       error: error instanceof Error ? error.message : String(error)
 5072 |     });
 5073 |   }
```

### Match around line 5106

```ts
 5103 |       pilotLink: context.user.pilotLink,
 5104 |       profile: null,
 5105 |       stracker,
 5106 |       message: 'Hay sesiÃ³n activa, pero stracker.db3 no estÃ¡ disponible para generar el perfil.'
 5107 |     });
 5108 |     return;
 5109 |   }
```

### Match around line 5112

```ts
 5109 |   }
 5110 | 
 5111 |   try {
 5112 |     const allLaps = await readJoinedLaps(stracker.resolvedPath);
 5113 |     res.json({
 5114 |       ...buildPilotProProfile(context.user, context.session, allLaps),
 5115 |       stracker: {
```

### Match around line 5128

```ts
 5125 |       authenticated: true,
 5126 |       user: publicUser(context.user),
 5127 |       profile: null,
 5128 |       message: 'No se pudo generar el Perfil Pro desde stracker.db3.',
 5129 |       error: error instanceof Error ? error.message : String(error)
 5130 |     });
 5131 |   }
```

### Match around line 5250

```ts
 5247 | 
 5248 |   if (authorized && stracker.resolvedPath && stracker.exists && stracker.validSQLite) {
 5249 |     try {
 5250 |       const rows = await runStrackerQuery(stracker.resolvedPath, `
 5251 |         SELECT
 5252 |           (SELECT COUNT(*) FROM Lap) AS TotalLaps,
 5253 |           (SELECT COUNT(*) FROM Lap WHERE Valid = 1) AS ValidLaps,
```

### Match around line 5746

```ts
 5743 | 
 5744 |   if (stracker.resolvedPath && stracker.exists && stracker.validSQLite) {
 5745 |     try {
 5746 |       const drivers = await runStrackerQuery(stracker.resolvedPath, 'SELECT PlayerId, SteamGuid, Name FROM Players ORDER BY Name ASC');
 5747 |       const driverItems = drivers.map((row) => buildDisplayNameCatalogItem('driver', row.PlayerId, row.SteamGuid, row.Name, getRawDriverName({ DriverName: row.Name, Name: row.Name }), store));
 5748 |       const driverNameCounts = new Map<string, number>();
 5749 |       for (const item of driverItems) {
```

### Match around line 5764

```ts
 5761 |         };
 5762 |       });
 5763 | 
 5764 |       const cars = await runStrackerQuery(stracker.resolvedPath, 'SELECT CarId, Car, UiCarName, Brand FROM Cars ORDER BY UiCarName ASC, Car ASC');
 5765 |       catalog.cars = cars.map((row) => buildDisplayNameCatalogItem('car', row.CarId, row.Car, row.UiCarName || row.Car, getRawDisplayCar(row), store));
 5766 | 
 5767 |       const tracks = await runStrackerQuery(stracker.resolvedPath, 'SELECT TrackId, Track, UiTrackName, Length FROM Tracks ORDER BY UiTrackName ASC, Track ASC');
```

### Match around line 5767

```ts
 5764 |       const cars = await runStrackerQuery(stracker.resolvedPath, 'SELECT CarId, Car, UiCarName, Brand FROM Cars ORDER BY UiCarName ASC, Car ASC');
 5765 |       catalog.cars = cars.map((row) => buildDisplayNameCatalogItem('car', row.CarId, row.Car, row.UiCarName || row.Car, getRawDisplayCar(row), store));
 5766 | 
 5767 |       const tracks = await runStrackerQuery(stracker.resolvedPath, 'SELECT TrackId, Track, UiTrackName, Length FROM Tracks ORDER BY UiTrackName ASC, Track ASC');
 5768 |       catalog.tracks = tracks.map((row) => buildDisplayNameCatalogItem('track', row.TrackId, row.Track, row.UiTrackName || row.Track, getRawDisplayTrack(row), store));
 5769 |     } catch (error) {
 5770 |       console.error('[GC] Error generando catÃ¡logo de display names:', error);
```

### Match around line 5828

```ts
 5825 |   const stracker = getStrackerConfig();
 5826 | 
 5827 |   if (!stracker.resolvedPath || !stracker.exists || !stracker.validSQLite) {
 5828 |     res.json({ ok: true, count: 0, pilots: [], message: 'stracker.db3 no estÃ¡ disponible para detectar pilotos sin cuenta.' });
 5829 |     return;
 5830 |   }
 5831 | 
```

### Match around line 5833

```ts
 5830 |   }
 5831 | 
 5832 |   try {
 5833 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 5834 |     const pilots = reduceDriverStats(laps)
 5835 |       .filter((pilot) => pilot.id !== null && !linkedIds.has(String(pilot.id)))
 5836 |       .sort((a, b) => Number(b.lastSeenTimestamp ?? 0) - Number(a.lastSeenTimestamp ?? 0))
```

### Match around line 6375

```ts
 6372 |       ok: false,
 6373 |       tables: [],
 6374 |       stracker,
 6375 |       message: 'No se ha encontrado stracker.db3. Sincroniza desde GTX con /api/stracker/sync.'
 6376 |     });
 6377 |     return;
 6378 |   }
```

### Match around line 6388

```ts
 6385 |       stracker,
 6386 |       totalTables: tables.length,
 6387 |       tables,
 6388 |       message: 'Tablas detectadas correctamente en stracker.db3.'
 6389 |     });
 6390 |   } catch (error) {
 6391 |     console.error('[GC] Error leyendo stracker tables:', error);
```

### Match around line 6396

```ts
 6393 |       ok: false,
 6394 |       stracker,
 6395 |       tables: [],
 6396 |       message: 'El archivo existe, pero no se pudo leer como SQLite. Revisa que sea stracker.db3 vÃ¡lido.',
 6397 |       error: error instanceof Error ? error.message : String(error)
 6398 |     });
 6399 |   }
```

### Match around line 6411

```ts
 6408 |       columns: [],
 6409 |       rows: [],
 6410 |       stracker,
 6411 |       message: 'No se ha encontrado stracker.db3.'
 6412 |     });
 6413 |     return;
 6414 |   }
```

### Match around line 6450

```ts
 6447 |   try {
 6448 |     const limit = getQueryNumber(req, 'limit', 100, 1, 1000);
 6449 |     const groupMode = getQueryString(req, 'group', 'best').toLowerCase();
 6450 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 6451 |     const filtered = filterLaps(laps, req, { validOnly: true });
 6452 |     const items = makeBestHotlaps(filtered, groupMode).slice(0, limit);
 6453 | 
```

### Match around line 6468

```ts
 6465 |         modifiedAt: stracker.modifiedAt
 6466 |       },
 6467 |       items,
 6468 |       message: 'Hotlaps reales generadas desde stracker.db3.'
 6469 |     });
 6470 |   } catch (error) {
 6471 |     console.error('[GC] Error leyendo hotlaps reales:', error);
```

### Match around line 6475

```ts
 6472 |     res.status(200).json({
 6473 |       ok: false,
 6474 |       items: [],
 6475 |       message: 'No se pudieron leer hotlaps reales desde stracker.db3.',
 6476 |       error: error instanceof Error ? error.message : String(error)
 6477 |     });
 6478 |   }
```

### Match around line 6488

```ts
 6485 |   try {
 6486 |     const limit = getQueryNumber(req, 'limit', 100, 1, 1000);
 6487 |     const sort = getQueryString(req, 'sort', 'fastest').toLowerCase();
 6488 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 6489 |     const filtered = filterLaps(laps, req, { validOnly: false });
 6490 |     const sorted = [...filtered].sort((a, b) => {
 6491 |       if (sort === 'recent') return Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0);
```

### Match around line 6504

```ts
 6501 |       totalMatchedLaps: filtered.length,
 6502 |       filters: summarizeFilters(req),
 6503 |       items: sorted.slice(0, limit),
 6504 |       message: 'Vueltas reales leÃ­das desde stracker.db3.'
 6505 |     });
 6506 |   } catch (error) {
 6507 |     console.error('[GC] Error leyendo vueltas:', error);
```

### Match around line 6523

```ts
 6520 | 
 6521 |   try {
 6522 |     const limit = getQueryNumber(req, 'limit', 100, 1, 500);
 6523 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 6524 |     const filtered = filterLaps(laps, req, { validOnly: false });
 6525 |     let items = reduceDriverStats(filtered);
 6526 |     const q = getQueryString(req, 'q') || getQueryString(req, 'driver') || getQueryString(req, 'pilot');
```

### Match around line 6556

```ts
 6553 |       ok: true,
 6554 |       mode: 'mock',
 6555 |       items: mockPilots,
 6556 |       message: 'Ãrea de pilotos en maqueta. Sin stracker.db3 vÃ¡lido todavÃ­a.'
 6557 |     });
 6558 |     return;
 6559 |   }
```

### Match around line 6562

```ts
 6559 |   }
 6560 | 
 6561 |   try {
 6562 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 6563 |     const items = reduceDriverStats(filterLaps(laps, req, { validOnly: false }));
 6564 | 
 6565 |     res.json({
```

### Match around line 6570

```ts
 6567 |       mode: 'real-stracker',
 6568 |       count: items.length,
 6569 |       items,
 6570 |       message: 'Pilotos reales generados desde stracker.db3. Login pendiente para Ã¡rea privada.'
 6571 |     });
 6572 |   } catch (error) {
 6573 |     res.status(200).json({
```

### Match around line 6590

```ts
 6587 |   try {
 6588 |     const q = getQueryString(req, 'q') || getQueryString(req, 'car');
 6589 |     const brand = getQueryString(req, 'brand') || getQueryString(req, 'marca');
 6590 |     const carsRows = await runStrackerQuery(
 6591 |       stracker.resolvedPath,
 6592 |       'SELECT CarId, Car, UiCarName, Brand FROM Cars ORDER BY UiCarName ASC, Car ASC'
 6593 |     );
```

### Match around line 6594

```ts
 6591 |       stracker.resolvedPath,
 6592 |       'SELECT CarId, Car, UiCarName, Brand FROM Cars ORDER BY UiCarName ASC, Car ASC'
 6593 |     );
 6594 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 6595 |     let items = reduceCarStats(laps, carsRows);
 6596 | 
 6597 |     if (q) items = items.filter((car) => includesFilter(`${car.name} ${car.code}`, q));
```

### Match around line 6624

```ts
 6621 | 
 6622 |   try {
 6623 |     const q = getQueryString(req, 'q') || getQueryString(req, 'track') || getQueryString(req, 'circuit');
 6624 |     const tracksRows = await runStrackerQuery(
 6625 |       stracker.resolvedPath,
 6626 |       'SELECT TrackId, Track, UiTrackName, Length FROM Tracks ORDER BY UiTrackName ASC, Track ASC'
 6627 |     );
```

### Match around line 6628

```ts
 6625 |       stracker.resolvedPath,
 6626 |       'SELECT TrackId, Track, UiTrackName, Length FROM Tracks ORDER BY UiTrackName ASC, Track ASC'
 6627 |     );
 6628 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 6629 |     let items = reduceTrackStats(laps, tracksRows);
 6630 | 
 6631 |     if (q) items = items.filter((track) => includesFilter(`${track.name} ${track.code}`, q));
```

### Match around line 6686

```ts
 6683 |     const q = getQueryString(req, 'q') || getQueryString(req, 'search');
 6684 |     const sort = getQueryString(req, 'sort', 'recent').toLowerCase();
 6685 |     const [laps, comboDefinitions] = await Promise.all([
 6686 |       readJoinedLaps(stracker.resolvedPath),
 6687 |       getCombos(stracker.resolvedPath)
 6688 |     ]);
 6689 |     let items = buildComboStatsFromLaps(laps, comboDefinitions);
```

### Match around line 6730

```ts
 6727 | 
 6728 |   try {
 6729 |     const [laps, comboDefinitions] = await Promise.all([
 6730 |       readJoinedLaps(stracker.resolvedPath),
 6731 |       getCombos(stracker.resolvedPath)
 6732 |     ]);
 6733 |     const profile = buildComboProfile(req.params.comboId, laps, comboDefinitions);
```

### Match around line 6739

```ts
 6736 |       res.status(200).json({
 6737 |         ok: false,
 6738 |         item: null,
 6739 |         message: 'No se encontrÃ³ ese ComboId en stracker.db3.'
 6740 |       });
 6741 |       return;
 6742 |     }
```

### Match around line 6766

```ts
 6763 |   if (!stracker?.resolvedPath) return;
 6764 | 
 6765 |   try {
 6766 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 6767 |     const profile = buildLegacyComboProfile(req.params.trackId, req.params.carId, laps);
 6768 | 
 6769 |     if (!profile) {
```

### Match around line 6828

```ts
 6825 |   try {
 6826 |     const hours = getQueryNumber(req, 'hours', 48, 1, 24 * 30);
 6827 |     const limit = getQueryNumber(req, 'limit', 100, 1, 500);
 6828 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 6829 |     const filtered = filterLaps(laps, { ...req, query: { ...req.query, sinceHours: String(hours), valid: 'all' } } as express.Request, { validOnly: false });
 6830 |     const latestByDriverCombo = new Map<string, ReturnType<typeof mapLapRow>>();
 6831 | 
```

### Match around line 6868

```ts
 6865 |   if (!stracker?.resolvedPath) return;
 6866 | 
 6867 |   try {
 6868 |     const laps = await readJoinedLaps(stracker.resolvedPath);
 6869 |     const validLaps = laps.filter((lap) => lap.valid);
 6870 |     const bestLap = [...validLaps].sort((a, b) => Number(a.lapTimeMs ?? Infinity) - Number(b.lapTimeMs ?? Infinity))[0] ?? null;
 6871 |     const latestLap = [...laps].sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))[0] ?? null;
```

### Match around line 6890

```ts
 6887 |           modifiedAt: stracker.modifiedAt
 6888 |         }
 6889 |       },
 6890 |       message: 'Resumen general real generado desde stracker.db3.'
 6891 |     });
 6892 |   } catch (error) {
 6893 |     console.error('[GC] Error leyendo stats overview:', error);
```

## 5. API route search in src/server/index.ts


### Match around line 3771

```ts
 3769 | 
 3770 |   if (fs.existsSync(gcArchiveMediaDir)) {
 3771 |     app.use('/archive-media', express.static(gcArchiveMediaDir, {
 3772 |       index: false,
 3773 |       immutable: true,
```

### Match around line 3796

```ts
 3794 | 
 3795 | if (fs.existsSync(archiveMediaDir)) {
 3796 |   app.use('/archive-media', express.static(archiveMediaDir, {
 3797 |     index: false,
 3798 |     immutable: true,
```

### Match around line 6443

```ts
 6441 | });
 6442 | 
 6443 | app.get('/api/hotlaps', async (req, res) => {
 6444 |   const stracker = getSafeStrackerOrRespond(res);
 6445 |   if (!stracker?.resolvedPath) return;
```

### Match around line 6517

```ts
 6515 | });
 6516 | 
 6517 | app.get('/api/drivers', async (req, res) => {
 6518 |   const stracker = getSafeStrackerOrRespond(res);
 6519 |   if (!stracker?.resolvedPath) return;
```

### Match around line 6583

```ts
 6581 | });
 6582 | 
 6583 | app.get('/api/cars', async (req, res) => {
 6584 |   const stracker = getSafeStrackerOrRespond(res);
 6585 |   if (!stracker?.resolvedPath) return;
```

### Match around line 6618

```ts
 6616 | });
 6617 | 
 6618 | app.get('/api/tracks', async (req, res) => {
 6619 |   const stracker = getSafeStrackerOrRespond(res);
 6620 |   if (!stracker?.resolvedPath) return;
```

### Match around line 6651

```ts
 6649 | });
 6650 | 
 6651 | app.get('/api/combos', async (_req, res) => {
 6652 |   const stracker = getSafeStrackerOrRespond(res);
 6653 |   if (!stracker?.resolvedPath) return;
```

### Match around line 6677

```ts
 6675 | 
 6676 | 
 6677 | app.get('/api/combos/stats', async (req, res) => {
 6678 |   const stracker = getSafeStrackerOrRespond(res);
 6679 |   if (!stracker?.resolvedPath) return;
```

### Match around line 6724

```ts
 6722 | });
 6723 | 
 6724 | app.get('/api/combos/:comboId', async (req, res) => {
 6725 |   const stracker = getSafeStrackerOrRespond(res);
 6726 |   if (!stracker?.resolvedPath) return;
```

### Match around line 6761

```ts
 6759 | });
 6760 | 
 6761 | app.get('/api/combos/:trackId/:carId', async (req, res) => {
 6762 |   const stracker = getSafeStrackerOrRespond(res);
 6763 |   if (!stracker?.resolvedPath) return;
```

### Match around line 6863

```ts
 6861 | });
 6862 | 
 6863 | app.get('/api/stats/overview', async (_req, res) => {
 6864 |   const stracker = getSafeStrackerOrRespond(res);
 6865 |   if (!stracker?.resolvedPath) return;
```

### Match around line 6936

```ts
 6934 | });
 6935 | 
 6936 | app.get('/api/debug/runtime', (_req, res) => {
 6937 |   const stracker = getStrackerConfig();
 6938 | 
```

### Match around line 6965

```ts
 6963 | 
 6964 | app.use(
 6965 |   express.static(distDir, {
 6966 |     maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
 6967 |     index: 'index.html'
```

### Match around line 7425

```ts
 7423 |     const astroAssetsDir = path.join(clientDir, '_astro');
 7424 |     if (fs.existsSync(astroAssetsDir)) {
 7425 |       app.use('/_astro', express.static(astroAssetsDir, {
 7426 |         maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
 7427 |         immutable: process.env.NODE_ENV === 'production'
```

### Match around line 7431

```ts
 7429 |     }
 7430 | 
 7431 |     app.use(express.static(clientDir, {
 7432 |       maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
 7433 |       index: false,
```

## 6. Build/runtime hints

- If `src/server/index.ts` and `server.cjs` have different SHAs/dates, local dev and online may not run the same code.
- If Git status shows many modified files, GitHub is not the same as local.
- If online endpoints show a different mode/version, Hostinger may still be running an older build.
- If `/api/admin/performance/cache` is 404 online, v15.29 is not deployed there.

## 7. Online probes

Not run. Use:

```powershell
node scripts/gc-runtime-diff-diagnostic-v15-29-2.cjs --online=https://grasscuttersracing.com
```