# Use official Python image for ARM64 (Raspberry Pi 4B is ARM)
FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml ./

RUN pip install uv

RUN uv sync

COPY main.py ./

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
