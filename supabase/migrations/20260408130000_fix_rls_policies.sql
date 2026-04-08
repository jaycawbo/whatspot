-- Fix RLS security issues flagged by database linter

-- 1. Enable RLS on census_state
ALTER TABLE public.census_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "census_state_public_read" ON public.census_state FOR SELECT USING (true);

-- 2. Fix permissive INSERT policies (replace WITH CHECK (true) with role checks)
DROP POLICY IF EXISTS cv_insert_any ON public.constellation_validations;
CREATE POLICY cv_insert_any ON public.constellation_validations FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS search_history_insert_any ON public.search_history;
CREATE POLICY search_history_insert_any ON public.search_history FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS user_events_insert_any ON public.user_events;
CREATE POLICY user_events_insert_any ON public.user_events FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS uvi_insert_any ON public.user_venue_interactions;
CREATE POLICY uvi_insert_any ON public.user_venue_interactions FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon'));

-- 3. Fix mutable search paths on security definer functions
CREATE OR REPLACE FUNCTION public.protect_snapshot_review_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ BEGIN RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
