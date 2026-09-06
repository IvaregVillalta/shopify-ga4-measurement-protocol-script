# CLAUDE.md

Este repo se usa para **configurar el tracking de conversiones en tiendas
Shopify**, replicando la configuración de una tienda de referencia. No es una
librería: los archivos son plantillas y procedimientos, y el trabajo real ocurre
en el navegador contra el admin de Shopify y las cuentas de Google/Meta.

Tienda de referencia: **Descorcha** (`descorcha-cl`), de donde salió el método.

## Cómo se pide una configuración

El usuario dice algo como *"tengo la sesión iniciada, configurá GA4 y Google Ads
en la tienda X"*. Para arrancar hacen falta:

- **El handle de la tienda** (`descorcha-cl`, no la URL del storefront)
- **El ID de Google Ads** y **el Measurement ID de GA4** de esa tienda, o el aviso
  de que hay que crearlos
- Las sesiones iniciadas en Chrome para Shopify admin, Google Ads y GA4

## Lo que hay que saber del navegador

**Las pestañas del usuario no son visibles.** `tabs_context_mcp` solo lista el
grupo de pestañas propio de Claude; una pestaña abierta por el usuario no aparece.
Lo que sí se comparte son las **sesiones**: `admin.shopify.com` redirige solo a la
tienda logueada. Así que no pidas "abrí la tienda" — pedí el handle y navegá vos a
`https://admin.shopify.com/store/<handle>/...`.

El admin de Shopify es lento. Después de navegar, esperá y volvé a capturar antes
de concluir que algo no está: la primera captura suele salir en blanco.

## Qué se puede hacer solo y qué no

Sin preguntar:

- Auditar la configuración existente y compararla contra el runbook
- Navegar, leer, capturar, reportar diferencias
- Abrir modales de configuración **para leerlos** — y salir con Cancelar/X, nunca
  con Guardar

Con confirmación explícita del usuario, mostrando antes qué se va a cambiar:

- Instalar canales o apps
- Vincular cuentas (el consentimiento OAuth es aprobación del usuario, no tuya)
- Guardar mapeos de eventos, activar conversiones mejoradas, cambiar nivel de datos
- Cualquier cosa que escriba en la cuenta de Ads o de GA4

Nunca:

- Ingresar contraseñas o pasar 2FA. Si el flujo lo pide, ese paso lo hace el
  usuario — sugerile que lo complete y seguí después.

## Regla de los IDs

**Ningún ID real entra a un archivo versionado.** Measurement IDs, cuentas de Ads,
etiquetas `AW-`, emails: todos van como placeholders (`G-XXXXXXXXXX`,
`AW-XXXXXXXXXXX`). Los valores reales viven en la config de cada tienda.

Esto ya falló una vez: el `G-` real de Descorcha quedó hardcodeado en el head tag
y encima no coincidía con el del `config`, así que el tag apuntaba a una propiedad
que la librería nunca inicializaba. Por eso `ga4-head-tag.liquid` define el ID una sola
vez con un `assign` de Liquid.

## Google Ads y Meta son configuración, no código — con una excepción

Las conversiones de Google Ads las gestiona el canal **Google & YouTube**, y las de
Meta la app **Facebook & Instagram**. Ambas miden **server-side**. Mientras la app
funcione, no escribas un `gtag('event', 'conversion')` ni un pixel de Meta a mano:
sería solo-navegador y duplicaría lo que la app ya manda. El entregable es un
runbook (`google-ads-runbook.md`), no un archivo para pegar.

**La excepción:** cuando la app no es usable —la cuenta pierde el acceso, el OAuth
no se completa, la app carga en blanco— no queda nada midiendo, y un tag en el tema
no sirve porque no llega al checkout. Ahí corresponde `google-ads-custom-pixel.js`
(el **camino B** del runbook). Los dos caminos son excluyentes: nunca los dos a la
vez. Antes de decidir, mirá **Configuración → Eventos del cliente**: si el pixel de
la app dice **Servidor**, es camino A; si dice solo **Web** o la app no carga,
evaluá el B.

GA4 sí es código, porque el Custom Pixel es la única forma de llegar al checkout:
`ga4-custom-pixel.js` (Custom Pixel) y `ga4-head-tag.liquid` (theme.liquid).

## El método se corrige con cada tienda

`google-ads-runbook.md` tiene una sección **"Reglas del método"** con lo que sí
transfiere entre tiendas, y un **"Registro de mejoras"** al final.

Después de configurar una tienda, agregá una fila al registro con lo que se
aprendió, y si algo contradice una regla, corregí la regla. Lo específico de una
tienda no va al runbook — solo lo que se repetiría en la siguiente.
