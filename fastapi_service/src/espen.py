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
STATE_FILE = BASE_PATH / "daily_pick.txt"
VIDEO_RE = re.compile(r"espen(\d+)\.mp4")


async def today_key(now: datetime) -> str:
    return now.strftime("%Y-%m-%d")


@espen_route.get("/")
async def get_video() -> FileResponse:
    now = datetime.now(OSLO_TZ)
    today = await today_key(now)

    videos: dict[int, Path] = {}
    for f in BASE_PATH.iterdir():
        m = VIDEO_RE.fullmatch(f.name)
        if m:
            videos[int(m.group(1))] = f

    if not videos:
        raise HTTPException(status_code=404)

    video_numbers = sorted(videos)

    if STATE_FILE.exists():
        saved_day, saved_num = STATE_FILE.read_text().strip().split("|")
        saved_num = int(saved_num)

        if saved_day == today and saved_num in videos:
            return FileResponse(videos[saved_num], media_type="video/mp4")

    if STATE_FILE.exists():
        _, last_num = STATE_FILE.read_text().strip().split("|")
        last_num = int(last_num)
    else:
        last_num = video_numbers[0] - 1

    next_numbers = [n for n in video_numbers if n > last_num]
    next_num = next_numbers[0] if next_numbers else video_numbers[0]

    STATE_FILE.write_text(f"{today}|{next_num}")

    return FileResponse(videos[next_num], media_type="video/mp4")
