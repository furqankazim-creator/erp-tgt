#!/bin/bash
set -e

DOMAIN="crm.tgailab.site"

echo "=== Global Tech CRM - Docker Deployment ==="

# Step 1: Build and start containers
echo "[1/2] Building and starting containers..."
docker compose down 2>/dev/null || true
docker compose build
docker compose up -d

# Step 2: Verify
echo "[2/2] Verifying deployment..."
sleep 5
docker compose ps

echo ""
echo "=== Deployment complete! ==="
echo "  Internal: http://localhost:3050"
echo "  Public:   https://$DOMAIN (via caa-nginx reverse proxy)"
echo ""
echo "  Login: demo@globaltech.io / the ADMIN_PASSWORD set in server/.env"
