# M-Pesa Recurring Billing Engine
https://mpesa-billing-engine-v1.onrender.com/api

A NestJS-based recurring billing service for merchants that sell subscription plans and charge customers through Safaricom M-Pesa STK Push.

The project is designed around explicit billing state, tenant isolation, and operational reliability: PostgreSQL stores the source of truth, Prisma handles typed access, Redis caches Daraja tokens and supports the queue layer, and BullMQ drives retries for webhook delivery and subscription processing.

## Why this stack

- NestJS: modular architecture, dependency injection, structured service boundaries, API-first development
- PostgreSQL: ACID guarantees for money-adjacent writes and auditability
- Prisma 7: strong typing, explicit database handling, adapter-based access patterns
- Redis + BullMQ: retry/backoff semantics, background job processing, and queue-based delivery
- Daraja M-Pesa: the live payment rail the engine integrates with in sandbox mode
- Argon2: hashed merchant API keys instead of storing raw secrets
- HMAC-SHA256: merchant webhook signing for tamper-evident delivery

## Core design decisions

- Money is stored as `Decimal(12,2)`; values are never treated as JavaScript floats.
- Every charge has a unique idempotency key derived from the subscription and billing cycle, enforcing duplicate-charge protection structurally rather than as a fragile best-effort check.
- Billing is prepaid: a merchant is charged before the service period begins.
- The retry ladder is explicit: 1 / 3 / 7 days, then `PAST_DUE`. This keeps dunning visible in the data model rather than hiding it in queue internals.
- Cross-merchant access returns 404 instead of 403 to avoid confirming that a resource exists to unauthorized users.
- Webhooks are optional. If a merchant has no webhook URL or secret, the billing flow still works; notifications simply do not fire.

## Architecture overview

- Merchants: registered users with hashed API keys and optional webhook configuration
- Plans: merchant-owned recurring pricing plans with interval and amount metadata
- Subscriptions: customer subscriptions tied to a plan and merchant
- Payment attempts: recorded per charge attempt with `attemptNumber`, `status`, and idempotency tracking
- Webhook deliveries: queued outbound merchant notifications with retry/backoff handling

## API surface

All routes are mounted under `/api` in the application bootstrap.

### Merchant routes

- `POST /api/merchants` — public merchant registration; returns the API key and webhook secret once
- `POST /api/merchants/onboarding/start` — start guided onboarding and receive the next required step
- `GET /api/merchants/me/onboarding` — resume guided onboarding progress
- `POST /api/merchants/me/onboarding/plan` — create the first membership plan after PayBill setup
- `POST /api/merchants/me/mpesa-setup` — validate and save encrypted merchant PayBill Daraja credentials
- `GET /api/merchants/me/mpesa-setup` — resume setup by checking the merchant's M-Pesa setup status
- `PATCH /api/merchants/me` — update the authenticated merchant
- `POST /api/merchants/me/rotate-webhook-secret` — rotate the merchant webhook secret

### Plan routes

- `POST /api/plans`
- `GET /api/plans`
- `GET /api/plans/:planId`
- `PATCH /api/plans/:planId`
- `DELETE /api/plans/:planId`

### Subscription routes

- `POST /api/subscriptions`
- `GET /api/subscriptions`
- `GET /api/subscriptions/:subscriptionId`
- `PATCH /api/subscriptions/:subscriptionId/cancel`

### Inbound Daraja callback

- `POST /api/webhooks/daraja/callback/:token` — public callback endpoint protected by the configured callback token

### Authentication and security

- Every protected endpoint requires an `x-api-key` header.
- The global API key guard enforces merchant ownership and rejects invalid or missing credentials.
- Swagger is enabled when `NODE_ENV !== 'production'` at `http://localhost:3000/api/docs`.

## Getting started

### 1) Install dependencies

```bash
git clone <your-repo-url>
cd billing-engine
npm install
```

### 2) Start the supporting services

The project expects PostgreSQL and Redis to be available locally or through Docker.

```bash
docker compose up -d
```

### 3) Configure environment variables

Create a `.env` file based on the example:

```bash
cp .env.example .env
```

Example values:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/billing-engine
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=billing-engine

CONSUMER_KEY=your_daraja_consumer_key
CONSUMER_SECRET=your_daraja_consumer_secret
SHORT_CODE=174379
PASSKEY=your_daraja_passkey
MPESA_TOKEN_URL=https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials
STK_PUSH_URL=https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest
MPESA_CALLBACK_URL=https://your-ngrok-url.ngrok-free.app/api/webhooks/daraja/callback
DARAJA_CALLBACK_TOKEN=replace-with-a-secret-token
MPESA_CREDENTIAL_ENCRYPTION_KEY=base64-encoded-32-byte-key
```

Each merchant must complete PayBill Daraja setup before collecting payments. Generate the encryption key with:

```bash
openssl rand -base64 32
```

The platform stores the consumer key, consumer secret, and passkey encrypted. Merchants only need to provide their own Daraja credentials once; the callback URL remains managed by the platform.

### 4) Initialize the database

```bash
npx prisma generate
npx prisma migrate dev
```

### 5) Run the app

Development mode:

```bash
npm run start:dev
```

Production build:

```bash
npm run build
npm run start:prod
```

Swagger documentation:

```text
http://localhost:3000/api/docs
```

## Testing

The project includes a broad regression suite focused on the failure modes that actually caused issues during development.

```bash
npm test -- --runInBand
```

Current verified status from the repository:

- 16 test suites passing
- 71 tests passing

### High-priority coverage included

- `src/common/utils/phone.util.spec.ts` — normalizes valid Kenyan phone numbers and rejects invalid input
- `src/common/guards/api-key/api-key.guard.spec.ts` — verifies auth success, missing/invalid keys, and public-route bypass
- `src/payments/payments.service.spec.ts` — covers retry ladder behavior, attempt counting, and reconciliation logic
- `src/notifications/webhook-delivery.processor.spec.ts` — validates HMAC generation and automatic retry behavior
- `src/notifications/notifications.service.spec.ts` — verifies merchant notification creation and no-op behavior when the merchant is not configured
- controller and service specs for merchants, plans, subscriptions, and Daraja integration

## Real bugs found and fixed during development

This project was intentionally test-driven around failure cases, not just happy paths. Some examples:

- Authentication bypass caused by an async predicate being used inside `Array.prototype.find()`, which does not await async callbacks.
- Cross-tenant data corruption caused by matching updates too broadly rather than by the specific Daraja checkout identity.
- Retry counting and dunning logic reset incorrectly because attempt numbers were derived from a lifetime count instead of the current retry window.
- Reconciliation paths updated internal state without notifying merchants, creating a silent business failure path.

Those behaviors are now guarded by regression tests so they are harder to reintroduce.

## Database schema

The application uses the following Prisma models:

- `Merchant`
- `Plan`
- `Subscription`
- `PaymentAttempt`
- `WebhookDelivery`

The schema is defined in `prisma/schema.prisma` and includes a `Decimal(12,2)` amount model, status enums, and webhook delivery tracking.

## Operational notes

- The app uses `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` enabled.
- The API key guard is globally registered in the application module.
- The webhook callback route is public by design and is protected with a token check.
- The project expects Redis to be running for BullMQ and Daraja token caching.
- Swagger docs are exposed only in non-production environments.

## Roadmap

- Sprint 1: merchants, plans, and subscriptions CRUD
- Sprint 2: Daraja sandbox integration and STK flow validation
- Sprint 3: BullMQ scheduler and retry/dunning ladder
- Sprint 4: signed merchant webhooks
- Sprint 5: regression-focused test coverage and operational hardening
- Sprint 6: broader self-service and merchant tooling

## License

This repository is currently marked as `UNLICENSED` in `package.json`. If you intend to publish or share the project publicly, update the license metadata and add a proper `LICENSE` file before release.

## Support and development notes

If you are running this in a real environment, ensure:

- PostgreSQL is reachable from the app container or host
- Redis is available on the configured URL
- Daraja sandbox credentials are valid
- your callback URL is public and matches the configured token
- webhook secrets are rotated and stored securely outside source control
