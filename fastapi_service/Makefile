IMAGE_NAME=jonbuntu-py
TAG=latest
PORT=8000
LOCAL_JSON=locations.json
ENCODED_FILE=locations.json.gz.b64
PARAM_NAME=locations_json

# Support "make get-locs A" without Make treating A as a real target.
ifeq ($(firstword $(MAKECMDGOALS)),get-locs)
GET_LOCS_CLASS := $(word 2,$(MAKECMDGOALS))
endif

.PHONY: install install-dev format build run_no_docker run stop clean
.PHONY: get-locs upload-locs

install:
	uv pip install -e .

install-dev:
	uv pip install -e .[dev]

format: install-dev
	uv run ruff format .
	uv run ruff check --fix
	find . -name "*.js" -exec uv run js-beautify -r {} \;
	find . -name "*.css" -exec uv run css-beautify -r {} \;
	uv run ty check .
	mypy --strict .

#build:
#	docker build -t $(IMAGE_NAME):$(TAG) .
build:
	docker compose build

#run_no_docker: update-env-secrets
#	uv run uvicorn src.main:app --host 0.0.0.0 --port 8000
run_no_docker: update-env-secrets
	uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 & \
	uv run uvicorn src.espen:espen_route --host 0.0.0.0 --port 8001 & \
	wait

run_dev:
	DEV=yes uv run uvicorn src.main:app --host 0.0.0.0 --port 18000 --reload & \
	DEV=yes uv run uvicorn src.espen:espen_route --host 0.0.0.0 --port 18001 --reload & \
	wait

#run: update-env-secrets
#	docker rm -f ${IMAGE_NAME} 2>/dev/null || true
#	docker run -d --restart always -p $(PORT):8000 --name $(IMAGE_NAME) $(IMAGE_NAME):$(TAG) 

# Run with Docker Compose (for production/network access via 192.168.86.38)
run: update-env-secrets
	docker compose up -d

# Stop containers
stop:
	docker compose down

# Clean up containers, images and volumes
clean: stop
	docker compose down --rmi all --volumes --remove-orphans

# ============================================================================
# SPLIT LOCATION BACKUP / AWS SSM
#
# The web editor and these targets use the same format:
#   class_<key>   SecureString: gzip + base64 of the class JSON
#   current_class String:       comma-separated class keys
#
#   make get-locs          Show current_class and the class list
#   make get-locs A        Print class A decoded as pretty JSON
#   make upload-locs       Upload locations.json (same as the web button)
#   make upload-locs DRY_RUN=1
# ============================================================================

get-locs:
	@uv run python scripts/ssm_locations.py get $(GET_LOCS_CLASS)

upload-locs:
	@uv run python scripts/ssm_locations.py upload $(if $(DRY_RUN),--dry-run,)

# Absorb the class argument used by "make get-locs A".
ifneq ($(GET_LOCS_CLASS),)
$(GET_LOCS_CLASS):
	@:
endif

update-env-secrets:
	@echo "Updating .env with secrets from AWS SSM if missing or empty..."
	@if [ ! -f .env ]; then \
		echo ".env file not found, creating it..."; \
		touch .env; \
	fi
	@for var in oauth2_userinfo google_map_id google_map_key; do \
		VARNAME=$$(echo $$var | tr '[:lower:]' '[:upper:]'); \
		if ! grep -qE "^$$VARNAME=[^=].*" .env 2>/dev/null; then \
			val=$$(aws ssm get-parameter --name $$var --with-decryption --query Parameter.Value --output text 2>/dev/null); \
			if [ -n "$$val" ]; then \
				sed -i "/^$$VARNAME=/d" .env; \
				echo "$$VARNAME=$$val" >> .env; \
				echo "Added $$VARNAME to .env"; \
			else \
				echo "WARNING: Could not fetch /myapp/$$var from SSM"; \
			fi; \
		else \
			echo "$$VARNAME already set in .env, skipping"; \
		fi; \
	done

# Geocoding helpers (OpenStreetMap Nominatim)
geocode-dry-run:
	uv run python scripts/geocode_fill_missing.py --dry-run

geocode-fill:
	uv run python scripts/geocode_fill_missing.py

geocode-verify:
	uv run python scripts/verify_geocoding.py

geocode-verify-json:
	uv run python scripts/verify_geocoding.py --json

.PHONY: geocode-dry-run geocode-fill geocode-verify geocode-verify-json
