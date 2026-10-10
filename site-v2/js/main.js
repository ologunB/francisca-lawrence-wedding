/* ==========================================================================
   Francisca & Lawrence: site behaviour
   All content comes from window.CONFIG (config.js). No frameworks.
   User-supplied text is only ever written with textContent.
   ========================================================================== */
(function () {
  'use strict';

  window.__flHero = true;   // tells the inline head script that main.js is managing the hero entrance

  var C = window.CONFIG || {};
  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Helpers ---------- */
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function get(path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, C); }
  function el(tag, attrs, children) {
    var node = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return node;
  }
  function isPlaceholder(v) { return !v || /PASTE_|PLACEHOLDER|YOUR-SITE/i.test(String(v)); }
  function hasText(v) { return typeof v === 'string' && v.trim() !== ''; }
  function store(kind) {
    return {
      get: function (k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { window[kind].setItem(k, v); } catch (e) { /* ignore */ } }
    };
  }
  var local = store('localStorage');
  var session = store('sessionStorage');
  function newId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  var naira = (function () {
    var f;
    try { f = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }); } catch (e) { f = null; }
    return function (n) { return '₦' + (f ? f.format(n) : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')); };
  })();
  function formatDate(iso) {
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d)) return iso;
    try { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return iso; }
  }
  function toGcalStamp(iso) { return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function setInert(on, except) {
    ['main', '.footer', '.sticky-rsvp', '.skip-link'].concat(except === 'header' ? [] : ['.masthead']).forEach(function (s) {
      var n = $(s); if (!n) return;
      if (on) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); }
      else { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); }
    });
  }
  function trapTab(e, nodes) {
    if (e.key !== 'Tab' || !nodes.length) return;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (nodes.indexOf(doc.activeElement) === -1) { e.preventDefault(); first.focus(); }
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /* ---------- Derived settings ---------- */
  var API = (C.api && C.api.endpoint) || '';
  var apiReady = /^https:\/\//.test(API) && !isPlaceholder(API);
  var waNumber = String((C.contact && C.contact.whatsappNumber) || '').replace(/\D/g, '');
  var waReady = !isPlaceholder(C.contact && C.contact.whatsappNumber) && waNumber.length >= 8 && waNumber.length <= 15;
  var couple = (C.couple && (C.couple.brideFirst + ' & ' + C.couple.groomFirst)) || 'Francisca & Lawrence';
  function siteUrl() {
    if (C.site && !isPlaceholder(C.site.url)) return C.site.url;
    return location.origin + location.pathname;
  }
  function waLink(text, toHelper) {
    var base = (toHelper && waReady) ? 'https://wa.me/' + waNumber : 'https://wa.me/';
    return base + '?text=' + encodeURIComponent(text);
  }

  /* ======================================================================
     1. Simple text from config  (data-config="path")
     ====================================================================== */
  function bindConfig() {
    $$('[data-config]').forEach(function (n) {
      var v = get(n.getAttribute('data-config'));
      if (v != null && v !== '' && typeof v !== 'object') n.textContent = v;
    });
  }

  /* ======================================================================
     2. Masthead, contents menu, scroll-spy, sticky RSVP
     ====================================================================== */
  function initMasthead() {
    var head = $('[data-header]');
    if (!head) return;
    function onScroll() { head.classList.toggle('is-scrolled', window.scrollY > 8); }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initMenu() {
    var toggle = $('[data-menu-toggle]');
    var menu = $('[data-mobile-menu]');
    if (!toggle || !menu) return;
    var label = $('.menu-toggle__label', toggle);
    var links = $$('a', menu);
    var open = false;
    function setOpen(state, restoreFocus) {
      open = state;
      menu.classList.toggle('is-open', state);
      menu.setAttribute('aria-hidden', String(!state));
      toggle.setAttribute('aria-expanded', String(state));
      if (label) label.textContent = state ? 'Close' : 'Menu';
      root.classList.toggle('menu-open', state);
      doc.body.classList.toggle('no-scroll', state);
      setInert(state, 'header');
      // keep only the toggle reachable inside the header while open
      $$('.masthead a').forEach(function (a) { if (state) a.setAttribute('tabindex', '-1'); else a.removeAttribute('tabindex'); });
      doc.dispatchEvent(new CustomEvent('menu:toggle', { detail: state }));
      if (state) setTimeout(function () { if (links[0]) links[0].focus(); }, 60);
      else if (restoreFocus) toggle.focus();
    }
    toggle.addEventListener('click', function () { setOpen(!open, true); });
    links.forEach(function (a) { a.addEventListener('click', function () { setOpen(false, false); }); });
    doc.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') setOpen(false, true);
      trapTab(e, [toggle].concat(links));
    });
    window.addEventListener('resize', function () { if (open && window.innerWidth >= 960) setOpen(false); });
  }

  function initScrollSpy() {
    var links = $$('.nav a, .menu__list a');
    if (!links.length) return;
    var ids = [];
    links.forEach(function (a) { var id = a.getAttribute('href').slice(1); if (ids.indexOf(id) === -1) ids.push(id); });
    var secs = ids.map(function (id) { return doc.getElementById(id); }).filter(Boolean);
    var current = null, ticking = false;
    function update() {
      ticking = false;
      var line = (parseFloat(getComputedStyle(root).scrollPaddingTop) || 0) + window.innerHeight * 0.3;
      var id = null;
      secs.forEach(function (s) { if (!s.hidden && s.getBoundingClientRect().top <= line) id = s.id; });
      // at the very bottom, the last section is the one being read
      if (window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 4) {
        for (var i = secs.length - 1; i >= 0; i--) { if (!secs[i].hidden) { id = secs[i].id; break; } }
      }
      if (id === current) return;
      current = id;
      links.forEach(function (a) {
        if (id && a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  function initStickyRsvp() {
    var pill = $('[data-rsvp-pill]');
    var hero = $('#home'), rsvp = $('#rsvp'), footer = $('.footer'), gifts = $('[data-registry]');
    if (!pill || !hero || !rsvp || !('IntersectionObserver' in window)) return;
    var inHero = true, inRsvp = false, inFooter = false, inGifts = false, menuOpen = false, dialogOpen = false;
    function update() { pill.classList.toggle('is-visible', !inHero && !inRsvp && !inFooter && !inGifts && !menuOpen && !dialogOpen); }
    new IntersectionObserver(function (e) { inHero = e[0].isIntersecting; update(); }, { threshold: 0.05 }).observe(hero);
    new IntersectionObserver(function (e) { inRsvp = e[0].isIntersecting; update(); }, { threshold: 0.02 }).observe(rsvp);
    if (footer) new IntersectionObserver(function (e) { inFooter = e[0].isIntersecting; update(); }).observe(footer);
    // the pill would sit over the gift list's "I'll get this" links
    if (gifts) new IntersectionObserver(function (e) { inGifts = e[0].isIntersecting; update(); }).observe(gifts);
    doc.addEventListener('menu:toggle', function (e) { menuOpen = e.detail; update(); });
    doc.addEventListener('dialog:toggle', function (e) { dialogOpen = e.detail; update(); });
  }

  /* ======================================================================
     3. Hero entrance + envelope intro
        The letter slides out, grows into the page, and the names rise.
     ====================================================================== */
  // Must match the key in the inline anti-flash script in index.html <head>.
  var ENVELOPE_KEY = 'fl-v2b-envelope-opened';
  var heroShown = false;
  function revealHero() {
    if (heroShown) return; heroShown = true;
    // two frames so the hidden state is painted before transitioning
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('hero-pending'); }); });
  }

  function initEnvelope() {
    function skipIntro() { root.classList.remove('env-pending'); revealHero(); }
    if (reduceMotion) { root.classList.remove('hero-pending'); heroShown = true; return skipIntro(); }
    if (location.hash && location.hash.length > 1) return skipIntro();
    if (session.get(ENVELOPE_KEY)) return skipIntro();

    var bride = (C.couple && C.couple.brideFirst) || 'Francisca';
    var groom = (C.couple && C.couple.groomFirst) || 'Lawrence';
    var initials = bride.charAt(0) + groom.charAt(0);
    // Static drawing only (no user content). A wax seal with the monogram, ringed by the cord.
    var seal =
      '<svg viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs>' +
      '<radialGradient id="wax" cx="42%" cy="38%" r="68%"><stop offset="0" stop-color="#8A5A3C"/><stop offset=".6" stop-color="#6B412A"/><stop offset="1" stop-color="#4A2C1D"/></radialGradient>' +
      '<filter id="wax-edge" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="9"/></filter>' +
      '<filter id="wax-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#2C1B16" flood-opacity=".4"/></filter>' +
      '</defs>' +
      '<g filter="url(#wax-shadow)"><circle cx="60" cy="60" r="53" fill="url(#wax)" filter="url(#wax-edge)"/></g>' +
      '<circle cx="60" cy="60" r="40" fill="none" stroke="#2E1A11" stroke-width="1.4" opacity=".5"/>' +
      '<g font-family="Bodoni Moda, Didot, Georgia, serif" font-size="30" text-anchor="middle">' +
      '<text x="59.3" y="69.3" fill="#E8D5A8" opacity=".5">' + initials.charAt(0) + '<tspan font-size="22" dx="1">&amp;</tspan><tspan dx="1">' + initials.charAt(1) + '</tspan></text>' +
      '<text x="60" y="70" fill="#2E1A11" opacity=".75">' + initials.charAt(0) + '<tspan font-size="22" dx="1">&amp;</tspan><tspan dx="1">' + initials.charAt(1) + '</tspan></text>' +
      '</g></svg>';
    if (!/^[A-Za-z]{2}$/.test(initials)) seal = seal.replace(/<g font-family[\s\S]*<\/g><\/svg>$/, '</svg>');

    var overlay = el('div', { class: 'envelope', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Wedding invitation envelope', tabindex: '-1' });
    function namePair(tag, cls) {
      return el(tag, cls ? { class: cls } : null, [bride + ' ', el('span', { class: 'nowrap' }, [el('span', { class: 'envelope__amp', text: '&' }), ' ' + groom])]);
    }
    var kicker = el('p', { class: 'envelope__kicker', text: 'You are invited to the wedding of' });
    var names = namePair('p', 'envelope__names');
    var date = el('p', { class: 'envelope__date', text: (C.wedding && C.wedding.dateLabel) || '' });
    var btn = el('button', { class: 'envelope__button', type: 'button', 'aria-label': 'Open the invitation' });
    var body = el('span', { class: 'envelope__body' });
    var letter = el('span', { class: 'envelope__letter', 'aria-hidden': 'true' }, [
      el('small', { text: 'The Holy Matrimony of' }),
      namePair('span', 'envelope__letter-names')
    ]);
    var pocket = el('span', { class: 'envelope__pocket' });
    var flap = el('span', { class: 'envelope__flap' });
    var sealWrap = el('span', { class: 'envelope__seal' });
    pocket.innerHTML = '<svg viewBox="0 0 145 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon points="0,0 72.5,56 0,100" fill="#EDE0C9"/><polygon points="145,0 72.5,56 145,100" fill="#EDE0C9"/>' +
      '<polygon points="0,100 72.5,47 145,100" fill="#F3E9D8"/>' +
      '<g fill="none" stroke="#7A5A22" stroke-opacity=".3" stroke-width="1" vector-effect="non-scaling-stroke">' +
      '<polyline points="0,0 72.5,56 145,0"/><polyline points="0,100 72.5,47 145,100"/></g></svg>';
    flap.innerHTML = '<svg viewBox="0 0 145 58" preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon points="0,0 145,0 72.5,58" fill="#F1E6D2"/>' +
      '<polyline points="0,0 72.5,58 145,0" fill="none" stroke="#7A5A22" stroke-opacity=".34" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>';
    sealWrap.innerHTML = seal;
    [body, letter, pocket, flap, sealWrap].forEach(function (n) { btn.appendChild(n); });
    var hint = el('p', { class: 'envelope__hint', text: 'Tap the seal to open', 'aria-hidden': 'true' });
    var skip = el('button', { class: 'envelope__skip', type: 'button', text: 'Skip' });
    [skip, kicker, names, date, btn, hint].forEach(function (n) { overlay.appendChild(n); });
    doc.body.appendChild(overlay);
    root.classList.remove('env-pending');
    doc.body.classList.add('no-scroll');
    setInert(true);
    overlay.focus({ preventScroll: true });

    var done = false;
    function release() {
      session.set(ENVELOPE_KEY, '1');
      doc.body.classList.remove('no-scroll');
      setInert(false);
      var h1 = $('#hero-title');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
    function leave() {
      overlay.classList.add('is-leaving');
      revealHero();
      setTimeout(function () { overlay.remove(); }, 700);
    }
    function skipNow() { if (done) return; done = true; release(); leave(); }

    function openSequence() {
      if (done) return; done = true;
      btn.disabled = true;
      btn.classList.add('is-open');
      overlay.classList.add('is-opening');
      // 1. flap opens, letter rises (CSS, ~1.35s)
      setTimeout(function () {
        // 2. lift the letter out as a sheet and grow it into the page
        var r = letter.getBoundingClientRect();
        var sheet = el('div', { class: 'envelope__sheet', 'aria-hidden': 'true' });
        sheet.style.top = r.top + 'px'; sheet.style.left = r.left + 'px';
        sheet.style.width = r.width + 'px'; sheet.style.height = r.height + 'px';
        var inner = letter.cloneNode(true);
        inner.className = 'envelope__letter'; inner.style.cssText = 'position:static;transform:none;height:100%;border:0;background:none;';
        sheet.appendChild(inner);
        overlay.appendChild(sheet);
        letter.style.visibility = 'hidden';
        overlay.classList.add('is-expanding');
        sheet.getBoundingClientRect(); // commit start rect
        sheet.classList.add('is-full');
        sheet.style.top = '0px'; sheet.style.left = '0px';
        sheet.style.width = '100vw'; sheet.style.height = '100vh';
        // 3. the page is now the letter: remove the overlay, names rise
        setTimeout(function () {
          overlay.classList.add('is-clear');
          release();
          window.scrollTo(0, 0);
          revealHero();
          sheet.style.opacity = '0';
          setTimeout(function () { overlay.remove(); }, 520);
        }, 900);
      }, 1350);
    }
    btn.addEventListener('click', openSequence);
    skip.addEventListener('click', skipNow);
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') skipNow();
      trapTab(e, [skip, btn]);
    });
  }

  /* ======================================================================
     4. Countdown (Africa/Lagos offset is in CONFIG.wedding.dateISO)
     ====================================================================== */
  function initCountdown() {
    var box = $('[data-countdown]');
    if (!box || !C.wedding) return;
    var start = Date.parse(C.wedding.dateISO);
    var end = Date.parse(C.wedding.endISO) || start + 3 * 3600e3;
    if (isNaN(start)) return;
    box.hidden = false;
    var grid = $('[data-cd-grid]', box), done = $('[data-cd-done]', box);
    var parts = { days: $('[data-cd="days"]', box), hours: $('[data-cd="hours"]', box), mins: $('[data-cd="mins"]', box), secs: $('[data-cd="secs"]', box) };
    var timer;
    function tick() {
      var now = Date.now(), diff = start - now;
      if (diff <= 0) {
        grid.hidden = true; done.hidden = false;
        done.textContent = now < end + 12 * 3600e3
          ? 'Today is the day. Thank you for being here.'
          : couple + ' are married. Thank you for your love and prayers.';
        clearInterval(timer); return;
      }
      var s = Math.floor(diff / 1000), d = Math.floor(s / 86400);
      parts.days.textContent = d;
      parts.hours.textContent = pad2(Math.floor(s % 86400 / 3600));
      parts.mins.textContent = pad2(Math.floor(s % 3600 / 60));
      parts.secs.textContent = pad2(s % 60);
      grid.setAttribute('aria-label', d + (d === 1 ? ' day' : ' days') + ' until the wedding');
    }
    tick();
    timer = setInterval(tick, 1000);
  }

  /* ======================================================================
     5. Content rendered from config
     ====================================================================== */
  function renderStory() {
    var box = $('[data-story]');
    var paras = C.story && C.story.paragraphs;
    if (!box || !paras || !paras.length) return;
    box.textContent = '';
    paras.forEach(function (p) { box.appendChild(el('p', { text: p })); });
  }

  function gcalUrl() {
    var church = C.church || {};
    return 'https://calendar.google.com/calendar/render?' + [
      'action=TEMPLATE',
      'text=' + encodeURIComponent('Wedding of ' + couple),
      'dates=' + toGcalStamp(C.wedding.dateISO) + '/' + toGcalStamp(C.wedding.endISO),
      'details=' + encodeURIComponent('Holy Matrimony, ' + C.wedding.timeLabel + '.\n' + siteUrl()),
      'location=' + encodeURIComponent(church.name + ', ' + church.address),
      'ctz=Africa/Lagos'
    ].join('&');
  }

  function renderDetails() {
    var church = C.church || {};
    $$('[data-church-directions]').forEach(function (a) { if (hasText(church.mapsUrl)) a.href = church.mapsUrl; });
    var note = $('[data-church-note]');
    if (note && !hasText(church.directionsNote)) note.remove();
    var gcal = $('[data-gcal]');
    if (gcal && C.wedding) { try { gcal.href = gcalUrl(); } catch (e) { /* keep static link */ } }

    var r = C.reception || {};
    var confirmed = r.confirmed && hasText(r.name);
    var bodyBox = $('[data-reception-body]');
    var label = $('[data-reception-label]');
    var inviteLine = $('[data-invite-reception]');
    if (label) label.textContent = 'Reception · ' + (confirmed && hasText(r.timeShort) ? r.timeShort : 'After Mass');
    if (!bodyBox) return;
    bodyBox.textContent = '';
    if (!confirmed) {
      bodyBox.appendChild(el('h3', { class: 'h3', id: 'reception-title', text: 'Venue to be announced' }));
      bodyBox.appendChild(el('p', { class: 'muted' }, ['We will share it here and under ', el('a', { class: 'link', href: '#updates', text: 'Updates' }), ' once it is confirmed.']));
      if (inviteLine) inviteLine.textContent = 'Reception to follow · venue to be announced';
      return;
    }
    bodyBox.appendChild(el('h3', { class: 'h3', id: 'reception-title', text: r.name }));
    bodyBox.appendChild(el('p', { class: hasText(r.address) ? null : 'tbc', text: hasText(r.address) ? r.address : 'Address: details to follow' }));
    if (hasText(r.address) && hasText(r.landmark)) bodyBox.appendChild(el('p', { class: 'muted', text: r.landmark }));
    bodyBox.appendChild(el('p', { class: hasText(r.time) ? null : 'tbc', text: hasText(r.time) ? r.time : 'Time: details to follow' }));
    if (hasText(r.mapsUrl)) {
      bodyBox.appendChild(el('div', { class: 'venue__actions' }, [
        el('a', { class: 'btn', href: r.mapsUrl, target: '_blank', rel: 'noopener', text: 'Get directions' })
      ]));
    }
    if (inviteLine) inviteLine.textContent = 'Reception to follow at ' + r.name;
  }

  function renderTimeline() {
    var list = $('[data-timeline]');
    var items = C.timeline;
    if (!list || !items || !items.length) return;
    list.textContent = '';
    items.forEach(function (it) {
      list.appendChild(el('li', null, [
        el('span', { class: 'rows__time', text: it.time || '' }),
        el('span', null, [
          el('strong', { text: it.title || '' }),
          it.place ? el('span', { class: 'muted', text: it.place }) : null
        ])
      ]));
    });
  }

  function renderUpdates() {
    var list = $('[data-updates]');
    var items = (C.announcements || []).slice();
    if (!list) return;
    if (!items.length) { var sec = $('#updates'); if (sec) sec.hidden = true; return; }
    items.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    list.textContent = '';
    items.forEach(function (u) {
      list.appendChild(el('li', null, [
        el('time', { class: 'label', datetime: u.date, text: formatDate(u.date) }),
        el('p', null, [el('strong', { text: u.title })]),
        el('p', { class: 'muted', text: u.body })
      ]));
    });
  }

  function renderSwatches() {
    var list = $('[data-swatches]');
    if (!list || !C.palette) return;
    list.textContent = '';
    C.palette.forEach(function (p) {
      var dot = el('span', { class: 'swatch__dot', 'aria-hidden': 'true' });
      dot.style.background = p.hex;
      list.appendChild(el('li', { class: 'swatch' }, [dot, el('span', { class: 'label', text: p.name })]));
    });
  }

  /* ======================================================================
     6. Contact sheet + accessible lightbox
     ====================================================================== */
  function initGallery() {
    var grid = $('[data-gallery]');
    var photos = C.gallery || [];
    var lb = $('[data-lightbox]');
    if (!grid || !photos.length) return;
    grid.textContent = '';
    photos.forEach(function (p, i) {
      var img = el('img', { src: p.thumb || p.src, alt: '', width: 600, height: 800, loading: 'lazy', decoding: 'async' });
      if (p.position) img.style.objectPosition = p.position;
      var btn = el('button', { class: 'frame', type: 'button', 'aria-label': 'View photo ' + (i + 1) + ' of ' + photos.length + ': ' + (p.alt || '') }, [img]);
      btn.addEventListener('click', function () { open(i, btn); });
      grid.appendChild(el('li', null, [btn]));
    });
    if (!lb) return;

    var img = $('[data-lb-img]', lb), count = $('[data-lb-count]', lb), cap = $('[data-lb-caption]', lb);
    var btnClose = $('.lightbox__btn--close', lb), btnPrev = $('[data-lb-prev]', lb), btnNext = $('[data-lb-next]', lb);
    var index = 0, opener = null;
    function show(i) {
      index = (i + photos.length) % photos.length;
      var p = photos[index];
      img.src = p.src; img.alt = p.alt || '';
      if (p.width) { img.width = p.width; img.height = p.height; }
      count.textContent = (index + 1) + ' of ' + photos.length;
      cap.textContent = p.caption || '';
      [index + 1, index - 1].forEach(function (j) { (new Image()).src = photos[(j + photos.length) % photos.length].src; });
    }
    function open(i, trigger) {
      opener = trigger; show(i);
      lb.hidden = false; doc.body.classList.add('no-scroll'); setInert(true);
      doc.dispatchEvent(new CustomEvent('dialog:toggle', { detail: true }));
      btnClose.focus();
    }
    function close() {
      lb.hidden = true; doc.body.classList.remove('no-scroll'); setInert(false);
      doc.dispatchEvent(new CustomEvent('dialog:toggle', { detail: false }));
      if (opener) opener.focus();
    }
    $$('[data-lb-close]', lb).forEach(function (b) { b.addEventListener('click', close); });
    btnPrev.addEventListener('click', function () { show(index - 1); });
    btnNext.addEventListener('click', function () { show(index + 1); });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === 'ArrowRight') show(index + 1);
      trapTab(e, [btnClose, btnPrev, btnNext]);
    });
    var x0 = null, y0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
      x0 = null;
    }, { passive: true });
  }

  /* ======================================================================
     7. Reply card  (POST action=rsvp, see API_CONTRACT.md)
     ====================================================================== */
  var RSVP_KEY = 'fl-v2b-rsvp';
  var PHONE_RE = /^[0-9+()\-\s]+$/;
  function phoneError(v) {
    if (!v) return 'Please enter your phone number.';
    var digits = v.replace(/\D/g, '').length;
    if (!PHONE_RE.test(v) || digits < 7 || digits > 15) return 'That number doesn’t look right. Use 7 to 15 digits, e.g. 0803 123 4567.';
    return '';
  }
  function setFieldError(input, msg) {
    var field = input.closest('.field');
    var ids = input.getAttribute('aria-describedby');
    var err = ids ? doc.getElementById(ids.split(' ')[0]) : null;
    if (field) field.classList.toggle('has-error', !!msg);
    if (err) err.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function setBusy(btn, busy, labelText) {
    var lbl = $('.btn__label', btn);
    if (!btn.dataset.label) btn.dataset.label = lbl.textContent;
    btn.disabled = busy;
    btn.setAttribute('aria-disabled', String(busy));
    var sp = $('.spinner', btn);
    if (busy && !sp) btn.insertBefore(el('span', { class: 'spinner', 'aria-hidden': 'true' }), lbl);
    if (!busy && sp) sp.remove();
    lbl.textContent = busy ? labelText : btn.dataset.label;
  }
  function postJSON(payload) {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // no CORS preflight (Apps Script)
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) { return res.json(); }).finally(function () { clearTimeout(t); });
  }

  function initRsvp() {
    var form = $('[data-rsvp-form]');
    if (!form) return;
    var card = $('[data-rsvp-card]');
    var status = $('[data-rsvp-status]', form);
    var submit = $('[data-rsvp-submit]', form);
    var acceptOnly = $('[data-accept-only]', form);
    var confirmBox = $('[data-rsvp-confirmation]');
    var prevBox = $('[data-rsvp-previous]');
    var guests = $('#rsvp-guests');
    var max = (C.rsvp && C.rsvp.maxGuests) || 5;
    var startedAt = Date.now();
    var clientId = newId();

    // Event options from config (values must match the backend list)
    var opts = $('[data-event-options]', form);
    if (opts && C.rsvp && C.rsvp.events && C.rsvp.events.length) {
      opts.textContent = '';
      C.rsvp.events.forEach(function (ev, i) {
        opts.appendChild(el('label', { class: 'option' }, [
          el('input', { type: 'radio', name: 'event', value: ev, checked: i === 0 }),
          el('span', { text: ev })
        ]));
      });
    }
    function eventValue() { var r = $('input[name="event"]:checked', form); return r ? r.value : ''; }

    // Guest stepper
    guests.max = max;
    var stepBtns = $$('[data-step]', form);
    function clampGuests() {
      var n = parseInt(guests.value, 10);
      if (isNaN(n)) n = 1;
      n = Math.min(max, Math.max(1, n));
      guests.value = n;
      stepBtns.forEach(function (b) { b.disabled = (b.dataset.step === '-1' ? n <= 1 : n >= max); });
      return n;
    }
    stepBtns.forEach(function (b) {
      b.addEventListener('click', function () { guests.value = (parseInt(guests.value, 10) || 1) + parseInt(b.dataset.step, 10); clampGuests(); });
    });
    guests.addEventListener('change', clampGuests);
    clampGuests();

    function attendance() { var r = $('input[name="attendance"]:checked', form); return r ? r.value : ''; }
    $$('input[name="attendance"]', form).forEach(function (r) {
      r.addEventListener('change', function () {
        acceptOnly.hidden = attendance() !== 'accept';
        setFieldError($('input[name="attendance"]', form), '');
      });
    });
    ['#rsvp-name', '#rsvp-phone'].forEach(function (s) {
      var i = $(s, form); i.addEventListener('input', function () { if (i.getAttribute('aria-invalid')) setFieldError(i, ''); });
    });

    // Already replied from this device?
    var prev = null;
    try { prev = JSON.parse(local.get(RSVP_KEY) || 'null'); } catch (e) { prev = null; }
    if (prev && prev.reference && prevBox) {
      prevBox.hidden = false;
      prevBox.appendChild(el('p', null, [
        'You already replied from this phone (reference ', el('strong', { text: prev.reference }),
        prev.date ? ', ' + formatDate(prev.date) : '', '). No need to send it again. To change your reply, ',
        waReady ? el('a', { href: waLink('Hello! I would like to update my RSVP (' + prev.reference + ').', true), target: '_blank', rel: 'noopener', text: 'message us on WhatsApp' }) : 'please contact the couple',
        '. Replying for someone else? Use their name and number below.'
      ]));
    }

    function validate() {
      var errors = [];
      var name = $('#rsvp-name', form), phone = $('#rsvp-phone', form);
      var nv = name.value.trim();
      var nErr = nv.length < 2 ? 'Please enter your full name.' : (nv.length > 80 ? 'Please keep your name under 80 characters.' : '');
      setFieldError(name, nErr); if (nErr) errors.push(name);
      var pErr = phoneError(phone.value.trim());
      setFieldError(phone, pErr); if (pErr) errors.push(phone);
      var firstRadio = $('input[name="attendance"]', form);
      var aErr = attendance() ? '' : 'Please tick one: accepts or declines.';
      setFieldError(firstRadio, aErr); if (aErr) errors.push(firstRadio);
      return errors;
    }

    function summaryText(data) {
      return [
        'RSVP for ' + couple + '’s wedding',
        'Name: ' + data.name,
        'Phone: ' + data.phone,
        'Attending: ' + (data.attendance === 'accept' ? 'Yes, joyfully' : 'Regretfully, no'),
        data.attendance === 'accept' ? 'Guests: ' + data.guests : null,
        data.attendance === 'accept' && data.event ? 'Event: ' + data.event : null,
        data.message ? 'Message: ' + data.message : null
      ].filter(Boolean).join('\n');
    }
    function showStatus(kind, nodes) {
      status.className = 'form__status' + (kind ? ' is-' + kind : '');
      status.textContent = '';
      nodes.forEach(function (n) { status.appendChild(n); });
    }
    function whatsappFallback(data, lead) {
      showStatus(lead.kind, [
        el('p', null, [el('strong', { text: lead.title })]),
        el('p', { text: lead.text }),
        el('a', { class: 'btn', href: waLink(summaryText(data), true), target: '_blank', rel: 'noopener', text: 'Send my reply on WhatsApp' })
      ]);
    }

    function showConfirmation(data, ref, duplicate) {
      var first = data.name.split(/\s+/)[0];
      var accepted = data.attendance === 'accept';
      confirmBox.textContent = '';
      var copyBtn = el('button', { class: 'btn', type: 'button', text: 'Copy reference' });
      copyBtn.addEventListener('click', function () { copyText(ref, 'Reference copied'); });
      var again = el('button', { class: 'link', type: 'button', text: 'Reply for someone else' });
      again.addEventListener('click', function () {
        form.reset(); acceptOnly.hidden = true; clampGuests(); status.textContent = ''; status.className = 'form__status';
        var firstEv = $('input[name="event"]', form); if (firstEv) firstEv.checked = true;
        startedAt = Date.now(); clientId = newId();
        updateCounters();
        confirmBox.hidden = true; form.hidden = false; $('#rsvp-name', form).focus();
      });
      var actions = el('div', { class: 'confirmation__actions' }, [copyBtn]);
      if (accepted) {
        var gc = $('[data-gcal]');
        actions.appendChild(el('a', { class: 'link', href: gc ? gc.href : '#details', target: '_blank', rel: 'noopener', text: 'Add the day to Google Calendar' }));
      }
      actions.appendChild(again);

      var summary = el('dl', { class: 'confirmation__summary' }, [
        el('div', null, [el('dt', { class: 'label', text: 'Name' }), el('dd', { text: data.name })]),
        el('div', null, [el('dt', { class: 'label', text: 'Reply' }), el('dd', { text: accepted ? 'Joyfully accepts' : 'Regretfully declines' })]),
        accepted ? el('div', null, [el('dt', { class: 'label', text: 'Guests' }), el('dd', { class: 'lnum', text: String(data.guests) })]) : null,
        accepted ? el('div', null, [el('dt', { class: 'label', text: 'Attending' }), el('dd', { text: data.event })]) : null
      ]);
      [
        el('p', { class: 'confirmation__title', text: 'Thank you, ' + first + '.' }),
        el('p', { class: 'muted', text: duplicate
          ? 'We already have your reply, so there is nothing more to do. Here is your original reference.'
          : (accepted ? 'Your reply is in. We can’t wait to see you in Moniya.' : 'We’ll miss you, and we’re grateful for your prayers. Thank you for letting us know.') }),
        el('p', { class: 'confirmation__ref' }, [el('span', { class: 'label', text: 'Your reference' }), el('strong', { text: ref })]),
        el('p', { class: 'muted', text: 'Keep this reference. A screenshot is perfect.' }),
        summary,
        actions
      ].forEach(function (n) { if (n) confirmBox.appendChild(n); });
      form.hidden = true;
      if (prevBox) prevBox.hidden = true;
      confirmBox.hidden = false;
      confirmBox.focus({ preventScroll: true });
      card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submit.disabled) return;
      var errors = validate();
      if (errors.length) { errors[0].focus(); return; }
      var accepted = attendance() === 'accept';
      var data = {
        action: 'rsvp',
        name: $('#rsvp-name', form).value.trim(),
        phone: $('#rsvp-phone', form).value.trim(),
        attendance: attendance(),
        guests: accepted ? clampGuests() : 0,
        event: accepted ? eventValue() : '',
        message: $('#rsvp-message', form).value.trim().slice(0, 500),
        website: $('#rsvp-website', form).value,
        startedAt: startedAt,
        clientId: clientId
      };
      if (!apiReady) {
        whatsappFallback(data, {
          kind: '', title: 'Online replies open soon.',
          text: 'Our reply card isn’t connected just yet. Please send your reply on WhatsApp instead. We’ve written the message for you.'
        });
        status.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        return;
      }
      setBusy(submit, true, 'Sending…');
      showStatus('', []);
      var wait = Math.max(0, 3200 - (Date.now() - startedAt));   // server rejects forms sent in < 3s
      sleep(wait).then(function () { return postJSON(data); }).then(function (res) {
        if (res && res.ok && res.reference) {
          local.set(RSVP_KEY, JSON.stringify({ reference: res.reference, name: data.name, attendance: data.attendance, date: new Date().toISOString().slice(0, 10) }));
          showConfirmation(data, res.reference, !!res.duplicate);
        } else {
          showStatus('error', [el('p', { text: (res && res.error) || 'Sorry, something went wrong. Please try again.' })]);
          status.scrollIntoView({ block: 'center' });
        }
      }).catch(function () {
        whatsappFallback(data, {
          kind: 'error', title: 'We couldn’t send your reply.',
          text: 'Please check your connection and try again, or send it on WhatsApp instead.'
        });
      }).then(function () { setBusy(submit, false); });
    });
  }

  /* ======================================================================
     8. Guestbook  (POST action=guestbook, GET ?action=guestbook)
     ====================================================================== */
  function initGuestbook() {
    var form = $('[data-guestbook-form]');
    var wishes = $('[data-wishes]'), list = $('[data-wishes-list]');
    if (!form) return;
    var status = $('[data-guestbook-status]', form);
    var submit = $('[data-guestbook-submit]', form);
    var startedAt = Date.now(), clientId = newId();
    var nameIn = $('#gb-name', form), msgIn = $('#gb-message', form);
    [nameIn, msgIn].forEach(function (i) { i.addEventListener('input', function () { if (i.getAttribute('aria-invalid')) setFieldError(i, ''); }); });
    function say(kind, nodes) {
      status.className = 'form__status' + (kind ? ' is-' + kind : '');
      status.textContent = '';
      nodes.forEach(function (n) { status.appendChild(n); });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submit.disabled) return;
      var name = nameIn.value.trim(), message = msgIn.value.trim();
      var nErr = name.length < 2 ? 'Please enter your name.' : '';
      var mErr = message.length < 2 ? 'Please write a short message.' : (message.length > 400 ? 'Please keep it under 400 characters.' : '');
      setFieldError(nameIn, nErr); setFieldError(msgIn, mErr);
      if (nErr) { nameIn.focus(); return; }
      if (mErr) { msgIn.focus(); return; }
      if (!apiReady) {
        say('', [
          el('p', null, [el('strong', { text: 'The guestbook opens soon.' })]),
          el('p', { text: 'Until then, you can send your wishes on WhatsApp.' }),
          el('a', { class: 'btn', href: waLink('Wishes for ' + couple + ' from ' + name + ':\n' + message, true), target: '_blank', rel: 'noopener', text: 'Send on WhatsApp' })
        ]);
        return;
      }
      setBusy(submit, true, 'Sending…');
      var payload = { action: 'guestbook', name: name, message: message, website: $('#gb-website', form).value, startedAt: startedAt, clientId: clientId };
      sleep(Math.max(0, 3200 - (Date.now() - startedAt))).then(function () { return postJSON(payload); }).then(function (res) {
        if (res && res.ok) {
          form.reset(); updateCounters();
          startedAt = Date.now(); clientId = newId();
          say('success', [el('p', { text: 'Ẹ ṣé. Your message will appear here once we have read it.' })]);
        } else {
          say('error', [el('p', { text: (res && res.error) || 'Sorry, something went wrong. Please try again.' })]);
        }
      }).catch(function () {
        say('error', [el('p', { text: 'We couldn’t send your message. Please check your connection and try again.' })]);
      }).then(function () { setBusy(submit, false); });
    });

    // Approved wishes: server returns raw text, so only textContent is used.
    if (!apiReady || !wishes || !list || !window.fetch) return;
    function load() {
      fetch(API + (API.indexOf('?') > -1 ? '&' : '?') + 'action=guestbook', { redirect: 'follow' })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok || !res.entries || !res.entries.length) return;
          list.textContent = '';
          res.entries.slice(0, 50).forEach(function (w) {
            list.appendChild(el('li', null, [
              el('p', { class: 'wish', text: String(w.message || '') }),
              el('p', { class: 'label', text: String(w.name || '') + (w.date ? ' · ' + formatDate(w.date) : '') })
            ]));
          });
          wishes.hidden = false;
        }).catch(function () { /* stay hidden */ });
    }
    var sec = $('#guestbook');
    if ('IntersectionObserver' in window && sec) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '600px 0px' });
      io.observe(sec);
    } else load();
  }

  function updateCounters() {
    $$('[data-counter]').forEach(function (t) {
      var out = doc.getElementById(t.getAttribute('data-counter'));
      if (out) out.textContent = t.value.length + ' / ' + t.maxLength;
    });
  }
  function initCounters() {
    $$('[data-counter]').forEach(function (t) { t.addEventListener('input', updateCounters); });
    updateCounters();
  }

  /* ======================================================================
     9. Gifts
     ====================================================================== */
  var toastTimer;
  function toast(msg) {
    var t = $('[data-toast]'); if (!t) return;
    t.textContent = msg; t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 2800);
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = el('textarea', { readonly: true, 'aria-hidden': 'true' });
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0';
      doc.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var ok = false; try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : 'Couldn’t copy automatically. Please copy: ' + text);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    else fallback();
  }
  function initGifts() {
    var g = C.gifts || {};
    var acct = String((g.bank && g.bank.accountNumber) || '').replace(/\s/g, '');
    var copyBtn = $('[data-copy-account]');
    if (copyBtn) copyBtn.addEventListener('click', function () { copyText(acct, 'Account number copied'); });
    var ps = $('[data-paystack]');
    if (ps && hasText(g.paystackUrl)) { ps.href = g.paystackUrl; ps.hidden = false; }
  }

  /* ======================================================================
     9b. Gift registry  (GET ?action=registry, POST action=pledge)
         Every string from the sheet is written with textContent only.
     ====================================================================== */
  var PLEDGE_KEY = 'fl-v2b-pledges';
  function initRegistry() {
    var box = $('[data-registry]');
    if (!box) return;
    var cfg = C.registry || {};
    var list = $('[data-registry-list]', box);
    var status = $('[data-registry-status]', box);
    var bank = $('[data-bank]', box);          // the one bank-details panel; lives inside the Cash gift row
    if (cfg.enabled === false) {               // no list: keep the static Cash gift row with bank details
      $$('#registry-title + .muted', box).forEach(function (n) { n.hidden = true; });
      return;
    }
    var helper = (C.contact && C.contact.whatsappName) || 'us';
    var helperFirst = String(helper).split(/\s+/)[0];
    var items = [];
    var cashOpen = false;
    var mine = {};
    try { mine = JSON.parse(local.get(PLEDGE_KEY) || '{}') || {}; } catch (e) { mine = {}; }

    function waHelp(text) {
      return waReady ? el('a', { class: 'link', href: waLink(text, true), target: '_blank', rel: 'noopener', text: 'Message ' + helperFirst + ' on WhatsApp' }) : null;
    }
    function say(nodes) {
      status.textContent = '';
      (nodes || []).forEach(function (n) { if (n) status.appendChild(n); });
    }
    function isCash(it) { return it.id === 'cash-gift' || /^(money|cash)$/i.test(String(it.category || '')); }

    // The Cash gift row: tap to reveal the bank details (and, if the sheet lists it, "I'm sending cash").
    function cashRow(it, expanded) {
      var panelId = 'cash-details';
      var toggle = el('button', { class: 'link', type: 'button', 'aria-expanded': String(expanded), 'aria-controls': panelId,
        text: expanded ? 'Hide bank details' : 'Show bank details' });
      var more = el('div', { class: 'item__more', id: panelId }, [bank]);
      more.hidden = !expanded;
      if (it.id != null && apiReady) {
        var tell = el('button', { class: 'link', type: 'button', text: 'Let us know you’re sending cash' });
        tell.addEventListener('click', function () { openPledge(it, tell); });
        more.appendChild(el('p', { class: 'item__tell' }, [tell]));
      }
      toggle.addEventListener('click', function () {
        cashOpen = more.hidden;
        more.hidden = !cashOpen;
        toggle.setAttribute('aria-expanded', String(cashOpen));
        toggle.textContent = cashOpen ? 'Hide bank details' : 'Show bank details';
      });
      var note = 'By bank transfer';   // the sheet's note ("Bank details are just below") is ignored: the details open in this row
      var mineRef = it.id != null ? mine[it.id] : null;
      return el('li', { class: 'item item--cash', 'data-item': String(it.id || 'cash') }, [
        el('div', null, [
          el('p', { class: 'item__name', text: String(it.name || 'Cash gift') }),
          el('p', { class: 'item__note', text: note }),
          mineRef ? el('p', { class: 'item__note', text: 'Your reference: ' + mineRef }) : null
        ]),
        toggle,
        more
      ]);
    }
    function group(cat, gi, lis) {
      var ul = el('ul', { class: 'registry__items', 'aria-labelledby': 'reg-cat-' + gi });
      lis.forEach(function (li) { ul.appendChild(li); });
      return el('div', { class: 'registry__group' }, [el('h4', { class: 'label', id: 'reg-cat-' + gi, text: cat }), ul]);
    }

    function fallback() {
      list.removeAttribute('aria-busy');
      list.textContent = '';
      list.appendChild(el('p', { class: 'muted registry__fallback', text: 'The gift list isn’t available right now. ' + (waReady ? helper + ' can tell you what is still needed.' : 'Please check back soon.') }));
      var a = waHelp('Hello ' + helperFirst + ', I would like to get a gift for ' + couple + '. What is still needed?');
      if (a) list.appendChild(el('p', { class: 'registry__fallback' }, [a]));
      list.appendChild(group('Money', 0, [cashRow({ id: null, name: 'Cash gift' }, true)]));
    }

    function render() {
      list.removeAttribute('aria-busy');
      list.textContent = '';
      if (!items.length) return fallback();
      var rows = items.slice();
      if (!rows.some(isCash)) rows.unshift({ id: null, name: 'Cash gift', category: 'Money' });   // bank details always reachable
      var groups = [], byCat = {};
      rows.forEach(function (it) {
        var cat = hasText(it.category) ? String(it.category) : 'Other';
        if (!byCat[cat]) { byCat[cat] = []; groups.push(cat); }
        byCat[cat].push(it);
      });
      groups.forEach(function (cat, gi) {
        list.appendChild(group(cat, gi, byCat[cat].map(function (it) {
          if (isCash(it)) return cashRow(it, cashOpen);
          var wanted = it.wanted == null ? null : Number(it.wanted);
          var remaining = it.remaining == null ? null : Math.max(0, Number(it.remaining));
          var chosen = remaining === 0;
          var mineRef = mine[it.id];
          var statusText, action = null;
          if (chosen) {
            statusText = mineRef ? 'Chosen by you' : 'Chosen';
          } else {
            statusText = (wanted && wanted > 1) ? remaining + ' of ' + wanted + ' left' : 'Available';
            action = el('button', { class: 'link', type: 'button', text: 'I’ll get this', 'aria-label': 'I’ll get this: ' + String(it.name || '') });
            action.addEventListener('click', function () { openPledge(it, action); });
          }
          var meta = [];
          if (hasText(it.note)) meta.push(String(it.note));
          meta.push(statusText);
          return el('li', { class: 'item' + (chosen ? ' is-chosen' : ''), 'data-item': String(it.id || '') }, [
            el('div', null, [
              el('p', { class: 'item__name', text: String(it.name || '') }),
              el('p', { class: 'item__note', text: meta.join(' · ') }),
              mineRef ? el('p', { class: 'item__note', text: 'Your reference: ' + mineRef }) : null
            ]),
            action
          ]);
        })));
      });
    }

    function load() {
      if (!apiReady || !window.fetch) { fallback(); return Promise.resolve(); }
      var ctrl = 'AbortController' in window ? new AbortController() : null;
      var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
      return fetch(API + (API.indexOf('?') > -1 ? '&' : '?') + 'action=registry', { redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok || !Array.isArray(res.items)) throw new Error('bad');
          items = res.items.filter(function (i) { return i && i.id != null && hasText(String(i.name || '')); });
          render();
        })
        .catch(function () { if (!items.length) fallback(); })
        .finally(function () { clearTimeout(t); });
    }

    /* ---- the pledge dialog ---- */
    var modal = $('[data-pledge]');
    var form = $('[data-pledge-form]', modal);
    var title = $('[data-pledge-item]', modal);
    var intro = $('[data-pledge-intro]', modal);
    var bodyBox = $('[data-pledge-body]', modal);
    var done = $('[data-pledge-done]', modal);
    var pStatus = $('[data-pledge-status]', modal);
    var submit = $('[data-pledge-submit]', modal);
    var nameIn = $('#pledge-name', modal), phoneIn = $('#pledge-phone', modal), msgIn = $('#pledge-message', modal);
    var current = null, opener = null, startedAt = 0, clientId = '', isOpen = false;
    [nameIn, phoneIn].forEach(function (i) { i.addEventListener('input', function () { if (i.getAttribute('aria-invalid')) setFieldError(i, ''); }); });

    function focusables() {
      return $$('button, [href], input:not([tabindex="-1"]), textarea', modal).filter(function (n) {
        return !n.disabled && n.offsetParent !== null;
      });
    }
    function pSay(kind, nodes) {
      pStatus.className = 'form__status' + (kind ? ' is-' + kind : '');
      pStatus.textContent = '';
      nodes.forEach(function (n) { if (n) pStatus.appendChild(n); });
    }
    function openPledge(it, trigger) {
      current = it; opener = trigger;
      title.textContent = String(it.name || '');
      intro.textContent = it.remaining == null
        ? 'Leave your name and number so we know whom to thank.'
        : 'Leave your name and number so we know whom to thank. We’ll mark it as chosen so no one else buys it.';
      form.reset(); updateCounters(); pSay('', []);
      [nameIn, phoneIn].forEach(function (i) { setFieldError(i, ''); });
      bodyBox.hidden = false; done.hidden = true; done.textContent = '';
      startedAt = Date.now(); clientId = newId();
      modal.hidden = false; isOpen = true;
      doc.body.classList.add('no-scroll'); setInert(true);
      doc.dispatchEvent(new CustomEvent('dialog:toggle', { detail: true }));
      setTimeout(function () { nameIn.focus(); }, 30);
    }
    function closePledge() {
      if (!isOpen) return;
      isOpen = false; modal.hidden = true;
      doc.body.classList.remove('no-scroll'); setInert(false);
      doc.dispatchEvent(new CustomEvent('dialog:toggle', { detail: false }));
      // the list may have re-rendered; find the same item's control again
      var target = opener && doc.body.contains(opener) ? opener : null;
      if (!target && current) {
        var row = $('[data-item="' + String(current.id).replace(/["\\]/g, '') + '"]', list);
        target = row ? $('button, a', row) : null;
      }
      (target || $('#registry-title')).focus();
    }
    $$('[data-pledge-close]', modal).forEach(function (b) { b.addEventListener('click', closePledge); });
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closePledge(); return; }
      trapTab(e, focusables());
    });

    function showDone(nodes) {
      bodyBox.hidden = true;
      done.textContent = '';
      nodes.forEach(function (n) { if (n) done.appendChild(n); });
      done.hidden = false;
      done.focus({ preventScroll: true });
    }
    function closeBtn(text) {
      var b = el('button', { class: 'btn btn--block', type: 'button', text: text || 'Done' });
      b.addEventListener('click', closePledge);
      return b;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submit.disabled || !current) return;
      var name = nameIn.value.trim(), phone = phoneIn.value.trim();
      var nErr = name.length < 2 ? 'Please enter your name.' : (name.length > 80 ? 'Please keep your name under 80 characters.' : '');
      var pErr = phoneError(phone);
      setFieldError(nameIn, nErr); setFieldError(phoneIn, pErr);
      if (nErr) { nameIn.focus(); return; }
      if (pErr) { phoneIn.focus(); return; }
      var it = current;
      var waText = 'Hello ' + helperFirst + ', I would like to get the ' + String(it.name || '') + ' for ' + couple + '. My name is ' + name + '.';
      if (!apiReady) {
        pSay('', [el('p', { text: 'The gift list isn’t connected yet. Please let ' + helperFirst + ' know instead.' }), waHelp(waText)]);
        return;
      }
      var payload = { action: 'pledge', itemId: String(it.id), name: name, phone: phone, message: msgIn.value.trim().slice(0, 200),
        website: $('#pledge-website', modal).value, startedAt: startedAt, clientId: clientId };
      setBusy(submit, true, 'Sending…');
      pSay('', []);
      sleep(Math.max(0, 3200 - (Date.now() - startedAt))).then(function () { return postJSON(payload); }).then(function (res) {
        if (res && res.ok && res.reference) {
          mine[it.id] = String(res.reference);
          local.set(PLEDGE_KEY, JSON.stringify(mine));
          var first = name.split(/\s+/)[0];
          var giftName = String(res.itemName || it.name || 'gift');
          showDone([
            el('p', { class: 'confirmation__title', text: 'Thank you, ' + first + '.' }),
            el('p', { class: 'muted', text: res.duplicate
              ? 'We already have this from you, so there is nothing more to do.'
              : (it.remaining == null ? 'Thank you for letting us know. The bank details stay in the list whenever you need them.'
                : 'We’ve marked the ' + giftName + ' as chosen, so no one else will buy it.') }),
            el('p', { class: 'confirmation__ref' }, [el('span', { class: 'label', text: 'Your reference' }), el('strong', { text: String(res.reference) })]),
            el('p', { class: 'muted', text: 'Keep this reference. A screenshot is perfect.' }),
            closeBtn('Done')
          ]);
          load();
        } else if (res && res.soldOut) {
          showDone([
            el('p', { class: 'confirmation__title', text: 'Just missed it' }),
            el('p', { class: 'muted', text: 'Someone has just chosen the ' + String(it.name || 'gift') + '. The list has been refreshed, so please pick another.' }),
            closeBtn('Back to the list')
          ]);
          load().then(function () { say([el('p', { text: 'The list has been updated. Thank you for your patience.' })]); });
        } else {
          pSay('error', [el('p', { text: String((res && res.error) || 'Sorry, something went wrong. Please try again.') })]);
          if (res && /no longer/i.test(String(res.error || ''))) load();
        }
      }).catch(function () {
        pSay('error', [el('p', { text: 'We couldn’t send that. Please check your connection and try again, or let ' + helperFirst + ' know.' }), waHelp(waText)]);
      }).then(function () { setBusy(submit, false); });
    });

    // Fetch straight away on init, so the list is ready before anyone scrolls to it.
    list.setAttribute('aria-busy', 'true');
    load();
  }

  /* ======================================================================
     10. Sharing & help
     ====================================================================== */
  function initShare() {
    var share = $('[data-share-whatsapp]');
    if (share) {
      var w = C.wedding || {}, ch = C.church || {};
      var text = couple + ' are getting married!\n' + (w.dateLabel || '') + ' · 10:00 AM\n' + (ch.name || '') + ', ' + (ch.shortAddress || '') +
        '\n\nDetails & RSVP: ' + siteUrl() + (C.couple && C.couple.hashtag ? '\n' + C.couple.hashtag : '');
      share.href = waLink(text, false);
    }
    var help = $('[data-help-whatsapp]');
    if (help && waReady) {
      help.href = waLink('Hello! I have a question about ' + couple + '’s wedding.', true);
      help.hidden = false;
    }
  }

  /* ---------- Boot ---------- */
  function boot() {
    var steps = [bindConfig, initEnvelope, initMasthead, initMenu, initScrollSpy, initStickyRsvp, initCountdown, renderStory, renderDetails,
      renderTimeline, renderUpdates, renderSwatches, initGallery, initRsvp, initGuestbook, initCounters, initGifts, initRegistry, initShare];
    steps.forEach(function (fn) {
      try { fn(); } catch (err) {
        if (window.console) console.error('[wedding site] ' + fn.name + ' failed:', err);
        if (fn === initEnvelope) { root.classList.remove('env-pending'); revealHero(); }
      }
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
