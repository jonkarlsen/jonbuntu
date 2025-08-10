IMAGE_NAME=jonbuntu-py
TAG=latest
PORT=8000

.PHONY: install install-dev format build run_no_docker run stop clean

install:
	$(MAKE) -C fastapi_service install

install-dev:
	$(MAKE) -C fastapi_service install-dev

format:
	$(MAKE) -C fastapi_service format

build:
	$(MAKE) -C fastapi_service build

run_no_docker:
	$(MAKE) -C fastapi_service run_no_docker

run:
	$(MAKE) -C fastapi_service run

stop:
	$(MAKE) -C fastapi_service stop

clean:
	$(MAKE) -C fastapi_service clean
