// Validates an Instagram seed CSV and emits SQL for venues.instagram_handle and
// venue_instagram_posts. No database access, no network, no env reads: review
// the SQL, then paste it into the Supabase SQL editor.
//
// CSV columns: google_place_id,instagram_handle,permalink_1,permalink_2,permalink_3
// (template: scripts/instagram-seed-template.csv; lines starting with # are skipped)
//
// Usage: npm run instagram-seed -- <file.csv>                   dry run: report + SQL preview
//        npm run instagram-seed -- <file.csv> --out <seed.sql>  also write the SQL file
//
// For each valid venue row the SQL: sets the handle (or clears it when blank),
// upserts the listed posts in column order, and deactivates that venue's other posts.
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeHandle, parsePermalink } from '../src/lib/social/instagram.js';

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const HEADER = ['google_place_id', 'instagram_handle', 'permalink_1', 'permalink_2', 'permalink_3'];
const MAX_POSTS = 3;

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
const csvPath = args.find((a, i) => !a.startsWith('--') && !(outIdx >= 0 && i === outIdx + 1));

if (!csvPath || (outIdx >= 0 && !outPath)) {
  console.error('Usage: npm run instagram-seed -- <file.csv> [--out <seed.sql>]');
  process.exit(1);
}

// Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push({ line: rowLine, cells: row });
      row = [];
      field = '';
      line++;
      rowLine = line;
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push({ line: rowLine, cells: row });
  }
  return rows;
}

const sqlLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

let text;
try {
  text = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
} catch {
  console.error(`Can't read "${csvPath}". Copy scripts/instagram-seed-template.csv, fill it in, and pass its path.`);
  process.exit(1);
}
const rows = parseCsv(text).filter(({ cells }) => {
  const first = (cells[0] ?? '').trim();
  return !(cells.every((c) => c.trim() === '') || first.startsWith('#'));
});

if (!rows.length) {
  console.error('CSV is empty.');
  process.exit(1);
}

const header = rows.shift().cells.map((c) => c.trim().toLowerCase());
if (HEADER.some((h, i) => header[i] !== h)) {
  console.error(`Bad header. Expected: ${HEADER.join(',')}`);
  process.exit(1);
}

const accepted = [];
const errors = [];
const seenPlaceIds = new Set();

for (const { line, cells } of rows) {
  const rowErrors = [];
  const [rawPlaceId = '', rawHandle = '', ...rawPermalinks] = cells.map((c) => c.trim());

  if (cells.length > HEADER.length && cells.slice(HEADER.length).some((c) => c.trim())) {
    rowErrors.push(`more than ${MAX_POSTS} permalinks`);
  }

  if (!PLACE_ID_RE.test(rawPlaceId)) rowErrors.push(`invalid google_place_id "${rawPlaceId}"`);
  else if (seenPlaceIds.has(rawPlaceId)) rowErrors.push(`duplicate google_place_id "${rawPlaceId}"`);

  let handle = null;
  if (rawHandle) {
    handle = normalizeHandle(rawHandle);
    if (!handle) rowErrors.push(`invalid instagram_handle "${rawHandle}"`);
  }

  const posts = [];
  const shortcodes = new Set();
  rawPermalinks.slice(0, MAX_POSTS).forEach((raw, i) => {
    if (!raw) return;
    const parsed = parsePermalink(raw);
    if (!parsed) rowErrors.push(`invalid permalink_${i + 1} "${raw}"`);
    else if (shortcodes.has(parsed.shortcode)) rowErrors.push(`duplicate post in permalink_${i + 1}`);
    else {
      shortcodes.add(parsed.shortcode);
      posts.push({ ...parsed, sortOrder: posts.length });
    }
  });

  if (!rowErrors.length && !handle && !posts.length) rowErrors.push('no handle and no permalinks');

  if (rowErrors.length) {
    errors.push({ line, placeId: rawPlaceId, rowErrors });
  } else {
    seenPlaceIds.add(rawPlaceId);
    accepted.push({ placeId: rawPlaceId, handle, posts });
  }
}

function buildSql(venues) {
  const out = [
    `-- Instagram seed generated ${new Date().toISOString()} from ${csvPath}`,
    `-- ${venues.length} venue(s). Review, then run in the Supabase SQL editor.`,
    'BEGIN;',
    '',
  ];

  for (const { placeId, handle, posts } of venues) {
    const pid = sqlLiteral(placeId);
    out.push(`-- ${placeId}`);
    out.push(
      `UPDATE public.venues SET instagram_handle = ${handle ? sqlLiteral(handle) : 'NULL'} WHERE google_place_id = ${pid};`
    );
    if (posts.length) {
      out.push('INSERT INTO public.venue_instagram_posts (venue_id, permalink, shortcode, sort_order, is_active)');
      out.push(`SELECT v.id, p.permalink, p.shortcode, p.sort_order, true`);
      out.push(`FROM public.venues v, (VALUES`);
      out.push(
        posts
          .map((p) => `  (${sqlLiteral(p.permalink)}, ${sqlLiteral(p.shortcode)}, ${p.sortOrder})`)
          .join(',\n')
      );
      out.push(`) AS p(permalink, shortcode, sort_order)`);
      out.push(`WHERE v.google_place_id = ${pid}`);
      out.push(
        'ON CONFLICT (venue_id, shortcode) DO UPDATE SET permalink = EXCLUDED.permalink, sort_order = EXCLUDED.sort_order, is_active = true;'
      );
    }
    const keep = posts.length ? ` AND shortcode NOT IN (${posts.map((p) => sqlLiteral(p.shortcode)).join(', ')})` : '';
    out.push(
      `UPDATE public.venue_instagram_posts SET is_active = false WHERE venue_id = (SELECT id FROM public.venues WHERE google_place_id = ${pid})${keep};`
    );
    out.push('');
  }

  out.push('COMMIT;');
  out.push('');
  out.push('-- Place ids in this seed with no matching venue (these rows did nothing):');
  out.push('SELECT p.google_place_id FROM (VALUES');
  out.push(venues.map((v) => `  (${sqlLiteral(v.placeId)})`).join(',\n'));
  out.push(') AS p(google_place_id)');
  out.push('WHERE NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.google_place_id = p.google_place_id);');
  return out.join('\n') + '\n';
}

console.log(`Rows: ${accepted.length + errors.length}  accepted: ${accepted.length}  rejected: ${errors.length}`);
for (const { line, placeId, rowErrors } of errors) {
  console.log(`  line ${line} (${placeId || 'no place id'}): ${rowErrors.join('; ')}`);
}

if (!accepted.length) {
  console.log('\nNothing to seed.');
  process.exit(errors.length ? 1 : 0);
}

const sql = buildSql(accepted);

if (outPath) {
  writeFileSync(outPath, sql);
  console.log(`\nWrote ${outPath}. Rejected rows were left out.`);
} else {
  console.log('\n-- DRY RUN: nothing written. Add --out <seed.sql> to save this SQL.\n');
  console.log(sql);
}

process.exit(errors.length ? 1 : 0);
