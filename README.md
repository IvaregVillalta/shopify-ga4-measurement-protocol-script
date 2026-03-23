# Shopify GA4 Measurement Protocol — Custom Pixel

A production-ready Shopify Custom Pixel that sends a complete GA4 ecommerce event set directly to Google Analytics 4 via the **Measurement Protocol**, bypassing browser ad blockers and ITP restrictions.

**Version:** 1.1.0 | **Environment:** Shopify Customer Events → Custom Pixel

---

## Why use this instead of gtag.js?

| | gtag.js / Google tag | This script |
|---|---|---|
| Works through ad blockers | No | Yes |
| Works in Shopify checkout | No (third-party scripts blocked) | Yes |
| Tracks purchase server-side | No | Yes (client-side MP) |
| Requires GTM setup | Yes | No |
| Installation complexity | High | Paste & go |

---

## Prerequisites

- A Shopify store on any plan (checkout pixel access requires Shopify Plus or the Customer Events feature)
- A Google Analytics 4 property
- A GA4 **Measurement Protocol API Secret** (takes ~2 minutes to create)

---

## Setup

### Step 1 — Create a Measurement Protocol API Secret

1. Open [Google Analytics](https://analytics.google.com) → **Admin**
2. Under **Data collection and modification** → **Data streams** → select your web stream
3. Scroll to **Measurement Protocol API secrets** → **Create**
4. Give it a nickname (e.g. `Shopify Pixel`) and copy the secret value

### Step 2 — Configure the script

Open `script.js` and update the three constants at the top:

```js
const GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';   // Your GA4 Measurement ID
const GA4_API_SECRET     = 'your_secret_here'; // The secret you just created
const DEBUG_MODE         = true;               // Set to false before going live
```

Your **Measurement ID** is found in GA4 → Admin → Data streams → your stream (it starts with `G-`).

### Step 3 — Add the pixel to Shopify

1. In your Shopify admin, go to **Settings → Customer events**
2. Click **Add custom pixel**
3. Name it (e.g. `GA4 Measurement Protocol`)
4. Paste the **entire contents** of `script.js` into the code editor
5. Click **Save**, then **Connect**

### Step 4 — Verify in GA4 DebugView

With `DEBUG_MODE = true`, all events appear in real time under **GA4 → Admin → DebugView**. Browse your store, add a product to cart, and confirm events are arriving before going live.

### Step 5 — Go live

Set `DEBUG_MODE = false` in the script, save, and reconnect the pixel in Shopify. DebugView events will stop; data will flow into standard GA4 reports within 24–48 hours.

---

## Configuration Reference

| Constant | Default | Description |
|---|---|---|
| `GA4_MEASUREMENT_ID` | `'G-XXXXXXXXXX'` | Your GA4 property's Measurement ID |
| `GA4_API_SECRET` | `'...'` | Measurement Protocol API secret |
| `DEBUG_MODE` | `true` | Enables GA4 DebugView; **set to `false` in production** |
| `SESSION_TIMEOUT_MS` | `1800000` (30 min) | Inactivity threshold for a new session |

---

## Events Tracked

### Standard GA4 Ecommerce Events

| Shopify Event | GA4 Event | Key Parameters |
|---|---|---|
| `page_viewed` | `page_view` | `page_location`, `page_title`, `page_referrer` |
| `product_viewed` | `view_item` | `currency`, `value`, `items` |
| `collection_viewed` | `view_item_list` | `item_list_id`, `item_list_name`, `items` |
| `search_submitted` | `search` | `search_term` |
| `product_added_to_cart` | `add_to_cart` | `currency`, `value`, `items` |
| `product_removed_from_cart` | `remove_from_cart` | `currency`, `value`, `items` |
| `cart_viewed` | `view_cart` | `currency`, `value`, `items` |
| `checkout_started` | `begin_checkout` | `currency`, `value`, `coupon`, `items` |
| `checkout_shipping_info_submitted` | `add_shipping_info` | `shipping_tier`, `coupon`, `items` |
| `payment_info_submitted` | `add_payment_info` | `currency`, `value`, `coupon`, `items` |
| `checkout_completed` | `purchase` | `transaction_id`, `value`, `tax`, `shipping`, `discount`, `coupon`, `items` |

### Custom GA4 Events

| Shopify Event | GA4 Event | Notes |
|---|---|---|
| `checkout_contact_info_submitted` | `checkout_contact_info` | Checkout funnel step |
| `checkout_address_info_submitted` | `checkout_address_info` | Checkout funnel step |
| `alert_displayed` | `alert_displayed` | Checkout friction detection |
| `ui_extension_errored` | `ui_extension_errored` | Third-party app error monitoring |
| `clicked` | `dom_clicked` | Click coordinates + element metadata |
| `form_submitted` | `dom_form_submitted` | Form structure only — no field values |
| `input_focused` | `dom_input_focused` | Field-level attention tracking |
| `input_changed` | `dom_input_changed` | Field interaction tracking |
| `input_blurred` | `dom_input_blurred` | Field abandonment / dwell time |

> **Note on DOM events:** `clicked`, `input_focused`, `input_changed`, and `input_blurred` can fire at high volume on busy stores. If you approach GA4's event quota limits, consider removing these events from the script.

---

## How It Works

- **Client ID** — Generated in the format `timestamp.random` and persisted in `localStorage` so the same user is recognized across sessions, matching GA4's native client ID format.
- **Session ID** — Stored in `sessionStorage` with a 30-minute inactivity timeout, replicating GA4's session logic.
- **Deduplication** — Each event gets a deterministic ID (djb2 hash of name + timestamp + product ID). Duplicate IDs within the same page session are silently dropped.
- **PII safety** — Form `input_changed` and `form_submitted` events send field names and types only — never field values — to avoid capturing emails, passwords, or payment data.
- **Navigation safety** — All `fetch` calls use `keepalive: true` so events are not lost when the user navigates away before the request completes.

---

## Troubleshooting

**Events not appearing in DebugView**
- Confirm `DEBUG_MODE = true` in the script
- Check that the pixel status shows **Connected** in Shopify → Settings → Customer events
- Open your browser's Network tab and filter for `mp/collect` — you should see POST requests on page load

**`purchase` events are duplicated**
- This script uses `checkout.order.id` as `transaction_id`. Ensure no other GA4 integration (e.g. a native Shopify GA4 integration) is also sending `purchase` events to the same property.

**Events fire but no data in GA4 reports**
- Standard reports have a 24–48 hour delay. Use DebugView for real-time validation.
- Confirm your Measurement ID matches the stream where you created the API secret.

---

## Production Checklist

- [ ] `GA4_MEASUREMENT_ID` updated with your `G-XXXXXXXXXX` value
- [ ] `GA4_API_SECRET` updated with your Measurement Protocol secret
- [ ] `DEBUG_MODE` set to `false`
- [ ] Events validated in GA4 DebugView before going live
- [ ] No other GA4 integration sending duplicate `purchase` events to the same property
- [ ] Pixel status shows **Connected** in Shopify

---

## Packaging & Delivery Recommendation

This script is a **single-file, paste-and-go install** — no build step, no npm, no dependencies. The recommended delivery approach matches that simplicity:

### Recommended: GitHub Releases

1. Host the repo publicly on GitHub with `script.js` and this `README.md` at the root
2. For each version, create a **GitHub Release** (e.g. `v1.1.0`) and attach `script.js` as a release asset
3. Users download the release asset directly and paste the contents into Shopify

This gives you:
- A stable, versioned download URL per release
- A clear changelog via release notes
- A "raw" GitHub URL users can `curl` or open directly

### What NOT to do

- **Don't publish to npm** — this script has no module exports and runs only in Shopify's sandboxed pixel environment
- **Don't add a build/bundle step** — it would add friction with zero benefit for a single-file script
- **Don't distribute via a Shopify app** — that requires app review and ongoing maintenance; a GitHub release is faster and free

### Optional: one-click copy button

If you want a smoother UX, add a GitHub Actions workflow that generates a `script.min.js` (whitespace-stripped, not obfuscated) alongside the readable `script.js` in each release. Users who want the smallest possible paste can use the minified version.
