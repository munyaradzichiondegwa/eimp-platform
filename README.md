# EBA Micro Insurance — Enterprise Insurance Management Platform (EIMP)

**Document Ref:** NTC/EBA/2026/002  
**Version:** 2.0  
**Prepared by:** NevTech Consultancy — Munyaradzi Chiondegwa, MBA  
**Classification:** STRICTLY CONFIDENTIAL

---

## What is EIMP?

EIMP is a full-stack, API-first enterprise insurance management system built specifically for **EBA Micro Insurance Company (Pvt) Ltd**, Harare, Zimbabwe. It covers the complete insurance value chain:

- **CRM** — Customer records, KYC, lead/prospect pipeline, support ticketing with SLA tracking, 360-degree communication history
- **Underwriting & Policy Administration** — Configurable products, real-time quotation engine, policy lifecycle (issue → endorse → renew → cancel), automated PDF document generation (schedules, certificates, endorsement letters)
- **Broker & Agent Portal** — Accreditation workflow, new business submission, client portfolio view, monthly commission statements, performance reporting
- **Claims Management** — Multi-channel FNOL, automated fraud detection, reserve management, settlement
- **Finance & Accounting** — Double-entry GL, AR/AP, multi-currency, mobile money reconciliation, fixed asset register with automated depreciation, reinsurance accounting (treaties, cessions, recoveries, monthly bordereaux), financial statements
- **Agriculture (Parametric Insurance)** — Automated weather index monitoring with daily data ingestion, threshold-breach detection, and automatic claim generation — no manual loss assessment needed
- **Reporting & Compliance** — IPEC statutory returns, FIU/AML reports, management dashboards
- **Notifications** — Email (SES/SMTP), SMS (Twilio/Econet), WhatsApp (Meta Cloud API)
- **Payments** — EcoCash, OneMoney, InnBucks with circuit-breaker pattern and retry queue

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js 20 LTS + NestJS 10 + TypeScript |
| Frontend | Next.js 14 + React 18 + Tailwind CSS |
| Database | PostgreSQL 16 (TypeORM) |
| Cache / Queue | Redis 7 |
| File storage | AWS S3 (af-south-1) |
| Email | AWS SES or SMTP |
| SMS | Twilio or Econet Business SMS |
| WhatsApp | Meta Cloud API via 360dialog |
| Reverse proxy | Nginx (TLS 1.3, rate limiting, security headers) |
| Container runtime | Docker + Docker Compose |
| Production target | AWS EKS (af-south-1, Cape Town) |

---

## Quick Start — Development

### Prerequisites

- Docker Desktop 4.x+ ([docker.com/products/docker-desktop](https://docker.com/products/docker-desktop))
- Git

### One-command setup

```bash
git clone <repository-url> eimp-platform
cd eimp-platform
./scripts/start-dev.sh
```

The script will:
1. Copy `.env.example` → `.env` with development defaults
2. Build and start all Docker containers (postgres, redis, backend, frontend)
3. Wait for PostgreSQL to be healthy
4. Run the database seeder (admin user, chart of accounts, 3 sample products)
5. Print access URLs

### Access after startup

| Service | URL |
|---|---|
| Admin Portal | http://localhost:3004 |
| API | http://localhost:3003/api/v1 |
| Swagger / OpenAPI | http://localhost:3003/api/v1/docs |
| Health check | http://localhost:3003/health |

**Default login**  
Email: `admin@ebamicroinsurance.co.zw`  
Password: `EbaAdmin@2026!`  
⚠️ Change this password immediately on first login.

---

## Manual Development Setup (without Docker)

### Backend

```bash
cd backend
cp ../.env.example .env          # edit as needed
npm install
npm run start:dev                 # hot-reload dev server on :3001
```

Run seeder (once, after first DB start):
```bash
npm run seed
```

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1 npm run dev   # :3000
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values. Key sections:

| Section | Variables | Required for |
|---|---|---|
| Database | `POSTGRES_*`, `DB_*` | All |
| Redis | `REDIS_*` | Queues, caching |
| JWT | `JWT_SECRET`, `JWT_EXPIRY` | Authentication |
| AWS | `AWS_*` | S3 file storage, SES email |
| Email | `SMTP_*` or `SES_*` | Notifications |
| SMS | `TWILIO_*` or `ECONET_SMS_*` | SMS notifications |
| EcoCash | `ECOCASH_*` | Premium collection |
| OneMoney | `ONEMONEY_*` | Premium collection |
| InnBucks | `INNBUCKS_*` | Premium collection |
| WhatsApp | `WHATSAPP_*` | WhatsApp notifications |

**Note on payment integrations:** The system includes sandbox/mock responses for all payment providers when credentials are not configured. This allows full local development without live API keys.

---

## Production Deployment

### Prerequisites

1. Server with Docker and Docker Compose installed
2. DNS A records for all four subdomains pointing to your server IP:
   `portal.`, `admin.`, `api.`, and `my.ebamicroinsurance.co.zw`
3. SSL certificates in `nginx/ssl/` (`fullchain.pem`, `privkey.pem`)
4. `.env.production` file with production credentials

### Get SSL certificates (Let's Encrypt)

```bash
apt install certbot
certbot certonly --standalone \
  -d portal.ebamicroinsurance.co.zw \
  -d admin.ebamicroinsurance.co.zw \
  -d api.ebamicroinsurance.co.zw \
  -d my.ebamicroinsurance.co.zw
mkdir -p nginx/ssl
cp /etc/letsencrypt/live/portal.ebamicroinsurance.co.zw/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/portal.ebamicroinsurance.co.zw/privkey.pem nginx/ssl/
```

### Database schema: migrations, not auto-sync

Production deliberately does **not** rely on TypeORM's `synchronize` (that's
dev-only, gated by `NODE_ENV !== 'production'` in `configuration.ts`).
Instead, `scripts/deploy-prod.sh` runs a real migration step before starting
the backend:

```bash
npm run migration:run:prod   # runs against the compiled dist/ output, no ts-node needed in the image
```

The included `src/database/migrations/*-InitialSchema.ts` migration was
generated by diffing every entity against a genuinely empty PostgreSQL 16
database (not hand-written), then verified by running it against a fresh
database and confirming the seed script completes successfully afterward.
If you add or change entities, regenerate it locally against a disposable
database before committing:

```bash
docker run --rm -d --name eimp-migration-db -e POSTGRES_USER=eimp_user \
  -e POSTGRES_PASSWORD=eimp_secure_password -e POSTGRES_DB=eimp_db -p 5432:5432 postgres:16-alpine
cd backend && npm run migration:generate -- src/database/migrations/DescriptiveName
docker stop eimp-migration-db
```

### Deploy

```bash
# First-time (includes seeding):
./scripts/deploy-prod.sh --seed

# Subsequent updates:
./scripts/deploy-prod.sh

# Update only backend without rebuilding frontend/customer-portal:
./scripts/deploy-prod.sh --skip-build
```

### Register payment webhook URLs

Register these with each payment gateway provider:

```
POST https://api.ebamicroinsurance.co.zw/api/v1/payments/webhook/ecocash
POST https://api.ebamicroinsurance.co.zw/api/v1/payments/webhook/onemoney
POST https://api.ebamicroinsurance.co.zw/api/v1/payments/webhook/innbucks
```

---

## Testing & CI

The backend has a real unit test suite (`backend/src/modules/ai/*.spec.ts`,
32 tests) covering the statistical scoring engines — risk scoring, fraud
detection, lapse-risk prediction, and the linear-regression forecasting
math — since that's the highest-value, most calculation-critical logic in
the codebase. Expected values in these tests were hand-calculated
independently against the documented formulas, not copied from the
implementation, so they can actually catch a regression in the math itself.

```bash
cd backend
npm test              # run once
npm run test:watch    # watch mode
npm run test:cov      # with coverage report
```

**Known scope limits, stated plainly:** the staff frontend and customer
portal have no automated test suite yet — Next.js doesn't include one by
default and none was added here. Backend coverage is also limited to the
AI/analytics module; the other 20+ backend services (claims workflow,
underwriting, finance, reinsurance, etc.) are verified via `tsc --noEmit`
and full `nest build` on every change, but don't yet have dedicated
`.spec.ts` unit tests.

**CI:** `.github/workflows/ci.yml` runs on every push/PR — type-check,
build, and test for all three apps, plus a real migration run against a
disposable Postgres service container in the backend job. This workflow
file has been validated for correct YAML syntax and mirrors commands
verified locally throughout development; it has not been executed on
GitHub's own infrastructure as part of building this project.

---

## Project Structure

```
eimp-platform/
├── backend/                    # NestJS API
│   └── src/modules/
│       ├── ai/                 # Risk scoring, fraud detection, predictive analytics, forecasting, chatbot
│       ├── audit/              # Immutable audit log
│       ├── claims/             # Claims management (with real fraud detection)
│       ├── crm/                # Customer, KYC, lead pipeline, support tickets
│       ├── customer-portal/    # Self-service API layer scoped to authenticated customer
│       ├── finance/            # GL, invoicing, payments, fixed assets, reinsurance
│       ├── notifications/      # Email, SMS, WhatsApp, cron jobs
│       ├── reporting/          # Management & regulatory reports
│       ├── underwriting/       # Products, policies, brokers, weather index, PDF generation
│       ├── uploads/            # S3 presigned URL service
│       └── users/              # Platform user management
├── frontend/                   # Next.js 14 staff admin portal (port 3000)
│   └── src/app/
│       ├── dashboard/          # Executive KPI dashboard with AI forecasting
│       ├── customers/          # CRM module with lead pipeline
│       ├── policies/           # Policy admin + PDF generation
│       ├── claims/             # Claims workflow + fraud score display
│       ├── brokers/            # Broker & Agent Portal (BAP-01 to BAP-04)
│       ├── finance/            # Finance (GL, invoices, P&L, balance sheet)
│       │   ├── reinsurance/    # FIN-09: Treaty, cession, recovery, bordereau
│       │   └── assets/         # FIN-06: Fixed asset register + depreciation
│       ├── reports/            # IPEC, FIU/AML, GWP, claims reports
│       ├── users/              # User management (9 roles)
│       └── settings/           # System settings & integrations
├── customer-portal/            # Next.js 14 customer PWA (port 3002)
│   └── src/app/
│       ├── login/              # Customer login
│       ├── register/           # CP-01: Self-registration
│       ├── dashboard/          # Home with policy/claim/alert summary
│       ├── policies/           # List, detail, PDF download, pay now
│       │   ├── [id]/           # Policy detail + document download
│       │   └── buy/            # CP-02: 3-step quote and purchase
│       ├── claims/             # CP-05: List, detail with 4-stage timeline, submit
│       ├── profile/            # CP-06: Profile update + KYC document upload
│       └── support/            # Support ticket management
├── nginx/                      # Reverse proxy (2 HTTPS server blocks)
├── scripts/                    # Setup & deployment scripts
├── docker-compose.yml          # Dev compose (5 services)
├── docker-compose.prod.yml     # Production compose (6 services incl. nginx)
└── .env.example                # Environment template
```

---

## API Reference

Full OpenAPI 3.0 documentation is available at `/api/v1/docs` in development mode.

### Core endpoints

| Module | Base path |
|---|---|
| Authentication | `POST /api/v1/auth/login` |
| Customers | `GET/POST /api/v1/crm/customers` |
| Leads | `GET/POST /api/v1/crm/leads` |
| Support Tickets | `GET/POST /api/v1/crm/tickets` |
| Quotation | `POST /api/v1/underwriting/quote` |
| Policies | `GET/POST /api/v1/underwriting/policies` |
| Policy Documents | `GET /api/v1/underwriting/policies/:id/documents/schedule` |
| Brokers | `GET/POST /api/v1/brokers` |
| Broker Portfolio | `GET /api/v1/brokers/:id/portfolio` |
| Commission Statements | `GET/POST /api/v1/brokers/:id/statements` |
| Claims | `GET/POST /api/v1/claims` |
| Finance | `GET /api/v1/finance/dashboard` |
| Fixed Assets | `GET/POST /api/v1/finance/assets` |
| Reinsurance Treaties | `GET/POST /api/v1/finance/reinsurance/treaties` |
| Reinsurance Bordereaux | `POST /api/v1/finance/reinsurance/treaties/:id/bordereaux/generate` |
| Weather Readings | `POST /api/v1/underwriting/weather/readings` |
| Weather Trigger Events | `GET /api/v1/underwriting/weather/events` |
| Reports | `GET /api/v1/reports/dashboard` |
| IPEC Return | `GET /api/v1/reports/regulatory/ipec?quarter=2026-Q2` |
| FIU/AML | `GET /api/v1/reports/regulatory/fiu-aml?from=...&to=...` |
| Payments | `POST /api/v1/payments/initiate` |

---

## User Roles

| Role | Description |
|---|---|
| `super_admin` | Full system access, user management |
| `admin` | Operational access, no system config |
| `underwriter` | Policy issuance, endorsements, product config |
| `claims_officer` | Claims workflow, settlement, fraud review |
| `finance` | GL, invoicing, payments, financial statements |
| `compliance` | KYC, AML, IPEC/FIU reports, audit trail |
| `broker` | New business submission, client portfolio view |
| `readonly` | View-only across all modules |

---

## Scheduled Jobs

| Job | Schedule (CAT) | Purpose |
|---|---|---|
| Renewal Reminders | Daily 08:00 | 60/30/7 days before expiry — email + SMS |
| KYC Expiry Alerts | Daily 09:00 | 30/14/7 days before KYC expires |
| Lapse Processing | Daily 01:00 | Auto-lapse policies 14 days past due |
| Overdue Invoices | Daily 02:00 | Mark unpaid past-due invoices as overdue |
| Payment Retry | Every 5 min | Retry queued payments with exponential backoff |

---

## Regulatory Compliance

- **IPEC:** Quarterly statutory returns auto-generated at `GET /api/v1/reports/regulatory/ipec?quarter=YYYY-QN`
- **ZIMRA:** VAT and withholding tax data captured in GL — export from Trial Balance
- **FIU:** High-value transaction reports (CTR) and KYC compliance register at `/api/v1/reports/regulatory/fiu-aml`
- **Audit trail:** Every data change, login, approval, and financial posting is written to an immutable `audit_logs` table
- **KYC:** Document upload, expiry tracking, automated re-verification alerts, PEP screening fields

---

## Support

**NevTech Consultancy**  
5393 Aspindale Road, Tynwald, Harare, Zimbabwe  
chiondegwabm@gmail.com | +263 713 794 347 | +263 774 387 106  
Ref: NTC/EBA/2026/002

---

*This document and codebase are strictly confidential and the property of EBA Micro Insurance Company (Pvt) Ltd. Prepared by NevTech Consultancy, June 2026. Regulated by IPEC Zimbabwe.*
# eimp-platform
