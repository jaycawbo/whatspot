import os
from collections import defaultdict
import duckdb
from dotenv import load_dotenv
from supabase import create_client
from huggingface_hub import HfFileSystem
from rapidfuzz import fuzz

load_dotenv()
SUPABASE_URL = os.environ["VITE_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"]
HF_TOKEN = os.environ.get("HF_TOKEN")

BBOX = {"lon_min": -79.6393, "lon_max": -79.1161, "lat_min": 43.5810, "lat_max": 43.8554}
BATCH_SIZE = 100
RUN_CAP = 35000
BASE = "hf://datasets/foursquare/fsq-os-places/release/dt=2026-04-14"

# ── Step 1: Pull existing Supabase venues ──────────────────────────────────────
print("Loading existing venues from Supabase...")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

existing = []
page = 0
PAGE_SIZE = 1000
while True:
    resp = (
        supabase.table("venues")
        .select("name, lat, lng")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .execute()
    )
    batch = resp.data or []
    existing.extend(batch)
    if len(batch) < PAGE_SIZE:
        break
    page += 1

print(f"Loaded {len(existing)} existing venues from Supabase")

# Build spatial index: round to 3dp (~100m grid) for fast proximity lookup
spatial_index = defaultdict(list)
for ev in existing:
    if ev["lat"] is not None and ev["lng"] is not None:
        key = (round(ev["lat"], 3), round(ev["lng"], 3))
        spatial_index[key].append(ev)

def find_nearby_existing(lat, lon):
    candidates = []
    for dlat in (-0.001, 0, 0.001):
        for dlon in (-0.001, 0, 0.001):
            key = (round(lat + dlat, 3), round(lon + dlon, 3))
            candidates.extend(spatial_index.get(key, []))
    return candidates

# ── Step 2: Pull Toronto Foursquare venues ─────────────────────────────────────
print("Loading Foursquare categories...")
fs = HfFileSystem(token=HF_TOKEN)
con = duckdb.connect()
con.register_filesystem(fs)

cat_rows = con.execute(f"""
    SELECT category_id, category_name
    FROM read_parquet('{BASE}/categories/parquet/*.parquet')
    WHERE category_name ILIKE '%restaurant%'
       OR category_name ILIKE '%bar%'
       OR category_name ILIKE '%cafe%'
       OR category_name ILIKE '%coffee%'
       OR category_name ILIKE '%pub%'
       OR category_name ILIKE '%nightclub%'
       OR category_name ILIKE '%brewery%'
       OR category_name ILIKE '%bakery%'
       OR category_name ILIKE '%bistro%'
       OR category_name ILIKE '%diner%'
       OR category_name ILIKE '%lounge%'
       OR category_name ILIKE '%food%'
""").fetchall()

cat_id_to_name = {row[0]: row[1] for row in cat_rows}
print(f"Found {len(cat_id_to_name)} food/drink category IDs")

# Load category IDs into a temp table for the places join
con.execute("CREATE TEMP TABLE food_cats (cid VARCHAR)")
con.executemany("INSERT INTO food_cats VALUES (?)", [[cid] for cid in cat_id_to_name])

print("Loading Foursquare Toronto places (this takes a few minutes)...")
fsq_rows = con.execute(f"""
    SELECT
        p.name,
        p.latitude,
        p.longitude,
        p.fsq_place_id,
        p.fsq_category_ids[1] AS primary_cat_id
    FROM read_parquet('{BASE}/places/parquet/*.parquet') p
    WHERE p.longitude BETWEEN {BBOX['lon_min']} AND {BBOX['lon_max']}
      AND p.latitude  BETWEEN {BBOX['lat_min']} AND {BBOX['lat_max']}
      AND list_has_any(p.fsq_category_ids, (SELECT list(cid) FROM food_cats))
""").fetchall()

total_fsq = len(fsq_rows)
print(f"Foursquare returned {total_fsq} Toronto food/drink venues")

# ── Step 3: Dedup ──────────────────────────────────────────────────────────────
def map_category(cat_name):
    if not cat_name:
        return "restaurant"
    cn = cat_name.lower()
    if any(w in cn for w in ("nightclub", "club")): return "night_club"
    if any(w in cn for w in ("brewery", "brewpub")): return "brewery"
    if any(w in cn for w in ("bar", "pub", "lounge", "tavern")): return "bar"
    if any(w in cn for w in ("cafe", "coffee", "espresso", "tea")): return "cafe"
    if "bakery" in cn: return "bakery"
    if "bistro" in cn: return "bistro"
    if "diner" in cn: return "diner"
    return "restaurant"

print("Deduplicating...")
new_venues = []
skipped = 0

for name, lat, lon, fsq_id, primary_cat_id in fsq_rows:
    if not name or lat is None or lon is None:
        continue

    nearby = find_nearby_existing(lat, lon)
    matched = False
    for ev in nearby:
        if abs(ev["lat"] - lat) <= 0.0005 and abs(ev["lng"] - lon) <= 0.0005:
            if fuzz.ratio(name.lower(), (ev["name"] or "").lower()) >= 80:
                matched = True
                break

    if matched:
        skipped += 1
    else:
        cat_name = cat_id_to_name.get(primary_cat_id, "")
        new_venues.append({
            "name": name,
            "lat": lat,
            "lng": lon,
            "address": "",
            "venue_types": [map_category(cat_name)],
            "enriched": False,
            "photos_complete": False,
            "photo_urls": [],
            "is_chain": False,
        })

print(f"New venues identified: {len(new_venues)} | Duplicates skipped: {skipped}")

# ── Step 4: Import in batches ──────────────────────────────────────────────────
imported = 0
cap_reached = False
to_import = new_venues[:RUN_CAP]

for i in range(0, len(to_import), BATCH_SIZE):
    batch = to_import[i:i + BATCH_SIZE]
    supabase.table("venues").insert(batch).execute()
    imported += len(batch)
    print(f"Imported {imported} of {len(to_import)} new venues")

if len(new_venues) > RUN_CAP:
    cap_reached = True

# ── Step 5: Summary ────────────────────────────────────────────────────────────
remaining = max(0, len(new_venues) - imported)
print()
print("── Import Summary ───────────────────────────────────")
print(f"Total Foursquare venues in bounding box : {total_fsq}")
print(f"Already in Supabase (skipped)           : {skipped}")
print(f"Net new imported this run               : {imported}")
print(f"Remaining to import on next run         : {remaining}")
if cap_reached:
    print("Run cap reached — re-run to continue")
