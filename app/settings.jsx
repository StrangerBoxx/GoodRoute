/* ============ Configuración ============ */
function Settings() {
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div className="page-title">Configuración</div>
          <div className="page-sub">Configuración del optimizador.</div>
        </div>
      </div>

      <ConfiguracionOptimizador />
    </div>
  );
}

Object.assign(window, { Settings });
