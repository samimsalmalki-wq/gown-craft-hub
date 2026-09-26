# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"مَعْمَل" (Dream Dress Studio): an operations system for a wedding-dress tailoring shop. It covers orders, production stages, staff and permissions, inventory, rentals, finance (a full GL) and WhatsApp reminders. The UI is Arabic, RTL (`<html lang="ar" dir="rtl">`) and mobile/iPad first. Keep all user-facing strings in Arabic.

The project is built and synced with **Lovable** (live: https://gown-craft-hub.lovable.app). Commits pushed to `main` sync back into the Lovable editor, so:
- Never force-push, rebase, amend or squash pushed commits. That rewrites the Lovable project history.
- Keep `main` in a working state.

## Commands

```sh
npm i              # or bun install (bun.lock + bunfig.toml present)
npm run dev        # vite dev
npm run build      # production build (nitro, Cloudflare target)
npm run build:dev  # development-mode build
npm run lint       # eslint . (includes prettier via eslint-plugin-prettier)
npm run format     # prettier --write .
npx tsc --noEmit   # typecheck (no script defined)
```

There is no test suite. Dev server runs on http://localhost:8080.

`bun.lock` is the canonical lockfile. If you install with npm, do not commit the generated `package-lock.json`.

`bunfig.toml` enforces a 24h minimum release age on packages. Ask the user before adding entries to `minimumReleaseAgeExcludes`.

## Stack

TanStack Start (React 19, file-based routing, SSR via nitro), TanStack Query, Supabase (Postgres, auth, storage), Tailwind v4, shadcn/ui (`src/components/ui`, new-york style), react-hook-form + zod, recharts, date-fns. Path alias: `@/*` → `src/*`. TS is very strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`). Index-signature access must use `obj["key"]`.

## Generated / do-not-edit files

- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which already bundles tanstackStart, react, tailwind, tsconfig paths, nitro and env injection. Do not add those plugins manually (duplicate plugins break the app).
- `src/routeTree.gen.ts` is regenerated from `src/routes/`.
- `src/integrations/supabase/*` (client, client.server, auth-attacher, auth-middleware, cron-auth, types.ts) is Lovable-generated. `types.ts` is the typed `Database` schema, and all domain types derive from it.
- `drizzle/schema.ts` is intentionally blank.

## Architecture

**Routing** (`src/routes/`, see `src/routes/README.md`): flat dot-named files, e.g. `finance.invoices.$invoiceId.tsx` → `/finance/invoices/:invoiceId`. Do not use Next.js/Remix conventions (`pages/`, `app/layout.tsx`). `__root.tsx` is the HTML shell and QueryClientProvider, and it invalidates router and queries on auth changes. `_authenticated/route.tsx` is a pathless layout with `ssr: false` that redirects to `/auth` if there is no Supabase user. All app screens live under it and wrap their content in `<AppShell title=…>` (sidebar nav, search, notifications, branch switcher).

**Data access is client-side Supabase + RLS.** There are essentially no server functions. Screens call React Query hooks from `src/lib/*-data.ts` (`data.ts` for orders/stages/staff/settings catalogs, `finance-data.ts`, `inventory-data.ts`, `models-data.ts`, `whatsapp-data.ts`). The hooks query `supabase` from `@/integrations/supabase/client` directly and invalidate by query key. Pure helpers, labels and types live in the sibling non-`-data` modules (`atelier.ts`, `finance.ts`, `inventory.ts`, `whatsapp.ts`). New features should follow this split.
- `supabaseAdmin` (`client.server.ts`, service role, bypasses RLS) is for server code only. Import it dynamically inside handlers or from `*.server.ts` files, never from route files. Server functions must use `requireSupabaseAuth` for RLS-scoped access. `src/start.ts` registers `attachSupabaseAuth` and CSRF middleware globally.

**Authorization** lives in two layers:
- DB: RLS policies call `private.can(auth.uid(), '<permission>')`. Permissions come from `user_permissions` plus `role_permissions` (via `profiles.role_id`). Only admin bypasses them; there is no implicit supervisor access (migration 0018). The `app_role` enum (admin, supervisor, staff, cs) only decides team membership (`is_team`/`is_staff`). Custom catalog roles (accountant, warehouse keepers…) map to enum `staff`.
- Scopes on top of permissions: branch (`profiles.branch_id`, `branches.all`), stages (`profiles.allowed_stages`, for `stages.manage`) and material categories (`roles.material_categories`, for inventory). Order visibility is `private.order_visible`: without `orders.view_all` a user sees only orders they created or have a stage assigned on.
- UI: `useCurrentAccount()` (`src/hooks/useSession.ts`) exposes `can(permission)`, `canManageStage(stage)` and `canCategory(category)`. Never gate on role names. Nav items in `AppShell` use `anyOf` permission lists. Permission keys, labels and groups live in `PERMISSIONS` (`atelier.ts`). When adding a permission, update both the RLS policy and the UI check.

**Live catalogs**: stages, roles, item types and material categories have hard-coded defaults in `atelier.ts`/`inventory.ts`. They are overwritten at runtime from DB tables via `setStageCatalog`/`setRoleCatalog`/… when the corresponding hooks load (`AppShell` calls `useStageTemplates()`). Stage keys are free-form strings because admins can create custom stages. Always use `stageLabel()`/`roleLabel()` rather than the static constants.

**Branches** (`src/lib/branches.ts`): multi-branch, with one branch flagged `is_warehouse` (the central warehouse). `useBranchScope()` returns the selected branch (admin/`branches.all` users switch it, stored in localStorage; others are pinned to `profile.branch_id`). Use `opsBranchId`/`opsWriteBranchId` for orders and finance (the warehouse is not a sales branch, so it falls back to "all"). Use `branchId`/`writeBranchId` for stock. Query helpers apply the filter via `onBranch()` in `data.ts`.

**Domain notes**
- Orders have kinds `own` (made to own), `rental` (made for rental) and `rental_stock` (renting an existing dress, which does not create revenue the same way). Each order has per-order `order_stages`, and `is_required` controls which stages apply.
- Finance is a double-entry GL (`gl_accounts`, `journal_entries`/`journal_lines`) fed by payments, invoices and expenses with cash boxes, mostly via DB triggers/RPCs in migrations. The UI covers ledger, trial balance and reports.
- Files and images go in the Supabase storage bucket `order-files`, read via signed URLs (`useSignedUrls`).
- WhatsApp is template-based `wa.me` links (`src/lib/whatsapp.ts`). Phones are normalized to the 966 country code.

## Database migrations

- `supabase/migrations/` holds the initial Lovable-generated schema (Sept 2026).
- `drizzle/migrations/NNNN_name.sql` holds all later changes as hand-written SQL, registered in `drizzle/migrations/meta/_journal.json` (and a snapshot per entry). `drizzle.config.ts` reads `LOVABLE_DB_MIGRATION_URL`. New migrations go here with the next number. Include `grant`s to `authenticated`/`service_role`, `enable row level security` and `private.can(...)` policies, following existing files.
- After schema changes, `src/integrations/supabase/types.ts` must be regenerated (Lovable does this) so the typed hooks compile.

`.lovable/plan/*.md` (Arabic, dated) are Lovable's feature plans. They are useful background on why features work the way they do.
