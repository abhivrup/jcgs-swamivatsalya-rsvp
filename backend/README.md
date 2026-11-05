# JCGS Swamivatsalya RSVP — backend version history

Backend source history for the RSVP app (`Code.gs`, Apps Script),
kept in this repo alongside the frontend (`index.html` at the repo
root). The full per-change git history is kept in a local repo; this
copy was uploaded to GitHub as one batch on 2026-11-04 — see
`CHANGELOG.md` for the version-by-version record.

## Layout

- `backend/Code.gs` — the backend source, current version (v1.5, pending deploy).
- `CHANGELOG.md` — every version, what changed, and whether it is deployed.
- `FRONTEND_HISTORY.md` — frontend versions, grouped from the GitHub
  commit log by distinct `index.html` content (the upload/delete/rename
  triples in that log are single deploys; see that file).

## Version scheme (backend)

- `v1.0` — the 2026-10-26 starter. **This is the only version deployed**
  to the test backend (pasted 2026-10-31).
- `v1.1` — Change 2 (manage-link URL fix). Pending.
- `v1.2` — Change 3 (60-second events cache). Pending.
- `v1.3` — Change 4 (`myRsvpsAll`). Pending.
- `v1.4` — Change 5 (email announcements). Pending.
- `v1.5` — Change 6 (RSVP nudge). Pending. Current HEAD.

Change 1 (`myRsvps_` returning name/email/phone) needed no commit: the
fields were already in the starter file, verified 2026-11-02 and again
when this history was built. It is documented in the CHANGELOG.

All of v1.1–v1.5 go live in ONE redeploy (new version of the existing
Web app deployment, same `/exec` URL) plus the one-time trigger runs.
Until then, nothing in v1.1–v1.5 has sent a real email or changed the
live backend. Deploy status is recorded in `CHANGELOG.md` — update it
(and tag the deployed commit) when the redeploy happens.

## How this history was built

Started 2026-11-04, backfilled from verified snapshots: the pristine
starter file, the pre-announcement and pre-nudge backups, and the
current file. Changes 2–4 were re-applied to the starter from the
exact steps in `backend-changes-2026-11-01.txt`; the result was
checked byte-identical against the state derived by stripping
Change 5 from the pre-nudge backup. Every committed `Code.gs` passes
a syntax check. Commit dates are the dates each change was
specified/built (midday local — exact clock times were not recorded
for the local assembly). Author is Abhishek Shah. The per-change
commits live in the local history; this GitHub copy is a
single-batch upload of the current state (2026-11-04).

## Adding a future change

1. Edit `backend/Code.gs` here (and `index.html` at the repo root
   if the frontend changes).
2. Commit with a message naming the change, e.g. `Change 7: ...`.
3. Add a CHANGELOG entry with date, status (Pending until deployed),
   and verification done.
4. When it is deployed, update CHANGELOG deploy status and move/add
   a `backend-vX.Y-deployed` tag to that commit.

## No secrets

`Code.gs` contains no passwords, tokens, or keys (WhatsApp config is
blank by design). Never commit Sheet IDs with private data beyond
what is already in the change docs, and never commit RSVP tokens.
