const RATING_FLOOR = 4.0;
const RATING_CEILING = 5.0;
const REVIEW_FLOOR = 25;
const REVIEW_CAP = 500;
const TRUST_WEIGHT = 0.25;

export function scoreVenue(venue, { deprioritiseReviewCount = false } = {}) {
  const rating = venue.rating ?? 0;
  const reviewCount = venue.review_count ?? 0;
  const normalizedRating = ((rating - RATING_FLOOR) / (RATING_CEILING - RATING_FLOOR)) * 10;
  const trustFactor = Math.max(0, Math.min((reviewCount - REVIEW_FLOOR) / (REVIEW_CAP - REVIEW_FLOOR), 1.0));
  const effectiveTrustWeight = deprioritiseReviewCount ? 0.05 : TRUST_WEIGHT;
  return normalizedRating * ((1 - effectiveTrustWeight) + effectiveTrustWeight * trustFactor);
}
