# Use official Python image for ARM64 (Raspberry Pi 4B is ARM)
FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml ./

RUN pip install uv

RUN uv sync

COPY src/ ./src/
COPY .env ./
COPY locations.json ./
COPY allowed_numbers.json ./

EXPOSE 8000
EXPOSE 8001

CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
