// App-level feature switches. Plain constants, not env vars: only the
// Supabase URL and publishable key carry the VITE_ prefix.

// Instagram profile link + post embeds on the venue detail view.
// Migration applied Sept 29, 2026. Set false (and deploy) to hide the section app-wide.
export const INSTAGRAM_EMBEDS_ENABLED = true;
