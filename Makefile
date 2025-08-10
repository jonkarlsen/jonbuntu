IMAGE_NAME=jonbuntu-py
TAG=latest
PORT=8000

.PHONY: build run stop clean

install:
	uv pip install -e .

install-dev:
	uv pip install -e .[dev]

format: install-dev
	uv run ruff format .
	uv run ruff check --fix
	find . -name "*.js" -exec uv run js-beautify -r {} \;

build:
	docker build -t $(IMAGE_NAME):$(TAG) .

run_no_docker:
	uv run uvicorn src.main:app --host 0.0.0.0 --port 8000

run:
	docker rm -f ${IMAGE_NAME} 2>/dev/null || true
	docker run -d -p $(PORT):8000 --name $(IMAGE_NAME) $(IMAGE_NAME):$(TAG)

stop:
	docker stop $(IMAGE_NAME) || true
	docker rm $(IMAGE_NAME) || true

clean: stop
	docker rmi $(IMAGE_NAME):$(TAG) || true

