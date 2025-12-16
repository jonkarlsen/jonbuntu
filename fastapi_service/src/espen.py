import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.responses import FileResponse

espen_route = FastAPI()

# VIDEO_PATH = Path(__file__).parent / "static/videos/espen.mp4"
# BASE_PATH = Path(__file__).parent / "static/videos"
BASE_PATH = Path(__file__).parent / "static" / "videos"
BASE_PATH.mkdir(parents=True, exist_ok=True)
VIDEO_PATH_ROGER = Path(__file__).parent / "static/videos/roger.mp4"
OSLO_TZ = ZoneInfo("Europe/Oslo")


@espen_route.get("/")
async def get_video():
    now = datetime.now(OSLO_TZ)

    epoch = datetime(2025, 1, 1, tzinfo=OSLO_TZ)
    days_since_epoch = (now - epoch).days
    video_files = sorted(
        [f for f in BASE_PATH.iterdir() if re.match(r"espen\d+\.mp4", f.name)]
    )
    if not video_files:
        return {"error": "No vids"}

    idx = (days_since_epoch + -1) % len(video_files)
    video_path = video_files[idx]
    return FileResponse(video_path, media_type="video/mp4")


@espen_route.get("/roger")
async def get_roger():
    if VIDEO_PATH_ROGER.exists():
        return FileResponse(VIDEO_PATH_ROGER, media_type="video/mp4")
    return {"error": "Video not found"}
