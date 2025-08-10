import json
import platform
import time

import httpx
import psutil
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from src.config import GOOGLE_MAP_ID, GOOGLE_MAP_KEY, OAUTH2_USERINFO

app = FastAPI()

app.mount("/static", StaticFiles(directory="src/static"), name="static")
templates = Jinja2Templates(directory="src/templates")

_userinfo_cache = {}
CACHE_TTL = 60 * 60 * 24
with open("locations.json", "r", encoding="utf-8") as f:
    locations = json.load(f)


async def get_user_info(authorization: str | None = Header(default=None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401)

    now = time.time()

    cached = _userinfo_cache.get(authorization)
    if cached:
        timestamp, user_info = cached
        if now - timestamp < CACHE_TTL:
            return cached

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            OAUTH2_USERINFO,
            headers={"Authorization": f"Bearer {authorization}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401)

    user = resp.json()
    _userinfo_cache[authorization] = (now, user)
    return user


@app.get("/")
async def root(user_info: dict = Depends(get_user_info)):
    return user_info


@app.get("/map", response_class=HTMLResponse)
async def map(
    request: Request, user_info: dict = Depends(get_user_info)
) -> HTMLResponse:
    if not GOOGLE_MAP_KEY:
        raise ValueError("No Google Map key set!")
    if not GOOGLE_MAP_ID:
        raise ValueError("No Google Map ID set!")

    return templates.TemplateResponse(
        "map.html",
        {
            "request": request,
            "google_map_key": GOOGLE_MAP_KEY,
            "google_map_id": GOOGLE_MAP_ID,
            "locations_json": json.dumps(locations),
        },
    )


@app.get("/test")
async def test(request: Request):
    return dict(request.headers)


@app.get("/system")
async def system() -> dict:
    info = {}

    info["system"] = platform.system()
    info["node_name"] = platform.node()
    info["release"] = platform.release()
    info["version"] = platform.version()
    info["machine"] = platform.machine()
    info["processor"] = platform.processor()

    info["cpu_count_physical"] = psutil.cpu_count(logical=False)
    info["cpu_count_logical"] = psutil.cpu_count(logical=True)
    info["cpu_freq"] = psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None
    info["cpu_percent"] = psutil.cpu_percent(interval=1)

    virtual_mem = psutil.virtual_memory()
    info["virtual_memory"] = virtual_mem._asdict()

    swap = psutil.swap_memory()
    info["swap_memory"] = swap._asdict()

    partitions = []
    for p in psutil.disk_partitions():
        usage = psutil.disk_usage(p.mountpoint)
        partitions.append(
            {
                "device": p.device,
                "mountpoint": p.mountpoint,
                "fstype": p.fstype,
                "opts": p.opts,
                "total_gb": round(usage.total / (1024**3), 2),
                "used_gb": round(usage.used / (1024**3), 2),
                "free_gb": round(usage.free / (1024**3), 2),
                "percent_used": usage.percent,
            }
        )
    info["disk_partitions"] = partitions

    net_io = psutil.net_io_counters()
    info["network_io"] = net_io._asdict()

    net_if_addrs = {}
    for interface_name, interface_addresses in psutil.net_if_addrs().items():
        net_if_addrs[interface_name] = []
        for addr in interface_addresses:
            net_if_addrs[interface_name].append(
                {
                    "family": str(addr.family),
                    "address": addr.address,
                    "netmask": addr.netmask,
                    "broadcast": addr.broadcast,
                    "ptp": addr.ptp,
                }
            )
    info["network_interfaces"] = net_if_addrs

    info["boot_time"] = psutil.boot_time()

    return info
