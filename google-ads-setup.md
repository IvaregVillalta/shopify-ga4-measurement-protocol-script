# Google Ads — Setup replicable

Replica la configuración de conversiones de Google Ads que corre hoy en
**Descorcha** (`descorcha.com`), tomada como tienda de referencia.

> **Google Ads no se instala con código en este repo.** Todo se gestiona desde
> el canal de ventas **Google & YouTube**. La etiqueta `AW-…` la instala la app
> automáticamente al vincular la cuenta de Ads — no se pega ningún tag a mano en
> `theme.liquid`. Si encontrás un `AW-` hardcodeado en un tema, es un tag viejo
> y probablemente esté duplicando conversiones.

---

## Modelo de la referencia

| | |
|---|---|
| Canal | Google & YouTube (sales channel) |
| Modo del pixel | **Servidor + Web** |
| Nivel de datos | **Optimizado** (recomendado por Shopify) |
| Medición de conversiones | On |
| Conversiones mejoradas | **Activada** |
| Segmentación por lista de clientes | Desactivada |
| Etiquetas manuales (`GT-…`) | Ninguna |

Server-side + enhanced conversions es la razón por la que no hace falta un
`gtag('event', 'conversion')` propio: la app ya manda la conversión desde el
servidor de Shopify, que sobrevive a ad blockers e ITP.

---

## Valores por tienda

Cada tienda tiene los suyos. Anotalos antes de empezar:

| Valor | Formato | Dónde se obtiene |
|---|---|---|
| Cuenta de Google | email | La que administra el Ads de esa tienda |
| ID de Google Ads | `XXXXXXXXXX` (10 díg.) | Google Ads → arriba a la derecha |
| Nombre de la cuenta Ads | texto | Convención de la referencia: `CL_<Tienda>` |
| Etiqueta de Google | `AW-XXXXXXXXXXX` | **No se elige** — la crea la app al vincular |
| GA4 Measurement ID | `G-XXXXXXXXXX` | GA4 → Admin → Data streams |

---

## Pasos

### 1 — Instalar el canal

Shopify admin → **Configuración → Canales de ventas** → agregar **Google & YouTube**.

### 2 — Conectar la cuenta de Google

App **Google & YouTube → Configuración → Servicios de Google → Conectar**.

Usá la cuenta que ya administra el Google Ads de esa tienda. La app pide permisos
sobre Merchant Center y Ads.

### 3 — Vincular Google Ads

En **Servicios de Google conectados**, vinculá la cuenta de Ads de la tienda.

Al vincular, la app instala la etiqueta `AW-…` sola. Verificá que aparezca en
**Configuración adicional de la medición de conversiones → Etiquetas de Google**,
con la cuenta de Ads listada en "Servicios conectados".

### 4 — Activar medición de conversiones

**Configuración → Medición de conversiones → Activada**.

### 5 — Mapear los eventos

**Configuración adicional de la medición de conversiones → Configuración de
eventos de conversión**. La referencia usa 7:

| Evento Shopify | Destino en Google Ads |
|---|---|
| Tramitación de la compra completada | Purchase |
| Tramitación de la compra iniciada | Begin checkout |
| Se ha añadido al carrito | Add to cart |
| Página vista | Page view |
| Producto visto | View item |
| Búsqueda enviada | Search |
| Información para pagos enviada | Add payment info |

> En la tienda de referencia esos tres apuntan a acciones llamadas
> `Google Shopping App <evento> (1)`. **El sufijo `(1)` es correcto ahí** — son las
> que registran datos. Ver [Hallazgos verificados](#hallazgos-verificados).

### 6 — Activar conversiones mejoradas

**Configuración adicional de la medición de conversiones → Conversiones
mejoradas → Activada**.

Manda datos hasheados del cliente (email, teléfono) para atribuir conversiones que
de otro modo se perderían. Requiere que las políticas de privacidad de la tienda lo
cubran.

### 7 — Nivel de datos del pixel

**Configuración → Eventos del cliente → Google & YouTube → Optimizado**.

### 8 — Segmentación por lista de clientes

La referencia la tiene **desactivada**. Dejala así salvo que esa tienda haga
remarketing con listas propias.

---

## Verificación

1. **Eventos del cliente** → el pixel Google & YouTube debe mostrar `Servidor` + `Web`.
2. **Etiquetas de Google** → debe listar el `AW-` con la cuenta de Ads vinculada.
3. **Google Ads → Herramientas → Conversiones** → las acciones deben registrar
   actividad "Reciente" dentro de las 24 h de la primera compra.
4. Con la extensión **Google Tag Assistant** sobre el storefront, confirmá que el
   `AW-` dispare **una sola vez** por conversión.

---

## Hallazgos verificados

Auditoría de la cuenta de Ads de referencia (`CL_Descorcha`), últimos 30 días
al 2026-09-05. Resuelve las dos dudas que estaban abiertas.

### Las acciones con sufijo `(1)` son las buenas

Contrario a lo que decía antes este runbook: **no hay que mapear a los nombres sin
sufijo.** Los datos de la cuenta:

| Acción | Estado | Conversiones |
|---|---|---|
| `Google Shopping App Add Payment Info` | Needs attention | **0** |
| `Google Shopping App Add Payment Info (1)` | Active | **3.280** |
| `Google Shopping App View Item (1)` | Needs attention | 31.044 |
| `Google Shopping App Search (1)` | Needs attention | 7.021 |

Solo Add Payment Info tiene par duplicado, y **la muerta es la que no lleva
sufijo**. De View Item y Search no existe versión sin sufijo entre las activas.

En una tienda nueva este problema no se reproduce: los nombres los crea la app al
vincular, y el `(1)` aparece solo cuando ya existía una acción homónima. **No
copies los nombres literales** — dejá que la app cree los suyos y mapeá a esos.

### Simprosys no duplica el tag: descartado

La cuenta tiene **una sola etiqueta de Google** (un `AW-` y su `GT-`), apuntando a
la cuenta de Ads de la tienda. Simprosys no
inyecta una segunda etiqueta de Ads. El riesgo de doble conteo por esa vía queda
descartado.

### Lo que sí conviene corregir en la referencia

**Valor inflado en micro-conversiones.** Las acciones intermedias llevan valor
monetario que no es facturación:

| Acción | Conversiones | Valor |
|---|---|---|
| Purchase (Primary) | 1.423 | 201.253 |
| Google Shopping App View Item (1) | 31.044 | 654.949 |
| Google Shopping App Add Payment Info (1) | 3.280 | 218.456 |
| **Total cuenta** | 141.037 | **1.081.292** |

El valor total de la cuenta es ~5x la facturación real. No corrompe el bidding
—todas son Secundarias y están fuera de los objetivos a nivel de cuenta, solo
`Purchase` es Principal— pero sí inutiliza cualquier lectura de "valor de
conversión" a nivel cuenta. En una tienda nueva, dejá las micro-conversiones **sin
valor monetario**.

**Calidad del tag: Urgent.** El diagnóstico del tag reporta 3 problemas:

1. La configuración de seguridad del sitio está **bloqueando recursos del tag**
   (CSP del tema)
2. **Hay páginas sin taggear** — el tag no está en todo el sitio
3. Dominios adicionales detectados que faltan en la configuración

Los tres afectan la medición, y explican los `Needs attention` de la tabla de
conversiones. **Resolvelos en la referencia antes de tomarla como modelo**, o al
menos revisá el diagnóstico del tag en cada tienda nueva después de instalar
(Herramientas → Administrador de datos → la etiqueta → Tag quality).

**`Add to cart` y `Begin checkout` cuentan "One"** (una conversión por clic) en vez
de "Every". Para embudo de ecommerce lo esperable es "Every". `Purchase` sí está en
"Every", que es lo correcto.

## Relación con los otros archivos

Google Ads y GA4 son independientes y no comparten etiqueta:

| | Quién mide | Archivo |
|---|---|---|
| Google Ads | App Google & YouTube (`AW-…`) | — (config, no código) |
| GA4 | Custom pixel + head tag (`G-…`) | `customer-events.js`, `head-tag.liquid` |

`head-tag.liquid` aísla GA4 en `gaIdentityLayer` justamente para que la identidad
de GA4 no entre al `dataLayer` que usa Google Ads. Instalar los dos no genera
doble conteo.
