/**
 * Job007 — marketing-site analytics.
 *
 * Three destinations, one call site:
 *   1. our own /api/events endpoint   — always the source of truth
 *   2. GA4                            — after consent
 *   3. Meta pixel                     — after consent, for ad optimisation
 *
 * Ours fires first and independently because the other two are blocked for a
 * large share of the audience. Everything is best-effort: analytics must never
 * be able to break the page it is measuring.
 *
 *   J7.track('cta_click', { cta: 'hero' });
 */
(function () {
  'use strict';

  // ── Configure ─────────────────────────────────────────────────────────
  // Paste the real IDs here once the accounts exist. Left empty, the
  // corresponding tag simply never loads — the site and our own event
  // pipeline keep working.
  var GA4_ID = 'G-MRFS5104QG';   // job007.ai web stream (GA4 → Admin → Data streams)
  var META_PIXEL_ID = '';   // e.g. '1234567890'    (Events Manager → Data sources)

  var API = 'https://app.job007.ai/api/events';
  var STORAGE = {
    anon: 'j7_aid',
    attribution: 'j7_attr',
    consent: 'j7_consent',
  };

  // ── Storage helpers ───────────────────────────────────────────────────
  // Private-mode Safari throws on any localStorage access, so every read and
  // write is wrapped. A visitor with storage disabled still gets a working
  // site; they just aren't stitched across pages.
  function get(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function set(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function consent() {
    return get(STORAGE.consent); // 'granted' | 'denied' | null (undecided)
  }

  /**
   * Stable anonymous id, minted on first visit.
   *
   * Only issued once analytics consent is granted — before that the visitor
   * is counted but not followed, and events go up without an id.
   */
  function anonId() {
    if (consent() !== 'granted') return null;
    var id = get(STORAGE.anon);
    if (!id) {
      id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      set(STORAGE.anon, id);
    }
    return id;
  }

  /** First-touch attribution — the campaign that originally brought them in. */
  function attribution() {
    var stored = get(STORAGE.attribution);
    if (stored) {
      try { return JSON.parse(stored); } catch (e) { /* fall through */ }
    }
    var params = new URLSearchParams(window.location.search);
    var attr = {
      utm_source: params.get('utm_source') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined,
      referrer: document.referrer ? document.referrer.slice(0, 500) : undefined,
    };
    // A visit with no campaign at all isn't worth pinning as first-touch —
    // leaving it unset lets a later ad click claim the attribution.
    if (attr.utm_source || attr.utm_campaign || attr.referrer) {
      if (consent() === 'granted') set(STORAGE.attribution, JSON.stringify(attr));
    }
    return attr;
  }

  // ── Our own pipeline ──────────────────────────────────────────────────

  function send(event, props) {
    var attr = attribution();
    var body = {
      event: event,
      source: 'website',
      path: window.location.pathname,
      anon_id: anonId() || undefined,
      props: props || undefined,
      utm_source: attr.utm_source,
      utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign,
      referrer: attr.referrer,
    };
    try {
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // The click that fires this event usually navigates away immediately.
        keepalive: true,
        mode: 'cors',
      }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  // ── Third-party tags ──────────────────────────────────────────────────

  var tagsLoaded = false;

  function loadTags() {
    if (tagsLoaded || consent() !== 'granted') return;
    tagsLoaded = true;

    if (GA4_ID) {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      // Consent Mode v2: declare the denied defaults before anything else,
      // then grant — this runs only after the visitor accepted, but Google
      // expects to see the default state first either way.
      window.gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      });
      window.gtag('js', new Date());
      window.gtag('consent', 'update', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
      });
      window.gtag('config', GA4_ID);
    }

    if (META_PIXEL_ID) {
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', META_PIXEL_ID);
      window.fbq('track', 'PageView');
    }
  }

  /**
   * Meta's vocabulary is fixed, so our funnel names are mapped onto the
   * standard events its optimiser understands. Anything unmapped goes up as a
   * custom event rather than being dropped.
   */
  var META_EVENTS = {
    quiz_start: 'Lead',
    quiz_complete: 'CompleteRegistration',
    cta_click: 'InitiateCheckout',
  };

  function mirror(event, props) {
    if (consent() !== 'granted') return;
    try {
      if (window.gtag && GA4_ID) window.gtag('event', event, props || {});
    } catch (e) { /* ignore */ }
    try {
      if (window.fbq && META_PIXEL_ID) {
        var mapped = META_EVENTS[event];
        if (mapped) window.fbq('track', mapped, props || {});
        else window.fbq('trackCustom', event, props || {});
      }
    } catch (e) { /* ignore */ }
  }

  // ── Public API ────────────────────────────────────────────────────────

  var J7 = {
    track: function (event, props) {
      send(event, props);
      mirror(event, props);
    },
    anonId: anonId,
    consent: consent,
    /** Record a choice from the consent banner and load tags if accepted. */
    setConsent: function (value) {
      set(STORAGE.consent, value === 'granted' ? 'granted' : 'denied');
      if (value === 'granted') {
        loadTags();
        J7.track('site_view', { consented: true });
      }
    },
    /**
     * Hand the current visitor's identity to the app, which lives on another
     * origin and therefore cannot read any of this from storage.
     */
    handoff: function (url, extra) {
      var u = new URL(url, window.location.href);
      var id = anonId();
      if (id) u.searchParams.set('anon_id', id);
      var attr = attribution();
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
        if (attr[k]) u.searchParams.set(k, attr[k]);
      });
      if (extra) {
        Object.keys(extra).forEach(function (k) { u.searchParams.set(k, extra[k]); });
      }
      return u.toString();
    },
  };

  window.J7 = J7;

  // ── Boot ──────────────────────────────────────────────────────────────

  if (consent() === 'granted') loadTags();

  // One pageview per load, with or without consent. Without it there is no id
  // attached, so it counts a visit without following a person.
  J7.track('site_view', {});

  // Any link or button carrying data-j7-cta reports itself, so adding a new
  // call to action never means remembering to add a tracking call too.
  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-j7-cta]') : null;
    if (!el) return;
    J7.track('cta_click', { cta: el.getAttribute('data-j7-cta') });
    // Carry identity across to app.job007.ai on outbound links.
    var href = el.getAttribute('href') || '';
    if (href.indexOf('app.job007.ai') !== -1 && !el.dataset.j7Handled) {
      el.dataset.j7Handled = '1';
      el.setAttribute('href', J7.handoff(href));
    }
  }, true);
})();
