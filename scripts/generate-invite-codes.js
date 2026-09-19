// Generates soft-launch invite codes and prints INSERT SQL plus invite links.
// No database access or secrets needed: paste the SQL into the Supabase SQL editor.
//
// Usage: npm run invite-codes -- <count> [label-prefix] [base-url]
// e.g.   npm run invite-codes -- 25 batch1 https://whatspot-ai.vercel.app
import { randomInt } from 'node:crypto';

// Lowercase, no lookalikes (0/o, 1/l/i), easy to type on a phone.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 10;

const count = Number.parseInt(process.argv[2], 10);
const prefix = process.argv[3] || 'tester';
const baseUrl = (process.argv[4] || 'http://localhost:8080').replace(/\/$/, '');

if (!Number.isInteger(count) || count < 1 || count > 200) {
  console.error('Usage: npm run invite-codes -- <count 1-200> [label-prefix] [base-url]');
  process.exit(1);
}

const makeCode = () =>
  Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const codes = new Set();
while (codes.size < count) codes.add(makeCode());

const rows = [...codes].map((code, i) => ({
  code,
  label: `${prefix}-${String(i + 1).padStart(2, '0')}`,
}));

console.log('-- Paste into the Supabase SQL editor\n');
console.log('INSERT INTO public.invite_codes (code, label) VALUES');
console.log(rows.map((r) => `  ('${r.code}', '${r.label}')`).join(',\n') + ';\n');
console.log('-- Invite links\n');
rows.forEach((r) => console.log(`${r.label}\t${baseUrl}/?invite=${r.code}`));
