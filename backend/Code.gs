/**
 * JCGS Swamivatsalya RSVP — Pilot Backend (Apps Script Web App)
 * Starter built 2026-10-26 from pilot-spec-2026-10-25.md. NOT deployed.
 *
 * Deploy under the TEMPLE's Google Workspace for Nonprofits account
 * (a service-style account, not a personal mailbox) — see README-DEPLOY.md.
 *
 * Rules baked in from the spec:
 * - Headcount only: name, adults, children, comment. No food/dish fields.
 * - No money, ever: no payment/donation fields anywhere.
 * - Either email OR WhatsApp number is mandatory; if both are given,
 *   confirmations / manage links / reminders go to BOTH.
 * - Counts are public; attendee names are never returned by listEvents.
 * - Capacity is enforced at write time inside a LockService lock.
 * - Dedupe: same email OR same phone for the same event updates the
 *   existing active RSVP instead of double-counting.
 * - Email is free via Workspace (MailApp, ~1,500/day on Workspace).
 * - WhatsApp sending is a STUB: automated WhatsApp needs the WhatsApp
 *   Business Platform (registered temple number, opt-in, approved
 *   templates, ~2c per US utility template message). Until WHATSAPP_*
 *   config below is filled in, WhatsApp messages are logged to the
 *   "Outbox" tab as PENDING so nothing is silently lost.
 */

var TZ = 'America/Los_Angeles';
var EVENTS_SHEET = 'Events';
var RSVPS_SHEET = 'RSVPs';
var OUTBOX_SHEET = 'Outbox';
var SUBSCRIBERS_SHEET = 'Subscribers';
var FRONTEND_URL = 'https://abhivrup.github.io/jcgs-swamivatsalya-rsvp/';
var ANNOUNCED_PROP_KEY = 'jcgs.rsvp.announced.v1';
var NUDGE_DAYS_BEFORE = 3; // Change 6: nudge goes out this many days before the event.

/** Change 7: max confirmation emails per address per hour (resend limit). */
var CONFIRM_LIMIT_PER_HOUR = 3;

// ---- WhatsApp Business Platform config (leave blank for email-first pilot) ----
var WHATSAPP_PHONE_NUMBER_ID = ''; // e.g. '123456789012345'
var WHATSAPP_ACCESS_TOKEN = '';     // store in Script Properties instead for real use
var WHATSAPP_REMINDER_TEMPLATE = 'swamivatsalya_reminder';
var WHATSAPP_CONFIRM_TEMPLATE = 'swamivatsalya_confirmation';

// ---------------------------------------------------------------- setup

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, EVENTS_SHEET, ['event_id', 'title', 'date', 'start_time', 'location', 'capacity', 'closes_at', 'status', 'note']);
  ensureSheet_(ss, RSVPS_SHEET, ['rsvp_id', 'event_id', 'name', 'email', 'phone', 'adults', 'children', 'comment', 'token', 'status', 'created_at', 'updated_at']);
  ensureSheet_(ss, OUTBOX_SHEET, ['queued_at', 'channel', 'to', 'kind', 'event_id', 'status', 'detail']);
  ensureSheet_(ss, SUBSCRIBERS_SHEET, ['email', 'token', 'subscribed_at', 'status']);
}

/** Run once from the editor to create the daily day-before reminder trigger. */
function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDayBeforeReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDayBeforeReminders').timeBased().everyDays(1).atHour(9).create();
}

/** Run once from the editor to create the 15-minute new-event announcement check. */
function installAnnouncementTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendNewEventAnnouncements') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendNewEventAnnouncements').timeBased().everyMinutes(15).create();
}

/** Run once from the editor to create the daily RSVP-nudge check (Change 6). */
function installNudgeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendRsvpNudges') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendRsvpNudges').timeBased().everyDays(1).atHour(9).create();
}

/** Run once from the editor to create the 1-minute queued-confirmation sender (v1.10). */
function installConfirmSenderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendQueuedConfirmations') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendQueuedConfirmations').timeBased().everyMinutes(1).create();
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); }
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

// ---------------------------------------------------------------- web app entry points

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'listEvents';
  try {
    if (action === 'listEvents') return json_({ ok: true, events: listEvents_() });
    if (action === 'myRsvps') return json_({ ok: true, rsvps: myRsvps_(String(e.parameter.token || '')) });
    if (action === 'myRsvpsAll') return json_({ ok: true, parts: myRsvpsAll_(String(e.parameter.tokens || '')) });
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'bad JSON' }); }
  try {
    if (body.action === 'createRsvp') { var r1 = createRsvp_(body); if (r1.ok) clearEventsCache_(); return json_(r1); }
    if (body.action === 'updateRsvp') { var r2 = updateRsvp_(body); if (r2.ok) clearEventsCache_(); return json_(r2); }
    if (body.action === 'cancelRsvp') { var r3 = cancelRsvp_(body); if (r3.ok) clearEventsCache_(); return json_(r3); }
    if (body.action === 'sendMyLink') return json_(sendMyLink_(body));
    if (body.action === 'subscribe') return json_(subscribe_(body));
    if (body.action === 'unsubscribe') return json_(unsubscribe_(body));
    if (body.action === 'confirmSubscribe') return json_(confirmSubscribe_(body));
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- events

var EVENTS_CACHE_KEY = 'jcgs.rsvp.events.v1';
var EVENTS_CACHE_TTL_SEC = 60;
function clearEventsCache_() { try { CacheService.getScriptCache().remove(EVENTS_CACHE_KEY); } catch (e) {} }

function listEvents_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(EVENTS_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  var events = readRows_(EVENTS_SHEET);
  var totals = headcounts_();
  var now = new Date();
  var result = events
    .filter(function (ev) { return ev.status === 'open'; })
    .filter(function (ev) { return new Date(ev.date) >= startOfDay_(now); })
    .map(function (ev) {
      var attending = totals[ev.event_id] || 0;
      return {
        event_id: ev.event_id, title: ev.title, date: ev.date, start_time: ev.start_time,
        location: ev.location, capacity: Number(ev.capacity),
        attending: attending, spots_left: Math.max(0, Number(ev.capacity) - attending),
        closes_at: ev.closes_at, note: ev.note || ''
        // counts only — names are never exposed here, per spec
      };
    });
  var json = JSON.stringify(result);
  if (json.length < 90000) cache.put(EVENTS_CACHE_KEY, json, EVENTS_CACHE_TTL_SEC);
  return result;
}

function headcounts_() {
  var totals = {};
  readRows_(RSVPS_SHEET).forEach(function (r) {
    if (r.status !== 'active') return;
    totals[r.event_id] = (totals[r.event_id] || 0) + Number(r.adults || 0) + Number(r.children || 0);
  });
  return totals;
}

// ---------------------------------------------------------------- rsvps

function createRsvp_(b) {
  var name = String(b.name || '').trim();
  var email = String(b.email || '').trim().toLowerCase();
  var phone = normalizePhone_(b.phone);
  var adults = clampCount_(b.adults), children = clampCount_(b.children);
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!email && !phone) return { ok: false, error: 'Either an email or a WhatsApp number is required.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'That email does not look right.' };
  if (adults + children < 1) return { ok: false, error: 'Headcount must be at least 1.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(RSVPS_SHEET);
    var ev = findEvent_(b.event_id);
    if (!ev) return { ok: false, error: 'Event not found.' };
    if (ev.status !== 'open') return { ok: false, error: 'RSVPs are closed for this event.' };

    // Dedupe: same email OR same phone already active for this event -> update it.
    var rows = readRows_(RSVPS_SHEET);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.event_id !== b.event_id || r.status !== 'active') continue;
      if ((email && r.email === email) || (phone && r.phone === phone)) {
        // v1.6: a resubmission that grows the party must pass the same
        // capacity check as a new RSVP (spots already held by this RSVP
        // do not count against it). Previously this path updated without
        // any check, so it could push an event over capacity.
        var others = (headcounts_()[b.event_id] || 0) - (Number(r.adults || 0) + Number(r.children || 0));
        if (others + adults + children > Number(ev.capacity)) {
          return { ok: false, error: 'Not enough spots left for that headcount.', spots_left: Math.max(0, Number(ev.capacity) - others) };
        }
        writeRsvpRow_(sh, i + 2, { name: name, email: email || r.email, phone: phone || r.phone, adults: adults, children: children, comment: String(b.comment || ''), updated_at: new Date() });
        // v1.6: notify the UPDATED contact, not the pre-update row, so a
        // changed email/phone gets the confirmation instead of the old one.
        // v1.10: queued, not sent inline — sending here made the tap wait.
        queueNotify_({ rsvp_id: r.rsvp_id, event_id: r.event_id, name: name, email: email || r.email, phone: phone || r.phone, adults: adults, children: children, token: r.token }, 'updated');
        return { ok: true, deduped: true, token: r.token, message: 'Your existing RSVP was updated (no double-count).' };
      }
    }

    // Capacity enforced here, at write time, inside the lock.
    var attending = (headcounts_()[b.event_id] || 0);
    if (attending + adults + children > Number(ev.capacity)) {
      return { ok: false, error: 'Not enough spots left for that headcount.', spots_left: Math.max(0, Number(ev.capacity) - attending) };
    }

    var token = Utilities.getUuid().replace(/-/g, '');
    var now = new Date();
    sh.appendRow([Utilities.getUuid(), b.event_id, name, email, phone, adults, children, String(b.comment || ''), token, 'active', now, now]);
    var created = { event_id: b.event_id, name: name, email: email, phone: phone, adults: adults, children: children, token: token };
    queueNotify_(created, 'confirmation'); // v1.10: queued, not sent inline
    return { ok: true, token: token };
  } finally {
    lock.releaseLock();
  }
}

function myRsvps_(token) {
  if (!token) return [];
  var rows = readRows_(RSVPS_SHEET);
  // Anchor on the token's row whatever its status: if the RSVP this
  // link was for has since been cancelled, the email still has other
  // active RSVPs and they must still show. (Bug 2026-11-05: on a new
  // device, cancelling the only RSVP that device knew emptied My
  // RSVPs entirely, hiding RSVPs made on other devices.)
  var mine = rows.filter(function (r) { return r.token === token; });
  if (!mine.length) return [];
  // One manage link now shows every RSVP under the same email, so a
  // second device sees all events — not just the one the link is for.
  // The token stays the proof: only someone holding a valid link for
  // that email can see its RSVPs. Phone-only rows (no email) keep the
  // old behaviour and return just their own RSVP.
  var email = String(mine[0].email || '').trim().toLowerCase();
  if (email) {
    mine = rows.filter(function (r) {
      return r.status === 'active' && String(r.email || '').trim().toLowerCase() === email;
    });
  } else {
    // Phone-only: the anchor row may itself be cancelled, so drop
    // non-active rows here (the email branch above already does).
    mine = mine.filter(function (r) { return r.status === 'active'; });
  }
  // Active events only — same rule as listEvents_: the event must still
  // be open and its date today or in the future. RSVPs for past (or
  // closed) events no longer show in My RSVPs.
  var now = new Date();
  var pairs = mine.map(function (r) {
    return { r: r, ev: findEvent_(r.event_id) };
  }).filter(function (pair) {
    return !!pair.ev && pair.ev.status === 'open' && new Date(pair.ev.date) >= startOfDay_(now);
  });
  // One RSVP per event: if duplicate rows exist for the same email and
  // event, show only the latest one — the most recently updated row
  // wins. (Dedupe at write time should prevent these, but old rows can
  // predate it.)
  var latest = {};
  pairs.forEach(function (pair) {
    var prev = latest[pair.r.event_id];
    if (!prev || rowTime_(pair.r) >= rowTime_(prev.r)) latest[pair.r.event_id] = pair;
  });
  return Object.keys(latest).map(function (eventId) {
    var pair = latest[eventId], r = pair.r, ev = pair.ev;
    // The row's own token travels with it, so Modify/Cancel work on
    // every event shown — not just the one the manage link was for.
    return { rsvp_id: r.rsvp_id, event_id: r.event_id, title: ev.title, date: ev.date, adults: r.adults, children: r.children, comment: r.comment, name: r.name, email: r.email, phone: r.phone, token: r.token };
  });
}

function rowTime_(r) {
  var t = new Date(r.updated_at || r.created_at || 0).getTime();
  return isNaN(t) ? 0 : t;
}

function myRsvpsAll_(tokensCsv) {
  var tokens = String(tokensCsv || '').split(',').map(function (t) { return t.trim(); }).filter(function (t) { return !!t; });
  var out = [];
  tokens.forEach(function (tok) { out.push({ token: tok, rsvps: myRsvps_(tok) }); });
  return out;
}

function updateRsvp_(b) {
  return mutateRsvp_(b, function (r, sh, rowIdx) {
    var ev = findEvent_(r.event_id);
    var others = (headcounts_()[r.event_id] || 0) - (Number(r.adults) + Number(r.children));
    var adults = clampCount_(b.adults), children = clampCount_(b.children);
    if (ev && others + adults + children > Number(ev.capacity)) return { ok: false, error: 'That change would exceed the event capacity.' };
    writeRsvpRow_(sh, rowIdx, { adults: adults, children: children, comment: String(b.comment == null ? r.comment : b.comment), updated_at: new Date() });
    if (ev) queueNotify_(r, 'updated'); // v1.10: queued, not sent inline
    return { ok: true };
  });
}

function cancelRsvp_(b) {
  return mutateRsvp_(b, function (r, sh, rowIdx) {
    sh.getRange(rowIdx, 10).setValue('cancelled'); // status column
    sh.getRange(rowIdx, 12).setValue(new Date());   // updated_at column
    var ev = findEvent_(r.event_id);
    if (ev) queueNotify_(r, 'cancelled'); // v1.10: queued, not sent inline
    return { ok: true };
  });
}

function mutateRsvp_(b, fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVPS_SHEET);
    var rows = readRows_(RSVPS_SHEET);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].token === String(b.token || '') && rows[i].rsvp_id === String(b.rsvp_id || '')) {
        if (rows[i].status !== 'active') return { ok: false, error: 'That RSVP is no longer active.' };
        return fn(rows[i], sh, i + 2);
      }
    }
    return { ok: false, error: 'RSVP not found for that manage link.' };
  } finally {
    lock.releaseLock();
  }
}

/** "Send me my link" from a different device: finds active RSVPs by email or phone. */
function sendMyLink_(b) {
  var email = String(b.email || '').trim().toLowerCase();
  var phone = normalizePhone_(b.phone);
  if (!email && !phone) return { ok: false, error: 'Give the email or WhatsApp number used for the RSVP.' };
  var match = readRows_(RSVPS_SHEET).filter(function (r) {
    return r.status === 'active' && ((email && r.email === email) || (phone && r.phone === phone));
  })[0];
  if (!match) return { ok: false, error: 'No active RSVP found for that contact.' };
  queueNotify_(match, 'manage-link'); // v1.10: queued, not sent inline
  return { ok: true };
}

// ---------------------------------------------------------------- reminders (daily trigger)

/** Runs daily via trigger: sends day-before reminders for tomorrow's events. */
function sendDayBeforeReminders() {
  var tomorrow = startOfDay_(new Date()); tomorrow.setDate(tomorrow.getDate() + 1);
  readRows_(EVENTS_SHEET).forEach(function (ev) {
    if (ev.status !== 'open') return;
    if (startOfDay_(new Date(ev.date)).getTime() !== tomorrow.getTime()) return;
    readRows_(RSVPS_SHEET).forEach(function (r) {
      if (r.event_id === ev.event_id && r.status === 'active') notify_(r, ev, 'reminder');
    });
  });
}

// ---------------------------------------------------------------- notifications

/**
 * Queue a user-triggered email (confirmation / updated / cancelled /
 * manage-link) instead of sending it inside the tap (v1.10).
 * MailApp.sendEmail is synchronous, so sending inline made every
 * Confirm tap wait ~1–3s extra. The RSVP row is written BEFORE the
 * queue row, so a send failure can never lose an RSVP — the row
 * stays visible in Outbox (FAILED with the error after a send
 * attempt throws; FAILED rows are not retried automatically).
 * The 1-minute trigger (installConfirmSenderTrigger) sends queued rows.
 */
function queueNotify_(rsvp, kind) {
  var detail = JSON.stringify({
    event_id: rsvp.event_id, name: rsvp.name, email: rsvp.email || '',
    phone: rsvp.phone || '', adults: rsvp.adults, children: rsvp.children,
    token: rsvp.token
  });
  logOutbox_(rsvp.email ? 'email' : 'whatsapp', rsvp.email || rsvp.phone || '', kind, rsvp.event_id, 'PENDING', detail);
}

/**
 * Sends queued confirmation/update/cancel/manage-link emails. Runs on
 * a 1-minute trigger (installConfirmSenderTrigger). Skips rows another
 * run is already sending (script lock). Each row is marked SENT only
 * after its email goes out, FAILED with the error if the send throws
 * (a later run does not retry FAILED rows — an organizer can see them
 * in Outbox). Reminder/announcement/nudge emails already run from
 * triggers and still send directly.
 */
function sendQueuedConfirmations() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // another run is sending; try next minute
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(OUTBOX_SHEET);
    if (!sh || sh.getLastRow() < 2) return;
    var values = sh.getDataRange().getValues();
    var col = {};
    values[0].forEach(function (h, j) { col[h] = j; });
    var QUEUED_KINDS = ['confirmation', 'updated', 'cancelled', 'manage-link'];
    for (var i = 1; i < values.length; i++) {
      var v = values[i];
      if (v[col.status] !== 'PENDING') continue;
      if (QUEUED_KINDS.indexOf(v[col.kind]) === -1) continue;
      var rowIdx = i + 1; // values[0] is the header (sheet row 1)
      try {
        var d = JSON.parse(v[col.detail] || '{}');
        var rsvp = { event_id: d.event_id, name: d.name, email: d.email, phone: d.phone, adults: d.adults, children: d.children, token: d.token };
        notify_(rsvp, findEvent_(d.event_id), v[col.kind]);
        sh.getRange(rowIdx, col.status + 1).setValue('SENT');
      } catch (e) {
        sh.getRange(rowIdx, col.status + 1).setValue('FAILED');
        try { sh.getRange(rowIdx, col.detail + 1).setValue(String(v[col.detail] || '') + ' | error: ' + String(e && e.message || e)); } catch (e2) {}
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sends via every channel the attendee provided (email and/or WhatsApp),
 * per the final contact rule. Email is live; WhatsApp queues to Outbox
 * until the Business Platform config above is filled in.
 */
function notify_(rsvp, ev, kind) {
  var appUrl = 'https://abhivrup.github.io/jcgs-swamivatsalya-rsvp/';
  var manageText = 'Manage or cancel your RSVP: ' + appUrl + '#token=' + rsvp.token;
  var title = ev ? (ev.title + ' — ' + ev.date + (ev.start_time ? ' at ' + ev.start_time : '')) : 'your Swamivatsalya RSVP';
  var people = (Number(rsvp.adults || 0) + Number(rsvp.children || 0));
  var body =
    kind === 'reminder' ? 'Reminder: Swamivatsalya tomorrow — ' + title + '. Your RSVP is for ' + people + ' people. ' + manageText :
    kind === 'cancelled' ? 'Your RSVP for ' + title + ' has been cancelled. ' + manageText :
    kind === 'manage-link' ? 'Here is your personal link to view, change, or cancel your Swamivatsalya RSVPs. ' + manageText :
    'Thank you — your Swamivatsalya RSVP is confirmed for ' + title + ' (' + people + ' people). ' + manageText;

  if (rsvp.email) {
    MailApp.sendEmail(rsvp.email, 'JCGS Swamivatsalya — ' + kind, body);
    logOutbox_('email', rsvp.email, kind, rsvp.event_id, 'SENT', '');
  }
  if (rsvp.phone) {
    sendWhatsApp_(rsvp.phone, kind, { title: title, people: people, manage: manageText }, rsvp.event_id);
  }
}

function sendWhatsApp_(phone, kind, params, eventId) {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    // Email-first pilot: nothing is lost — the intended message is queued
    // in the Outbox tab so an organizer can see/send it manually.
    logOutbox_('whatsapp', phone, kind, eventId, 'PENDING-CONFIG', JSON.stringify(params));
    return;
  }
  var template = kind === 'reminder' ? WHATSAPP_REMINDER_TEMPLATE : WHATSAPP_CONFIRM_TEMPLATE;
  var url = 'https://graph.facebook.com/v21.0/' + WHATSAPP_PHONE_NUMBER_ID + '/messages';
  var payload = {
    messaging_product: 'whatsapp', to: phone, type: 'template',
    template: { name: template, language: { code: 'en_US' } }
  };
  var resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + WHATSAPP_ACCESS_TOKEN },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  logOutbox_('whatsapp', phone, kind, eventId, resp.getResponseCode() === 200 ? 'SENT' : 'FAILED', resp.getContentText().slice(0, 300));
}

function logOutbox_(channel, to, kind, eventId, status, detail) {
  var sh = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), OUTBOX_SHEET, ['queued_at', 'channel', 'to', 'kind', 'event_id', 'status', 'detail']);
  sh.appendRow([new Date(), channel, to, kind, eventId || '', status, detail]);
}

// ---------------------------------------------------------------- new-event email announcements

/** One email per subscriber when a new event is posted. Runs on a 15-minute trigger (installAnnouncementTrigger). */
function sendNewEventAnnouncements() {
  var props = PropertiesService.getScriptProperties();
  var announced = {};
  try { JSON.parse(props.getProperty(ANNOUNCED_PROP_KEY) || '[]').forEach(function (id) { announced[id] = true; }); } catch (e) {}
  var now = new Date();
  var subs = readRows_(SUBSCRIBERS_SHEET).filter(function (s) { return s.status === 'active' && s.email; });
  var outbox = readRows_(OUTBOX_SHEET);
  // Reads Events directly (not listEvents_) so the 60-second list cache
  // never delays an announcement, and so a Sheet-added event is seen
  // even before any frontend load caches it.
  readRows_(EVENTS_SHEET).forEach(function (ev) {
    if (ev.status !== 'open') return;
    if (new Date(ev.date) < startOfDay_(now)) return;
    if (announced[ev.event_id]) return;
    subs.forEach(function (s) {
      // Duplicate guard: a SENT announcement row for this person+event
      // means a previous run already emailed them (e.g. it failed halfway).
      var already = outbox.some(function (o) { return o.channel === 'email' && o.to === s.email && o.kind === 'announcement' && String(o.event_id) === String(ev.event_id) && o.status === 'SENT'; });
      if (already) return;
      try {
        announceEmail_(s, ev);
      } catch (err) {
        // One bad address must not block every other subscriber.
        logOutbox_('email', s.email, 'announcement', ev.event_id, 'FAILED', String(err && err.message || err).slice(0, 300));
      }
    });
    announced[ev.event_id] = true;
    props.setProperty(ANNOUNCED_PROP_KEY, JSON.stringify(Object.keys(announced)));
  });
}

function announceEmail_(sub, ev) {
  var dateText = '';
  try { dateText = Utilities.formatDate(new Date(ev.date), TZ, 'EEEE, MMMM d, yyyy'); } catch (e) { dateText = String(ev.date); }
  var body = 'A new Swamivatsalya has been posted.\n\n' +
    ev.title + ' — ' + dateText + (ev.start_time ? ' at ' + ev.start_time : '') + '\n' +
    (ev.location ? 'Where: ' + ev.location + '\n' : '') +
    '\nSee the event and RSVP here: ' + FRONTEND_URL +
    '\n\nYou signed up for new-event emails. To stop them, open this link: ' + FRONTEND_URL + '#unsubscribe=' + sub.token;
  MailApp.sendEmail(sub.email, 'New Swamivatsalya: ' + ev.title + ' — ' + dateText, body);
  logOutbox_('email', sub.email, 'announcement', ev.event_id, 'SENT', '');
}

/** Change 6: daily check — one RSVP nudge per active subscriber who has not RSVP'd. */
function sendRsvpNudges() {
  var now = new Date();
  var target = startOfDay_(now); target.setDate(target.getDate() + NUDGE_DAYS_BEFORE);
  var subs = readRows_(SUBSCRIBERS_SHEET).filter(function (s) { return s.status === 'active' && s.email; });
  var rsvps = readRows_(RSVPS_SHEET);
  var outbox = readRows_(OUTBOX_SHEET);
  var totals = headcounts_();
  // Reads Events directly (not listEvents_) so the 60-second list cache
  // never delays or hides a nudge.
  readRows_(EVENTS_SHEET).forEach(function (ev) {
    if (ev.status !== 'open') return;
    if (startOfDay_(new Date(ev.date)).getTime() !== target.getTime()) return;
    if ((totals[ev.event_id] || 0) >= Number(ev.capacity)) return;
    subs.forEach(function (s) {
      var email = String(s.email || '').trim().toLowerCase();
      var hasRsvp = rsvps.some(function (r) { return r.event_id === ev.event_id && r.status === 'active' && String(r.email || '').trim().toLowerCase() === email; });
      if (hasRsvp) return;
      // Duplicate guard: a SENT nudge row for this person+event means a
      // previous run already emailed them (e.g. the check ran twice).
      var already = outbox.some(function (o) { return o.channel === 'email' && o.to === s.email && o.kind === 'rsvp-nudge' && String(o.event_id) === String(ev.event_id) && o.status === 'SENT'; });
      if (already) return;
      try {
        nudgeEmail_(s, ev);
      } catch (err) {
        logOutbox_('email', s.email, 'rsvp-nudge', ev.event_id, 'FAILED', String(err && err.message || err).slice(0, 300));
      }
    });
  });
}

function nudgeEmail_(sub, ev) {
  var dateText = '';
  try { dateText = Utilities.formatDate(new Date(ev.date), TZ, 'EEEE, MMMM d, yyyy'); } catch (e) { dateText = String(ev.date); }
  var body = 'Just a reminder to RSVP — no RSVP from you yet for this Swamivatsalya.\n\n' +
    ev.title + ' — ' + dateText + (ev.start_time ? ' at ' + ev.start_time : '') + '\n' +
    (ev.location ? 'Where: ' + ev.location + '\n' : '') +
    '\nRSVP here: ' + FRONTEND_URL +
    '\n\nYou signed up for new-event emails. To stop these emails, open this link: ' + FRONTEND_URL + '#unsubscribe=' + sub.token;
  MailApp.sendEmail(sub.email, 'Reminder to RSVP: ' + ev.title + ' — ' + dateText, body);
  logOutbox_('email', sub.email, 'rsvp-nudge', ev.event_id, 'SENT', '');
}

/** Signup from the app: one row per email; re-subscribing reactivates with a fresh token. */
function subscribe_(b) {
  var email = String(b.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'That email does not look right.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ensureSheet_(ss, SUBSCRIBERS_SHEET, ['email', 'token', 'subscribed_at', 'status']);
    var rows = readRows_(SUBSCRIBERS_SHEET);
    for (var k = 0; k < rows.length; k++) {
      if (rows[k].email === email) {
        // Change 7: already subscribed — no new email, nothing changes.
        if (rows[k].status === 'active') return { ok: true, token: rows[k].token, already: true };
        // Pending or unsubscribed: fresh token, back to pending, and send
        // a confirmation email. The row only becomes active when the
        // confirmation link is tapped (confirmSubscribe_).
        if (countRecentConfirms_(email) >= CONFIRM_LIMIT_PER_HOUR) {
          return { ok: false, error: 'Too many confirmation emails sent to this address. Please try again later.' };
        }
        var fresh = Utilities.getUuid().replace(/-/g, '');
        sh.getRange(k + 2, 2).setValue(fresh);
        sh.getRange(k + 2, 3).setValue(new Date());
        sh.getRange(k + 2, 4).setValue('pending');
        confirmEmail_(email, fresh);
        return { ok: true, token: fresh, needs_confirm: true };
      }
    }
    if (countRecentConfirms_(email) >= CONFIRM_LIMIT_PER_HOUR) {
      return { ok: false, error: 'Too many confirmation emails sent to this address. Please try again later.' };
    }
    var token = Utilities.getUuid().replace(/-/g, '');
    sh.appendRow([email, token, new Date(), 'pending']);
    confirmEmail_(email, token);
    return { ok: true, token: token, needs_confirm: true };
  } finally {
    lock.releaseLock();
  }
}

/** Change 7: confirm a subscription from the emailed link. Flips a pending row to active. */
function confirmSubscribe_(b) {
  var token = String(b.token || '').trim();
  if (!token) return { ok: false, error: 'This confirmation link is not valid. Please sign up again.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBSCRIBERS_SHEET);
    if (!sh) return { ok: false, error: 'This confirmation link is not valid. Please sign up again.' };
    var rows = readRows_(SUBSCRIBERS_SHEET);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].token === token) {
        if (rows[i].status === 'active') return { ok: true, email: rows[i].email, already: true };
        sh.getRange(i + 2, 4).setValue('active');
        return { ok: true, email: rows[i].email };
      }
    }
    return { ok: false, error: 'This confirmation link is not valid. Please sign up again.' };
  } finally {
    lock.releaseLock();
  }
}

/** Change 7: send the confirmation email with the tap-to-confirm link. */
function confirmEmail_(email, token) {
  var body = 'Please confirm you want new-event emails for Swamivatsalya (the community meal).\n\n' +
    'Tap this link to confirm: ' + FRONTEND_URL + '#confirm=' + token + '\n\n' +
    "If you didn't ask for this, just ignore this email — you won't be signed up and you won't get any more emails about it.";
  MailApp.sendEmail(email, 'Confirm your Swamivatsalya new-event emails', body);
  logOutbox_('email', email, 'subscribe-confirm', '', 'SENT', '');
}

/** Change 7: how many confirmation emails went to this address in the last hour. */
function countRecentConfirms_(email) {
  try {
    var rows = readRows_(OUTBOX_SHEET);
    var cutoff = new Date().getTime() - 3600000;
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].kind === 'subscribe-confirm' && rows[i].to === email) {
        var t = new Date(rows[i].queued_at).getTime();
        if (!isNaN(t) && t >= cutoff) n++;
      }
    }
    return n;
  } catch (e) {
    return 0;
  }
}

/** Unsubscribe by token. Always returns ok — never reveals whether an address is subscribed. */
function unsubscribe_(b) {
  var token = String(b.token || '').trim();
  if (!token) return { ok: true };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBSCRIBERS_SHEET);
    if (!sh) return { ok: true };
    var rows = readRows_(SUBSCRIBERS_SHEET);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].token === token && (rows[i].status === 'active' || rows[i].status === 'pending')) {
        sh.getRange(i + 2, 4).setValue('unsubscribed');
      }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- helpers

function readRows_(sheetName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    headers.forEach(function (h, j) { row[h] = values[i][j]; });
    out.push(row);
  }
  return out;
}

function findEvent_(eventId) {
  var events = readRows_(EVENTS_SHEET);
  for (var i = 0; i < events.length; i++) if (events[i].event_id === eventId) return events[i];
  return null;
}

function writeRsvpRow_(sh, rowIdx, patch) {
  var col = { name: 3, email: 4, phone: 5, adults: 6, children: 7, comment: 8, updated_at: 12 };
  Object.keys(patch).forEach(function (k) { sh.getRange(rowIdx, col[k]).setValue(patch[k]); });
}

function normalizePhone_(p) {
  var digits = String(p || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '1' + digits; // default US
  return digits;
}

function clampCount_(n) {
  n = parseInt(n, 10);
  if (isNaN(n) || n < 0) return 0;
  return Math.min(n, 50);
}

function startOfDay_(d) {
  var x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
