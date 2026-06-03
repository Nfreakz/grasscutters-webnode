CREATE TABLE IF NOT EXISTS gc_driver_rating (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  driver_key VARCHAR(191) NOT NULL UNIQUE,
  steam_guid VARCHAR(191) NULL,
  stracker_player_id INT NULL,
  display_name VARCHAR(255) NOT NULL,
  sr_score DECIMAL(6,2) NOT NULL,
  sr_class VARCHAR(8) NOT NULL,
  gsr_mu DECIMAL(10,4) NOT NULL,
  gsr_sigma DECIMAL(10,4) NOT NULL,
  gsr_rating INT NOT NULL,
  gsr_class VARCHAR(16) NOT NULL,
  races_count INT NOT NULL,
  clean_races INT NOT NULL,
  wins INT NOT NULL DEFAULT 0,
  podiums INT NOT NULL DEFAULT 0,
  incident_points_total DECIMAL(10,2) NOT NULL,
  last_delta_sr DECIMAL(6,2) NOT NULL DEFAULT 0,
  last_delta_gsr INT NOT NULL DEFAULT 0,
  last_event_id VARCHAR(191) NULL,
  last_race_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gc_rating_event_result (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  event_id VARCHAR(191) NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  event_date DATETIME(3) NULL,
  stracker_session_id INT NULL,
  driver_key VARCHAR(191) NOT NULL,
  steam_guid VARCHAR(191) NULL,
  stracker_player_id INT NULL,
  display_name VARCHAR(255) NOT NULL,
  car VARCHAR(255) NOT NULL,
  position INT NOT NULL,
  points DECIMAL(10,2) NOT NULL,
  laps INT NOT NULL DEFAULT 0,
  best_lap_ms INT NOT NULL DEFAULT 0,
  old_sr DECIMAL(6,2) NOT NULL,
  new_sr DECIMAL(6,2) NOT NULL,
  delta_sr DECIMAL(6,2) NOT NULL,
  old_gsr INT NOT NULL,
  new_gsr INT NOT NULL,
  delta_gsr INT NOT NULL,
  gsr_mu_before DECIMAL(10,4) NOT NULL,
  gsr_mu_after DECIMAL(10,4) NOT NULL,
  gsr_sigma_before DECIMAL(10,4) NOT NULL,
  gsr_sigma_after DECIMAL(10,4) NOT NULL,
  incident_points DECIMAL(10,2) NOT NULL,
  clean_race TINYINT(1) NOT NULL,
  dnf TINYINT(1) NOT NULL,
  dsq TINYINT(1) NOT NULL,
  processed_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gc_rating_incident (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  event_result_id VARCHAR(80) NOT NULL,
  event_id VARCHAR(191) NOT NULL,
  driver_key VARCHAR(191) NOT NULL,
  lap_number INT NULL,
  type VARCHAR(40) NOT NULL,
  count INT NOT NULL,
  sr_delta DECIMAL(6,2) NOT NULL,
  description TEXT NOT NULL,
  source VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gc_rating_lap_detail (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  event_result_id VARCHAR(80) NOT NULL,
  lap_number INT NOT NULL,
  lap_time_ms INT NOT NULL,
  valid TINYINT(1) NOT NULL,
  cuts INT NOT NULL,
  collisions_car INT NOT NULL,
  collisions_env INT NOT NULL,
  sr_delta DECIMAL(6,2) NOT NULL,
  notes TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gc_rating_recalculation_log (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  event_id VARCHAR(191) NULL,
  mode VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
