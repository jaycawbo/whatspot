// Parses a Google Takeout "Saved Places" list export (CSV) into a flat list
// of { title, lat, lon } entries ready to resolve against the Places API.
//
// Takeout CSVs for a Maps list use columns Title / Note / URL (case can vary
// slightly across export versions). We only need Title; lat/lon are opportunistically
// extracted from the URL's "@lat,lon,zoom" segment to bias the search, when present.

const MAX_IMPORT_ROWS = 100;

// Full single-pass CSV parse (not line-split-then-parse) so a quoted field
// containing a literal newline — common in Takeout's "Note" column — doesn't
// get torn into two rows with misaligned columns.
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  const src = text || '';

  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(current);
      current = '';
    } else if (char === '\r') {
      // skip — paired \n (if present) ends the row below
    } else if (char === '\n') {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  // Final field/row if the text doesn't end with a newline
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((r) => r.some((f) => f.trim().length > 0));
}

function extractLatLon(url) {
  if (!url) return { lat: null, lon: null };
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return { lat: null, lon: null };
  return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
}

/**
 * @returns {{ entries: {title:string, lat:number|null, lon:number|null}[], truncated: boolean }}
 */
export function parseTakeoutCsv(csvText) {
  const allRows = parseCsvRows(csvText);
  if (allRows.length < 2) return { entries: [], truncated: false };

  const header = allRows[0].map((h) => h.trim().toLowerCase());
  const titleIdx = header.findIndex((h) => h === 'title' || h === 'name');
  const urlIdx = header.findIndex((h) => h === 'url' || h === 'google maps url' || h === 'link');
  if (titleIdx === -1) return { entries: [], truncated: false };

  const rows = allRows.slice(1);
  const truncated = rows.length > MAX_IMPORT_ROWS;
  const entries = rows.slice(0, MAX_IMPORT_ROWS).map((fields) => {
    const title = (fields[titleIdx] || '').trim();
    const { lat, lon } = urlIdx !== -1 ? extractLatLon(fields[urlIdx]) : { lat: null, lon: null };
    return { title, lat, lon };
  }).filter((e) => e.title.length > 0);

  return { entries, truncated };
}

export { MAX_IMPORT_ROWS };
