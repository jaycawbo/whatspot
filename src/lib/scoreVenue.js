const RATING_FLOOR = 4.0;
const RATING_CEILING = 5.0;
const REVIEW_FLOOR = 25;
const REVIEW_CAP = 2000;
const RATING_WEIGHT = 0.60;
const REVIEW_WEIGHT = 0.40;

export function scoreVenue(venue, { deprioritiseReviewCount = false } = {}) {
  const rating = venue.rating ?? 0;
  const reviewCount = venue.review_count ?? 0;
  const normalizedRating = Math.max(0, ((rating - RATING_FLOOR) / (RATING_CEILING - RATING_FLOOR)) * 10);
  const normalizedReviews = Math.max(0, Math.min((reviewCount - REVIEW_FLOOR) / (REVIEW_CAP - REVIEW_FLOOR), 1.0)) * 10;
  // deprioritiseReviewCount (hidden-gem mode): shrink review weight so rating dominates
  const effectiveReviewWeight = deprioritiseReviewCount ? 0.05 : REVIEW_WEIGHT;
  return normalizedRating * (1 - effectiveReviewWeight) + normalizedReviews * effectiveReviewWeight;
}
