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

> Los nombres exactos varían por cuenta: la app puede crearlos con sufijo `(1)`.
> Mapeá a los que la app creó en esa cuenta, no a una lista fija — ver
> [Reglas del método](#reglas-del-método).

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
5. **Herramientas → Administrador de datos → la etiqueta → Tag quality.** Si no
   está en verde, la medición está degradada — ver [Reglas del método](#reglas-del-método).

---

## Reglas del método

Lecciones de las tiendas ya configuradas, en forma de regla aplicable. Cada
tienda nueva puede agregar o corregir una — ver [Registro](#registro-de-mejoras).

### No copies los nombres de las acciones de conversión

La app crea las acciones al vincular la cuenta. Si en la cuenta ya existía una con
el mismo nombre, Google le agrega un sufijo `(1)`, así que **los nombres varían
entre cuentas**. Mapeá siempre a las acciones que la app creó en *esa* cuenta, no
a una lista fija.

Al mapear, verificá cuál del par registra datos: abrí **Herramientas →
Conversiones** y mirá la columna de conversiones de los últimos 30 días. La que
está en cero es la huérfana, sin importar cómo se llame.

### Las micro-conversiones van sin valor monetario

Solo `Purchase` debe llevar valor. Si `View item`, `Add payment info` o `Search`
llevan valor, el "valor de conversión" a nivel cuenta deja de significar algo
—puede multiplicar por varias veces la facturación real— y cualquier informe que
lo use queda inservible.

Mantenelas además como **Secundarias** y fuera de los objetivos a nivel de cuenta,
para que no entren al Smart Bidding. Solo `Purchase` va como **Principal**.

### Conteo: `Every` para compra, `One` para el resto

`Purchase` cuenta **cada** conversión (un cliente que compra dos veces son dos
ventas). Los pasos del embudo cuentan **una** por clic.

### Revisá la calidad del tag después de instalar

**Herramientas → Administrador de datos → la etiqueta → Tag quality.** Si aparece
en `Urgent` o `Needs attention`, la medición está degradada aunque las conversiones
entren. Los tres problemas que aparecen seguido:

- **El CSP del tema bloquea recursos del tag.** Es el único que degrada la medición
  de verdad, y **se propaga entre tiendas que comparten tema**. El diagnóstico de
  Google no dice qué directivas faltan: hay que comparar el CSP del tema contra lo
  que gtag.js necesita.
- **Páginas sin taggear.** Revisá *cuáles* antes de preocuparte (ver abajo).
- **Dominios adicionales detectados.** Otro dominio o locale carga el mismo tag.
  Decisión de negocio: agregarlo a la configuración o separar el tag por mercado.

### "Páginas sin taggear" es casi siempre ruido

Las URLs de `/checkouts/` van a figurar sin taggear **siempre**: Shopify bloquea
scripts de terceros en el checkout, y por eso justamente la app mide server-side.
Lo mismo con archivos `.js`, endpoints como `/cart/clear` y redirecciones.

Filtrá esas antes de sacar conclusiones. Lo que sí merece atención son páginas
reales de catálogo o locales de otros mercados (`/br/`, `/mx/`).

---

## Registro de mejoras

Una línea por tienda configurada, con lo que se aprendió. El objetivo es que el
runbook mejore con cada corrida.

| Fecha | Tienda | Qué se aprendió |
|---|---|---|
| 2026-09-05 | Descorcha (referencia) | Método inicial. Los nombres de las acciones varían por cuenta; las micro-conversiones traían valor monetario; el CSP del tema degradaba el tag. |

## Relación con los otros archivos

Google Ads y GA4 son independientes y no comparten etiqueta:

| | Quién mide | Archivo |
|---|---|---|
| Google Ads | App Google & YouTube (`AW-…`) | — (config, no código) |
| GA4 | Custom pixel + head tag (`G-…`) | `customer-events.js`, `head-tag.liquid` |

`head-tag.liquid` aísla GA4 en `gaIdentityLayer` justamente para que la identidad
de GA4 no entre al `dataLayer` que usa Google Ads. Instalar los dos no genera
doble conteo.
