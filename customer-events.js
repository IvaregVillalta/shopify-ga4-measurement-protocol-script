// =============================================================================
// SHOPIFY CUSTOM PIXEL — GA4 UNIFIED TRACKING
// =============================================================================
// Version: 3.1.0
// Environment: Shopify → Settings → Customer Events → Custom Pixel
// Target: Google Analytics 4 via gtag.js
//
// ARCHITECTURE:
//   All events (storefront + checkout + DOM) are captured via Shopify's
//   Customer Events API and forwarded to GA4 using manual gtag('event', ...)
//   calls. No Measurement Protocol. No dual-firing. One method for everything.
//
// SETUP:
//   1. In GA4 → Admin → Data Streams, confirm you have ONE stream for your store.
//   2. Copy the Measurement ID (G-XXXXXXXXXX) and paste below as GA4_MEASUREMENT_ID.
//   3. Set DEBUG_MODE to false before going live.
//   4. Paste this entire file into Shopify → Settings → Customer Events → Add custom pixel.
//
// DEBUG CHECKLIST (before go live):
//   [ ] GA4_MEASUREMENT_ID matches your GA4 property stream
//   [ ] DEBUG_MODE = false
//   [ ] Verified in GA4 DebugView — one event per user action, no duplicates
// =============================================================================


// =============================================================================
// SECTION 1 — CONFIGURATION
// =============================================================================

const GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX'; // ← Replace with your GA4 Measurement ID
const DEBUG_MODE         = false;           // ← Set to false before going live

// =============================================================================
// SECTION 2 — GTAG.JS INITIALIZATION
// =============================================================================
// gtag.js is loaded asynchronously. send_page_view is disabled — we fire
// page_view manually via the page_viewed subscription so we control timing
// and can include the full Shopify event context.
// =============================================================================

window.dataLayer = window.dataLayer || [];
window.gtag = function() { window.dataLayer.push(arguments); };
window.gtag('js', new Date());
window.gtag('config', GA4_MEASUREMENT_ID, {
  send_page_view: false,
  ...(DEBUG_MODE ? { debug_mode: true } : {})
});

(function loadGtag() {
  try {
    const s = document.createElement('script');
    s.src   = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_MEASUREMENT_ID;
    s.async = true;
    document.head.appendChild(s);
  } catch (e) { /* silently fail — pixel must never block the storefront */ }
})();


// =============================================================================
// SECTION 3 — SHARED UTILITIES
// =============================================================================

// -----------------------------------------------------------------------------
// 3.1 Debug Logger
// All console output is gated behind DEBUG_MODE. Production is silent.
// -----------------------------------------------------------------------------

function log(...args) {
  if (DEBUG_MODE) console.log('[GA4 Pixel]', ...args);
}

// -----------------------------------------------------------------------------
// 3.2 Event Deduplication
// Generates a deterministic event_id from event name + timestamp + discriminator.
// Uses djb2 hash to keep IDs short. A capped in-memory Set tracks sent IDs
// to prevent duplicates within the page session.
// -----------------------------------------------------------------------------

const _sentEventIds = new Set();

function _djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

function generateEventId(eventName, timestamp, discriminator) {
  return _djb2([eventName, timestamp || '', discriminator || ''].join('|'));
}

function isDuplicate(eventId) {
  if (_sentEventIds.has(eventId)) return true;
  _sentEventIds.add(eventId);
  // Cap at 500 to avoid unbounded memory growth
  if (_sentEventIds.size > 500) {
    _sentEventIds.delete(_sentEventIds.values().next().value);
  }
  return false;
}

// -----------------------------------------------------------------------------
// 3.3 Page Context
// Extracts location / title / referrer from the Shopify event context object.
// Safe against undefined at any depth.
// -----------------------------------------------------------------------------

function getPageContext(event) {
  const doc = event?.context?.document;
  const loc = doc?.location;
  return {
    page_location: loc?.href     || '',
    page_title:    doc?.title    || '',
    page_referrer: doc?.referrer || '',
    page_path:     loc?.pathname || ''
  };
}

// -----------------------------------------------------------------------------
// 3.4 Item Builders
// Shopify exposes product data in different shapes depending on the event type.
// All three builders produce the same GA4 ecommerce item schema.
// -----------------------------------------------------------------------------

/** From a ProductVariant object (product_viewed, collection_viewed) */
function variantToItem(variant, quantity, index) {
  if (!variant) return null;
  const product = variant.product || {};
  return {
    item_id:       product.id ? String(product.id) : (variant.sku || ''),
    item_name:     product.title    || '',
    item_brand:    product.vendor   || '',
    item_category: product.type     || '',
    item_variant:  variant.title    || '',
    price:         variant.price?.amount ?? 0,
    quantity:      quantity ?? 1,
    ...(typeof index === 'number' ? { index } : {})
  };
}

/** From a cart line (product_added_to_cart, product_removed_from_cart, cart_viewed) */
function cartLinesToItems(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line, i) => variantToItem(line?.merchandise, line?.quantity, i)).filter(Boolean);
}

/** From a checkout line item (checkout_started, purchase, and all checkout steps) */
function checkoutLineItemsToItems(lineItems) {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.map((li, i) => variantToItem(li?.variant, li?.quantity, i)).filter(Boolean);
}

/** From a collection's productVariants array (collection_viewed) */
function collectionVariantsToItems(variants) {
  if (!Array.isArray(variants)) return [];
  return variants.map((v, i) => variantToItem(v, 1, i)).filter(Boolean);
}

// -----------------------------------------------------------------------------
// 3.5 Discount Code Extractor
// Joins all DISCOUNT_CODE entries from discountApplications into a CSV string.
// -----------------------------------------------------------------------------

function getDiscountCodes(checkout) {
  if (!checkout?.discountApplications?.length) return '';
  return checkout.discountApplications
    .filter(d => d?.type === 'DISCOUNT_CODE')
    .map(d => d.title)
    .filter(Boolean)
    .join(',');
}

// -----------------------------------------------------------------------------
// 3.6 Page Load Time
// Reads from the browser's performance.timing API to calculate how long the
// current page took to fully load, in seconds rounded to 2 decimal places.
//
// Returns null (omitted from payload) when:
//   - performance.timing is unavailable (sandbox restriction)
//   - loadEventEnd is 0, meaning the load event hasn't completed yet
//     (fallback: domContentLoadedEventEnd is used in that case)
//   - The computed value is negative or zero (navigation timing anomaly)
//
// Attach to page-load events only: page_view, view_item, view_item_list,
// view_cart. Do not attach to user-action events (checkout steps, clicks).
// -----------------------------------------------------------------------------

function getPageLoadTime() {
  try {
    const t = performance && performance.timing;
    if (!t || !t.navigationStart) return null;

    const start = t.navigationStart;

    // Prefer full load (loadEventEnd); fall back to DOM ready if load hasn't fired yet
    const end = t.loadEventEnd > 0 ? t.loadEventEnd
      : (t.domContentLoadedEventEnd > 0 ? t.domContentLoadedEventEnd : 0);

    if (!end || end <= start) return null;

    return Math.round((end - start) / 10) / 100; // ms → seconds, 2 decimal places
  } catch (e) {
    return null;
  }
}

// -----------------------------------------------------------------------------
// 3.7 gtag Event Sender
// Central dispatch for all GA4 events. Handles deduplication and logging.
// event_id is passed as a gtag hint — GA4 uses it for server-side dedup.
// -----------------------------------------------------------------------------

function sendEvent(eventName, params, eventId) {
  if (eventId && isDuplicate(eventId)) {
    log('Duplicate suppressed:', eventName, eventId);
    return;
  }
  log('gtag →', eventName, params);
  gtag('event', eventName, {
    ...(eventId    ? { event_id:   eventId } : {}),
    ...(DEBUG_MODE ? { debug_mode: true    } : {}),
    ...params
  });
}


// =============================================================================
// SECTION 4 — STOREFRONT EVENTS
// Standard ecommerce events that fire on the online store.
// =============================================================================

// -----------------------------------------------------------------------------
// 4.1 Page Viewed → page_view
// Fires on every page load: online store, checkout, and order status.
// -----------------------------------------------------------------------------

analytics.subscribe('page_viewed', (event) => {
  try {
    const page          = getPageContext(event);
    const eventId       = generateEventId('page_view', event.timestamp);
    const pageLoadTime  = getPageLoadTime();
    log('page_viewed', page.page_location);

    sendEvent('page_view', {
      page_location: page.page_location,
      page_title:    page.page_title,
      page_referrer: page.page_referrer,
      ...(pageLoadTime !== null ? { page_load_time: pageLoadTime } : {})
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 4.2 Product Viewed → view_item
// Fires when a customer visits a product detail page.
// -----------------------------------------------------------------------------

analytics.subscribe('product_viewed', (event) => {
  try {
    const variant      = event.data?.productVariant;
    const item         = variantToItem(variant, 1);
    if (!item) return;

    const page         = getPageContext(event);
    const eventId      = generateEventId('view_item', event.timestamp, variant?.product?.id);
    const pageLoadTime = getPageLoadTime();

    sendEvent('view_item', {
      currency:      variant?.price?.currencyCode || 'USD',
      value:         variant?.price?.amount       ?? 0,
      items:         [item],
      page_location: page.page_location,
      page_title:    page.page_title,
      ...(pageLoadTime !== null ? { page_load_time: pageLoadTime } : {})
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 4.3 Collection Viewed → view_item_list
// Fires when a customer visits a collection page.
// Sends all product variants in the collection as the items array.
// -----------------------------------------------------------------------------

analytics.subscribe('collection_viewed', (event) => {
  try {
    const collection   = event.data?.collection;
    if (!collection) return;

    const items        = collectionVariantsToItems(collection.productVariants);
    const page         = getPageContext(event);
    const eventId      = generateEventId('view_item_list', event.timestamp, collection.id);
    const pageLoadTime = getPageLoadTime();

    sendEvent('view_item_list', {
      item_list_id:   collection.id    || '',
      item_list_name: collection.title || '',
      items,
      page_location:  page.page_location,
      page_title:     page.page_title,
      ...(pageLoadTime !== null ? { page_load_time: pageLoadTime } : {})
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 4.4 Search Submitted → search
// Fires when a customer performs a storefront search.
// -----------------------------------------------------------------------------

analytics.subscribe('search_submitted', (event) => {
  try {
    const query   = event.data?.searchResult?.query || '';
    const page    = getPageContext(event);
    const eventId = generateEventId('search', event.timestamp, query);

    sendEvent('search', {
      search_term:   query,
      page_location: page.page_location,
      page_title:    page.page_title
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 4.5 Product Added to Cart → add_to_cart
// Fires when a customer adds a product to the cart from the online store.
// -----------------------------------------------------------------------------

analytics.subscribe('product_added_to_cart', (event) => {
  try {
    const cartLine = event.data?.cartLine;
    if (!cartLine) return;

    const item = variantToItem(cartLine.merchandise, cartLine.quantity);
    if (!item) return;

    const cost    = cartLine.cost?.totalAmount;
    const page    = getPageContext(event);
    const eventId = generateEventId('add_to_cart', event.timestamp, cartLine.merchandise?.product?.id);

    sendEvent('add_to_cart', {
      currency:      cost?.currencyCode || 'USD',
      value:         cost?.amount       ?? 0,
      items:         [item],
      page_location: page.page_location,
      page_title:    page.page_title
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 4.6 Product Removed from Cart → remove_from_cart
// Fires when a customer removes a product from the cart.
// -----------------------------------------------------------------------------

analytics.subscribe('product_removed_from_cart', (event) => {
  try {
    const cartLine = event.data?.cartLine;
    if (!cartLine) return;

    const item = variantToItem(cartLine.merchandise, cartLine.quantity);
    if (!item) return;

    const cost    = cartLine.cost?.totalAmount;
    const page    = getPageContext(event);
    const eventId = generateEventId('remove_from_cart', event.timestamp, cartLine.merchandise?.product?.id);

    sendEvent('remove_from_cart', {
      currency:      cost?.currencyCode || 'USD',
      value:         cost?.amount       ?? 0,
      items:         [item],
      page_location: page.page_location,
      page_title:    page.page_title
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 4.7 Cart Viewed → view_cart
// Fires when a customer visits the cart page.
// -----------------------------------------------------------------------------

analytics.subscribe('cart_viewed', (event) => {
  try {
    const cart         = event.data?.cart;
    if (!cart) return;

    const items        = cartLinesToItems(cart.lines);
    const totalCost    = cart.cost?.totalAmount;
    const page         = getPageContext(event);
    const eventId      = generateEventId('view_cart', event.timestamp, cart.id);
    const pageLoadTime = getPageLoadTime();

    sendEvent('view_cart', {
      currency:      totalCost?.currencyCode || 'USD',
      value:         totalCost?.amount       ?? 0,
      items,
      page_location: page.page_location,
      page_title:    page.page_title,
      ...(pageLoadTime !== null ? { page_load_time: pageLoadTime } : {})
    }, eventId);
  } catch (e) { /* defensive */ }
});


// =============================================================================
// SECTION 5 — CHECKOUT EVENTS
// These events fire during the checkout flow.
// =============================================================================

// -----------------------------------------------------------------------------
// 5.1 Checkout Started → begin_checkout
// Fires when a customer initiates checkout.
// Includes all line items, discounts, and totals.
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_started', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;

    const items   = checkoutLineItemsToItems(checkout.lineItems);
    const page    = getPageContext(event);
    const coupon  = getDiscountCodes(checkout);
    const eventId = generateEventId('begin_checkout', event.timestamp, checkout.token);

    sendEvent('begin_checkout', {
      currency: checkout.currencyCode       || 'USD',
      value:    checkout.totalPrice?.amount ?? 0,
      coupon,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 5.2 Checkout Contact Info Submitted → checkout_contact_info (custom)
// Fires when a customer submits contact information during checkout.
// No standard GA4 event exists for this step; sent as a custom event.
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_contact_info_submitted', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;

    const items   = checkoutLineItemsToItems(checkout.lineItems);
    const page    = getPageContext(event);
    const eventId = generateEventId('checkout_contact_info', event.timestamp, checkout.token);

    sendEvent('checkout_contact_info', {
      currency: checkout.currencyCode       || 'USD',
      value:    checkout.totalPrice?.amount ?? 0,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 5.3 Checkout Address Info Submitted → checkout_address_info (custom)
// Fires when a customer submits their mailing address.
// Sent as a custom event to track funnel progression.
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_address_info_submitted', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;

    const items   = checkoutLineItemsToItems(checkout.lineItems);
    const page    = getPageContext(event);
    const eventId = generateEventId('checkout_address_info', event.timestamp, checkout.token);

    sendEvent('checkout_address_info', {
      currency: checkout.currencyCode       || 'USD',
      value:    checkout.totalPrice?.amount ?? 0,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 5.4 Checkout Shipping Info Submitted → add_shipping_info
// Fires when a customer selects a shipping rate.
// Maps to the GA4 recommended add_shipping_info event.
// Includes the selected shipping tier derived from the shipping line price.
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_shipping_info_submitted', (event) => {
  try {
    const checkout     = event.data?.checkout;
    if (!checkout) return;

    const items        = checkoutLineItemsToItems(checkout.lineItems);
    const page         = getPageContext(event);
    const coupon       = getDiscountCodes(checkout);
    const shippingLine = checkout.shippingLine;
    const shippingTier = shippingLine?.price ? `${shippingLine.price.amount} ${shippingLine.price.currencyCode}`
      : '';
    const eventId      = generateEventId('add_shipping_info', event.timestamp, checkout.token);

    sendEvent('add_shipping_info', {
      currency:      checkout.currencyCode       || 'USD',
      value:         checkout.totalPrice?.amount ?? 0,
      coupon,
      shipping_tier: shippingTier,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 5.5 Payment Info Submitted → add_payment_info
// Fires when a customer submits payment details.
// Maps to the GA4 recommended add_payment_info event.
// -----------------------------------------------------------------------------

analytics.subscribe('payment_info_submitted', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;
    const items   = checkoutLineItemsToItems(checkout.lineItems);
    const page    = getPageContext(event);
    const coupon  = getDiscountCodes(checkout);
    const eventId = generateEventId('add_payment_info', event.timestamp, checkout.token);
    const paymentType = checkout.transactions?.[0]?.gateway || '';

    sendEvent('add_payment_info', {
      currency: checkout.currencyCode       || 'USD',
      value:    checkout.totalPrice?.amount ?? 0,
      coupon,
      payment_type: paymentType,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 5.6 Checkout Completed → purchase
// Fires once when a customer completes a purchase (thank-you page).
// Most critical event — includes transaction_id, tax, shipping, discount,
// and all line items. transaction_id is GA4's native server-side dedup key
// for purchase events: order.id → checkout.token → event.id (fallback chain).
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_completed', (event) => {
  try {
    const checkout      = event.data?.checkout;
    if (!checkout) return;

    const transactionId = String(checkout.order?.id || checkout.token || event.id || '');
    const items         = checkoutLineItemsToItems(checkout.lineItems);
    const page          = getPageContext(event);
    const coupon        = getDiscountCodes(checkout);
    const shipping      = checkout.shippingLine?.price?.amount  ?? 0;
    const tax           = checkout.totalTax?.amount             ?? 0;
    const discount      = checkout.discountsAmount?.amount      ?? 0;
    const eventId       = generateEventId('purchase', event.timestamp, transactionId);

    sendEvent('purchase', {
      transaction_id: transactionId,
      currency:       checkout.currencyCode       || 'USD',
      value:          checkout.totalPrice?.amount ?? 0,
      tax,
      shipping,
      discount,
      coupon,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 5.7 Alert Displayed → alert_displayed (custom)
// Fires when the checkout displays an alert or validation message.
// Captures invalid coupon codes, out-of-stock notices, and other friction points.
// alert_message is truncated to 100 chars to keep the payload small.
// -----------------------------------------------------------------------------

analytics.subscribe('alert_displayed', (event) => {
  try {
    const alert = event.data?.alert;
    if (!alert) return;

    const page    = getPageContext(event);
    const eventId = generateEventId('alert_displayed', event.timestamp, alert.type);

    sendEvent('alert_displayed', {
      alert_type:    alert.type                           || '',
      alert_message: (alert.message || '').substring(0, 100),
      alert_target:  alert.target                        || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 5.8 UI Extension Errored → ui_extension_errored (custom)
// Fires when a checkout UI extension fails due to an uncaught exception.
// Useful for monitoring third-party app stability in checkout.
// All string fields are truncated to 100 chars to keep payload size bounded.
// -----------------------------------------------------------------------------

analytics.subscribe('ui_extension_errored', (event) => {
  try {
    const error = event.data?.error;
    if (!error) return;

    const page    = getPageContext(event);
    const eventId = generateEventId('ui_extension_errored', event.timestamp, error.appId);

    sendEvent('ui_extension_errored', {
      app_id:           error.appId                          || '',
      app_name:         (error.appName       || '').substring(0, 100),
      extension_name:   (error.extensionName || '').substring(0, 100),
      extension_target: error.extensionTarget                || '',
      error_message:    (error.message       || '').substring(0, 100),
      error_type:       error.type                           || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});


// =============================================================================
// SECTION 6 — DOM INTERACTION EVENTS
// Low-level DOM events available via Shopify's Customer Events API.
// Useful for heatmap-style interaction analysis, form friction detection,
// and UX funnel diagnostics.
//
// NOTE: These events can fire at high volume — especially clicked and
// input_changed. Consider enabling sampling in GA4 or filtering these
// events at the property level if event quotas become a concern.
// =============================================================================

// -----------------------------------------------------------------------------
// 6.1 Clicked → dom_clicked (custom)
// Fires when a customer clicks any page element.
// Captures the element's tag, id, href, and click coordinates.
// Useful for identifying CTA engagement and unexpected click targets.
// -----------------------------------------------------------------------------

analytics.subscribe('clicked', (event) => {
  try {
    const element = event.data?.element;
    if (!element) return;

    const page    = getPageContext(event);
    const eventId = generateEventId('dom_clicked', event.timestamp, element.id || element.href);

    sendEvent('dom_clicked', {
      element_tag:   element.tagName                       || '',
      element_id:    element.id                            || '',
      element_name:  element.name                          || '',
      element_type:  element.type                          || '',
      element_value: (element.value  || '').substring(0, 100),
      element_href:  (element.href   || '').substring(0, 500),
      click_x:       event.data?.clientX                   ?? 0,
      click_y:       event.data?.clientY                   ?? 0,
      page_x:        event.data?.pageX                     ?? 0,
      page_y:        event.data?.pageY                     ?? 0,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 6.2 Form Submitted → dom_form_submitted (custom)
// Fires when a form on the page is submitted.
// Captures the form's id, action URL, and a structural summary of its fields.
// NOTE: Input VALUES are intentionally excluded to avoid capturing PII
//       (emails, addresses, passwords). Only field names and types are sent.
// -----------------------------------------------------------------------------

analytics.subscribe('form_submitted', (event) => {
  try {
    const formElement = event.data?.element;
    if (!formElement) return;

    const page       = getPageContext(event);
    const eventId    = generateEventId('dom_form_submitted', event.timestamp, formElement.id || formElement.action);
    const fieldCount = Array.isArray(formElement.elements) ? formElement.elements.length : 0;

    // Structural summary: "fieldname:type" pairs, values excluded for PII safety
    const fieldSummary = Array.isArray(formElement.elements) ? formElement.elements
          .map(el => `${el.name || el.id || 'unnamed'}:${el.type || 'unknown'}`)
          .slice(0, 20)
          .join(',')
      : '';

    sendEvent('dom_form_submitted', {
      form_id:            formElement.id                          || '',
      form_action:        (formElement.action || '').substring(0, 500),
      form_field_count:   fieldCount,
      form_field_summary: fieldSummary.substring(0, 500),
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 6.3 Input Focused → dom_input_focused (custom)
// Fires when an input element gains focus.
// Useful for tracking which fields attract attention first and measuring
// time-to-first-interaction in checkout or lead-gen forms.
// -----------------------------------------------------------------------------

analytics.subscribe('input_focused', (event) => {
  try {
    const element = event.data?.element;
    if (!element) return;

    const page    = getPageContext(event);
    const eventId = generateEventId('dom_input_focused', event.timestamp, element.id || element.name);

    sendEvent('dom_input_focused', {
      element_tag:  element.tagName || '',
      element_id:   element.id      || '',
      element_name: element.name    || '',
      element_type: element.type    || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 6.4 Input Changed → dom_input_changed (custom)
// Fires when an input element's value changes (on change, not on every keystroke).
// Tracks which fields customers interact with and modify.
// NOTE: The actual value is NOT sent — only the field identity — to avoid
//       capturing PII such as emails, phone numbers, or addresses.
// -----------------------------------------------------------------------------

analytics.subscribe('input_changed', (event) => {
  try {
    const element = event.data?.element;
    if (!element) return;

    const page    = getPageContext(event);
    const eventId = generateEventId('dom_input_changed', event.timestamp, element.id || element.name);

    sendEvent('dom_input_changed', {
      element_tag:  element.tagName || '',
      element_id:   element.id      || '',
      element_name: element.name    || '',
      element_type: element.type    || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 6.5 Input Blurred → dom_input_blurred (custom)
// Fires when an input element loses focus (blur event).
// Combined with input_focused, enables field-level dwell time analysis
// and identifies fields where customers hesitate or abandon.
// -----------------------------------------------------------------------------

analytics.subscribe('input_blurred', (event) => {
  try {
    const element = event.data?.element;
    if (!element) return;

    const page    = getPageContext(event);
    const eventId = generateEventId('dom_input_blurred', event.timestamp, element.id || element.name);

    sendEvent('dom_input_blurred', {
      element_tag:  element.tagName || '',
      element_id:   element.id      || '',
      element_name: element.name    || '',
      element_type: element.type    || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// =============================================================================
// END OF PIXEL
// =============================================================================