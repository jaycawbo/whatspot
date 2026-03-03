import { mockVenues, mockSuggestedChips } from '@/data/mockVenues';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function recommend(params) {
  await delay(600);

  let results = [...mockVenues];

  // Simple query filtering (mock)
  if (params.query) {
    const q = params.query.toLowerCase();
    results = results.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.cuisine_type.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q)
    );
  }

  // If no results from filter, return all (mock behavior)
  if (results.length === 0) {
    results = [...mockVenues];
  }

  return {
    results,
    pagination: { has_more: false, next_cursor: null, candidate_set_id: 'mock-set-1' },
    suggested_chips: mockSuggestedChips,
    applied_relaxations: params.relaxation_level > 0 ? ['Expanded search radius'] : [],
    gated: false,
  };
}

export async function recommendPage(params) {
  await delay(400);
  return {
    results: [],
    pagination: { has_more: false, next_cursor: null, candidate_set_id: params.candidate_set_id },
  };
}
