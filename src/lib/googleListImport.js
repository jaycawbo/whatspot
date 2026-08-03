// Parses a Google Takeout "Saved Places" list export (CSV) into a flat list
// of { title, lat, lon } entries ready to resolve against the Places API.
//
// Takeout CSVs for a Maps list use columns Title / Note / URL (case can vary
// slightly across export versions). We only need Title; lat/lon are opportunistically
// extracted from the URL's "@lat,lon,zoom" segment to bias the search, when present.

const MAX_IMPORT_ROWS = 100;

function parseCsvLine(line) {
  // Minimal CSV field splitter that handles quoted fields containing commas.
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
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
  const lines = (csvText || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { entries: [], truncated: false };

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const titleIdx = header.findIndex((h) => h === 'title' || h === 'name');
  const urlIdx = header.findIndex((h) => h === 'url' || h === 'google maps url' || h === 'link');
  if (titleIdx === -1) return { entries: [], truncated: false };

  const rows = lines.slice(1);
  const truncated = rows.length > MAX_IMPORT_ROWS;
  const entries = rows.slice(0, MAX_IMPORT_ROWS).map((line) => {
    const fields = parseCsvLine(line);
    const title = (fields[titleIdx] || '').trim();
    const { lat, lon } = urlIdx !== -1 ? extractLatLon(fields[urlIdx]) : { lat: null, lon: null };
    return { title, lat, lon };
  }).filter((e) => e.title.length > 0);

  return { entries, truncated };
}

export { MAX_IMPORT_ROWS };
