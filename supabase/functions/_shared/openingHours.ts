// Open-now evaluation against stored regular_opening_hours periods (issue #385).
//
// Periods are stored as { day, open: 'HH:MM', close: 'HH:MM' } (see parsePeriods in
// refresh-venue-weekly). The close day isn't stored, so a close at or before the open
// time (e.g. 17:00 to 02:00, or 11:30 to 00:00) means the period runs past midnight into
// the next day. A lone Sunday 00:00 to 23:59 period is how a 24/7 venue (Google: open
// with no close) comes out of parsePeriods.

export type OpenStatus = 'open' | 'closed' | 'unknown';

export interface LocalTime {
  day: number;     // 0 = Sunday, matching Google's period.day
  minutes: number; // minutes since local midnight
}

// Edge functions run in UTC, so "now" must be the venue's local time. The client sends
// its own local day/minutes (the feed is anchored near the user, so that's the venue's
// clock too). Only if the client didn't send them, fall back to Toronto, the only
// market today (see #252 for removing Toronto assumptions).
export function resolveLocalTime(day: unknown, minutes: unknown): LocalTime {
  if (Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6 &&
      Number.isInteger(minutes) && (minutes as number) >= 0 && (minutes as number) < 1440) {
    return { day: day as number, minutes: minutes as number };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: weekdayMap[get('weekday')] ?? 0, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function toMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== 'string') return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

export function openStatus(periods: unknown, now: LocalTime): OpenStatus {
  if (!Array.isArray(periods) || periods.length === 0) return 'unknown';

  if (periods.length === 1 && periods[0]?.open === '00:00' && periods[0]?.close === '23:59') return 'open';

  const yesterday = (now.day + 6) % 7;
  for (const p of periods) {
    const open = toMinutes(p?.open);
    let close = toMinutes(p?.close);
    if (open == null || close == null) continue;
    if (close === 23 * 60 + 59) close = 24 * 60;

    if (close > open) {
      if (p.day === now.day && now.minutes >= open && now.minutes < close) return 'open';
    } else {
      // Runs past midnight: open from `open` on p.day until `close` on the next day.
      if (p.day === now.day && now.minutes >= open) return 'open';
      if (p.day === yesterday && now.minutes < close) return 'open';
    }
  }
  return 'closed';
}
