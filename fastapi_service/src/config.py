import os

from dotenv import load_dotenv

load_dotenv()

GOOGLE_MAP_KEY = os.getenv("GOOGLE_MAP_KEY")
GOOGLE_MAP_ID = os.getenv("GOOGLE_MAP_ID")
OAUTH2_USERINFO = os.getenv("OAUTH2_USERINFO")
