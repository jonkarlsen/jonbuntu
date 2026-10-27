import json
import os
import platform
import re
import shutil
import time
from datetime import date, datetime
from typing import Any

import httpx
import psutil
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from src.config import GOOGLE_MAP_ID, GOOGLE_MAP_KEY, OAUTH2_USERINFO
from src.geocoding import geocode_address_async
from src.locations_ssm import upload_locations_to_ssm_auto
from src.locations_utils import (
    LOCATIONS_FILE,
    read_locations_file,
    validate_locations,
    write_locations_file_atomic,
)
from src.utils import (
    BASE_PATH,
    OSLO_TZ,
    STATE_FILE,
    first_available_filename,
    get_espen_files,
    resolve_today_video,
    today_key,
)

app = FastAPI()

app.mount("/static", StaticFiles(directory="src/static"), name="static")
templates = Jinja2Templates(directory="src/templates")

_userinfo_cache: dict[str, tuple[float, dict[str, str]]] = {}
CACHE_TTL = 60 * 60 * 24

try:
    with open(LOCATIONS_FILE, "r", encoding="utf-8") as f:
        locations = json.load(f)
except Exception:
    locations = {}

try:
    with open("allowed_numbers.json", "r", encoding="utf-8") as f:
        allowed_numbers = json.load(f)
except Exception:
    allowed_numbers = {"admin": [], "espen": []}


async def get_espen_or_jon(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if os.getenv("DEV", "no") == "yes":
        return {}
    if not authorization:
        raise HTTPException(status_code=401)

    now = time.time()

    cached = _userinfo_cache.get(authorization)
    if cached:
        timestamp, user_info = cached
        if now - timestamp < CACHE_TTL:
            return user_info

    async with httpx.AsyncClient() as client:
        assert OAUTH2_USERINFO is not None
        resp = await client.get(
            OAUTH2_USERINFO,
            headers={"Authorization": f"Bearer {authorization}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401)

    user: dict[str, Any] = resp.json()
    if user.get("phone_number") not in allowed_numbers["espen"]:
        raise HTTPException(status_code=401)
    _userinfo_cache[authorization] = (now, user)
    return user


async def get_user_info(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if os.getenv("DEV", "no") == "yes":
        return {}
    if not authorization:
        raise HTTPException(status_code=401)

    now = time.time()

    cached = _userinfo_cache.get(authorization)
    if cached:
        timestamp, user_info = cached
        if now - timestamp < CACHE_TTL:
            return user_info

    async with httpx.AsyncClient() as client:
        assert OAUTH2_USERINFO is not None
        resp = await client.get(
            OAUTH2_USERINFO,
            headers={"Authorization": f"Bearer {authorization}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401)

    user: dict[str, Any] = resp.json()
    if user.get("phone_number") not in allowed_numbers["maps"]:
        raise HTTPException(status_code=401)
    _userinfo_cache[authorization] = (now, user)
    return user


async def get_admin(
    request: Request, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    """Verify OAuth2 token and admin privileges.

    Same authentication flow as get_user_info() and get_espen_or_jon(),
    but requires phone number to be in allowed_numbers["admin"].
    """
    if os.getenv("DEV", "no") == "yes":
        client_host = request.client.host if request.client else ""
        if client_host in ("127.0.0.1", "::1", "localhost"):
            return {}
        raise HTTPException(status_code=403)
    if not authorization:
        raise HTTPException(status_code=401)

    now = time.time()

    cached = _userinfo_cache.get(authorization)
    if cached:
        timestamp, user_info = cached
        if now - timestamp < CACHE_TTL:
            return user_info

    async with httpx.AsyncClient() as client:
        assert OAUTH2_USERINFO is not None
        resp = await client.get(
            OAUTH2_USERINFO,
            headers={"Authorization": f"Bearer {authorization}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401)

    user: dict[str, Any] = resp.json()
    admin_list = (
        allowed_numbers.get("admin", []) if isinstance(allowed_numbers, dict) else []
    )
    if user.get("phone_number") not in admin_list:
        raise HTTPException(
            status_code=403, detail="Access denied: admin privileges required"
        )
    _userinfo_cache[authorization] = (now, user)
    return user


@app.get("/")
async def root(user_info: dict[str, Any] = Depends(get_user_info)) -> dict[str, Any]:
    return user_info


@app.get("/espen", response_class=HTMLResponse)
async def espen(request: Request) -> HTMLResponse:
    video_files = await get_espen_files()

    now = datetime.now(OSLO_TZ)
    today = await today_key(now)

    pinned_num = None

    if STATE_FILE.exists():
        try:
            parts = STATE_FILE.read_text().strip().split("|")
            pinned_num = int(parts[2]) if len(parts) > 2 and parts[2] else None
        except ValueError:
            pass

    video_num, _ = resolve_today_video(
        base_path=BASE_PATH,
        state_file=STATE_FILE,
        today=today,
    )

    return templates.TemplateResponse(
        request=request,
        name="espen.html",
        context={
            "request": request,
            "video_files": video_files,
            "today_video_num": video_num,
            "pinned_video_num": pinned_num,
        },
    )


@app.post("/espen/set-today")
async def set_today(
    filename: str = Form(...), _: dict[str, Any] = Depends(get_espen_or_jon)
) -> RedirectResponse:
    m = re.fullmatch(r"espen(\d+)\.mp4", filename)
    if not m:
        raise HTTPException(status_code=400, detail="Invalid filename")
    video_number = int(m.group(1))

    today = date.today().isoformat()
    STATE_FILE.write_text(f"{today}|{video_number}")

    return RedirectResponse("/espen", status_code=303)


@app.post("/espen/set-pinned")
async def set_pinned(
    filename: str = Form(...),
    pinned: bool = Form(False),
    _: dict[str, Any] = Depends(get_espen_or_jon),
) -> RedirectResponse:
    m = re.fullmatch(r"espen(\d+)\.mp4", filename)
    if not m:
        raise HTTPException(status_code=404)

    video_number = int(m.group(1))

    saved_day, saved_num = None, None
    if STATE_FILE.exists():
        try:
            parts = STATE_FILE.read_text().strip().split("|")
            saved_day = parts[0]
            saved_num = int(parts[1]) if len(parts) > 1 else None
        except ValueError:
            pass

    pinned_num = video_number if pinned else ""

    STATE_FILE.write_text(f"{saved_day}|{saved_num or ''}|{pinned_num}")
    return RedirectResponse("/espen", status_code=303)


@app.get("/espen/play/{filename}")
async def play_video(
    filename: str, _: dict[str, Any] = Depends(get_espen_or_jon)
) -> FileResponse:
    video_path = BASE_PATH / filename
    if not video_path.exists() or not re.match(r"espen\d+\.mp4$", filename):
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(video_path, media_type="video/mp4")


@app.post("/espen/delete")
async def delete_video(
    filename: str = Form(...), _: dict[str, Any] = Depends(get_espen_or_jon)
) -> RedirectResponse:
    video_path = BASE_PATH / filename
    if not video_path.exists() or not re.match(r"espen\d+\.mp4$", filename):
        raise HTTPException(status_code=404, detail="Video not found")

    video_path.unlink()
    return RedirectResponse(url="/espen", status_code=303)


@app.post("/espen/upload")
async def upload_video(
    file: UploadFile = File(...), _: dict[str, Any] = Depends(get_espen_or_jon)
) -> RedirectResponse:
    if not (file and file.filename and file.filename.lower().endswith(".mp4")):
        raise HTTPException(status_code=400, detail="Only MP4 files are allowed")

    filename = await first_available_filename()
    destination = BASE_PATH / filename

    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return RedirectResponse(url="/espen", status_code=303)


@app.get("/map", response_class=HTMLResponse)
async def map(
    request: Request, _: dict[str, Any] = Depends(get_user_info)
) -> HTMLResponse:
    if not GOOGLE_MAP_KEY:
        raise ValueError("No Google Map key set!")
    if not GOOGLE_MAP_ID:
        raise ValueError("No Google Map ID set!")

    return templates.TemplateResponse(
        request=request,
        name="map.html",
        context={
            "google_map_key": GOOGLE_MAP_KEY,
            "google_map_id": GOOGLE_MAP_ID,
            "locations_json": json.dumps(locations),
        },
    )


@app.get("/map-edit", response_class=HTMLResponse)
async def map_edit(
    request: Request, _: dict[str, Any] = Depends(get_admin)
) -> HTMLResponse:
    """Admin-only visual editor for locations.json with a live map preview."""
    if not GOOGLE_MAP_KEY:
        raise ValueError("No Google Map key set!")
    if not GOOGLE_MAP_ID:
        raise ValueError("No Google Map ID set!")

    try:
        editable_locations = read_locations_file()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not read {LOCATIONS_FILE}: {exc}"
        ) from exc

    return templates.TemplateResponse(
        request=request,
        name="map-edit.html",
        context={
            "google_map_key": GOOGLE_MAP_KEY,
            "google_map_id": GOOGLE_MAP_ID,
            "locations": editable_locations,
            "locations_json": json.dumps(
                editable_locations, ensure_ascii=False, indent=2
            ),
        },
    )


@app.post("/api/geocode")
async def geocode(
    data: dict[str, Any], _: dict[str, Any] = Depends(get_admin)
) -> dict[str, Any]:
    """Resolve a single address to coordinates using OpenStreetMap Nominatim."""
    address = data.get("address")
    if not isinstance(address, str) or not address.strip():
        raise HTTPException(status_code=400, detail="Address is required")

    try:
        async with httpx.AsyncClient() as client:
            coordinates = await geocode_address_async(client, address)
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail=f"Geocoding service error: {exc}"
        ) from exc

    if coordinates is None:
        raise HTTPException(
            status_code=404, detail="No coordinates found for this address"
        )

    lat, lng = coordinates
    return {"success": True, "lat": lat, "lng": lng}


@app.post("/api/save-locations")
async def save_locations(
    request: Request, data: dict[str, Any], _: dict[str, Any] = Depends(get_admin)
) -> dict[str, Any]:
    """Write the edited locations back to locations.json."""
    global locations

    error = validate_locations(data)
    if error:
        raise HTTPException(status_code=400, detail=error)

    try:
        write_locations_file_atomic(data, LOCATIONS_FILE)
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not write {LOCATIONS_FILE}: {exc}"
        ) from exc

    locations = data
    return {
        "success": True,
        "message": f"Saved {LOCATIONS_FILE}",
        "classes": list(data),
    }


@app.post("/api/upload-ssm")
async def upload_to_ssm(
    request: Request, data: dict[str, Any], _: dict[str, Any] = Depends(get_admin)
) -> dict[str, Any]:
    """Upload every class to AWS SSM, matching deploy/scripts/fastapi/upload_locations.py."""
    error = validate_locations(data)
    if error:
        raise HTTPException(status_code=400, detail=error)

    try:
        class_keys = await upload_locations_to_ssm_auto(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"AWS SSM upload failed: {exc}"
        ) from exc

    return {
        "success": True,
        "message": f"Uploaded {len(class_keys)} class(es) to AWS SSM",
        "classes": class_keys,
    }


@app.get("/test")
async def test(request: Request) -> dict[str, Any]:
    return dict(request.headers)


@app.get("/system")
async def system() -> dict[str, Any]:
    info: dict[str, Any] = {
        "system": platform.system(),
        "node_name": platform.node(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "cpu_count_physical": psutil.cpu_count(logical=False),
        "cpu_count_logical": psutil.cpu_count(logical=True),
    }

    if hasattr(psutil, "cpu_freq"):
        cpu_freq = psutil.cpu_freq()
        if cpu_freq is not None:
            info["cpu_freq"] = psutil.cpu_freq()._asdict()
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

    net_if_addrs: dict[str, list[dict[str, Any]]] = {}
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


@app.get("/maria")
async def maria(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request=request, name="maria.html")
