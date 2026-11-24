'use strict';

let eventoInstalacionDiferido = null;

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

  const restricciones = {
    video: { facingMode: modo },
    audio: false
  };

  return Promise.resolve()
    .then(function () {
      return navigator.mediaDevices.getUserMedia(restricciones);
    })
    .then(function (stream) {
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
      if (token !== tokenCamara) {
        return false;
      }

      actualizarMensajeEstado(diagnosticarErrorCamara(error));
      actualizarEstadoBotones(false);
      return false;
    })
    .finally(function () {
      if (token !== tokenCamara) {
        return;
      }

      solicitandoCamara = false;
      actualizarEstadoBotones(streamActual !== null);
    });
}

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

window.addEventListener('beforeinstallprompt', function (event) {
  event.preventDefault();
  eventoInstalacionDiferido = event;
  btnInstalar.hidden = false;
});

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

window.addEventListener('appinstalled', function () {
  btnInstalar.hidden = true;
  guiaIOSOculta();
});

function guiaIOSOculta() {
  const guiaIOS = document.getElementById('instrucciones-ios');
  if (guiaIOS) {
    guiaIOS.hidden = true;
  }
}

btnPrepararCamara.addEventListener('click', function () {
  lenteSolicitado.textContent = nombreModo(modoCamaraActual);
  avisoPermiso.hidden = false;
  btnConfirmarPermiso.focus();
});

btnCancelarPermiso.addEventListener('click', function () {
  avisoPermiso.hidden = true;
  actualizarMensajeEstado('Solicitud cancelada. La cámara sigue apagada.');
});

btnConfirmarPermiso.addEventListener('click', function () {
  avisoPermiso.hidden = true;
  iniciarCamara(modoCamaraActual);
});

btnAlternarCamara.addEventListener('click', function () {
  if (solicitandoCamara) {
    return;
  }

  modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
  visorContenedor.classList.toggle('frontal', modoCamaraActual === 'user' && streamActual !== null);
  iniciarCamara(modoCamaraActual);
});

btnApagarCamara.addEventListener('click', function () {
  tokenCamara += 1;
  solicitandoCamara = false;
  detenerCamaraActiva();
  actualizarMensajeEstado('Cámara apagada. El sensor se ha liberado correctamente.');
});

window.addEventListener('pagehide', function () {
  tokenCamara += 1;
  solicitandoCamara = false;
  detenerCamaraActiva();
});

verificarEntornoIOS();
actualizarEstadoBotones(false);
window.addEventListener('load', registrarServiceWorker);
