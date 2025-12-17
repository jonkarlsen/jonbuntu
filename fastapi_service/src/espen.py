import os
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette import status

espen_route = FastAPI()


if os.environ.get("IN_DOCKER") == "yes":
    BASE_PATH = Path("/app/static/videos")
else:
    BASE_PATH = Path(__file__).parent / "static" / "videos"
BASE_PATH.mkdir(parents=True, exist_ok=True)
OSLO_TZ = ZoneInfo("Europe/Oslo")
DAILY_PICK_FILE = BASE_PATH / "daily_pick.txt"


async def today_key(now: datetime) -> str:
    return now.strftime("%Y-%m-%d")

@espen_route.get("/")
async def get_video() -> FileResponse:
    now = datetime.now(OSLO_TZ)
    today = today_key(now)

    video_files = sorted(
        f.name for f in BASE_PATH.iterdir()
        if re.match(r"espen\d+\.mp4", f.name)
    )
    if not video_files:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    if DAILY_PICK_FILE.exists():
        saved_day, saved_video = DAILY_PICK_FILE.read_text().split("|")
        if saved_day == today and saved_video in video_files:
            return FileResponse(BASE_PATH / saved_video, media_type="video/mp4")

    epoch = datetime(2025, 1, 1, tzinfo=OSLO_TZ)
    days_since_epoch = (now - epoch).days
    idx = days_since_epoch % len(video_files)
    chosen = video_files[idx]
    DAILY_PICK_FILE.write_text(f"{today}|{chosen}")

    return FileResponse(BASE_PATH / chosen, media_type="video/mp4")

