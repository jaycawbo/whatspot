-- Chains and non-venues in the discovery feed (issue #386).
--
-- 1. Chain flagging. is_chain was only ever set by the census script's blocklist at insert
--    time; every other insert path (search, Places fallback, place lookup) wrote false, so
--    ~3,400 chain locations (Tim Hortons, Starbucks, Subway, JOEY, Jack Astor's...) were
--    eligible for the feed. is_chain_name() is now the single source of truth: a trigger
--    applies it on every insert/rename, and the backfill below applies it to existing rows.
--    Chains = national/international brands plus regional franchises with 10+ locations
--    (decision on #386). Local multi-location independents are not chains.
--    Names are matched from the start, after lowercasing and stripping punctuation, so
--    "Jack Astor's Bar & Grill" -> "jack astors bar grill".

CREATE OR REPLACE FUNCTION normalize_venue_name(n text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(regexp_replace(lower(coalesce(n, '')), '[^[:alnum:] ]', '', 'g'), '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION is_chain_name(n text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT normalize_venue_name(n) ~ '^(dennys|joey|jack astors|haidilao|the old spaghetti factory|old spaghetti factory|moxies|osmows|barburrito|churchs texas chicken|churchs chicken|mary browns|mr ?sub|chick ?fil ?a|popeyes|wingstop|firehouse subs|jollibee|daves hot chicken|earls kitchen|chucks roadhouse|local public eatery|p[uü]r simple|quesada|baskin ?robbins|farm boy|mm food market|eggspectation|pizza nova|sunset grill|eggsmart|burrito boyz|pizzaville|pizza depot|lazeez|scaddabush|tahinis|the burgers priest|burgers priest|kibo sushi|pizzaiolo|mcdonalds|subway|starbucks|tim hortons|burger king|wendys|kfc|pizza hut|dominos|taco bell|dairy queen|harveys|a ?w|second cup|country style|boston pizza|swiss chalet|st louis bar|milestones|cactus club|montanas|kelseys|the keg|hero certified burgers|mucho burrito|chipotle|panera|five guys|shake shack|nandos|pita pit|quiznos|extreme pita|thai express|manchu wok|new york fries|orange julius|gregorys|pizza pizza|little caesars|papa johns|great canadian bagel|robins donuts|baton rouge|red lobster|olive garden|jugo juice|booster juice)( |$)'
     -- Local independents that share a chain's leading word(s)
     AND normalize_venue_name(n) !~ '^(joey bravos|joey turks|country style hungarian|country style kosher)'
$$;

CREATE OR REPLACE FUNCTION venues_flag_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only ever sets the flag; a manual is_chain = true is never cleared by a rename.
  IF is_chain_name(NEW.name) THEN
    NEW.is_chain := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_flag_chain ON venues;
CREATE TRIGGER venues_flag_chain
  BEFORE INSERT OR UPDATE OF name ON venues
  FOR EACH ROW EXECUTE FUNCTION venues_flag_chain();

UPDATE venues SET is_chain = true WHERE is_chain = false AND is_chain_name(name);

-- 2. venues_near gains feed venue-type rules, mirroring isFeedVenue() in
--    supabase/functions/_shared/venueTypes.ts (feed-tabs passes both lists from there):
--    at least one food/drink type, and a primary (first) type that isn't excluded (hotels,
--    places of worship, attractions, event venues...). Both default to NULL = no filter.
--    Adding parameters changes the signature, so the old function is dropped first to
--    avoid an ambiguous overload. Everything else matches 20260927000000.
DROP FUNCTION IF EXISTS venues_near(double precision, double precision, double precision, numeric, integer, boolean, integer, boolean, timestamptz, integer[], text[], text[], text, integer);

CREATE FUNCTION venues_near(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision,
  min_rating numeric DEFAULT 4.0,
  min_review_count integer DEFAULT NULL,
  require_review_count boolean DEFAULT false,
  max_review_count_at_ingestion integer DEFAULT NULL,
  require_trending_score boolean DEFAULT false,
  created_after timestamptz DEFAULT NULL,
  price_levels integer[] DEFAULT NULL,
  cuisine_types text[] DEFAULT NULL,
  exclude_ids text[] DEFAULT NULL,
  order_by_column text DEFAULT 'review_count',
  result_limit integer DEFAULT 40,
  food_drink_types text[] DEFAULT NULL,
  excluded_primary_types text[] DEFAULT NULL
)
RETURNS SETOF venues
LANGUAGE plpgsql STABLE AS $$
DECLARE
  safe_order text;
BEGIN
  -- The final ORDER BY appends " DESC" once, applying to whichever
  -- column ends this list — for 'rating_review' that's review_count,
  -- giving "rating DESC, review_count DESC" (rating primary, review
  -- count as tiebreaker), which is the intended compound sort.
  safe_order := CASE order_by_column
    WHEN 'trending_score' THEN 'trending_score'
    WHEN 'created_at'     THEN 'created_at'
    WHEN 'rating_review'  THEN 'rating DESC, review_count'
    ELSE 'review_count'
  END;

  RETURN QUERY EXECUTE format(
    'SELECT * FROM venues
     WHERE geo IS NOT NULL
       AND ST_DWithin(geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3 * 1000)
       AND is_chain = false AND is_removed = false
       AND rating >= $4
       AND ($5::int IS NULL OR review_count >= $5)
       AND ($6 = false OR review_count IS NOT NULL)
       AND ($7::int IS NULL OR review_count_at_ingestion < $7)
       AND ($8 = false OR trending_score IS NOT NULL)
       AND ($9::timestamptz IS NULL OR created_at >= $9)
       AND ($10::int[] IS NULL OR price_level IS NULL OR price_level = ANY($10))
       AND ($11::text[] IS NULL OR venue_types && $11)
       AND ($12::text[] IS NULL OR google_place_id <> ALL($12))
       AND ($14::text[] IS NULL OR venue_types && $14)
       AND ($15::text[] IS NULL OR NOT (coalesce(venue_types[1], '''') = ANY($15)))
     ORDER BY %s DESC NULLS LAST LIMIT $13', safe_order)
  USING center_lng, center_lat, radius_km, min_rating, min_review_count,
        require_review_count, max_review_count_at_ingestion, require_trending_score,
        created_after, price_levels, cuisine_types, exclude_ids, result_limit,
        food_drink_types, excluded_primary_types;
END;
$$;
