#!/usr/bin/env bash
# ============================================================
# EBA EIMP — Development Setup Script
# Prepared by NevTech Consultancy | Ref: NTC/EBA/2026/002
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[EIMP]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

info "EBA Enterprise Insurance Management Platform — Dev Setup"
echo "  NevTech Consultancy | Ref: NTC/EBA/2026/002"
echo ""

# ── Prerequisites check ────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || error "Docker is required but not installed. Install Docker Desktop from https://docker.com"
command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1 || error "Docker Compose is required."

DOCKER_COMPOSE="docker compose"
docker compose version >/dev/null 2>&1 || DOCKER_COMPOSE="docker-compose"

# ── Environment file ─────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    warn ".env not found — copying from .env.example"
    cp .env.example .env
    warn "Review and update .env before production use."
    warn "Default dev credentials are set. Do NOT use these in production."
fi

# ── Build & start containers ──────────────────────────────────────────────────
info "Starting Docker services (postgres, redis, backend, frontend, customer-portal)…"
$DOCKER_COMPOSE up -d --build

info "Waiting for PostgreSQL to be ready…"
RETRIES=30
until $DOCKER_COMPOSE exec -T postgres pg_isready -U "${POSTGRES_USER:-eimp_user}" -d "${POSTGRES_DB:-eimp_db}" >/dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ "$RETRIES" -eq 0 ]; then
        error "PostgreSQL did not become ready in time. Check: docker compose logs postgres"
    fi
    sleep 2
done
info "PostgreSQL is ready."

# ── Run database seed ─────────────────────────────────────────────────────────
info "Running database seeder (creates admin user, chart of accounts, sample products)…"
sleep 5   # Allow TypeORM synchronize to complete
$DOCKER_COMPOSE exec -T backend npm run seed 2>&1 | tail -20 || warn "Seed may have already run (tables exist). This is normal after first run."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "EIMP is running!"
echo ""
echo "  Staff Admin Portal:       http://localhost:3000"
echo "  Customer Self-Service:    http://localhost:3002"
echo "  Backend API:              http://localhost:3001/api/v1"
echo "  Swagger Docs:             http://localhost:3001/api/v1/docs"
echo ""
echo "  Staff login:"
echo "    Email:    admin@ebamicroinsurance.co.zw"
echo "    Password: EbaAdmin@2026!"
echo ""
echo "  Customer self-registration: http://localhost:3002/register"
echo ""
echo -e "${YELLOW}  IMPORTANT: Change the default staff password on first login.${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
info "To view logs:  docker compose logs -f [backend|frontend|postgres]"
info "To stop:       docker compose down"
info "To reset DB:   docker compose down -v && ./scripts/start-dev.sh"
