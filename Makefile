IMAGE_NAME=jonbuntu-py
TAG=latest
PORT=8000

# Support "make get-locs A" without Make treating A as a real target.
ifeq ($(firstword $(MAKECMDGOALS)),get-locs)
GET_LOCS_CLASS := $(word 2,$(MAKECMDGOALS))
endif

.PHONY: install install-dev format build run_no_docker run stop clean
.PHONY: get-locs upload-locs

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

get-locs:
	@$(MAKE) --no-print-directory -C fastapi_service get-locs $(GET_LOCS_CLASS)

upload-locs:
	@$(MAKE) --no-print-directory -C fastapi_service upload-locs

# Absorb the class argument used by "make get-locs A".
ifneq ($(GET_LOCS_CLASS),)
$(GET_LOCS_CLASS):
	@:
endif
