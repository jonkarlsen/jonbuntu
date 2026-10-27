"""Nominatim geocoding helpers shared by the scripts and the web API."""

from __future__ import annotations

import math
from typing import Any

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "jonbuntu-geocoder/1.0"
DEFAULT_TIMEOUT = 10.0


def build_query(address: str) -> str:
    """Add a country hint when the address does not already contain one."""
    query = address.strip()
    lowered = query.lower()
    if "norway" not in lowered and "norge" not in lowered:
        query = f"{query}, Norway"
    return query


def parse_coordinates(payload: Any) -> tuple[float, float] | None:
    """Extract lat/lng from a Nominatim search response."""
    if not isinstance(payload, list) or not payload:
        return None
    first = payload[0]
    if not isinstance(first, dict):
        return None
    try:
        return float(first["lat"]), float(first["lon"])
    except (KeyError, TypeError, ValueError):
        return None


def geocode_address(client: httpx.Client, address: str) -> tuple[float, float] | None:
    """Resolve an address with a synchronous httpx client."""
    response = client.get(
        NOMINATIM_URL,
        params={"q": build_query(address), "format": "json", "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=DEFAULT_TIMEOUT,
    )
    response.raise_for_status()
    return parse_coordinates(response.json())


async def geocode_address_async(
    client: httpx.AsyncClient, address: str
) -> tuple[float, float] | None:
    """Resolve an address with an async httpx client."""
    response = await client.get(
        NOMINATIM_URL,
        params={"q": build_query(address), "format": "json", "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=DEFAULT_TIMEOUT,
    )
    response.raise_for_status()
    return parse_coordinates(response.json())


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance between two WGS84 coordinates in meters."""
    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))
