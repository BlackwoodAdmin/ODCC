# Inbound Inline-Image Fix Plan

Stored inbound `<img>` tags lose their `src` attribute, so inline images render as broken in the dashboard. Existing attachment file on disk is fine; the row in `email_attachments` is also fine.

## Root cause

Two defaults interact:

1. `mailparser` v3.9.4 `simpleParser(raw)` — without options — **rewrites `cid:` references to `data:image/...;base64,...` URIs** before returning `parsedMime.html`. Verified against `node_modules/mailparser/lib/simple-parser.js:23,95-108`: `keepCidLinks` defaults to false, in which case the parser calls `updateImageLinks` to substitute `data:` URIs into `mail.html`. Reproduced with a synthetic MIME message:
   ```
   IN:  <img src="cid:f_moxi603t1" alt="x.png">
   OUT: <img src="data:image/png;base64,iVBORw0KGgo..." alt="x.png">
   ```
2. `sanitize-html` config in `server/routes/email-inbound.js:373` allows `http`, `https`, `mailto` globally and `http`, `https`, `cid` on `<img>` (line 378). **`data:` is in neither list**, so sanitize-html strips the `src` attribute.

Result: `<img>` with no `src` → broken image. Earlier `cid:` allowance fix is correct in isolation but never triggers, because the cid is gone before sanitize-html sees the html.

The image-with-cid attachment is also hidden from the user-visible list at `server/routes/email-messages.js:760-768` (intentional — those are meant to render inline), so the file appears nowhere when the inline render fails.

## Pre-merge greps (gate)

Run before merging to confirm no hidden coupling and no schema drift:

```bash
grep -rn "simpleParser" server/                                   # expect: only email-inbound.js:105
grep -rn "data:image" server/                                     # expect: 0 hits (no consumer relies on data-URI body_html)
grep -rnE "body_html.*data:|data:.*body_html" server/             # belt-and-suspenders
grep -rn "meta->>" server/ src/                                   # expect: 0 hits — column is `details`, not `meta`
psql -c "\d email_system_logs" "$DATABASE_URL" | grep -E "details|meta"  # expect: details JSONB; no meta
```

If `data:image` returns hits, audit each before proceeding — something downstream may pattern-match the old shape. If `meta->>` returns hits anywhere, that code is broken — the column is `details`.

## Core fix — one line

`server/routes/email-inbound.js:105`:

```diff
-parsedMime = await simpleParser(sgRawMime);
+parsedMime = await simpleParser(sgRawMime, { keepCidLinks: true });
```

`keepCidLinks: true` tells mailparser to leave `cid:` references in the html untouched. Then:

- sanitize-html passes them through (cid allowed on img — already deployed in commit `541998c`).
- Stored `body_html` retains `cid:f_moxi603t1`.
- Read-time resolver `buildInlineImageMaps` / `rewriteInlineImages` in `server/routes/email-messages.js:151-208` (already deployed in `476cd8f`) substitutes a data URI from disk when the dashboard fetches the message.
- Image renders inline; attachment is downloadable via the existing endpoint.

Confirmed via the grep above that `email-inbound.js:105` is the **only** `simpleParser` caller, so no other parse sites need the flag.

## PR strategy — split into two PRs

Per staff review, the work splits cleanly along blast-radius lines. Shipping as a single 9-commit PR makes a 2am rollback hard — on-call has to guess which of 9 commits caused a regression.

- **PR 1 — Bug fix and contract** (urgent, small): core + A + G + F. Fixes the bug, hardens the dedup hot spot the bug touches, and pins the mailparser version contract. Commit order: core → G → A → F (so the bug fix is commit 1, not buried mid-stack).
- **PR 2 — Observability and forwarding** (followup, ships separately): B + C + D + E. None is on the critical path; all are independently revertable from each other.

Both PRs merge **without squash** so any single addition is `git revert`-able.

Addition H (failed temp→final move signaling) is **dropped** entirely — the in-memory flag was a half-measure that left a stale `email_attachments` row pointing at a missing file. Doing it properly requires a `move_failed BOOLEAN` column. Tracked as a follow-up ticket below.

---

# PR 1 — Bug fix and contract

Commits in order: **core → G → A → F**.

## Addition G — Robust `Content-ID` strip

`server/routes/email-inbound.js`. Real-world `Content-ID` headers come with whitespace, double quotes, and parameter junk that the existing `.replace(/[<>]/g, '')` does not handle. Centralize:

```js
// Module-level helper near the top of the file.
function stripCid(raw) {
  if (!raw) return null;
  // Strip all <>, then trim outer whitespace and double quotes.
  // Middle-of-string < or > are extremely rare and are kept stripped (legacy behavior).
  const cleaned = String(raw).replace(/[<>]/g, '').trim().replace(/^["']+|["']+$/g, '');
  return cleaned || null;
}
```

Replace both call sites that do `att.contentId.replace(/[<>]/g, '')` (currently lines 297 and 312 — line 297 is removed by Addition A, line 312 stays in the fall-through push) with `stripCid(att.contentId)`. Addition A's diff below references `stripCid`.

**Case-sensitivity note**: `stripCid` does NOT lowercase. Per RFC 2392 §2, `cid:` URI comparison against `Content-ID` is case-sensitive as a string. The downstream cidMap lowercases for HTML-side matching tolerance (browser regex match), accepting that two messages with `<Foo@x>` and `<foo@x>` would collide in the map — pre-existing behavior, surfaced in Known Limitations below.

## Addition A — Tighten CID-to-attachment dedup

`server/routes/email-inbound.js:285-326`. Current heuristic dedups multer file vs MIME attachment by `filename + size±100B`. This regresses in two cases:

1. Two MIME parts with the same filename + similar size but **different `Content-ID`s** — the second cid is silently dropped onto the first record, losing Part B's payload entirely.
2. Multi-camera or templated emails where multiple parts legitimately share `IMG_0001.jpg` (with or without distinct cids).

Switch to: **CID-first match, name-fallback (NFC-normalized), claimed-set keyed by array index, claim newly-pushed records, and warn on payload-less MIME parts.**

```diff
+// Track which attachmentRecords (by index) have been claimed by a MIME part
+// this loop. Prevents two distinct MIME parts (different cids, same filename
+// +size, OR no cids and same filename+size) from collapsing onto a single
+// record. We use indices not WeakSet so the asymmetry is explicit:
+// every claim — including the one after a fall-through push — is a Set.add.
+const claimed = new Set();
+// NFC-normalize once per filename. multer's defParamCharset and mailparser's
+// MIME decoder can produce different byte sequences for the same logical
+// filename (e.g. precomposed vs combining accents); compare in NFC form.
+const nfc = (s) => (s == null ? s : String(s).normalize('NFC'));
 if (parsedMime?.attachments?.length) {
   for (const att of parsedMime.attachments) {
-    const alreadyHandled = attachmentRecords.some(
-      (r) => r.filename === att.filename && Math.abs(r.size_bytes - att.size) < 100
-    );
-    if (alreadyHandled) {
-      if (att.contentId) {
-        const existing = attachmentRecords.find(
-          (r) => r.filename === att.filename && Math.abs(r.size_bytes - att.size) < 100
-        );
-        if (existing) existing.content_id = att.contentId.replace(/[<>]/g, '');
-      }
-      continue;
-    }
+    const cid = stripCid(att.contentId);  // see Addition G for stripCid()
+    const attName = nfc(att.filename);
+    let matchIdx = -1;
+    if (cid) {
+      matchIdx = attachmentRecords.findIndex(
+        (r, i) => !claimed.has(i) && r.content_id === cid
+      );
+    }
+    if (matchIdx === -1) {
+      matchIdx = attachmentRecords.findIndex(
+        (r, i) => !claimed.has(i) && !r.content_id
+              && nfc(r.filename) === attName
+              && Math.abs(r.size_bytes - att.size) < 100
+      );
+    }
+    if (matchIdx !== -1) {
+      const existing = attachmentRecords[matchIdx];
+      if (cid && !existing.content_id) existing.content_id = cid;
+      claimed.add(matchIdx);
+      continue;
+    }
+    // No match — fall through to "Save MIME attachment to temp" block,
+    // which pushes a new record IF att.content has bytes. We claim that
+    // index immediately after push so a later iteration cannot re-match
+    // it via name-fallback.
```

…and at the existing push site (`email-inbound.js:303-324`), tighten the existing `if (att.content) { ... }` guard so it requires a non-empty payload, and add an else branch that logs:

```diff
-         if (att.content) {
+         // mailparser 3.9.4 surfaces empty inline parts (zero-byte body) as an
+         // attachment object whose `content` is a 0-length Buffer — TRUTHY. The
+         // bare `if (att.content)` form would let those through and persist a
+         // phantom 0-byte attachment row that the read-time resolver later
+         // renders as a broken `data:image/png;base64,` URI. Require non-empty.
+         if (att.content && att.content.length > 0) {
            attachmentRecords.push({
              filename: att.filename || 'attachment',
              content_type: att.contentType || 'application/octet-stream',
              size_bytes: att.size,
              temp_path: tmpPath,
              final_path: path.join(finalAttachmentDir, attFilename),
              storage_path: `attachments/${attachmentUuid}/${attFilename}`,
-             content_id: contentId,
+             content_id: cid,  // already stripped above
              is_blocked: isBlocked,
            });
+           claimed.add(attachmentRecords.length - 1);
+         } else {
+           // Defensive: surface MIME parts that arrived without (or with empty)
+           // content payload. Without this log they vanish silently. Empirically
+           // mailparser 3.9.4 returns Buffer.alloc(0) for these — the new guard
+           // above (`length > 0`) routes them here.
+           await emailLog('warn', 'inbound', 'MIME attachment had no content payload', {
+             filename: att.filename, content_id: cid, content_type: att.contentType,
+             content_buffer_length: att.content?.length ?? null,
+           }).catch(() => {});
+         }
```

Note: `tempFiles.push(tmpPath)` and `fs.writeFile(tmpPath, att.content)` are inside the truthy branch in the existing code (`email-inbound.js:307-308`); tightening the guard skips those for empty parts, no orphan temp files.

Notes:

- **Index-based claim set** lets the fall-through push also claim, which closes the no-CID 3-part case (3 MIME parts with same filename, different bytes, no cids → 3 records, none collapsed).
- **Name-fallback only matches records with no cid yet** — if a record was already cid-claimed, it cannot also be name-matched.
- **NFC normalization** is applied symmetrically on both sides of the name compare. Pre-existing fragility (multer byte form ≠ mailparser byte form for combining-accent filenames) is now fixed in this PR rather than punted to follow-up.
- `BLOCKED_EXTENSIONS` re-evaluation already happens in the existing fall-through path; not affected.
- Size tolerance `±100B` retained for the name-only fallback; not used for the cid match.

## Addition F — Pin the mailparser contract

`tests/unit/inbound-cid-contract.test.js` (new). The whole plan hinges on `keepCidLinks: true` not being silently dropped or renamed by a future mailparser bump.

Vitest is already configured (`vitest.config.js` includes `tests/**/*.test.js`, runs via `npm test`). Place the test at `tests/unit/inbound-cid-contract.test.js` to match the existing convention (see `tests/unit/donations-helpers.test.js` for shape):

```js
import { describe, it, expect } from 'vitest';
import { simpleParser } from 'mailparser';

const fixture = [
  'From: tester@example.com',
  'To: me@opendoorchristian.church',
  'Subject: cid contract',
  'MIME-Version: 1.0',
  'Content-Type: multipart/related; boundary="b"',
  '',
  '--b',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p><img src="cid:abc@x" alt="x"></p>',
  '--b',
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  'Content-ID: <abc@x>',
  'Content-Disposition: inline; filename="x.png"',
  '',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  '--b--',
].join('\r\n');

describe('mailparser keepCidLinks contract', () => {
  it('preserves cid: in html when keepCidLinks=true', async () => {
    const parsed = await simpleParser(fixture, { keepCidLinks: true });
    expect(parsed.html).toContain('cid:abc@x');
    expect(parsed.html).not.toMatch(/data:image/i);
  });

  it('rewrites cid: to data: when keepCidLinks is unset (pins default)', async () => {
    const parsed = await simpleParser(fixture);
    // Loose match — assert the contract (cid resolved to a data: URI), not the
    // exact format. Future mailparser changes (`data:image/png;base64,...` vs
    // `data:image/png ;base64,...`) would otherwise spuriously fail this test.
    expect(parsed.html).toMatch(/data:image\/png/i);
    expect(parsed.html).not.toContain('cid:abc@x');
  });
});
```

The second case pins the default-off behaviour — if a future mailparser flips the default to `true`, this test fails loudly so we don't quietly mask other bugs that depended on the old default. Runs via the existing `npm test` (no new script needed).

Add a third case in the same file to pin Addition A's defensive no-content-payload branch — exercise it via a real fixture rather than runtime mocking:

```js
describe('mailparser empty-content MIME parts', () => {
  // multipart/related part with a Content-ID and Content-Disposition: inline
  // but a zero-byte body. mailparser surfaces this as an attachment object
  // with `content` empty/falsy. Addition A's defensive `else` branch must
  // log this and skip the push to attachmentRecords.
  const emptyPartFixture = [
    'From: tester@example.com',
    'To: me@opendoorchristian.church',
    'Subject: empty inline part',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="b"',
    '',
    '--b',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p><img src="cid:empty@x" alt="x"></p>',
    '--b',
    'Content-Type: image/png',
    'Content-ID: <empty@x>',
    'Content-Disposition: inline; filename="empty.png"',
    'Content-Transfer-Encoding: base64',
    '',
    '',
    '--b--',
  ].join('\r\n');

  it('produces an attachment object with falsy content for an empty inline part', async () => {
    const parsed = await simpleParser(emptyPartFixture, { keepCidLinks: true });
    expect(parsed.attachments).toHaveLength(1);
    const att = parsed.attachments[0];
    expect(att.contentId).toBe('<empty@x>');
    // `content` is either undefined or zero-length Buffer; both fail the
    // `att.content && att.content.length > 0` guard in the inbound handler
    // and fall into the defensive else branch.
    expect(!att.content || att.content.length === 0).toBe(true);
  });
});
```

This pins the upstream behavior the M3 defensive log relies on. If a future mailparser version starts synthesizing a non-empty `content` Buffer for empty parts (or stops surfacing the attachment object entirely), the test fails and the implementer revisits the inbound handler.

---

# PR 2 — Observability and forwarding

Ships separately after PR 1 has soaked. None of these are required to fix the bug; they surface edges the fix exposes. Commits in order: **D → C → B → E**. Each is independently revertable.

## Addition D — Bound `cidMap` regex size deterministically

`server/routes/email-messages.js:151-157`. Apply the entry cap **before** the `Promise.all` reads, on a deterministically-ordered `candidates` array:

```diff
 async function buildInlineImageMaps(attachments) {
   const candidates = attachments.filter(
     (a) => a.content_id && INLINE_IMAGE_TYPES.has(a.content_type)
-  );
+  )
+  // Deterministic ordering: smallest-first, tiebreak by id ascending.
+  // Adversarial mail with 200 inline images otherwise gets an arbitrary
+  // 100 selected by Postgres row order; smallest-first prefers the cheap
+  // ones so legitimate small inline images render even when oversized
+  // ones are present.
+  .sort((a, b) => (a.size_bytes - b.size_bytes) || (a.id - b.id))
+  .slice(0, 100);  // hard cap; without this, 100s of disk reads + a giant regex alternation.
```

Without this slice, the protection is illusory — disk reads happen first, then we'd cap the map, defeating the point. The sort makes truncation deterministic for tests and operator debugging. (`a.id` is selected by the message-fetch query at `email-messages.js:749`.)

## Addition C — Log `AGGREGATE_RAW_CAP` hits

`server/routes/email-messages.js:177-188`. Currently silent `continue` at line 180. Track `dropped` and `included` counters in the loop and emit one `email_system_logs` `warn` row per call (not per dropped image) when `dropped > 0`. Include `message_id` (passed as a parameter into `buildInlineImageMaps`), dropped count, included count, total raw bytes, cap. Wrap the `emailLog` call in try/catch — a logging failure must not 500 the response.

`buildInlineImageMaps` signature changes from `(attachments)` to `(attachments, messageId)` for log context. Update the single call site at `email-messages.js:756`:

```diff
-const { cidMap, pathMap } = await buildInlineImageMaps(allAttachments);
+const { cidMap, pathMap } = await buildInlineImageMaps(allAttachments, msgId);
```

`msgId` is already in scope at this call site (used by the response builder a few lines above).

## Addition B — Log unresolved `cid:` tokens at read time

`server/routes/email-messages.js`. After `rewriteInlineImages` runs in the message-fetch handler, surface any `cid:` token the resolver couldn't substitute. Emit one `email_system_logs` `warn` row per **(message_id, content-digest)** pair — deduped via an **in-process TTL Map**, not a DB query.

**Implementation note**: do NOT scan `message.body_html` after rewrite — that string contains potentially MB of substituted base64 data URIs, and a fresh regex pass over it is wasteful. Instead, **`rewriteInlineImages` returns the unresolved cid set as a side channel** during its single substitution pass, free of cost.

Modify `rewriteInlineImages` to track misses:

```diff
-function rewriteInlineImages(html, cidMap, pathMap) {
-  if (!html) return html;
+function rewriteInlineImages(html, cidMap, pathMap) {
+  if (!html) return { html, unresolvedCids: [] };
+  const unresolvedCids = new Set();
   let out = html;
   if (cidMap.size) {
     const alts = [...cidMap.keys()].map(regexEscape).join('|');
     const cidRe = new RegExp(`cid:(${alts})`, 'gi');
     out = out.replace(cidRe, (match, id) => cidMap.get(id.toLowerCase()) ?? match);
   }
+  // Separate pass: any cid: token still in `out` after the substitution above
+  // is genuinely unresolved (not in the cidMap). This regex matches src=
+  // attributes only — bare `cid:` references in text/comments are noise.
+  const stillCidRe = /<img\b[^>]+\bsrc=["']cid:([^"']+)/gi;
+  for (const m of out.matchAll(stillCidRe)) {
+    unresolvedCids.add(m[1].toLowerCase());
+  }
   if (pathMap.size) {
     const alts = [...pathMap.keys()].map(regexEscape).join('|');
     const pathRe = new RegExp(alts, 'g');
     out = out.replace(pathRe, (match) => pathMap.get(match) ?? match);
   }
-  return out;
+  return { html: out, unresolvedCids: [...unresolvedCids] };
 }
```

Update the call site at `email-messages.js:757` to destructure `{ html, unresolvedCids }`. The cidMap-substitution pass DOES insert data URIs into `out` before the unresolved-cid scan runs over it, but the regex anchors on `<img\b[^>]+\bsrc=["']cid:` and won't false-match `data:` URIs. The pathMap pass that follows the scan only substitutes URL-shaped tokens, never introduces new `cid:` tokens, so scanning before pathMap and scanning after it would yield identical results — placement here is for code clarity, not correctness. The win versus the prior plan is avoiding a separate post-rewrite scan over the final HTML; cost is unchanged on a happy-path render.

The `crypto` import is already present at `email-messages.js:2` — no new import needed.

Module-level cache near the top of the file:

```js
// Bounded LRU-ish cache: dedupes unresolved-cid render warns within a 24h window.
// Cleared on process restart (acceptable — at most one extra row per restart).
// Capped at 1000 entries to bound memory under adversarial input; oldest entry
// evicted on insert when full.
//
// Invariant: digest is computed over the SET of unresolved cids in this render,
// not over the message version. If the same message later renders with a
// different unresolved-cid set (e.g., an attachment is restored), a new digest
// fires a new log. If it renders with the same set, the existing entry holds
// the dedupe. Operators chasing "why didn't this re-log?" should compare cid
// sets, not message timestamps.
const UNRESOLVED_CID_LOG_TTL = 24 * 60 * 60 * 1000;  // 24h
const UNRESOLVED_CID_LOG_MAX = 1000;
const unresolvedCidLogCache = new Map();  // key = `${messageId}:${digest}` → expiresAt
```

In the message-fetch handler, after the destructure:

```js
try {
  if (unresolvedCids.length) {
    const digest = crypto.createHash('sha1')
      .update([...unresolvedCids].sort().join(','))
      .digest('hex')
      .slice(0, 16);
    const cacheKey = `${msgId}:${digest}`;
    const now = Date.now();
    const expiresAt = unresolvedCidLogCache.get(cacheKey);
    if (!expiresAt || expiresAt < now) {
      // Evict oldest if at capacity (Map preserves insertion order).
      if (unresolvedCidLogCache.size >= UNRESOLVED_CID_LOG_MAX) {
        const firstKey = unresolvedCidLogCache.keys().next().value;
        unresolvedCidLogCache.delete(firstKey);
      }
      unresolvedCidLogCache.set(cacheKey, now + UNRESOLVED_CID_LOG_TTL);
      // Cap raw-id leakage: at most 5 ids, each truncated to 64 chars.
      // Some MTAs (Google, Outlook) encode user-identifying tokens in
      // Content-ID values; better to log the digest as the canonical
      // identifier and keep the id sample small.
      const sample = unresolvedCids.slice(0, 5).map((s) => s.slice(0, 64));
      await emailLog('warn', 'render', 'Unresolved cid: tokens after rewrite', {
        message_id: msgId,
        cid_digest: digest,
        unresolved_count: unresolvedCids.length,
        unresolved_sample: sample,
      });
    }
  }
} catch (logErr) {
  // Never let a logging failure 500 the response.
  console.error('[render] unresolved-cid log failed:', logErr.message);
}
```

Why in-process Map instead of a DB dedup query:

- The reviewer's previous draft wrote a `SELECT … WHERE meta->>'message_id' = …` — but the actual column is `details` (`server/db.js:209`). That query would have thrown.
- Even with the column fixed, there is no index on `(category, level, details->>'message_id')` — only `(category, created_at DESC)` (`server/db.js:311`). On a busy logs table this is an O(N) scan **per message-fetch**.
- The Map TTL is tighter than a DB roundtrip, bounded in memory (`UNRESOLVED_CID_LOG_MAX`), and resets on restart (worst case: one extra log per (message, restart) pair — fine).

This bounds log volume: each broken message produces at most 1 row per 24h regardless of refresh count, and adversarial mail with N distinct cids still produces 1 row (digest collapses them). The whole block is wrapped in try/catch so a logging failure cannot 500 the response.

**Per-process caveat**: the dedup Map lives in the worker's heap. The repo runs single-process today (`node server/index.js` under systemd `proj-church`), so dedup is global. If the deployment ever moves to clustered/multi-worker mode, each worker logs once per (message, day) instead of once globally — acceptable degradation, but call it out so operators don't chase phantom duplicates.

**JSDoc update**: `server/utils/email-log.js:6` lists allowed categories as `'inbound'|'outbound'|'forward'|'auto_reply'|'bounce'|'cron'|'quota'|'rate_limit'|'disk'`. `'render'` is new (used by both Addition B and Addition C). No DB CHECK constraint, so the INSERT works, but update the JSDoc as part of this commit:

```diff
- * @param {string} category - 'inbound'|'outbound'|'forward'|'auto_reply'|'bounce'|'cron'|'quota'|'rate_limit'|'disk'
+ * @param {string} category - 'inbound'|'outbound'|'forward'|'auto_reply'|'bounce'|'cron'|'quota'|'rate_limit'|'disk'|'render'
```

## Addition E — Forwarding `cid:` references

`server/routes/email-inbound.js:484-490`. **Strip and note** (option 2 only). Inline rewrite (option 1) is deferred to follow-up — see rationale below.

This is somewhat tangential to the inline-image bug — forwarding has been broken-or-fine for as long as inline images existed, and the dashboard render fix doesn't touch forwarding. It's bundled into PR 2 because once PR 1 lands, forwarded mail will contain literal `cid:` references in the HTML (instead of the prior data URIs), which renders as broken `<img>` in the recipient inbox. The strip prevents that visible regression.

```diff
 if (account.forwarding_address && account.forwarding_mode !== 'none') {
+  let forwardHtml = bodyHtml || `<pre>${escapeHtml(bodyText || '')}</pre>`;
+  let strippedCount = 0;
+  forwardHtml = forwardHtml.replace(/<img\b[^>]*\bsrc=["']cid:[^"']*["'][^>]*>/gi, () => {
+    strippedCount += 1;
+    return '';
+  });
+  if (strippedCount) {
+    forwardHtml += `<p style="color:#666;font-size:12px;font-style:italic;">[${strippedCount} inline image${strippedCount === 1 ? '' : 's'} omitted from forward — view the original in the dashboard]</p>`;
+  }
   try {
     await sendEmail({
       to: account.forwarding_address,
       subject: `Fwd: ${subject || '(no subject)'}`,
-      html: bodyHtml || `<pre>${escapeHtml(bodyText || '')}</pre>`,
+      html: forwardHtml,
     });
```

The strip lives **inside** the forwarding guard — no work for accounts without forwarding configured.

**Why not option 1 (inline data URIs at forward time):**

- **Recipient MTA truncation**: Gmail and Outlook silently truncate or mangle HTML > ~102 KB. A 6 MB raw / ~8 MB base64 forward arrives as broken layout, not as inline images.
- **Non-image cids**: `INLINE_IMAGE_TYPES` only covers png/jpeg/gif/webp; SVG/PDF/HEIC cids stay literal in option 1 and the bug recurs.
- **`sendEmail()` lacks an `attachments` param** (`server/email.js`). The architecturally-correct fix is to widen `sendEmail` to accept inline-cid parts (the outbound path at `email-messages.js:466` already does this with SendGrid) and re-attach the parts on forward. That's a larger, separately-reviewable change.

Option 2 ships clean, doesn't bloat outbound mail, and converts a silent failure (broken images in forward) into a visible operator hint.

---

## Follow-up tickets (out of scope for both PRs above)

- **Failed temp→final move signaling, done correctly** (was Addition H, dropped). Add `move_failed BOOLEAN DEFAULT false` to `email_attachments`. On `cpErr` in `email-inbound.js:472-476`, UPDATE the row to set `move_failed = true`. Hide `move_failed = true` rows from the dashboard's visible attachment list (`email-messages.js:760-768`), have `email-attachments.js:54` return a clearer 410 Gone with operator-helpful message, and have `buildInlineImageMaps` skip them up-front instead of relying on the `fs.stat` catch. Without the column, the half-measure left a stale DB row pointing at a missing file and only added one audit-log field of value.
- **Forwarding option 1 done correctly**: extend `sendEmail()` in `server/email.js` to accept `attachments: [{filename, content, type, content_id, disposition: 'inline'}]` (mirror the SendGrid shape already used at `email-messages.js:466`); rewrite forwarding to re-attach the cid parts as inline. Validates against the same payload-size limits the outbound compose path uses; respects the new `move_failed` column.
- **Audit log retention** for the new `category='render'` rows in the `email-system-logs` cleanup cron, if not already covered.
- **SVG/HTML attachment download disposition**: `server/routes/email-attachments.js:62-63` serves `Content-Disposition: inline` for any unblocked attachment. An SVG containing script downloaded then opened in a new tab executes in the app origin. Force `attachment` disposition for `image/svg+xml` and `text/html` regardless of `is_blocked`. Pre-existing; not in plan scope.
- **Attachment ID enumeration via 403 vs 404**: `email-attachments.js:35` returns 403 when the lookup row exists but is owned by a different user — leaks existence. Should return 404 in that case. Pre-existing.
- **Sandbox attribute audit**: re-verify `src/pages/DashboardEmail.jsx:594-595` (inline list display iframe — no `allow-same-origin`) and `:838-840` (single-message display iframe used for Print via `contentWindow.print()` — has `allow-same-origin allow-modals`) still lack `allow-scripts` after any future refactor. Both currently safe; the SECURITY INVARIANT comment at `:832-837` already documents the rule for the second iframe.
- **Case-sensitive cidMap option**: today the cidMap lowercases keys for browser-tolerance. Per RFC 2392 §2 cid: comparison is case-sensitive. A future, stricter resolver could key the map case-sensitively and only fall back to case-insensitive lookup on miss; not worth the complexity today, but documented in Known Limitations.

## What this does NOT touch

- No schema change in either PR (the `move_failed` column is the follow-up, not in PR 2).
- No client change.
- No change to the read-time resolver's data-URI strategy, sanitizer config, or attachment endpoints.
- Existing broken messages (id 121 and any earlier inbound where the src was already stripped at storage) stay broken — we don't store raw MIME, so there's nothing to recompute from. Fix is forward-only.
- The 4 emails that hit the webhook before the path fix (`ccc0a2c`) are gone; SendGrid was 200-acked on the failed responses and won't retry.

## Known limitations (post-fix)

- **Forwarded mail with re-embedded cids from prior senders** (e.g. an upstream reply chain referencing `cid:f_xxx@gmail.com`) will leave a literal `cid:` token in the rendered HTML — the read-time resolver only knows about *this* message's attachments. Browser shows broken `<img>`. The new unresolved-cid log (PR 2 Addition B) makes these visible.
- **Large emails past `AGGREGATE_RAW_CAP` (6 MB raw / ~8 MB encoded)** render partially — first N (smallest-first per PR 2 Addition D) images inline, rest broken. Log (PR 2 Addition C) records this. Raising the cap is a separate decision.
- **Non-image cid references** (SVG, PDF, HEIC) are not inlined — `INLINE_IMAGE_TYPES` is restricted to png/jpeg/gif/webp by design (SVG XSS surface — iframe sandbox at `DashboardEmail.jsx:838-840` does not include `allow-scripts` (per the SECURITY INVARIANT comment at `:832-837`), but defense-in-depth applies). They will appear as broken images and surface via log (B).
- **Forwarded inline images** are stripped from forwards with a "[N inline images omitted]" note (post-PR 2). Recipients of forwards see the note; full message available in the dashboard. Restoration is the follow-up ticket above.
- **Content-ID case sensitivity**: `cidMap` lowercases keys (`email-messages.js:183`) and the cid-resolution regex is case-insensitive (`:199`). Per RFC 2392 §2, cid: URI comparison should be case-sensitive against `Content-ID`. The current behavior is more permissive — a message with two `Content-ID` values differing only in case (`<Foo@x>` and `<foo@x>`) collapses them in the rendered map. Pre-existing; documented under Follow-up tickets if we ever decide to tighten.
- **Content-ID Unicode normalization**: filenames are NFC-normalized symmetrically across multer and mailparser (Addition A); Content-ID values are NOT. RFC 2392 doesn't require normalization for cid: comparison either, so this is consistent with the spec, but a sender producing `<café@x>` (precomposed) in `Content-ID` and `cid:café@x` (NFD with combining acute) in HTML would miss the cidMap lookup. Extremely unlikely in practice — Content-ID values are conventionally ASCII MTA-generated. If we ever see a real miss, normalize on both sides of `cidMap.set` and the regex match.
- **Manual repair of historical broken messages** is possible but unsupported: edit `body_html` directly to insert `cid:<content_id>` tokens that match extant `email_attachments.content_id` values for that `message_id`. Not worth automating.
- **SendGrid retry idempotency on failed moves**: until the follow-up `move_failed` column lands, a SendGrid retry that arrives after a partial-failure ingest (some attachments moved, some not) is gated by the existing `mimeMessageId` idempotency check at `email-inbound.js:208-219`. The duplicate webhook is rejected before MIME re-parse, so no duplicate attachment rows are created. This holds **after** PR 1 lands too — `keepCidLinks: true` does not change the dedupe-key derivation.

## Verification

**Run all curl-based steps against staging or a local dev server**, never directly against prod — invalid-token attempts emit `warn` logs. The webhook URL is `POST /api/email/inbound/:token` where `:token` is `INBOUND_WEBHOOK_SECRET`. Substitute `${INBOUND_WEBHOOK_SECRET}` and `${BASE_URL}` (e.g. `http://localhost:3000` for local dev) below.

Test fixtures live in `tests/fixtures/inbound/` (plural `tests/`, matching vitest's `tests/**/*.test.js` config). Smallest viable form: `curl -F email=@fixture.eml -F to=... -F from=... -F envelope=...` against the webhook URL.

### After PR 1 (core + G + A + F)

1. **Inline-only image.** Send a new email with one inline image. Query:
   ```sql
   SELECT body_html FROM email_messages
    WHERE id = (SELECT MAX(id) FROM email_messages WHERE direction='inbound');
   ```
   Expect literal `cid:<id>` in the stored html.
2. **Dashboard render.** Open the message in the church-site inbox. Expect the image to render (read-time data-URI substitution).
3. **Inline + separate attachment.** Send an email with an inline image plus a non-image file (e.g., a PDF). Expect:
   - inline image renders,
   - the PDF appears in the visible attachment list,
   - download button works.
4. **Plain-text email.** Send a no-attachment email. Expect it to keep working (regression check).
5. **Same-filename inline images** (covers Addition A). Send an email with two inline images both named `image.png` but different `Content-ID` values. Expect:
   ```sql
   SELECT id, filename, content_id FROM email_attachments WHERE message_id = <id>;
   ```
   to return **two rows** with distinct `content_id` values, and both images to render in the dashboard.
   Also: send an email with three inline parts all named `image.png` and **no** Content-ID on any. Expect three rows, three distinct `storage_path`s, three distinct files on disk (covers Addition A's claim-after-push fix for the no-CID variant).
6. **Unicode-normalized filename collapse** (covers Addition A's NFC fix). Send an email with two inline parts whose filenames differ only by Unicode normalization — e.g., one part with `café.png` (precomposed é, NFC) and a second part with `café.png` (e + combining acute, NFD). Both with the same `Content-ID`. Expect **one** attachment row (NFC-normalized name compare collapses them into a single record) — not two.
7. **Quoted/whitespace Content-ID** (covers Addition G). Send an email whose raw MIME contains `Content-ID: " <abc@x> "` (note the spaces and quotes). After ingest:
   ```sql
   SELECT content_id FROM email_attachments WHERE message_id = <id>;
   ```
   Expect `abc@x` exactly (no quotes, no spaces, no angle brackets). The image renders in the dashboard.
8. **CID-as-injection-vector** (covers cid-not-used-as-path). Send an email whose MIME contains `Content-ID: <../../etc/passwd>` on the inline part. Expect:
   ```sql
   SELECT content_id, storage_path FROM email_attachments WHERE message_id = <id>;
   ```
   - `content_id` is exactly `../../etc/passwd` (cid is just a string in this column),
   - `storage_path` is a UUID-rooted path under `attachments/`, **never** anywhere near `/etc`,
   - dashboard render produces a `data:` URI (cidMap lookup against the literal key returns the on-disk file's bytes; no path traversal occurred), and
   - `email_system_logs` has no `error`-level rows for this ingest. The cid is a regex map key, never a path argument; this test confirms it.
9. **Mailparser contract test** (covers Addition F). From repo root:
   ```bash
   npm test -- tests/unit/inbound-cid-contract.test.js
   ```
   Or run the full suite via `npm test`. Expect all assertions to pass. This pins the version coupling — a future mailparser bump that drops or renames `keepCidLinks` will fail this test instead of silently re-introducing the bug.
10. **MIME part with no content** (covers Addition A's defensive `else`). The mailparser-side contract is pinned by the third case in the contract test (`tests/unit/inbound-cid-contract.test.js`'s `empty-content MIME parts` describe block) — `npm test` confirms an empty inline part surfaces as an attachment object with falsy/zero-length `content`. For an end-to-end check, send the same fixture through the webhook in dev:
    ```bash
    curl -X POST "${BASE_URL}/api/email/inbound/${INBOUND_WEBHOOK_SECRET}" \
      -F "email=@tests/fixtures/inbound/empty-inline-part.eml" \
      -F "to=test@opendoorchristian.church" -F "from=tester@example.com" \
      -F 'envelope={"to":["test@opendoorchristian.church"],"from":"tester@example.com"}'
    ```
    Expect:
    - one `email_system_logs` row with `category='inbound', level='warn', message='MIME attachment had no content payload'`,
    - **no** corresponding row in `email_attachments` for that contentId,
    - the request completes 200 — the no-content branch logs but does not throw.
    Save the same fixture body used in the unit test as `tests/fixtures/inbound/empty-inline-part.eml` so the unit and integration tests share one canonical example.
11. **Logs clean for happy path.** `SELECT * FROM email_system_logs WHERE category IN ('inbound') AND level='error' AND created_at > (extract(epoch from now()) * 1000 - 600000)::bigint` returns no rows after the test sends in steps 1–4.

### After PR 2 (D + C + B + E)

12. **Aggregate cap log + deterministic truncation** (covers Additions C, D). Use fixture `tests/fixtures/inbound/six-large-images.eml` (6 inline images, ~1.5 MB each → exceeds 6 MB cap). Send via:
    ```bash
    curl -X POST "${BASE_URL}/api/email/inbound/${INBOUND_WEBHOOK_SECRET}" \
      -F "email=@tests/fixtures/inbound/six-large-images.eml" \
      -F "to=test@opendoorchristian.church" -F "from=tester@example.com" \
      -F 'envelope={"to":["test@opendoorchristian.church"],"from":"tester@example.com"}'
    ```
    Then open the message in the dashboard and query:
    ```sql
    SELECT level, message, details FROM email_system_logs
     WHERE category='render' AND level='warn'
       AND created_at > (extract(epoch from now()) * 1000 - 600000)::bigint
     ORDER BY created_at DESC LIMIT 5;
    ```
    Expect one row with `details->>'dropped'` ≥ 1 and `details->>'included'` ≥ 1.
    Also: refresh the message twice more. Expect no additional rows from this message (the in-process cache in B suppresses duplicates within 24h). The first N images shown should be the smallest-by-`size_bytes` (Addition D ordering).
13. **Unresolved cid log + dedupe** (covers Addition B). Pick a valid `account_id` and `folder_id` from your DB:
    ```sql
    SELECT id FROM email_accounts LIMIT 1;
    SELECT id FROM email_folders LIMIT 1;
    ```
    Insert a synthetic broken row using the **real** schema:
    ```sql
    INSERT INTO email_messages (
      account_id, folder_id, direction, from_address, from_name, to_addresses,
      subject, body_html,
      received_at, created_at, updated_at
    ) VALUES (
      <account_id>, <folder_id>, 'inbound',
      'tester@example.com', 'Tester', '["me@opendoorchristian.church"]'::jsonb,
      'cid test',
      '<p>broken: <img src="cid:nonexistent-xyz@test"></p>',
      (extract(epoch from now()) * 1000)::bigint,
      (extract(epoch from now()) * 1000)::bigint,
      (extract(epoch from now()) * 1000)::bigint
    ) RETURNING id;
    ```
    Open that message in the dashboard. Refresh 3 times. Then:
    ```sql
    SELECT count(*) FROM email_system_logs
     WHERE category='render' AND level='warn'
       AND details->>'message_id' = '<inserted_id>';
    ```
    Expect **exactly 1** (proves the in-process per-message-per-day dedupe works). The row's `details->>'unresolved_count'` should equal `1` and `details->>'unresolved_sample'` should be a 1-element array containing `nonexistent-xyz@test`.
14. **Unresolved cid log truncation** (covers Addition B's M2 cap). Insert a synthetic row whose `body_html` references **10 distinct nonexistent cids**:
    ```sql
    INSERT INTO email_messages (...) VALUES (
      ..., '<p>' ||
      '<img src="cid:a1@x">' || '<img src="cid:b2@x">' || '<img src="cid:c3@x">' ||
      '<img src="cid:d4@x">' || '<img src="cid:e5@x">' || '<img src="cid:f6@x">' ||
      '<img src="cid:g7@x">' || '<img src="cid:h8@x">' || '<img src="cid:i9@x">' ||
      '<img src="cid:j10@x">' || '</p>',
      ...
    );
    ```
    Open it, then query the resulting log row. Expect `details->>'unresolved_count' = '10'` but `jsonb_array_length(details->'unresolved_sample') = 5` (truncated). All sample entries `≤ 64 chars` — proves M2 cap is applied.
15. **Forwarding strip-and-note** (covers Addition E). With `forwarding_address` set on a test account, send an email with one inline image. Confirm the forwarded copy in the destination inbox:
    - does **not** contain a broken `<img>`,
    - contains the "[1 inline image omitted from forward — view the original in the dashboard]" note,
    - is well under 100 KB total (no data-URI bloat).
16. **Logs clean for happy path (PR 2 categories).** `SELECT * FROM email_system_logs WHERE category IN ('render','forward') AND level='error' AND created_at > (extract(epoch from now()) * 1000 - 600000)::bigint` returns no rows after the test sends in steps 1–4 above.

## Rollback

**PR 1** is structured as 4 commits (core fix + G + A + F) and merged **without squash**. Any single addition is revertable:

- A depends on G's `stripCid()` helper. Revert order if both rolled back: A first, then G.
- F is independent (test-only, no runtime impact).
- The core one-liner is the only mandatory revert target if the underlying mailparser flag itself misbehaves — A and G are improvements that stand independently of the cid: preservation flag.

**PR 2** is structured as 4 commits (D + C + B + E) and merged **without squash**. Inter-commit dependencies:

- B depends on D's signature change to `buildInlineImageMaps` (passes `messageId`); C does too.
- B also depends on the `rewriteInlineImages` return-shape change (PR 2 internal — same commit as B).
- E touches `email-inbound.js:484-490` only — independent of B/C/D.

Revert order if rolling back the entire PR 2: E → B → C → D. Reverting an individual addition mid-stack: E and D each clean. Reverting B alone leaves the `rewriteInlineImages` shape change orphaned — bundle the shape revert with B's revert.
