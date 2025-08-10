DOMAIN := home.jonkanon.com
EMAIL := karlsen.jon.a@gmail.com
SHELL := /bin/bash

install-nginx:
	sudo apt update
	sudo apt install -y nginx
	sudo cp nginx/jonbuntu /etc/nginx/sites-available/$(DOMAIN).conf
	sudo ln -sf /etc/nginx/sites-available/$(DOMAIN).conf /etc/nginx/sites-enabled/
	sudo nginx -t
	sudo systemctl reload nginx

install-certbot:
	sudo apt install -y certbot python3-certbot-nginx
	sudo certbot --nginx -d $(DOMAIN) --email $(EMAIL) --agree-tos --non-interactive
	sudo systemctl enable certbot.timer

install-oauth2:
	if ! command -v oauth2-proxy >/dev/null 2>&1; then \
		echo "Installing oauth2-proxy..."; \
		sudo wget -O /usr/local/bin/oauth2-proxy https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.11.0/oauth2-proxy-v7.6.0.linux-arm64; \
		sudo chmod +x /usr/local/bin/oauth2-proxy; \
	fi

	sudo mkdir -p /etc/oauth2-proxy
	sudo cp oauth2-proxy/home.jonkanon.com.cfg /etc/oauth2-proxy/home.jonkanon.com.cfg
	sudo chown root:root /etc/oauth2-proxy/home.jonkanon.com.cfg
	sudo chmod 600 /etc/oauth2-proxy/home.jonkanon.com.cfg

	bash -c '\
CONFIG_FILE=/etc/oauth2-proxy/home.jonkanon.com.cfg; \
keys=(oauth2_client_id oauth2_client_secret oauth2_cookie_secret oauth2_issuer_url); \
cfgkeys=(client_id client_secret cookie_secret oidc_issuer_url); \
for i in $${!keys[@]}; do \
	ssm_key="$${keys[$$i]}"; \
	cfg_key="$${cfgkeys[$$i]}"; \
	if grep -qE "^\s*$$cfg_key\s*=\s*\"[^\"]+\"" "$$CONFIG_FILE"; then \
		echo "$$cfg_key already set in config with value, skipping"; \
	else \
		echo "$$cfg_key missing or empty in config, fetching from SSM..."; \
		val=$$(aws ssm get-parameter --name "$$ssm_key" --with-decryption --query Parameter.Value --output text 2>/dev/null || echo ""); \
		if [ -z "$$val" ]; then \
			echo "WARNING: Could not fetch $$ssm_key from SSM or empty value"; \
			continue; \
		fi; \
		echo "Updating $$cfg_key in config..."; \
		sudo sed -i "/^\s*$$cfg_key\s*=/d" "$$CONFIG_FILE"; \
		echo "$$cfg_key=\"$$val\"" | sudo tee -a "$$CONFIG_FILE" >/dev/null; \
	fi; \
done'

	sudo cp oauth2-proxy/oauth2-jonkanon.service /etc/systemd/system/oauth2-jonkanon.service
	sudo systemctl daemon-reload
	sudo systemctl enable --now oauth2-jonkanon.service

install-route53:
	if ! command -v uv >/dev/null 2>&1; then \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
	fi

	sudo mkdir -p /opt/route53
	sudo cp -r scripts/route53/* /opt/route53/
	sudo chown -R jon:jon /opt/route53

	sudo -u jon bash -c "cd /opt/route53 && /home/jon/.local/bin/uv sync --frozen"

	sudo cp systemd/route53-update.* /etc/systemd/system/
	sudo systemctl daemon-reload
	sudo systemctl enable --now route53-update.timer

install-all: install-nginx install-certbot install-oauth2 install-systemd
