CREATE TABLE IF NOT EXISTS gc_users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  display_name VARCHAR(191) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'pilot',
  password_algorithm VARCHAR(50) NOT NULL,
  password_iterations INT NOT NULL,
  password_salt VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  pilot_player_id INT NULL,
  pilot_steam_guid VARCHAR(191) NULL,
  pilot_stracker_name VARCHAR(191) NULL,
  pilot_linked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  last_login_at DATETIME(3) NULL,
  INDEX idx_gc_users_role (role),
  INDEX idx_gc_users_pilot_player_id (pilot_player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gc_sessions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  INDEX idx_gc_sessions_user_id (user_id),
  INDEX idx_gc_sessions_token_hash (token_hash),
  INDEX idx_gc_sessions_expires_at (expires_at),
  CONSTRAINT fk_gc_sessions_user_id FOREIGN KEY (user_id) REFERENCES gc_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gc_display_names (
  id VARCHAR(120) NOT NULL PRIMARY KEY,
  kind VARCHAR(20) NOT NULL,
  source_id INT NULL,
  source_code VARCHAR(255) NULL,
  source_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_gc_display_names_kind (kind),
  INDEX idx_gc_display_names_source_id (source_id),
  INDEX idx_gc_display_names_source_code (source_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gc_settings (
  setting_key VARCHAR(120) NOT NULL PRIMARY KEY,
  setting_value JSON NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
