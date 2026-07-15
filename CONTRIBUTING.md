# Contributing to FlowState

Thank you for taking the time to contribute! This document explains how to get the project running locally and what to keep in mind when opening a pull request.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Issues](#reporting-issues)
- [Security Vulnerabilities](#security-vulnerabilities)

---

## Getting Started

1. **Fork** the repository on GitHub and clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/flowstate.git
   cd flowstate
   pnpm install
   ```

   This is a pnpm + Turborepo monorepo — the API lives in `backend/`, the web
   dashboard in `frontend/`, shared types in `packages/api-types`.

2. **Copy the environment file** and fill in the required values:

   ```bash
   cp .env.example .env
   ```

   At minimum you need `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`. Everything else is optional.

3. **Spin up the local infrastructure:**

   ```bash
   docker compose up -d
   ```

4. **Run migrations and start the dev servers:**

   ```bash
   pnpm --filter api prisma:migrate
   pnpm dev            # API + web dashboard, or dev:api / dev:web for one
   ```

   The API will be at `http://localhost:3000` (Swagger UI at `/api/docs`) and the dashboard at `http://localhost:5173`.

---

## Development Workflow

- Work on a feature branch: `git checkout -b feat/your-feature-name`
- Commit messages should be descriptive and in the imperative mood: `Add HTTP timeout to polling worker`, not `added timeout`.
- If your change is user-facing (new action type, new endpoint, new env var), update the relevant section in `README.md`.

### Adding a New Action Type

1. Create a new executor in `backend/src/actions/executors/` implementing `IActionExecutor`.
2. Register it in `ActionExecutorService`'s constructor map in `backend/src/actions/action-executor.service.ts`.
3. Add the new type to the **Action Types** table in `README.md`.
4. If the executor requires a new env var, add it to `.env.example` with a comment.
5. Add its config type to `packages/api-types` and a form + metadata entry in `frontend/src/features/flow/action-meta.ts` so the dashboard can configure it.

---

## Code Style

This project uses ESLint and Prettier. Before pushing, run:

```bash
pnpm lint
pnpm --filter api format
```

Both commands auto-fix most issues. The CI pipeline will reject code that fails linting.

---

## Submitting a Pull Request

1. Make sure your branch is up to date with `main`:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. Open a PR with a clear title and description covering:
   - **What** the change does
   - **Why** it's needed
   - Any **known limitations** or follow-up work

3. Link any related issues using GitHub's `Closes #123` keyword in the PR body.

PRs are reviewed on a best-effort basis. Small, focused changes are much easier to review than large, multi-concern ones.

---

## Reporting Issues

Use GitHub Issues. Please include:

- A clear description of the problem
- Steps to reproduce
- Expected vs. actual behaviour
- Your Node.js version, OS, and any relevant logs

---

## Security Vulnerabilities

**Do not open a public GitHub issue for security vulnerabilities.**

Please report them privately via GitHub's [Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) feature on this repository. We will acknowledge the report within 48 hours and provide a fix timeline.
