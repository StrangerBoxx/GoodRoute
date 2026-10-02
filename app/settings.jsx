/* ============ Configuración ============ */
function Settings({ initialSection }) {
  const [sec, setSec] = useState(initialSection || "cuenta");
  const emp = CP_DATA.empresa;

  const nav = [
    { id: "cuenta", label: "Datos de la cuenta", icon: "building" },
    { id: "password", label: "Cambiar contraseña", icon: "lock" },
    { id: "optimizador", label: "Configuración del optimizador", icon: "sliders" },
  ];

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div className="page-title">Configuración</div>
          <div className="page-sub">Datos de la cuenta y seguridad.</div>
        </div>
      </div>

      <div className="config-grid">
        <nav className="config-nav">
          {nav.map(n => (
            <button key={n.id} className={"config-navitem" + (sec === n.id ? " active" : "")} onClick={() => setSec(n.id)}>
              <Icon name={n.icon} />{n.label}
            </button>
          ))}
        </nav>

        <div>
          {sec === "cuenta" && (
            <div className="block">
              <div className="block-head">
                <Icon name="building" style={{ width: 17, height: 17, color: "var(--text-3)" }} />
                <div className="block-title">Datos de la cuenta / empresa</div>
                <span className="muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>Mayormente de solo lectura</span>
              </div>
              <div className="block-body">
                <div className="field-grid">
                  <Field label="Razón social" value={emp.razon} />
                  <Field label="RUT" value={emp.rut} />
                  <Field label="Giro" value={emp.giro} />
                  <Field label="Teléfono" value={emp.telefono} />
                  <div className="field field-full"><div className="field-label">Dirección</div><div className="field-val">{emp.direccion}</div></div>
                  <Field label="Email de contacto" value={emp.email} />
                  <div className="field">
                    <div className="field-label">Integraciones activas</div>
                    <div className="row-flex" style={{ gap: 7 }}>
                      {emp.integraciones.map(i => <Badge key={i} cls="b-green" dot>{i}</Badge>)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {sec === "password" && (
            <div className="block">
              <div className="block-head">
                <Icon name="lock" style={{ width: 17, height: 17, color: "var(--text-3)" }} />
                <div className="block-title">Cambiar contraseña</div>
              </div>
              <div className="block-body" style={{ maxWidth: 420 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="field"><div className="field-label">Contraseña actual</div><input className="field-input" type="password" defaultValue="········" /></div>
                  <div className="field"><div className="field-label">Nueva contraseña</div><input className="field-input" type="password" placeholder="Mínimo 8 caracteres" /></div>
                  <div className="field"><div className="field-label">Confirmar nueva contraseña</div><input className="field-input" type="password" /></div>
                  <button className="btn btn-primary" style={{ alignSelf: "flex-start", marginTop: 4 }}><Icon name="check" />Actualizar contraseña</button>
                </div>
              </div>
            </div>
          )}

          {sec === "optimizador" && <ConfiguracionOptimizador />}

        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Settings });
