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
from src.utils import (
    BASE_PATH,
    OSLO_TZ,
    STATE_FILE,
    first_available_filename,
    get_espen_files,
    resolve_today_video,
    today_key,
)

# from src.xplora_fetcher import JSON_FILE


app = FastAPI()

app.mount("/static", StaticFiles(directory="src/static"), name="static")
templates = Jinja2Templates(directory="src/templates")

_userinfo_cache: dict[str, tuple[float, dict[str, str]]] = {}
CACHE_TTL = 60 * 60 * 24
with open("locations.json", "r", encoding="utf-8") as f:
    locations = json.load(f)

with open("allowed_numbers.json", "r", encoding="utf-8") as f:
    allowed_numbers = json.load(f)


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
    # print(user)
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


@app.get("/")
async def root(user_info: dict[str, Any] = Depends(get_user_info)) -> dict[str, Any]:
    return user_info


@app.get("/espen", response_class=HTMLResponse)
async def espen(request: Request) -> HTMLResponse:
    video_files = await get_espen_files()

    now = datetime.now(OSLO_TZ)
    today = await today_key(now)

    video_num, _ = resolve_today_video(
        base_path=BASE_PATH,
        state_file=STATE_FILE,
        today=today,
    )

    return templates.TemplateResponse(
        "espen.html",
        {
            "request": request,
            "video_files": video_files,
            "today_video_num": video_num,
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


# @app.get("/xplora")
# async def xplora(_: dict = Depends(get_user_info)) -> dict:
#     try:
#         with open(JSON_FILE) as f:
#             data = json.load(f)
#         return data
#     except FileNotFoundError:
#         return {"error": "No data yet"}


@app.get("/map", response_class=HTMLResponse)
async def map(
    request: Request, _: dict[str, Any] = Depends(get_user_info)
) -> HTMLResponse:
    if not GOOGLE_MAP_KEY:
        raise ValueError("No Google Map key set!")
    if not GOOGLE_MAP_ID:
        raise ValueError("No Google Map ID set!")

    # try:
    #     async with aiofiles.open("xplora.json", "r", encoding="utf-8") as f:
    #         xplora_data = json.loads(await f.read())
    # except FileNotFoundError:
    #     xplora_data = {"error": "xplora.json not found"}
    # except json.JSONDecodeError:
    #     xplora_data = {"error": "xplora.json invalid"}

    return templates.TemplateResponse(
        "map.html",
        {
            "request": request,
            "google_map_key": GOOGLE_MAP_KEY,
            "google_map_id": GOOGLE_MAP_ID,
            "locations_json": json.dumps(locations),
            "xplora_data": {},  # xplora_data,
        },
    )


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
    return templates.TemplateResponse("maria.html", {"request": request})
