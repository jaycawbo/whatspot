export const VISIBLE_LISTS = ['Favourites', 'Interested'];
export const HIDDEN_LISTS = ['Been To', 'Not Interested', "Didn't Like It"];

export const LIST_MATCHER = {
  Favourites: (s) => s.interactionType === 'rated' && s.rating === 'loved',
  Interested: (s) => s.interactionType === 'interested',
  // Catch-all: any rated venue counts as "Been To", regardless of sentiment.
  // A venue can therefore match both 'Been To' and Favourites/Didn't Like It.
  'Been To': (s) => s.interactionType === 'rated',
  'Not Interested': (s) => s.interactionType === 'not_interested',
  "Didn't Like It": (s) => s.interactionType === 'rated' && s.rating === 'disliked',
};

export const EMPTY_STATES = {
  Favourites: 'Venues you love will appear here.',
  Interested: 'Swipe right on venues you want to explore.',
  'Been To': 'Rate a venue after visiting — it will appear here.',
  'Not Interested': "Swipe left on venues that aren't for you.",
  "Didn't Like It": 'Rate a venue 👎 after visiting — it will appear here.',
};

export const STATUS_LIST_TO_SLUG = {
  Favourites: 'favourites',
  Interested: 'interested',
  'Been To': 'been-to',
  'Not Interested': 'not-interested',
  "Didn't Like It": 'didnt-like-it',
};

export const SLUG_TO_STATUS_LIST = Object.fromEntries(
  Object.entries(STATUS_LIST_TO_SLUG).map(([listKey, slug]) => [slug, listKey])
);
