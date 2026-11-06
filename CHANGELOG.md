# Changelog — JCGS Swamivatsalya RSVP app

Backend versions live in `backend/Code.gs` in this repo (one commit per
change). Frontend versions live in the GitHub repo
`abhivrup/jcgs-swamivatsalya-rsvp` — see `FRONTEND_HISTORY.md` for the
grouped version list. Deploy status is the truth that matters: backend v1.6 is deployed
(confirmed 2026-11-04). v1.7 was never deployed on its own — v1.8
contains it and was redeployed by him 2026-11-05 ~18:14 PST (backend
alive confirmed via listEvents; version proof pending the
second-device test). v1.9 was redeployed by him 2026-11-05 ~18:29
PST (he said "Done"; behaviour proof is the single-card My RSVPs
on the second device). v1.10 is pending one redeploy.

Status words: Deployed = running on the test backend / live Pages site.
Pending = code written and checked, not yet deployed. Never deployed
versions are still version-controlled so any of them can be restored
or reviewed exactly.

## Backend
### Backend v1.0 — starter (2026-10-26) — DEPLOYED

- Starter backend from the pilot spec: Events/RSVPs/Outbox tabs,
  headcount-only RSVPs, dedupe by email OR phone, capacity enforced
  at write time, email confirmations + day-before reminder code
  (`sendDayBeforeReminders`, trigger NOT confirmed installed),
  counts public / names never returned.
- Change 1 (`myRsvps_` returning name, email, phone for cross-device
  prefill) was specified 2026-11-01, then verified already present
  in this file — no code change, no separate commit.
- Deployed: pasted into the Sheet-bound Apps Script project and
  deployed as a Web app 2026-10-31 (test Sheet + test backend).
  Known live limitation: `notify_` manage links point at the script
  URL, not the app (fixed by Change 2, pending).
- Verified: syntax check passes. Source: pristine starter snapshot.

### Backend v1.1 — Change 2 (2026-11-01) — DEPLOYED (as part of v1.5, 2026-11-04)

- `notify_`: manage links now point at the frontend app
  (`https://abhivrup.github.io/jcgs-swamivatsalya-rsvp/`) instead of
  `ScriptApp.getService().getUrl()`. One-line change.
- Why: confirmation / manage-link emails must open the app, not the
  script URL.
- Verified: syntax check passes; diff to v1.0 is exactly this line.
  Spec: `backend-changes-2026-11-01.txt`, Change 2.

### Backend v1.2 — Change 3 (2026-11-01) — DEPLOYED (as part of v1.5, 2026-11-04)

- 60-second `CacheService` cache for the events list in `listEvents_`,
  cleared on every successful create/update/cancel in `doPost`.
  Capacity checks still read live Sheet rows inside the lock, so the
  cache can never overbook. Keep-warm pings deliberately left out.
- Why: every `listEvents` call re-opened the Sheet and paid full
  Apps Script startup (~3–4s measured 2026-11-01).
- Verified: syntax check passes; diff to v1.1 is exactly the cache
  helpers, the cache read/store in `listEvents_`, and the three
  cache-clearing `doPost` branches.
  Spec: `backend-changes-2026-11-01.txt`, Change 3.

### Backend v1.3 — Change 4 (2026-11-01) — DEPLOYED (as part of v1.5, 2026-11-04)

- New `myRsvpsAll` action returning all of one person's RSVPs in a
  single call (reuses `myRsvps_`, so it includes the name/email/phone
  fields). Backend half only; the frontend still calls `myRsvps`
  once per token until a later frontend deploy.
- Why: the My RSVPs tab was slow from sequential per-token calls.
- Verified: syntax check passes; diff to v1.2 is exactly the `doGet`
  branch plus the `myRsvpsAll_` function.
  Spec: `backend-changes-2026-11-01.txt`, Change 4.

### Backend v1.4 — Change 5: email announcements (2026-11-02) — DEPLOYED (as part of v1.5, 2026-11-04)

- New `Subscribers` tab (`email, token, subscribed_at, status`),
  `subscribe` / `unsubscribe` actions (dedupe by email, token links),
  `sendNewEventAnnouncements()` on a 15-minute trigger: one email per
  active subscriber per new event, announced marker in Script
  Properties + Outbox `announcement` rows as the duplicate guard.
  Frontend signup form deployed separately (frontend v9).
- Needs after redeploy: run `setupSheet()` once and
  `installAnnouncementTrigger()` once. Until the trigger is
  installed, no announcement email is sent and signups error.
- Revert: delete the trigger for an instant stop; sent emails
  cannot be recalled.
- Verified: syntax check passes; diff to v1.3 is exactly the Change 5
  constants, setup line, `doPost` branches, four functions, installer,
  and section header. Backups kept (pre-announcement snapshot).
  Spec: `email-announcements-scope-2026-11-01.md` and
  `backend-changes-2026-11-01.txt`, Change 5.

### Backend v1.5 — Change 6: RSVP nudge (2026-11-04) — DEPLOYED 2026-11-04

- New daily 9 AM check `sendRsvpNudges()`: one email, 3 days before
  an event (`NUDGE_DAYS_BEFORE = 3`, one constant sets timing), to
  active subscribers who have not RSVP'd for that event. Skips
  closed/past events and full events; matches by lowercased email
  (phone-only RSVPs cannot be matched and may still get a nudge).
  Outbox `rsvp-nudge` SENT rows stop duplicates. Unsubscribing stops
  both announcements and nudges (shared Subscribers status).
  No frontend change; requires Change 5.
- Needs after redeploy: run `installNudgeTrigger()` once (plus the
  Change 5 runs). Do not run `sendRsvpNudges()` by hand with real
  subscriber addresses — it sends real emails.
- Revert: delete the `sendRsvpNudges` trigger for an instant stop.
- Verified: syntax check passes; diff to v1.4 is exactly the
  constant, installer, two functions, and their comments, matching
  the paste steps in the changes file byte-for-byte (ignoring
  indentation). Backups kept (pre-nudge snapshot).
  Spec: `rsvp-nudge-scope-2026-11-04.md` and
  `backend-changes-2026-11-01.txt`, Change 6.

### Backend v1.6 — dedupe capacity fix (2026-11-04) — DEPLOYED 2026-11-04

- `createRsvp_`: the duplicate-match path now runs the same capacity
  check as a new RSVP — other attendees' headcount plus the new party
  must fit within capacity; the RSVP's own held spots do not count
  against it. Previously a resubmission could grow a party past
  capacity without any check. The check runs inside the existing
  lock, like the new-RSVP check.
- Same path now notifies the UPDATED contact: if a resubmission
  changes the email/phone, the confirmation goes to the new address
  instead of the old row's address.
- No frontend change needed: the page already shows the backend's
  "Not enough spots left" error as a message.
- Needs after redeploy: nothing new — no trigger or setup re-runs
  for this change (run the pending Change 5/6 trigger installs if
  they have not been run yet).
- Revert: redeploy v1.5.
- Verified: syntax check passes; diff to v1.5 is exactly the
  capacity block, the notify argument change, and their comments.
  Found by the 2026-11-04 full test/review pass.
- Deployed: redeployed as a new version 2026-11-04 evening (same
  /exec URL); live /exec check after redeploy returns ok:true.
  Live behavior proof (resubmit over capacity rejected) still open —
  needs a live test RSVP, not yet run.

### Backend v1.7 — subscription confirmation link (2026-11-04) — PENDING (current)

- `subscribe_` no longer subscribes immediately. A new or
  re-subscribing address gets status `pending` and a confirmation
  email with a tap-to-confirm link (`#confirm=<token>`); only the new
  `confirmSubscribe` action flips the row to `active`. An already
  active address signs up again with no new email (`already: true`).
- Announcements and the nudge already send only to `active` rows, so
  pending rows get nothing — no change needed there.
- Resend limit: at most 3 confirmation emails per address per hour
  (`CONFIRM_LIMIT_PER_HOUR = 3`, counted from Outbox
  `subscribe-confirm` rows); past it the form says to try later.
  No expiry on the link; an unconfirmed pending row just sits there.
- `unsubscribe_` by token now also works on a `pending` row.
- Frontend v11 handles both answers: `needs_confirm: true` shows the
  "check your email" step with resend / use-a-different-email, while
  the old backend's plain ok still shows "You're signed up". So the
  page can deploy before this backend redeploy with no mismatch.
- Needs after redeploy: nothing new — no trigger or setup re-runs
  (the three installed triggers keep working; no new trigger).
- Revert: redeploy v1.6 + redeploy frontend v10.
- Verified: syntax check passes; diff to v1.6 is exactly the
  `subscribe_` rewrite, `confirmSubscribe_`, `confirmEmail_`,
  `countRecentConfirms_`, the unsubscribe condition, and the doPost
  branch. Spec: `rsvp-confirm-scope-2026-11-04.md`.

### Backend v1.8 — My RSVPs shows all events for the email, active events only (2026-11-05) — PENDING (current)

- Bug reported 2026-11-05: on a second device, opening a manage link
  showed only that link's event, not the person's other RSVPs. Cause:
  one token per RSVP row, and the page only knew the tokens stored on
  that device — so a fresh device saw a single event.
- `myRsvps_` now expands from the link's token to the email on that
  row and returns every active RSVP under the same email (matched
  case-insensitively; emails are stored lowercased). The token stays
  the proof — only someone holding a valid manage link for that email
  can see its RSVPs. Phone-only rows (no email) keep the old
  behaviour and return just their own RSVP. `myRsvpsAll_` inherits
  the fix automatically (it calls `myRsvps_` per token).
- Active events only, per his ask: results are filtered to events
  that are still `open` with a date of today or later — the same rule
  `listEvents_` uses. RSVPs for past (or closed) events no longer
  show in My RSVPs.
- No frontend change needed: the page already renders every RSVP the
  backend returns for a token (`buildMine_` flattens them). Note the
  page keeps a 7-day cached copy of My RSVPs, so a device that
  already loaded the old view refreshes to the new one on its next
  background refresh.
- Needs after redeploy: nothing new — no trigger or setup re-runs.
  Redeploying v1.8 also ships v1.7 (confirmation link), so the
  Friday 09:41 probe for v1.7 answers the same for v1.8.
- Revert: redeploy v1.6 (loses the v1.7 confirmation link too) or
  v1.7 (keeps the confirmation link, loses this fix).
- Verified: syntax check passes; diff to v1.7 is exactly the
  `myRsvps_` rewrite.

### Backend v1.9 — My RSVPs shows only the latest RSVP per event + each row carries its own token (2026-11-05) — PENDING (current)

- Bug reported 2026-11-05 ~18:18 PST: after the v1.8 fix, one manage
  link showed Test Event 2 three times. Root cause (verified by the
  18:22 browser read of the Sheet): NOT duplicate rows — the Sheet
  holds exactly one active test-2 row for that email. The page calls
  `myRsvps` once per stored token, and the device held 3 tokens
  (test-1/2/3 RSVPs); v1.8's email expansion returned the same
  test-2 row once per token (test-1 is past, test-3 is 'close', so
  only test-2 survived the filter, 3 times).
- `myRsvps_` now keeps only the latest RSVP per event — the most
  recently updated row wins (`rowTime_`: updated_at, else
  created_at, else sheet order). One card per event, always the
  current headcount.
- Each returned row now also carries its own `token`. The page
  (frontend v12) uses it, so Modify/Cancel work on every event
  shown — not just the one the manage link was for. Without this,
  v1.8's expanded rows would have failed Modify/Cancel with "RSVP
  not found for that manage link" on any event but the link's own
  (the page used to stamp every row with the link's token).
- No other behaviour change: still all events for the email, still
  active events only (open + today or later).
- Needs after redeploy: nothing new — no trigger or setup re-runs.
  Frontend v12 must deploy with it (the token line is harmless
  against the old backend: `r.token` is simply absent, so the page
  falls back to the link token as before).
- Revert: redeploy v1.8 + frontend v11 (triplicates return).
- Verified: syntax check passes; diff to v1.8 is exactly the
  `myRsvps_` latest-per-event dedupe, the `token` field, and the
  `rowTime_` helper.

### Backend v1.10 — My RSVPs survives cancelling the link's own RSVP + confirmation emails send in the background (2026-11-05) — PENDING (current)

- Bug reported 2026-11-05 ~19:07 PST: on a new device, opening
  the app and RSVP'ing showed previous RSVPs fine — but after
  cancelling the RSVP just made, My RSVPs went empty, hiding the
  RSVPs made on other devices. Root cause: `myRsvps_` anchored
  the email expansion on the token's own ACTIVE row, so once that
  row was cancelled the call returned nothing at all. Fix: the
  anchor is now the token's row whatever its status; the expansion
  still returns active rows only (phone-only rows re-apply the
  active filter, since they have no email to expand on).
- Speed (his pick, option 2, 2026-11-05 ~19:05 PST): user-triggered
  emails — confirmation, updated, cancelled, manage-link — are now
  QUEUED to Outbox (`queueNotify_`, status PENDING) instead of
  sent inside the tap. A 1-minute trigger
  (`sendQueuedConfirmations`, installer
  `installConfirmSenderTrigger`, idempotent like the other three)
  sends queued rows: it claims the script lock (skips the run if
  another is sending), re-resolves the event, calls the existing
  `notify_` (same email text), then marks the row SENT — or
  FAILED with the error if the send throws (FAILED rows are not
  retried automatically; they stay visible in Outbox). The RSVP
  row is written BEFORE the queue row, so a send failure can
  never lose an RSVP. Reminder/announcement/nudge emails already
  run from triggers and still send directly. The confirmation
  screen now says the email is on its way (frontend v15).
- Needs after redeploy: run `installConfirmSenderTrigger()` ONCE
  in the editor (no redeploy needed for triggers). Until it runs,
  confirmation emails queue as PENDING and never send — verify
  the first confirmation email arrives within ~2 minutes of a
  test RSVP. No setupSheet re-run needed.
- Revert: redeploy v1.9 + frontend v14 (emails go back to
  synchronous; the cancel bug returns).
- Verified: syntax check passes; diff to v1.9 is exactly the
  `myRsvps_` anchor fix, the five `notify_` → `queueNotify_`
  swaps, and the new `queueNotify_` / `sendQueuedConfirmations` /
  `installConfirmSenderTrigger` functions.

## Frontend (GitHub repo `abhivrup/jcgs-swamivatsalya-rsvp`) — DEPLOYED

Frontend versions are already git-controlled on GitHub. The distinct
live versions, grouped by `index.html` content hash (see
`FRONTEND_HISTORY.md`), newest last:

- v1 (2026-10-25) demo test app (page-memory sample events).
- v2 (2026-10-31) wired to the test backend; JCGS logo icon added.
- v3 (2026-10-31) logo in the page (header + favicon).
- v4 (2026-11-01) RSVP prefill from last RSVP.
- v5 (2026-11-01) My RSVPs date fix.
- v6 (2026-11-01) date fix + parallel loading speed.
- v7 (2026-11-01) cached fast-load (7-day cache, background refresh).
- v8 (2026-11-01) instant tab switching, badge taps register.
- v9 (2026-11-02) announcements signup form — superseded by v10 on
  2026-11-04; backend half pending (backend v1.4). No frontend change
  for the nudge (v1.5).
- v10 (2026-11-04) phone/WhatsApp fields disabled, email-only — live
  (commit `1e8bd35`, byte-verified).

## Deploy log

- 2026-10-31: backend v1.0 deployed (test Sheet/backend); frontend
  v2/v3 deployed same day.
- 2026-11-01: frontend v4–v8 deployed (Pages queue jam mid-day;
  same content re-deployed in places — see FRONTEND_HISTORY.md).
- 2026-11-02: frontend v9 deployed. Backend Changes 1–5 still pending.
- 2026-11-04: backend v1.5 (Change 6) written; backend v1.5 confirmed
  live the same day (the deployed `/exec` endpoint answers the new
  `myRsvpsAll` action). Trigger runs (setupSheet /
  installAnnouncementTrigger / installNudgeTrigger) still unconfirmed.
  Friday 2026-11-06 reminder set for the Sheet-side action.
- 2026-11-04: frontend v10 deployed (phone fields disabled).
