import { assertEquals } from 'jsr:@std/assert';
import { openStatus } from './openingHours.ts';

const at = (day: number, hhmm: string) => ({ day, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) });
const lateNight = [0, 1, 2, 3, 4].map((day) => ({ day, open: '11:30', close: '00:00' }))
  .concat([5, 6].map((day) => ({ day, open: '11:30', close: '02:00' })));

Deno.test('no hours is unknown', () => {
  assertEquals(openStatus(null, at(0, '12:00')), 'unknown');
  assertEquals(openStatus([], at(0, '12:00')), 'unknown');
});

Deno.test('closes at midnight: open in the evening, closed after', () => {
  assertEquals(openStatus(lateNight, at(0, '19:53')), 'open');
  assertEquals(openStatus(lateNight, at(1, '23:59')), 'open');
  assertEquals(openStatus(lateNight, at(2, '00:30')), 'closed');
  assertEquals(openStatus(lateNight, at(1, '10:00')), 'closed');
});

Deno.test('runs past midnight into the next day', () => {
  assertEquals(openStatus(lateNight, at(6, '01:30')), 'open');  // Fri 11:30 to Sat 02:00
  assertEquals(openStatus(lateNight, at(0, '01:30')), 'open');  // Sat 11:30 to Sun 02:00
  assertEquals(openStatus(lateNight, at(0, '02:30')), 'closed');
});

Deno.test('24/7 venue is always open', () => {
  assertEquals(openStatus([{ day: 0, open: '00:00', close: '23:59' }], at(3, '04:00')), 'open');
});

Deno.test('split lunch/dinner hours', () => {
  const split = [{ day: 2, open: '11:00', close: '14:00' }, { day: 2, open: '17:00', close: '22:00' }];
  assertEquals(openStatus(split, at(2, '12:00')), 'open');
  assertEquals(openStatus(split, at(2, '15:30')), 'closed');
  assertEquals(openStatus(split, at(2, '21:59')), 'open');
  assertEquals(openStatus(split, at(2, '22:00')), 'closed');
});
