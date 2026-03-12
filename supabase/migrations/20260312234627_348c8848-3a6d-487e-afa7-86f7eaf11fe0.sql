CREATE POLICY "venues_authenticated_upsert"
ON public.venues
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "venues_authenticated_update"
ON public.venues
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);