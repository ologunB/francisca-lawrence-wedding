#!/usr/bin/env node
/*
 * Local test harness for the Apps Script backend — run with:  node backend/tests.js
 * Loads Code.js (from this folder) into a Node vm context with small, realistic in-memory mocks of
 * SpreadsheetApp / CacheService / LockService / ContentService / Utilities / MailApp.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const CODE_FILE = 'Code.js';
const CODE = fs.readFileSync(path.join(__dirname, CODE_FILE), 'utf8');

/* ---------------------------- mocks ---------------------------- */

// Any method we don't model explicitly (formatting etc.) is a chainable no-op.
function chainable(target) {
  const proxy = new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'symbol' || p === 'then' || p === 'toJSON') return undefined;
      return function () { return proxy; };
    }
  });
  return proxy;
}

const isEmpty = (v) => v === '' || v === null || v === undefined;

function makeSheet(name) {
  const s = {
    name, cells: [], maxRows: 1000, maxCols: 26, rawWrites: [], formulas: {}, validations: [],
    getName: () => name,
    getMaxRows: () => s.maxRows,
    getMaxColumns: () => s.maxCols,
    insertRowsAfter: (after, n) => { s.maxRows += n; return sheetProxy; },
    insertColumnsAfter: (after, n) => { s.maxCols += n; return sheetProxy; },
    getLastRow: () => {
      for (let r = s.cells.length - 1; r >= 0; r--) {
        if (s.cells[r] && s.cells[r].some((v) => !isEmpty(v))) return r + 1;
      }
      return 0;
    },
    getBandings: () => [],
    getFilter: () => null,
    clear: () => { s.cells = []; s.formulas = {}; return sheetProxy; },
    getRange: (row, col, nr = 1, nc = 1) => {
      if (typeof row !== 'number') throw new Error('mock only supports numeric getRange');
      if (row < 1 || col < 1 || row + nr - 1 > s.maxRows || col + nc - 1 > s.maxCols) {
        throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      }
      const range = {
        getValues: () => {
          const out = [];
          for (let r = 0; r < nr; r++) {
            const line = [];
            for (let c = 0; c < nc; c++) {
              const rowArr = s.cells[row - 1 + r];
              const v = rowArr ? rowArr[col - 1 + c] : undefined;
              line.push(isEmpty(v) ? '' : v);
            }
            out.push(line);
          }
          return out;
        },
        getValue: () => range.getValues()[0][0],
        setValues: (vals) => {
          if (vals.length !== nr || vals.some((l) => l.length !== nc)) {
            throw new Error(`setValues dimension mismatch: data ${vals.length}x${vals[0].length}, range ${nr}x${nc}`);
          }
          vals.forEach((line, r) => line.forEach((v, c) => {
            s.rawWrites.push({ row: row + r, col: col + c, value: v });
            // Like Sheets: a leading apostrophe forces text and is not part of the value.
            const stored = typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v;
            if (!s.cells[row - 1 + r]) s.cells[row - 1 + r] = [];
            s.cells[row - 1 + r][col - 1 + c] = stored;
          }));
          return rangeProxy;
        },
        // Like Sheets: setValue/setFormula on a multi-cell range fills every cell.
        setValue: (v) => { range.setValues(Array.from({ length: nr }, () => Array(nc).fill(v))); return rangeProxy; },
        setFormula: (f) => { s.formulas[`${row},${col}`] = f; range.setValue(f); return rangeProxy; },
        setFormulas: (fs2) => {
          fs2.forEach((line, r) => line.forEach((f, c) => { s.formulas[`${row + r},${col + c}`] = f; }));
          range.setValues(fs2); return rangeProxy;
        },
        setDataValidation: (rule) => { s.validations.push({ row, col, nr, nc, rule }); return rangeProxy; }
      };
      const rangeProxy = chainable(range);
      return rangeProxy;
    }
  };
  const sheetProxy = chainable(s);
  return sheetProxy;
}

function makeEnv() {
  const sheets = [];
  const mail = [];
  const cacheStore = new Map();
  const lockState = { held: false, acquired: 0 };

  const ss = chainable({
    getSheetByName: (n) => sheets.find((x) => x.name === n) || null,
    insertSheet: (n) => { const sh = makeSheet(n); sheets.push(sh); return sh; },
    getSheets: () => sheets.slice(),
    deleteSheet: (sh) => { sheets.splice(sheets.indexOf(sh), 1); },
    getSpreadsheetTimeZone: () => 'Africa/Lagos',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/mock'
  });

  const ctx = {
    console: { log() {}, error() {}, warn() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush: () => {},
      newDataValidation: () => chainable({ build: () => ({ kind: 'rule' }) }),
      BandingTheme: { BROWN: 'BROWN', LIGHT_GREY: 'LIGHT_GREY' },
      BorderStyle: { SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM' }
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => { if (typeof v !== 'string') throw new Error('cache values must be strings'); cacheStore.set(k, v); },
        remove: (k) => cacheStore.delete(k)
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          if (lockState.held) throw new Error('Lock timeout');
          lockState.held = true; lockState.acquired++;
        },
        tryLock: () => { if (lockState.held) return false; lockState.held = true; return true; },
        releaseLock: () => { lockState.held = false; }
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => {
        const out = { content, mime: null, setMimeType(m) { out.mime = m; return out; }, getContent: () => content };
        return out;
      }
    },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        assert.strictEqual(fmt, 'yyyy-MM-dd');
        return new Date(d.getTime() + 3600 * 1000).toISOString().slice(0, 10); // Africa/Lagos = UTC+1
      },
      getUuid: () => require('crypto').randomUUID()
    },
    Session: { getScriptTimeZone: () => 'Africa/Lagos' },
    PropertiesService: (() => {
      const props = new Map();
      return { getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => { props.set(k, String(v)); }
      }) };
    })(),
    MailApp: { sendEmail: (to, subject, body) => mail.push({ to, subject, body }) }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx, { filename: CODE_FILE });

  const parse = (out) => {
    assert.strictEqual(out.mime, 'application/json', 'response must be JSON');
    return JSON.parse(out.getContent());
  };
  return {
    ctx, ss, mail, cacheStore, lockState,
    sheet: (n) => ss.getSheetByName(n),
    post: (obj) => parse(ctx.doPost({ postData: { contents: typeof obj === 'string' ? obj : JSON.stringify(obj), type: 'text/plain' } })),
    get: (params) => parse(ctx.doGet({ parameter: params }))
  };
}

let seq = 0;
function rsvp(over = {}) {
  seq++;
  return Object.assign({
    action: 'rsvp',
    name: 'Adaeze Okafor',
    phone: '0803 123 4567',
    attendance: 'accept',
    guests: 2,
    event: 'Church Ceremony & Reception',
    message: 'Congratulations!',
    website: '',
    startedAt: Date.now() - 20000,
    clientId: 'client-' + String(seq).padStart(6, '0') + '-abcdef'
  }, over);
}
function wish(over = {}) {
  seq++;
  return Object.assign({
    action: 'guestbook', name: 'Aunty Bisi', message: 'God bless your home!', website: '',
    startedAt: Date.now() - 20000, clientId: 'gb-' + String(seq).padStart(6, '0') + '-abcdef'
  }, over);
}
const dataRows = (env, n) => {
  const sh = env.sheet(n);
  if (!sh) return [];
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, n === 'RSVPs' ? 9 : 5).getValues();
};

/* ---------------------------- tests ---------------------------- */

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('GET ping returns ok JSON', () => {
  const env = makeEnv();
  assert.deepStrictEqual(env.get({ action: 'ping' }), { ok: true });
  assert.strictEqual(env.get({ action: 'nope' }).ok, false);
});

test('valid RSVP is stored in columns A–I with a FL- reference', () => {
  const env = makeEnv();
  const res = env.post(rsvp({ name: '  Adaeze   Okafor ', clientId: 'abc12345-uuid-0001' }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.duplicate, false);
  assert.match(res.reference, /^FL-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  const sh = env.sheet('RSVPs');
  assert.deepStrictEqual(sh.getRange(1, 1, 1, 9).getValues()[0], [
    'Submission Date', 'Guest Full Name', 'Phone Number', 'Attendance Status', 'Number of Guests',
    'Wedding Event', 'Message to Couple', 'RSVP Reference', 'Client ID']);
  const rows = dataRows(env, 'RSVPs');
  assert.strictEqual(rows.length, 1);
  const r = rows[0];
  assert.strictEqual(Object.prototype.toString.call(r[0]), '[object Date]');
  assert.strictEqual(r[1], 'Adaeze Okafor', 'name trimmed + whitespace collapsed');
  assert.strictEqual(r[2], '0803 123 4567', 'phone kept as text with leading 0');
  assert.strictEqual(typeof r[2], 'string');
  assert.strictEqual(r[3], 'Attending');
  assert.strictEqual(r[4], 2);
  assert.strictEqual(r[5], 'Church Ceremony & Reception');
  assert.strictEqual(r[6], 'Congratulations!');
  assert.strictEqual(r[7], res.reference);
  assert.strictEqual(r[8], 'abc12345-uuid-0001');
  assert.strictEqual(env.lockState.held, false, 'lock released');
  assert.strictEqual(env.lockState.acquired, 1, 'write happened under lock');
});

test('validation failures are rejected with friendly errors and nothing stored', () => {
  const env = makeEnv();
  const bad = [
    rsvp({ name: 'A' }),
    rsvp({ name: 'x'.repeat(81) }),
    rsvp({ name: '12345' }),
    rsvp({ name: 'Visit www.spam.com' }),
    rsvp({ phone: '123' }),
    rsvp({ phone: 'call me maybe' }),
    rsvp({ phone: '0803=1234567' }),
    rsvp({ phone: '+234 803 123 4567 8901 23' }),
    rsvp({ attendance: 'maybe' }),
    rsvp({ attendance: undefined }),
    rsvp({ guests: 0 }),
    rsvp({ guests: 6 }),
    rsvp({ guests: 2.5 }),
    rsvp({ guests: 'two' }),
    rsvp({ guests: null }),
    rsvp({ event: 'Afterparty' }),
    rsvp({ event: '' }),
    rsvp({ message: 'x'.repeat(501) }),
    rsvp({ message: 'see http://a.com http://b.com https://c.com' })
  ];
  for (const b of bad) {
    const res = env.post(b);
    assert.strictEqual(res.ok, false, 'should reject ' + JSON.stringify(b).slice(0, 120));
    assert.ok(typeof res.error === 'string' && res.error.length > 5);
  }
  assert.strictEqual(env.post('not json').ok, false);
  assert.strictEqual(env.post('[]').ok, false);
  assert.strictEqual(env.post({ action: 'hack' }).ok, false);
  assert.strictEqual(env.ctx.doPost({}).getContent().includes('"ok":false'), true);
  assert.strictEqual(dataRows(env, 'RSVPs').length, 0);
  // Boundaries that must pass
  assert.strictEqual(env.post(rsvp({ guests: 5, phone: '08030000001' })).ok, true);
  assert.strictEqual(env.post(rsvp({ guests: '1', phone: '08030000002' })).ok, true);
  assert.strictEqual(env.post(rsvp({ message: '', phone: '08030000003' })).ok, true);
  assert.strictEqual(env.post(rsvp({ message: 'x'.repeat(500), phone: '08030000004' })).ok, true);
});

test('honeypot filled → fake ok, nothing stored', () => {
  const env = makeEnv();
  const res = env.post(rsvp({ website: 'http://bot.example' }));
  assert.strictEqual(res.ok, true);
  assert.match(res.reference, /^FL-/);
  assert.strictEqual(dataRows(env, 'RSVPs').length, 0);
  assert.deepStrictEqual(env.post(wish({ website: 'x' })), { ok: true });
  assert.strictEqual(dataRows(env, 'Guestbook').length, 0);
});

test('too-fast, too-old and missing startedAt are rejected', () => {
  const env = makeEnv();
  assert.strictEqual(env.post(rsvp({ startedAt: Date.now() })).ok, false);
  assert.strictEqual(env.post(rsvp({ startedAt: Date.now() - 1500 })).ok, false);
  assert.strictEqual(env.post(rsvp({ startedAt: Date.now() - 25 * 3600 * 1000 })).ok, false);
  assert.strictEqual(env.post(rsvp({ startedAt: undefined })).ok, false);
  assert.strictEqual(env.post(rsvp({ startedAt: 'abc' })).ok, false);
  assert.strictEqual(env.post(wish({ startedAt: Date.now() })).ok, false);
  assert.strictEqual(dataRows(env, 'RSVPs').length, 0);
  assert.strictEqual(env.post(rsvp({ startedAt: Date.now() - 3500 })).ok, true);
});

test('duplicate by clientId returns the existing reference, no new row', () => {
  const env = makeEnv();
  const body = rsvp({ clientId: 'same-client-id-123' });
  const first = env.post(body);
  const second = env.post(Object.assign({}, body, { phone: '0909 999 9999', name: 'Someone Else' }));
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.duplicate, true);
  assert.strictEqual(second.reference, first.reference);
  assert.strictEqual(dataRows(env, 'RSVPs').length, 1);
});

test('duplicate by normalised phone (0803… vs +234 803…) returns existing reference', () => {
  const env = makeEnv();
  const first = env.post(rsvp({ phone: '08031234567' }));
  const variants = ['+234 803 123 4567', '2348031234567', '+234-803-123-4567', '00234 803 123 4567', '+234 0803 123 4567'];
  for (const p of variants) {
    const res = env.post(rsvp({ phone: p }));
    assert.strictEqual(res.duplicate, true, p);
    assert.strictEqual(res.reference, first.reference, p);
  }
  assert.strictEqual(dataRows(env, 'RSVPs').length, 1);
  assert.strictEqual(env.post(rsvp({ phone: '08031234568' })).duplicate, false);
  assert.strictEqual(dataRows(env, 'RSVPs').length, 2);
});

test('phone normalisation unit cases', () => {
  const env = makeEnv();
  const n = env.ctx.normalisePhone_;
  assert.strictEqual(n('0803 123 4567'), '2348031234567');
  assert.strictEqual(n('+2348031234567'), '2348031234567');
  assert.strictEqual(n('803 123 4567'), '2348031234567');
  assert.strictEqual(n('+44 7700 900123'), '447700900123');
});

test('decline forces guests to 0 and stores "Not Attending"', () => {
  const env = makeEnv();
  const res = env.post(rsvp({ attendance: 'decline', guests: 4 }));
  assert.strictEqual(res.ok, true);
  const r = dataRows(env, 'RSVPs')[0];
  assert.strictEqual(r[3], 'Not Attending');
  assert.strictEqual(r[4], 0);
  // decline without an event is allowed
  assert.strictEqual(env.post(rsvp({ attendance: 'decline', guests: 0, event: '', phone: '08070000000' })).ok, true);
});

test('formula injection is neutralised with a leading apostrophe', () => {
  const env = makeEnv();
  const res = env.post(rsvp({ name: '=cmd|calc Ade', message: '+SUM(1,2)' }));
  assert.strictEqual(res.ok, true);
  const sh = env.sheet('RSVPs');
  const nameWrite = sh.rawWrites.find((w) => w.row === 2 && w.col === 2);
  const msgWrite = sh.rawWrites.find((w) => w.row === 2 && w.col === 7);
  assert.strictEqual(nameWrite.value, "'=cmd|calc Ade");
  assert.strictEqual(msgWrite.value, "'+SUM(1,2)");
  env.post(wish({ name: '@cmd Guest', message: '-2+3 wishes' }));
  const gb = env.sheet('Guestbook').rawWrites.filter((w) => w.row === 2);
  assert.strictEqual(gb.find((w) => w.col === 2).value, "'@cmd Guest");
  assert.strictEqual(gb.find((w) => w.col === 3).value, "'-2+3 wishes");
});

test('guestbook: submit stores pending; GET returns only approved, newest first, max 50, cached', () => {
  const env = makeEnv();
  assert.deepStrictEqual(env.post(wish({ name: 'Aunty Bisi', message: 'First wish', clientId: 'gb-client-0001' })), { ok: true });
  assert.deepStrictEqual(env.post(wish({ name: 'Uncle Tunde', message: 'Second wish' })), { ok: true });
  assert.deepStrictEqual(env.post(wish({ name: 'Cousin Kemi', message: 'Third wish' })), { ok: true });
  // retry with the same clientId does not duplicate
  assert.deepStrictEqual(env.post(wish({ name: 'Aunty Bisi', message: 'First wish', clientId: 'gb-client-0001' })), { ok: true });
  const sh = env.sheet('Guestbook');
  let rows = dataRows(env, 'Guestbook');
  assert.strictEqual(rows.length, 3);
  assert.ok(rows.every((r) => r[3] === false), 'Approved defaults to FALSE');
  assert.ok(sh.validations.some((v) => v.col === 4), 'checkbox validation applied');

  assert.deepStrictEqual(env.get({ action: 'guestbook' }), { ok: true, entries: [] });

  // Couple approves rows 2 and 4 (Bisi, Kemi) and we pin dates for ordering.
  sh.getRange(2, 1).setValue(new Date(Date.UTC(2026, 9, 1, 10)));
  sh.getRange(3, 1).setValue(new Date(Date.UTC(2026, 9, 2, 10)));
  sh.getRange(4, 1).setValue(new Date(Date.UTC(2026, 9, 3, 10)));
  sh.getRange(2, 4).setValue(true);
  sh.getRange(4, 4).setValue(true);

  // Cached empty result is still served for ~60s…
  assert.deepStrictEqual(env.get({ action: 'guestbook' }).entries, []);
  env.cacheStore.clear(); // …simulate cache expiry
  const res = env.get({ action: 'guestbook' });
  assert.deepStrictEqual(res, { ok: true, entries: [
    { name: 'Cousin Kemi', message: 'Third wish', date: '2026-10-03' },
    { name: 'Aunty Bisi', message: 'First wish', date: '2026-10-01' }
  ] });

  // Max 50
  env.cacheStore.clear();
  for (let i = 0; i < 60; i++) {
    const r = sh.getLastRow() + 1;
    sh.getRange(r, 1, 1, 5).setValues([[new Date(Date.UTC(2026, 10, 1, 0, i)), 'Guest ' + i, 'Wish ' + i, true, '']]);
  }
  const many = env.get({ action: 'guestbook' }).entries;
  assert.strictEqual(many.length, 50);
  assert.strictEqual(many[0].name, 'Guest 59');
});

test('guestbook validation', () => {
  const env = makeEnv();
  assert.strictEqual(env.post(wish({ message: '' })).ok, false);
  assert.strictEqual(env.post(wish({ message: 'x'.repeat(401) })).ok, false);
  assert.strictEqual(env.post(wish({ name: 'A' })).ok, false);
  assert.strictEqual(env.post(wish({ message: 'http://a http://b http://c' })).ok, false);
  assert.strictEqual(env.post(wish({ message: 'x'.repeat(400) })).ok, true);
});

test('rate limiting: global per-minute cap and per-phone cap', () => {
  const env = makeEnv();
  let okCount = 0;
  for (let i = 0; i < 35; i++) {
    const res = env.post(rsvp({ phone: '0803000' + String(1000 + i) }));
    if (res.ok) okCount++;
  }
  assert.strictEqual(okCount, 30, 'only 30 writes per minute overall');

  const env2 = makeEnv();
  // per-phone: a phone that keeps failing duplicate checks can't hammer; simulate by clearing rows
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(env2.post(rsvp({ phone: '08055555555' })).ok, true);
    env2.sheet('RSVPs').clear();
    env2.sheet('RSVPs').getRange(1, 1, 1, 9).setValues([env2.ctx.RSVP_HEADERS]);
  }
  assert.strictEqual(env2.post(rsvp({ phone: '08055555555' })).ok, false);
});

test('optional email notification via MailApp when NOTIFY_EMAIL is set', () => {
  const env = makeEnv();
  env.post(rsvp());
  assert.strictEqual(env.mail.length, 0, 'off by default');
  env.ctx.NOTIFY_EMAIL = 'couple@example.com';
  env.post(rsvp({ phone: '08099999999' }));
  assert.strictEqual(env.mail.length, 1);
  assert.match(env.mail[0].subject, /New RSVP/);
});

test('setup() builds sheets + live-formula dashboard, idempotent, keeps data', () => {
  const env = makeEnv();
  env.ss.insertSheet('Sheet1');
  env.post(rsvp());
  env.ctx.setup();
  env.ctx.setup(); // safe to re-run
  assert.ok(env.sheet('RSVPs') && env.sheet('Guestbook') && env.sheet('Dashboard'));
  assert.strictEqual(env.sheet('Sheet1'), null, 'blank default sheet removed');
  assert.strictEqual(dataRows(env, 'RSVPs').length, 1, 'existing RSVP kept');
  assert.deepStrictEqual(env.sheet('Guestbook').getRange(1, 1, 1, 5).getValues()[0],
    ['Submitted', 'Name', 'Message', 'Approved', 'Client ID']);
  const f = Object.values(env.sheet('Dashboard').formulas).join('\n');
  for (const needle of ['COUNTA(', 'COUNTIF(\'RSVPs\'!D2:D,"Attending")', '"Not Attending"',
    'SUMIF(\'RSVPs\'!D2:D,"Attending",\'RSVPs\'!E2:E)', 'COUNTIFS(', 'SUMIFS(', 'MAX(', 'Guestbook\'!D2:D,FALSE']) {
    assert.ok(f.includes(needle), 'dashboard formula missing: ' + needle);
  }
  // still accepts RSVPs after setup
  assert.strictEqual(env.post(rsvp({ phone: '08011112222' })).ok, true);
});

/* ---------------------------- gift registry ---------------------------- */

function pledge(over = {}) {
  seq++;
  return Object.assign({
    action: 'pledge', itemId: 'blender', name: 'Chidi Eze', phone: '0805 000 ' + String(1000 + seq).slice(-4),
    message: 'With love', website: '', startedAt: Date.now() - 20000,
    clientId: 'pl-' + String(seq).padStart(6, '0') + '-abcdef'
  }, over);
}
const regRows = (env) => {
  const sh = env.sheet('Registry');
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, 7).getValues();
};
const pledgeRows = (env) => {
  const sh = env.sheet('Gift Pledges');
  if (!sh) return [];
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, 8).getValues();
};
const itemById = (res, id) => res.items.find((i) => i.id === id);

test('registry: tabs are created lazily under the lock, seeded once, idempotent', () => {
  const env = makeEnv();
  // Simulate the live sheet: setup already ran before the registry existed.
  env.ss.insertSheet('RSVPs'); env.ss.insertSheet('Guestbook'); env.ss.insertSheet('Dashboard');
  assert.strictEqual(env.sheet('Registry'), null);
  const res = env.get({ action: 'registry' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(env.lockState.acquired, 1, 'creation happened under the script lock');
  assert.strictEqual(env.lockState.held, false, 'lock released');

  const reg = env.sheet('Registry');
  const pl = env.sheet('Gift Pledges');
  assert.ok(reg && pl);
  assert.deepStrictEqual(reg.getRange(1, 1, 1, 7).getValues()[0],
    ['ID', 'Gift', 'Category', 'Quantity Wanted', 'Note', 'Show on Website', 'Chosen So Far']);
  assert.deepStrictEqual(pl.getRange(1, 1, 1, 8).getValues()[0],
    ['Date', 'Guest Name', 'Phone', 'Item ID', 'Gift', 'Message', 'Reference', 'Client ID']);

  const rows = regRows(env).filter((r) => r[0] !== '');
  assert.strictEqual(rows.length, 19, '19 seed gifts');
  assert.deepStrictEqual(rows[0].slice(0, 6), ['cash-gift', 'Cash gift', 'Money', '', 'Bank details are just below', true]);
  assert.deepStrictEqual(rows[1].slice(0, 6), ['blender', 'Blender', 'Kitchen', 1, '', true]);
  assert.deepStrictEqual(rows[18].slice(0, 6), ['towel-set', 'Bath towel set', 'Bedroom', 2, '', true]);
  assert.ok(rows.every((r) => r[5] === true), 'all seeds shown on website');
  assert.strictEqual(reg.formulas['2,7'], '=IF(A2="","",COUNTIF(\'Gift Pledges\'!D:D,A2))');
  assert.ok(reg.formulas['200,7'], 'formula pre-filled for rows the couple adds later');
  assert.ok(reg.validations.some((v) => v.col === 6 && v.row === 2), 'Show on Website checkbox');

  // Second request (cache cleared) and a POST don't re-create or re-seed.
  env.cacheStore.clear();
  env.get({ action: 'registry' });
  env.post(pledge());
  env.ctx.ensureRegistrySheets_();
  const names = env.ss.getSheets().map((s) => s.name);
  assert.strictEqual(names.filter((n) => n === 'Registry').length, 1);
  assert.strictEqual(names.filter((n) => n === 'Gift Pledges').length, 1);
  assert.strictEqual(regRows(env).filter((r) => r[0] !== '').length, 19, 'not re-seeded');

  // A deleted seed is not brought back.
  reg.getRange(3, 1, 1, 6).setValues([['', '', '', '', '', '']]);
  env.ctx.ensureRegistrySheets_();
  assert.strictEqual(regRows(env).filter((r) => r[0] !== '').length, 18);
});

test('registry: POST pledge on a fresh sheet also creates the tabs', () => {
  const env = makeEnv();
  const res = env.post(pledge({ itemId: 'air-fryer' }));
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.match(res.reference, /^GF-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.strictEqual(res.itemName, 'Air fryer');
  assert.strictEqual(res.remaining, 0);
  assert.ok(env.sheet('Registry') && env.sheet('Gift Pledges'));
  assert.strictEqual(env.lockState.held, false);
});

test('registry: GET lists only visible, valid rows in sheet order with wanted/chosen/remaining', () => {
  const env = makeEnv();
  env.get({ action: 'registry' });
  const reg = env.sheet('Registry');
  reg.getRange(3, 6).setValue(false);                 // hide blender
  reg.getRange(5, 6).setValue('TRUE');                // text TRUE still counts
  const r = reg.getLastRow() + 1;
  reg.getRange(r, 1, 6, 6).setValues([
    ['Bad ID!', 'Bad', 'Home', 1, '', true],          // invalid ID
    ['', 'No ID', 'Home', 1, '', true],               // empty ID
    ['no-name', '', 'Home', 1, '', true],             // empty Gift
    ['towel-set', 'Duplicate', 'Home', 1, '', true],  // repeated ID
    ['Mixer', 'Stand mixer', 'Kitchen', 3, 'Any colour', true], // upper-case ID is accepted
    ['hidden-new', 'Not yet', 'Home', 1, '', '']       // unticked
  ]);
  // Pledges typed straight into the sheet are counted server-side.
  env.sheet('Gift Pledges').getRange(2, 1, 3, 8).setValues([
    [new Date(), 'A', '08011111111', 'bedding-set', 'Bedsheet', '', 'GF-AAAAAA', ''],
    [new Date(), 'B', '08022222222', 'cash-gift', 'Cash gift', '', 'GF-BBBBBB', ''],
    [new Date(), 'C', '08033333333', 'cash-gift', 'Cash gift', '', 'GF-CCCCCC', '']
  ]);
  env.cacheStore.clear();
  const res = env.get({ action: 'registry' });
  assert.strictEqual(res.ok, true);
  const ids = res.items.map((i) => i.id);
  assert.strictEqual(ids.length, 19);
  assert.strictEqual(ids[0], 'cash-gift');
  assert.ok(!ids.includes('blender'), 'hidden item omitted');
  assert.strictEqual(ids[ids.length - 1], 'mixer', 'sheet order kept, invalid rows skipped');
  assert.ok(!ids.includes('hidden-new') && !ids.includes('no-name'));
  assert.strictEqual(ids.filter((i) => i === 'towel-set').length, 1);
  assert.deepStrictEqual(itemById(res, 'cash-gift'),
    { id: 'cash-gift', name: 'Cash gift', category: 'Money', note: 'Bank details are just below', wanted: null, chosen: 2, remaining: null });
  assert.deepStrictEqual(itemById(res, 'bedding-set'),
    { id: 'bedding-set', name: 'Bedsheet & duvet set', category: 'Bedroom', note: '', wanted: 2, chosen: 1, remaining: 1 });
  assert.deepStrictEqual(itemById(res, 'mixer'),
    { id: 'mixer', name: 'Stand mixer', category: 'Kitchen', note: 'Any colour', wanted: 3, chosen: 0, remaining: 3 });
  assert.strictEqual(itemById(res, 'towel-set').name, 'Bath towel set', 'first row with an ID wins');
});

test('registry: GET is cached, and a pledge clears the cache', () => {
  const env = makeEnv();
  const before = env.get({ action: 'registry' });
  assert.strictEqual(itemById(before, 'blender').remaining, 1);
  // Couple edits the sheet: still cached…
  env.sheet('Registry').getRange(3, 2).setValue('Blender (big)');
  assert.strictEqual(itemById(env.get({ action: 'registry' }), 'blender').name, 'Blender');
  assert.ok(env.cacheStore.has('reg:items:v1'));
  // …until a pledge happens.
  assert.strictEqual(env.post(pledge({ itemId: 'microwave' })).ok, true);
  assert.ok(!env.cacheStore.has('reg:items:v1'), 'cache cleared after pledge');
  const after = env.get({ action: 'registry' });
  assert.strictEqual(itemById(after, 'blender').name, 'Blender (big)');
  assert.deepStrictEqual([itemById(after, 'microwave').chosen, itemById(after, 'microwave').remaining], [1, 0]);
});

test('pledge: success is stored in A–H and decrements remaining', () => {
  const env = makeEnv();
  const res = env.post(pledge({ itemId: 'bedding-set', name: '  Chidi   Eze ', phone: '0805 111 2222',
    message: 'Enjoy!', clientId: 'pledge-client-0001' }));
  assert.deepStrictEqual(Object.keys(res).sort(), ['duplicate', 'itemName', 'ok', 'reference', 'remaining']);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.duplicate, false);
  assert.strictEqual(res.itemName, 'Bedsheet & duvet set');
  assert.strictEqual(res.remaining, 1);
  const rows = pledgeRows(env);
  assert.strictEqual(rows.length, 1);
  const r = rows[0];
  assert.strictEqual(Object.prototype.toString.call(r[0]), '[object Date]');
  assert.deepStrictEqual(r.slice(1), ['Chidi Eze', '0805 111 2222', 'bedding-set', 'Bedsheet & duvet set',
    'Enjoy!', res.reference, 'pledge-client-0001']);
  assert.strictEqual(env.lockState.held, false);
  assert.strictEqual(itemById(env.get({ action: 'registry' }), 'bedding-set').remaining, 1);
  const res2 = env.post(pledge({ itemId: 'bedding-set' }));
  assert.strictEqual(res2.remaining, 0);
  assert.notStrictEqual(res2.reference, res.reference);
  const g = itemById(env.get({ action: 'registry' }), 'bedding-set');
  assert.deepStrictEqual([g.wanted, g.chosen, g.remaining], [2, 2, 0]);
});

test('pledge: sold-out gift returns soldOut:true and stores nothing', () => {
  const env = makeEnv();
  assert.strictEqual(env.post(pledge({ itemId: 'blender' })).ok, true);
  const res = env.post(pledge({ itemId: 'blender', phone: '0809 876 5432' }));
  assert.deepStrictEqual(res, { ok: false, error: 'Someone has just chosen this gift. Please pick another.', soldOut: true });
  assert.strictEqual(pledgeRows(env).length, 1);
  // Quantity set to 0 by the couple → sold out straight away.
  env.sheet('Registry').getRange(4, 4).setValue(0);
  assert.strictEqual(env.post(pledge({ itemId: 'tabletop-gas-cooker' })).soldOut, true);
  // Couple raises the quantity → available again (read fresh, not cached).
  env.sheet('Registry').getRange(3, 4).setValue(2);
  assert.strictEqual(env.post(pledge({ itemId: 'blender', phone: '0809 876 5432' })).ok, true);
});

test('pledge: unknown, hidden or malformed item is rejected', () => {
  const env = makeEnv();
  env.get({ action: 'registry' });
  env.sheet('Registry').getRange(3, 6).setValue(false); // hide blender
  const msg = 'That gift is no longer on the list.';
  assert.deepStrictEqual(env.post(pledge({ itemId: 'blender' })), { ok: false, error: msg });
  assert.deepStrictEqual(env.post(pledge({ itemId: 'yacht' })), { ok: false, error: msg });
  assert.deepStrictEqual(env.post(pledge({ itemId: '' })), { ok: false, error: msg });
  assert.deepStrictEqual(env.post(pledge({ itemId: '=HYPERLINK("x")' })), { ok: false, error: msg });
  assert.deepStrictEqual(env.post(pledge({ itemId: { a: 1 } })), { ok: false, error: msg });
  assert.strictEqual(pledgeRows(env).length, 0);
  // IDs are case-insensitive.
  assert.strictEqual(env.post(pledge({ itemId: 'Air-Fryer' })).ok, true);
  assert.strictEqual(pledgeRows(env)[0][3], 'air-fryer');
});

test('pledge: duplicates by clientId and by phone+item return the same reference', () => {
  const env = makeEnv();
  const body = pledge({ itemId: 'blender', phone: '08031234567', clientId: 'pledge-same-0001' });
  const first = env.post(body);
  assert.strictEqual(first.ok, true);
  // Retry with the same clientId (even though the blender is now sold out).
  const retry = env.post(Object.assign({}, body, { phone: '0909 999 9999', name: 'Someone Else' }));
  assert.deepStrictEqual(retry, { ok: true, reference: first.reference, itemName: 'Blender', remaining: 0, duplicate: true });
  // Same phone (different format) + same item, new clientId.
  const again = env.post(pledge({ itemId: 'blender', phone: '+234 803 123 4567' }));
  assert.strictEqual(again.ok, true);
  assert.strictEqual(again.duplicate, true);
  assert.strictEqual(again.reference, first.reference);
  assert.strictEqual(pledgeRows(env).length, 1);
});

test('pledge: the same phone may pledge a different item', () => {
  const env = makeEnv();
  const a = env.post(pledge({ itemId: 'blender', phone: '08031234567' }));
  const b = env.post(pledge({ itemId: 'toaster', phone: '08031234567' }));
  assert.strictEqual(a.ok && b.ok, true);
  assert.strictEqual(b.duplicate, false);
  assert.notStrictEqual(a.reference, b.reference);
  assert.strictEqual(pledgeRows(env).length, 2);
});

test('pledge: validation, honeypot and timing', () => {
  const env = makeEnv();
  const bad = [
    pledge({ name: 'A' }), pledge({ name: 'x'.repeat(81) }), pledge({ name: '12345' }),
    pledge({ name: 'www.spam.com' }), pledge({ phone: '123' }), pledge({ phone: 'call me' }),
    pledge({ phone: '+234 803 123 4567 8901 23' }), pledge({ phone: '' }),
    pledge({ message: 'x'.repeat(201) }), pledge({ message: 'http://a http://b http://c' }),
    pledge({ startedAt: Date.now() }), pledge({ startedAt: Date.now() - 1500 }),
    pledge({ startedAt: Date.now() - 25 * 3600 * 1000 }), pledge({ startedAt: undefined })
  ];
  for (const b of bad) {
    const res = env.post(b);
    assert.strictEqual(res.ok, false, 'should reject ' + JSON.stringify(b).slice(0, 140));
    assert.ok(typeof res.error === 'string' && res.error.length > 5);
    assert.ok(!res.soldOut);
  }
  assert.strictEqual(pledgeRows(env).length, 0);

  const hp = env.post(pledge({ website: 'http://bot.example' }));
  assert.strictEqual(hp.ok, true);
  assert.match(hp.reference, /^GF-/);
  assert.strictEqual(pledgeRows(env).length, 0, 'honeypot stores nothing');

  assert.strictEqual(env.post(pledge({ message: 'x'.repeat(200) })).ok, true);
  assert.strictEqual(env.post(pledge({ message: '', itemId: 'toaster' })).ok, true);
});

test('pledge: formula injection is escaped', () => {
  const env = makeEnv();
  const res = env.post(pledge({ name: '=cmd|calc Ade', message: '@SUM(1,2)' }));
  assert.strictEqual(res.ok, true);
  const w = env.sheet('Gift Pledges').rawWrites.filter((x) => x.row === 2);
  assert.strictEqual(w.find((x) => x.col === 2).value, "'=cmd|calc Ade");
  assert.strictEqual(w.find((x) => x.col === 6).value, "'@SUM(1,2)");
  // A gift name the couple typed starting with "=" is escaped too when copied into a pledge.
  env.sheet('Registry').getRange(4, 2).setValue('+Gas cooker');
  env.post(pledge({ itemId: 'tabletop-gas-cooker' }));
  const w3 = env.sheet('Gift Pledges').rawWrites.filter((x) => x.row === 3);
  assert.strictEqual(w3.find((x) => x.col === 5).value, "'+Gas cooker");
});

test('pledge: unlimited cash gift accepts many pledges', () => {
  const env = makeEnv();
  for (let i = 0; i < 12; i++) {
    const res = env.post(pledge({ itemId: 'cash-gift', phone: '0803000' + String(1000 + i) }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.remaining, null);
  }
  const g = itemById(env.get({ action: 'registry' }), 'cash-gift');
  assert.deepStrictEqual([g.wanted, g.chosen, g.remaining], [null, 12, null]);
});

test('pledge: rate limits and optional email', () => {
  const env = makeEnv();
  let ok = 0;
  for (let i = 0; i < 35; i++) if (env.post(pledge({ itemId: 'cash-gift', phone: '0803000' + String(2000 + i) })).ok) ok++;
  assert.strictEqual(ok, 30, 'global per-minute cap shared with RSVPs');

  const env2 = makeEnv();
  const ids = ['blender', 'toaster', 'air-fryer', 'microwave', 'rice-cooker', 'electric-kettle',
    'pressure-pot', 'cookware-set', 'food-flasks', 'dinner-set', 'cutlery-set'];
  const results = ids.map((id) => env2.post(pledge({ itemId: id, phone: '08044444444' })).ok);
  assert.deepStrictEqual(results, [...Array(10).fill(true), false], 'max 10 pledges per phone per 10 min');

  assert.strictEqual(env2.mail.length, 0);
  env2.ctx.NOTIFY_EMAIL = 'couple@example.com';
  env2.post(pledge({ itemId: 'glassware' }));
  assert.strictEqual(env2.mail.length, 1);
  assert.match(env2.mail[0].subject, /New gift pledge: .* — Drinking glasses set/);
});

test('setup() creates the registry tabs, keeps gift edits on re-run, adds Gifts to dashboard', () => {
  const env = makeEnv();
  env.ctx.setup();
  assert.strictEqual(regRows(env).filter((r) => r[0] !== '').length, 19);
  env.sheet('Registry').getRange(3, 2).setValue('Blender (edited)');
  env.post(pledge({ itemId: 'blender' }));
  env.ctx.setup();
  assert.strictEqual(env.sheet('Registry').getRange(3, 2).getValue(), 'Blender (edited)', 'edits kept');
  assert.strictEqual(pledgeRows(env).length, 1, 'pledges kept');
  const f = Object.values(env.sheet('Dashboard').formulas).join('\n');
  assert.ok(f.includes("COUNTUNIQUE('Gift Pledges'!D2:D)"));
  assert.ok(f.includes("COUNTA('Gift Pledges'!G2:G)"));
});

/* ---------------------------- runner ---------------------------- */
let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('  ✓ ' + t.name); }
  catch (e) { failed++; console.log('  ✗ ' + t.name + '\n      ' + (e.stack || e).split('\n').slice(0, 4).join('\n      ')); }
}
console.log(`\n${tests.length - failed}/${tests.length} tests passed`);
process.exit(failed ? 1 : 0);
