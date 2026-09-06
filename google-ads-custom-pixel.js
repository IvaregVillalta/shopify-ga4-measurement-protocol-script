// =============================================================================
// SHOPIFY CUSTOM PIXEL — GOOGLE ADS CONVERSIONS
// =============================================================================
// Version: 1.0.0
// Environment: Shopify → Settings → Customer Events → Custom Pixel
// Target: Google Ads via gtag.js
//
// WHEN TO USE THIS FILE:
//   Only when the Google & YouTube sales channel cannot be used. That channel
//   measures server-side and is the better option whenever it works — see
//   google-ads-runbook.md. This pixel is the browser-side fallback.
//
// WHY A CUSTOM PIXEL AND NOT A THEME TAG:
//   Shopify does not load third-party scripts on /checkouts/. A conversion tag
//   pasted into theme.liquid therefore fires on the storefront but never on the
//   thank-you page, so Purchase records zero. A Custom Pixel does run on
//   checkout, which is the whole reason this file exists.
//
// TRADE-OFF, STATED PLAINLY:
//   This is browser-side measurement. Ad blockers and ITP will cost some volume
//   that the server-side channel would have kept. Accept it only because the
//   alternative here is measuring nothing.
//
// ATTRIBUTION — THE PART THAT BREAKS SILENTLY:
//   Two things have to be true for a conversion to be credited to a campaign,
//   and neither is automatic here.
//
//   1. Someone has to capture the gclid from the landing URL. On a GTM setup
//      that was the Conversion Linker tag. Removing the container removes it,
//      so this pixel captures the click id itself (SECTION 2.1).
//   2. gtag.js has to see it. Custom Pixels run in a sandboxed iframe on a
//      different origin, so gtag cannot read cookies written on the shop
//      domain. SECTION 2.2 rebuilds _gcl_aw inside the sandbox in Google's own
//      format, which is the path gtag already knows how to read.
//
//   Conversions still register without this, but attributed to no campaign —
//   nearly as useless as not measuring. If you change nothing else in this
//   file, do not remove SECTION 2.
//
// SETUP:
//   1. Replace GOOGLE_ADS_ID and the three values in CONVERSION_LABELS below.
//      The labels come from Google Ads → Goals → the conversion action →
//      tag setup, or from an existing GTM container's "tags" block.
//   2. Set DEBUG_MODE to false before going live.
//   3. Paste this entire file into Shopify → Settings → Customer Events →
//      Add custom pixel, then Save and Connect.
//   4. Remove any competing Google Ads tag (theme GTM container, hardcoded
//      AW- snippet) IN THE SAME PASS, or the same conversion is counted twice.
//
// GO-LIVE CHECKLIST:
//   [ ] GOOGLE_ADS_ID and all three CONVERSION_LABELS replaced
//   [ ] DEBUG_MODE = false
//   [ ] Competing GTM / AW- tag removed from the theme
//   [ ] With DEBUG_MODE on, a visit to /?gclid=TEST logs "captured gclid TEST"
//       and the next conversion logs "rebuilt _gcl_aw from gclid TEST".
//       If it logs "no click id on this visit", attribution is broken and the
//       conversions you record will not be credited to any campaign.
// =============================================================================


// =============================================================================
// SECTION 1 — CONFIGURATION
// =============================================================================

const GOOGLE_ADS_ID = 'AW-XXXXXXXXXXX'; // ← Replace with your Google Ads conversion ID

const CONVERSION_LABELS = {
  purchase:       'XXXXXXXXXXXXXXXXXXXX', // ← Purchase
  add_to_cart:    'XXXXXXXXXXXXXXXXXXXX', // ← Add to cart
  begin_checkout: 'XXXXXXXXXXXXXXXXXXXX', // ← Begin checkout
};

const DEBUG_MODE            = false; // ← Set to false before going live
const ENHANCED_CONVERSIONS  = true;  // ← Sends a SHA-256 hashed email on purchase

// Only the purchase carries money. Micro-conversions must stay valueless, or the
// account-level "conversion value" stops meaning anything — see the runbook.
const SEND_VALUE = { purchase: true, add_to_cart: false, begin_checkout: false };


// =============================================================================
// SECTION 2 — CLICK ID CAPTURE + GTAG.JS INITIALIZATION
// =============================================================================

const log = (...a) => { if (DEBUG_MODE) console.log('[AdsPixel]', ...a); };

// The pixel's console lives in the sandbox iframe and never reaches the tab's
// devtools, so console logging alone cannot be checked from outside. With
// DEBUG_MODE on we also drop a breadcrumb on the shop domain, which anyone —
// or any tool — can read with document.cookie on the storefront.
const DIAG_COOKIE = '_ads_pixel_diag';

async function diag(stage, detail) {
  if (!DEBUG_MODE) return;
  try {
    await api.browser.cookie.set(
      DIAG_COOKIE,
      `${stage}|${detail ?? ''}|${new Date().toISOString()}`
    );
  } catch (e) { /* diagnostics must never break measurement */ }
}

// Where we park the click id on the shop domain, so it survives the trip from
// the landing page to the thank-you page. Named to not collide with Google's.
const CLICK_ID_COOKIE = '_ads_pixel_click_id';

// gclid covers Search and Shopping; gbraid and wbraid are the iOS/app variants
// Google sends when a gclid is not available.
const CLICK_ID_PARAMS = ['gclid', 'gbraid', 'wbraid'];

// Google's own cookie names, keyed by the parameter they carry.
const LINKER_COOKIE_FOR = { gclid: '_gcl_aw', gbraid: '_gcl_gb', wbraid: '_gcl_gb' };

const NINETY_DAYS = 60 * 60 * 24 * 90;

// -----------------------------------------------------------------------------
// 2.1 — Capture the click id from the landing URL
// -----------------------------------------------------------------------------
// This replaces the Conversion Linker tag. It has to run on every page view,
// not just the first, because a visitor can re-enter from a second ad click.
// -----------------------------------------------------------------------------

analytics.subscribe('page_viewed', async (event) => {
  try {
    const href = event?.context?.document?.location?.href;
    if (!href) return;
    const params = new URL(href).searchParams;

    for (const name of CLICK_ID_PARAMS) {
      const value = params.get(name);
      if (!value) continue;
      // Last click wins, which is how Google attributes too.
      await api.browser.cookie.set(CLICK_ID_COOKIE, `${name}.${Date.now()}.${value}`);
      log('captured', name, value);
      break;
    }
  } catch (e) {
    log('click id capture failed', e);
  }
});

// -----------------------------------------------------------------------------
// 2.2 — Make the click id visible to gtag.js inside the sandbox
// -----------------------------------------------------------------------------
// gtag reads _gcl_aw from its own document.cookie. We write it there in
// Google's format: GCL.<unix seconds>.<click id>.
// -----------------------------------------------------------------------------

async function primeLinkerCookie() {
  // If something on the shop domain already maintains a real linker cookie
  // (a GTM container still in the theme, say), prefer it verbatim.
  for (const cookieName of ['_gcl_aw', '_gcl_gb']) {
    try {
      const existing = await api.browser.cookie.get(cookieName);
      if (existing) {
        document.cookie = `${cookieName}=${existing}; path=/; max-age=${NINETY_DAYS}; SameSite=Lax`;
        log('bridged existing', cookieName, existing);
        await diag('bridged', `${cookieName}=${existing}`);
        return cookieName;
      }
    } catch (e) { /* fall through to our own copy */ }
  }

  try {
    const stored = await api.browser.cookie.get(CLICK_ID_COOKIE);
    if (!stored) {
      log('no click id on this visit');
      await diag('no-click-id', '');
      return null;
    }

    const [param, capturedAt, ...rest] = stored.split('.');
    const value = rest.join('.');
    const cookieName = LINKER_COOKIE_FOR[param];
    if (!cookieName || !value) return null;

    const seconds = Math.floor(Number(capturedAt) / 1000) || Math.floor(Date.now() / 1000);
    document.cookie = `${cookieName}=GCL.${seconds}.${value}; path=/; max-age=${NINETY_DAYS}; SameSite=Lax`;
    log('rebuilt', cookieName, 'from', param, value);
    // Read back from the sandbox document: proves gtag will actually see it,
    // rather than proving only that we tried to write it.
    const visible = document.cookie.includes(`${cookieName}=GCL.`);
    await diag('rebuilt', `${cookieName} visible=${visible} ${param}=${value}`);
    return cookieName;
  } catch (e) {
    log('could not prime linker cookie', e);
    return null;
  }
}

// -----------------------------------------------------------------------------
// 2.3 — gtag.js
// -----------------------------------------------------------------------------

window.dataLayer = window.dataLayer || [];
window.gtag = function () { window.dataLayer.push(arguments); };

const ready = (async function bootstrap() {
  await primeLinkerCookie();

  window.gtag('js', new Date());
  window.gtag('config', GOOGLE_ADS_ID, {
    allow_enhanced_conversions: ENHANCED_CONVERSIONS,
  });

  try {
    const s = document.createElement('script');
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GOOGLE_ADS_ID;
    s.async = true;
    document.head.appendChild(s);
  } catch (e) {
    log('gtag.js failed to load', e);
  }
})();


// =============================================================================
// SECTION 3 — SHARED UTILITIES
// =============================================================================

// Google requires the email trimmed, lowercased and SHA-256 hex encoded.
// crypto.subtle needs a secure context; the pixel sandbox is https, but the
// call is guarded anyway so a failure degrades to a conversion without
// enhanced data rather than to no conversion at all.
async function sha256Hex(input) {
  try {
    if (!input || !crypto?.subtle) return null;
    const bytes = new TextEncoder().encode(String(input).trim().toLowerCase());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    log('hash failed', e);
    return null;
  }
}

// One place that builds and fires a conversion, so every event gets the same
// treatment: wait for the bridge, attach value only where it belongs, and never
// throw into the storefront.
async function sendConversion(kind, { value, currency, transactionId, email } = {}) {
  try {
    await ready;
    // Re-prime rather than trust bootstrap: on a land-and-buy visit the
    // bootstrap ran before page_viewed had stored the click id.
    await primeLinkerCookie();

    const label = CONVERSION_LABELS[kind];
    if (!label || label.startsWith('XXXX')) {
      log('skipped', kind, '— label not configured');
      return;
    }

    if (ENHANCED_CONVERSIONS && email) {
      const hashed = await sha256Hex(email);
      if (hashed) window.gtag('set', 'user_data', { sha256_email_address: hashed });
    }

    const payload = { send_to: `${GOOGLE_ADS_ID}/${label}` };

    if (SEND_VALUE[kind]) {
      payload.value = Number(value) || 0;
      payload.currency = currency || undefined;
    }
    // Google Ads deduplicates on transaction_id, so a customer refreshing the
    // thank-you page does not book a second sale.
    if (transactionId) payload.transaction_id = String(transactionId);

    window.gtag('event', 'conversion', payload);
    log('sent', kind, payload);
    const linker = (document.cookie.match(/_gcl_(aw|gb)=([^;]+)/) || [])[2] || 'NONE';
    await diag('sent', `${kind} linker=${linker}`);
  } catch (e) {
    log('send failed', kind, e);
  }
}


// =============================================================================
// SECTION 4 — CONVERSION EVENTS
// =============================================================================
// These use Shopify's real events rather than click listeners on button text.
// A click on "Add to cart" is not an add to cart: it fires on misclicks, on
// failed adds, and breaks the moment the theme copy is translated or reworded.
// =============================================================================

// 4.1 Purchase — the only conversion that carries value, and the only one that
// should be Primary at the account level.
analytics.subscribe('checkout_completed', (event) => {
  const checkout = event?.data?.checkout;
  if (!checkout) return;

  sendConversion('purchase', {
    value: checkout.totalPrice?.amount,
    currency: checkout.currencyCode,
    transactionId: checkout.order?.id ?? checkout.token,
    email: checkout.email,
  });
});

// 4.2 Add to cart — funnel step, no value, Secondary.
analytics.subscribe('product_added_to_cart', () => {
  sendConversion('add_to_cart');
});

// 4.3 Begin checkout — funnel step, no value, Secondary.
analytics.subscribe('checkout_started', (event) => {
  const checkout = event?.data?.checkout;
  sendConversion('begin_checkout', { email: checkout?.email });
});


// =============================================================================
// END OF PIXEL
// =============================================================================
