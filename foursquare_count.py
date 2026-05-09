import os
import duckdb
from huggingface_hub import HfFileSystem

fs = HfFileSystem(token=os.environ.get("HF_TOKEN"))

releases = sorted(fs.ls("datasets/foursquare/fsq-os-places/release/", detail=False))
release_date = releases[-1].split("/")[-1]
print(f"Using release: {release_date}")

BBOX = (-79.6393, 43.5810, -79.1161, 43.8554)
BASE = f"hf://datasets/foursquare/fsq-os-places/release/{release_date}"

con = duckdb.connect()
con.register_filesystem(fs)  # must be on the connection, not duckdb module

result = con.execute(f"""
    WITH food_cats AS (
        SELECT category_id
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
    ),
    food_id_list AS (SELECT list(category_id) AS ids FROM food_cats)
    SELECT COUNT(*) AS total_venues
    FROM read_parquet('{BASE}/places/parquet/*.parquet'), food_id_list
    WHERE longitude BETWEEN {BBOX[0]} AND {BBOX[2]}
      AND latitude  BETWEEN {BBOX[1]} AND {BBOX[3]}
      AND list_has_any(fsq_category_ids, food_id_list.ids)
""").fetchone()

print(f"Foursquare food/drink venues in Toronto: {result[0]}")
print(f"Current WhatSpot Supabase count: 5,491")
print(f"Gap: {result[0] - 5491}")
