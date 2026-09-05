# Shopify Conversion Tracking — Plantillas

Plantillas listas para producción que instrumentan una tienda Shopify con
seguimiento de conversiones. Cada archivo es una plantilla con **placeholders**:
se copia, se reemplazan los IDs de la tienda/cuenta y se instala.

**Estado actual:** GA4 implementado. Google Ads y Meta CAPI en el roadmap
(ver [Alcance](#alcance-y-roadmap)).

---

## Archivos

| Archivo | Dónde se instala | Qué hace |
|---|---|---|
| `ga4-head-tag.liquid` | `theme.liquid`, dentro de `<head>` | Inicializa gtag.js para **identidad** GA4 en un dataLayer aislado. No envía eventos de ecommerce. |
| `ga4-custom-pixel.js` | Shopify → Settings → Customer events → Custom pixel | Envía **todos** los eventos (storefront + checkout + DOM) a GA4 vía `gtag('event', …)`. |
| `google-ads-runbook.md` | — (procedimiento) | Runbook para replicar la configuración de Google Ads vía el canal Google & YouTube. |

Los dos son independientes: el pixel funciona sin el head tag, pero el head tag
mejora la atribución de identidad en el storefront.

---

## Prerequisitos

- Una tienda Shopify con acceso a **Customer Events** (Custom Pixels)
- Una propiedad de Google Analytics 4 con un stream web
- El **Measurement ID** del stream (empieza con `G-`)

---

## Setup

### Paso 1 — Instalar el head tag

1. Shopify admin → **Online Store → Themes → Edit code**
2. Abre `layout/theme.liquid`
3. Pega el contenido de `ga4-head-tag.liquid` dentro de `<head>`
4. Reemplaza el placeholder:

```liquid
{%- assign ga4_measurement_id = 'G-XXXXXXXXXX' -%}
```

El Measurement ID está en **GA4 → Admin → Data streams → tu stream web**.

> El tag usa un dataLayer aislado (`gaIdentityLayer`) a propósito: así no recibe
> el broadcast de eventos de Google Ads y no duplica conversiones.

### Paso 2 — Configurar el Custom Pixel

Abre `ga4-custom-pixel.js` y actualiza las dos constantes del inicio:

```js
const GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX'; // Tu GA4 Measurement ID
const DEBUG_MODE         = false;          // true solo para validar en DebugView
```

Usa el **mismo** Measurement ID que en el head tag.

### Paso 3 — Instalar el pixel en Shopify

1. Shopify admin → **Settings → Customer events**
2. **Add custom pixel**
3. Nómbralo (ej. `GA4 Tracking`)
4. Pega el contenido **completo** de `ga4-custom-pixel.js`
5. **Save** y luego **Connect**

### Paso 4 — Validar en DebugView

Pon `DEBUG_MODE = true`, guarda y reconecta el pixel. Los eventos aparecen en
tiempo real en **GA4 → Admin → DebugView**. Navega la tienda, agrega al carrito
y confirma que llega **un evento por acción, sin duplicados**.

### Paso 5 — Producción

Pon `DEBUG_MODE = false`, guarda y reconecta el pixel. Los datos aparecen en los
informes estándar de GA4 en 24–48 horas.

---

## Referencia de configuración

### `ga4-head-tag.liquid`

| Variable | Default | Descripción |
|---|---|---|
| `ga4_measurement_id` | `'G-XXXXXXXXXX'` | Measurement ID del stream GA4 |

Flags fijados en el `config` (no son placeholders):

| Flag | Valor | Motivo |
|---|---|---|
| `send_page_view` | `true` | Page view de identidad en el storefront |
| `allow_google_signals` | `false` | Sin señales de Google para publicidad |
| `allow_ad_personalization_signals` | `false` | Sin personalización de anuncios |

### `ga4-custom-pixel.js`

| Constante | Default | Descripción |
|---|---|---|
| `GA4_MEASUREMENT_ID` | `'G-XXXXXXXXXX'` | Measurement ID del stream GA4 |
| `DEBUG_MODE` | `false` | Activa GA4 DebugView; **`false` en producción** |

El pixel carga su propia instancia de gtag.js con `send_page_view: false` — el
`page_view` se dispara manualmente desde la suscripción `page_viewed` para
controlar el timing e incluir el contexto completo del evento de Shopify.

---

## Eventos enviados

### Ecommerce estándar de GA4

| Evento Shopify | Evento GA4 | Parámetros clave |
|---|---|---|
| `page_viewed` | `page_view` | `page_location`, `page_title`, `page_referrer`, `page_load_time` |
| `product_viewed` | `view_item` | `currency`, `value`, `items`, `page_load_time` |
| `collection_viewed` | `view_item_list` | `item_list_id`, `item_list_name`, `items`, `page_load_time` |
| `search_submitted` | `search` | `search_term` |
| `product_added_to_cart` | `add_to_cart` | `currency`, `value`, `items` |
| `product_removed_from_cart` | `remove_from_cart` | `currency`, `value`, `items` |
| `cart_viewed` | `view_cart` | `currency`, `value`, `items`, `page_load_time` |
| `checkout_started` | `begin_checkout` | `currency`, `value`, `coupon`, `items` |
| `checkout_shipping_info_submitted` | `add_shipping_info` | `shipping_tier`, `coupon`, `items` |
| `payment_info_submitted` | `add_payment_info` | `currency`, `value`, `coupon`, `items` |
| `checkout_completed` | `purchase` | `transaction_id`, `value`, `tax`, `shipping`, `discount`, `coupon`, `items` |

### Eventos personalizados

| Evento Shopify | Evento GA4 | Notas |
|---|---|---|
| `checkout_contact_info_submitted` | `checkout_contact_info` | Paso del funnel de checkout |
| `checkout_address_info_submitted` | `checkout_address_info` | Paso del funnel de checkout |
| `alert_displayed` | `alert_displayed` | Detección de fricción en checkout |
| `ui_extension_errored` | `ui_extension_errored` | Monitoreo de errores de apps de terceros |
| `clicked` | `dom_clicked` | Coordenadas del clic + metadata del elemento |
| `form_submitted` | `dom_form_submitted` | Solo estructura del form — nunca valores |
| `input_focused` | `dom_input_focused` | Atención a nivel de campo |
| `input_changed` | `dom_input_changed` | Interacción con el campo |
| `input_blurred` | `dom_input_blurred` | Abandono / dwell time del campo |

> **Sobre los eventos DOM:** `clicked`, `input_focused`, `input_changed` e
> `input_blurred` pueden dispararse en alto volumen en tiendas con mucho
> tráfico. Si te acercas a los límites de cuota de GA4, elimina esas
> suscripciones del pixel.

---

## Cómo funciona

- **Identidad (client ID / session ID)** — Los gestiona gtag.js de forma nativa;
  el pixel no los calcula ni los persiste manualmente.
- **Page load time** — Se mide con `performance.now()` entre la inicialización
  del pixel y cada navegación. El tiempo transcurrido (segundos, 2 decimales) se
  envía como `page_load_time` en el primer evento tras cada navegación; los
  eventos posteriores en la misma página lo omiten. En la primera carga incluye
  el bootstrap del pixel; en navegaciones SPA refleja el tiempo de transición
  percibido.
- **Deduplicación** — Cada evento recibe un `event_id` determinista (hash djb2 de
  nombre + timestamp + discriminador). Los IDs repetidos dentro de la misma
  sesión de página se descartan en memoria, y el `event_id` se pasa a gtag como
  hint para la deduplicación del lado del servidor.
- **Seguridad de PII** — `input_changed` y `form_submitted` envían solo nombres y
  tipos de campo, nunca valores, para no capturar emails, contraseñas ni datos
  de pago.
- **Aislamiento del head tag** — `gaIdentityLayer` mantiene la identidad GA4 fuera
  del dataLayer que usa Google Ads, evitando doble conteo de conversiones.
- **Fallo silencioso** — La carga de gtag.js está envuelta en `try/catch`: el
  pixel nunca debe bloquear el storefront.

---

## Troubleshooting

**No aparecen eventos en DebugView**
- Confirma `DEBUG_MODE = true` y que reconectaste el pixel después de guardar
- Verifica que el estado del pixel sea **Connected** en Shopify → Settings → Customer events
- Abre la pestaña Network y filtra por `/g/collect` — deberías ver requests al cargar la página

**Eventos `purchase` duplicados**
- El pixel usa `checkout.order.id` como `transaction_id`. Asegúrate de que ninguna
  otra integración GA4 (ej. la integración nativa de Shopify, o Google Ads con
  conversion linker) esté enviando `purchase` a la misma propiedad.

**Eventos duplicados en general**
- Revisa que el head tag y el pixel no estén configurados con `send_page_view: true`
  ambos apuntando al mismo evento. El pixel usa `send_page_view: false` a propósito.

**Los eventos se disparan pero no hay datos en los informes**
- Los informes estándar tienen 24–48 h de retraso. Usa DebugView para validar en tiempo real.
- Confirma que el Measurement ID del head tag y el del pixel sean el mismo.

---

## Checklist de producción

- [ ] `ga4_measurement_id` en `ga4-head-tag.liquid` reemplazado
- [ ] `GA4_MEASUREMENT_ID` en `ga4-custom-pixel.js` reemplazado con el **mismo** valor
- [ ] `DEBUG_MODE` en `false`
- [ ] Eventos validados en GA4 DebugView, uno por acción, sin duplicados
- [ ] Ninguna otra integración GA4 enviando `purchase` duplicados
- [ ] Pixel en estado **Connected** en Shopify
- [ ] Ningún ID real commiteado — los archivos del repo quedan con placeholders

---

## Alcance y roadmap

Este repositorio es la base de plantillas de conversión para tiendas Shopify.

| Plataforma | Estado | Archivos |
|---|---|---|
| Google Analytics 4 | Implementado | `ga4-head-tag.liquid`, `ga4-custom-pixel.js` |
| Google Ads | Documentado — sin código | `google-ads-runbook.md` |
| Meta CAPI | Pendiente | — |

Google Ads y Meta se gestionan desde apps de Shopify (**Google & YouTube** y
**Facebook & Instagram**), que ya miden **server-side**. Para esas plataformas el
entregable de este repo es un procedimiento replicable, no un tag: un
`gtag('event', 'conversion')` propio sería solo-navegador y duplicaría las
conversiones de la app.

**Regla del repo:** ningún archivo versionado contiene IDs, secretos ni tokens
reales. Todos los valores específicos de cuenta viven como placeholders
(`G-XXXXXXXXXX`, `AW-XXXXXXXXX`, etc.) y se reemplazan al instalar en cada tienda.
