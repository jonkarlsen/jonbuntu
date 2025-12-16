IMAGE_NAME=jonbuntu-py
TAG=latest
PORT=8000
LOCAL_JSON=locations.json
ENCODED_FILE=locations.json.gz.b64
PARAM_NAME=locations_json

.PHONY: install install-dev format build run_no_docker run stop clean

install:
	uv pip install -e .

install-dev:
	uv pip install -e .[dev]

format: install-dev
	uv run ruff format .
	uv run ruff check --fix
	find . -name "*.js" -exec uv run js-beautify -r {} \;

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

run: update-env-secrets
	docker compose up -d


#stop:
#	docker stop $(IMAGE_NAME) || true
#	docker rm $(IMAGE_NAME) || true

stop:
	docker compose down

#clean: stop
#	docker rmi $(IMAGE_NAME):$(TAG) || true

clean:
	docker compose down --rmi all --volumes --remove-orphans


upload-location:
	jq -c . $(LOCAL_JSON) | gzip | base64 > $(ENCODED_FILE)
	aws ssm put-parameter --name $(PARAM_NAME) --type SecureString --value "$$(cat $(ENCODED_FILE))" --overwrite
	rm $(ENCODED_FILE)

download-locations:
	aws ssm get-parameter --name $(PARAM_NAME) --with-decryption --query Parameter.Value --output text | base64 -d | gunzip | jq '.' > $(LOCAL_JSON)

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
