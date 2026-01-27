CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY,        -- TMDB movie id
  title TEXT NOT NULL,           -- Movie name
  release_date TEXT,             -- YYYY-MM-DD
  popularity REAL,               -- Trending score
  vote_average REAL,             -- Rating
  vote_count INTEGER,            -- Rating count
  poster_path TEXT,              -- TMDB poster path
  language TEXT DEFAULT 'en',    -- ISO 639-1 language code (future i18n support)
  created_at INTEGER,            -- when added to our system (unix time)
  updated_at INTEGER             -- last sync time (unix time)
);

CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);
CREATE INDEX IF NOT EXISTS idx_movies_popularity ON movies(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies(release_date DESC);

-- Junction table for many-to-many relationship (movie can be in multiple categories)
CREATE TABLE IF NOT EXISTS movie_categories (
  movie_id INTEGER NOT NULL,
  category TEXT NOT NULL,        -- now_playing, popular, upcoming, top_rated
  added_at INTEGER NOT NULL,     -- when movie was added to this category (unix time)
  PRIMARY KEY (movie_id, category),
  FOREIGN KEY(movie_id) REFERENCES movies(id)
);

CREATE INDEX IF NOT EXISTS idx_movie_categories_category ON movie_categories(category, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_movie_categories_movie ON movie_categories(movie_id);

CREATE TABLE IF NOT EXISTS roasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,      -- TMDB movie id (same as movies.id)
  roast_json TEXT NOT NULL,       -- Full AI roast (headline, chips, body, etc)
  language TEXT DEFAULT 'en',     -- ISO 639-1 language code (future i18n support)
  created_at INTEGER,             -- When the roast was generated (unix time)
  is_featured INTEGER DEFAULT 0,  -- For pinning / highlights later
  is_active INTEGER DEFAULT 1,    -- Soft versioning: only one active roast per movie+language
  FOREIGN KEY(movie_id) REFERENCES movies(id)
);

CREATE INDEX IF NOT EXISTS idx_roasts_created ON roasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roasts_movie ON roasts(movie_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_roast ON roasts(movie_id, language) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS extractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  source TEXT NOT NULL,               -- 'grok-extraction'
  model TEXT NOT NULL,                -- 'grok-4-1-fast-non-reasoning'
  fetched_at INTEGER NOT NULL,        -- unix timestamp
  content_json TEXT NOT NULL,         -- final structured facts (LLM output)
  evidence_json TEXT NOT NULL,        -- this extractedData from Brave
  citations_json TEXT,                -- urls / sources
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  total_cost REAL,
  FOREIGN KEY(movie_id) REFERENCES movies(id)
);

CREATE INDEX IF NOT EXISTS idx_extractions_movie ON extractions(movie_id);
CREATE INDEX IF NOT EXISTS idx_extractions_time ON extractions(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_extractions_movie_time ON extractions(movie_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS streaming_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_movie_id INTEGER NOT NULL,
  region TEXT NOT NULL,          -- IN, US, etc
  provider_id INTEGER,           -- TMDB provider id
  provider_name TEXT,            -- Netflix, Prime Video
  logo_path TEXT,                -- URL/path to logo
  type TEXT,                     -- flatrate | rent | buy | free
  link TEXT,                     -- deeplink if any
  last_updated INTEGER,          -- unix time
  FOREIGN KEY(tmdb_movie_id) REFERENCES movies(id)
);

CREATE INDEX IF NOT EXISTS idx_streaming_providers_movie ON streaming_providers(tmdb_movie_id);

