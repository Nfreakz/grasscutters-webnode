-- GrassCutters Teams / Palmarés V4
-- Añade tabla de palmarés/puntos de campeonato por equipo.
-- Los equipos NO tienen rating propio: acumulan resultados/puntos de sus pilotos o entradas manuales de campeonato.

CREATE TABLE IF NOT EXISTS gc_team_palmares (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  team_id VARCHAR(64) NOT NULL,
  season VARCHAR(32) NULL,
  championship_slug VARCHAR(140) NULL,
  championship_name VARCHAR(180) NULL,
  championship_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  podiums INT NOT NULL DEFAULT 0,
  poles INT NOT NULL DEFAULT 0,
  fastest_laps INT NOT NULL DEFAULT 0,
  races INT NOT NULL DEFAULT 0,
  titles INT NOT NULL DEFAULT 0,
  runner_ups INT NOT NULL DEFAULT 0,
  source VARCHAR(40) NOT NULL DEFAULT 'manual',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_gc_team_palmares_team (team_id),
  INDEX idx_gc_team_palmares_season (season),
  INDEX idx_gc_team_palmares_championship (championship_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
