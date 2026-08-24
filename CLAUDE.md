# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"ON TARGET UNITED" — a single-page inventory/POS app for a firearms retailer. React 18 + TypeScript + Vite + Tailwind, with Supabase (Postgres + Auth) as the entire backend. There is no server-side code of our own: the browser talks to Supabase directly with the anon key, and thermal-receipt printing happens client-side through the browser's own print dialog.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # production build
npm run preview    # serve the build
npm run lint       # eslint (flat config, TS + react-hooks + react-refresh)
npm run typecheck  # tsc --noEmit -p tsconfig.app.json
```

There is no test suite and no test runner installed. `npm run lint && npm run typecheck` is the full verification loop.

`.env` (gitignored) supplies `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Deployed on Vercel; `vercel.json` rewrites everything to `index.html` for client-side routing.

## Architecture

**Routing / auth.** [App.tsx](src/App.tsx) wires `BrowserRouter` → `AuthProvider` → route table. Every feature route is nested inside a single `<ProtectedRoute><AppLayout/></ProtectedRoute>`; `/login` is wrapped in `PublicRoute`. Auth state lives in [useAuth.tsx](src/hooks/useAuth.tsx) (Supabase session + a `profiles` row fetched on sign-in). The `Profile.role` field (`admin | manager | staff`) exists but is not currently enforced anywhere.

**Data access.** No repository or service layer — feature components call `supabase.from(...)` inline (see [Sales.tsx:48-50](src/components/sales/Sales.tsx#L48-L50)). Row shapes are hand-mirrored in [src/types/index.ts](src/types/index.ts); keep that file in step with [supabase/migrations/](supabase/migrations/) when the schema changes. RLS policies are permissive-for-`authenticated` on every table except `profiles`.

**Migrations** are raw `.sql` files applied out-of-band; there is no Supabase CLI dependency here. Note the schema's `generate_invoice_number()` function is *not* used — it was buggy, and invoice numbers are now generated client-side.

**Sale completion** ([Sales.tsx](src/components/sales/Sales.tsx)) is the app's one multi-step write, done without a transaction: re-read live `current_stock` for every cart line and refuse the sale if any line is short → allocate `INV-YYYYMM-NNNN` by reading the highest existing number and retrying on unique-violation `23505` → insert `sales` → insert `sale_items` → insert `stock_movements`.

That last insert is what moves stock: the `trg_update_product_stock` trigger applies a relative decrement server-side. The client must **not** also write `products.current_stock` — it used to write an absolute (loaded stock − qty sold) target, which lost the other till's deduction whenever two POS tabs were open. If you touch this path, preserve the retry loop, the pre-flight stock check, and the rule that only the trigger writes stock.

Stock cannot go negative: `products_current_stock_non_negative` is a `CHECK` constraint, so an oversell fails the `stock_movements` insert rather than being silently clamped. The cart clamps quantities to the loaded snapshot as a convenience, but the constraint is the authority.

**POS cart state** persists in localStorage via [usePersistentState.ts](src/hooks/usePersistentState.ts). [posCart.ts](src/lib/posCart.ts) owns the key names (`pos.*`) and is the only channel between the Customers tab and the POS: a "re-order" stages `{product_id, quantity}` lines, and `resolveStagedOrder()` re-resolves them against the live product list so prices come from current `selling_price` and quantities are clamped to current stock.

**Manual invoices** ([Invoices.tsx](src/components/invoices/Invoices.tsx)) are a localStorage-only feature (`manual_invoices` key, `MAN-NNNN` numbering) that is adapted to the `Sale`/`SaleItem` shape so it can reuse the same receipt renderer. They never reach Supabase.

## Thermal receipt printing — read the file's comments first

[src/lib/invoices.ts](src/lib/invoices.ts) is ~2000 lines and is mostly load-bearing prose explaining measurements taken on the client's Xprinter XP-Q200. **Read the block comments before changing any constant in it.** Key facts encoded there:

- Printing goes through `window.print()` on a hidden iframe — no QZ Tray or bridge app, despite `qz-tray` still being a dependency (only the type shim in [qz-tray.d.ts](src/types/qz-tray.d.ts) remains).
- Page *width* depends on item count: ≤15 items → 80mm page (1:1 on the paper), >15 → a wider page the driver shrinks to fit, trimming ~3mm off each edge. This is a deliberate, requested trade-off.
- Page *length* comes from a measured lookup table (`RECEIPT_PAGE_LENGTH_MM`, 1..30 items), raised to actual rendered content height, and written into an `@page` rule by an injected `pageSizingScript()` that re-measures on `beforeprint`.
- The receipt is always one page, never scaled, never split.

**PDF export** ([invoicePdf.ts](src/lib/invoicePdf.ts)) deliberately does *not* re-lay-out the invoice. It renders the same HTML off-screen, rasterises it via SVG `foreignObject` → canvas (`rasteriseReceiptHtml`), and drops that single JPEG onto a `@react-pdf/renderer` page of matching aspect ratio. Both paths must be fed the same item count so the page width agrees. `@react-pdf/renderer` is dynamically imported to keep it out of the main bundle.

`mountReceiptFrame` / `withReceiptDocument` / `printReceiptHtml` / `rasteriseReceiptHtml` all share the one hidden-iframe mounting helper; keep new receipt consumers on it rather than mounting their own.

Note the print/PDF section of `invoices.ts` uses a very airy formatting style (one argument per line, blank lines between statements) that differs from the rest of the codebase. Match whichever style is local to the code you are editing.

## Styling conventions

Tailwind only; `lucide-react` for icons; do not add UI/icon libraries. The theme in [tailwind.config.js](tailwind.config.js) has a trap: the palette is named `navy` and `gold` but is actually **grayscale + emerald**, and the `navy` ramp is *inverted* — `navy-950` is white (page background) and `navy-50` is near-black. This was done to flip a dark theme to light without rewriting ~370 existing class usages. So `bg-navy-950` means "white background", `text-navy-300` means "dark gray text", and `gold-*` is emerald green.

Shared primitives live in [src/components/ui/](src/components/ui/) (`GlassCard`, `Modal`, `StatusBadge`).

## Error handling

Every write must check its `error`. Route failures through `reportError(action, err)` from [src/lib/errors.ts](src/lib/errors.ts), which `console.error`s and raises a toast with the Supabase `message`/`code`/`details`/`hint`, translating the constraint codes this app can actually trip (`23505` duplicate SKU, `23514` negative stock, `23503` still-referenced row) into plain language first. Use `notifyError(title, detail)` when the caller words its own failure (printing, PDF export).

Toasts live in [src/components/ui/Toast.tsx](src/components/ui/Toast.tsx); `ToastProvider` wraps the app in [App.tsx](src/App.tsx) and `useToast()` gives `success`/`error`/`info`/`dismiss`. Every successful create, update and delete raises `toast.success(<what happened>, <which record>)`. `reportError` reaches the toast through a notifier slot the provider registers, since `lib/errors.ts` is plain module code that cannot call a hook; it falls back to `alert()` while no provider is mounted. Don't add `alert()` calls — errors go through `errors.ts`, validation messages through `toast.error`.

Screens that aggregate over a whole table must page through it with `fetchAllRows()` from [src/lib/fetchAll.ts](src/lib/fetchAll.ts): a single Supabase response stops at 1000 rows and does not report that it truncated.
