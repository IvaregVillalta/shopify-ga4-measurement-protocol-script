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

> Los últimos tres apuntan, en la tienda de referencia, a acciones de conversión
> llamadas `Google Shopping App <evento> (1)`. Ver [Antes de replicar](#antes-de-replicar).

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

## Antes de replicar

Dos cosas de la tienda de referencia que **no** conviene copiar sin revisar. Ambas
están sin verificar al día de hoy:

**Acciones de conversión duplicadas.** Tres eventos apuntan a acciones con sufijo
`(1)` — `Google Shopping App View Item (1)`, `… Search (1)`, `… Add Payment Info (1)`.
Ese sufijo es lo que crea Google Ads cuando ya existe una acción con el mismo
nombre, así que probablemente haya pares duplicados en la cuenta. Revisalo en
**Google Ads → Herramientas → Conversiones** antes de tomar este mapeo como canon,
y mapeá a las acciones sin sufijo si las duplicadas resultan ser huérfanas.

**Simprosys Google Shopping Feed.** La tienda de referencia lo tiene instalado y
activo como pixel. Simprosys puede inyectar su propio tag de conversión y
remarketing de Google Ads, lo que duplicaría el conteo contra la etiqueta de la
app. Si la tienda nueva también lo usa, revisá en su configuración que el
conversion tracking propio esté **apagado**, y dejá la medición solo en manos de
Google & YouTube.

---

## Relación con los otros archivos

Google Ads y GA4 son independientes y no comparten etiqueta:

| | Quién mide | Archivo |
|---|---|---|
| Google Ads | App Google & YouTube (`AW-…`) | — (config, no código) |
| GA4 | Custom pixel + head tag (`G-…`) | `customer-events.js`, `head-tag.liquid` |

`head-tag.liquid` aísla GA4 en `gaIdentityLayer` justamente para que la identidad
de GA4 no entre al `dataLayer` que usa Google Ads. Instalar los dos no genera
doble conteo.
