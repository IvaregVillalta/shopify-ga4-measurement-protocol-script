// =============================================================================
// SHOPIFY CUSTOM PIXEL — GA4 MEASUREMENT PROTOCOL TRACKING SCRIPT
// =============================================================================
// Version: 1.1.0
// Environment: Shopify → Customer Events → Custom Pixel
// Target: Google Analytics 4 via Measurement Protocol
//
// SETUP:
// 1. Replace GA4_MEASUREMENT_ID with your GA4 property ID (e.g. 'G-XXXXXXXXXX')
// 2. Replace GA4_API_SECRET with your Measurement Protocol API secret
//    (Admin → Data Streams → your stream → Measurement Protocol API secrets)
// 3. Paste this entire script into Shopify → Settings → Customer Events → Add custom pixel
// 4. Set debug_mode to false for production
// =============================================================================

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------

const GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';
const GA4_API_SECRET = 'your_secret_here';
const DEBUG_MODE = true; // Set to false in production
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const MP_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';

// -----------------------------------------------------------------------------
// UTILITY: Client ID Management
// -----------------------------------------------------------------------------
// Generates a GA4-compatible client_id in the format "timestamp.random"
// Persisted in localStorage so it survives across sessions.
// Falls back to a per-page-load ID if localStorage is unavailable.
// -----------------------------------------------------------------------------

function getOrCreateClientId() {
  const STORAGE_KEY = '_ga4_mp_client_id';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const clientId = Math.floor(Date.now() / 1000) + '.' + Math.floor(Math.random() * 1000000000);
    localStorage.setItem(STORAGE_KEY, clientId);
    return clientId;
  } catch (e) {
    // localStorage may be blocked in sandbox; generate ephemeral ID
    return Math.floor(Date.now() / 1000) + '.' + Math.floor(Math.random() * 1000000000);
  }
}

// -----------------------------------------------------------------------------
// UTILITY: Session ID Management
// -----------------------------------------------------------------------------
// GA4 sessions are identified by a numeric session_id stored in sessionStorage.
// If the user has been inactive for longer than SESSION_TIMEOUT_MS, a new
// session is started. The last-activity timestamp is updated on every event.
// -----------------------------------------------------------------------------

function getOrCreateSessionId() {
  const SESSION_KEY = '_ga4_mp_session_id';
  const ACTIVITY_KEY = '_ga4_mp_last_activity';
  const now = Date.now();

  try {
    const lastActivity = parseInt(sessionStorage.getItem(ACTIVITY_KEY) || '0', 10);
    let sessionId = sessionStorage.getItem(SESSION_KEY);

    // Start a new session if timed out or missing
    if (!sessionId || (now - lastActivity) > SESSION_TIMEOUT_MS) {
      sessionId = String(Math.floor(now / 1000));
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }

    // Update last activity timestamp
    sessionStorage.setItem(ACTIVITY_KEY, String(now));
    return sessionId;
  } catch (e) {
    // sessionStorage unavailable; return a fresh session id per page load
    return String(Math.floor(now / 1000));
  }
}

// -----------------------------------------------------------------------------
// UTILITY: Event Deduplication
// -----------------------------------------------------------------------------
// Generates a unique event_id from event name + timestamp + optional product id.
// Uses a simple string hash (djb2) to keep the ID short and deterministic.
// A Set tracks recently sent IDs to prevent duplicates within the page session.
// -----------------------------------------------------------------------------

const _sentEventIds = new Set();

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

function generateEventId(eventName, timestamp, productId) {
  const raw = [eventName, timestamp || '', productId || ''].join('|');
  return hashString(raw);
}

function isDuplicate(eventId) {
  if (_sentEventIds.has(eventId)) return true;
  _sentEventIds.add(eventId);
  // Cap the set size to avoid unbounded memory growth
  if (_sentEventIds.size > 500) {
    const first = _sentEventIds.values().next().value;
    _sentEventIds.delete(first);
  }
  return false;
}

// -----------------------------------------------------------------------------
// UTILITY: Extract Page Context
// -----------------------------------------------------------------------------
// Pulls page metadata from the Shopify event context object.
// Returns an object with page_location, page_title, page_referrer, page_path.
// -----------------------------------------------------------------------------

function getPageContext(event) {
  const doc = event?.context?.document;
  const loc = doc?.location;
  return {
    page_location: loc?.href || '',
    page_title: doc?.title || '',
    page_referrer: doc?.referrer || '',
    page_path: loc?.pathname || ''
  };
}

// -----------------------------------------------------------------------------
// UTILITY: Extract Product Variant → GA4 Item
// -----------------------------------------------------------------------------
// Converts a Shopify ProductVariant object into a GA4 ecommerce item.
// Safely handles null/undefined at every level.
// -----------------------------------------------------------------------------

function variantToItem(variant, quantity, index) {
  if (!variant) return null;
  const product = variant.product || {};
  return {
    item_id: product.id ? String(product.id) : (variant.sku || ''),
    item_name: product.title || '',
    item_brand: product.vendor || '',
    item_category: product.type || '',
    item_variant: variant.title || '',
    price: variant.price?.amount ?? 0,
    quantity: quantity ?? 1,
    ...(typeof index === 'number' ? { index } : {})
  };
}

// -----------------------------------------------------------------------------
// UTILITY: Build Items Array from Cart Lines (cart_viewed)
// -----------------------------------------------------------------------------

function cartLinesToItems(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line, i) => {
    const item = variantToItem(line?.merchandise, line?.quantity, i);
    return item;
  }).filter(Boolean);
}

// -----------------------------------------------------------------------------
// UTILITY: Build Items Array from Checkout Line Items
// -----------------------------------------------------------------------------

function checkoutLineItemsToItems(lineItems) {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.map((li, i) => {
    const item = variantToItem(li?.variant, li?.quantity, i);
    return item;
  }).filter(Boolean);
}

// -----------------------------------------------------------------------------
// UTILITY: Build Items Array from Collection Product Variants
// -----------------------------------------------------------------------------

function collectionVariantsToItems(variants) {
  if (!Array.isArray(variants)) return [];
  return variants.map((v, i) => variantToItem(v, 1, i)).filter(Boolean);
}

// -----------------------------------------------------------------------------
// UTILITY: Extract first discount code from checkout
// -----------------------------------------------------------------------------

function getDiscountCodes(checkout) {
  if (!checkout?.discountApplications?.length) return '';
  const codes = checkout.discountApplications
    .filter(d => d?.type === 'DISCOUNT_CODE')
    .map(d => d.title)
    .filter(Boolean);
  return codes.join(',');
}

// -----------------------------------------------------------------------------
// CORE: Send GA4 Event via Measurement Protocol
// -----------------------------------------------------------------------------
// Constructs the MP payload and fires a non-blocking fetch.
// Includes client_id, session_id, event_id, debug_mode, and engagement_time.
// Uses keepalive so the request survives page navigation.
// -----------------------------------------------------------------------------

function sendGA4Event(eventName, params, eventId) {
  const clientId = getOrCreateClientId();
  const sessionId = getOrCreateSessionId();

  // Deduplication check
  if (eventId && isDuplicate(eventId)) return;

  const payload = {
    client_id: clientId,
    events: [{
      name: eventName,
      params: {
        session_id: sessionId,
        engagement_time_msec: 100,
        ...(eventId ? { event_id: eventId } : {}),
        ...(DEBUG_MODE ? { debug_mode: true } : {}),
        ...params
      }
    }]
  };

  // Always send to the real endpoint. The debug_mode param inside the event
  // params is what makes the event appear in GA4 DebugView — the debug
  // endpoint (/debug/mp/collect) only validates payloads without ingesting.
  const url = `${MP_ENDPOINT}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

  try {
    fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch (e) {
    // Silently fail — never block the storefront
  }
}

// =============================================================================
// EVENT SUBSCRIPTIONS
// =============================================================================

// -----------------------------------------------------------------------------
// 1. PAGE VIEWED → page_view
// -----------------------------------------------------------------------------
// Fires on every page load across online store, checkout, and order status.
// No product data; only page context is sent.
// -----------------------------------------------------------------------------

analytics.subscribe('page_viewed', (event) => {
  try {
    const page = getPageContext(event);
    const eventId = generateEventId('page_view', event.timestamp);

    sendGA4Event('page_view', {
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 2. PRODUCT VIEWED → view_item
// -----------------------------------------------------------------------------
// Fires when a customer visits a product detail page.
// Sends the product as a single-item array in GA4 ecommerce format.
// -----------------------------------------------------------------------------

analytics.subscribe('product_viewed', (event) => {
  try {
    const variant = event.data?.productVariant;
    const item = variantToItem(variant, 1);
    if (!item) return;

    const page = getPageContext(event);
    const eventId = generateEventId('view_item', event.timestamp, variant?.product?.id);

    sendGA4Event('view_item', {
      currency: variant?.price?.currencyCode || 'USD',
      value: variant?.price?.amount ?? 0,
      items: [item],
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 3. COLLECTION VIEWED → view_item_list
// -----------------------------------------------------------------------------
// Fires when a customer visits a collection page.
// Sends all product variants in the collection as the items array.
// -----------------------------------------------------------------------------

analytics.subscribe('collection_viewed', (event) => {
  try {
    const collection = event.data?.collection;
    if (!collection) return;

    const items = collectionVariantsToItems(collection.productVariants);
    const page = getPageContext(event);
    const eventId = generateEventId('view_item_list', event.timestamp, collection.id);

    sendGA4Event('view_item_list', {
      item_list_id: collection.id || '',
      item_list_name: collection.title || '',
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 4. SEARCH SUBMITTED → search
// -----------------------------------------------------------------------------
// Fires when a customer performs a storefront search.
// Captures the search_term parameter required by GA4.
// -----------------------------------------------------------------------------

analytics.subscribe('search_submitted', (event) => {
  try {
    const searchResult = event.data?.searchResult;
    const query = searchResult?.query || '';
    const page = getPageContext(event);
    const eventId = generateEventId('search', event.timestamp, query);

    sendGA4Event('search', {
      search_term: query,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 5. PRODUCT ADDED TO CART → add_to_cart
// -----------------------------------------------------------------------------
// Fires when a customer adds a product to the cart from the online store.
// Sends the cart line item with its cost and currency.
// -----------------------------------------------------------------------------

analytics.subscribe('product_added_to_cart', (event) => {
  try {
    const cartLine = event.data?.cartLine;
    if (!cartLine) return;

    const item = variantToItem(cartLine.merchandise, cartLine.quantity);
    if (!item) return;

    const cost = cartLine.cost?.totalAmount;
    const page = getPageContext(event);
    const eventId = generateEventId('add_to_cart', event.timestamp, cartLine.merchandise?.product?.id);

    sendGA4Event('add_to_cart', {
      currency: cost?.currencyCode || 'USD',
      value: cost?.amount ?? 0,
      items: [item],
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 6. PRODUCT REMOVED FROM CART → remove_from_cart
// -----------------------------------------------------------------------------
// Fires when a customer removes a product from the cart.
// Mirrors the add_to_cart structure for consistency.
// -----------------------------------------------------------------------------

analytics.subscribe('product_removed_from_cart', (event) => {
  try {
    const cartLine = event.data?.cartLine;
    if (!cartLine) return;

    const item = variantToItem(cartLine.merchandise, cartLine.quantity);
    if (!item) return;

    const cost = cartLine.cost?.totalAmount;
    const page = getPageContext(event);
    const eventId = generateEventId('remove_from_cart', event.timestamp, cartLine.merchandise?.product?.id);

    sendGA4Event('remove_from_cart', {
      currency: cost?.currencyCode || 'USD',
      value: cost?.amount ?? 0,
      items: [item],
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 7. CART VIEWED → view_cart
// -----------------------------------------------------------------------------
// Fires when a customer visits the cart page.
// Sends all cart line items with the total cart value.
// -----------------------------------------------------------------------------

analytics.subscribe('cart_viewed', (event) => {
  try {
    const cart = event.data?.cart;
    if (!cart) return;

    const items = cartLinesToItems(cart.lines);
    const totalCost = cart.cost?.totalAmount;
    const page = getPageContext(event);
    const eventId = generateEventId('view_cart', event.timestamp, cart.id);

    sendGA4Event('view_cart', {
      currency: totalCost?.currencyCode || 'USD',
      value: totalCost?.amount ?? 0,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 8. CHECKOUT STARTED → begin_checkout
// -----------------------------------------------------------------------------
// Fires when a customer initiates checkout.
// Includes all checkout line items, discounts, and totals.
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_started', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;

    const items = checkoutLineItemsToItems(checkout.lineItems);
    const page = getPageContext(event);
    const coupon = getDiscountCodes(checkout);
    const eventId = generateEventId('begin_checkout', event.timestamp, checkout.token);

    sendGA4Event('begin_checkout', {
      currency: checkout.currencyCode || 'USD',
      value: checkout.totalPrice?.amount ?? 0,
      coupon,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 9. CHECKOUT CONTACT INFO SUBMITTED → custom: checkout_contact_info
// -----------------------------------------------------------------------------
// Fires when a customer submits contact information during checkout.
// No standard GA4 event exists for this; sent as a custom event.
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_contact_info_submitted', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;

    const items = checkoutLineItemsToItems(checkout.lineItems);
    const page = getPageContext(event);
    const eventId = generateEventId('checkout_contact_info', event.timestamp, checkout.token);

    sendGA4Event('checkout_contact_info', {
      currency: checkout.currencyCode || 'USD',
      value: checkout.totalPrice?.amount ?? 0,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 10. CHECKOUT ADDRESS INFO SUBMITTED → custom: checkout_address_info
// -----------------------------------------------------------------------------
// Fires when a customer submits their mailing address.
// Sent as a custom event to track funnel progression.
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_address_info_submitted', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;

    const items = checkoutLineItemsToItems(checkout.lineItems);
    const page = getPageContext(event);
    const eventId = generateEventId('checkout_address_info', event.timestamp, checkout.token);

    sendGA4Event('checkout_address_info', {
      currency: checkout.currencyCode || 'USD',
      value: checkout.totalPrice?.amount ?? 0,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 11. CHECKOUT SHIPPING INFO SUBMITTED → add_shipping_info
// -----------------------------------------------------------------------------
// Fires when a customer selects a shipping rate.
// Maps to the GA4 recommended add_shipping_info event.
// Includes the shipping tier from the selected shipping line.
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_shipping_info_submitted', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;

    const items = checkoutLineItemsToItems(checkout.lineItems);
    const page = getPageContext(event);
    const coupon = getDiscountCodes(checkout);
    const shippingTier = checkout.shippingLine?.price ? `${checkout.shippingLine.price.amount} ${checkout.shippingLine.price.currencyCode}` : '';
    const eventId = generateEventId('add_shipping_info', event.timestamp, checkout.token);

    sendGA4Event('add_shipping_info', {
      currency: checkout.currencyCode || 'USD',
      value: checkout.totalPrice?.amount ?? 0,
      coupon,
      shipping_tier: shippingTier,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 12. PAYMENT INFO SUBMITTED → add_payment_info
// -----------------------------------------------------------------------------
// Fires when a customer submits payment details.
// Maps to the GA4 recommended add_payment_info event.
// -----------------------------------------------------------------------------

analytics.subscribe('payment_info_submitted', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;

    const items = checkoutLineItemsToItems(checkout.lineItems);
    const page = getPageContext(event);
    const coupon = getDiscountCodes(checkout);
    const eventId = generateEventId('add_payment_info', event.timestamp, checkout.token);

    sendGA4Event('add_payment_info', {
      currency: checkout.currencyCode || 'USD',
      value: checkout.totalPrice?.amount ?? 0,
      coupon,
      items,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 13. CHECKOUT COMPLETED → purchase
// -----------------------------------------------------------------------------
// Fires once when a customer completes a purchase (thank-you page).
// This is the most critical event — includes transaction_id, tax, shipping,
// discount, and all line items.
// Uses the order ID as the transaction_id for deduplication in GA4.
// -----------------------------------------------------------------------------

analytics.subscribe('checkout_completed', (event) => {
  try {
    const checkout = event.data?.checkout;
    if (!checkout) return;

    const items = checkoutLineItemsToItems(checkout.lineItems);
    const page = getPageContext(event);
    const coupon = getDiscountCodes(checkout);

    // Use order ID for GA4 transaction_id; fall back to checkout token
    const transactionId = checkout.order?.id || checkout.token || event.id || '';

    // Calculate shipping cost from the shipping line
    const shipping = checkout.shippingLine?.price?.amount ?? 0;

    // Tax
    const tax = checkout.totalTax?.amount ?? 0;

    // Discount amount (if available via Checkout Extensibility)
    const discount = checkout.discountsAmount?.amount ?? 0;

    const eventId = generateEventId('purchase', event.timestamp, transactionId);

    sendGA4Event('purchase', {
      transaction_id: String(transactionId),
      currency: checkout.currencyCode || 'USD',
      value: checkout.totalPrice?.amount ?? 0,
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
// 14. ALERT DISPLAYED → custom: alert_displayed
// -----------------------------------------------------------------------------
// Fires when the checkout displays an alert or validation message.
// Useful for identifying friction points in the checkout funnel.
// Sent as a custom event with the alert type and message.
// -----------------------------------------------------------------------------

analytics.subscribe('alert_displayed', (event) => {
  try {
    const alert = event.data?.alert;
    if (!alert) return;

    const page = getPageContext(event);
    const eventId = generateEventId('alert_displayed', event.timestamp, alert.type);

    sendGA4Event('alert_displayed', {
      alert_type: alert.type || '',
      alert_message: (alert.message || '').substring(0, 100), // Truncate to keep payload small
      alert_target: alert.target || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 15. UI EXTENSION ERRORED → custom: ui_extension_errored
// -----------------------------------------------------------------------------
// Fires when a checkout UI extension fails to render due to an uncaught
// exception. Useful for monitoring third-party app stability in checkout.
// Captures the app name, extension target, error message, and stack trace.
// -----------------------------------------------------------------------------

analytics.subscribe('ui_extension_errored', (event) => {
  try {
    const error = event.data?.error;
    if (!error) return;

    const page = getPageContext(event);
    const eventId = generateEventId('ui_extension_errored', event.timestamp, error.appId);

    sendGA4Event('ui_extension_errored', {
      app_id: error.appId || '',
      app_name: (error.appName || '').substring(0, 100),
      extension_name: (error.extensionName || '').substring(0, 100),
      extension_target: error.extensionTarget || '',
      error_message: (error.message || '').substring(0, 100),
      error_type: error.type || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// =============================================================================
// DOM EVENT SUBSCRIPTIONS
// =============================================================================
// The following events capture low-level DOM interactions on the storefront
// and checkout. They are sent as custom GA4 events via Measurement Protocol.
// Useful for heatmap-style interaction analysis, form friction detection,
// and UX funnel diagnostics.
//
// NOTE: These DOM events can fire at high volume. Consider sampling or
// filtering in your GA4 property to manage event quotas if needed.
// =============================================================================

// -----------------------------------------------------------------------------
// 16. CLICKED → custom: dom_clicked
// -----------------------------------------------------------------------------
// Fires when a customer clicks any page element.
// Captures the clicked element's tag, id, href, and click coordinates.
// Useful for identifying CTA engagement and unexpected click targets.
// -----------------------------------------------------------------------------

analytics.subscribe('clicked', (event) => {
  try {
    const element = event.data?.element;
    if (!element) return;

    const page = getPageContext(event);
    const eventId = generateEventId('dom_clicked', event.timestamp, element.id || element.href);

    sendGA4Event('dom_clicked', {
      element_tag: element.tagName || '',
      element_id: element.id || '',
      element_name: element.name || '',
      element_type: element.type || '',
      element_value: (element.value || '').substring(0, 100),
      element_href: (element.href || '').substring(0, 500),
      click_x: event.data?.clientX ?? 0,
      click_y: event.data?.clientY ?? 0,
      page_x: event.data?.pageX ?? 0,
      page_y: event.data?.pageY ?? 0,
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 17. FORM SUBMITTED → custom: dom_form_submitted
// -----------------------------------------------------------------------------
// Fires when a form on the page is submitted.
// Captures the form's id, action URL, and a summary of its input fields.
// Useful for tracking newsletter signups, contact forms, and login attempts.
// NOTE: Input values are intentionally excluded to avoid capturing PII.
//       Only field names/ids/types are sent for structural analysis.
// -----------------------------------------------------------------------------

analytics.subscribe('form_submitted', (event) => {
  try {
    const formElement = event.data?.element;
    if (!formElement) return;

    const page = getPageContext(event);
    const eventId = generateEventId('dom_form_submitted', event.timestamp, formElement.id || formElement.action);

    // Build a compact summary of form fields (names and types only — no values for PII safety)
    const fieldCount = Array.isArray(formElement.elements) ? formElement.elements.length : 0;
    const fieldSummary = Array.isArray(formElement.elements)
      ? formElement.elements
          .map((el) => `${el.name || el.id || 'unnamed'}:${el.type || 'unknown'}`)
          .slice(0, 20) // Cap to avoid oversized payloads
          .join(',')
      : '';

    sendGA4Event('dom_form_submitted', {
      form_id: formElement.id || '',
      form_action: (formElement.action || '').substring(0, 500),
      form_field_count: fieldCount,
      form_field_summary: fieldSummary.substring(0, 500),
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 18. INPUT FOCUSED → custom: dom_input_focused
// -----------------------------------------------------------------------------
// Fires when an input element on the page gains focus.
// Useful for tracking which form fields attract attention first and
// measuring time-to-first-interaction in checkout or lead-gen forms.
// -----------------------------------------------------------------------------

analytics.subscribe('input_focused', (event) => {
  try {
    const element = event.data?.element;
    if (!element) return;

    const page = getPageContext(event);
    const eventId = generateEventId('dom_input_focused', event.timestamp, element.id || element.name);

    sendGA4Event('dom_input_focused', {
      element_tag: element.tagName || '',
      element_id: element.id || '',
      element_name: element.name || '',
      element_type: element.type || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 19. INPUT CHANGED → custom: dom_input_changed
// -----------------------------------------------------------------------------
// Fires when an input element's value changes (on change, not on every keystroke).
// Tracks which fields customers interact with and modify.
// NOTE: The actual value is NOT sent to avoid capturing PII (emails, passwords, etc.).
// -----------------------------------------------------------------------------

analytics.subscribe('input_changed', (event) => {
  try {
    const element = event.data?.element;
    if (!element) return;

    const page = getPageContext(event);
    const eventId = generateEventId('dom_input_changed', event.timestamp, element.id || element.name);

    sendGA4Event('dom_input_changed', {
      element_tag: element.tagName || '',
      element_id: element.id || '',
      element_name: element.name || '',
      element_type: element.type || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});

// -----------------------------------------------------------------------------
// 20. INPUT BLURRED → custom: dom_input_blurred
// -----------------------------------------------------------------------------
// Fires when an input element loses focus (blur).
// Combined with input_focused, this enables field-level dwell time analysis
// and identifies fields where customers hesitate or abandon.
// -----------------------------------------------------------------------------

analytics.subscribe('input_blurred', (event) => {
  try {
    const element = event.data?.element;
    if (!element) return;

    const page = getPageContext(event);
    const eventId = generateEventId('dom_input_blurred', event.timestamp, element.id || element.name);

    sendGA4Event('dom_input_blurred', {
      element_tag: element.tagName || '',
      element_id: element.id || '',
      element_name: element.name || '',
      element_type: element.type || '',
      ...page
    }, eventId);
  } catch (e) { /* defensive */ }
});
