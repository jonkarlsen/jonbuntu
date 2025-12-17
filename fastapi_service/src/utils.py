import os
import re
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import HTTPException

if os.environ.get("IN_DOCKER") == "yes":
    BASE_PATH = Path("/app/static/videos")
else:
    BASE_PATH = Path(__file__).parent / "static" / "videos"
BASE_PATH.mkdir(parents=True, exist_ok=True)
STATE_FILE = BASE_PATH / "daily_pick.txt"
VIDEO_RE = re.compile(r"espen(\d+)\.mp4")
OSLO_TZ = ZoneInfo("Europe/Oslo")


async def get_espen_files() -> list[Path]:
    files = []
    for f in BASE_PATH.iterdir():
        match = re.match(r"espen(\d+)\.mp4$", f.name)
        if match:
            number = int(match.group(1))  # get the captured digits
            files.append((number, f))

    s = [f for _, f in sorted(files)]
    return s


async def first_available_filename() -> str:
    existing = set()
    for f in BASE_PATH.iterdir():
        m = re.search(r"\d+", f.name)
        if m:
            existing.add(int(m.group()))
    x = 1
    while x in existing:
        x += 1
    return f"espen{x}.mp4"


async def read_daily_pick() -> tuple[str | None, int | None]:
    if not STATE_FILE.exists():
        return None, None

    content = STATE_FILE.read_text().strip()
    try:
        day_str, _index = content.split("|")
        return day_str, int(_index)
    except ValueError:
        return None, None


def write_daily_pick(video_index: int) -> None:
    today = date.today().isoformat()
    STATE_FILE.write_text(f"{today}|{video_index}")


def resolve_today_video(
    *,
    base_path: Path,
    state_file: Path,
    today: str,
) -> tuple[int, Path]:
    """
    Returns (video_number, video_path) for today's video.
    Advances state if needed.
    """

    videos: dict[int, Path] = {}

    for f in base_path.iterdir():
        m = VIDEO_RE.fullmatch(f.name)
        if m:
            videos[int(m.group(1))] = f

    if not videos:
        raise HTTPException(status_code=404)

    video_numbers = sorted(videos)

    # Read existing state if present
    saved_day = None
    saved_num = None
    if state_file.exists():
        try:
            saved_day, _saved_num = state_file.read_text().strip().split("|")
            saved_num = int(_saved_num)
        except ValueError:
            pass

    # If today's video already chosen and still exists
    if saved_day == today and saved_num in videos:
        return saved_num, videos[saved_num]

    # Otherwise, pick the next video
    if saved_num in videos:
        last_num = saved_num
    else:
        last_num = video_numbers[0] - 1

    next_numbers = [n for n in video_numbers if n > last_num]
    next_num = next_numbers[0] if next_numbers else video_numbers[0]

    state_file.write_text(f"{today}|{next_num}")

    return next_num, videos[next_num]


def read_today_video_number(
    state_file: Path, today: str, video_files: list[Path]
) -> int | None:
    if state_file.exists():
        try:
            saved_day, _saved_num = state_file.read_text().strip().split("|")
            saved_num = int(_saved_num)
            if saved_day == today:
                for f in video_files:
                    if f.name == f"espen{saved_num}.mp4":
                        return saved_num
        except ValueError:
            pass

    numbers = []
    for f in video_files:
        m = VIDEO_RE.fullmatch(f.name)
        if m:
            numbers.append(int(m.group(1)))
    numbers.sort()
    return numbers[0] if numbers else None


async def today_key(now: datetime) -> str:
    return now.strftime("%Y-%m-%d")
