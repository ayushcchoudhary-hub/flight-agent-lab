-- Conversation storage and per-browser memory. Development runs on Neon;
-- CommonSwyft runs Postgres 16 on Cloud SQL, and this schema needs nothing
-- provider-specific, so moving it is a data copy.
--
-- Privacy rules the schema enforces or supports:
-- * Text is redacted by the application before it is written.
-- * Every conversation carries retain_until and purge_expired() deletes past it.
-- * A visitor is a random browser id, not a person. No account link yet.
-- * The application role (tools/create-app-role.mjs) gets rows only.

CREATE TABLE IF NOT EXISTS visitors (
  id            uuid PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

-- Memory kept across conversations. Only origins, by decision: the origin the
-- traveler stated as home, and the last origin they searched from. Dates,
-- cabins and budgets are one-off trip details and are never stored here.
CREATE TABLE IF NOT EXISTS visitor_memory (
  visitor_id    uuid PRIMARY KEY REFERENCES visitors(id) ON DELETE CASCADE,
  home_origin   text CHECK (home_origin ~ '^[A-Z]{3}(\|[A-Z]{3})*$'),
  last_origin   text CHECK (last_origin ~ '^[A-Z]{3}(\|[A-Z]{3})*$'),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id              uuid PRIMARY KEY,
  visitor_id      uuid NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('web')),
  model           text NOT NULL,
  prompt_version  text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  retain_until    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_visitor ON conversations (visitor_id, started_at DESC);
CREATE INDEX IF NOT EXISTS conversations_retention ON conversations (retain_until);

CREATE TABLE IF NOT EXISTS messages (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq              integer NOT NULL CHECK (seq >= 0),
  role             text NOT NULL CHECK (role IN ('traveler', 'assistant')),
  text             text NOT NULL CHECK (length(text) <= 8000),
  status           text,
  tool             jsonb,
  latency_ms       integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);

CREATE OR REPLACE FUNCTION purge_expired() RETURNS integer LANGUAGE sql AS $$
  WITH gone AS (DELETE FROM conversations WHERE retain_until < now() RETURNING 1)
  SELECT count(*)::integer FROM gone;
$$;

