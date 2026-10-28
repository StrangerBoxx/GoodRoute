/* ============ Configuración ============ */
function Settings() {
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div className="page-title">Configuración</div>
          <div className="page-sub">Reglas de la operación que usa el optimizador al armar rutas.</div>
        </div>
      </div>

      <ConfiguracionOptimizador />
    </div>
  );
}

Object.assign(window, { Settings });
