from datetime import datetime

from fastapi import FastAPI
from fastapi.responses import FileResponse

from src.utils import BASE_PATH, OSLO_TZ, STATE_FILE, resolve_today_video, today_key

espen_route = FastAPI()


@espen_route.get("/")
async def get_video() -> FileResponse:
    now = datetime.now(OSLO_TZ)
    today = await today_key(now)

    video_num, video_path = resolve_today_video(
        base_path=BASE_PATH,
        state_file=STATE_FILE,
        today=today,
    )

    return FileResponse(video_path, media_type="video/mp4")
