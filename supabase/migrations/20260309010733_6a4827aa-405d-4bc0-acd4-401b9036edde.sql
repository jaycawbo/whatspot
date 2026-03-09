ALTER TABLE public.favorites ADD COLUMN labels TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE public.user_profiles ADD COLUMN spots_is_public BOOLEAN DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN spots_share_token UUID DEFAULT gen_random_uuid() UNIQUE;