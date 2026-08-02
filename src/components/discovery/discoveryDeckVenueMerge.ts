// Pure venue-list reconciliation logic for DiscoveryDeck's background-expansion
// path (ripple expansion / criteria relaxation replacing the underlying feed).
// Extracted so the merge decision is directly unit-testable without mounting
// the component. No I/O — see DiscoveryDeck.jsx for the effect that calls this.

interface VenueLike {
  place_id?: string;
  google_place_id?: string;
  [key: string]: unknown;
}

export function getVenueId(venue: VenueLike | null | undefined): string {
  return (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
}

// The venue at `currentIndex` isn't present anywhere in `incomingVenues` — the deck's
// underlying list was replaced wholesale out from under the user (e.g. a radius/criteria
// expansion fetch). Naively clamping the old numeric index into the new array would swap
// `currentVenue` to an unrelated venue the user never navigated to, firing a phantom
// "shown" event (and a phantom photo-fetch call) for it.
//
// Instead, keep everything up to and including the current card exactly as-is — so
// `currentVenue` never silently changes — and append the freshly fetched venues after it,
// deduped against IDs already kept, so the deck still gets topped up for when the user
// actually advances.
export function mergeVenuesOnBackgroundExpansion(
  prevVenues: VenueLike[],
  currentIndex: number,
  incomingVenues: VenueLike[]
): VenueLike[] {
  const kept = prevVenues.slice(0, currentIndex + 1);
  const keptIds = new Set(kept.map(getVenueId));
  const fresh = incomingVenues.filter((v) => !keptIds.has(getVenueId(v)));
  return [...kept, ...fresh];
}
