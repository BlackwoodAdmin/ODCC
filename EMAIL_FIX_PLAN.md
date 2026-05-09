# Email Fix Plan

Three issues on the dashboard email viewer: attachments don't appear, inline images don't render, and there's no print button.

## Root causes

**1. Attachments don't appear**
- `src/pages/DashboardEmail.jsx:724` reads `att.url`, but `server/routes/email-messages.js:510-515` returns only `id, filename, content_type, size_bytes, content_id, is_blocked, created_at` — no `url` field.
- The download endpoint `/api/email/attachments/:id` exists and works; the client just never builds the link.
- Line 730 reads `att.size`, but the server returns `size_bytes`.

**2. Inline images don't render**
- `server/routes/email-inbound.js:323-331` rewrites `cid:...` to `/data/attachments/<uuid>/<file>` — a path Express never serves.
- Even if mounted statically, the message body renders inside an iframe via `srcDoc` with no cookies/Bearer header, and `/api/email/attachments/:id` requires JWT — so plain `<img src>` would 401.
- Existing rows in the DB already have the broken `/data/attachments/...` path baked into their stored `body_html`.

**3. No print**
- No print button or print CSS anywhere in `DashboardEmail.jsx` / `src/components/email/MessageView.jsx`.

## Fixes

### A. Attachment downloads
In `server/routes/email-messages.js:510-515`, map each attachment row to:
```js
{ id, filename, content_type, size_bytes, size: size_bytes,
  content_id, is_blocked,
  url: `/api/email/attachments/${id}` }
```
Filter from the **user-visible** attachment list any row that is **inline AND an image** (`content_id IS NOT NULL AND content_type` in the strict allowlist below). Inline non-image attachments (rare: inline PDF/audio) stay in the visible list. No `is_inline` column needed.

In `DashboardEmail.jsx:724-730`, replace the plain `<a download>` with a click handler that:
- Calls the API helper (which sends JWT in `Authorization` header — never in query string).
- Receives the file as a Blob, generates an object URL, triggers download.
- Calls `URL.revokeObjectURL` in a `finally` block so it runs even if download throws.
- Trade-off: right-click → "Save link as" no longer works — acceptable.

### B. Inline images
Resolve `cid:` and legacy paths to data URIs at message-fetch time in `email-messages.js`:

1. Load all attachments for the message.
2. Build a single **`cid → dataURI` map** for attachments where `content_id IS NOT NULL` AND `content_type` is in the **strict allowlist**: `image/png`, `image/jpeg`, `image/gif`, `image/webp`. **Exclude `image/svg+xml`** — SVG can carry scripts and would become an XSS vector if `allow-scripts` is ever added to the sandbox.
3. Read files in parallel with `Promise.all`.
4. **Caps are on emitted base64 size.** Per-image: 1.5 MB raw (~2 MB encoded). Aggregate: 6 MB raw (~8 MB encoded) total across all inlined images per message. Once the aggregate cap is hit, stop inlining; remaining images stay as `cid:` (renders as broken — preferred so user knows there's missing content).
5. **Single-pass rewrite** of `body_html` using the map. Critical correctness items:
   - Use the **function form** of `String.replace((_) => dataURI)` — base64 payloads contain `$` which the string form interprets as backreferences (`$&`, `$1`), corrupting the output.
   - **Regex-escape the cid** — content IDs can contain `.`, `+`, `@`, `$`.
   - Match the scheme **case-insensitively** (`cid:`, `CID:`, `Cid:` all appear in the wild).
6. **Legacy path rewrite** for already-stored emails:
   - The HTML contains `/data/attachments/<uuid>/<file>`, but `storage_path` is stored as `attachments/<uuid>/<file>` (no leading `/data/`). Build the in-HTML form by extracting `<uuid>/<basename>` from `storage_path` and prefixing `/data/`.
   - Regex-escape **the entire basename** (it's `Date.now()-uuid-filename` and contains `-` and possibly other regex metacharacters), not just the UUID.
   - Substitute the data URI for the legacy path the same way as cid.
7. Restrict data-URI substitution to the strict allowlist only. Non-image cid attachments are NOT inlined; they remain in the visible attachment list. An attachment with `content_type: text/html` and a `cid:` reference must never be inlined (would be XSS).
8. Stop writing the broken `/data/attachments/...` path in `email-inbound.js:328`. Leave `cid:...` as-is going forward — read-time resolver is the single source of truth.
9. **Do NOT add `Cache-Control: private, max-age=300`.** The same GET endpoint marks the message as read (`email-messages.js:499-507`) and contents change on move/delete/reply. Use `Cache-Control: no-store` or omit. Performance is not a concern at this scale.

### C. Print button
In `DashboardEmail.jsx` near the reply-actions row (~line 738), add a **Print** button.

1. **HTML messages**: prefer `iframeRef.current.contentWindow.print()`. The current sandbox blocks programmatic print. Update sandbox to `allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-modals`. **Invariant**: `allow-scripts` MUST remain absent — combining it with `allow-same-origin` would give the iframe access to the parent origin's localStorage (where the JWT lives). Add a code comment stating this invariant so future PRs don't break it.
2. **Fallback**: if `print()` throws or is blocked, `window.open()` a print-friendly document, write envelope + body, call `print()`, close on `afterprint`.
3. **Plain-text messages**: `window.open` directly (no iframe to print).
4. Prepend an envelope block (Subject/From/To/Date) into the `srcDoc` so the printout includes headers. Add `<style>@media print { body { color: #000; background: #fff; } }`.
5. Optional hardening: include a `<meta http-equiv="Content-Security-Policy" content="img-src data:; default-src 'none'">` in the `srcDoc` head to forbid remote image loads (tracker pixels).

Works after fix B because images are data URIs and print directly without auth.

### D. One-shot legacy cleanup script
Add a maintenance script (`server/scripts/cleanup-legacy-inline-paths.js`) that:
- Selects all `email_messages` rows whose `body_html` contains `/data/attachments/`.
- For each, joins `email_attachments` and rewrites every `/data/attachments/<uuid>/<basename>` back to `cid:<content_id>` (using the same regex-escape rules as B6).
- Updates `body_html` in place.

After this runs once in production, the legacy-path rewrite branch in B6 can be deleted. Without this script, that legacy code lives in the codebase forever.

## Order
1. **B** (inline images, including legacy-path rewrite) — backend only, isolated.
2. **A** (attachment URL + Blob download) — backend + small client change.
3. **C** (print) — pure client; verify iframe sandbox change.
4. **D** (legacy cleanup script) — run once, then delete the legacy branch in B6.

Each is independent and testable.

## Verification (must pass before merge)
- Test message with **two inline images sharing one `content_id`** — both render.
- Test message with an inline image **>2 MB encoded** — broken image, not crash; aggregate cap honored.
- **Historical message** with the legacy `/data/attachments/...` path — rewrite resolves to data URI.
- Attachment with `content_type: text/html` and a `cid:` reference — must NOT be inlined.
- Attachment with `content_type: image/svg+xml` and a `cid:` reference — must NOT be inlined.
- Cid containing `.`, `+`, `@`, `$` — regex escape works.
- Base64 payload containing `$$` sequences — function-form `replace` does not corrupt output.
- Print HTML message via iframe — works in Chrome and Firefox.
- Print plain-text message via `window.open` fallback — works.
- Blob download — Authorization header present, no token in URL, object URL revoked.
- Spot-check: confirm `allow-scripts` is NOT in the iframe sandbox after the change.
- After running cleanup script D: zero rows where `body_html LIKE '%/data/attachments/%'`.
