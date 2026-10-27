# Session Summary — pospro-v2 (saved Oct 26, 2026)

## Objective
- Complete/port all features from the original vanilla-JS POS at `E:\Projects\POS\pospro` into `E:\Projects\POS\pospro-v2`, fix broken features/errors, and finish undone work.
- This session: after the error/UX audit (4 research agents), **analyzed the findings and fixed all high/medium issues**, then ran full verification. Everything passed.

## Important Details
- Monorepo (Turborepo/npm workspaces): `packages/core`, `packages/database`, `packages/backend` (Express, port 3000, SQLite), `packages/frontend` (React 18 + Vite + Tailwind, port 5173). `VITE_DATA_MODE=local` (browser localStorage default); API mode is a documented deferred limitation (snake_case mismatch in `sqlite-provider.ts`).
- Concurrent `freebuff` process (PID 11864) may edit files/run Vite on 5173/5174; avoid killing processes. NOT a git repo — no version-control safety net.
- Local auth: `admin@pos.com` / `admin123`; storage keys `ami-pos:data:*`, `ami-pos:local-session`, `ami-pos:data:settings`, `ami-pos:cash-summaries` (reads legacy `cashSummaries`), `ami-pos:barcode-history`, zustand auth persist key `ami-pos-auth`.
- UI kit facts: `Button` has NO `icon` prop (variants: primary/secondary/outline/ghost/danger/success); `Badge` variants: default/success/warning/danger/info/outline; `Pagination` component; `Modal` has `data-enter-nav` scope; `ConfirmDialog`/`AlertDialog` now pass footer via Modal `footer` prop (not `slot="footer"`).
- `localStorageClient` internals: `paginationFor` cap 2000; `matchesFilters` supports search/categoryId/**category**/isActive/status/paymentType/dateFrom/dateTo/customerId/productId/lowStock; `nextInvoiceNo` dedupes against existing invoice numbers; `validateSaleStock(items, status)` validates qty>0 and running per-product stock; `completeSaleRecord(id, payment?)`; refund flow clamps `refundAmount` and aggregates restock per product; cancel aggregates per product; ledger excludes Held/Cancelled with separate Refund entries; dashboard/sales stats exclude Held and use item-level profit; loans `update` recomputes balance and `addPayment` rejects over-balance (`failure()` throws — never); purchase `receive` clamps per line and only sets costPrice when fully received; purchase `delete` reverts received stock.

## Work State
### Completed (this session — all audit fixes)
- **SalesPage.tsx**: date-filter changes reset `currentPage` to 1; Pagination renders whenever `pagination.total > 0`; refund client-side validation (amount > 0 and ≤ `grandTotal − refundAmount`, with error toasts); held-bill resume passes `{ id, amountPaid: grandTotal }` and completeMutation calls `apiClient.sales.complete(id, { amountPaid })`; CSV export now loops over pagination pages (limit 500 per page) instead of a single truncated fetch.
- **PurchasesPage.tsx**: edit-form status Select reduced to `Ordered` only (no manual Received/Cancelled via edit); Pagination always rendered when total > 0; receiveMutation clears `selectedPurchase` on success so the detail modal can't show stale state.
- **AnalysisPage.tsx**: excludes Held/Unpaid sales (filter now `['Cancelled','Refunded','Held','Unpaid']`); employee filter matches by `salesCode === cashierCode` OR falls back to employee name (legacy sales lack `cashierCode`); group key keeps `itemCode_salesCode` but aggregates distinct companies (`companies: Set` → count) and shows `Multiple (N)` in Company column; totals footer is now a 9-column grid (`grid-cols-[110px_1fr_130px_130px_110px_160px_90px_110px_110px]`) aligned with table columns.
- **LeaderboardPage.tsx**: excludes Held/Unpaid; employee grouping keyed by `cashierCode || cashierName` with label enrichment from the employees list (also matches legacy sales stored under plain name); podium renders with 1–2 entries (top3.length > 0), not just 3.
- **SummaryPage.tsx**: `salesByDate` keys use `toLocaleDateString('en-CA')` (no UTC bucketing bug); auto-carry of yesterday's balance happens once in a day-record initialization effect (guarded by record existence, functional setState — no loop); `updateDay` no longer auto-carries on every patch so balances are fully editable; new "Cash Balances" Card with editable Yesterday/Today balance Inputs (fixes the critical "todayBalance never settable" UX bug); addTransaction/removeTransaction build from functional setState (no closure race); import validates entries (ISO date key, trans arrays, numeric balances) and merges only valid days; auto-save debounced 600ms; "New Day" renamed "Go to Today".
- **BarcodePage.tsx**: XSS fixed — `escapeHtml(barcodeCode)` in the invalid-code fallback of `generateBarcodeSvg`; `@page` size now derived from the selected sticker size (`(previewDimensions.width + 0.4)cm x (previewDimensions.height + 0.4)cm`, margin 2mm) so roll printers work for every size; settings shopName prefill guarded by `shopNameTouchedRef` so a late settings load can't overwrite manual edits; quantity uses `quantityText` string state (clearable while typing) with derived clamped `quantity` and onBlur clamp; history save wrapped in try/catch with error toast.
- **SettingsPage.tsx**: both Theme selects use `onChange={(e) => { void setValue('theme', e.target.value as SettingsForm['theme']); applyTheme(e.target.value); }}` — RHF value now updates (was broken by register-on being overridden).
- **ProductsPage.tsx**: new `['products','all-kpis']` query (unfiltered, limit 2000); "Products"/"Low Stock"/"Stock Value" KPIs and lowStockCount/inventoryValue computed from the unfiltered list (were filtered/page-bound).
- **DashboardPage.tsx**: `<a href="/sales">` replaced with `<Link to="/sales">` (react-router import added).
- **NotFoundPage.tsx**: rewritten to use the `Button` component (had non-existent `btn btn-primary` classes).
- **Modal.tsx**: topmost-only Escape close via module-level `openModals` stack + `useId()` per instance; unique `titleId`/`descriptionId` (useId) replacing hardcoded ids; body scroll lock on open (restores previous overflow); focus management — focuses first field/button on open, restores previously focused element on close; ConfirmDialog/AlertDialog footers moved to the Modal `footer` prop (removed bogus `slot="footer"`).
- **Table.tsx**: `text-${align}` dynamic Tailwind classes (JIT wouldn't compile) replaced by `ALIGN_CLASS`/`HEADER_JUSTIFY` maps (header flex also justify-center/end for center/right); clickable rows ignore clicks originating inside `button, a, input, select` (row actions no longer double-trigger onRowClick).
- **Toaster.tsx**: `ToastItem` takes stable `removeToast` and computes `onClose` with useCallback keyed on `toast.id` — auto-dismiss timer no longer resets on every re-render.
- **api.ts**: rejections are now real `ApiError` (extends Error, has code/status/details); 401 refresh is single-flight (`refreshPromise` module var, shared by concurrent 401s); refreshed tokens are synced into the zustand auth store via `useAuthStore.setState(...)` and `clearAuth()` on refresh failure; `sales.complete(id, data?)` now POSTs body `{ amountPaid }` etc.
- **WebSocketProvider.tsx**: stale `subscriptions` closure on reconnect fixed via `subscriptionsRef` mirror.
- **useEnterNavigation.ts**: Enter no longer acts when origin is a SELECT (native dropdown behavior preserved); buttons inside `<table>` excluded as Enter click-targets; FIELD_SELECTOR also excludes buttons whose aria-label suggests cancel/close/delete/decrease/increase as targets.
- **localStorageClient.ts**: type fixes — refunded-item push cast `as any`, loans `update` success payload cast `as AnyRecord`, removed duplicate `totalPayable` declaration in `addPayment`.

### Verification (all passing)
- `npm run typecheck` — 6/6 tasks OK (had to fix SettingsPage setValue union + 3 localStorageClient type errors first).
- `npm run build` — all 4 packages OK.
- `npm run test:local` (packages/frontend) — 34/34 smoke checks.
- Headless Chrome CDP script `C:\Users\PC\AppData\Local\Temp\opencode\ui-smoke.mjs` — 19/19 routes render (login + dashboard, pos, products, categories, inventory, suppliers, purchases, sales, customers, employees, expenses, cheques, loans, reports, analysis, barcode, leaderboard, summary, settings).

### Completed (this session — errors.md fixes, original project `E:\Projects\POS\pospro\js\`)
- Audit in `E:\Projects\POS\pospro-v2\errors.md` analyzed and every high/medium item fixed in the ORIGINAL vanilla project (those scripts only exist there):
  - `storage-service.js`: shape-aware stringify fallback, quota auto-recovery (trim audit logs + stale safety backup, retry once) before alerting, per-key legacy migration.
  - `msaccess-handler.js`: binary MDB magic-byte detection with actionable message; auto-backup failures recorded (`msaccess_last_backup_error`) + `msaccess:autobackup-failed/success` events.
  - `qr-backup.js`: `importChunk` returns result objects, corrupt-payload detection + buffer reset, callers alert friendly.
  - `universal-scanner.js`: `applyInvoiceCoreToSystem` returns `{applied, error}` instead of throwing; chunk routing try/catch.
  - `receipt-printing.js`: missing QRCode/JsBarcode → friendly alert + graceful abort.
  - `pos-api.js`: invalid sync response ≠ offline (protect local data, distinct log/toast); flush failures toast + queue kept; queue capped at 500.
  - `supabase-sync.js`: offline guard in `init()`.
  - `sync-manager.js`: Supabase branches try/catch with local fallback.
  - NEW `js/error-handler.js` (loaded first in index.html): global error/unhandledrejection handler, rate-limited toast, rolling 50-entry log (`window.ErrorLog`).
- All 9 files pass `node --check`; behavioral smoke tests for storage/QR/scanner paths pass.
- `errors.md` updated with the resolution log.

### In Progress (shared-.db / LAN multi-PC feature — ACTIVE, user-approved architecture: one server PC + browsers)
- **Implementation plan (final)**: (1) camelize OUTGOING at `res.json` boundary — zero route rewrites; (2) write-path key mapping INSIDE sqlite-provider via cached `PRAGMA table_info` column map (unknown keys dropped) — no incoming-body middleware so auth camelCase (`refreshToken`, `currentPassword`) stays intact; (3) map filter/sort fields through column map; (4) pragmas try/catch (WAL may fail on SMB/UNC); (5) new `routes/database.ts`: GET info (path/size/exists), POST test-path, POST switch-path (runtime config `packages/backend/data/runtime-config.json` wins over env), POST backup (`PRAGMA wal_checkpoint(TRUNCATE)` then copy file); admin-only; (6) frontend `api.ts` database service + SettingsPage "Data File" section (api mode only); (7) setup docs.
- **DONE (typechecked ✅)**:
  - NEW `packages/backend/src/middleware/casing.ts` — `camelizeResponse` patches `res.json` → camelizes outgoing `/api` payloads (keys only, values untouched). Wired BEFORE `app.use('/api', routes)` in `packages/backend/src/index.ts` (order matters: patch must precede route responses).
  - `packages/database/src/providers/sqlite-provider.ts` — camelCase↔snake_case machinery: `columnCache` (per-table `PRAGMA table_info`: `columns` Set + `camelToCol` alias map), `toColumn`/`toColumnOrKeep`/`mapForWrite`; `buildWhereClause(filters, table)` + `buildOrderBy(sorts, table)` map field names; `create/createMany/update/updateMany` map write keys onto real columns (unknown keys dropped), respect provided `created_at/updated_at`; `createMany` re-prepares per field-set signature, returns real ids; NEW private `runCreate/runUpdate/runFindById/runFindMany(conn,…)`; `transaction(callback)` now passes a **provider-like tx adapter** (findMany/findFirst/findById/create/update/delete/softDelete/restore/query/execute bound to the open conn) — routes/sales.ts already called `tx.create` etc. which previously was a raw connection without those methods; READ path camelizes rows (`camelizeRows`/`camelizeKey`/`camelizeValue` at top of file) because routes ALREADY expect camelCase rows (`sale.invoiceNo`, `product.itemCode`); pool pragmas wrapped in try/catch (WAL may fail on SMB/UNC).
  - `packages/database/.../sqlite-provider.ts` default settings keys now camelCase (`shopName`, `taxRate`, …) to match routes/settings.ts reads (`settings.shopName`).
  - `packages/backend/src/routes/settings.ts` — `parseSettingValue` added: JSON-string values are parsed on read ('"AMi POS"' → 'AMi POS', '0' → 0, 'false' → false).
  - Discovery: ALL snake_case usage in routes is inside raw SQL strings only (rawExecute) — no snake_case property accesses, so camelize-on-read is safe. Stats raw-SQL aliases (`total_revenue` etc.) are camelized by the res.json middleware.
  - `@pospro/database` + `@pospro/backend` typecheck both PASS after these changes.
- **TODO (remaining)**: `routes/database.ts` + runtime-config + wire into routes/index.ts; backend build + live smoke (login, product camelCase roundtrip, path switch, settings parse); frontend api.ts database service + SettingsPage "Data File" section; network setup docs.

### Blocked / Deferred
- API mode (`VITE_DATA_MODE=api`) unreliable until camelCase↔snake_case mapping fixed in `sqlite-provider.ts` — intentionally deferred; local mode is default.
- No formal E2E tooling; rely on CDP temp script + manual checks.

## Next Move
1. Optional polish from audit: consider raising any remaining `limit: 500` list calls to 2000; add refund-clamp/oversell checks to `scripts/smoke-local.mjs`.
2. If user wants API mode: fix camelCase↔snake_case mapping in `packages/backend` sqlite-provider, then set `VITE_DATA_MODE=api`.
3. If the freebuff process made further edits, re-run `npm run typecheck` + smoke before continuing.
4. Consider initializing git for a safety net (not a repo yet) — only if user asks.
5. errors.md items "11/12" (expected validation errors + console warnings) were deliberately left as-is — they are features, not bugs.
6. **plan.txt**: never found; user CONFIRMED to proceed with his description + "One server PC + browsers" architecture (see "In Progress" section for the full plan and progress).
7. **PROCESS RULE (user instruction)**: update `SESSION-SUMMARY.md` after EVERY move in this session.
   - User's described intent for plan.txt: user picks a path; the app creates a `.db` file (containing ALL data) at that path; if that path is on a network shared disk, ALL PCs on that network shared drive use the same `.db` — i.e., central SQLite DB on a LAN share, multi-terminal POS. Needs user confirmation before building.
   - **User CONFIRMED (via question tool)**: (a) plan.txt unavailable → "use my desc and add wanted features"; (b) architecture = **One server PC + browsers** (server PC runs backend; other PCs connect via browser). Plan is now ACTIVE, no longer waiting.
8. **EXPLORATION RESULTS for shared-.db plan** (all verified this session):
   - Backend ALREADY has: `SQLITE_DB_PATH` env (default `./data/pos.db`), `DB_PROVIDER=sqlite`, `node:sqlite` driver (no better-sqlite3 toolchain needed), WAL mode + pragmas (`packages/database/src/providers/sqlite-provider.ts` `SQLiteConnectionPool` ctor), full 20+ table snake_case schema auto-created in `createSchema()`, `switchDatabaseProvider(newType, newConfig)` in `packages/backend/src/db/connection.ts`, HOST `0.0.0.0` default, production mode serves built frontend at `packages/backend` port 3000 (so LAN PCs can just open `http://serverpc:3000` — no CORS issue).
   - `remoteClient` in `packages/frontend/src/services/api.ts:142` already implements the FULL api surface (auth/products/categories/customers/suppliers/sales/purchases/expenses/cheques/loans/inventory/employees/settings/sync/stats) matching backend routes; `dataMode`/`isLocalStorageMode` from `VITE_DATA_MODE`; SettingsPage.tsx already shows mode badge.
   - **THE GAP = casing mismatch**: DB schema is snake_case (`item_code`, `grand_total`); frontend sends/expects camelCase. Routes read snake_case internally + build snake_case filters (`crud.ts` hardcoded `category_id`/`is_active`/`deleted`). Only 2 direct `req.body.x` reads in routes: `products.ts:289 req.body.itemCode`, `sales.ts:505 destructure items/paymentType/amountPaid/note` (camelCase, must stay).
   - **CHOSEN IMPLEMENTATION PLAN** (approved-by-context): (1) camelize OUTGOING at `res.json` boundary (new `middleware/casing.ts` wired in `backend/src/index.ts`) — route internals stay snake_case, zero route rewrites; (2) write-path key mapping INSIDE sqlite-provider `create/createMany/update/updateMany` via cached `PRAGMA table_info` column map (exact match first, then camelCase→snake_case; drop unknown keys so INSERT never fails) — no incoming-body middleware so auth camelCase (`refreshToken`, `currentPassword`) stays intact; (3) map filter/sort fields through column map; (4) wrap each PRAGMA in try/catch (WAL may fail on UNC/SMB); (5) new `routes/database.ts`: GET info (current path/size/exists), POST test-path, POST switch-path (runtime config JSON persisted in `packages/backend/data/runtime-config.json`, wins over env default), POST backup (`PRAGMA wal_checkpoint(TRUNCATE)` then copy file); admin-only; (6) frontend `api.ts` database service + SettingsPage "Data File" section (api mode only); (7) setup docs.

## Relevant Files
- `packages/frontend/src/services/localStorageClient.ts` — data layer (validation, refund/cancel aggregation, ledger, stats, loans, purchases, cap 2000, invoice dedupe, type fixes).
- `packages/frontend/src/services/api.ts` — ApiError, single-flight refresh, token sync, `sales.complete(id, data?)`.
- `packages/frontend/src/stores/authStore.ts` — zustand persist `ami-pos-auth`; `refreshAccessToken` in api.ts syncs into it.
- `packages/frontend/src/pages/SalesPage.tsx` — pagination/refund validation/complete-with-payment/export loop fixed.
- `packages/frontend/src/pages/POSPage.tsx` — fixed totals/held payload/a11y; `round2` helper; `autoPaid` state.
- `packages/frontend/src/pages/PurchasesPage.tsx`, `AnalysisPage.tsx`, `LeaderboardPage.tsx`, `SummaryPage.tsx`, `BarcodePage.tsx`, `SettingsPage.tsx`, `ProductsPage.tsx`, `DashboardPage.tsx`, `NotFoundPage.tsx` — all audit fixes applied.
- `packages/frontend/src/components/ui/Modal.tsx`, `Table.tsx`, `Toaster.tsx` — UI-kit fixes applied.
- `packages/frontend/src/hooks/useEnterNavigation.ts` — refinements applied.
- `packages/frontend/src/providers/WebSocketProvider.tsx` — stale-subscription fix applied.
- `packages/frontend/scripts/smoke-local.mjs` — 34-check suite (candidate: add refund-clamp/oversell checks).
- `C:\Users\PC\AppData\Local\Temp\opencode\ui-smoke.mjs` — headless CDP 19-route test.
- `packages/frontend/src/types/jsbarcode.d.ts` — JsBarcode declarations.
- `E:\Projects\POS\pospro\js\storage-service.js`, `msaccess-handler.js`, `qr-backup.js`, `universal-scanner.js`, `receipt-printing.js`, `pos-api.js`, `supabase-sync.js`, `sync-manager.js`, `error-handler.js` — errors.md fixes (original vanilla project).
- `E:\Projects\POS\pospro\index.html` — `error-handler.js` added as first script (line ~1617).
- `E:\Projects\POS\pospro-v2\errors.md` — resolution log appended.
