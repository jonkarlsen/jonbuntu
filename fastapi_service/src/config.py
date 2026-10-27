import os

from dotenv import load_dotenv

load_dotenv()

GOOGLE_MAP_KEY: str | None = os.getenv("GOOGLE_MAP_KEY")
GOOGLE_MAP_ID: str | None = os.getenv("GOOGLE_MAP_ID")
OAUTH2_USERINFO: str | None = os.getenv("OAUTH2_USERINFO")
