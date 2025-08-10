import os

from dotenv import load_dotenv

load_dotenv()

GOOGLE_MAPS_KEY = os.getenv("GOOGLE_MAPS_KEY")
GOOGLE_MAP_ID = os.getenv("GOOGLE_MAP_ID")
