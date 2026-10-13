# Production validation

Reviewed on 2026-10-14. Passing the build checks is a release prerequisite, not proof that every production failure mode is covered.

## Repeatable release checks

Use Node 24 and pnpm 10.33.0, matching CI and `packageManager`.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm audit:prod
pnpm audit:deps
```

`check` generates Prisma, runs read-only lint and strict type checks, runs the API and D1 tests, then builds the dashboard, NestJS API and Worker. The Worker build uses `wrangler deploy --dry-run`; it does not deploy. CI also applies the Postgres migrations to an empty database and checks for schema drift. CI rejects high and critical advisories in production and build dependencies. Both CI jobs have bounded run times and read-only repository permissions.

Lint fails on backend warnings and errors. File rewrites require `lint:fix` or `format`. Jest uses a separate CommonJS TypeScript configuration because the API emits CommonJS under NodeNext; this keeps type checking enabled without hybrid-module warnings.

The frontend bundles licensed Latin WOFF2 fonts. It does not contact Google Fonts during builds. Turborepo includes local env files in dashboard build inputs and the shared backend source in Worker build, lint, typecheck and test inputs. This prevents stale bundles or checks when those files change.

## Results of this review

- Frozen-lockfile installation passed.
- API lint and type checks for all workspaces passed.
- API tests: 85 passed across 10 suites.
- Worker tests: 10 passed against a local D1 built from the migration history.
- Production builds passed for all three runtimes.
- Production dependency audit: no known advisories at review time.
- Full dependency audit: no high or critical advisories. One moderate advisory remains in Jest's `sprintf-js` dependency, which has no published fix. See [the advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). It is not a production dependency; do not accept untrusted formatting templates in build tooling.
- Built home and sign-in pages rendered correctly with local fonts and no em dashes. Theme switching worked with a click and keyboard activation. Navigation from the home page to sign-in passed.

Security overrides are scoped to affected transitive versions in `pnpm-workspace.yaml`. The Prisma config override was checked by generating Prisma and building the NestJS API. Review and remove overrides when the parent packages ship the fixes.

Applied SQL migration files and generated Worker declarations retain their original punctuation. The Prisma schema edit changes a comment only; no database shape or migration changes are involved.

## Remaining launch work

The existing README limitations still apply. Before opening an unrestricted public service:

- Restrict outbound HTTP and polling requests to an explicit network policy, including redirects and resolved private addresses. Both runtimes need equivalent behavior.
- Add request-rate protection to public auth endpoints in both runtimes. Execution admission limits do not protect auth traffic.
- Replace browser-local refresh-token storage with a same-site cookie or BFF design when the deployment domains support it.
- Isolate credentials per user before offering user-owned email or Telegram connections.
- Add automated browser coverage for Google handoff, workflow creation and editing, a real run, failed-run recovery, and session refresh. This review did not complete live OAuth or exercise a real external integration.
- Verify backups and restore procedures, production alerts and resource budgets against the actual deployment. Local builds cannot validate them.

The Postgres migration-drift job remains in CI; it was not run locally in this review. No production deployment, migration, commit or push was performed. Run only one polling runtime in production.
