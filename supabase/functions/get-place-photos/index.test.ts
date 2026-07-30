import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { planPhotoFetch, selectNetNewPhotos, mergeFetchedPhotos } from './index.ts';

// ── planPhotoFetch ───────────────────────────────────────────────────────────

Deno.test('planPhotoFetch: fresh venue needs the full max_photos', () => {
  assertEquals(planPhotoFetch(0, 4), 4);
});

Deno.test('planPhotoFetch: partial previous fetch needs only the remainder', () => {
  assertEquals(planPhotoFetch(2, 4), 2);
});

Deno.test('planPhotoFetch: existing count already meets max_photos → no delta', () => {
  assertEquals(planPhotoFetch(4, 4), 0);
});

Deno.test('planPhotoFetch: existing count exceeds max_photos (smaller request) → no delta, never negative', () => {
  assertEquals(planPhotoFetch(4, 1), 0);
});

// ── selectNetNewPhotos ───────────────────────────────────────────────────────

Deno.test('selectNetNewPhotos: fresh venue takes photos from the start', () => {
  const googlePhotos = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  assertEquals(selectNetNewPhotos(googlePhotos, 0, 4), ['p0', 'p1', 'p2', 'p3']);
});

Deno.test('selectNetNewPhotos: resumes at existingCount instead of restarting at 0', () => {
  const googlePhotos = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  assertEquals(selectNetNewPhotos(googlePhotos, 2, 4), ['p2', 'p3']);
});

Deno.test('selectNetNewPhotos: nothing left when existingCount reaches total available (genuinely complete)', () => {
  const googlePhotos = ['p0', 'p1', 'p2'];
  assertEquals(selectNetNewPhotos(googlePhotos, 3, 4), []);
});

// ── mergeFetchedPhotos ───────────────────────────────────────────────────────

Deno.test('mergeFetchedPhotos: appends new photos onto existing ones, does not overwrite', () => {
  const existing = ['url0', 'url1'];
  const fetched = [
    { index: 2, url: 'url2' },
    { index: 3, url: 'url3' },
  ];
  const { mergedUrls, photosComplete } = mergeFetchedPhotos(existing, fetched, 4, 10);
  assertEquals(mergedUrls, ['url0', 'url1', 'url2', 'url3']);
  assertEquals(photosComplete, true); // reached the requested max_photos target (4), even though Google has 10 total
});

Deno.test('mergeFetchedPhotos: out-of-order concurrent completions are re-sorted by absolute index', () => {
  const existing: string[] = [];
  const fetched = [
    { index: 2, url: 'url2' },
    { index: 0, url: 'url0' },
    { index: 1, url: 'url1' },
  ];
  const { mergedUrls } = mergeFetchedPhotos(existing, fetched, 4, 10);
  assertEquals(mergedUrls, ['url0', 'url1', 'url2']);
});

Deno.test('mergeFetchedPhotos: null entries (failed downloads) are dropped without leaving gaps', () => {
  const existing = ['url0', 'url1'];
  const fetched = [
    { index: 2, url: 'url2' },
    null, // index 3 failed to download
  ];
  const { mergedUrls, photosComplete } = mergeFetchedPhotos(existing, fetched, 4, 4);
  assertEquals(mergedUrls, ['url0', 'url1', 'url2']);
  assertEquals(photosComplete, false); // only 3 of 4 available are stored — index 3 will be retried next call
});

Deno.test('mergeFetchedPhotos: not complete while merged count is below both max_photos and totalAvailable', () => {
  const existing = ['url0'];
  const fetched = [{ index: 1, url: 'url1' }]; // merged = 2, target = 4, Google has 10
  const { mergedUrls, photosComplete } = mergeFetchedPhotos(existing, fetched, 4, 10);
  assertEquals(mergedUrls, ['url0', 'url1']);
  assertEquals(photosComplete, false);
});

Deno.test('mergeFetchedPhotos: complete once merged count reaches max_photos, regardless of totalAvailable', () => {
  const existing = ['url0', 'url1'];
  const fetched = [
    { index: 2, url: 'url2' },
    { index: 3, url: 'url3' },
  ];
  const { photosComplete } = mergeFetchedPhotos(existing, fetched, 4, 10);
  assertEquals(photosComplete, true); // merged = 4 = max_photos, even though Google has 10 total
});

Deno.test('mergeFetchedPhotos: complete when merged count reaches totalAvailable even below max_photos', () => {
  const existing = ['url0'];
  const fetched = [{ index: 1, url: 'url1' }];
  const { mergedUrls, photosComplete } = mergeFetchedPhotos(existing, fetched, 4, 2);
  assertEquals(mergedUrls, ['url0', 'url1']);
  assertEquals(photosComplete, true); // venue genuinely only has 2 photos total
});
