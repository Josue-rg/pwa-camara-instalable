# GUÍA PARA ESTUDIAR — Inspección Visual PWA

> Esta guía es para ti, no para GitHub. Está pensada para que la leas en voz
> alta y puedas defenderla con tus propias palabras.
>
> En el código cada comentario empieza con el número de paso que aparece aquí:
> **A** = instalar la app, **B** = encender la cámara, **C** = cache.

---

## 0. La idea en dos frases

> La app se **instala** como si fuera nativa (sin tienda) y solo **enciende la
> cámara** cuando el usuario entiende para qué y acepta.
>
> El navegador pone las reglas: **HTTPS**, permiso explícito del usuario y un
> **service worker** que guarda los archivos para abrir sin red.

Son dos temas distintos que se juntan en la misma pantalla. No te compliques:
primero va la instalación (A), luego la cámara (B) y por debajo el cache (C).

---

## 1. Los tres flujos, de un vistazo

| Flujo | Qué resuelve | Quién manda |
| --- | --- | --- |
| **A · Instalar** | Que la app se pueda agregar a la pantalla de inicio | El navegador |
| **B · Cámara** | Que el usuario vea su cámara con permiso consciente | El usuario y el navegador |
| **C · Cache** | Que la app abra aunque no haya internet | El service worker |

Regla de oro:

> **El navegador decide si se puede instalar. El usuario decide si se enciende
> la cámara. El service worker guarda los archivos.**

---

## 2. El mapa de la instalación (flujo A)

```
 HTTPS + manifest + service worker        (A1, A2)
                    │
                    ▼
      beforeinstallprompt  →  guardo el evento   (A3)
                    │
                    ▼
            botón "Instalar App" visible
                    │  click  (A4)
                    ▼
             prompt() → diálogo nativo
                    │
             userChoice  (A5)
            ┌───────┴────────┐
        accepted          dismissed
            │                 │
      oculto el botón    guardo el evento
            │            para reintentar
            ▼
       appinstalled  →  confirmación real   (A6)
```

Aparte, el camino de iPhone/iPad:

```
 iPhone / iPad  (A7)
      │
      ▼
 Safari no dispara beforeinstallprompt
      │
      ▼
 guía: Compartir → Agregar a inicio
```

---

## 3. El mapa de la cámara (flujo B)

```
 Botón "Solicitar acceso a cámara"   (B1)
              │ click  (B2)
              ▼
     aviso propio: "nada se sube, es local"
        ┌─────┴─────┐
    Cancelar       Aceptar  (B4)
      (B3)            │
   sigue apagada      ▼
                iniciarCamara()  (B5)
                      │
          ┌───────────┼─────────────────┐
   ¿hay mediaDevices? │          token++ (invalida
      no → mensaje    │           lo anterior)
      HTTPS           │          detiene cámara
          │           ▼
          │      getUserMedia()  (B6)  ← permiso nativo
          │        ┌──────────┴──────────┐
          │       ok                     error
          │        │                       │
          │   stream al <video> (B7)   diag. (B8)
          │        └──────────┬──────────┘
          └───────────────────▼
                        finally (B9)
                     botones coherentes
```

Y las salidas:

- **B10** · cambiar de lente → vuelve a B5 con el otro `facingMode`.
- **B11** · apagar → detiene los tracks y libera el sensor.
- **B12** · salir de la app → igual que B11.

---

## 4. Quién es quién (en una línea cada uno)

- **`index.html`** → la cara: botones de instalar, visor de video y aviso de
  permiso.
- **`app.js`** → todo el comportamiento: instalación (A) y cámara (B).
- **`sw.js`** → el cache del shell (C). No toca la cámara.
- **`manifest.json`** → la identidad de la app: nombre, iconos, `display`,
  `start_url`. Es **requisito** para que se pueda instalar.
- **`styles.css`** → solo presentación (incluido el espejo de la cámara frontal).
- **`icons/`** → los iconos que el sistema usa al instalar.

---

## 5. FLUJO A — Instalar la app, paso por paso

**A1 · `index.html`**
Existe el `<link rel="manifest">`, los iconos y un botón `#btn-instalar`
**oculto**. La guía de iOS también está oculta.
Nada de esto instala por sí solo: solo prepara la app para que el navegador la
considere instalable.

**A2 · `app.js` → `registrarServiceWorker()`**
Al terminar la carga (`load`) se registra `./sw.js`.
Sin service worker, el navegador **no** ofrece instalar. El registro se hace al
final para no competir con el primer pintado de la pantalla.

> Requisitos reales de instalación: **HTTPS** (o `localhost`), un manifest con
> nombre, iconos de 192 y 512, `start_url` y `display`, y un service worker con
> manejador de `fetch`.

**A3 · `app.js` → evento `beforeinstallprompt`**
Cuando el navegador confirma que la app cumple los requisitos, dispara este
evento. Aquí:

- se hace `preventDefault()` para que no salga el banner automático,
- el evento se guarda en `eventoInstalacionDiferido` (solo se puede usar una vez),
- se muestra el botón "Instalar App".

> Este evento **solo existe en navegadores Chromium** (Chrome, Edge, Android).
> Safari y Firefox no lo disparan.

**A4 · `app.js` → click en el botón**
Se llama `evento.prompt()`, que abre el **diálogo nativo** de instalación.
El navegador exige que esto salga de un click real del usuario.

**A5 · `app.js` → `evento.userChoice`**
Devuelve `{ outcome: 'accepted' | 'dismissed' }`:

- `accepted` → se oculta el botón y se avisa que ya está instalada.
- `dismissed` → se vuelve a guardar el evento para que pueda intentarlo después.

**A6 · `app.js` → evento `appinstalled`**
Es la **confirmación real** del navegador. Aquí se oculta el botón y también la
guía de iOS. Es más confiable que `userChoice`, porque confirma que la
instalación terminó.

**A7 · `app.js` → `verificarEntornoIOS()`**
Detecta iPhone/iPad (incluido iPadOS, que se hace pasar por Mac) y comprueba si
ya está instalada (`navigator.standalone` o `display-mode: standalone`).
Si es iOS y **no** está instalada, muestra la guía manual: Safari no deja
instalar por JavaScript, hay que usar **Compartir → Agregar a inicio**.

> **Para decir en la defensa:** "No soy yo el que instala: el navegador avisa
> que se puede, yo guardo ese evento y lo disparo cuando el usuario pulsa el
> botón. En iPhone no existe ese evento, por eso muestro la guía manual."

---

## 6. FLUJO B — Encender la cámara, paso por paso

**B1 · `index.html`**
Tres botones: **Solicitar acceso** (activo), **Alternar cámara** y **Apagar**
(deshabilitados). El `<video>` ya existe, pero vacío.

**B2 · `app.js` → click en "Solicitar acceso"**
Antes de tocar el hardware se muestra un **aviso propio**: explica que la
imagen es local, que no se sube nada y qué lente se va a usar.
Se pone el foco en "Aceptar" (accesibilidad) y no se pide ningún permiso aún.

> Esto es el **permiso consciente**: el usuario entiende antes de que el
> navegador le lance el diálogo nativo. Mejora la experiencia y evita rechazos
> por sorpresa.

**B3 · `app.js` → click en "Cancelar"**
Se oculta el aviso. **No se toca la cámara**: el sensor sigue apagado.

**B4 · `app.js` → click en "Aceptar y encender"**
Se oculta el aviso y se llama a `iniciarCamara(modoCamaraActual)`.
Recién aquí empieza el flujo real.

**B5 · `app.js` → `iniciarCamara(modo)`**
Es el corazón del flujo. Hace cuatro cosas:

1. Comprueba que exista `navigator.mediaDevices.getUserMedia`. Si no,
   avisa que hace falta HTTPS.
2. Hace `token = ++tokenCamara`: invalida cualquier solicitud anterior.
3. Detiene la cámara que estuviera encendida (`detenerCamaraActiva()`).
4. Marca `solicitandoCamara = true`, muestra "Preparando cámara..." y
   deshabilita los botones.

**B6 · `app.js` → `getUserMedia()`**
Pide el stream con:

```js
{ video: { facingMode: 'environment' | 'user' }, audio: false }
```

- `environment` = cámara trasera.
- `user` = cámara frontal.
- `audio: false` = solo video, no micrófono.

Aquí es donde el navegador pide el **permiso nativo** (la primera vez).

**B7 · `then` → llega el stream**
Antes de usarlo se comprueba el token:

- Si el token cambió, **llegó tarde**: se apaga ese stream y se descarta.
  Esto evita que al cambiar de lente rápido se encienda la cámara equivocada.
- Si el token es el actual: se guarda en `streamActual`, se conecta con
  `visorVideo.srcObject = stream`, se pone `muted` (necesario para autoplay) y
  se llama a `play()`.

Si `play()` falla (política de autoplay), se avisa que toque el visor una vez.

**B8 · `catch` → algo falló**
`diagnosticarErrorCamara()` traduce el error técnico:

- `NotAllowedError` → permiso denegado.
- `NotFoundError` / `OverconstrainedError` → no hay esa lente.
- `NotReadableError` → sensor ocupado por otra app.
- `SecurityError` → falta HTTPS.

La cámara queda apagada y los botones deshabilitados.

**B9 · `finally` → siempre se ejecuta**
Se apaga `solicitandoCamara` y se reajustan los botones según si hay stream
o no. Así la UI nunca se queda "trabada" aunque falle.

**B10 · `app.js` → "Alternar cámara"**
Si no hay una solicitud en curso, cambia `environment` ↔ `user`, actualiza la
clase que **voltea el video en espejo** para la frontal y vuelve a llamar a
`iniciarCamara()`, o sea, regresa a B5.

**B11 · `app.js` → "Apagar cámara"**
Hace `tokenCamara += 1` (invalida lo pendiente), limpia `solicitandoCamara` y
llama a `detenerCamaraActiva()`.

`detenerCamaraActiva()` recorre todos los tracks y hace `track.stop()`:
eso **libera el hardware y apaga el indicador** de la cámara. Luego suelta el
`<video>` y deshabilita los botones.

**B12 · `app.js` → evento `pagehide`**
Si el usuario sale de la app o la página se va a segundo plano definitivo, se
hace lo mismo que en B11. Es una medida de **privacidad y batería**: el sensor
no se queda encendido sin que la app esté visible.

> **Para decir en la defensa:** "La cámara no se enciende sola: hay un aviso
> propio, luego el permiso del navegador. El stream se guarda y se apaga
> deteniendo cada track, que es lo que libera el sensor. El token evita que una
> respuesta vieja encienda la lente equivocada."

---

## 7. FLUJO C — El cache (C1, C2, C3)

Esto es lo que permite **abrir la app sin internet**. No tiene que ver con la
cámara.

**C1 · `sw.js` → `install`**
Abre el cache `pwa-camara-instalable-v1` y guarda el **shell** con
`cache.addAll(ARCHIVOS_CACHE)`: `index.html`, `styles.css`, `app.js`,
`manifest.json` e iconos. Al terminar, `skipWaiting()` para activarse ya.

**C2 · `sw.js` → `activate`**
Borra todos los caches cuyo nombre **no** sea el actual. Así se eliminan
versiones viejas. Luego `clients.claim()` para tomar el control de las
pestañas ya abiertas.

**C3 · `sw.js` → `fetch`**
Solo actúa si:

- el método es **GET**, y
- el archivo es **del mismo origen**.

Entonces aplica **cache-first**:

1. Busca en cache. Si está, responde de ahí (rápido y funciona offline).
2. Si no está, va a la red.
3. Si la respuesta es válida (200 y no `opaque`), guarda una **copia** en cache
   con `clone()` (un body solo se puede leer una vez).
4. Si falla el guardado, igual entrega la respuesta de la red.

> El nombre del cache es la **versión**. Si publicas cambios y no lo cambias,
> el navegador puede seguir sirviendo el archivo viejo. Al subir la versión,
> `activate` borra el anterior.

---

## 8. Conceptos que tienes que dominar

**Contexto seguro (HTTPS)**
La cámara y los service workers solo funcionan en HTTPS o en `localhost`.
Sin eso, `navigator.mediaDevices` puede no existir o el permiso se bloquea.

**Permiso consciente**
Es el aviso propio de la app (B2) **antes** del permiso nativo (B6). Sirve para
explicar qué se va a usar y por qué, y que el usuario decida con información.

**Ciclo de vida del stream**
`getUserMedia` entrega un `MediaStream` con tracks. Mientras no hagas
`track.stop()`, la cámara sigue encendida. Por eso B11 y B12 son obligatorios.

**El token contra carreras**
Si pides la trasera y, antes de que responda, pides la frontal, pueden llegar
las dos respuestas en cualquier orden. Con `tokenCamara` solo se acepta la
última; las demás se apagan y se descartan.

**`beforeinstallprompt` no es universal**
Solo Chromium. En iOS la instalación es manual desde Safari. Por eso existen
A3 y A7 como caminos separados.

**`display: standalone`**
Es lo que hace que la app instalada se abra sin barra del navegador, como una
app nativa.

---

## 9. Preguntas rápidas (con respuesta corta)

**¿Por qué el botón de instalar está oculto al inicio?**
Porque no todos los navegadores permiten instalar. Se muestra solo cuando el
navegador avisa con `beforeinstallprompt` (A3).

**¿Por qué no se instala sola?**
Porque los navegadores exigen una acción del usuario. `prompt()` solo se puede
llamar desde un click.

**¿Qué diferencia hay entre `userChoice` y `appinstalled`?**
`userChoice` dice qué eligió el usuario; `appinstalled` confirma que la
instalación terminó de verdad.

**¿Por qué el aviso propio antes del permiso del navegador?**
Para que el usuario entienda qué se va a encender y que nada se sube. Es
permiso consciente y mejora la tasa de aceptación.

**¿Por qué se apaga la cámara con `track.stop()`?**
Porque si no, el sensor sigue activo, gasta batería y queda el indicador
encendido. `srcObject = null` solo desconecta el video, no apaga el hardware.

**¿Para qué sirve `tokenCamara`?**
Para descartar respuestas viejas cuando se cambia de lente rápido. Sin él, una
solicitud anterior podría encender la cámara equivocada.

**¿Por qué `muted` y `playsinline` en el video?**
`muted` permite la reproducción automática y `playsinline` evita que iOS abra
el video a pantalla completa.

**¿Por qué el service worker se registra en `load`?**
Para no competir con la primera pintada. La app se ve antes y el SW se instala
después.

**¿Por qué el cache es cache-first y no network-first?**
Porque el objetivo es que abra rápido y sin red. La contra es que hay que subir
la versión del cache para ver cambios.

**¿La imagen de la cámara se guarda o se sube?**
No. El stream solo se muestra en el `<video>` local. No hay `fetch`, ni
IndexedDB, ni subida a ningún servidor.

---

## 10. Chuleta final (lo que hay que recordar)

**Flujo A · Instalar**
1. Manifest + HTTPS + service worker = app instalable.
2. El navegador avisa con `beforeinstallprompt`.
3. Guardo el evento y muestro el botón.
4. Click → `prompt()` → diálogo nativo.
5. `userChoice`: aceptó o canceló (si canceló, guardo para reintentar).
6. `appinstalled`: confirmación real.
7. iOS: no hay evento → guía manual "Compartir → Agregar a inicio".

**Flujo B · Cámara**
1. Botón "Solicitar acceso".
2. Aviso propio (permiso consciente).
3. Aceptar → `iniciarCamara`.
4. `token++`, apago la anterior, `getUserMedia`.
5. Stream → `<video>` con `srcObject`, `muted`, `play()`.
6. Error → mensaje traducido.
7. Alternar → cambia `facingMode` y reinicia.
8. Apagar o salir → `track.stop()` y sensor liberado.

**Flujo C · Cache**
1. `install` guarda el shell.
2. `activate` borra versiones viejas y toma control.
3. `fetch` cache-first solo para GET del mismo origen.

### Guion de 30 segundos

> "La app es una PWA instalable: tiene manifest, service worker y HTTPS. El
> navegador avisa cuando se puede instalar y yo guardo ese evento para
> dispararlo cuando el usuario pulse el botón; en iPhone muestro la guía manual
> porque Safari no lo permite. Para la cámara hay un aviso propio antes del
> permiso nativo: el usuario acepta, pido el stream con `getUserMedia` y lo
> conecto al video. Uso un token para descartar solicitudes viejas al cambiar de
> lente, y al apagar o salir detengo los tracks para liberar el sensor. El
> service worker guarda el shell para que la app abra sin red."

---

## 11. Dónde verlo funcionando

- **Application → Manifest** → nombre, iconos, `display` y avisos de
  instalabilidad.
- **Application → Service Workers** → estado del SW, versión y botón Update.
- **Application → Cache Storage → `pwa-camara-instalable-v1`** → los archivos
  del shell.
- **Botón de instalar del navegador** (barra de direcciones en Chrome/Edge) →
  debe aparecer si cumple los requisitos.
- **Candado de la URL → Permisos → Cámara** → aquí se ve y se revoca el permiso.
- **Consola** → mensaje "Service Worker registrado en: ...".
- **Network → Offline + recargar** → la app debe abrir desde el cache.
- **Móvil real** → la vista previa y el cambio de lente solo se prueban bien en
  un teléfono; en escritorio suele haber una sola cámara.
