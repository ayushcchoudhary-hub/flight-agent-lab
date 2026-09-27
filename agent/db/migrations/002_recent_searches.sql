-- Recent searches, so a returning browser can pick up where it left off
-- (decision 2026-09-27). This widens memory beyond origins: a recent search
-- is a whole trip, with route, dates, a stated cabin, nonstop and budget, and
-- the lowest price seen, which a later saved-search alert can compare with.
--
-- Rules the application keeps:
-- * A recent search is shown back to the traveler in the welcome and used
--   only when they choose it. It never pre-fills a new trip.
-- * One row per route per visitor, newest wins, at most five kept.
-- * Rows expire with the conversation retention and purge_expired() removes
--   them. "Forget my recent searches" deletes them at once.
-- * Keyed by browser for now. With sign-in, key by account instead and move
--   a browser's rows to the account on first sign-in.

CREATE TABLE IF NOT EXISTS recent_searches (
  visitor_id        uuid NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  origin            text NOT NULL CHECK (origin ~ '^[A-Z]{3}(\|[A-Z]{3})*$'),
  destination       text NOT NULL CHECK (destination ~ '^[A-Z]{3}(\|[A-Z]{3})*$'),
  date_from         date NOT NULL,
  date_to           date NOT NULL CHECK (date_to >= date_from),
  cabin             text CHECK (cabin IN ('economy', 'premium', 'business', 'first', 'any')),
  nonstop_only      boolean NOT NULL DEFAULT false,
  max_price_usd     numeric CHECK (max_price_usd > 0),
  lowest_price_usd  numeric CHECK (lowest_price_usd >= 0),
  searched_at       timestamptz NOT NULL DEFAULT now(),
  retain_until      timestamptz NOT NULL,
  PRIMARY KEY (visitor_id, origin, destination)
);
CREATE INDEX IF NOT EXISTS recent_searches_visitor ON recent_searches (visitor_id, searched_at DESC);
CREATE INDEX IF NOT EXISTS recent_searches_retention ON recent_searches (retain_until);

-- Replacing the function keeps the application role's EXECUTE grant.
CREATE OR REPLACE FUNCTION purge_expired() RETURNS integer LANGUAGE sql AS $$
  WITH gone AS (DELETE FROM conversations WHERE retain_until < now() RETURNING 1),
       searches AS (DELETE FROM recent_searches WHERE retain_until < now() RETURNING 1)
  SELECT ((SELECT count(*) FROM gone) + (SELECT count(*) FROM searches))::integer;
$$;
