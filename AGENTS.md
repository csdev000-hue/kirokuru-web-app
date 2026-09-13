Repository rootへ以下の方針を記載する。

# AI Project Manager - Codex Instructions

## Project

Meeting → Transcript → AI Minutes → Human Review
→ AI Ticket Candidate → Human Review → Ticket → Kanban

## Source of truth

Read documents under `docs/` before implementation.

Priority:

1. Current phase specification
2. Security design
3. API detailed design
4. DB design
5. AI Prompt / JSON Schema design
6. Screen detailed design
7. Basic design
8. Requirements

Do not invent requirements when the documents already define them.

## Technology

- Next.js App Router
- TypeScript strict
- root `app/`
- Auth.js
- Neon PostgreSQL
- Drizzle ORM
- Zod
- Amazon Bedrock
- Amazon S3
- LiveKit
- Vitest
- Testing Library
- Playwright
- GitHub Actions
- Vercel

## Architecture rules

Browser must not directly access:

- PostgreSQL
- Bedrock
- AWS credentials
- LiveKit API Secret

Allowed direct browser access:

- S3 only through short-lived server-authorized presigned URLs
- LiveKit only with short-lived server-generated participant tokens

## Security

- Organization is the tenant boundary.
- Authorization is always enforced server-side.
- Never trust client role, organizationId, projectId or ownership fields.
- Prevent IDOR.
- Prevent mass assignment.
- AI output is untrusted input.
- Validate AI output with Zod/JSON Schema and business validation.
- AI must never directly create a formal Ticket.
- Human review is mandatory for Minutes and Ticket Candidates.
- Never expose secrets in logs, responses or client bundles.
- Do not use `dangerouslySetInnerHTML`.
- Do not concatenate raw SQL from user input.

## Implementation

Implement only the requested phase.

Do not implement future phases unless strictly required by the current phase.

Reuse existing:
- permissions
- services
- validators
- error handling
- audit
- logging

Keep Route Handlers thin.

Prefer:
Route → validation → authorization → service → DB/provider.

Do not disable TypeScript, ESLint or validation just to make code compile.

## Database

All schema changes must use Drizzle migrations.

Never manually change the database without a migration.

Never run migrations against Production.

## Production safety

Do not:

- modify Production
- deploy Production
- change Production secrets
- connect test code to Production DB
- use Production S3 for tests
- use Production LiveKit for tests

## Required checks

After implementation run:

npm run lint
npm run typecheck
npm run test:run
npm run build

When configured also run:

npm run test:integration
npm run test:security
npm run test:e2e

Do not report the phase complete when required checks fail.

## Completion report

Report:

1. Implementation summary
2. Changed files
3. Database migrations
4. Tests
5. Command results
6. Security checks
7. Unresolved issues
8. Next phase handoff
