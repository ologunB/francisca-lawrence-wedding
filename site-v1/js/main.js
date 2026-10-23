/* ==========================================================================
   Francisca & Lawrence — site behaviour
   All content comes from window.CONFIG (config.js). No frameworks.
   ========================================================================== */
(function () {
  'use strict';

  var C = window.CONFIG || {};
  var doc = document;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Small helpers ---------- */
  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function get(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, C);
  }
  /** Create an element. Text is always set via textContent (never innerHTML). */
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
  function icon(id, cls) {
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    var use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }
  function isPlaceholder(v) { return !v || /PASTE_|PLACEHOLDER|YOUR-SITE/i.test(String(v)); }
  function hasText(v) { return typeof v === 'string' && v.trim() !== ''; }
  function store(kind) {
    // Safe wrapper: storage can throw in private mode / blocked cookies.
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
  function toGcalStamp(iso) { // -> 20261219T090000Z
    return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
  function setInert(on, except) {
    // Hides the page behind overlays from keyboard & screen readers.
    ['main', '.site-footer', '.rsvp-pill', '.skip-link'].concat(except === 'header' ? [] : ['.site-header']).forEach(function (s) {
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
  /** WhatsApp link: to the couple's helper number if set, otherwise lets the guest pick a chat. */
  function waLink(text, toHelper) {
    var base = (toHelper && waReady) ? 'https://wa.me/' + waNumber : 'https://wa.me/';
    return base + '?text=' + encodeURIComponent(text);
  }

  /* ======================================================================
     1. Fill simple text from config  (elements with data-config="path")
     ====================================================================== */
  function bindConfig() {
    $$('[data-config]').forEach(function (n) {
      var v = get(n.getAttribute('data-config'));
      if (v != null && v !== '' && typeof v !== 'object') n.textContent = v;
    });
  }

  /* ======================================================================
     2. Header, mobile menu, scroll-spy, sticky RSVP pill
     ====================================================================== */
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
      doc.body.classList.toggle('no-scroll', state);
      setInert(state, 'header');
      doc.dispatchEvent(new CustomEvent('menu:toggle', { detail: state }));
      if (state) setTimeout(function () { links[0] && links[0].focus(); }, 60);
      else if (restoreFocus) toggle.focus();
    }
    toggle.addEventListener('click', function () { setOpen(!open, true); });
    links.forEach(function (a) { a.addEventListener('click', function () { setOpen(false, false); }); });
    doc.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') setOpen(false, true);
      trapTab(e, [toggle].concat(links));
    });
    window.addEventListener('resize', function () { if (open && window.innerWidth >= 1040) setOpen(false); });
  }

  function initScrollSpy() {
    var navLinks = $$('.desktop-nav a');
    if (!('IntersectionObserver' in window) || !navLinks.length) return;
    var map = {};
    navLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    // Watch every top-level section (not only linked ones), so passing through e.g. RSVP or Colours
    // clears the highlight instead of leaving the previous link lit.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
        var a = map[en.target.id]; if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section[id]').forEach(function (s) { io.observe(s); });
  }

  function initRsvpPill() {
    var pill = $('[data-rsvp-pill]');
    var hero = $('#home'), rsvp = $('#rsvp'), footer = $('.site-footer');
    if (!pill || !hero || !rsvp || !('IntersectionObserver' in window)) return;
    var inHero = true, inRsvp = false, inFooter = false, menuOpen = false;
    // Also hidden over sections full of buttons/forms (details, gallery, gifts + registry, guestbook) so it never covers them
    var busy = {};
    function update() {
      var overForm = Object.keys(busy).some(function (k) { return busy[k]; });
      pill.classList.toggle('is-visible', !inHero && !inRsvp && !inFooter && !overForm && !menuOpen);
    }
    ['#details', '#gallery', '#gifts', '#guestbook'].forEach(function (sel) {
      var n = $(sel); if (!n) return;
      new IntersectionObserver(function (e) { busy[sel] = e[0].isIntersecting; update(); }, { rootMargin: '0px 0px -120px 0px' }).observe(n);
    });
    new IntersectionObserver(function (e) { inHero = e[0].isIntersecting; update(); }, { threshold: 0.05 }).observe(hero);
    new IntersectionObserver(function (e) { inRsvp = e[0].isIntersecting; update(); }, { threshold: 0.02 }).observe(rsvp);
    if (footer) new IntersectionObserver(function (e) { inFooter = e[0].isIntersecting; update(); }).observe(footer);
    doc.addEventListener('menu:toggle', function (e) { menuOpen = e.detail; update(); });
  }

  /* ======================================================================
     3. Envelope intro (JS-only overlay; never shown without JS)
     ====================================================================== */
  function initEnvelope() {
    function skipIntro() { doc.documentElement.classList.remove('env-pending'); }
    if (reduceMotion) return skipIntro();
    if (location.hash && location.hash.length > 1) return skipIntro();   // arrived via a shared deep link
    if (session.get('fl-v1b-envelope-opened')) return skipIntro();

    var bride = (C.couple && C.couple.brideFirst) || 'Francisca';
    var groom = (C.couple && C.couple.groomFirst) || 'Lawrence';
    // The seal is drawn twice (left + right half, clipped along a jagged crack in CSS) so it can break apart.
    function seal(k) {
      return '<svg viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs>' +
      '<radialGradient id="wax' + k + '" cx="42%" cy="38%" r="68%"><stop offset="0" stop-color="#C9A35E"/><stop offset=".62" stop-color="#A7803E"/><stop offset="1" stop-color="#7D5A27"/></radialGradient>' +
      '<filter id="wax-edge' + k + '" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="9"/></filter>' +
      '<filter id="wax-shadow' + k + '" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#3B241C" flood-opacity=".35"/></filter>' +
      '</defs>' +
      '<g filter="url(#wax-shadow' + k + ')"><circle cx="60" cy="60" r="53" fill="url(#wax' + k + ')" filter="url(#wax-edge' + k + ')"/></g>' +
      '<circle cx="60" cy="60" r="39" fill="none" stroke="#6F4F20" stroke-width="1.6" opacity=".55"/>' +
      '<circle cx="59.3" cy="59.3" r="39" fill="none" stroke="#E6CF98" stroke-width=".8" opacity=".45"/>' +
      '<g font-family="Cormorant Garamond, Georgia, serif" font-size="27" font-weight="600" text-anchor="middle">' +
      '<text x="59.3" y="68.3" fill="#E9D4A0" opacity=".55">F<tspan font-style="italic" font-weight="500" font-size="24" dx="2">&amp;</tspan><tspan dx="2">L</tspan></text>' +
      '<text x="60" y="69" fill="#6A4B1D" opacity=".9">F<tspan font-style="italic" font-weight="500" font-size="24" dx="2">&amp;</tspan><tspan dx="2">L</tspan></text>' +
      '</g></svg>';
    }

    var overlay = el('div', { class: 'envelope', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Wedding invitation envelope', tabindex: '-1' });
    function namePair(cls) {
      return el(cls === 'p' ? 'p' : 'span', cls === 'p' ? { class: 'envelope__names' } : null,
        [bride + ' ', el('span', { class: 'envelope__amp', text: '&' }), ' ' + groom]);
    }
    var names = namePair('p');
    var date = el('p', { class: 'envelope__date', text: (C.wedding && C.wedding.dateLabel) || '' });
    var btn = el('button', { class: 'envelope__button', type: 'button', 'aria-label': 'Open the invitation' });
    var body = el('span', { class: 'envelope__body' });
    var letter = el('span', { class: 'envelope__letter', 'aria-hidden': 'true' }, [
      el('small', { text: 'You are invited' }), el('span', { class: 'envelope__letter-names' }, [namePair()])
    ]);
    var pocket = el('span', { class: 'envelope__pocket' });
    var flap = el('span', { class: 'envelope__flap' });
    var sealWrap = el('span', { class: 'envelope__seal' });
    // Static drawings only (no user content)
    pocket.innerHTML = '<svg viewBox="0 0 145 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon points="0,0 72.5,56 0,100" fill="#F2E8D6"/><polygon points="145,0 72.5,56 145,100" fill="#F2E8D6"/>' +
      '<polygon points="0,100 72.5,47 145,100" fill="#F6EEE0"/>' +
      '<g fill="none" stroke="#85652B" stroke-opacity=".28" stroke-width="1" vector-effect="non-scaling-stroke">' +
      '<polyline points="0,0 72.5,56 145,0"/><polyline points="0,100 72.5,47 145,100"/></g></svg>';
    // Two faces: the outside (seen while closed) and the slightly darker inside (seen once it swings open).
    flap.innerHTML = '<span class="envelope__flap-face envelope__flap-face--front"><svg viewBox="0 0 145 58" preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon points="0,0 145,0 72.5,58" fill="#F4ECDD"/>' +
      '<polyline points="0,0 72.5,58 145,0" fill="none" stroke="#85652B" stroke-opacity=".32" stroke-width="1" vector-effect="non-scaling-stroke"/></svg></span>' +
      '<span class="envelope__flap-face envelope__flap-face--back"><svg viewBox="0 0 145 58" preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon points="0,58 145,58 72.5,0" fill="#EBDDC3"/>' +
      '<polyline points="0,58 72.5,0 145,58" fill="none" stroke="#85652B" stroke-opacity=".25" stroke-width="1" vector-effect="non-scaling-stroke"/></svg></span>';
    sealWrap.innerHTML = '<span class="envelope__seal-half envelope__seal-half--l">' + seal('-l') + '</span>' +
      '<span class="envelope__seal-half envelope__seal-half--r">' + seal('-r') + '</span>';
    btn.appendChild(body); btn.appendChild(letter); btn.appendChild(pocket); btn.appendChild(flap); btn.appendChild(sealWrap);
    var hint = el('p', { class: 'envelope__hint', text: 'Tap to open the invitation', 'aria-hidden': 'true' });
    var skip = el('button', { class: 'envelope__skip', type: 'button', text: 'Skip' });
    overlay.appendChild(skip); overlay.appendChild(names); overlay.appendChild(date);
    overlay.appendChild(btn); overlay.appendChild(hint);
    doc.body.appendChild(overlay);
    doc.documentElement.classList.remove('env-pending');   // envelope now covers the page itself
    doc.body.classList.add('no-scroll');
    setInert(true);
    overlay.focus({ preventScroll: true });

    var done = false;
    function finish(delay) {
      if (done) return; done = true;
      session.set('fl-v1b-envelope-opened', '1');
      setTimeout(function () {
        overlay.classList.add('is-leaving');
        doc.body.classList.remove('no-scroll');
        setInert(false);
        var h1 = $('#hero-title');
        if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
        setTimeout(function () { overlay.remove(); }, 1400);
      }, delay);
    }
    btn.addEventListener('click', function () {
      if (done) return;
      // Freeze the idle float / seal pulse where they are, so stopping them never makes the envelope jump:
      // the envelope then eases back to rest (CSS transition) and the seal press starts from its current size.
      var bs = getComputedStyle(btn), ss = getComputedStyle(sealWrap);
      btn.style.transform = bs.transform === 'none' ? '' : bs.transform;
      btn.style.opacity = bs.opacity;
      sealWrap.style.transform = ss.transform === 'none' ? '' : ss.transform;
      btn.classList.add('is-open');
      overlay.classList.add('is-opening');
      void btn.offsetWidth;   // commit the frozen pose before releasing it
      btn.style.transform = ''; btn.style.opacity = '';
      finish(3900);
    });
    skip.addEventListener('click', function () { finish(0); });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') finish(0);
      trapTab(e, [skip, btn]);
    });
  }

  /* ======================================================================
     4. Countdown (Africa/Lagos time is encoded in CONFIG.wedding.dateISO)
     ====================================================================== */
  function initCountdown() {
    var box = $('[data-countdown]');
    if (!box || !C.wedding) return;
    var start = Date.parse(C.wedding.dateISO);
    var end = Date.parse(C.wedding.endISO) || start + 3 * 3600e3;
    if (isNaN(start)) return;
    box.hidden = false;
    var grid = $('[data-cd-grid]', box), done = $('[data-cd-done]', box), label = $('.countdown__label', box);
    var parts = { days: $('[data-cd="days"]', box), hours: $('[data-cd="hours"]', box), mins: $('[data-cd="mins"]', box), secs: $('[data-cd="secs"]', box) };
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    var timer;
    function tick() {
      var now = Date.now(), diff = start - now;
      if (diff <= 0) {
        grid.hidden = true; label.hidden = true; done.hidden = false;
        done.textContent = now < end + 12 * 3600e3
          ? 'Today is the day! Thank you for celebrating with us.'
          : couple + ' are married — thank you for your love and prayers.';
        clearInterval(timer); return;
      }
      var s = Math.floor(diff / 1000);
      parts.days.textContent = Math.floor(s / 86400);
      parts.hours.textContent = pad(Math.floor(s % 86400 / 3600));
      parts.mins.textContent = pad(Math.floor(s % 3600 / 60));
      parts.secs.textContent = pad(s % 60);
      grid.setAttribute('aria-label', Math.floor(s / 86400) + ' days until the wedding');
    }
    tick();
    timer = setInterval(tick, 1000);
  }

  /* ======================================================================
     5. Content sections rendered from config
     ====================================================================== */
  /* Hide the whole Gifts section (and every link to it) when the couple's gift list is empty.
     A failed load is different: it keeps the section with the WhatsApp fallback. */
  function setGiftsVisible(show) {
    var sec = document.getElementById('gifts');
    if (sec) sec.hidden = !show;
    Array.prototype.forEach.call(document.querySelectorAll('a[href="#gifts"], a[href="#registry"]'), function (a) {
      var li = a.closest('li');
      (li || a).hidden = !show;
    });
  }

  function renderStory() {
    var box = $('[data-story]');
    var paras = C.story && C.story.paragraphs;
    if (!box || !paras || !paras.length) return;
    box.textContent = '';
    paras.forEach(function (p) { box.appendChild(el('p', { text: p })); });
  }

  function renderDetails() {
    // Church: directions + calendar links
    var church = C.church || {};
    var dir = $('[data-church-directions]');
    if (dir && church.mapsUrl) dir.href = church.mapsUrl;
    var note = $('[data-config="church.directionsNote"]');
    if (note && !hasText(church.directionsNote)) note.remove();

    var gcal = $('[data-gcal]');
    if (gcal && C.wedding) {
      var q = [
        'action=TEMPLATE',
        'text=' + encodeURIComponent('Wedding of ' + couple),
        'dates=' + toGcalStamp(C.wedding.dateISO) + '/' + toGcalStamp(C.wedding.endISO),
        'details=' + encodeURIComponent('Church wedding ceremony — ' + C.wedding.timeLabel + '.\n' + siteUrl()),
        'location=' + encodeURIComponent(church.name + ', ' + church.address),
        'ctz=Africa/Lagos'
      ].join('&');
      gcal.href = 'https://calendar.google.com/calendar/render?' + q;
    }

    // Reception card
    var r = C.reception || {};
    var card = $('[data-reception]');
    var bodyBox = $('[data-reception-body]');
    var inviteLine = $('[data-invite-reception]');
    if (!card || !bodyBox) return;
    bodyBox.textContent = '';

    if (!r.confirmed || !hasText(r.name)) {
      // Elegant "Venue Coming Soon" treatment
      var soon = el('div', { class: 'coming-soon' }, [
        el('div', { class: 'coming-soon__seal', 'aria-hidden': 'true' }, [
          el('span', { text: 'Venue' }), el('em', { text: 'Coming' }), el('span', { text: 'Soon' })
        ]),
        el('p', { class: 'coming-soon__text', text: 'Reception venue to be announced.' }),
        el('p', { class: 'coming-soon__note' }, ['We’ll share the details right here and in our ',
          el('a', { href: '#updates', text: 'updates' }), ' as soon as they’re confirmed.'])
      ]);
      bodyBox.appendChild(soon);
      if (inviteLine) inviteLine.textContent = 'Reception to follow · Venue to be announced';
      return;
    }

    // Confirmed venue — missing address/time read "Details to follow"
    function factRow(iconId, main, sub) {
      var span = el('span');
      if (main) span.appendChild(main);
      if (sub) span.appendChild(sub);
      return el('li', null, [icon(iconId), span]);
    }
    var tbc = function (t) { return el('small', { class: 'event-card__tbc', text: t || 'Details to follow' }); };
    var facts = el('ul', { class: 'event-card__facts' }, [
      factRow('i-pin', el('strong', { text: r.name }),
        hasText(r.address) ? el('span', { class: 'event-card__addr', text: r.address }) : tbc('Address · Details to follow')),
      factRow('i-clock', hasText(r.time) ? el('span', { text: r.time }) : null, hasText(r.time) ? null : tbc('Time · Details to follow')),
      factRow('i-calendar', el('span', { text: (C.wedding && C.wedding.dateLabel) || '' }))
    ]);
    if (hasText(r.address) && hasText(r.landmark)) {
      var addrSpan = $('.event-card__addr', facts);
      addrSpan.parentNode.appendChild(el('small', { class: 'event-card__note', text: r.landmark }));
    }
    bodyBox.appendChild(facts);
    // Make sure the address line sits on its own line
    $$('.event-card__addr', facts).forEach(function (a) { a.style.display = 'block'; });

    if (hasText(r.mapsUrl)) {
      var actions = el('div', { class: 'event-card__actions' }, [
        el('a', { class: 'btn btn--gold btn--block', href: r.mapsUrl, target: '_blank', rel: 'noopener' }, [icon('i-pin'), 'Get Directions'])
      ]);
      bodyBox.appendChild(actions);
    }
    if (inviteLine) inviteLine.textContent = 'Reception to follow after the Mass at ' + r.name;
  }

  function renderTimeline() {
    var list = $('[data-timeline]');
    var items = C.timeline;
    if (!list || !items || !items.length) return;
    var icons = { cross: 'orn-cross', rings: 'i-rings', clock: 'i-clock', heart: 'i-heart' };
    list.textContent = '';
    items.forEach(function (it) {
      var ic = el('span', { class: 'timeline__icon', 'aria-hidden': 'true' });
      ic.appendChild(icon(icons[it.icon] || 'i-clock', it.icon === 'cross' ? 'is-cross' : null));
      list.appendChild(el('li', null, [
        ic,
        el('span', { class: 'timeline__time', text: it.time || '' }),
        el('span', { class: 'timeline__what', text: it.title || '' }),
        it.place ? el('span', { class: 'timeline__where', text: it.place }) : null
      ]));
    });
  }

  function renderUpdates() {
    var list = $('[data-updates]');
    var items = (C.announcements || []).slice();
    if (!list) return;
    if (!items.length) { var sec = $('#updates'); if (sec) sec.hidden = true; return; }
    items.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }); // newest first (stable)
    list.textContent = '';
    items.forEach(function (u) {
      list.appendChild(el('li', { class: 'update reveal' }, [
        el('time', { class: 'update__date', datetime: u.date, text: formatDate(u.date) }),
        el('div', null, [el('h3', { class: 'update__title', text: u.title }), el('p', { class: 'update__body', text: u.body })])
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
      list.appendChild(el('li', { class: 'swatch' }, [dot, el('span', { class: 'swatch__name', text: p.name }), el('span', { class: 'swatch__hex', text: p.hex })]));
    });
  }

  /* ======================================================================
     6. Gallery + accessible lightbox
     ====================================================================== */
  function initGallery() {
    var grid = $('[data-gallery]');
    var photos = C.gallery || [];
    var lb = $('[data-lightbox]');
    if (!grid || !photos.length) return;
    grid.textContent = '';
    photos.forEach(function (p, i) {
      var img = el('img', { src: p.thumb || p.src, alt: p.alt || '', width: 600, height: 800, loading: 'lazy', decoding: 'async' });
      if (p.position) img.style.objectPosition = p.position;
      var btn = el('button', { class: 'gallery__item', type: 'button', 'aria-label': 'View photo ' + (i + 1) + ' of ' + photos.length + ': ' + (p.alt || '') }, [img]);
      btn.addEventListener('click', function () { open(i, btn); });
      grid.appendChild(el('li', { class: 'reveal' }, [btn]));
    });
    if (!lb) return;

    var img = $('[data-lb-img]', lb), count = $('[data-lb-count]', lb);
    var btnClose = $('.lightbox__btn--close', lb), btnPrev = $('[data-lb-prev]', lb), btnNext = $('[data-lb-next]', lb);
    var index = 0, opener = null;

    function show(i) {
      index = (i + photos.length) % photos.length;
      var p = photos[index];
      img.src = p.src; img.alt = p.alt || '';
      count.textContent = (index + 1) + ' / ' + photos.length;
      [index + 1, index - 1].forEach(function (j) { var q = photos[(j + photos.length) % photos.length]; (new Image()).src = q.src; });
    }
    function open(i, trigger) {
      opener = trigger; show(i);
      lb.hidden = false; doc.body.classList.add('no-scroll'); setInert(true);
      btnClose.focus();
    }
    function close() {
      lb.hidden = true; doc.body.classList.remove('no-scroll'); setInert(false);
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
    // Swipe
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
     7. RSVP form  (POST action=rsvp — see API_CONTRACT.md)
     ====================================================================== */
  var RSVP_KEY = 'fl-v1b-rsvp';
  var PHONE_RE = /^[0-9+()\-\s]+$/;
  function phoneError(v) {
    if (!v) return 'Please enter your phone number.';
    var digits = v.replace(/\D/g, '').length;
    if (!PHONE_RE.test(v) || digits < 7 || digits > 15) return 'Please enter a valid phone number (7–15 digits), e.g. 0803 123 4567.';
    return '';
  }
  function setFieldError(input, msg) {
    var field = input.closest('.field');
    var err = doc.getElementById(input.getAttribute('aria-describedby') && input.getAttribute('aria-describedby').split(' ')[0]);
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
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight (Apps Script)
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

    // Event options from config (must match the backend list)
    var sel = $('[data-event-select]', form);
    if (sel && C.rsvp && C.rsvp.events) {
      sel.textContent = '';
      C.rsvp.events.forEach(function (ev) { sel.appendChild(el('option', { value: ev, text: ev })); });
    }

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

    // Show guests/event only when accepting
    function attendance() { var r = $('input[name="attendance"]:checked', form); return r ? r.value : ''; }
    $$('input[name="attendance"]', form).forEach(function (r) {
      r.addEventListener('change', function () {
        acceptOnly.hidden = attendance() !== 'accept';
        setFieldError($('input[name="attendance"]', form), '');
      });
    });

    // Live-clear errors as the guest types
    ['#rsvp-name', '#rsvp-phone'].forEach(function (s) {
      var i = $(s, form); i.addEventListener('input', function () { if (i.getAttribute('aria-invalid')) setFieldError(i, ''); });
    });

    // Previous RSVP on this device?
    var prev = null;
    try { prev = JSON.parse(local.get(RSVP_KEY) || 'null'); } catch (e) { prev = null; }
    if (prev && prev.reference && prevBox) {
      prevBox.hidden = false;
      prevBox.appendChild(el('p', null, [
        'You’ve already sent an RSVP from this device (reference ', el('strong', { text: prev.reference }),
        prev.date ? ', ' + formatDate(prev.date) : '', '). There’s no need to send it again. To change your response, please ',
        waReady ? el('a', { href: waLink('Hello! I would like to update my RSVP (' + prev.reference + ').', true), target: '_blank', rel: 'noopener', text: 'message us on WhatsApp' }) : 'contact the couple',
        '. If you are replying for someone else, use their name and phone number below.'
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
      var aErr = attendance() ? '' : 'Please let us know if you can attend.';
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
        el('a', { class: 'btn btn--outline-dark btn--block', href: waLink(summaryText(data), true), target: '_blank', rel: 'noopener' }, [icon('i-chat'), 'Send RSVP via WhatsApp'])
      ]);
    }

    function showConfirmation(data, ref, duplicate) {
      var first = data.name.split(/\s+/)[0];
      var accepted = data.attendance === 'accept';
      confirmBox.textContent = '';
      var mark = el('div', { class: 'confirmation__mark', 'aria-hidden': 'true' }); mark.appendChild(icon('i-check'));
      var copyBtn = el('button', { class: 'btn btn--outline-dark btn--block', type: 'button' }, [icon('i-copy'), 'Copy Reference']);
      copyBtn.addEventListener('click', function () { copyText(ref, 'Reference copied'); });
      var again = el('button', { class: 'btn btn--dark btn--block', type: 'button', text: 'RSVP for Someone Else' });
      again.addEventListener('click', function () {
        form.reset(); acceptOnly.hidden = true; clampGuests(); status.textContent = ''; status.className = 'form__status';
        startedAt = Date.now(); clientId = newId();
        confirmBox.hidden = true; form.hidden = false; $('#rsvp-name', form).focus();
      });
      var actions = el('div', { class: 'confirmation__actions' }, [copyBtn]);
      if (accepted) {
        var gc = $('[data-gcal]');
        actions.appendChild(el('a', { class: 'btn btn--outline-dark btn--block', href: gc ? gc.href : '#details', target: '_blank', rel: 'noopener' }, [icon('i-calendar'), 'Add to Calendar']));
      }
      actions.appendChild(again);

      var summary = el('dl', { class: 'confirmation__summary' }, [
        el('div', null, [el('dt', { text: 'Name' }), el('dd', { text: data.name })]),
        el('div', null, [el('dt', { text: 'Response' }), el('dd', { text: accepted ? 'Joyfully accepts' : 'Regretfully declines' })]),
        accepted ? el('div', null, [el('dt', { text: 'Guests' }), el('dd', { text: String(data.guests) })]) : null,
        accepted ? el('div', null, [el('dt', { text: 'Attending' }), el('dd', { text: data.event })]) : null
      ]);

      [
        mark,
        el('p', { class: 'confirmation__title', text: accepted ? 'Thank you, ' + first : 'Thank you, ' + first }),
        el('p', { class: 'confirmation__text', text: duplicate
          ? 'We already have your RSVP — no need to send it again. Here is your original reference.'
          : (accepted ? 'Your RSVP has been received. We can’t wait to celebrate with you!' : 'We’re sorry you can’t make it — you’ll be in our hearts on the day. Thank you for letting us know.') }),
        el('p', { class: 'confirmation__ref-label', text: 'Your RSVP reference' }),
        el('p', { class: 'confirmation__ref', text: ref }),
        el('p', { class: 'confirmation__hint', text: 'Please keep this reference — a screenshot is perfect.' }),
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
        event: accepted ? (sel ? sel.value : '') : '',
        message: $('#rsvp-message', form).value.trim().slice(0, 500),
        website: $('#rsvp-website', form).value,
        startedAt: startedAt,
        clientId: clientId
      };

      // Backend not connected yet: never fake success — offer WhatsApp instead.
      if (!apiReady) {
        whatsappFallback(data, {
          kind: '', title: 'Online RSVP is opening soon.',
          text: 'Our RSVP system isn’t connected just yet. Please send your response to us on WhatsApp — we’ve filled in the message for you.'
        });
        status.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        return;
      }

      setBusy(submit, true, 'Sending…');
      showStatus('', []);
      var wait = Math.max(0, 3200 - (Date.now() - startedAt)); // server rejects forms sent in < 3s
      sleep(wait).then(function () { return postJSON(data); }).then(function (res) {
        if (res && res.ok && res.reference) {
          local.set(RSVP_KEY, JSON.stringify({ reference: res.reference, name: data.name, attendance: data.attendance, date: new Date().toISOString().slice(0, 10) }));
          showConfirmation(data, res.reference, !!res.duplicate);
        } else {
          showStatus('error', [el('p', { text: (res && res.error) || 'Sorry, something went wrong. Please try again.' })]);
          status.focus && status.scrollIntoView({ block: 'center' });
        }
      }).catch(function () {
        whatsappFallback(data, {
          kind: 'error', title: 'We couldn’t send your RSVP.',
          text: 'Please check your internet connection and try again — or send your response on WhatsApp instead.'
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
      var mErr = message.length < 2 ? 'Please write a short message.' : (message.length > 400 ? 'Please keep your message under 400 characters.' : '');
      setFieldError(nameIn, nErr); setFieldError(msgIn, mErr);
      if (nErr) { nameIn.focus(); return; }
      if (mErr) { msgIn.focus(); return; }

      if (!apiReady) {
        say('', [
          el('p', null, [el('strong', { text: 'Our guestbook opens soon.' })]),
          el('p', { text: 'In the meantime, you can send your wishes to the couple on WhatsApp.' }),
          el('a', { class: 'btn btn--outline-dark btn--block', href: waLink('Wishes for ' + couple + ' from ' + name + ':\n' + message, true), target: '_blank', rel: 'noopener' }, [icon('i-chat'), 'Send via WhatsApp'])
        ]);
        return;
      }

      setBusy(submit, true, 'Sending…');
      var payload = { action: 'guestbook', name: name, message: message, website: $('#gb-website', form).value, startedAt: startedAt, clientId: clientId };
      sleep(Math.max(0, 3200 - (Date.now() - startedAt))).then(function () { return postJSON(payload); }).then(function (res) {
        if (res && res.ok) {
          form.reset(); updateCounters();
          startedAt = Date.now(); clientId = newId();
          say('success', [el('p', { text: 'Thank you — your wishes will appear after the couple approves them.' })]);
        } else {
          say('error', [el('p', { text: (res && res.error) || 'Sorry, something went wrong. Please try again.' })]);
        }
      }).catch(function () {
        say('error', [el('p', { text: 'We couldn’t send your message. Please check your connection and try again.' })]);
      }).then(function () { setBusy(submit, false); });
    });

    // Approved wishes. Server returns raw text, so we only ever use textContent.
    if (!apiReady || !wishes || !list || !window.fetch) return;
    function load() {
      fetch(API + (API.indexOf('?') > -1 ? '&' : '?') + 'action=guestbook', { redirect: 'follow' })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok || !res.entries || !res.entries.length) return;
          list.textContent = '';
          res.entries.slice(0, 50).forEach(function (w) {
            list.appendChild(el('li', { class: 'wish' }, [
              el('p', { class: 'wish__message', text: String(w.message || '') }),
              el('p', { class: 'wish__meta', text: '— ' + String(w.name || '') + (w.date ? ' · ' + formatDate(w.date) : '') })
            ]));
          });
          wishes.hidden = false;
        }).catch(function () { /* keep hidden */ });
    }
    // Load only when the guestbook is near the viewport
    var sec = $('#guestbook');
    if ('IntersectionObserver' in window && sec) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '600px 0px' });
      io.observe(sec);
    } else load();
  }

  /* Character counters for textareas (data-counter="id") */
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
     9. Gifts: bank details, copy, Paystack
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
      toast(ok ? okMsg : 'Couldn’t copy automatically — please copy: ' + text);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else fallback();
  }

  function initGifts() {
    // Bank details only: guests transfer from their own bank app, so no suggested amounts.
    var g = C.gifts || {};
    var acct = String((g.bank && g.bank.accountNumber) || '').replace(/\s/g, '');
    var copyBtn = $('[data-copy-account]');
    if (copyBtn) copyBtn.addEventListener('click', function () { copyText(acct, 'Account number copied'); });
    var ps = $('[data-paystack]');
    if (ps && hasText(g.paystackUrl)) { ps.href = g.paystackUrl; ps.hidden = false; }
  }

  /* ======================================================================
     9b. Gift registry  (GET ?action=registry, POST action=pledge — see API_CONTRACT.md)
     Every name/note/category comes from the couple's sheet: treated as untrusted,
     rendered with textContent only (via el()).
     ====================================================================== */
  var PLEDGE_KEY = 'fl-v1b-pledges';
  function isCashItem(it) { return it.id === 'cash-gift' || /^(money|cash)/i.test(it.category); }

  function initRegistry() {
    var box = $('[data-registry]');
    if (!box) return;
    var R = C.registry || {};
    var body = $('[data-registry-body]', box), notice = $('[data-registry-notice]', box);
    var cashBox = $('[data-registry-cash]', box), bankCard = $('#bank-details');
    if (R.enabled === false) {   // keep only the bank details
      [$('.registry__head', box), notice, body].forEach(function (n) { if (n) n.hidden = true; });
      return;
    }
    if (hasText(R.title)) $('[data-registry-title]', box).textContent = R.title;
    if (hasText(R.intro)) $('[data-registry-intro]', box).textContent = R.intro;
    var cashOpen = false;
    /** Put the bank card back at the foot of the gift list (fallback / no cash item in the sheet). */
    function cashAtFoot(show) {
      if (bankCard && bankCard.parentNode !== cashBox) cashBox.appendChild(bankCard);
      cashBox.hidden = !show;
    }

    var helper = (C.contact && hasText(C.contact.whatsappName) && !isPlaceholder(C.contact.whatsappName)) ? C.contact.whatsappName.split(/\s+/)[0] : '';
    var items = [];
    var mine = {};
    try { mine = JSON.parse(local.get(PLEDGE_KEY) || '{}') || {}; } catch (e) { mine = {}; }
    function remember(id, ref) { mine[id] = ref; local.set(PLEDGE_KEY, JSON.stringify(mine)); }

    function say(nodes, kind) {
      notice.textContent = '';
      notice.className = 'registry__notice' + (kind ? ' is-' + kind : '');
      (nodes || []).forEach(function (n) { notice.appendChild(typeof n === 'string' ? doc.createTextNode(n) : n); });
    }
    function waButton(text, label) {
      return el('a', { class: 'btn btn--gold', href: waLink(text, true), target: '_blank', rel: 'noopener' }, [icon('i-chat'), label]);
    }

    /* ----- Fallback (placeholder endpoint, or the list can't load) ----- */
    function fallback(canRetry) {
      body.setAttribute('aria-busy', 'false');
      body.textContent = '';
      cashAtFoot(true);
      var label = waReady ? 'Message ' + (helper || 'us') + ' on WhatsApp to choose a gift' : '';
      var kids = [
        el('p', { class: 'registry__fallback-text', text: canRetry
          ? 'Our wishlist couldn’t load just now. You can still choose a gift — we’ll happily help.'
          : 'Our online wishlist is opening soon. In the meantime, we’ll happily help you choose a gift.' })
      ];
      var actions = el('div', { class: 'registry__fallback-actions' });
      if (waReady) actions.appendChild(waButton('Hello! I’d love to get a gift for ' + couple + '’s new home. Could you tell me what’s still on their wishlist?', label));
      else kids.push(el('p', { class: 'registry__fallback-text', text: 'Please contact the couple to choose a gift.' }));
      if (canRetry) {
        var retry = el('button', { class: 'btn btn--outline-dark', type: 'button', text: 'Try Again' });
        retry.addEventListener('click', function () { load(true); });
        actions.appendChild(retry);
      }
      if (actions.childNodes.length) kids.push(actions);
      body.appendChild(el('div', { class: 'registry__fallback' }, kids));
    }

    /* ----- Loading skeleton ----- */
    function skeleton() {
      body.setAttribute('aria-busy', 'true');
      body.textContent = '';
      cashAtFoot(false);
      var list = el('div', { class: 'registry__skeleton', 'aria-hidden': 'true' });
      for (var i = 0; i < 4; i++) list.appendChild(el('div', { class: 'registry__ghost' }, [el('span'), el('span'), el('span')]));
      body.appendChild(el('p', { class: 'sr-only', text: 'Loading the wishlist…' }));
      body.appendChild(list);
    }

    /* ----- Normalise the server data (never trust shape or types) ----- */
    function clean(raw) {
      if (!Array.isArray(raw)) return [];
      return raw.slice(0, 150).map(function (r) {
        if (!r || typeof r !== 'object') return null;
        var id = String(r.id == null ? '' : r.id).trim().slice(0, 60);
        var name = String(r.name == null ? '' : r.name).trim().slice(0, 120);
        if (!id || !name) return null;
        var wanted = (r.wanted === null || r.wanted === '' || r.wanted === undefined) ? null : parseInt(r.wanted, 10);
        if (wanted !== null && (isNaN(wanted) || wanted < 0)) wanted = null;
        var chosen = Math.max(0, parseInt(r.chosen, 10) || 0);
        var remaining = (r.remaining === null || r.remaining === undefined || r.remaining === '') ? null : parseInt(r.remaining, 10);
        if (wanted === null) remaining = null;
        else if (remaining === null || isNaN(remaining)) remaining = Math.max(0, wanted - chosen);
        return {
          id: id, name: name,
          category: String(r.category == null ? '' : r.category).trim().slice(0, 60) || 'Gifts',
          note: String(r.note == null ? '' : r.note).trim().slice(0, 240),
          wanted: wanted, chosen: chosen, remaining: Math.max(0, remaining === null ? 0 : remaining), unlimited: wanted === null
        };
      }).filter(Boolean);
    }

    function statusOf(it) {
      if (it.unlimited) return { text: isCashItem(it) ? 'Any amount' : 'Available', kind: 'open' };
      if (it.remaining <= 0) return { text: 'Chosen, thank you!', kind: 'done' };
      if (it.wanted > 1) return { text: it.remaining + ' of ' + it.wanted + ' left', kind: 'open' };
      return { text: 'Available', kind: 'open' };
    }

    /* ----- Render, grouped by category in sheet order ----- */
    function render() {
      body.setAttribute('aria-busy', 'false');
      body.textContent = '';
      if (!items.length) { setGiftsVisible(false); return; }
      setGiftsVisible(true);
      var hasCash = items.some(isCashItem);
      if (!hasCash) cashAtFoot(true); else cashBox.hidden = true;
      var groups = [], byCat = {};
      // Cash gift always leads the list, then everything else in sheet order.
      items.filter(isCashItem).concat(items.filter(function (it) { return !isCashItem(it); })).forEach(function (it) {
        var key = it.category.toLowerCase();
        if (!byCat[key]) { byCat[key] = { name: it.category, items: [] }; groups.push(byCat[key]); }
        byCat[key].items.push(it);
      });
      groups.forEach(function (g, gi) {
        var hid = 'registry-cat-' + gi;
        var list = el('ul', { class: 'registry__list', 'aria-labelledby': hid });
        g.items.forEach(function (it) { list.appendChild(renderItem(it)); });
        body.appendChild(el('section', { class: 'registry__group' }, [
          el('h4', { class: 'registry__cat', id: hid, text: g.name }), list
        ]));
      });
    }

    function renderItem(it) {
      var st = statusOf(it);
      var cash = isCashItem(it);
      var done = st.kind === 'done';
      var li = el('li', { class: 'gift-item' + (done ? ' is-chosen' : '') + (cash ? ' gift-item--cash' : '') + (mine[it.id] ? ' is-mine' : ''), 'data-id': it.id });
      var status = el('span', { class: 'gift-item__status gift-item__status--' + st.kind });
      if (done) status.appendChild(icon('i-check'));
      status.appendChild(doc.createTextNode(st.text));
      // The sheet's note for the cash item ("Bank details are just below") no longer fits: the details are inside the row.
      var note = cash ? '' : it.note;
      var meta = el('p', { class: 'gift-item__meta' }, [status, note ? el('span', { class: 'gift-item__note', text: note }) : null]);
      var main = el('div', { class: 'gift-item__main' }, [
        el('h5', { class: 'gift-item__name', text: it.name }),
        meta,
        mine[it.id] ? el('p', { class: 'gift-item__mine' }, ['You chose this · ', el('strong', { text: mine[it.id] })]) : null
      ]);
      li.appendChild(main);
      if (done) return li;
      if (cash) {
        var panel = el('div', { class: 'gift-item__bank', id: 'cash-gift-details' });
        if (bankCard) panel.appendChild(bankCard);
        if (apiReady) {
          var tell = el('button', { class: 'gift-item__link', type: 'button', text: 'I’m sending a cash gift — let the couple know' });
          tell.addEventListener('click', function () { openPledge(it, tell); });
          panel.appendChild(tell);
        }
        panel.hidden = !cashOpen;
        var bankBtn = el('button', { class: 'gift-item__btn', type: 'button', 'aria-expanded': String(cashOpen), 'aria-controls': 'cash-gift-details' },
          [el('span', { class: 'btn__label', text: cashOpen ? 'Hide details' : 'Bank details' })]);
        bankBtn.addEventListener('click', function () { toggleCash(bankBtn, panel); });
        li.appendChild(bankBtn);
        li.appendChild(panel);
        return li;
      }
      var get = el('button', { class: 'gift-item__btn', type: 'button', text: 'I’ll get this', 'aria-label': 'I’ll get this: ' + it.name });
      get.addEventListener('click', function () { openPledge(it, get); });
      li.appendChild(get);
      return li;
    }

    function toggleCash(btn, panel) {
      cashOpen = !cashOpen;
      panel.hidden = !cashOpen;
      btn.setAttribute('aria-expanded', String(cashOpen));
      $('.btn__label', btn).textContent = cashOpen ? 'Hide details' : 'Bank details';
      if (cashOpen && bankCard) {
        bankCard.classList.remove('is-highlight'); void bankCard.offsetWidth; bankCard.classList.add('is-highlight');
        setTimeout(function () { bankCard.classList.remove('is-highlight'); }, 2600);
        var r = panel.getBoundingClientRect();
        if (r.bottom > window.innerHeight) panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      }
    }

    /* ----- Load ----- */
    var loading = false;
    function load(showSkeleton) {
      if (!apiReady || !window.fetch) { fallback(false); return Promise.resolve(); }
      if (loading) return Promise.resolve();
      loading = true;
      if (showSkeleton) skeleton();
      var ctrl = 'AbortController' in window ? new AbortController() : null;
      var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
      return fetch(API + (API.indexOf('?') > -1 ? '&' : '?') + 'action=registry', { redirect: 'follow', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok || !Array.isArray(res.items)) throw new Error('bad response');
          items = clean(res.items);
          render();
        })
        .catch(function () { if (showSkeleton || !items.length) fallback(true); })
        .then(function () { clearTimeout(t); loading = false; });
    }

    /* ----- Pledge dialog ----- */
    var dlg = $('[data-pledge]');
    var form = dlg && $('[data-pledge-form]', dlg);
    var doneBox = dlg && $('[data-pledge-done]', dlg);
    var status = dlg && $('[data-pledge-status]', dlg);
    var submit = dlg && $('[data-pledge-submit]', dlg);
    var nameIn = dlg && $('#pledge-name', dlg), phoneIn = dlg && $('#pledge-phone', dlg), msgIn = dlg && $('#pledge-message', dlg);
    var current = null, opener = null, startedAt = 0, clientId = '', isOpen = false;

    function focusables() {
      return $$('button, [href], input:not([tabindex="-1"]), textarea, select', dlg).filter(function (n) {
        return !n.disabled && n.offsetParent !== null;
      });
    }
    function pstatus(kind, nodes) {
      status.className = 'form__status' + (kind ? ' is-' + kind : '');
      status.textContent = '';
      nodes.forEach(function (n) { status.appendChild(n); });
    }
    function openPledge(it, trigger) {
      if (!dlg) return;
      current = it; opener = trigger;
      $('[data-pledge-item]', dlg).textContent = it.name;
      form.hidden = false; doneBox.hidden = true; doneBox.textContent = '';
      pstatus('', []);
      setFieldError(nameIn, ''); setFieldError(phoneIn, '');
      msgIn.value = ''; $('#pledge-website', dlg).value = ''; updateCounters();
      startedAt = Date.now(); clientId = newId();
      dlg.hidden = false; isOpen = true;
      doc.body.classList.add('no-scroll'); setInert(true);
      requestAnimationFrame(function () { dlg.classList.add('is-open'); });
      setTimeout(function () { nameIn.focus(); }, 40);
    }
    function closePledge(focusTarget) {
      if (!isOpen) return;
      isOpen = false;
      dlg.classList.remove('is-open'); dlg.hidden = true;
      doc.body.classList.remove('no-scroll'); setInert(false);
      var target = focusTarget || (opener && doc.contains(opener) ? opener : null);
      if (!target && current) {
        // The original button may have been replaced by a re-render: focus the same item's button, or the list.
        var li = body.querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(current.id) : current.id) + '"]');
        target = (li && $('button', li)) || li || notice;
        if (target === li) li.setAttribute('tabindex', '-1');
      }
      if (target) target.focus({ preventScroll: false });
    }

    function showDone(res, data) {
      var first = data.name.split(/\s+/)[0];
      var ref = String(res.reference);
      var itemName = hasText(res.itemName) ? String(res.itemName) : current.name;
      doneBox.textContent = '';
      var mark = el('div', { class: 'confirmation__mark', 'aria-hidden': 'true' }); mark.appendChild(icon('i-check'));
      var copyBtn = el('button', { class: 'btn btn--outline-dark btn--block', type: 'button' }, [icon('i-copy'), 'Copy Reference']);
      copyBtn.addEventListener('click', function () { copyText(ref, 'Reference copied'); });
      var close = el('button', { class: 'btn btn--dark btn--block', type: 'button', text: 'Back to the Wishlist' });
      close.addEventListener('click', function () { closePledge(); });
      var cash = isCashItem(current);
      [
        mark,
        el('p', { class: 'confirmation__title', text: 'Thank you, ' + first }),
        el('p', { class: 'confirmation__text', text: res.duplicate
          ? 'You’ve already chosen the ' + itemName + ' — no need to do it again. Here is your original reference.'
          : (cash ? 'Thank you for letting us know about your cash gift. You’ll find the bank details under “Cash gift” in the wishlist.'
                  : 'We’ve noted that you’ll get the ' + itemName + '. It means so much to us.') }),
        el('p', { class: 'confirmation__ref-label', text: 'Your gift reference' }),
        el('p', { class: 'confirmation__ref', text: ref }),
        el('p', { class: 'confirmation__hint', text: 'Please keep this reference — a screenshot is perfect.' }),
        el('div', { class: 'confirmation__actions' }, [copyBtn, close])
      ].forEach(function (n) { doneBox.appendChild(n); });
      form.hidden = true; doneBox.hidden = false;
      doneBox.focus({ preventScroll: true });
    }

    if (form) {
      $$('[data-pledge-close]', dlg).forEach(function (b) { b.addEventListener('click', function () { closePledge(); }); });
      dlg.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); closePledge(); return; }
        trapTab(e, focusables());
      });
      [nameIn, phoneIn].forEach(function (i) { i.addEventListener('input', function () { if (i.getAttribute('aria-invalid')) setFieldError(i, ''); }); });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (submit.disabled || !current) return;
        var name = nameIn.value.trim(), phone = phoneIn.value.trim();
        var nErr = name.length < 2 ? 'Please enter your name.' : (name.length > 80 ? 'Please keep your name under 80 characters.' : '');
        var pErr = phoneError(phone);
        setFieldError(nameIn, nErr); setFieldError(phoneIn, pErr);
        if (nErr) { nameIn.focus(); return; }
        if (pErr) { phoneIn.focus(); return; }
        var item = current;
        var data = {
          action: 'pledge', itemId: item.id, name: name, phone: phone,
          message: msgIn.value.trim().slice(0, 200), website: $('#pledge-website', dlg).value,
          startedAt: startedAt, clientId: clientId
        };
        setBusy(submit, true, 'Sending…');
        pstatus('', []);
        sleep(Math.max(0, 3200 - (Date.now() - startedAt))).then(function () { return postJSON(data); }).then(function (res) {
          if (res && res.ok && res.reference) {
            remember(item.id, String(res.reference));
            // Mark locally straight away, then refresh from the sheet.
            if (!item.unlimited && !res.duplicate) {
              item.remaining = (typeof res.remaining === 'number') ? Math.max(0, res.remaining) : Math.max(0, item.remaining - 1);
            }
            render();
            showDone(res, data);
            load(false);
          } else if (res && res.soldOut) {
            closePledge(notice);
            say([el('strong', { text: 'So sorry — someone has just chosen the ' + item.name + '.' }), ' We’ve refreshed the list; please pick another gift if you’d like.'], 'gentle');
            notice.focus({ preventScroll: true });
            notice.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
            load(false);
          } else {
            pstatus('error', [el('p', { text: (res && res.error) || 'Sorry, something went wrong. Please try again.' })]);
            load(false);
          }
        }).catch(function () {
          var kids = [el('p', { text: 'We couldn’t reach the wishlist. Please check your connection and try again.' })];
          if (waReady) kids.push(el('a', { class: 'btn btn--outline-dark btn--block', href: waLink('Hello! I’d like to get the ' + item.name + ' for ' + couple + '. My name is ' + name + '.', true), target: '_blank', rel: 'noopener' }, [icon('i-chat'), 'Or Tell ' + (helper || 'Us') + ' on WhatsApp']));
          pstatus('error', kids);
        }).then(function () { setBusy(submit, false); });
      });
    }

    /* ----- Kick off: load as soon as the page opens, so the list is ready before guests scroll there ----- */
    if (!apiReady || !window.fetch) { fallback(false); return; }
    skeleton();
    load(true);
  }

  /* ======================================================================
     10. Sharing & help
     ====================================================================== */
  function initShare() {
    var share = $('[data-share-whatsapp]');
    if (share) {
      var w = C.wedding || {}, ch = C.church || {};
      var text = couple + ' are getting married! 💍\n' + (w.dateLabel || '') + ' · 10:00 AM\n' + (ch.name || '') + ', ' + (ch.shortAddress || '') +
        '\n\nDetails & RSVP: ' + siteUrl() + (C.couple && C.couple.hashtag ? '\n' + C.couple.hashtag : '');
      share.href = waLink(text, false);
    }
    var help = $('[data-help-whatsapp]');
    if (help && waReady) {
      help.href = waLink('Hello! I have a question about ' + couple + '’s wedding.', true);
      var helpName = C.contact && hasText(C.contact.whatsappName) && !isPlaceholder(C.contact.whatsappName) ? C.contact.whatsappName.split(/\s+/)[0] : '';
      if (helpName) {
        help.lastChild.textContent = 'Need help? WhatsApp ' + helpName;
        help.setAttribute('aria-label', 'Need help? Message ' + C.contact.whatsappName + ' on WhatsApp');
      }
      help.hidden = false;
    }
  }

  /* ======================================================================
     11. Scroll reveal
     ====================================================================== */
  function initReveal() {
    var items = $$('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) { items.forEach(function (n) { n.classList.add('is-visible'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ---------- Boot ---------- */
  function boot() {
    var steps = [bindConfig, initEnvelope, initMenu, initScrollSpy, initRsvpPill, initCountdown, renderStory, renderDetails,
      renderTimeline, renderUpdates, renderSwatches, initGallery, initRsvp, initGuestbook, initCounters, initGifts, initRegistry, initShare, initReveal];
    steps.forEach(function (fn) {
      try { fn(); } catch (err) { if (window.console) console.error('[wedding site] ' + fn.name + ' failed:', err); }
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
