/**
 * Francisca & Lawrence — RSVP + Guestbook + Gift registry backend
 * ------------------------------------------------
 * Google Apps Script bound to a PRIVATE Google Sheet.
 *
 * Deploy as a Web App:  Execute as = Me (the couple),  Who has access = Anyone.
 * Guests only ever talk to this script's /exec URL; they never see the sheet
 * and nothing secret lives in the website. See site/DEPLOY.md.
 *
 * Contract: site/API_CONTRACT.md
 *   POST (text/plain JSON) action=rsvp | action=guestbook | action=pledge
 *   GET  ?action=guestbook | ?action=registry | ?action=ping
 *
 * The "Registry" and "Gift Pledges" tabs are created (and seeded) automatically
 * the first time the website asks for the gift list, so an already-set-up sheet
 * needs no manual step.
 *
 * FIRST TIME: select `setup` in the toolbar function menu and press Run.
 */

/* ============================== Settings ============================== */

/** Put an email address here to get an email for every RSVP and gift pledge (leave '' for none). */
var NOTIFY_EMAIL = '';

var SHEET_RSVP = 'RSVPs';
var SHEET_GUESTBOOK = 'Guestbook';
var SHEET_DASHBOARD = 'Dashboard';
var SHEET_REGISTRY = 'Registry';
var SHEET_PLEDGES = 'Gift Pledges';

var EVENTS = [
  'Church Ceremony & Reception',
  'Church Ceremony only',
  'Reception only'
];

var STATUS_ATTENDING = 'Attending';
var STATUS_DECLINED = 'Not Attending';

var RSVP_HEADERS = [
  'Submission Date', 'Guest Full Name', 'Phone Number', 'Attendance Status',
  'Number of Guests', 'Wedding Event', 'Message to Couple', 'RSVP Reference',
  'Client ID'
];
var GUESTBOOK_HEADERS = ['Submitted', 'Name', 'Message', 'Approved', 'Client ID'];
var REGISTRY_HEADERS = [
  'ID', 'Gift', 'Category', 'Quantity Wanted', 'Note', 'Show on Website', 'Chosen So Far'
];
var PLEDGE_HEADERS = [
  'Date', 'Guest Name', 'Phone', 'Item ID', 'Gift', 'Message', 'Reference', 'Client ID'
];

/**
 * Gifts written to the Registry tab the first time it is created. After that the
 * couple edits the tab directly; these are never re-applied.
 * qty null = unlimited (Quantity Wanted left blank).
 */
var REGISTRY_SEED = [
  { id: 'cash-gift', name: 'Cash gift', category: 'Money', qty: null, note: 'Bank details are just below' },
  { id: 'blender', name: 'Blender', category: 'Kitchen', qty: 1 },
  { id: 'tabletop-gas-cooker', name: 'Table-top gas cooker', category: 'Kitchen', qty: 1 },
  { id: 'air-fryer', name: 'Air fryer', category: 'Kitchen', qty: 1 },
  { id: 'microwave', name: 'Microwave oven', category: 'Kitchen', qty: 1 },
  { id: 'rice-cooker', name: 'Rice cooker', category: 'Kitchen', qty: 1 },
  { id: 'electric-kettle', name: 'Electric kettle', category: 'Kitchen', qty: 1 },
  { id: 'toaster', name: 'Sandwich maker / toaster', category: 'Kitchen', qty: 1 },
  { id: 'pressure-pot', name: 'Pressure pot', category: 'Kitchen', qty: 1 },
  { id: 'cookware-set', name: 'Non-stick pot set', category: 'Kitchen', qty: 1 },
  { id: 'food-flasks', name: 'Food flask set', category: 'Kitchen', qty: 1 },
  { id: 'dinner-set', name: 'Dinner set (plates & bowls)', category: 'Dining', qty: 1 },
  { id: 'cutlery-set', name: 'Cutlery set', category: 'Dining', qty: 1 },
  { id: 'glassware', name: 'Drinking glasses set', category: 'Dining', qty: 1 },
  { id: 'standing-fan', name: 'Rechargeable standing fan', category: 'Home', qty: 1 },
  { id: 'pressing-iron', name: 'Pressing iron', category: 'Home', qty: 1 },
  { id: 'water-dispenser', name: 'Water dispenser', category: 'Home', qty: 1 },
  { id: 'bedding-set', name: 'Bedsheet & duvet set', category: 'Bedroom', qty: 2 },
  { id: 'towel-set', name: 'Bath towel set', category: 'Bedroom', qty: 2 }
];
/** Rows 2..N of the Registry tab get the "Chosen So Far" formula, so new gifts typed below the seeds get it too. */
var REGISTRY_FORMULA_ROWS = 200;
var REGISTRY_ID_RE = /^[a-z0-9-]{1,40}$/;

var LIMITS = {
  nameMin: 2, nameMax: 80,
  phoneMinChars: 7, phoneMaxChars: 20, phoneMinDigits: 7, phoneMaxDigits: 15,
  guestsMin: 1, guestsMax: 5,
  rsvpMessageMax: 500,
  pledgeMessageMax: 200,
  guestbookMessageMin: 2, guestbookMessageMax: 400,
  maxUrlsInMessage: 2,
  maxBodyBytes: 10000,
  minFillMs: 3000,                 // a human needs at least 3 seconds
  maxFormAgeMs: 24 * 60 * 60 * 1000 // a form older than 24h must be refreshed
};

/*
 * Rate limiting (CacheService).
 * NOTE: Apps Script web apps are NOT told the client's IP address, so we
 * cannot rate-limit per IP. Instead we use:
 *   - a GLOBAL cap per minute across all visitors (protects quota / sheet),
 *   - a per-PHONE cap for RSVPs and a per-NAME cap for guestbook wishes.
 * This is "honest" protection suited to a wedding, not a bulletproof firewall.
 */
var RATE = {
  globalPerMinute: 30,
  perPhone: { max: 5, windowSec: 600 },
  perGuestbookName: { max: 3, windowSec: 600 },
  perPledgePhone: { max: 10, windowSec: 600 } // one guest may choose a few different gifts
};

var GUESTBOOK_CACHE_KEY = 'gb:approved:v1';
var GUESTBOOK_CACHE_SEC = 60;
var GUESTBOOK_MAX_ENTRIES = 50;

var REGISTRY_CACHE_KEY = 'reg:items:v1';
var REGISTRY_CACHE_SEC = 30;

var REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

var THEME = {
  espresso: '#3B241C', chocolate: '#65412F', gold: '#C6A15B',
  champagne: '#E8D5A8', ivory: '#FAF6EF', cream: '#F1E8DA', cocoa: '#2C1B16'
};

/* ============================== Entry points ============================== */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = String(p.action || 'ping');
    if (action === 'ping') return json_({ ok: true });
    if (action === 'guestbook') return json_({ ok: true, entries: getApprovedGuestbook_() });
    if (action === 'registry') return json_({ ok: true, items: getRegistryItems_() });
    // One-time first-run setup by visiting <web app URL>?action=setup. Ignored once done
    // (run setup() from the editor to re-apply formatting later).
    if (action === 'setup') {
      var props = PropertiesService.getScriptProperties();
      if (props.getProperty('SETUP_DONE')) return json_({ ok: true, setup: 'already done' });
      setup();
      props.setProperty('SETUP_DONE', new Date().toISOString());
      return json_({ ok: true, setup: 'done' });
    }
    return json_({ ok: false, error: 'Unknown request.' });
  } catch (err) {
    log_('doGet error', err);
    return json_({ ok: false, error: 'Something went wrong. Please try again later.' });
  }
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) return json_({ ok: false, error: 'Empty request.' });
    if (raw.length > LIMITS.maxBodyBytes) return json_({ ok: false, error: 'Your submission is too long.' });

    var body;
    try { body = JSON.parse(raw); } catch (parseErr) {
      return json_({ ok: false, error: 'We could not read your submission. Please refresh and try again.' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json_({ ok: false, error: 'We could not read your submission. Please refresh and try again.' });
    }

    if (body.action === 'rsvp') return json_(handleRsvp_(body));
    if (body.action === 'guestbook') return json_(handleGuestbook_(body));
    if (body.action === 'pledge') return json_(handlePledge_(body));
    return json_({ ok: false, error: 'Unknown request.' });
  } catch (err) {
    log_('doPost error', err);
    return json_({ ok: false, error: 'Something went wrong on our side. Please try again in a minute.' });
  }
}

/* ============================== RSVP ============================== */

function handleRsvp_(body) {
  // 1. Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (isHoneypotFilled_(body)) {
    return { ok: true, reference: generateReference_({}), duplicate: false };
  }

  // 2. Timing check.
  var timingError = checkTiming_(body.startedAt);
  if (timingError) return { ok: false, error: timingError };

  // 3. Validate + clean every field.
  var v = validateRsvp_(body);
  if (v.error) return { ok: false, error: v.error };
  var d = v.data;

  // 4. Write under a lock (prevents two simultaneous submissions racing).
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    return { ok: false, error: 'We are receiving lots of RSVPs right now. Please try again in a moment.' };
  }

  var result;
  try {
    if (!rateLimitGlobal_()) {
      return { ok: false, error: 'We are receiving lots of RSVPs right now. Please try again in a minute.' };
    }

    var sheet = getOrCreateSheet_(SHEET_RSVP, RSVP_HEADERS);
    var rows = readDataRows_(sheet, RSVP_HEADERS.length);

    // Duplicate check: same clientId OR same normalised phone number.
    var existingRefs = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var ref = String(r[7] || '');
      if (ref) existingRefs[ref] = true;
      var rowClientId = String(r[8] || '');
      if ((d.clientId && rowClientId === d.clientId) ||
          (normalisePhone_(r[2]) === d.phoneKey)) {
        return { ok: true, reference: ref, duplicate: true };
      }
    }

    if (!rateLimitKey_('rl:phone:' + d.phoneKey, RATE.perPhone.max, RATE.perPhone.windowSec)) {
      return { ok: false, error: 'Too many attempts for this phone number. Please try again later.' };
    }

    var reference = generateReference_(existingRefs);
    var now = new Date();
    var row = [
      now,
      safeCell_(d.name),
      d.phone,                         // column C is forced to plain text below
      d.attending ? STATUS_ATTENDING : STATUS_DECLINED,
      d.guests,
      d.event,
      safeCell_(d.message),
      reference,
      d.clientId
    ];
    var rowIndex = nextWritableRow_(sheet);
    // Keep phone (C), reference (H) and clientId (I) as text so "0803…" / "+234…" survive.
    sheet.getRange(rowIndex, 3, 1, 1).setNumberFormat('@');
    sheet.getRange(rowIndex, 8, 1, 2).setNumberFormat('@');
    sheet.getRange(rowIndex, 1, 1, 1).setNumberFormat('dd mmm yyyy, hh:mm');
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();

    result = { ok: true, reference: reference, duplicate: false };
  } finally {
    lock.releaseLock();
  }

  notifyCouple_(d, result.reference);
  return result;
}

/** Full-name rule shared by RSVP and gift pledges. Returns { value } or { error }. */
function validateFullName_(raw) {
  var name = cleanText_(raw, true);
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    return { error: 'Please enter your full name (' + LIMITS.nameMin + '–' + LIMITS.nameMax + ' characters).' };
  }
  if (!/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(name)) return { error: 'Please enter your full name.' };
  if (countUrls_(name) > 0) return { error: 'Please enter your name without links.' };
  return { value: name };
}

/** Phone rule shared by RSVP and gift pledges (7–20 chars, 7–15 digits). Returns { value } or { error }. */
function validatePhone_(raw) {
  var phone = cleanText_(raw, true);
  var digits = phone.replace(/\D/g, '');
  if (phone.length < LIMITS.phoneMinChars || phone.length > LIMITS.phoneMaxChars ||
      !/^\+?[0-9][0-9\s\-()]*$/.test(phone) ||
      digits.length < LIMITS.phoneMinDigits || digits.length > LIMITS.phoneMaxDigits) {
    return { error: 'Please enter a valid phone number, e.g. 0803 123 4567 or +234 803 123 4567.' };
  }
  return { value: phone };
}

function validateRsvp_(b) {
  var vn = validateFullName_(b.name);
  if (vn.error) return { error: vn.error };
  var name = vn.value;

  var vp = validatePhone_(b.phone);
  if (vp.error) return { error: vp.error };
  var phone = vp.value;

  var attendance = String(b.attendance || '');
  if (attendance !== 'accept' && attendance !== 'decline') {
    return { error: 'Please let us know whether you will attend.' };
  }
  var attending = attendance === 'accept';

  var guests = 0;
  if (attending) {
    var g = Number(b.guests);
    if (b.guests === null || b.guests === '' || !isFinite(g) || Math.floor(g) !== g ||
        g < LIMITS.guestsMin || g > LIMITS.guestsMax) {
      return { error: 'Number of guests must be between ' + LIMITS.guestsMin + ' and ' + LIMITS.guestsMax + '.' };
    }
    guests = g;
  }

  var event = cleanText_(b.event, true);
  if (attending) {
    if (EVENTS.indexOf(event) === -1) return { error: 'Please choose which part of the celebration you will attend.' };
  } else if (event && EVENTS.indexOf(event) === -1) {
    return { error: 'Please choose a valid wedding event.' };
  }

  var message = cleanText_(b.message, false);
  if (message.length > LIMITS.rsvpMessageMax) {
    return { error: 'Your message is a little long — please keep it under ' + LIMITS.rsvpMessageMax + ' characters.' };
  }
  if (countUrls_(message) > LIMITS.maxUrlsInMessage) return { error: 'Please remove the links from your message.' };

  return {
    data: {
      name: name,
      phone: phone,
      phoneKey: normalisePhone_(phone),
      attending: attending,
      guests: guests,
      event: event,
      message: message,
      clientId: cleanClientId_(b.clientId)
    }
  };
}

/* ============================== Guestbook ============================== */

function handleGuestbook_(body) {
  if (isHoneypotFilled_(body)) return { ok: true };

  var timingError = checkTiming_(body.startedAt);
  if (timingError) return { ok: false, error: timingError };

  var name = cleanText_(body.name, true);
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    return { ok: false, error: 'Please enter your name (' + LIMITS.nameMin + '–' + LIMITS.nameMax + ' characters).' };
  }
  if (countUrls_(name) > 0) return { ok: false, error: 'Please enter your name without links.' };

  var message = cleanText_(body.message, false);
  if (message.length < LIMITS.guestbookMessageMin) return { ok: false, error: 'Please write a short wish for the couple.' };
  if (message.length > LIMITS.guestbookMessageMax) {
    return { ok: false, error: 'Your wish is a little long — please keep it under ' + LIMITS.guestbookMessageMax + ' characters.' };
  }
  if (countUrls_(message) > LIMITS.maxUrlsInMessage) return { ok: false, error: 'Please remove the links from your message.' };

  var clientId = cleanClientId_(body.clientId);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    return { ok: false, error: 'Lots of wishes are arriving right now. Please try again in a moment.' };
  }
  try {
    if (!rateLimitGlobal_()) return { ok: false, error: 'Lots of wishes are arriving right now. Please try again in a minute.' };

    var sheet = getOrCreateSheet_(SHEET_GUESTBOOK, GUESTBOOK_HEADERS);
    if (clientId) {
      var rows = readDataRows_(sheet, GUESTBOOK_HEADERS.length);
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][4] || '') === clientId) return { ok: true }; // already stored
      }
    }

    var nameKey = name.toLowerCase().replace(/\s+/g, ' ');
    if (!rateLimitKey_('rl:gb:' + nameKey, RATE.perGuestbookName.max, RATE.perGuestbookName.windowSec)) {
      return { ok: false, error: 'Thank you! You have sent several wishes already — please try again later.' };
    }

    var rowIndex = nextWritableRow_(sheet);
    sheet.getRange(rowIndex, 1, 1, 1).setNumberFormat('dd mmm yyyy, hh:mm');
    sheet.getRange(rowIndex, 5, 1, 1).setNumberFormat('@');
    sheet.getRange(rowIndex, 4, 1, 1).setDataValidation(checkboxRule_());
    sheet.getRange(rowIndex, 1, 1, 5).setValues([[new Date(), safeCell_(name), safeCell_(message), false, clientId]]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/** Approved wishes only, newest first, max 50. Cached for ~60 seconds. */
function getApprovedGuestbook_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(GUESTBOOK_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) { /* fall through */ }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_GUESTBOOK);
  var entries = [];
  if (sheet) {
    var tz = ss.getSpreadsheetTimeZone ? ss.getSpreadsheetTimeZone() : Session.getScriptTimeZone();
    var rows = readDataRows_(sheet, GUESTBOOK_HEADERS.length);
    var approved = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var ok = r[3] === true || String(r[3]).toUpperCase() === 'TRUE';
      if (!ok || !String(r[1] || '').trim() || !String(r[2] || '').trim()) continue;
      approved.push({ when: isDate_(r[0]) ? r[0].getTime() : 0, idx: i, date: r[0], name: r[1], message: r[2] });
    }
    approved.sort(function (a, b) { return (b.when - a.when) || (b.idx - a.idx); });
    approved = approved.slice(0, GUESTBOOK_MAX_ENTRIES);
    for (var j = 0; j < approved.length; j++) {
      var a = approved[j];
      entries.push({
        name: String(a.name),
        message: String(a.message),
        date: isDate_(a.date) ? Utilities.formatDate(a.date, tz, 'yyyy-MM-dd') : ''
      });
    }
  }
  try { cache.put(GUESTBOOK_CACHE_KEY, JSON.stringify(entries), GUESTBOOK_CACHE_SEC); } catch (ignore) { /* too big etc. */ }
  return entries;
}

/* ============================== Gift registry ============================== */

/**
 * Visible gifts in sheet order, with live counts. Cached ~30 s; the cache is
 * cleared after every successful pledge. Creates the registry tabs on first use.
 */
function getRegistryItems_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(REGISTRY_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) { /* fall through */ }
  }

  var sheets = ensureRegistrySheets_();
  var registry = readRegistry_(sheets.registry);
  var counts = countPledges_(readDataRows_(sheets.pledges, PLEDGE_HEADERS.length));
  var items = [];
  for (var i = 0; i < registry.list.length; i++) {
    var it = registry.list[i];
    if (!it.visible) continue;
    items.push(registryItemJson_(it, counts[it.id] || 0));
  }
  try { cache.put(REGISTRY_CACHE_KEY, JSON.stringify(items), REGISTRY_CACHE_SEC); } catch (ignore) { /* too big etc. */ }
  return items;
}

function registryItemJson_(it, chosen) {
  return {
    id: it.id,
    name: it.name,
    category: it.category,
    note: it.note,
    wanted: it.wanted,
    chosen: chosen,
    remaining: it.wanted === null ? null : Math.max(0, it.wanted - chosen)
  };
}

function handlePledge_(body) {
  // 1. Honeypot: pretend success, store nothing.
  if (isHoneypotFilled_(body)) {
    return { ok: true, reference: generateReference_({}, 'GF-'), itemName: '', remaining: null, duplicate: false };
  }

  // 2. Timing check.
  var timingError = checkTiming_(body.startedAt);
  if (timingError) return { ok: false, error: timingError };

  // 3. Validate + clean.
  var v = validatePledge_(body);
  if (v.error) return { ok: false, error: v.error };
  var d = v.data;

  // 4. Everything that reads counts and writes happens under one lock, so two
  //    guests can never both take the last unit of a gift.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    return { ok: false, error: 'Lots of guests are choosing gifts right now. Please try again in a moment.' };
  }

  var result, item;
  try {
    if (!rateLimitGlobal_()) {
      return { ok: false, error: 'Lots of guests are choosing gifts right now. Please try again in a minute.' };
    }

    var sheets = ensureRegistrySheetsUnlocked_(SpreadsheetApp.getActiveSpreadsheet());
    var registry = readRegistry_(sheets.registry);       // fresh, never cached
    var rows = readDataRows_(sheets.pledges, PLEDGE_HEADERS.length);
    var counts = countPledges_(rows);

    // Duplicates (checked before availability, so a retry after the last unit
    // went to this very guest still gets their reference back).
    var existingRefs = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var ref = String(r[6] || '');
      if (ref) existingRefs[ref] = true;
      var rowItem = String(r[3] || '').trim().toLowerCase();
      var sameClient = d.clientId && String(r[7] || '') === d.clientId;
      var samePhoneItem = rowItem === d.itemId && normalisePhone_(r[2]) === d.phoneKey;
      if (sameClient || samePhoneItem) {
        var known = registry.byId[rowItem];
        return {
          ok: true,
          reference: ref,
          itemName: known ? known.name : String(r[4] || ''),
          remaining: known ? registryItemJson_(known, counts[rowItem] || 0).remaining : null,
          duplicate: true
        };
      }
    }

    item = registry.byId[d.itemId];
    if (!item || !item.visible) return { ok: false, error: 'That gift is no longer on the list.' };

    var chosen = counts[item.id] || 0;
    if (item.wanted !== null && chosen >= item.wanted) {
      return { ok: false, error: 'Someone has just chosen this gift. Please pick another.', soldOut: true };
    }

    if (!rateLimitKey_('rl:pledge:' + d.phoneKey, RATE.perPledgePhone.max, RATE.perPledgePhone.windowSec)) {
      return { ok: false, error: 'Too many attempts for this phone number. Please try again later.' };
    }

    var reference = generateReference_(existingRefs, 'GF-');
    var sheet = sheets.pledges;
    var row = [
      new Date(),
      safeCell_(d.name),
      d.phone,
      item.id,
      safeCell_(item.name),
      safeCell_(d.message),
      reference,
      d.clientId
    ];
    var rowIndex = nextWritableRow_(sheet);
    sheet.getRange(rowIndex, 1, 1, 1).setNumberFormat('dd mmm yyyy, hh:mm');
    sheet.getRange(rowIndex, 3, 1, 2).setNumberFormat('@');  // phone + item ID as text
    sheet.getRange(rowIndex, 7, 1, 2).setNumberFormat('@');  // reference + client ID
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();

    CacheService.getScriptCache().remove(REGISTRY_CACHE_KEY);
    result = {
      ok: true,
      reference: reference,
      itemName: item.name,
      remaining: item.wanted === null ? null : Math.max(0, item.wanted - chosen - 1),
      duplicate: false
    };
  } finally {
    lock.releaseLock();
  }

  notifyPledge_(d, item, result.reference);
  return result;
}

function validatePledge_(b) {
  var itemId = cleanText_(b.itemId, true).toLowerCase();
  if (!REGISTRY_ID_RE.test(itemId)) return { error: 'That gift is no longer on the list.' };

  var vn = validateFullName_(b.name);
  if (vn.error) return { error: vn.error };

  var vp = validatePhone_(b.phone);
  if (vp.error) return { error: vp.error };

  var message = cleanText_(b.message, false);
  if (message.length > LIMITS.pledgeMessageMax) {
    return { error: 'Your message is a little long — please keep it under ' + LIMITS.pledgeMessageMax + ' characters.' };
  }
  if (countUrls_(message) > LIMITS.maxUrlsInMessage) return { error: 'Please remove the links from your message.' };

  return {
    data: {
      itemId: itemId,
      name: vn.value,
      phone: vp.value,
      phoneKey: normalisePhone_(vp.value),
      message: message,
      clientId: cleanClientId_(b.clientId)
    }
  };
}

/**
 * Parses the Registry tab as the couple left it. Rows with an empty ID or Gift,
 * an invalid ID, a repeated ID or an unreadable quantity are skipped.
 * Returns { list: [item…] in sheet order, byId: { id: item } } (hidden items included).
 */
function readRegistry_(sheet) {
  var rows = readDataRows_(sheet, 6);
  var list = [];
  var byId = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var id = String(r[0] === null || r[0] === undefined ? '' : r[0]).trim().toLowerCase();
    var name = cleanText_(r[1], true);
    if (!id || !name || !REGISTRY_ID_RE.test(id) || byId[id]) continue;

    var wanted = null;
    var q = r[3];
    if (!(q === '' || q === null || q === undefined || String(q).trim() === '')) {
      var n = Number(q);
      if (!isFinite(n) || n < 0) continue; // e.g. "two" — skip rather than guess
      wanted = Math.floor(n);
    }
    var item = {
      id: id,
      name: name,
      category: cleanText_(r[2], true),
      wanted: wanted,
      note: cleanText_(r[4], true),
      visible: r[5] === true || String(r[5]).toUpperCase() === 'TRUE'
    };
    list.push(item);
    byId[id] = item;
  }
  return { list: list, byId: byId };
}

/** Pledges per item ID, counted from the Gift Pledges rows (not the sheet formula). */
function countPledges_(rows) {
  var counts = {};
  for (var i = 0; i < rows.length; i++) {
    var id = String(rows[i][3] || '').trim().toLowerCase();
    if (id) counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

/**
 * Lazily creates the Registry / Gift Pledges tabs (the live sheet was set up
 * before the registry existed). Fast path without a lock when both exist;
 * otherwise re-checks under the script lock so two first requests can't
 * create or seed twice.
 */
function ensureRegistrySheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var registry = ss.getSheetByName(SHEET_REGISTRY);
  var pledges = ss.getSheetByName(SHEET_PLEDGES);
  if (registry && pledges) {
    repairRegistryFormulasOnce_(registry);
    return { registry: registry, pledges: pledges };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // throws on timeout → caller's generic error
  try {
    return ensureRegistrySheetsUnlocked_(ss);
  } finally {
    lock.releaseLock();
  }
}

/** Same as ensureRegistrySheets_, for callers that already hold the script lock (or setup()). */
function ensureRegistrySheetsUnlocked_(ss) {
  // Gift Pledges first: the Registry's COUNTIF formulas reference it, and Sheets
  // won't re-resolve a formula written before the tab it names exists.
  var pledges = ss.getSheetByName(SHEET_PLEDGES);
  if (!pledges) {
    pledges = ss.insertSheet(SHEET_PLEDGES);
    formatPledgesSheet_(pledges);
  }
  var registry = ss.getSheetByName(SHEET_REGISTRY);
  if (!registry) {
    registry = ss.insertSheet(SHEET_REGISTRY);
    formatRegistrySheet_(registry);
    seedRegistry_(registry);
  }
  SpreadsheetApp.flush();
  return { registry: registry, pledges: pledges };
}

function seedRegistry_(sheet) {
  var values = [];
  for (var i = 0; i < REGISTRY_SEED.length; i++) {
    var g = REGISTRY_SEED[i];
    values.push([g.id, g.name, g.category, g.qty === null ? '' : g.qty, g.note || '', true]);
  }
  sheet.getRange(2, 1, values.length, 6).setValues(values);

  writeRegistryFormulas_(sheet);
}

/** "Chosen So Far" (G) is for the couple's eyes only; the script counts pledges itself. */
function writeRegistryFormulas_(sheet) {
  var formulas = [];
  for (var r = 2; r <= REGISTRY_FORMULA_ROWS; r++) {
    formulas.push(['=IF(A' + r + '="","",COUNTIF(\'' + SHEET_PLEDGES + '\'!D:D,A' + r + '))']);
  }
  sheet.getRange(2, 7, formulas.length, 1).setFormulas(formulas);
}

/**
 * One-time fix for sheets whose Registry was created before Gift Pledges existed
 * (formulas showed "Unresolved sheet name"). Rewrites column G only, once.
 */
function repairRegistryFormulasOnce_(registry) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('REGISTRY_FORMULAS_V2')) return;
  writeRegistryFormulas_(registry);
  props.setProperty('REGISTRY_FORMULAS_V2', new Date().toISOString());
}

/** Headers + formatting only; never touches gift rows. Safe to re-run. */
function formatRegistrySheet_(sheet) {
  var n = REGISTRY_HEADERS.length;
  if (sheet.getMaxRows() < REGISTRY_FORMULA_ROWS) {
    sheet.insertRowsAfter(sheet.getMaxRows(), REGISTRY_FORMULA_ROWS - sheet.getMaxRows());
  }
  var header = sheet.getRange(1, 1, 1, n);
  header.setValues([REGISTRY_HEADERS]);
  styleHeader_(header);
  header.setNote('Gift list shown on the website (updates within about 30 seconds).\n' +
    'ID: short unique code, lowercase letters, numbers and dashes only (e.g. blender).\n' +
    'Quantity Wanted: leave blank for unlimited (e.g. Cash gift).\n' +
    'Untick "Show on Website" to hide a gift. "Chosen So Far" is calculated — do not type in it.');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);

  var widths = [170, 260, 120, 130, 280, 130, 130];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);

  var rows = sheet.getMaxRows() - 1;
  sheet.getRange(2, 1, rows, n).setFontFamily('Arial').setFontColor(THEME.cocoa).setVerticalAlignment('top');
  sheet.getRange(2, 1, rows, 1).setNumberFormat('@').setFontFamily('Courier New');
  sheet.getRange(2, 4, rows, 1).setNumberFormat('0').setHorizontalAlignment('center');
  sheet.getRange(2, 5, rows, 1).setWrap(true);
  // Checkbox via data validation (empty rows stay blank = hidden until ticked).
  sheet.getRange(2, 6, rows, 1).setDataValidation(checkboxRule_()).setHorizontalAlignment('center');
  sheet.getRange(2, 7, rows, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor(THEME.chocolate);

  applyBanding_(sheet, n);
  ensureFilter_(sheet, n);
  sheet.setTabColor(THEME.champagne);
}

function formatPledgesSheet_(sheet) {
  var n = PLEDGE_HEADERS.length;
  var header = sheet.getRange(1, 1, 1, n);
  header.setValues([PLEDGE_HEADERS]);
  styleHeader_(header);
  header.setNote('Filled in by the website when a guest chooses a gift. Delete a row to free that gift up again.');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);

  var widths = [150, 200, 150, 160, 220, 300, 120, 120];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);

  var rows = sheet.getMaxRows() - 1;
  sheet.getRange(2, 1, rows, n).setFontFamily('Arial').setFontColor(THEME.cocoa).setVerticalAlignment('top');
  sheet.getRange(2, 1, rows, 1).setNumberFormat('dd mmm yyyy, hh:mm');
  sheet.getRange(2, 3, rows, 2).setNumberFormat('@');
  sheet.getRange(2, 6, rows, 1).setWrap(true);
  sheet.getRange(2, 7, rows, 2).setNumberFormat('@');
  sheet.getRange(2, 7, rows, 1).setHorizontalAlignment('center').setFontFamily('Courier New');

  applyBanding_(sheet, n);
  ensureFilter_(sheet, n);
  sheet.hideColumns(8); // Client ID
  sheet.setTabColor(THEME.gold);
}

function notifyPledge_(d, item, reference) {
  if (!NOTIFY_EMAIL || !item) return;
  try {
    var subject = 'New gift pledge: ' + d.name + ' — ' + item.name;
    var text = [
      'Name: ' + d.name,
      'Phone: ' + d.phone,
      'Gift: ' + item.name,
      'Message: ' + (d.message || '—'),
      'Reference: ' + reference,
      '',
      'Open the sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
    ].join('\n');
    MailApp.sendEmail(NOTIFY_EMAIL, subject, text);
  } catch (err) {
    log_('pledge notify failed', err); // never fail the guest's pledge because email failed
  }
}

/* ============================== Spam / rate limit ============================== */

function isHoneypotFilled_(body) {
  var w = body.website;
  return w !== undefined && w !== null && String(w).trim() !== '';
}

/** Returns an error message, or '' when the timing looks human. */
function checkTiming_(startedAt) {
  var t = Number(startedAt);
  if (!startedAt || !isFinite(t)) return 'Please refresh the page and try again.';
  var elapsed = Date.now() - t;
  // A negative value means the guest's phone clock is ahead of Google's; we
  // cannot judge speed then, so we let it through rather than block a real guest.
  if (elapsed >= 0 && elapsed < LIMITS.minFillMs) return 'That was quick! Please take a moment and submit again.';
  if (elapsed > LIMITS.maxFormAgeMs) return 'This page has been open for a long time. Please refresh the page and try again.';
  return '';
}

function countUrls_(s) {
  var m = String(s || '').match(/(https?:\/\/|www\.)/gi);
  return m ? m.length : 0;
}

function rateLimitGlobal_() {
  var bucket = Math.floor(Date.now() / 60000);
  return rateLimitKey_('rl:global:' + bucket, RATE.globalPerMinute, 120);
}

/** Increments a counter in CacheService. Returns false if over the limit. Call inside the lock. */
function rateLimitKey_(key, max, windowSec) {
  var cache = CacheService.getScriptCache();
  var count = Number(cache.get(key) || 0);
  if (count >= max) return false;
  cache.put(key, String(count + 1), windowSec);
  return true;
}

/* ============================== Helpers ============================== */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Trim, strip control characters; singleLine collapses all whitespace. */
function cleanText_(v, singleLine) {
  if (v === undefined || v === null) return '';
  var s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, '');
  s = s.replace(/\r\n?/g, '\n');
  if (singleLine) s = s.replace(/\s+/g, ' ');
  else s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** Spreadsheet formula-injection protection: = + - @ at the start become text. */
function safeCell_(s) {
  s = String(s === undefined || s === null ? '' : s);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function cleanClientId_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : '';
}

/**
 * Canonical phone key: digits only, Nigerian numbers as 234XXXXXXXXXX.
 *   0803 123 4567 | +234 803 123 4567 | 2348031234567 | 00234... | +234 0803... → 2348031234567
 */
function normalisePhone_(raw) {
  var d = String(raw === undefined || raw === null ? '' : raw).replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.length === 11 && d.charAt(0) === '0') d = '234' + d.slice(1);
  else if (d.length === 14 && d.indexOf('2340') === 0) d = '234' + d.slice(4);
  else if (d.length === 10 && /^[789]/.test(d)) d = '234' + d; // "803 123 4567"
  return d;
}

/** Unique reference such as FL-7K3Q9P (RSVP) or GF-7K3Q9P (gift pledge). */
function generateReference_(existing, prefix) {
  existing = existing || {};
  for (var attempt = 0; attempt < 50; attempt++) {
    var ref = prefix || 'FL-';
    for (var i = 0; i < 6; i++) ref += REF_ALPHABET.charAt(Math.floor(Math.random() * REF_ALPHABET.length));
    if (!existing[ref]) return ref;
  }
  throw new Error('Could not generate a unique reference');
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** All data rows (row 2 .. last row), numCols wide. */
function readDataRows_(sheet, numCols) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, numCols).getValues();
}

/** Next empty row, adding more rows to the sheet if it is full. */
function nextWritableRow_(sheet) {
  var row = Math.max(sheet.getLastRow(), 1) + 1;
  var max = sheet.getMaxRows();
  if (row > max) sheet.insertRowsAfter(max, 200);
  return row;
}

function checkboxRule_() {
  return SpreadsheetApp.newDataValidation().requireCheckbox().build();
}

function notifyCouple_(d, reference) {
  if (!NOTIFY_EMAIL) return;
  try {
    var subject = 'New RSVP: ' + d.name + ' — ' + (d.attending ? 'Attending (' + d.guests + ')' : 'Not attending');
    var text = [
      'Name: ' + d.name,
      'Phone: ' + d.phone,
      'Attendance: ' + (d.attending ? STATUS_ATTENDING : STATUS_DECLINED),
      'Guests: ' + d.guests,
      'Event: ' + (d.event || '—'),
      'Message: ' + (d.message || '—'),
      'Reference: ' + reference,
      '',
      'Open the RSVP sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
    ].join('\n');
    MailApp.sendEmail(NOTIFY_EMAIL, subject, text);
  } catch (err) {
    log_('notify failed', err); // never fail the guest's RSVP because email failed
  }
}

function log_(label, err) {
  try { console.error(label + ': ' + (err && err.stack ? err.stack : err)); } catch (ignore) { /* noop */ }
}

/* ============================== One-time setup ============================== */

/**
 * Run ONCE from the Apps Script editor (select "setup" → Run, then authorise).
 * Safe to run again: it never deletes RSVP or guestbook rows; it only re-applies
 * headers, formatting and rebuilds the Dashboard tab.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  setupRsvpSheet_(ss);
  setupGuestbookSheet_(ss);
  // Gift registry: create + seed if missing, then (re-)apply formatting. Gift rows are never touched.
  var reg = ensureRegistrySheetsUnlocked_(ss);
  formatRegistrySheet_(reg.registry);
  formatPledgesSheet_(reg.pledges);
  setupDashboard_(ss);
  var dash = ss.getSheetByName(SHEET_DASHBOARD);
  ss.setActiveSheet(dash);
  ss.moveActiveSheet(1);
  // Remove the empty default "Sheet1" if it is still there and blank.
  var s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  SpreadsheetApp.flush();
  return 'Setup complete';
}

function styleHeader_(range) {
  range.setBackground(THEME.espresso)
    .setFontColor(THEME.champagne)
    .setFontWeight('bold')
    .setFontFamily('Georgia')
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center')
    .setWrap(true);
}

function applyBanding_(sheet, numCols) {
  var bandings = sheet.getBandings();
  for (var i = 0; i < bandings.length; i++) bandings[i].remove();
  sheet.getRange(1, 1, sheet.getMaxRows(), numCols)
    .applyRowBanding(SpreadsheetApp.BandingTheme.BROWN, true, false)
    .setHeaderRowColor(THEME.espresso)
    .setFirstRowColor('#FFFFFF')
    .setSecondRowColor(THEME.ivory);
}

function ensureFilter_(sheet, numCols) {
  var existing = sheet.getFilter();
  if (existing) existing.remove();
  sheet.getRange(1, 1, sheet.getMaxRows(), numCols).createFilter();
}

function setupRsvpSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_RSVP) || ss.insertSheet(SHEET_RSVP);
  var n = RSVP_HEADERS.length;
  if (sheet.getMaxRows() < 500) sheet.insertRowsAfter(sheet.getMaxRows(), 500 - sheet.getMaxRows());
  if (sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());

  var header = sheet.getRange(1, 1, 1, n);
  header.setValues([RSVP_HEADERS]);
  styleHeader_(header);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);

  var widths = [150, 220, 150, 130, 110, 230, 360, 120, 120];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);

  var rows = sheet.getMaxRows() - 1;
  sheet.getRange(2, 1, rows, n).setFontFamily('Arial').setFontColor(THEME.cocoa).setVerticalAlignment('top');
  sheet.getRange(2, 1, rows, 1).setNumberFormat('dd mmm yyyy, hh:mm');
  sheet.getRange(2, 3, rows, 1).setNumberFormat('@');   // phone stays text (leading 0 / +)
  sheet.getRange(2, 8, rows, 2).setNumberFormat('@');
  sheet.getRange(2, 4, rows, 2).setHorizontalAlignment('center');
  sheet.getRange(2, 8, rows, 1).setHorizontalAlignment('center').setFontFamily('Courier New');
  sheet.getRange(2, 7, rows, 1).setWrap(true);

  sheet.getRange(2, 4, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList([STATUS_ATTENDING, STATUS_DECLINED], true)
      .setAllowInvalid(false).build());
  sheet.getRange(2, 5, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(0, LIMITS.guestsMax)
      .setAllowInvalid(false).setHelpText('0 for "Not Attending", otherwise 1–' + LIMITS.guestsMax).build());
  sheet.getRange(2, 6, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(EVENTS, true).setAllowInvalid(true).build());

  applyBanding_(sheet, n);
  ensureFilter_(sheet, n);
  sheet.hideColumns(9); // Client ID — technical, keeps the view clean
  sheet.setTabColor(THEME.gold);
}

function setupGuestbookSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_GUESTBOOK) || ss.insertSheet(SHEET_GUESTBOOK);
  var n = GUESTBOOK_HEADERS.length;
  if (sheet.getMaxRows() < 500) sheet.insertRowsAfter(sheet.getMaxRows(), 500 - sheet.getMaxRows());

  var header = sheet.getRange(1, 1, 1, n);
  header.setValues([GUESTBOOK_HEADERS]);
  styleHeader_(header);
  header.setNote('Tick "Approved" to show a wish on the website (appears within about a minute).');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);

  var widths = [150, 200, 460, 100, 120];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);

  var rows = sheet.getMaxRows() - 1;
  sheet.getRange(2, 1, rows, n).setFontFamily('Arial').setFontColor(THEME.cocoa).setVerticalAlignment('top');
  sheet.getRange(2, 1, rows, 1).setNumberFormat('dd mmm yyyy, hh:mm');
  sheet.getRange(2, 3, rows, 1).setWrap(true);
  sheet.getRange(2, 5, rows, 1).setNumberFormat('@');
  // Checkbox via data validation (does NOT fill empty rows with FALSE).
  sheet.getRange(2, 4, rows, 1).setDataValidation(checkboxRule_()).setHorizontalAlignment('center');

  applyBanding_(sheet, n);
  ensureFilter_(sheet, n);
  sheet.hideColumns(5);
  sheet.setTabColor(THEME.chocolate);
}

function setupDashboard_(ss) {
  var sheet = ss.getSheetByName(SHEET_DASHBOARD) || ss.insertSheet(SHEET_DASHBOARD);
  // The dashboard holds only formulas/labels, so rebuilding it is safe.
  sheet.clear();
  sheet.clearConditionalFormatRules && sheet.clearConditionalFormatRules();
  var merged = sheet.getRange(1, 1, sheet.getMaxRows(), Math.min(sheet.getMaxColumns(), 6));
  merged.breakApart();
  sheet.setHiddenGridlines(true);
  sheet.setTabColor(THEME.espresso);

  var R = "'" + SHEET_RSVP + "'!";
  var G = "'" + SHEET_GUESTBOOK + "'!";
  var st = '"' + STATUS_ATTENDING + '"';
  var sd = '"' + STATUS_DECLINED + '"';

  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 150);
  sheet.getRange(1, 1, 60, 4).setFontFamily('Georgia').setFontColor(THEME.cocoa).setBackground(THEME.ivory);

  // Title
  sheet.getRange(1, 1).setValue('Francisca & Lawrence — RSVP Dashboard');
  sheet.getRange(1, 1, 1, 4).merge()
    .setBackground(THEME.espresso).setFontColor(THEME.champagne).setFontSize(18).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 48);
  sheet.getRange(2, 1).setValue('Saturday, 19 December 2026 · Figures update automatically as guests respond');
  sheet.getRange(2, 1, 1, 4).merge()
    .setFontStyle('italic').setFontColor(THEME.chocolate).setHorizontalAlignment('center');

  // Summary
  sectionHeader_(sheet, 4, 'Summary');
  var summary = [
    ['Total responses', '=COUNTA(' + R + 'H2:H)'],
    ['Confirmed RSVPs (attending)', '=COUNTIF(' + R + 'D2:D,' + st + ')'],
    ['Declined invitations', '=COUNTIF(' + R + 'D2:D,' + sd + ')'],
    ['Expected guest count (people)', '=SUMIF(' + R + 'D2:D,' + st + ',' + R + 'E2:E)'],
    ['Latest submission', '=IF(COUNT(' + R + 'A2:A)=0,"No responses yet",MAX(' + R + 'A2:A))']
  ];
  writeMetrics_(sheet, 5, summary);
  sheet.getRange(9, 2).setNumberFormat('dd mmm yyyy, hh:mm');
  sheet.getRange(8, 2).setFontSize(16).setFontColor(THEME.espresso);

  // By event
  sectionHeader_(sheet, 11, 'By wedding event');
  var sub = sheet.getRange(12, 1, 1, 4);
  sub.setValues([['Wedding Event', 'Attending RSVPs', 'Expected guests', 'Declined']])
    .setBackground(THEME.cream).setFontWeight('bold').setFontColor(THEME.chocolate);
  for (var i = 0; i < EVENTS.length; i++) {
    var r = 13 + i;
    var a = '$A' + r;
    sheet.getRange(r, 1).setValue(EVENTS[i]);
    sheet.getRange(r, 2).setFormula('=COUNTIFS(' + R + '$F$2:$F,' + a + ',' + R + '$D$2:$D,' + st + ')');
    sheet.getRange(r, 3).setFormula('=SUMIFS(' + R + '$E$2:$E,' + R + '$F$2:$F,' + a + ',' + R + '$D$2:$D,' + st + ')');
    sheet.getRange(r, 4).setFormula('=COUNTIFS(' + R + '$F$2:$F,' + a + ',' + R + '$D$2:$D,' + sd + ')');
  }
  var totalRow = 13 + EVENTS.length;
  sheet.getRange(totalRow, 1).setValue('Total');
  sheet.getRange(totalRow, 2).setFormula('=SUM(B13:B' + (totalRow - 1) + ')');
  sheet.getRange(totalRow, 3).setFormula('=SUM(C13:C' + (totalRow - 1) + ')');
  sheet.getRange(totalRow, 4).setFormula('=SUM(D13:D' + (totalRow - 1) + ')');
  sheet.getRange(totalRow, 1, 1, 4).setFontWeight('bold').setBorder(true, false, false, false, false, false,
    THEME.gold, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange(13, 2, EVENTS.length + 1, 3).setHorizontalAlignment('center');

  // Guestbook
  var gbRow = totalRow + 2;
  sectionHeader_(sheet, gbRow, 'Guestbook');
  writeMetrics_(sheet, gbRow + 1, [
    ['Wishes waiting for approval', '=COUNTIFS(' + G + 'B2:B,"<>",' + G + 'D2:D,FALSE)'],
    ['Approved wishes (shown on website)', '=COUNTIF(' + G + 'D2:D,TRUE)']
  ]);

  // Gifts
  var P = "'" + SHEET_PLEDGES + "'!";
  var giftRow = gbRow + 4;
  sectionHeader_(sheet, giftRow, 'Gifts');
  writeMetrics_(sheet, giftRow + 1, [
    ['Gifts chosen (different items)', '=IFERROR(COUNTUNIQUE(' + P + 'D2:D),0)'],
    ['Gift pledges (total)', '=COUNTA(' + P + 'G2:G)']
  ]);

  // Export help
  var helpRow = giftRow + 4;
  sectionHeader_(sheet, helpRow, 'How to export');
  var help = [
    'Excel: open the RSVPs tab, then File → Download → Microsoft Excel (.xlsx).',
    'CSV: open the RSVPs tab, then File → Download → Comma-separated values (.csv) — exports the current tab only.',
    'To approve a guestbook wish, tick its box in the "Approved" column of the Guestbook tab.',
    'Gifts: add, edit or hide items in the Registry tab; guests\' choices appear in the Gift Pledges tab.',
    'Please do not rename the RSVPs / Guestbook / Registry / Gift Pledges tabs or reorder their columns — the website uses them.'
  ];
  for (var h = 0; h < help.length; h++) {
    sheet.getRange(helpRow + 1 + h, 1).setValue(help[h]);
    sheet.getRange(helpRow + 1 + h, 1, 1, 4).merge().setWrap(true)
      .setFontColor(THEME.chocolate).setFontSize(10);
  }

  sheet.setFrozenRows(2);
}

function sectionHeader_(sheet, row, title) {
  sheet.getRange(row, 1).setValue(title);
  sheet.getRange(row, 1, 1, 4).merge()
    .setBackground(THEME.chocolate).setFontColor(THEME.champagne).setFontWeight('bold').setFontSize(12)
    .setBorder(false, false, true, false, false, false, THEME.gold, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setRowHeight(row, 30);
}

function writeMetrics_(sheet, startRow, metrics) {
  for (var i = 0; i < metrics.length; i++) {
    var r = startRow + i;
    sheet.getRange(r, 1).setValue(metrics[i][0]).setFontColor(THEME.chocolate);
    sheet.getRange(r, 2, 1, 3).merge();
    sheet.getRange(r, 2).setFormula(metrics[i][1]).setFontWeight('bold').setFontSize(13)
      .setFontColor(THEME.espresso).setHorizontalAlignment('left');
    sheet.getRange(r, 1, 1, 4).setBorder(false, false, true, false, false, false,
      THEME.champagne, SpreadsheetApp.BorderStyle.SOLID);
  }
}
