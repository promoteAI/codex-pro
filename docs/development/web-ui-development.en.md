# Codex Pro Frontend Development

Frontend development guide for Codex Pro.

---

## Tech Stack

- React 19, TypeScript 5.7, Vite 6
- Tailwind CSS 4, Zustand 5, React Router 8
- i18next, Recharts, @dnd-kit
- Vitest 3 + Testing Library

## Setup

```bash
cd web
pnpm install --frozen-lockfile
pnpm dev    # Start dev server with HMR
```

Requires Node.js 24+ and pnpm 10+.

## Commands

```bash
pnpm dev          # Dev server
pnpm build        # Production build (tsc -b && vite build)
pnpm test --run   # Run tests
pnpm preview      # Preview build output
```

## Architecture

The Codex Pro frontend is a React SPA communicating with Gateway via:

- HTTP REST API: `/api/v1/*`
- WebSocket: `/ws` (Codex Pro management stream)

Dev proxy defaults to `http://127.0.0.1:58123`. If that port is unavailable
(e.g. a Windows Hyper-V excluded range), override in
`web/.env.development.local`:

```bash
CODEX_PRO_GATEWAY_ORIGIN=http://127.0.0.1:18789
```

Keep `gateway.port` in sync with that origin.

## Build Output

Built SPA goes to `web/dist/`, bundled into the wheel at `codex_pro/_bundled/web/index.html` by `hatch_build.py`.

Users trigger first build via `codex-pro web build`.

## Testing

```bash
pnpm test --run     # Single run
pnpm test           # Watch mode
```

Uses Vitest + @testing-library/react with jsdom environment.
