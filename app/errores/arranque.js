/* ============ Carga fallida (pantalla de arranque) ============
   Cubre lo que el error boundary (ErrorBoundary.jsx) no puede: que React
   no llegue a montar (CDN caída o bloqueada, script que no carga, error de
   sintaxis en un .jsx que Babel no compila). Se carga en el <head> de
   index.html, antes que todo lo demás, para escuchar esos errores.

   Si la app no llega a montar, "Cargando…" (#boot-carga, en index.html) se
   cambia por el aviso de carga fallida. Solo mientras siga a la vista:
   cuando React monta, reemplaza todo #root y de ahí en adelante responde el
   error boundary. Si el aviso salió por demora y la app termina cargando
   igual, React lo reemplaza también. */
(function () {
  var LIMITE_MS = 20000;
  function mostrarFallo(detalle) {
    var carga = document.getElementById("boot-carga");
    if (!carga || carga.getAttribute("data-fallo")) return;
    carga.setAttribute("data-fallo", "1");
    carga.setAttribute("role", "alert");
    carga.querySelector(".boot-card").innerHTML =
      '<div class="boot-icon" aria-hidden="true">!</div>' +
      '<p class="boot-title">No se pudo cargar la aplicación</p>' +
      '<p class="boot-text">Puede ser un problema de conexión o un servicio externo que no respondió. Recarga la página para volver a intentarlo.</p>' +
      '<button type="button" class="boot-btn" onclick="location.reload()">Recargar página</button>' +
      '<details class="boot-detail"><summary>Detalle técnico</summary><pre></pre></details>';
    carga.querySelector("pre").textContent = detalle;
  }
  // En captura: el error de carga de un <script> no burbujea hasta window.
  window.addEventListener("error", function (e) {
    var t = e.target;
    mostrarFallo(t && t.tagName === "SCRIPT" ? "No se pudo cargar " + t.src : (e.message || String(e.error)));
  }, true);
  setTimeout(function () { mostrarFallo("La aplicación no terminó de cargar en " + LIMITE_MS / 1000 + " s."); }, LIMITE_MS);
})();
