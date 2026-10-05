# Kolibri Registration Portal

A standalone registration application for Kinder- und Elternzentrum Kolibri e.V. Dresden, built with SvelteKit, TypeScript and Cloudflare. It provides a limited trial-lesson intake mode and a broader parent/administration portal under development. The interface supports German and Russian.

The portal has its own origin, Worker, D1 database, storage and authentication. The official Kolibri website is a separate system; integration is through ordinary HTTPS links. This repository does not contain or deploy its CMS.

## Current state

The latest saved [operational checkpoint](docs/implementation/STAGE_13_ACTIVE_STATE.md) records a successful **trial-intake deployment on 24 September 2026**, including independent request notification handling and bureau email alerts for failed or ambiguous Telegram delivery. Its next recorded action is owner manual acceptance. This is a statement about repository evidence, not a fresh check of the live service.

The same checkpoint keeps the **full manual preview and full portal production readiness blocked**. The limited intake deployment does not establish readiness of the complete portal. Recorded release evidence, outstanding gates and exact continuation instructions remain in that checkpoint; the README does not advance them.

## What is implemented

**Trial intake** is a separate runtime mode (`PORTAL_MODE=trial_intake`) with `/probestunde` routes. It supports selection of lessons, children and desired dates without creating a parent account, email verification, confirmation messages, bureau notifications, and administrator request/delivery views. Full portal routes are restricted in this mode. The intake-specific implementation is under `src/lib/trial-intake/`, with a separate deployment template and schedule-exporter integration.

**The broader portal code** includes parent accounts and revocable sessions, family/child records and legacy claims, a course catalog, indicative pricing, trial and individual/Nachhilfe requests, document quarantine/review, contract offers and price reviews, messages, administration, audit records, and privacy export/deletion workflows. These modules have feature and release gates; their presence in the source does not mean all are enabled or accepted in production.

Shared infrastructure includes versioned imports, D1 migrations, private R2 storage, outbox delivery, scheduled maintenance, aggregate health reporting, and server-side ownership/role checks. Email and Telegram providers are implemented. Their real delivery, secrets, activation and recovery procedures are controlled separately from local development.

## Stack and prerequisites

- Node.js **22.12 or later**, npm and the checked-in `package-lock.json`.
- Svelte 5, SvelteKit 2, TypeScript, Tailwind CSS and Zod.
- Cloudflare Workers, D1, R2 and optional Browser Run for contract rendering.
- Resend, Cloudflare Turnstile and Telegram integrations for explicitly configured environments.
- Vitest and Playwright for unit, integration and browser checks.

The locked toolchain includes an alpha Miniflare release; use `npm ci` to preserve the tested dependency selection rather than upgrading it as part of setup.

## Local development

```sh
npm ci
npm run db:migrate:local
npm run dev -- --host 127.0.0.1
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. These migration scripts explicitly use local D1. `wrangler.local.toml` names local resources, and the SvelteKit platform proxy disables remote bindings. State is stored under ignored `.wrangler/`.

The default local configuration selects the full portal mode, keeps public authentication and document/contract actions disabled, uses fake email, and disables Telegram. A fresh database has no operational catalog, imports, client records or administrator account. This is a development starting point, not a populated demonstration of every workflow.

Copy `.dev.vars.example` to ignored `.dev.vars` only when a local feature requires secrets, replacing its placeholders with suitable local values. Never copy production or preview credentials into a tracked file. Enabling a feature requires its actual configuration and prerequisites; changing one flag alone does not establish a working flow.

`npm run db:migrations:local` lists local migrations. `npm run db:reset:local` destroys only the local D1 state and should be used deliberately. Production import, remote migrations and deployment are separate commands and are not part of this setup.

## Imports and source material

Import tools handle price tables, schedules, Access data and selected PlusBText fields. Imports require an explicitly registered academic period and read-only source files; the period is not inferred from filenames or the current date. For example, an isolated local period can be created with:

```sh
npm run db:period:local -- --academic-period 2026-2027 --display-name 2026/2027 --starts-on 2026-08-01 --ends-on 2027-07-31
```

Local `import:*:local` commands provide dry-run, promotion, status and rollback operations. A dry-run does not change the runtime's current version. Price/schedule defaults refer to ignored local reference files, which are not supplied by a clean clone. Access and workbook inputs require explicit source paths; PlusBText is published before dependent Access data.

See [data sources](docs/operations/DATA_SOURCES.md) and [the import pipeline](docs/operations/IMPORT_PIPELINE.md) before using these tools. Real source databases and client workbooks are private inputs, not fixtures. Use the nonexecuting allowlisted parsers; do not open them through Office automation or execute embedded VBA. Generated imports, exports and protected operational evidence stay outside Git.

## Configuration and deployment

| File | Purpose |
| --- | --- |
| `wrangler.local.toml` | Local D1/R2 development bindings and restricted feature defaults |
| `wrangler.e2e.toml` | Synthetic test runtime, used by the E2E harness |
| `wrangler.adapter.toml` | Build output configuration, not a deployment target |
| `wrangler.example.toml` | Full portal deployment shape with resource/secret placeholders |
| `.dev.vars.example` | Local secret placeholders only |
| `deploy/trial-intake/wrangler.example.jsonc` | Separate intake deployment shape, initially contained/disabled |

The tracked templates contain no deployable resource identity or production credentials. A public schedule-source URL or an approved organization sender is configuration context, not a secret. Real deployment configuration and target evidence are ignored files.

`src/worker.ts` wraps the generated SvelteKit Worker and supplies request handling, scheduled jobs and the aggregate health endpoint. `npm run build` creates local deployment artifacts; `npm run deploy` changes a remote Worker and requires the project's explicit release procedure. Do not deploy a checked-in example directly or infer deployment authorization from a saved historical checkpoint.

Use [the deployment runbook](docs/operations/PRODUCTION_DEPLOYMENT.md), [the trial-intake deployment notes](deploy/trial-intake/README.md), [production readiness](docs/operations/PRODUCTION_READINESS.md), and [recovery procedures](docs/operations/DISASTER_RECOVERY.md) for the relevant mode. The official website, provider sends and production data remain separate operational scopes.

## Checks

For documentation-only changes:

```sh
npm run docs:check
npm run release:scan
git diff --check
```

`docs:check` validates local links, documented commands and the Stage 13 Git/evidence continuity contract. `release:scan` inspects current tracked/release files for prohibited artifacts and selected high-confidence secret/PII patterns; it is not a full Git-history audit.

Runtime changes use targeted Vitest/Playwright checks according to [AGENTS.md](AGENTS.md) and [the test plan](docs/implementation/TEST_PLAN.md). The intake release set is `npm run test:intake-release`; full portal verification and deployment have their own gates. Do not substitute an intake-only run for full portal acceptance or rerun the entire suite for a README edit.

## Project map

- `src/routes/`: public, parent and administrator routes.
- `src/lib/server/`: portal services, authorization, data access, imports, providers and operations.
- `src/lib/trial-intake/`: limited intake implementation.
- `migrations/`: ordered D1 schema migrations.
- `scripts/`: local development, documentation/release checks and explicit operational tools.
- `tests/`: unit, integration and browser coverage with synthetic data.
- `deploy/trial-intake/`: intake deployment template and instructions.
- `integrations/schedule-exporter/`: source-export integration for schedule links.
- `docs/`: canonical requirements, architecture, domain rules, runbooks and checkpoints, mostly in Russian.
- `references/`: sanitized source descriptions; operational source files are excluded.

Start with [the documentation map](docs/README.md), [MVP specification](docs/spec/MVP_SPEC.md) and [product decisions](docs/spec/OPEN_QUESTIONS.md). For continuing deployment work, read the top of the active checkpoint before consulting historical handoff entries.
## Repository maintenance verification

On 5 October 2026, dependency installation with `npm ci --no-audit --no-fund`, `npm run docs:check`, `npm run release:scan` and `git diff --check` passed in an isolated checkout. The documentation check included Stage 13 Git/evidence continuity. Configuration templates were inspected and retained unchanged.

This documentation update did not run the runtime or browser suites, build/deploy the Worker, migrate a database, log into the application, send provider messages, or verify the current live service. Historical deployment evidence remains historical evidence.
