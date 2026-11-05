# Frontend history — JCGS Swamivatsalya RSVP

Repo: `abhivrup/jcgs-swamivatsalya-rsvp` (public, GitHub Pages at
`https://abhivrup.github.io/jcgs-swamivatsalya-rsvp/`). The frontend
was already version-controlled on GitHub; this file documents its
versions so the history is readable without digging through the log.

## How to read the GitHub log

Deploys were made through the GitHub web editor as upload + delete +
rename triples, so one deploy is usually three commits. The deploy
point is the commit that renames a file TO `index.html`. Commits that
only add a temporary file or delete `index.html` are steps of the
same deploy, not versions. Versions below group commits by the
SHA-256 of the live `index.html` blob (first 12 hex chars shown),
verified 2026-11-04 from a full clone. Same hash = same content,
even when it was deployed more than once (Nov 1 Pages queue jam).

## Versions (distinct live `index.html` blobs, oldest first)

| Version | Live from (commit) | Date | Bytes | SHA-256 (12) | What changed |
|---|---|---|---|---|---|
| v1 | `6e72848` | 2026-10-25 | 36,265 | `6c77b6994178` | Demo test app: sample events in page memory, no backend. |
| v2 | `b165371` | 2026-10-31 | 52,562 | `c8f990a79cb5` | Wired to the test backend (`/exec` URL); live events + counts. Icon `icon-180.png` (49,566 bytes) added in `1558b41` the same day. |
| v3 | `6b3868a` | 2026-10-31 | 52,944 | `752a37e0f3f6` | JCGS logo in the page (header + favicon/apple-touch-icon). |
| v4 | `cbc459c` | 2026-11-01 | 55,040 | `aa7582b19a2c` | RSVP prefill from last RSVP; "Not you?" clears saved details. |
| v5 | `705b130` | 2026-11-01 | 55,105 | `4da471cb5464` | My RSVPs date fix (raw ISO string shown before). |
| v6 | `a207151` | 2026-11-01 | 55,516 | `46e64c54bb9e` | Date fix + parallel My RSVPs loading (render events first). |
| v7 | `7c0e3ee` | 2026-11-01 | 57,490 | `e9736069019e` | Cached fast-load: 7-day cache, render cached copy, background refresh. |
| v8 | `e667d0c` | 2026-11-01 | 57,906 | `44dc2d41f495` | Instant tab switching; badge taps register. Matches the local `swamivatsalya-rsvp-frontend-live-test-BEFORE-announcements-2026-11-02.html` copy byte-for-byte. |
| v9 | `7ea5a02` | 2026-11-02 | 61,137 | `52c20b29a7f6` | "Get notified about new events" signup form. Backend half pending (backend v1.4). Matches the local `swamivatsalya-rsvp-frontend-live-test.html` copy byte-for-byte. |
| v10 | `1e8bd35` | 2026-11-04 | 60,435 | `b6bf1e1e88dc` | Phone/WhatsApp fields disabled (greyed out, email-only) until WhatsApp sending is enabled; email validation and wording updated in the RSVP form and the manage-link panel. Single-commit in-place upload (no rename triple). Current live version. |

## Notes

- Nov 1 Pages queue jam: rapid commits queued several Pages
  deployments; some failed with HTTP 400 while an earlier one was in
  progress, and identical blobs were deployed again (`5245791`,
  `3b58a39`/`b14af96`/`d144f87`/`e2d32fd` upload steps). No content
  was lost; the distinct-blob list above is unaffected. Do not use
  rename-retrigger commits to clear a stuck queue.
- Two local frontend copies do not match any deployed blob and are
  not live versions: `swamivatsalya-rsvp-frontend.html` (61,025
  bytes) and `swamivatsalya-rsvp-frontend-BEFORE-announcements-2026-11-02.html`
  (57,794 bytes). Treat them as local working copies only.
- No frontend change was needed for backend Change 6 (RSVP nudge).
- v10 (2026-11-04) deployed by a single in-place upload commit
  (`1e8bd35`); verified byte-identical (60,435 bytes, SHA-256
  `b6bf1e1e88dc…`) from both raw.githubusercontent.com and the live
  Pages URL. Pages run #33 succeeded.
