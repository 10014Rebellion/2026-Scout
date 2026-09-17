# 2026-Scout

Team 10014's scouting app for the FRC 2026 REBUILT season.

## Stack

Next.js (App Router) + React + TypeScript, Tailwind CSS v4, shadcn/ui (Base UI, `base-nova` style), Convex (backend/data), Zustand (ephemeral UI state), next-themes (light/dark/system), Sonner (toasts). Package manager: Bun.

## Getting started (clean checkout)

```bash
bun install
bunx convex dev   # first run: complete the browser login/link prompt if asked
bun run dev
```

Then open http://localhost:3000. `bunx convex dev` needs to stay running alongside `bun run dev` whenever you're changing anything under `convex/`, since it pushes function changes and regenerates `convex/_generated/`.

## Scripts

- `bun run dev` — start the Next.js dev server
- `bun run build` — production build
- `bun run lint` — ESLint
- `bun run typecheck` — `tsc --noEmit`

## Adding shadcn components

```bash
bunx shadcn@latest add <component>
```
