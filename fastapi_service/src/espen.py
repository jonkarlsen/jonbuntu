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


@espen_route.get("/")
async def get_video() -> FileResponse:
    now = datetime.now(OSLO_TZ)

    epoch = datetime(2025, 1, 1, tzinfo=OSLO_TZ)
    days_since_epoch = (now - epoch).days
    video_files = sorted(
        [f for f in BASE_PATH.iterdir() if re.match(r"espen\d+\.mp4", f.name)]
    )
    if not video_files:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    idx = (days_since_epoch + -1) % len(video_files)
    video_path = video_files[idx]
    return FileResponse(video_path, media_type="video/mp4")
