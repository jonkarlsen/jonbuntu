IMAGE_NAME=jonbuntu-py
TAG=latest
PORT=8000

.PHONY: build run stop clean

install:
	uv pip install -e .

install-dev:
	uv pip install -e .[dev]

format:
	uv run ruff format .
	uv run ruff check --fix

build:
	docker build -t $(IMAGE_NAME):$(TAG) .

run:
	docker run -d -p $(PORT):8000 --name $(IMAGE_NAME) $(IMAGE_NAME):$(TAG)

stop:
	docker stop $(IMAGE_NAME) || true
	docker rm $(IMAGE_NAME) || true

clean: stop
	docker rmi $(IMAGE_NAME):$(TAG) || true

