# Google Ads — Setup replicable

Replica la configuración de conversiones de Google Ads que corre hoy en
**Descorcha** (`descorcha.com`), tomada como tienda de referencia.

Hay **dos caminos**, y no son equivalentes:

| | Camino A — canal Google & YouTube | Camino B — Custom Pixel |
|---|---|---|
| Cómo mide | Server-side | Solo navegador |
| Sobrevive a ad blockers / ITP | Sí | No |
| Archivo | — (config, no código) | `google-ads-custom-pixel.js` |
| Cuándo usarlo | **Siempre que se pueda** | Solo si el canal no está disponible |

**El camino A es el preferido y el default de este runbook** (pasos 1–8). La
etiqueta `AW-…` la instala la app al vincular la cuenta — no se pega ningún tag a
mano. Si encontrás un `AW-` hardcodeado en un tema, es un tag viejo y
probablemente esté duplicando conversiones.

El camino B existe porque el A puede quedar bloqueado: la cuenta de Google pierde
el acceso a la app, la app no carga, el cliente no puede completar el OAuth. Ver
[Camino B](#camino-b--conversiones-por-custom-pixel). No corras los dos a la vez.

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

## Camino B — conversiones por Custom Pixel

Usalo **solo** si el canal Google & YouTube no es una opción. Entregable:
`google-ads-custom-pixel.js`.

Esto contradice la regla histórica del repo ("Google Ads es configuración, no
código"), y con razón: esa regla asume que la app funciona. Cuando no funciona,
un tag de tema mide el storefront y **no llega al checkout**, así que `Purchase`
queda en cero. Un Custom Pixel sí corre en el checkout. Se mide con pérdida, que
es infinitamente mejor que no medir.

### B1 — Conseguir la etiqueta y los labels

Necesitás el `AW-…` y un **conversion label** por evento. Si la cuenta ya tenía un
GTM, salen del contenedor sin pedirle nada a nadie:

```
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-XXXXXXX" > gtm.js
python3 -c "import re,sys;s=open('gtm.js').read();i=s.find('\"tags\":');print(s[i:i+3000])"
```

Cada tag `__awct` trae `vtp_conversionId` (la etiqueta `AW-`) y
`vtp_conversionLabel`. Para saber **qué evento es cada label**, mirá `predicates`
y `rules` del mismo archivo: `rules` mapea condiciones a índices del array `tags`.

### B2 — Reutilizar las acciones existentes, no crear nuevas

Si ya existen acciones en la cuenta, apuntá el pixel a sus labels. Conserva el
histórico, los goals y el mapeo de campañas. Crear nuevas obliga a re-mapear todo
y deja las viejas compitiendo.

### B3 — Capturar el click id vos mismo

**Este es el paso que se olvida y rompe la atribución en silencio.** El
Conversion Linker que escribía la cookie `_gcl_aw` vivía dentro del GTM. Al
sacarlo, nadie captura el `gclid` de la URL de aterrizaje.

Y hay un segundo problema encima: el Custom Pixel corre en un **iframe sandbox con
otro origen**, así que gtag.js no ve las cookies del dominio de la tienda aunque
existan.

El pixel resuelve las dos cosas:

1. Se suscribe a `page_viewed`, lee `gclid` / `gbraid` / `wbraid` de la URL y lo
   guarda con `api.browser.cookie.set` en el dominio de la tienda.
2. Antes de cada conversión reconstruye `_gcl_aw` dentro del sandbox en el formato
   de Google (`GCL.<segundos>.<click id>`), que es el que gtag ya sabe leer.

Sin esto las conversiones **entran igual**, pero sin campaña atribuida. Para el
Smart Bidding eso es casi tan malo como no medir, y no genera ningún error
visible: es la falla más cara de este camino.

### B4 — Verificar, sabiendo que el pixel es opaco desde afuera

El Custom Pixel corre en un iframe sandbox: **su consola no llega a la pestaña y
sus requests no aparecen en el network del tab**. No vas a ver el hit. Cualquier
verificación tiene que pasar por algo que el pixel escriba en el dominio de la
tienda.

Por eso el pixel deja un rastro en la cookie `_ads_pixel_diag` mientras
`DEBUG_MODE` está en `true`. Se lee desde la consola del storefront:

```js
document.cookie.split('; ').find(c => c.startsWith('_ads_pixel_diag='))
```

Los tres estados que importan:

| Valor | Significa |
|---|---|
| `bridged\|_gcl_aw=GCL.…` | Encontró una cookie de linker ya existente y la copió |
| `rebuilt\|_gcl_aw visible=true …` | La reconstruyó desde el click id capturado, y **confirmó que quedó legible dentro del sandbox** |
| `no-click-id\|` | No hay click id — la conversión entrará sin atribuir |
| `sent\|<evento> linker=GCL.…` | La conversión salió con el linker adjunto |

**Cuidado con validar la rama equivocada.** Si el GTM viejo sigue en el tema, su
Conversion Linker mantiene `_gcl_aw` viva y siempre vas a ver `bridged`. Eso no
prueba nada sobre el escenario real, que es *sin* GTM. Para forzar la rama que
va a correr en producción, borrá la cookie a mano y navegá **sin** `gclid`:

```js
document.cookie = '_gcl_aw=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
// luego navegá a otra página sin ?gclid= y volvé a leer _ads_pixel_diag
```

Tenés que ver `rebuilt` con `visible=true`. Ese `visible=true` es un read-back
real desde el `document.cookie` del sandbox: prueba que gtag.js **puede leerla**,
no solo que intentamos escribirla.

Secuencia completa de validación, en orden:

1. `/?gclid=TEST123` → aparece `_ads_pixel_click_id=gclid.<ts>.TEST123`
2. Borrás `_gcl_aw`, navegás sin gclid → `rebuilt | visible=true`
3. Agregás al carrito → `sent | add_to_cart linker=GCL.…`

Con eso queda probada la cadena entera menos `purchase`, que necesita un pedido
real. No hace falta probarlo aparte: pasa por la misma función `sendConversion`,
solo cambia el payload.

> Poné `DEBUG_MODE = false` al terminar. La cookie de diagnóstico deja de
> escribirse sola.

### B5 — Sacar el tag viejo en la misma pasada

El pixel y el GTM midiendo a la vez duplican las micro-conversiones. Sacá el
contenedor del tema y desactivá lo que sobre **en la misma sesión**.

Si no podés sacarlo en el momento, la mitigación es pasar las micro-conversiones
a **Secundarias**: siguen contando doble en los informes pero salen del Smart
Bidding, que es lo que realmente hace daño.

**Un GTM son dos bloques, no uno.** El script va en el `<head>`; el `<noscript>`
con el iframe `ns.html` va justo después de `<body>`. Es fácil sacar el primero y
dejar el segundo. El residual no duplica —solo corre con JavaScript deshabilitado,
donde el pixel tampoco corre— pero deja una petición inútil a un contenedor
huérfano. Sacá los dos.

**Revisá dónde queda el `<meta charset>`.** El navegador lo necesita dentro de los
primeros 1024 bytes del documento. Si el GTM estaba antes del charset y metés el
head tag de GA4 en su lugar, el charset se corre hacia abajo. Verificalo sobre el
HTML renderizado, no sobre el Liquid:

```
python3 -c "import sys;h=sys.stdin.read();i=h.lower().find('<meta charset');print(i,'OK' if 0<=i<1024 else 'FUERA')"
```

Lo prolijo es dejar el charset como primera línea del `<head>` y los tags después.

### B6 — Eventos y valor

Los mismos criterios del camino A: solo `Purchase` lleva valor y va como
Principal; `Add to cart` y `Begin checkout` van sin valor y como Secundarias.
`Purchase` además lleva `transaction_id` (el ID de pedido) para que Ads deduplique
si el cliente recarga la página de gracias.

Usá los eventos reales de Shopify (`checkout_completed`, `product_added_to_cart`,
`checkout_started`), nunca listeners de click sobre el texto del botón: eso cuenta
misclicks, se rompe al traducir el tema y produce cifras con decimales que no
corresponden a nada.

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

### Auditá el tema antes de instalar: puede haber un GTM midiendo Ads

Antes de tocar el canal, abrí `layout/theme.liquid` y buscá `GTM-`. Un contenedor
de Google Tag Manager pegado a mano puede estar disparando conversiones de Ads
del lado del navegador, y no se ve desde el admin de Shopify.

Para saber qué manda sin acceso a la cuenta de GTM, bajá el contenedor público y
mirá los tipos de tag:

```
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-XXXXXXX" > gtm.js
grep -oE '"function":"__[a-z0-9_]+"' gtm.js | sort | uniq -c
```

`__awct` es una conversión de Google Ads, `__awec` conversiones mejoradas,
`__gclidw` el conversion linker, `__gaawe`/`__googtag` serían GA4. El bloque
`"tags":[...]` del mismo archivo trae el `vtp_conversionId` (la etiqueta `AW-`) y
los `vtp_conversionLabel` de cada una.

**El orden importa.** Si el GTM es hoy la única medición de Ads, no lo saques
antes de que el canal esté midiendo: primero vinculá y confirmá en
**Ads → Conversiones** que las acciones nuevas registran actividad, y recién ahí
sacá el GTM del tema. Al revés dejás a las campañas sin señal para el Smart
Bidding; dejar los dos activos duplica el conteo.

> El `AW-` del GTM no coincide con el ID de cuenta de 10 dígitos y eso es normal:
> son cosas distintas. Una cuenta `XXX-XXX-XXXX` tiene su etiqueta `AW-XXXXXXXXXXX`.

**El síntoma que delata a un GTM en el tema:** en **Ads → Conversiones**, las
micro-conversiones registran y la compra está en **cero**, normalmente con estado
`Misconfigured`. Es la firma de un tag que vive en `theme.liquid`: mide bien el
storefront y no llega al checkout, porque Shopify no carga scripts de terceros en
`/checkouts/`. Si además el nombre de las acciones termina en `- GTM` o similar,
no queda duda de quién las creó.

Cuando la compra ya está en cero, el argumento del orden se invierte: no hay nada
que preservar en esa acción, así que esperar solo prolonga el gasto sin medición.
Las micro-conversiones sí se dejan de registrar al sacar el GTM, pero no deberían
estar en el Smart Bidding de todos modos.

### El head tag y el pixel de GA4 duplican `page_view`

`ga4-head-tag.liquid` sale con `send_page_view: true` y el Custom Pixel además
manda su propio `page_view` desde la suscripción `page_viewed`. En el storefront
eso son **dos `page_view` por carga**; en el checkout solo uno, porque el head tag
no llega ahí. El funnel queda sesgado.

En DebugView no se nota: solo el pixel manda `debug_mode`, así que el hit del head
tag no aparece. Se ve en la pestaña Network — el del head tag lleva `npa=1` y no
lleva `page_load_time` ni `event_id`.

Si no necesitás el page view de identidad, poné `send_page_view: false` en el head
tag: la identidad (client ID / session) la sigue estableciendo el `config`, y el
`page_view` queda solo en el pixel, que además trae el contexto de Shopify.

### Contá con que partes del admin no van a cargar

En una corrida real fallaron, en esta sesión, tres cosas distintas: la app Google
& YouTube quedó en blanco después de re-verificar la cuenta, el **editor de código
del tema** nunca llegó a renderizar, y Google Ads se colgó en el splash varias
veces. Ninguna era culpa de la configuración.

Consecuencias prácticas para planificar:

- **No asumas que vas a poder editar `theme.liquid`.** Tené listo el bloque exacto
  a borrar —con números de línea y los delimitadores— para pasárselo al cliente.
  Es un copy-paste de 30 segundos de su lado y desbloquea todo.
- **Ordená el trabajo para que lo frágil no bloquee lo demás.** El Custom Pixel se
  puede crear, guardar, conectar y validar entero sin tocar el tema. Dejá la
  edición del tema para el final.
- **Si algo no carga tras dos o tres intentos con enfoques distintos, no insistas.**
  Reportá el estado exacto, qué quedó a medias y qué riesgo abre. Es más útil que
  seguir reintentando.

Cuando el pixel ya está midiendo y el tag viejo sigue puesto, el estado
intermedio es tolerable: pasá las micro-conversiones a Secundarias y el doble
conteo deja de afectar decisiones.

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
| 2026-09-05 | M&T Market | Primera tienda por **camino B**. La app Google & YouTube quedó inservible (perdió el acceso y después cargaba en blanco), así que las conversiones se hicieron por Custom Pixel. El tema traía un GTM con 3 conversiones, todas Principales y sin valor, disparadas por clicks en el texto del botón; la compra esperaba un evento `purchase` del dataLayer que nadie empujaba y registraba **cero** mientras la cuenta gastaba. De ahí salieron el `AW-` y los tres labels. Hallazgos que se llevan a la próxima tienda: sacar el GTM se lleva el Conversion Linker y el sandbox no ve las cookies de la tienda, así que el pixel captura el click id él mismo; el pixel es opaco desde afuera, por eso deja el rastro en `_ads_pixel_diag`; y hay que forzar la rama `rebuilt` para validar el escenario real. El editor de código del tema nunca cargó: el bloque GTM lo borró el cliente. |

## Relación con los otros archivos

Google Ads y GA4 son independientes y no comparten etiqueta:

| | Quién mide | Archivo |
|---|---|---|
| Google Ads (camino A) | App Google & YouTube (`AW-…`), server-side | — (config, no código) |
| Google Ads (camino B) | Custom pixel (`AW-…`), solo navegador | `google-ads-custom-pixel.js` |
| GA4 | Custom pixel + head tag (`G-…`) | `ga4-custom-pixel.js`, `ga4-head-tag.liquid` |

Los dos caminos de Google Ads son **excluyentes**. Correr ambos duplica el conteo.

`ga4-head-tag.liquid` aísla GA4 en `gaIdentityLayer` justamente para que la identidad
de GA4 no entre al `dataLayer` que usa Google Ads. Instalar los dos no genera
doble conteo.
