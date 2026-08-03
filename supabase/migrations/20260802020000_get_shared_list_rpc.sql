-- Public read path for shared lists. SECURITY DEFINER lets this bypass RLS
-- safely: the only way in is knowing the unguessable share_token, there is
-- no way to enumerate lists through this function.
CREATE OR REPLACE FUNCTION public.get_shared_list(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list   record;
  v_status record;
  v_result jsonb;
BEGIN
  -- Custom (Bronco) list
  SELECT id, name, is_public INTO v_list FROM spot_lists WHERE share_token = p_token;
  IF FOUND THEN
    IF NOT v_list.is_public THEN
      RETURN jsonb_build_object('error', 'not_found');
    END IF;
    SELECT jsonb_build_object(
      'kind', 'custom',
      'name', v_list.name,
      'isPublic', v_list.is_public,
      'spots', COALESCE(jsonb_agg(jsonb_build_object(
        'google_place_id', v.google_place_id,
        'name', v.name,
        'address', v.address,
        'category', v.category,
        'price_level', v.price_level,
        'photo_urls', v.photo_urls,
        'lat', v.lat,
        'lng', v.lng
      )) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb)
    ) INTO v_result
    FROM spot_list_items sli
    JOIN venues v ON v.id = sli.venue_id
    WHERE sli.list_id = v_list.id;
    RETURN v_result;
  END IF;

  -- Fixed status list. This CASE mirrors LABEL_TO_INTERACTION in
  -- src/hooks/useSpots.js — keep the two in sync if that mapping changes.
  SELECT user_id, list_key, is_public INTO v_status FROM status_list_settings WHERE share_token = p_token;
  IF NOT FOUND OR NOT v_status.is_public THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT jsonb_build_object(
    'kind', 'status',
    'name', v_status.list_key,
    'isPublic', v_status.is_public,
    'spots', COALESCE(jsonb_agg(jsonb_build_object(
      'google_place_id', v.google_place_id,
      'name', v.name,
      'address', v.address,
      'category', v.category,
      'price_level', v.price_level,
      'photo_urls', v.photo_urls,
      'lat', v.lat,
      'lng', v.lng
    )) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM user_venue_interactions uvi
  JOIN venues v ON v.google_place_id = uvi.venue_id
  WHERE uvi.user_id = v_status.user_id AND (
    (v_status.list_key = 'Favourites'      AND uvi.interaction_type = 'rated'         AND uvi.rating = 'loved') OR
    (v_status.list_key = 'Interested'      AND uvi.interaction_type = 'interested') OR
    (v_status.list_key = 'Been To'         AND uvi.interaction_type = 'rated'         AND uvi.rating = 'liked') OR
    (v_status.list_key = 'Not Interested'  AND uvi.interaction_type = 'not_interested') OR
    (v_status.list_key = 'Didn''t Like It' AND uvi.interaction_type = 'rated'         AND uvi.rating = 'disliked')
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_list(uuid) TO anon, authenticated;
