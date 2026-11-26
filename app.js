'use strict';

// ============================================================
// app.js — FLUJOS A (instalar la app) y B (encender la cámara)
// Aquí vive todo lo que ve y toca el usuario: mostrar botones,
// pedir la cámara y administrar el stream de video.
// El cache del shell (C1-C3) está en sw.js.
// ============================================================

// Evento que el navegador entrega una sola vez para poder instalar (A3).
let eventoInstalacionDiferido = null;

// Estado de la cámara.
// tokenCamara invalida solicitudes viejas: si pides la frontal y de
// inmediato la trasera, la respuesta atrasada se descarta (B7).
let streamActual = null;
let modoCamaraActual = 'environment';
let tokenCamara = 0;
let solicitandoCamara = false;

const btnInstalar = document.getElementById('btn-instalar');
const btnPrepararCamara = document.getElementById('btn-preparar-camara');
const btnAlternarCamara = document.getElementById('btn-alternar-camara');
const btnApagarCamara = document.getElementById('btn-apagar-camara');
const btnConfirmarPermiso = document.getElementById('btn-confirmar-permiso');
const btnCancelarPermiso = document.getElementById('btn-cancelar-permiso');
const avisoPermiso = document.getElementById('aviso-permiso');
const lenteSolicitado = document.getElementById('lente-solicitado');
const visorVideo = document.getElementById('visor-camara');
const visorContenedor = document.getElementById('visor-contenedor');
const mensajeEstado = document.getElementById('estado');

function nombreModo(modo) {
  return modo === 'environment' ? 'Trasera' : 'Frontal';
}

function actualizarMensajeEstado(texto) {
  if (mensajeEstado) {
    mensajeEstado.textContent = texto;
  }
}

// Refleja el estado real en la UI: qué botón se puede pulsar, qué
// texto lleva y si el visor se dibuja como activo.
function actualizarEstadoBotones(camaraActiva) {
  btnPrepararCamara.disabled = camaraActiva || solicitandoCamara;
  btnAlternarCamara.disabled = !camaraActiva || solicitandoCamara;
  btnApagarCamara.disabled = !camaraActiva;
  btnAlternarCamara.textContent = modoCamaraActual === 'environment'
    ? 'Usar cámara frontal'
    : 'Usar cámara trasera';
  visorContenedor.classList.toggle('activa', camaraActiva);
  visorContenedor.classList.toggle('frontal', modoCamaraActual === 'user' && camaraActiva);
}

// Apaga el stream de verdad: detiene cada track (eso libera el sensor
// y apaga el indicador de la cámara) y suelta el <video>.
// Lo usan B5 (antes de cambiar), B11 (apagar) y B12 (salir).
function detenerCamaraActiva() {
  if (streamActual) {
    streamActual.getTracks().forEach(function (track) {
      track.stop();
    });
    streamActual = null;
  }

  if (visorVideo && visorVideo.srcObject) {
    visorVideo.srcObject = null;
  }

  actualizarEstadoBotones(false);
}

// B8. Traduce el error técnico del navegador a un mensaje entendible.
function diagnosticarErrorCamara(error) {
  const nombre = error && error.name ? error.name : 'ErrorDesconocido';

  if (nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError') {
    return 'Permiso denegado. Habilita el acceso a la cámara en los ajustes de tu navegador y vuelve a intentarlo.';
  }

  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError' || nombre === 'OverconstrainedError') {
    return 'No se detectó el sensor de cámara solicitado en este dispositivo. Prueba con la otra lente.';
  }

  if (nombre === 'NotReadableError' || nombre === 'TrackStartError') {
    return 'El sensor está ocupado. Se detuvo la cámara anterior antes de cambiar; vuelve a intentarlo.';
  }

  if (nombre === 'SecurityError') {
    return 'Acceso bloqueado por el navegador. Comprueba que la página se sirve por HTTPS.';
  }

  return 'Error al acceder al hardware: ' + (error && error.message ? error.message : nombre);
}

// B5. Arranque de la cámara. Valida la API, invalida lo anterior
// y deja todo listo para pedir el stream.
function iniciarCamara(modo) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    actualizarMensajeEstado('Tu navegador no expone la API de cámara. Abre la PWA desde una URL HTTPS.');
    actualizarEstadoBotones(false);
    return Promise.resolve(false);
  }

  const token = ++tokenCamara;
  detenerCamaraActiva();

  solicitandoCamara = true;
  actualizarMensajeEstado('Preparando cámara ' + nombreModo(modo) + '...');
  actualizarEstadoBotones(false);

  // B6. Restricciones: solo video y facingMode elige trasera o frontal.
  const restricciones = {
    video: { facingMode: modo },
    audio: false
  };

  return Promise.resolve()
    .then(function () {
      // B6. Aquí el navegador pide permiso y entrega el stream.
      return navigator.mediaDevices.getUserMedia(restricciones);
    })
    .then(function (stream) {
      // B7. Llegó el stream: si mientras tanto se pidió otra lente,
      // se descarta para no encender la cámara equivocada.
      if (token !== tokenCamara) {
        stream.getTracks().forEach(function (track) {
          track.stop();
        });
        return false;
      }

      streamActual = stream;
      visorVideo.srcObject = stream;
      visorVideo.muted = true;

      const reproduccion = visorVideo.play();
      if (reproduccion && typeof reproduccion.catch === 'function') {
        reproduccion.catch(function () {
          actualizarMensajeEstado('Si la vista previa no aparece, pulsa una vez sobre el visor para iniciarla.');
        });
      }

      actualizarMensajeEstado('Cámara activa (' + nombreModo(modo) + ')');
      actualizarEstadoBotones(true);
      return true;
    })
    .catch(function (error) {
      // B8. No se pudo: se explica el motivo y la cámara queda apagada.
      if (token !== tokenCamara) {
        return false;
      }

      actualizarMensajeEstado(diagnosticarErrorCamara(error));
      actualizarEstadoBotones(false);
      return false;
    })
    .finally(function () {
      // B9. Pase lo que pase, se sueltan los botones y se reajusta la UI.
      if (token !== tokenCamara) {
        return;
      }

      solicitandoCamara = false;
      actualizarEstadoBotones(streamActual !== null);
    });
}

// A7. iPhone/iPad no permiten instalar por JavaScript: se muestra
// la guía manual (Compartir > Agregar a inicio).
function verificarEntornoIOS() {
  const esIOS = (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const estaInstalada = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  const guiaIOS = document.getElementById('instrucciones-ios');
  if (esIOS && !estaInstalada && guiaIOS) {
    guiaIOS.hidden = false;
  }

  return esIOS;
}

// A2. Registra el SW. Sin él la app no es instalable; el cache lo hace sw.js.
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.register('./sw.js')
    .then(function (registro) {
      console.info('Service Worker registrado en: ' + registro.scope);
    })
    .catch(function (error) {
      console.error('No se pudo registrar el Service Worker:', error);
    });
}

// A3. El navegador avisa que la app cumple los requisitos: se guarda
// el evento (solo se puede usar una vez) y se muestra el botón.
window.addEventListener('beforeinstallprompt', function (event) {
  event.preventDefault(); // A3. Sin banner automático: el usuario decide.
  eventoInstalacionDiferido = event;
  btnInstalar.hidden = false;
});

// A4. Se abre el diálogo nativo de instalación.
btnInstalar.addEventListener('click', function () {
  if (!eventoInstalacionDiferido) {
    btnInstalar.hidden = true;
    return;
  }

  const evento = eventoInstalacionDiferido;
  eventoInstalacionDiferido = null;

  Promise.resolve()
    .then(function () {
      return evento.prompt();
    })
    .then(function () {
      return evento.userChoice;
    })
    .then(function (resultado) {
      // A5. accepted = instalada; dismissed = se guarda para reintentar.
      if (resultado && resultado.outcome === 'accepted') {
        btnInstalar.hidden = true;
        actualizarMensajeEstado('Aplicación instalada. Ábrela desde la pantalla de inicio.');
      } else {
        eventoInstalacionDiferido = evento;
        actualizarMensajeEstado('Instalación cancelada. Puedes intentarlo de nuevo cuando quieras.');
      }
    })
    .catch(function () {
      eventoInstalacionDiferido = evento;
      actualizarMensajeEstado('No se pudo iniciar la instalación. Inténtalo de nuevo.');
    });
});

// A6. Confirmación del navegador: la app ya quedó instalada.
window.addEventListener('appinstalled', function () {
  btnInstalar.hidden = true;
  guiaIOSOculta();
});

// Oculta la guía de iOS cuando la app ya está instalada (A6).
function guiaIOSOculta() {
  const guiaIOS = document.getElementById('instrucciones-ios');
  if (guiaIOS) {
    guiaIOS.hidden = true;
  }
}

// B2. Primero el aviso propio (permiso consciente); el permiso
// nativo del navegador viene hasta B6.
btnPrepararCamara.addEventListener('click', function () {
  lenteSolicitado.textContent = nombreModo(modoCamaraActual);
  avisoPermiso.hidden = false;
  btnConfirmarPermiso.focus();
});

// B3. Canceló el aviso: no se toca el hardware.
btnCancelarPermiso.addEventListener('click', function () {
  avisoPermiso.hidden = true;
  actualizarMensajeEstado('Solicitud cancelada. La cámara sigue apagada.');
});

// B4. Aceptó el aviso: recién aquí se pide la cámara.
btnConfirmarPermiso.addEventListener('click', function () {
  avisoPermiso.hidden = true;
  iniciarCamara(modoCamaraActual);
});

// B10. Cambia de lente y reinicia el stream (vuelve a B5).
btnAlternarCamara.addEventListener('click', function () {
  if (solicitandoCamara) {
    return;
  }

  modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
  visorContenedor.classList.toggle('frontal', modoCamaraActual === 'user' && streamActual !== null);
  iniciarCamara(modoCamaraActual);
});

// B11. Apagado manual: invalida lo pendiente y libera el sensor.
btnApagarCamara.addEventListener('click', function () {
  tokenCamara += 1;
  solicitandoCamara = false;
  detenerCamaraActiva();
  actualizarMensajeEstado('Cámara apagada. El sensor se ha liberado correctamente.');
});

// B12. Al salir de la app también se libera el sensor.
window.addEventListener('pagehide', function () {
  tokenCamara += 1;
  solicitandoCamara = false;
  detenerCamaraActiva();
});

// A7. Se revisa el entorno al cargar (iOS / ya instalada).
verificarEntornoIOS();
// Estado inicial: cámara apagada y botones coherentes.
actualizarEstadoBotones(false);
// A2. El SW se registra al final para no competir con el primer render.
window.addEventListener('load', registrarServiceWorker);
