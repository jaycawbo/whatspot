import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAndLog } from './apiCallLog.ts';

export interface PhotoFetchResult {
  success: boolean;
  photo_urls: string[];
  capped?: boolean;
  error?: string;
}

async function fetchWithConcurrency<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 3): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];

  async function processNext() {
    if (queue.length === 0) return;
    const item = queue.shift()!;
    const result = await fn(item);
    results.push(result);
    await processNext();
  }

  await Promise.all(Array(limit).fill(null).map(() => processNext()));
  return results;
}

/**
 * Single source of truth for "what counts as a resolved photo state" for a venue.
 * Calls Google Places (photos-only field mask), downloads + stores any photos found,
 * and persists photos_complete/photo_urls accordingly. Shared by get-place-photos
 * (on-demand, single venue) and backfill-photos-complete (batch, cap-aware).
 *
 * Does NOT do the cache-first DB read — callers that want a cache-first check
 * (e.g. get-place-photos) do that themselves before calling this.
 */
export async function fetchAndPersistPhotos(
  sb: SupabaseClient,
  apiKey: string,
  cleanId: string,
  maxPhotos: number,
): Promise<PhotoFetchResult> {
  const allowed = await checkAndLog(sb, 'photos', cleanId, maxPhotos + 1);
  if (!allowed) {
    return { success: false, photo_urls: [], capped: true, error: 'Monthly API cap reached' };
  }

  try {
    const placeRef = cleanId.startsWith('places/') ? cleanId : `places/${cleanId}`;
    const detailsResp = await fetch(`https://places.googleapis.com/v1/${placeRef}?fields=photos`, {
      headers: { 'X-Goog-Api-Key': apiKey },
    });

    if (!detailsResp.ok) {
      console.error(`Google Places error ${detailsResp.status} for ${cleanId}`);
      return { success: false, photo_urls: [], error: 'Google Places API error' };
    }

    const data = await detailsResp.json();
    const totalAvailable = (data.photos || []).length;
    const photoResources = ((data.photos || []) as any[]).slice(0, maxPhotos);

    if (photoResources.length === 0) {
      const { error: updateError } = await sb.from('venues')
        .update({ photos_complete: true, photos_fetched_count: 0 })
        .eq('google_place_id', cleanId);
      if (updateError) {
        console.error(`Failed to persist empty-photos state for ${cleanId}:`, updateError.message);
      }
      return { success: true, photo_urls: [] };
    }

    const photoUrls = await fetchWithConcurrency(
      photoResources.map((photo: any, index: number) => ({ photo, index })),
      async ({ photo, index }: { photo: any; index: number }) => {
        try {
          const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=800&skipHttpRedirect=false&key=${apiKey}`;
          const imgResp = await fetch(mediaUrl, { redirect: 'follow' });
          if (!imgResp.ok) {
            console.warn(`Media fetch failed (${imgResp.status}) for photo ${index} of ${cleanId}`);
            return null;
          }

          const imageBytes = await imgResp.arrayBuffer();
          const storagePath = `${cleanId}/${index}.jpg`;

          const { error: uploadError } = await sb.storage
            .from('venue-photos')
            .upload(storagePath, imageBytes, { contentType: 'image/jpeg', upsert: true });

          if (uploadError) {
            console.warn(`Storage upload failed for ${storagePath}:`, uploadError.message);
            return null;
          }

          const { data: urlData } = sb.storage
            .from('venue-photos')
            .getPublicUrl(storagePath);

          return urlData.publicUrl;
        } catch (err: any) {
          console.error(`Error processing photo ${index} for ${cleanId}:`, err?.message);
          return null;
        }
      },
      3,
    );

    const validUrls = photoUrls.filter((url): url is string => url !== null);
    console.log(`📸 Stored ${validUrls.length}/${photoResources.length} photos for ${cleanId}`);

    if (validUrls.length > 0) {
      const { error: updateError } = await sb.from('venues')
        .update({
          photo_urls: validUrls,
          photos_complete: validUrls.length >= maxPhotos || validUrls.length >= totalAvailable,
          photos_fetched_count: validUrls.length,
          enriched: true,
        })
        .eq('google_place_id', cleanId);
      if (updateError) {
        console.error(`Failed to persist photo_urls for ${cleanId}:`, updateError.message);
      }
    }

    return { success: true, photo_urls: validUrls };
  } catch (error: any) {
    console.error('fetchAndPersistPhotos error:', error?.message);
    return { success: false, photo_urls: [], error: 'Internal error' };
  }
}
