-- GrassCutters Racing - sistema de equipos y país de piloto
ALTER TABLE gc_users ADD COLUMN pilot_country_code CHAR(2) NULL;

CREATE TABLE IF NOT EXISTS gc_teams (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  slug VARCHAR(140) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  short_name VARCHAR(40) NULL,
  logo_url VARCHAR(500) NULL,
  country_code CHAR(2) NULL,
  primary_color VARCHAR(20) NULL,
  secondary_color VARCHAR(20) NULL,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by_user_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_gc_teams_status (status),
  INDEX idx_gc_teams_created_by (created_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gc_driver_profiles (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  driver_key VARCHAR(191) NOT NULL UNIQUE,
  player_id INT NULL,
  steam_guid VARCHAR(191) NULL,
  driver_name VARCHAR(160) NOT NULL,
  display_name VARCHAR(160) NULL,
  avatar_url VARCHAR(500) NULL,
  country_code CHAR(2) NULL,
  linked_user_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_gc_driver_profiles_player_id (player_id),
  INDEX idx_gc_driver_profiles_steam_guid (steam_guid),
  INDEX idx_gc_driver_profiles_name (driver_name),
  INDEX idx_gc_driver_profiles_user (linked_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gc_team_memberships (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  team_id VARCHAR(64) NOT NULL,
  driver_profile_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'driver',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  joined_at DATETIME(3) NOT NULL,
  left_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_gc_team_active_driver (driver_profile_id, status),
  INDEX idx_gc_team_memberships_team_status (team_id, status),
  INDEX idx_gc_team_memberships_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
