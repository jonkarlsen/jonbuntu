#!/usr/bin/env python3
"""Parse locations.json and fill in missing lat/lng using OpenStreetMap Nominatim."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.geocoding import geocode_address  # noqa: E402

LOCATIONS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "locations.json"
)


def load_locations(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("locations.json must be an object")
    return data


def save_locations_atomic(path: str, data: dict[str, Any]) -> None:
    directory = os.path.dirname(os.path.abspath(path)) or "."
    tmp_path = os.path.join(directory, ".locations.geocode.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fill missing lat/lng in locations.json"
    )
    parser.add_argument("--dry-run", action="store_true", help="Don't write changes")
    parser.add_argument(
        "--force", action="store_true", help="Re-geocode even if lat/lng exist"
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Seconds between requests (>=1s recommended)",
    )
    args = parser.parse_args()

    data = load_locations(LOCATIONS_FILE)
    to_geocode: list[tuple[str, int, dict[str, Any]]] = []

    for class_key, class_data in data.items():
        if not isinstance(class_data, dict):
            continue
        students = class_data.get("students", [])
        if not isinstance(students, list):
            continue
        for i, student in enumerate(students):
            if not isinstance(student, dict):
                continue
            has_coords = "lat" in student and "lng" in student
            if args.force or not has_coords:
                address = student.get("address")
                if isinstance(address, str) and address.strip():
                    to_geocode.append((class_key, i, student))

    print(f"Found {len(to_geocode)} students to geocode")
    if not to_geocode:
        return 0

    client = httpx.Client()
    updated = 0

    try:
        for idx, (class_key, student_idx, student) in enumerate(to_geocode):
            address = str(student["address"])
            name = student.get("name") or student.get("display_name") or "unknown"
            print(f"[{idx + 1}/{len(to_geocode)}] Geocoding {name} - {address}")
            try:
                coords = geocode_address(client, address)
                if not coords:
                    print("  -> No results found", file=sys.stderr)
                    continue
                lat, lon = coords
                data[class_key]["students"][student_idx]["lat"] = lat
                data[class_key]["students"][student_idx]["lng"] = lon
                print(f"  -> {lat}, {lon}")
                updated += 1
            except Exception as e:
                print(f"  -> Error: {e}", file=sys.stderr)
            time.sleep(args.delay)
    finally:
        client.close()

    print(f"\nUpdated {updated} students")
    if args.dry_run:
        print("Dry run, not writing")
        return 0

    save_locations_atomic(LOCATIONS_FILE, data)
    print(f"Wrote to {LOCATIONS_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
