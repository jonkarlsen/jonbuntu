import asyncio
import json
import zoneinfo
from datetime import UTC, datetime

import httpx

from src.config import HA_DEVICE, HA_TOKEN

JSON_FILE = "xplora.json"

HA_URL = "http://192.168.86.37:8123/api/states/"


if not HA_DEVICE or not HA_TOKEN:
    raise RuntimeError("HA_DEVICE and HA_TOKEN environment variables must be set")


async def fetch_xplora_data():
    url = f"{HA_URL}{HA_DEVICE}"
    headers = {"Authorization": f"Bearer {HA_TOKEN}"}
    print("URL:", url)
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    attributes = data.get("attributes", {})
    return {
        "latitude": attributes.get("latitude"),
        "longitude": attributes.get("longitude"),
        "battery_level": attributes.get("battery_level"),
        "gps_accuracy": attributes.get("gps_accuracy"),
        "last_tracking": attributes.get("last tracking"),
        "address": attributes.get("address"),
    }


def get_last_scrape_timestamp() -> str:
    oslo_tz = zoneinfo.ZoneInfo("Europe/Oslo")
    now = datetime.now(oslo_tz)
    return now.strftime("%Y-%m-%d %H:%M:%S")


async def scrape_loop():
    while True:
        try:
            data = await fetch_xplora_data()
            data["last_scrape"] = get_last_scrape_timestamp()
            with open(JSON_FILE, "w") as f:
                json.dump(data, f, indent=2)
            print(f"[{datetime.now(UTC).isoformat()}] Xplora data saved.")
        except Exception as e:
            print(f"Error fetching Xplora data: {e}")
        await asyncio.sleep(60)
