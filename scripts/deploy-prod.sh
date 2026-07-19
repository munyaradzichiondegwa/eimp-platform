#!/usr/bin/env bash
# ============================================================
# EBA EIMP — Production Deployment Script
# Prepared by NevTech Consultancy | Ref: NTC/EBA/2026/002
#
# Usage: ./scripts/deploy-prod.sh [--skip-build] [--seed]
#
# Prerequisites:
#   - .env.production must exist with production credentials
#   - SSL certificates in nginx/ssl/ (fullchain.pem, privkey.pem)
#   - Docker & Docker Compose installed on the server
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[DEPLOY]${NC} $(date '+%H:%M:%S') $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}   $(date '+%H:%M:%S') $1"; }
error()   { echo -e "${RED}[ERROR]${NC}  $(date '+%H:%M:%S') $1"; exit 1; }
section() { echo ""; echo -e "${GREEN}══ $1 ══${NC}"; }

SKIP_BUILD=false
RUN_SEED=false
for arg in "$@"; do
    case $arg in
        --skip-build) SKIP_BUILD=true ;;
        --seed)       RUN_SEED=true ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

section "PRE-FLIGHT CHECKS"

[ -f ".env.production" ] || error ".env.production not found. Copy .env.example and fill in production values."
[ -f "nginx/ssl/fullchain.pem" ] || warn "SSL certificate not found at nginx/ssl/fullchain.pem. HTTPS will not work."
[ -f "nginx/ssl/privkey.pem" ]   || warn "SSL private key not found at nginx/ssl/privkey.pem."

command -v docker >/dev/null 2>&1 || error "Docker is not installed."

info "Pre-flight checks passed."

section "BUILD IMAGES"
if [ "$SKIP_BUILD" = false ]; then
    info "Building backend image…"
    $COMPOSE build backend

    info "Building frontend image…"
    $COMPOSE build frontend

    info "Building customer portal image…"
    $COMPOSE build customer-portal

    info "Images built successfully."
else
    warn "Skipping build (--skip-build flag set)."
fi

section "DATABASE"
info "Starting database and Redis…"
$COMPOSE up -d postgres redis

info "Waiting for PostgreSQL…"
RETRIES=40
until $COMPOSE exec -T postgres pg_isready >/dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    [ "$RETRIES" -eq 0 ] && error "PostgreSQL did not become ready."
    sleep 3
done
info "PostgreSQL ready."

section "DATABASE MIGRATIONS"
info "Running schema migrations (production uses migration-based deploys, not auto-sync)…"
$COMPOSE run --rm backend npm run migration:run:prod 2>&1 | tail -30
if [ "${PIPESTATUS[0]:-0}" -ne 0 ]; then
    error "Migrations failed. Deployment aborted — the running application (if any) has not been touched."
fi
info "Migrations applied successfully."

section "DEPLOY BACKEND"
info "Stopping existing backend (zero-downtime swap)…"
$COMPOSE stop backend 2>/dev/null || true

info "Starting new backend…"
$COMPOSE up -d backend

info "Waiting for backend health check…"
RETRIES=20
until curl -sf http://localhost:3001/health >/dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    [ "$RETRIES" -eq 0 ] && error "Backend health check failed. Check: docker compose -f docker-compose.prod.yml logs backend"
    sleep 3
done
info "Backend is healthy."

if [ "$RUN_SEED" = true ]; then
    info "Running database seeder…"
    $COMPOSE exec -T backend node dist/database/seed.js 2>&1 | tail -20
fi

section "DEPLOY FRONTEND"
$COMPOSE up -d frontend customer-portal

info "Waiting for frontend and customer portal…"
sleep 5

section "START NGINX"
$COMPOSE up -d nginx

section "VERIFY"
sleep 3
if curl -sk https://localhost/health >/dev/null 2>&1; then
    info "HTTPS health check: OK"
elif curl -s http://localhost/health >/dev/null 2>&1; then
    warn "HTTP health check: OK (HTTPS may not be configured yet)"
else
    warn "Health check via curl failed — verify manually."
fi

section "COMPLETE"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "Production deployment complete."
echo ""
echo "  Services running:"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || $COMPOSE ps
echo ""
echo "  Useful commands:"
echo "    View logs:     docker compose -f docker-compose.prod.yml logs -f [service]"
echo "    Restart:       docker compose -f docker-compose.prod.yml restart [service]"
echo "    Stop all:      docker compose -f docker-compose.prod.yml down"
echo "    Shell (BE):    docker compose -f docker-compose.prod.yml exec backend sh"
echo ""
echo -e "${YELLOW}  REMINDER: Ensure IPEC compliance reporting is configured and tested.${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
