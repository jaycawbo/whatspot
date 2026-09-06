import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeSuppressedIds } from './skipHistory.ts';

const DAY = 24 * 60 * 60 * 1000;

function row(venue_id: string, interaction_type: string, ageDays: number, now: number) {
  return { venue_id, interaction_type, created_at: new Date(now - ageDays * DAY).toISOString() };
}

Deno.test('computeSuppressedIds: indefinite type (interested) stays suppressed far past 90 days', () => {
  const now = Date.now();
  const { suppressed, expired } = computeSuppressedIds([row('v1', 'interested', 400, now)], now);
  assertEquals(suppressed.has('v1'), true);
  assertEquals(expired, []);
});

Deno.test('computeSuppressedIds: indefinite type (been_here) stays suppressed far past 90 days', () => {
  const now = Date.now();
  const { suppressed, expired } = computeSuppressedIds([row('v1', 'been_here', 400, now)], now);
  assertEquals(suppressed.has('v1'), true);
  assertEquals(expired, []);
});

Deno.test('computeSuppressedIds: finite type within its window is suppressed, not expired', () => {
  const now = Date.now();
  const { suppressed, expired } = computeSuppressedIds([row('v1', 'not_interested', 10, now)], now);
  assertEquals(suppressed.has('v1'), true);
  assertEquals(expired, []);
});

Deno.test('computeSuppressedIds: finite type past its window is not suppressed and marked expired', () => {
  const now = Date.now();
  const { suppressed, expired } = computeSuppressedIds([row('v1', 'not_interested', 91, now)], now);
  assertEquals(suppressed.has('v1'), false);
  assertEquals(expired, ['v1']);
});

Deno.test('computeSuppressedIds: passive_skip (7d) expires quickly', () => {
  const now = Date.now();
  const stillIn = computeSuppressedIds([row('v1', 'passive_skip', 6, now)], now);
  assertEquals(stillIn.suppressed.has('v1'), true);

  const pastWindow = computeSuppressedIds([row('v1', 'passive_skip', 8, now)], now);
  assertEquals(pastWindow.suppressed.has('v1'), false);
  assertEquals(pastWindow.expired, ['v1']);
});

Deno.test('computeSuppressedIds: unknown interaction_type is ignored (not suppressed, not expired)', () => {
  const now = Date.now();
  const { suppressed, expired } = computeSuppressedIds([row('v1', 'mystery_type', 400, now)], now);
  assertEquals(suppressed.has('v1'), false);
  assertEquals(expired, []);
});
