import { supabase } from '@/integrations/supabase/client';

/**
 * Top-level categories shown first in the feedback sheet, in no particular
 * preselected order. "venue_issue" only appears when a venueId is in
 * context (filtered by the caller) — it has no meaning venue-agnostically.
 */
export const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'venue_issue', label: 'Venue issue', requiresVenue: true },
  { value: 'general', label: 'General feedback' },
];

/**
 * Closed-ended chip options per category. Every list ends with "other" —
 * it's just another chip, not a special gate; the free-text box is always
 * shown regardless of which chip is picked.
 */
export const CLOSED_OPTIONS = {
  bug: [
    { value: 'app_crash_or_error', label: "Something's broken / error message" },
    { value: 'wrong_or_missing_data', label: 'Wrong or missing info on screen' },
    { value: 'slow_or_unresponsive', label: 'Slow or unresponsive' },
    { value: 'other', label: 'Other' },
  ],
  feature_request: [
    { value: 'new_capability', label: 'Something new I wish WhatSpot could do' },
    { value: 'improve_existing', label: 'Improve something that already exists' },
    { value: 'integration', label: 'Connect with another app/service' },
    { value: 'other', label: 'Other' },
  ],
  venue_issue: [
    { value: 'wrong_category', label: 'Wrong category (not a restaurant/bar/cafe)' },
    { value: 'permanently_closed', label: 'Permanently closed' },
    { value: 'duplicate', label: 'Duplicate listing' },
    { value: 'inappropriate', label: 'Inappropriate content' },
    { value: 'other', label: 'Other' },
  ],
  general: [
    { value: 'love_it', label: 'Love it' },
    { value: 'confusing', label: 'Something was confusing' },
    { value: 'suggestion', label: 'Suggestion' },
    { value: 'other', label: 'Other' },
  ],
};

/**
 * Record user feedback (bug/feature/venue issue/general, closed reason +
 * optional free text). Moderation-only data — not readable by the
 * submitting user, only by admins.
 */
export async function submitFeedback({ category, closedReason, openText, venueId = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !category || !closedReason) {
    return { error: new Error('Missing user, category, or closedReason') };
  }

  return supabase.from('feedback').insert({
    user_id: user.id,
    category,
    closed_reason: closedReason,
    open_text: openText?.trim() || null,
    venue_id: venueId,
  });
}

/**
 * Admin-only: soft-hide a venue from Feed/Search. RLS enforces the
 * admin check server-side, so this fails safely for non-admins.
 */
export async function removeVenue(venueId) {
  if (!venueId) return { error: new Error('Missing venueId') };

  return supabase
    .from('venues')
    .update({ is_removed: true })
    .eq('google_place_id', venueId);
}
