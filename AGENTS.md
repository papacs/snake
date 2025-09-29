# Repository Guidelines

## Project Structure & Module Organization
- `app/` hosts Next.js routes, UI, and REST handlers under `app/api/{initdb,rooms,scores}`.
- `lib/db.ts` centralizes Postgres access; `public/` exposes static assets; `app/globals.css` wires Tailwind.
- `server/` contains the Socket.IO game loop (TypeScript); build output lands in `server/dist`.

## Build, Test, and Development Commands
- Run `npm install` once, then `npm run dev` for the client (Turbopack on :3000).
- Ship production bundles with `npm run build` and `npm run start`.
- Lint via `npm run lint` before committing.
- Inside `server/`, run `npm install`, then `npm run dev` for hot reload or `npm run build && npm run start` to serve compiled output.

## Coding Style & Naming Conventions
- Stick to TypeScript; components use PascalCase, utilities/hooks use camelCase.
- Follow `eslint-config-next`; resolve lint warnings prior to PRs.
- Default to two-space indentation and double quotes, mirroring `app/page.tsx`.
- Local styles live alongside components; cross-cutting tweaks stay in `app/globals.css`.

## Testing Guidelines
- No automated suite yet; smoke test the client (`npm run dev`) and realtime server (`server` `npm run dev`) before merging.
- When introducing tests, reach for Jest or Vitest, name files `*.test.ts[x]`, and co-locate them in `__tests__` folders near the code.
- Document manual QA steps and edge cases in PR descriptions until automated coverage lands.

## Commit & Pull Request Guidelines
- Recent history mixes numeric and descriptive commits—prefer concise, imperative subjects (e.g., `feat: add room ready toggle`).
- Keep schema or migration updates in focused commits and note changes touching `lib/db.ts`.
- PRs should include a summary, impacted areas, manual test evidence, and UI screenshots when applicable.
- Link issues, flag new env vars, and list follow-up work if scope is limited.

## Security & Configuration Tips
- Move hard-coded secrets (e.g., Postgres URL in `lib/db.ts`) into `.env.local` or `server/.env` and document required variables.
- Exclude secrets via `.gitignore` and share sample values in `.env.example` files when adding new configuration.
