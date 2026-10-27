#!/usr/bin/env python3
"""Verify that addresses match lat/lng within an error margin using Nominatim."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.geocoding import geocode_address, haversine_meters  # noqa: E402

LOCATIONS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "locations.json"
)


def load_locations(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("locations.json must be an object")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify geocoding matches addresses")
    parser.add_argument(
        "--max-distance",
        type=float,
        default=150.0,
        help="Max allowed distance in meters (default: 150)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Seconds between requests (>=1s recommended)",
    )
    parser.add_argument(
        "--class", dest="class_key", help="Only verify a specific class"
    )
    parser.add_argument("--json", action="store_true", help="Output JSON report")
    args = parser.parse_args()

    data = load_locations(LOCATIONS_FILE)
    to_verify: list[tuple[str, int, dict[str, Any]]] = []

    for class_key, class_data in data.items():
        if args.class_key and class_key != args.class_key:
            continue
        if not isinstance(class_data, dict):
            continue
        students = class_data.get("students", [])
        if not isinstance(students, list):
            continue
        for i, student in enumerate(students):
            if not isinstance(student, dict):
                continue
            if "lat" in student and "lng" in student and student.get("address"):
                to_verify.append((class_key, i, student))

    print(
        f"Verifying {len(to_verify)} students (max distance {args.max_distance}m)",
        file=sys.stderr,
    )
    if not to_verify:
        return 0

    client = httpx.Client()
    results: list[dict[str, Any]] = []
    ok_count = 0
    fail_count = 0

    try:
        for idx, (class_key, student_idx, student) in enumerate(to_verify):
            address = str(student["address"])
            name = student.get("name") or student.get("display_name") or "unknown"
            lat = float(student["lat"])
            lng = float(student["lng"])
            print(f"[{idx + 1}/{len(to_verify)}] {class_key} - {name}", file=sys.stderr)
            try:
                coords = geocode_address(client, address)
                if not coords:
                    print("  -> No geocode results for address", file=sys.stderr)
                    results.append(
                        {
                            "class": class_key,
                            "name": name,
                            "address": address,
                            "status": "no_result",
                            "stored": {"lat": lat, "lng": lng},
                        }
                    )
                    fail_count += 1
                    time.sleep(args.delay)
                    continue
                glat, glng = coords
                dist = haversine_meters(lat, lng, glat, glng)
                if dist <= args.max_distance:
                    print(f"  -> OK ({dist:.1f}m)", file=sys.stderr)
                    ok_count += 1
                    status = "ok"
                else:
                    print(
                        f"  -> MISMATCH ({dist:.1f}m) geocoded: {glat}, {glng}",
                        file=sys.stderr,
                    )
                    fail_count += 1
                    status = "mismatch"
                results.append(
                    {
                        "class": class_key,
                        "name": name,
                        "address": address,
                        "status": status,
                        "distance_m": round(dist, 1),
                        "stored": {"lat": lat, "lng": lng},
                        "geocoded": {"lat": glat, "lng": glng},
                    }
                )
            except Exception as e:
                print(f"  -> Error: {e}", file=sys.stderr)
                results.append(
                    {
                        "class": class_key,
                        "name": name,
                        "address": address,
                        "status": "error",
                        "error": str(e),
                        "stored": {"lat": lat, "lng": lng},
                    }
                )
                fail_count += 1
            time.sleep(args.delay)
    finally:
        client.close()

    if args.json:
        print(
            json.dumps(
                {"ok": ok_count, "failed": fail_count, "results": results},
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print("\n=== SUMMARY ===", file=sys.stderr)
        print(
            f"OK: {ok_count}, Failed/Mismatch/NoResult: {fail_count}", file=sys.stderr
        )

    return 1 if fail_count > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
