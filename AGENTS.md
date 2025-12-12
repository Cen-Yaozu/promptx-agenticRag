# Repository Guidelines

## Project Structure & Module Organization
- `server/`: Express API with Prisma (`prisma/` schema, `endpoints/`, `services/`, `jobs/`, `swagger/`) and Jest specs in `__tests__/`.
- `collector/`: Document ingestion pipeline (`processSingleFile/`, `processLink/`, `utils/`) that normalizes uploads for the API.
- `frontend/`: Vite + React UI (`src/components`, `pages`, `contexts`, `hooks`, `locales`). Static media in `frontend/src/media`.
- `doc/` and `docs/`: Developer and user guides; `cloud-deployments/` holds infra generators; `docker/` and `docker-compose.*.yml` wire Qdrant and supporting services.
- Local data and caches live under `storage/` and `qdrant-data/`; keep these out of commits.

## Build, Test, and Development Commands
- `yarn setup`: Install all package dependencies, copy `.env` examples for each service, run Prisma generate/migrate/seed. Requires Node 18+.
- `yarn dev:server`, `yarn dev:collector`, `yarn dev:frontend`: Run each service in watch mode; or `yarn dev:all` to start them concurrently.
- `yarn prod:frontend`, `yarn prod:server`, `yarn prod:collector`: Production builds/starts for individual services; `yarn prod:all` runs server + collector together.
- `yarn lint`: Prettier format for server, frontend, and collector.
- `yarn test`: Jest suite (primarily server). Add focused runs with `npx jest path/to/file.test.js`.

## Coding Style & Naming Conventions
- Prettier enforced: 2-space indent, LF endings, 80-char width, semicolons, double quotes, trailing commas (ES5). Run `yarn lint` before commits.
- JavaScript/JSX parsed with Hermes + Flow plugin; follow ESLint warnings when present.
- Components/contexts in `frontend/src` use PascalCase filenames; hooks use the `useX` prefix; utilities and endpoints favor kebab-case files.
- Keep API handlers thin and move logic into `services/`; reuse shared helpers under `server/utils/`.

## Testing Guidelines
- Tests live in `server/__tests__` (`*.test.js`). Mirror new endpoints/services with adjacent specs and mock external providers.
- Aim to cover input validation, Prisma queries, and vector pipeline logic; include regression cases for reported bugs.
- Run `yarn test` before PRs; add screenshots or logs for manual front-end flows when automated coverage is impractical.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`). Example: `feat: add workspace-level chat limits`.
- PRs should include: scope summary, linked issue/reference, testing notes (`yarn test`, `yarn lint`, manual steps), and UI screenshots/GIFs for visual changes.
- Keep diffs scoped per service (server/collector/frontend) and note any schema or env variable changes in the description.

## Security & Configuration Tips
- Copy env templates with `yarn setup:envs`; never commit populated `.env*` files. Document any new keys in the corresponding `*.env.example`.
- Secrets for AI providers, vector DB, and storage live in service-specific envs (`server/.env.development`, `collector/.env`, `frontend/.env`).
- For dockerized runs, keep `docker/.env` and volume paths (`storage/`, `qdrant-data/`) consistent across teammates to avoid data drift.
