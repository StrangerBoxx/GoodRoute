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

// "Jornada laboral" va siempre primero (es lo primero que se revisa al
// ajustar la operación); el resto conserva el orden del catálogo.
const GRUPOS_PRIMERO = ["jornada"];

function CampoParametro({ param, valor, onChange, error }) {
  const { etiqueta, descripcion, tipo, unidad, minimo, maximo } = param;
  const esAncho = tipo === "dict_int";
  return (
    <div className={"field" + (error ? " missing" : "") + (esAncho ? " field-full" : "")}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{etiqueta}</div>
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
    return (
      <div className="card" style={{ padding: "50px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-3)" }}>
        <span className="rx-ring rx-ring-18" aria-hidden="true" />Cargando parámetros…
      </div>
    );
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
  const rango = g => (GRUPOS_PRIMERO.includes(g) ? GRUPOS_PRIMERO.indexOf(g) : GRUPOS_PRIMERO.length);
  const gruposOrdenados = Object.entries(grupos).sort(([a], [b]) => rango(a) - rango(b));

  const cambios = Object.fromEntries(
    Object.entries(valores).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(originales[k]))
  );
  const hayCambios = Object.keys(cambios).length > 0;

  const onCambiar = (clave, v) => setValores(prev => ({ ...prev, [clave]: v }));

  // Validación local antes de guardar — los mismos límites que aplica el
  // optimizador (que si no responde 422): rango de cada parámetro según el
  // catálogo, valores vacíos y la regla cruzada de la jornada (fin después
  // del inicio). Las tolerancias antes/después (v3.1.0) son dos parámetros
  // de "jornada" y se validan como cualquier otro por su rango.
  const errores = {};
  catalogo.forEach(p => {
    const v = valores[p.clave];
    const fueraDeRango = n => (p.minimo != null && n < p.minimo) || (p.maximo != null && n > p.maximo);
    if (p.tipo === "int" || p.tipo === "float") {
      if (v === "" || v == null || Number.isNaN(v)) errores[p.clave] = "Ingresá un valor.";
      else if (fueraDeRango(v)) errores[p.clave] = `Tiene que estar entre ${p.minimo} y ${p.maximo}${p.unidad ? ` ${p.unidad}` : ""}.`;
    } else if (p.tipo === "dict_int") {
      if (Object.values(v || {}).some(x => x === "" || x == null || Number.isNaN(x) || x < 0)) errores[p.clave] = "Todas las duraciones tienen que ser un número mayor o igual a 0.";
    }
  });
  if (!errores.fin_jornada_horas && !errores.inicio_jornada_horas
      && valores.inicio_jornada_horas != null && valores.fin_jornada_horas != null
      && valores.fin_jornada_horas <= valores.inicio_jornada_horas) {
    errores.fin_jornada_horas = "El fin de la jornada tiene que ser después del inicio.";
  }
  const cantidadErrores = Object.keys(errores).length;

  const onGuardar = async () => {
    if (cantidadErrores > 0) return;
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
      <div className="row-flex" style={{ justifyContent: "flex-end", marginBottom: 16 }}>
        <button className="btn btn-sm" disabled={restaurando} onClick={onRestaurar} style={{ flex: "none" }}>
          {restaurando ? <span className="rx-ring" aria-hidden="true" /> : <Icon name="refresh" />}{restaurando ? "Restaurando…" : "Restaurar valores por defecto"}
        </button>
      </div>

      {mensaje && (
        <div className="card" style={{ marginBottom: 16, padding: "9px 14px", width: "fit-content", maxWidth: "100%", display: "flex", alignItems: "center", gap: 10, borderColor: mensaje.tipo === "error" ? "var(--red-fg)" : "var(--green-dot)" }}>
          <Icon name={mensaje.tipo === "error" ? "alert" : "checkC"} style={{ width: 16, height: 16, flex: "none", color: mensaje.tipo === "error" ? "var(--red-fg)" : "var(--green-fg)" }} />
          <span>{mensaje.texto}</span>
        </div>
      )}

      {gruposOrdenados.map(([grupo, params]) => (
        <div key={grupo} className="block">
          <div className="block-head">
            <Icon name="sliders" style={{ width: 17, height: 17, color: "var(--text-3)" }} />
            <div className="block-title">{GRUPO_LABEL[grupo] || grupo}</div>
          </div>
          <div className="block-body">
            <div className="field-grid">
              {params.map(p => (
                <CampoParametro key={p.clave} param={p} valor={valores[p.clave]} onChange={(v) => onCambiar(p.clave, v)} error={errores[p.clave]} />
              ))}
            </div>
          </div>
        </div>
      ))}

      {hayCambios && (
        <div className="card card-pad" style={{ position: "sticky", bottom: 16, display: "flex", alignItems: "center", gap: 12, boxShadow: "var(--shadow-sm)" }}>
          <span className="cell-muted" style={{ fontSize: 12.5 }}>{Object.keys(cambios).length} parámetro(s) sin guardar</span>
          {cantidadErrores > 0 && (
            <span style={{ fontSize: 12.5, color: "var(--red-fg)" }}>
              <Icon name="alert" style={{ width: 13, height: 13 }} /> Corregí {cantidadErrores === 1 ? "1 valor" : `${cantidadErrores} valores`} para poder guardar.
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={onDescartar} disabled={guardando}>Descartar</button>
            <button className="btn btn-primary btn-sm" onClick={onGuardar} disabled={guardando || cantidadErrores > 0}>
              {guardando ? <span className="rx-ring" aria-hidden="true" /> : <Icon name="check" />}{guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
      {(guardando || restaurando) && <CargandoOverlay mensaje={guardando ? "Guardando configuración…" : "Restaurando valores por defecto…"} />}
    </div>
  );
}

Object.assign(window, { ConfiguracionOptimizador });
