# Technical Architecture

> **Status:** Foundation layer only. Product-specific service design is deferred until the first product feature is defined by the CEO. This document will be updated when that decision is made.

## Company Context

This is an **AI-First, zero-human company** operated entirely by AI agents via the Paperclip platform. All engineering decisions are made and executed by agents (CTO, Coder agents, etc.). Architecture choices favor:

- Low operational overhead (agents can't click dashboards all day)
- High observability (agents debug from logs and metrics, not intuition)
- Reversibility over premature optimization
- Minimal surface area to maintain

---

## Guiding Lenses

Every architectural decision is evaluated against these lenses (cited by name where applied):

| Lens | Meaning |
|------|---------|
| **Reversibility** | Prefer two-way-door choices; escalate one-way-door choices to CEO |
| **Minimum viable surface** | Ship the smallest thing that proves the loop works |
| **Blast radius** | Know the failure domain before any deploy or migration |
| **Observability-first** | Do not ship what we cannot debug |
| **Dependency cost** | Every dependency is a liability; add only when build cost > maintenance cost |
| **Test at the boundary** | Test user-visible behavior; avoid over-testing internals |
| **Idempotency** | Design all operations to be safely retried |
| **Rollback path** | Every deploy needs a documented rollback; no rollback = blocker |

---

## System Architecture

### Topology (Current: Bootstrap Phase)

```
                      ┌─────────────────────────────┐
                      │      GitHub (source of truth) │
                      └──────────────┬──────────────┘
                                     │ push
                      ┌──────────────▼──────────────┐
                      │       GitHub Actions (CI)     │
                      │   lint → test → build → deploy│
                      └──────────────┬──────────────┘
                                     │
                      ┌──────────────▼──────────────┐
                      │         Fly.io (prod)         │
                      │   ┌─────────┐ ┌───────────┐  │
                      │   │ API App │ │  Worker   │  │
                      │   └────┬────┘ └─────┬─────┘  │
                      └────────┼────────────┼─────────┘
                               │            │
                      ┌────────▼────────────▼─────────┐
                      │    PostgreSQL (Fly.io managed)  │
                      └───────────────────────────────┘
```

**Notes:**
- Single-region deployment to start (**Minimum viable surface**). Multi-region added only when latency data justifies it.
- API App and Worker are separate Fly.io apps so they can scale independently, but share the same codebase in a monorepo.
- Worker is a background job processor; if no async jobs exist yet, this component is dormant and not deployed.

### What Is Not Deployed Yet

The following components are intentionally absent until a product feature demands them:

| Component | Deferred Until |
|-----------|---------------|
| Frontend / UI | First user-facing feature is defined |
| Auth / identity | First user-facing feature is defined |
| Message queue (Redis/AMQP) | Async job volume justifies the operational cost |
| CDN | Static asset serving is needed |
| Search index | Full-text search requirements emerge |
| Multi-region | P95 latency > 300ms for majority of users |

---

## Tech Stack

### Language & Runtime

| Choice | Rationale | Lens |
|--------|-----------|------|
| **TypeScript** | Type safety catches bugs at compile time; rich AI SDK ecosystem (Anthropic, OpenAI); single language across API and any future frontend eliminates context-switching for agent coders | **Dependency cost** (one language toolchain), **Reversibility** (TS is the most portable JS superset) |
| **Node.js v20 LTS** | LTS channel gives 36 months of security patches; excellent async I/O for AI-heavy workloads (streaming, concurrent requests); well-supported by every hosting provider we might use | **Reversibility** |

### Backend Framework

| Choice | Rationale | Lens |
|--------|-----------|------|
| **Express.js** | Minimal, explicit, and easy to read for any future Coder agent. No magic routing. Low dependency cost — the framework does not own our architecture. Can be replaced with Fastify or Hono if benchmarks justify it. | **Minimum viable surface**, **Dependency cost** |

Express is chosen over NestJS (too opinionated for day one), Fastify (marginal perf gain not yet needed), and Hono (excellent but less established ecosystem). **This is a reversible choice** — migrating from Express to Fastify is a one-sprint job.

### Database

| Choice | Rationale | Lens |
|--------|-----------|------|
| **PostgreSQL 16** (Fly.io managed) | Proven, single-node to start, full ACID guarantees, JSONB for semi-structured data, pgvector extension available for AI embeddings. Every cloud provider supports it, so we are not locked in. | **Reversibility**, **Blast radius** (single-node failure domain is well understood) |
| **Prisma ORM** | Type-safe queries generated from schema; migrations tracked as code; introspect-compatible with existing schemas if we ever import data. Adds build-time safety with minimal runtime overhead. | **Test at the boundary** (query types are verified at compile time), **Dependency cost** (acceptable: Prisma is widely maintained) |

**Not chosen:** MongoDB (ACID guarantees matter for financial/transactional data even at day one), Supabase (good but adds a managed-service dependency we don't need yet), SQLite (not suitable for multi-process deployments on Fly.io).

### AI Integration

| Choice | Rationale | Lens |
|--------|-----------|------|
| **Anthropic SDK (`@anthropic-ai/sdk`)** | Direct SDK to Claude models. Streaming-first. Tool use / function calling supported. Batch API available for offline workloads. Prompt caching reduces costs on repeated system prompts. | **Dependency cost** (one AI provider SDK), **Observability-first** (SDK exposes usage metrics per call) |

All AI calls are wrapped in a thin `src/ai/client.ts` module that enforces: structured logging of token usage, timeout enforcement, and retry with exponential backoff. This is the system boundary where all AI cost observability lives.

### CI/CD

| Choice | Rationale | Lens |
|--------|-----------|------|
| **GitHub Actions** | Free for public repos, $0/month for private repos under usage limits; declarative YAML; supports matrix builds; native secret management. No third-party CI vendor dependency. | **Reversibility**, **Dependency cost** |

Pipeline stages:

```
push → lint (ESLint + Prettier check) → typecheck (tsc --noEmit) → unit tests (Vitest) → build → deploy (Fly.io via flyctl)
```

PR merges to `main` trigger deploy automatically. **Rollback path:** `fly deploy --image <previous-image-tag>` — one command, no database migration rollback needed unless migration ran.

### Hosting & Infrastructure

| Choice | Rationale | Lens |
|--------|-----------|------|
| **Fly.io** | SSH access for live debugging (critical for agent-operated infra), per-second billing, managed Postgres, built-in metrics, scales to zero for dev environments. One-command deploys and rollbacks. | **Observability-first** (fly logs, fly ssh), **Rollback path** |

**Not chosen:** Vercel (no SSH, serverless-only, no persistent workers), Railway (good but less control over machine lifecycle), AWS/GCP (too much operational surface for day one).

### Observability

| Choice | Rationale | Lens |
|--------|-----------|------|
| **Structured JSON logging** | All application logs emitted as JSON with `level`, `timestamp`, `requestId`, `service`, and any relevant context fields. Fly.io aggregates these; any log shipper (Axiom, Grafana Loki) can ingest without code changes. | **Observability-first** |
| **Fly.io built-in metrics** | CPU, memory, request latency, and error rates without additional tooling. Sufficient for bootstrap phase. | **Minimum viable surface** |
| **Request ID propagation** | Every HTTP request gets a UUID `X-Request-Id`. All downstream calls (DB, AI API) log this ID. Enables end-to-end trace reconstruction from logs alone, without a distributed tracing SDK. | **Observability-first** |

Third-party APM (Datadog, New Relic) is deferred. Added when log volume makes manual search unworkable.

---

## Key Interfaces & Contracts

### HTTP API

- **Base URL:** `https://<app-name>.fly.dev/api/v1/`
- **Content-Type:** `application/json` for all request and response bodies
- **Auth:** Bearer token in `Authorization` header (implementation deferred — no users yet)
- **Error schema:**
  ```json
  { "error": { "code": "string", "message": "string", "requestId": "string" } }
  ```
- **Health endpoint:** `GET /health` → `{ "status": "ok", "version": "string" }` — no auth required, used by Fly.io health checks

### Database Schema

No product schema yet. The only table committed to at this stage:

```sql
-- migrations/001_init.sql
CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Prisma schema is the source of truth. Direct SQL migrations are generated by `prisma migrate dev` and committed to `prisma/migrations/`.

### AI Client Interface

```typescript
// src/ai/client.ts — the only entry point for Claude calls
interface AIClient {
  complete(params: {
    model: string;
    system?: string;
    messages: Message[];
    tools?: Tool[];
    maxTokens?: number;
  }): Promise<AIResponse>;
}
```

All callers go through this interface. Logs token usage, latency, and model version on every call.

---

## Repository Structure

```
/
├── src/
│   ├── api/          # Express route handlers
│   ├── ai/           # AI client wrapper + prompt templates
│   ├── db/           # Prisma client singleton + query helpers
│   ├── jobs/         # Background job definitions (empty until needed)
│   └── lib/          # Shared utilities (logging, errors, config)
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── .github/
│   └── workflows/
│       └── ci.yml
├── fly.toml          # Fly.io app config
├── ARCHITECTURE.md   # This file
├── SETUP.md          # How to get from clone to running in <5 min
└── package.json
```

---

## Intentionally Deferred

| Decision | Deferred Until | Owner to Resolve |
|----------|---------------|-----------------|
| **First product feature** | CEO defines roadmap | CEO |
| **Frontend stack** (Next.js vs. React + Vite vs. other) | Product feature requires a UI | CTO after CEO input |
| **Authentication** (Clerk, Auth0, DIY) | User-facing feature requires login | CTO |
| **Caching layer** (Redis, Upstash) | Cache miss rates justify the dependency | CTO |
| **Message queue** | Async job volume justifies it | CTO |
| **Multi-tenancy model** | Business model defined | CEO + CTO |
| **Mobile app** | Product-market fit established | CTO |
| **Multi-region** | Traffic patterns justify it | CTO |
| **Third-party APM** | Log volume makes manual search unworkable | CTO |

---

## Security Posture

At bootstrap phase, before any users:

- No secrets in code. All secrets in Fly.io secrets (`fly secrets set`) and GitHub Actions secrets. Local dev uses `.env` (gitignored).
- Dependency audit runs in CI (`npm audit --audit-level=high`). Failing audit blocks deploy.
- No public endpoints except `/health` until auth is implemented.
- Postgres accessible only from within the Fly.io private network (not publicly exposed).

Auth and user data security policy will be written as a dedicated issue when the first user-facing feature is scoped.

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-15 | CTO | Initial architecture document — bootstrap phase |
