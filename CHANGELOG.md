# Changelog — JCGS Swamivatsalya RSVP app

Backend versions live in `backend/Code.gs` in this repo (one commit per
change). Frontend versions live in the GitHub repo
`abhivrup/jcgs-swamivatsalya-rsvp` — see `FRONTEND_HISTORY.md` for the
grouped version list. Deploy status is the truth that matters: backend v1.5 is deployed
(confirmed 2026-11-04). v1.6 is pending one redeploy.

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

### Backend v1.6 — dedupe capacity fix (2026-11-04) — PENDING (current)

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
