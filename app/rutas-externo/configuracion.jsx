/* ============ Configuración del optimizador (HU-16) ============
   Panel de parámetros de negocio del optimizador. Se construye desde el
   catálogo real del backend (GET /optimizador/configuracion/parametros),
   mostrando solo ambito=="negocio" — los de ambito solver/servicio los
   ajusta el equipo técnico, no se exponen acá. Lee valores vigentes con
   GET /optimizador/configuracion y guarda con PUT (solo las claves que
   cambiaron); "Restaurar valores por defecto" llama al endpoint dedicado.
*/

const GRUPO_LABEL = {
  tiempos_servicio: "Duración de servicios",
  jornada: "Jornada laboral",
  capacidad: "Capacidad por técnico",
  sectores: "Sectores",
  georreferencia: "Georreferencia",
  ejecucion: "Ejecución de la optimización",
};

const ORIGEN_INFO = {
  operacion_cliente: { label: "Operación del cliente", cls: "b-blue" },
  supuesto_equipo: { label: "Supuesto del equipo", cls: "b-gray" },
};

function CampoParametro({ param, valor, onChange, error }) {
  const { etiqueta, descripcion, tipo, unidad, minimo, maximo, origen } = param;
  const origenInfo = ORIGEN_INFO[origen];
  const esAncho = tipo === "dict_int";
  return (
    <div className={"field" + (error ? " missing" : "") + (esAncho ? " field-full" : "")}>
      <div className="row-flex" style={{ justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{etiqueta}</div>
        {origenInfo && <Badge cls={origenInfo.cls} dot={false}>{origenInfo.label}</Badge>}
      </div>
      {descripcion && <div className="cell-muted" style={{ fontSize: 11.5, marginBottom: 7 }}>{descripcion}</div>}

      {tipo === "bool" && (
        <button type="button" className={"toggle" + (valor ? " on" : "")} onClick={() => onChange(!valor)}>
          <span className="knob" />
        </button>
      )}

      {(tipo === "int" || tipo === "float") && (
        <div className="row-flex" style={{ gap: 8 }}>
          <input className="field-input" type="number" value={valor}
            min={minimo != null ? minimo : undefined} max={maximo != null ? maximo : undefined}
            step={tipo === "float" ? "0.1" : "1"} style={{ maxWidth: 140 }}
            onChange={(e) => onChange(e.target.value === "" ? "" : (tipo === "float" ? parseFloat(e.target.value) : parseInt(e.target.value, 10)))} />
          {unidad && <span className="cell-muted" style={{ fontSize: 12 }}>{unidad}</span>}
        </div>
      )}

      {tipo === "str" && (
        <input className="field-input" type="text" value={valor || ""} onChange={(e) => onChange(e.target.value)} />
      )}

      {tipo === "dict_int" && (
        <div className="field-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
          {Object.entries(valor || {}).map(([clave, v]) => (
            <div key={clave} className="field">
              <div className="field-label">{window.RUTAS_EXTERNO_API.TIPO_OT_LABEL[clave] || clave}</div>
              <input className="field-input" type="number" value={v}
                onChange={(e) => onChange({ ...valor, [clave]: e.target.value === "" ? "" : parseInt(e.target.value, 10) })} />
            </div>
          ))}
        </div>
      )}

      {(minimo != null || maximo != null) && (tipo === "int" || tipo === "float") && (
        <div className="cell-muted" style={{ fontSize: 11, marginTop: 5 }}>Rango permitido: {minimo} – {maximo}{unidad ? ` ${unidad}` : ""}</div>
      )}
      {error && <div style={{ color: "var(--red-fg)", fontSize: 11.5, marginTop: 5 }}>{error}</div>}
    </div>
  );
}

function ConfiguracionOptimizador() {
  const [estado, setEstado] = useState("cargando"); // cargando | ok | error
  const [errorCarga, setErrorCarga] = useState(null);
  const [catalogo, setCatalogo] = useState([]);
  const [valores, setValores] = useState({});
  const [originales, setOriginales] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const cargar = () => {
    setEstado("cargando");
    setErrorCarga(null);
    Promise.all([
      window.RUTAS_EXTERNO_API.obtenerCatalogoParametros(),
      window.RUTAS_EXTERNO_API.obtenerConfiguracion(),
    ]).then(([cat, conf]) => {
      setCatalogo((cat.parametros_configuracion || []).filter(p => p.ambito === "negocio"));
      setValores(conf);
      setOriginales(conf);
      setEstado("ok");
    }).catch(err => {
      setErrorCarga(err.message);
      setEstado("error");
    });
  };

  useEffect(cargar, []);

  if (estado === "cargando") {
    return <div className="cell-muted" style={{ padding: 24 }}>Cargando parámetros…</div>;
  }
  if (estado === "error") {
    return (
      <div className="card card-pad" style={{ borderColor: "var(--red-fg)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="alert" style={{ color: "var(--red-fg)" }} />
        <span>No se pudo cargar la configuración: {errorCarga}</span>
        <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={cargar}>Reintentar</button>
      </div>
    );
  }

  const grupos = {};
  catalogo.forEach(p => { (grupos[p.grupo] = grupos[p.grupo] || []).push(p); });

  const cambios = Object.fromEntries(
    Object.entries(valores).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(originales[k]))
  );
  const hayCambios = Object.keys(cambios).length > 0;

  const onCambiar = (clave, v) => setValores(prev => ({ ...prev, [clave]: v }));

  const onGuardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      await window.RUTAS_EXTERNO_API.guardarConfiguracion(cambios);
      setOriginales(valores);
      setMensaje({ tipo: "ok", texto: "Configuración guardada." });
    } catch (err) {
      setMensaje({ tipo: "error", texto: `No se pudo guardar: ${err.message}` });
    } finally {
      setGuardando(false);
    }
  };

  const onDescartar = () => { setValores(originales); setMensaje(null); };

  const onRestaurar = async () => {
    setRestaurando(true);
    setMensaje(null);
    try {
      await window.RUTAS_EXTERNO_API.restaurarConfiguracion();
      cargar();
      setMensaje({ tipo: "ok", texto: "Parámetros restaurados a su valor por defecto." });
    } catch (err) {
      setMensaje({ tipo: "error", texto: `No se pudo restaurar: ${err.message}` });
    } finally {
      setRestaurando(false);
    }
  };

  return (
    <div>
      <div className="row-flex" style={{ justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div className="cell-muted" style={{ fontSize: 12.5, maxWidth: 440 }}>Reglas de la operación que usa el optimizador al armar rutas — jornada, capacidad, duración de servicios y sectores.</div>
        <button className="btn btn-sm" disabled={restaurando} onClick={onRestaurar} style={{ flex: "none" }}>
          <span className={restaurando ? "icon-spin" : ""}><Icon name="refresh" /></span>{restaurando ? "Restaurando…" : "Restaurar valores por defecto"}
        </button>
      </div>

      {mensaje && (
        <div className="card card-pad" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, borderColor: mensaje.tipo === "error" ? "var(--red-fg)" : "var(--green-dot)" }}>
          <Icon name={mensaje.tipo === "error" ? "alert" : "checkC"} style={{ color: mensaje.tipo === "error" ? "var(--red-fg)" : "var(--green-fg)" }} />
          <span>{mensaje.texto}</span>
        </div>
      )}

      {Object.entries(grupos).map(([grupo, params]) => (
        <div key={grupo} className="block">
          <div className="block-head">
            <Icon name="sliders" style={{ width: 17, height: 17, color: "var(--text-3)" }} />
            <div className="block-title">{GRUPO_LABEL[grupo] || grupo}</div>
          </div>
          <div className="block-body">
            <div className="field-grid">
              {params.map(p => (
                <CampoParametro key={p.clave} param={p} valor={valores[p.clave]} onChange={(v) => onCambiar(p.clave, v)} />
              ))}
            </div>
          </div>
        </div>
      ))}

      {hayCambios && (
        <div className="card card-pad" style={{ position: "sticky", bottom: 16, display: "flex", alignItems: "center", gap: 12, boxShadow: "var(--shadow-sm)" }}>
          <span className="cell-muted" style={{ fontSize: 12.5 }}>{Object.keys(cambios).length} parámetro(s) sin guardar</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={onDescartar} disabled={guardando}>Descartar</button>
            <button className="btn btn-primary btn-sm" onClick={onGuardar} disabled={guardando}>
              {guardando ? <span className="icon-spin"><Icon name="refresh" /></span> : <Icon name="check" />}{guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
      {(guardando || restaurando) && <CargandoOverlay mensaje={guardando ? "Guardando configuración…" : "Restaurando valores por defecto…"} />}
    </div>
  );
}

Object.assign(window, { ConfiguracionOptimizador });
