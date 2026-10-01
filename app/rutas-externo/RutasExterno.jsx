/* ============================================================
   Asignación de rutas — módulo del equipo de rutas
   ------------------------------------------------------------
   Todo lo relacionado a optimización/asignación de rutas vive
   acá. El backoffice solo recibe rutas ya armadas y las confirma
   (ver onConfirmRoute / onConfirmAssignment en main.jsx); no debe
   implementarse lógica de optimización fuera de esta carpeta.

   HU-01/02/03 — conectado al backend real de optimización (ver
   app/rutas-externo/data.js, contrato confirmado con el equipo de
   optimización el 30/09/2026). Alcance conectado por ahora:
   técnicos y OT reales, ejecutar la optimización, ver la propuesta
   de rutas y los pendientes con su motivo. Configuración de
   parámetros, métricas del día, regenerar datos simulados y el
   mapa con trazado de calles quedan para una próxima etapa (ver
   el encabezado de data.js para el detalle de qué falta).

   El identificador de técnico y de OT ahora es el mismo en todo
   el circuito (el UUID/código real que entrega el backend) — ya
   no hace falta traducir ids como con el servicio anterior.
   ============================================================ */
const OPTIMIZADOR_DISPONIBLE = true;

/* ---- sessionStorage: selección, propuesta y confirmación del día ---- */
const RX_KEYS = {
  fecha: "rutasExterno.fecha",
  otsSel: "rutasExterno.otsSel",
  tecSel: "rutasExterno.tecSel",
  propuesta: "rutasExterno.propuesta",
  confirmados: "rutasExterno.confirmados",
};
function rxLoad(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function rxSave(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Solo para mostrar al usuario — el input date y el resto del estado siguen en ISO (YYYY-MM-DD).
function fechaDDMMYYYY(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/* ---- Panel de selección (HU-01) ---- */
function SeleccionPanel({ fecha, onFechaChange, otsDelDia, tecnicosDisponibles, otsSel, tecSel, toggleOt, toggleTec, onToggleTodosOts, onToggleTodosTec, onOptimizar, optimizando, error }) {
  const otsCount = otsDelDia.filter(o => otsSel[o.id]).length;
  const tecCount = tecnicosDisponibles.filter(t => tecSel[t.id]).length;
  const puedeOptimizar = OPTIMIZADOR_DISPONIBLE && otsCount > 0 && tecCount > 0;

  return (
    <>
      {error && (
        <div className="card" style={{ borderColor: "var(--red-fg)", background: "var(--accent-softer)", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 16 }}>
          <Icon name="alert" style={{ width: 18, height: 18, color: "var(--red-fg)", flex: "none" }} />
          <span>{error}</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="clock" style={{ width: 16, height: 16, color: "var(--text-3)", flex: "none" }} />
        <span className="cell-strong" style={{ flex: "none" }}>Planificar para el día</span>
        <input type="date" className="field-input" style={{ width: 160, flex: "none" }} value={fecha}
          min={window.RUTAS_EXTERNO_API.hoyISO()} max={window.RUTAS_EXTERNO_API.sumarDiasISO(13)}
          onChange={e => e.target.value && onFechaChange(e.target.value)} />
        <span className="cell-muted" style={{ fontSize: 12.5 }}>Esta fecha es la que se usa para calcular la optimización.</span>
      </div>

      <div className="rx-grid">
        <div className="card card-pad">
          <div className="rx-card-head">
            <div className="rx-card-title">OTs por Asignar</div>
            <div className="row-flex" style={{ gap: 10 }}>
              {otsDelDia.length > 0 && (
                <button className="btn btn-sm" onClick={() => onToggleTodosOts(otsCount < otsDelDia.length)}>
                  {otsCount < otsDelDia.length ? "Seleccionar todo" : "Deseleccionar todo"}
                </button>
              )}
              <span className="rx-card-count">{otsCount} / {otsDelDia.length} seleccionadas</span>
            </div>
          </div>
          {otsDelDia.length === 0 ? (
            <div className="card empty"><Icon name="orders" />No hay OTs elegibles por asignar.</div>
          ) : (
            <div className="rx-check-list">
              {otsDelDia.map(ot => (
                <label key={ot.id} className="rx-check-row">
                  <input type="checkbox" checked={!!otsSel[ot.id]} onChange={() => toggleOt(ot.id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-flex" style={{ gap: 7 }}>
                      <span className="id-pill">{ot.id}</span>
                      <span className="cell-strong">{ot.cliente}</span>
                    </div>
                    <div className="stop-dir"><Icon name="pin" style={{ width: 12, height: 12 }} />{ot.direccion}</div>
                  </div>
                  <span className="badge b-slate" style={{ flex: "none" }}><Icon name="clock" />{ot.ventanaInicio}–{ot.ventanaFin}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="rx-card-head">
            <div className="rx-card-title">Técnicos</div>
            <div className="row-flex" style={{ gap: 10 }}>
              {tecnicosDisponibles.length > 0 && (
                <button className="btn btn-sm" onClick={() => onToggleTodosTec(tecCount < tecnicosDisponibles.length)}>
                  {tecCount < tecnicosDisponibles.length ? "Seleccionar todo" : "Deseleccionar todo"}
                </button>
              )}
              <span className="rx-card-count">{tecCount} / {tecnicosDisponibles.length} seleccionados</span>
            </div>
          </div>
          {tecnicosDisponibles.length === 0 ? (
            <div className="card empty"><Icon name="techs" />No hay técnicos para asignar.</div>
          ) : (
            <div className="rx-check-list">
              {tecnicosDisponibles.map(t => (
                <label key={t.id} className="rx-check-row">
                  <input type="checkbox" checked={!!tecSel[t.id]} onChange={() => toggleTec(t.id)} />
                  <Avatar name={t.nombre.split(" ").map(p => p[0]).join("").slice(0, 2)} color={t.color} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cell-strong">{t.nombre}</div>
                    <div className="stop-dir"><Icon name="pin" style={{ width: 12, height: 12 }} />{t.zona}</div>
                  </div>
                  <Badge cls={t.tipo === "interno" ? "b-blue" : "b-slate"} dot={false}>{t.tipo === "interno" ? "Interno" : "Externo"}</Badge>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rx-actions">
        <button className="btn btn-primary" disabled={optimizando || !puedeOptimizar} onClick={onOptimizar}>
          <Icon name={optimizando ? "refresh" : "zap"} />{optimizando ? "Optimizando…" : "Optimizar planificación"}
        </button>
        <span className="cell-muted" style={{ fontSize: 12.5 }}>
          {!OPTIMIZADOR_DISPONIBLE
            ? "El servicio de optimización está en actualización — vuelve a estar disponible pronto."
            : puedeOptimizar
              ? "El cálculo lo hace el servicio real de optimización (OR-Tools), con la selección de aquí."
              : "Selecciona al menos una OT y un técnico."}
        </span>
      </div>
    </>
  );
}

/* ---- Menú "mover a la ruta de…" dentro de la propuesta ---- */
function RxMoveMenu({ otros, onMove, onClose }) {
  useEffect(() => {
    const c = () => onClose();
    window.addEventListener("click", c);
    return () => window.removeEventListener("click", c);
  }, []);
  return (
    <div className="move-menu" onClick={e => e.stopPropagation()}>
      <div className="move-menu-h">Mover a la ruta de…</div>
      {otros.map(t => (
        <button key={t.id} className="move-item" onClick={() => onMove(t.id)}>
          <Avatar name={t.nombre.split(" ").map(p => p[0]).join("").slice(0, 2)} color={t.color} size="sm" />
          <div>
            <div className="mi-name">{t.nombre}</div>
            <div className="mi-zone">{t.zona} · {t.tipo === "interno" ? "Interno" : "Externo"}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ---- Tarjeta de ruta editable por técnico (HU-03) ---- */
function RouteEditCard({ tecnico, paradas, otrosTecnicos, onMoveUp, onMoveDown, onMover, onEliminar }) {
  const [menuFor, setMenuFor] = useState(null);
  return (
    <div className={"route-card" + (menuFor ? " menu-open" : "")}>
      <div className="route-head">
        <Avatar name={tecnico.nombre.split(" ").map(p => p[0]).join("").slice(0, 2)} color={tecnico.color} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-flex" style={{ gap: 8 }}>
            <span className="route-name">{tecnico.nombre}</span>
            <Badge cls={tecnico.tipo === "interno" ? "b-blue" : "b-slate"} dot={false}>{tecnico.tipo === "interno" ? "Interno" : "Externo"}</Badge>
          </div>
          <div className="route-zone"><Icon name="pin" style={{ width: 12, height: 12 }} />{tecnico.zona}</div>
        </div>
        <div className="route-count"><b>{paradas.length}</b> OT</div>
      </div>

      {tecnico.resumen && (
        <div className="row-flex" style={{ gap: 16, flexWrap: "wrap", padding: "9px 18px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-3)" }}>
          <span><Icon name="clock" style={{ width: 12, height: 12 }} />{" "}{tecnico.resumen.horaSalidaBase}–{tecnico.resumen.horaRetornoBase}</span>
          <span>{tecnico.resumen.distanciaTotalKm != null ? tecnico.resumen.distanciaTotalKm.toFixed(1) + " km" : "—"}</span>
          <span>Capacidad {tecnico.resumen.capacidadUso}</span>
          {tecnico.resumen.esperaTotalMin > 0 && <span>{tecnico.resumen.esperaTotalMin} min de espera total</span>}
        </div>
      )}

      {paradas.length === 0 ? (
        <div className="card empty"><Icon name="checkC" />Sin OTs asignadas.</div>
      ) : (
        <div className="route-stops">
          {paradas.map((ot, i) => (
            <div key={ot.id} className="route-stop">
              <div className="stop-n">{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-flex" style={{ gap: 7 }}>
                  <span className="id-pill">{ot.id}</span>
                  <span className="stop-cliente">{ot.cliente}</span>
                </div>
                <div className="stop-dir"><Icon name="pin" style={{ width: 12, height: 12 }} />{ot.direccion}</div>
              </div>
              {ot.horaEstimadaLlegada && (
                <div className="stop-meta">
                  Llega ~{ot.horaEstimadaLlegada}
                  {ot.esperaMin > 0 && <><br />espera {ot.esperaMin} min</>}
                </div>
              )}
              <div className="rx-stop-actions">
                <button className="btn btn-sm" disabled={i === 0} onClick={() => onMoveUp(tecnico.id, ot.id)} title="Subir"><Icon name="chevD" style={{ transform: "rotate(180deg)" }} /></button>
                <button className="btn btn-sm" disabled={i === paradas.length - 1} onClick={() => onMoveDown(tecnico.id, ot.id)} title="Bajar"><Icon name="chevD" /></button>
                <div style={{ position: "relative" }}>
                  <button className="btn btn-sm" disabled={otrosTecnicos.length === 0}
                    title={otrosTecnicos.length === 0 ? "No hay otro técnico en esta propuesta para moverla" : "Mover a otro técnico"}
                    onClick={(ev) => { ev.stopPropagation(); setMenuFor(menuFor === ot.id ? null : ot.id); }}><Icon name="techs" />Mover</button>
                  {menuFor === ot.id && (
                    <RxMoveMenu otros={otrosTecnicos} onClose={() => setMenuFor(null)}
                      onMove={(toId) => { setMenuFor(null); onMover(tecnico.id, ot.id, toId); }} />
                  )}
                </div>
                <button className="dev-remove" title="Quitar de la ruta" onClick={() => onEliminar(tecnico.id, ot.id)}><Icon name="x" style={{ width: 15, height: 15 }} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// El backend manda la razón como texto libre con un prefijo informal
// ("TIEMPO: ...", "OPTIMIZACION: ..."), no como categoría estructurada
// todavía (HU-16 promete al menos georreferencia/sectorial/temporal, pero
// eso no está implementado del lado del servicio). Esto separa ese
// prefijo para mostrarlo como etiqueta en vez de oración corrida — es un
// parche visual sobre una convención no garantizada, no la clasificación
// real. Reemplazar cuando el optimizador entregue una causa estructurada.
function parsearRazon(texto) {
  const m = /^([A-ZÁÉÍÓÚÑ_]+):\s*(.*)$/.exec(texto);
  return m ? { tipo: m[1], detalle: m[2] } : { tipo: null, detalle: texto };
}

/* ---- Fila de OT pendiente/no asignable, con botón "Mover" a un técnico ---- */
function PendienteRow({ ot, tecnicos, onMover }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  return (
    <div className="rx-check-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row-flex" style={{ gap: 7 }}>
          <span className="id-pill">{ot.id}</span>
          <span className="cell-strong">{ot.cliente}</span>
        </div>
        <div className="stop-dir"><Icon name="pin" style={{ width: 12, height: 12 }} />{ot.direccion}</div>
        {ot.razones && ot.razones.map((texto, i) => {
          const { tipo, detalle } = parsearRazon(texto);
          return (
            <div key={i} className="stop-dir" style={{ color: "var(--amber-fg)", alignItems: "flex-start" }}>
              <Icon name="alert" style={{ width: 12, height: 12, marginTop: 2, flex: "none" }} />
              <span>{tipo && <b style={{ fontWeight: 700 }}>{tipo}: </b>}{detalle}</span>
            </div>
          );
        })}
      </div>
      <Badge cls="b-amber" icon="alert">Pendiente</Badge>
      <div style={{ position: "relative" }}>
        <button className="btn btn-sm" disabled={tecnicos.length === 0}
          title={tecnicos.length === 0 ? "No hay técnicos en esta propuesta para asignarla" : "Mover a un técnico"}
          onClick={(ev) => { ev.stopPropagation(); setMenuAbierto(v => !v); }}><Icon name="techs" />Mover</button>
        {menuAbierto && (
          <RxMoveMenu otros={tecnicos} onClose={() => setMenuAbierto(false)}
            onMove={(toId) => { setMenuAbierto(false); onMover(ot.id, toId); }} />
        )}
      </div>
    </div>
  );
}

// Estado de éxito explícito de la corrida — sin esto, la propuesta
// aparece sin contexto de qué tan bien (o mal) le fue a la optimización.
function ResumenCorrida({ resumen }) {
  if (!resumen) return null;
  const matrizFallback = resumen.fuenteMatriz && resumen.fuenteMatriz !== "osrm";
  return (
    <div className="card card-pad" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
      <div className="row-flex" style={{ gap: 8, flex: "none" }}>
        <Icon name="checkC" style={{ color: "var(--green-fg)" }} />
        <b>Optimización lista</b>
      </div>
      <span className="cell-muted" style={{ fontSize: 12.5 }}>
        <b style={{ color: "var(--text)" }}>{resumen.totalOts}</b> OT · <b style={{ color: "var(--text)" }}>{resumen.otsAsignadas}</b> asignadas · <b style={{ color: "var(--text)" }}>{resumen.otsPendientes}</b> pendientes
      </span>
      <span className="cell-muted" style={{ fontSize: 12.5 }}>
        <b style={{ color: "var(--text)" }}>{resumen.tecnicosUtilizados}</b> de {resumen.totalTecnicos} técnicos usados
      </span>
      {resumen.distanciaTotalKm != null && (
        <span className="cell-muted" style={{ fontSize: 12.5 }}>{resumen.distanciaTotalKm.toFixed(1)} km totales</span>
      )}
      {matrizFallback && (
        <span className="badge b-amber" style={{ marginLeft: "auto" }}>
          <Icon name="alert" />Distancias estimadas (sin ruteo real disponible)
        </span>
      )}
    </div>
  );
}

/* ---- Panel de propuesta + edición + confirmación (HU-02/HU-03) ---- */
function PropuestaPanel({ propuesta, resumen, error, onMoveUp, onMoveDown, onMover, onEliminar, onMoverPendiente, onVolver, onConfirmar }) {
  const tecIds = Object.keys(propuesta.porTecnico);
  return (
    <>
      <ResumenCorrida resumen={resumen} />

      {error && (
        <div className="card" style={{ borderColor: "var(--red-fg)", background: "var(--accent-softer)", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 16 }}>
          <Icon name="alert" style={{ width: 18, height: 18, color: "var(--red-fg)", flex: "none" }} />
          <span>{error}</span>
        </div>
      )}

      {tecIds.every(tid => propuesta.porTecnico[tid].paradas.length === 0) ? (
        <div className="card empty"><Icon name="checkC" />Ningún técnico tiene OTs asignadas todavía.</div>
      ) : (
        <div className="routes-grid">
          {tecIds
            .filter(tid => propuesta.porTecnico[tid].paradas.length > 0)
            .map(tid => {
            const { tecnico, paradas } = propuesta.porTecnico[tid];
            // Para "Mover" se ofrecen TODOS los técnicos de la propuesta (no
            // solo los que ya tienen tarjeta visible) — así una OT sí se
            // puede mandar a un técnico que hoy está vacío y por eso no
            // muestra tarjeta.
            const otros = tecIds.filter(id => id !== tid).map(id => propuesta.porTecnico[id].tecnico);
            return (
              <RouteEditCard key={tid} tecnico={tecnico} paradas={paradas} otrosTecnicos={otros}
                onMoveUp={onMoveUp} onMoveDown={onMoveDown} onMover={onMover} onEliminar={onEliminar} />
            );
          })}
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="rx-card-head">
          <div className="rx-card-title">Pendientes</div>
          <span className="rx-card-count">{propuesta.pendientes.length}</span>
        </div>
        {propuesta.pendientes.length === 0 ? (
          <div className="card empty"><Icon name="checkC" />No quedaron OTs pendientes.</div>
        ) : (
          <div className="rx-check-list">
            {propuesta.pendientes.map(ot => (
              <PendienteRow key={ot.id} ot={ot}
                tecnicos={tecIds.map(id => propuesta.porTecnico[id].tecnico)}
                onMover={onMoverPendiente} />
            ))}
          </div>
        )}
      </div>

      <div className="rx-actions">
        <button className="btn" onClick={onVolver}><Icon name="arrowL" />Volver a selección</button>
        <button className="btn btn-primary" onClick={onConfirmar}><Icon name="check" />Confirmar plan</button>
      </div>
    </>
  );
}

/* ---- Bloque read-only de rutas ya confirmadas hoy ---- */
function ConfirmadoBanner({ confirmado, onEditar }) {
  const tecIds = Object.keys(confirmado.porTecnico);
  return (
    <div className="route-banner" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
      <div className="row-flex" style={{ gap: 8 }}>
        <Icon name="checkC" />
        <b>Rutas confirmadas</b>
        <span className="cell-muted">· {fechaDDMMYYYY(confirmado.fecha)}</span>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={onEditar}>Editar</button>
      </div>
      <div className="row-flex" style={{ gap: 18, flexWrap: "wrap" }}>
        {tecIds.map(tid => {
          const { tecnico, paradas } = confirmado.porTecnico[tid];
          if (!paradas.length) return null;
          return (
            <span key={tid} className="cell-muted" style={{ fontSize: 13 }}>
              <b style={{ color: "var(--text)" }}>{tecnico.nombre}</b> · {paradas.length} {paradas.length === 1 ? "OT" : "OTs"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Fila de una ruta ya registrada en el backend (HU-18, "consultar sin
// salir del asignador"). Solo lectura — no hay acciones acá, es historial.
// El shape exacto de GET /api/rutas?fecha= no está documentado (no hay
// ejemplo de respuesta poblada, solo "[]" porque nada se escribió
// todavía) — se lee defensivamente con nombres alternativos y por eso no
// reusa RouteEditCard tal cual; cuando haya un registro real, puede que
// esto necesite un ajuste rápido de nombres de campo.
function RegistroRutaCard({ ruta }) {
  const paradas = ruta.paradas || ruta.ordenes_asignadas || [];
  const nombre = ruta.nombre || ruta.tecnico_nombre || ruta.tecnico_id || "Técnico";
  const zona = ruta.zona_base || ruta.zona || null;
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="route-head" style={{ padding: "12px 16px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cell-strong">{nombre}</div>
          {zona && <div className="route-zone"><Icon name="pin" style={{ width: 12, height: 12 }} />{zona}</div>}
        </div>
        <div className="route-count"><b>{paradas.length}</b> OT</div>
      </div>
      {paradas.length > 0 && (
        <div style={{ padding: "10px 16px 14px", display: "flex", flexWrap: "wrap", gap: 7 }}>
          {paradas.map((p, i) => (
            <span key={p.ot_id || p.id || i} className="badge b-slate">{p.ot_id || p.id || p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Consulta bajo demanda (no se auto-carga al entrar al módulo, para no
// sumar una llamada de red en cada visita cuando normalmente no hay nada
// que ver todavía). HU-18 criterio 3 y 4: consultable sin salir de acá,
// y un error de red se comunica, no se confunde con "no hay registros".
function RegistroAsignaciones({ fechaInicial }) {
  const [fechaConsulta, setFechaConsulta] = useState(fechaInicial);
  const [estado, setEstado] = useState("inicial"); // inicial | cargando | ok | error
  const [rutas, setRutas] = useState([]);
  const [error, setError] = useState(null);

  const consultar = async () => {
    setEstado("cargando");
    setError(null);
    try {
      const data = await window.RUTAS_EXTERNO_API.obtenerRutasRegistradas(fechaConsulta);
      setRutas(Array.isArray(data) ? data : []);
      setEstado("ok");
    } catch (err) {
      setError(err.message);
      setEstado("error");
    }
  };

  // El backend puede devolver un técnico incluido en la corrida sin
  // ninguna parada asignada — eso no es una "asignación registrada" para
  // la planificadora, así que no se muestra (mismo criterio que ya usa
  // PropuestaPanel con las tarjetas de ruta en la etapa de propuesta).
  const rutasConParadas = rutas.filter(r => (r.paradas || r.ordenes_asignadas || []).length > 0);

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="row-flex" style={{ gap: 10, flexWrap: "wrap" }}>
        <Icon name="clock" style={{ width: 16, height: 16, color: "var(--text-3)", flex: "none" }} />
        <span className="cell-strong" style={{ flex: "none" }}>Asignaciones registradas</span>
        <input type="date" className="field-input" style={{ width: 160, flex: "none" }}
          value={fechaConsulta} onChange={e => e.target.value && setFechaConsulta(e.target.value)} />
        <button className="btn btn-sm" onClick={consultar} disabled={estado === "cargando"}>
          <span className={estado === "cargando" ? "icon-spin" : ""}><Icon name="refresh" /></span>
          {estado === "cargando" ? "Consultando…" : "Consultar"}
        </button>
      </div>

      {estado === "error" && (
        <div className="cell-muted" style={{ marginTop: 12, color: "var(--red-fg)", display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="alert" style={{ width: 14, height: 14 }} />No se pudo consultar el registro: {error}
        </div>
      )}
      {estado === "ok" && rutasConParadas.length === 0 && (
        <div className="cell-muted" style={{ marginTop: 12, fontSize: 12.5 }}>No hay asignaciones registradas para el {fechaDDMMYYYY(fechaConsulta)}.</div>
      )}
      {estado === "ok" && rutasConParadas.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {rutasConParadas.map((r, i) => <RegistroRutaCard key={r.tecnico_id || i} ruta={r} />)}
        </div>
      )}
    </div>
  );
}

/* ---- Pantalla raíz: orquesta selección → propuesta → confirmación ---- */
function RutasExternoScreen({ onToast }) {
  // Día que se está planificando — no tiene que ser forzosamente "hoy"
  // (el selector permite hasta 13 días hacia adelante). Se persiste para
  // no perderlo si solo cambiaste de pantalla.
  const [fecha, setFecha] = useState(() => rxLoad(RX_KEYS.fecha, null) || window.RUTAS_EXTERNO_API.hoyISO());

  // HU-01: técnicos y OT elegibles (por_asignar), ambos desde el backend real.
  const [tecnicosDisponibles, setTecnicosDisponibles] = useState([]);
  const [otsDelDiaCrudo, setOtsDelDiaCrudo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);

  // Reconcilia contra los ids actuales: una selección vieja en sessionStorage
  // (de OTs/técnicos que ya no existen con esos ids) no debe dejar la
  // selección "vacía" silenciosamente — los ids nuevos entran pre-tildados.
  const [otsSel, setOtsSel] = useState({});
  const [tecSel, setTecSel] = useState({});

  // La etapa NO se persiste: cada vez que se entra al módulo (click en
  // "Asignar rutas") se arranca siempre en selección, sin importar dónde
  // se haya quedado la última visita. La selección/propuesta/confirmación
  // sí persisten, así no se pierde el trabajo si solo cambiaste de pantalla.
  const [etapa, setEtapa] = useState("seleccion");
  const [propuesta, setPropuesta] = useState(() => rxLoad(RX_KEYS.propuesta, null));
  // Resumen de la última corrida (para el estado de éxito explícito) — no
  // se persiste: es contexto de la corrida recién hecha, no parte del plan.
  const [resumen, setResumen] = useState(null);
  // Mapa fecha (ISO) -> plan confirmado de ese día. Cada día se confirma y
  // se edita por separado; todos los planes confirmados se muestran a la vez,
  // sin importar qué día esté elegido en el selector de planificación.
  const [confirmados, setConfirmados] = useState(() => rxLoad(RX_KEYS.confirmados, {}));
  const [error, setError] = useState(null);
  const [optimizando, setOptimizando] = useState(false);

  // Las OT que ya quedaron en algún plan confirmado (de cualquier día) no se
  // vuelven a ofrecer como elegibles (el backend todavía no sabe de esta
  // confirmación — ver onConfirmar — así que esto es un filtro local para
  // no proponer dos veces lo mismo).
  const otsConfirmadasIds = useMemo(() => {
    const ids = new Set();
    Object.values(confirmados).forEach(c => {
      Object.values(c.porTecnico).forEach(({ paradas }) => paradas.forEach(o => ids.add(o.id)));
    });
    return ids;
  }, [confirmados]);
  const otsDelDia = useMemo(
    () => otsDelDiaCrudo.filter(o => !otsConfirmadasIds.has(o.id)),
    [otsDelDiaCrudo, otsConfirmadasIds]
  );

  useEffect(() => {
    if (!OPTIMIZADOR_DISPONIBLE) {
      setCargando(false);
      setTecnicosDisponibles([]);
      setOtsDelDiaCrudo([]);
      return;
    }
    let activo = true;
    setCargando(true);
    setErrorCarga(null);
    Promise.all([
      window.RUTAS_EXTERNO_API.obtenerTecnicos(),
      window.RUTAS_EXTERNO_API.obtenerOtsPorAsignar(),
    ])
      .then(([tecnicos, ots]) => {
        if (!activo) return;
        setTecnicosDisponibles(tecnicos);
        setOtsDelDiaCrudo(ots);
        const storedTec = rxLoad(RX_KEYS.tecSel, {});
        setTecSel(Object.fromEntries(tecnicos.map(t => [t.id, t.id in storedTec ? storedTec[t.id] : true])));
        const storedOts = rxLoad(RX_KEYS.otsSel, {});
        const elegibles = ots.filter(o => !otsConfirmadasIds.has(o.id));
        setOtsSel(Object.fromEntries(elegibles.map(o => [o.id, o.id in storedOts ? storedOts[o.id] : true])));
      })
      .catch(err => { if (activo) setErrorCarga(err.message); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
    // Sin [fecha]: a diferencia del servicio anterior, técnicos y OT no se
    // filtran por día en este contrato — la fecha solo se usa al ejecutar
    // la optimización (ver onOptimizar), no para pedir estos dos listados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si se elimina la confirmación, las OT que vuelven a quedar elegibles
  // necesitan entrar a otsSel (pre-tildadas) — quedaron afuera al cargar
  // porque en ese momento estaban dentro de un plan confirmado.
  useEffect(() => {
    setOtsSel(prev => {
      let changed = false;
      const next = { ...prev };
      otsDelDia.forEach(o => { if (!(o.id in next)) { next[o.id] = true; changed = true; } });
      return changed ? next : prev;
    });
  }, [otsDelDia]);

  useEffect(() => rxSave(RX_KEYS.fecha, fecha), [fecha]);
  useEffect(() => rxSave(RX_KEYS.otsSel, otsSel), [otsSel]);
  useEffect(() => rxSave(RX_KEYS.tecSel, tecSel), [tecSel]);
  useEffect(() => rxSave(RX_KEYS.propuesta, propuesta), [propuesta]);
  useEffect(() => rxSave(RX_KEYS.confirmados, confirmados), [confirmados]);

  const toggleOt = id => setOtsSel(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleTec = id => setTecSel(prev => ({ ...prev, [id]: !prev[id] }));
  const setTodosOts = valor => setOtsSel(Object.fromEntries(otsDelDia.map(o => [o.id, valor])));
  const setTodosTec = valor => setTecSel(Object.fromEntries(tecnicosDisponibles.map(t => [t.id, valor])));
  // Reabre el plan confirmado de ese día en el panel de edición (mismas
  // acciones de HU-03: reordenar/mover/eliminar). Si se vuelve a confirmar,
  // reemplaza por completo la confirmación anterior de ese día; si se
  // "vuelve a selección" sin confirmar, la confirmación original queda
  // intacta (no se tocó todavía).
  const onEditarConfirmado = (fechaConfirmado) => {
    const c = confirmados[fechaConfirmado];
    if (!c) return;
    setFecha(fechaConfirmado);
    setPropuesta({ porTecnico: deepClone(c.porTecnico), pendientes: [] });
    setResumen(null); // no es una corrida nueva, no hay resumen que mostrar
    setError(null);
    setEtapa("propuesta");
  };

  // La asignación (HU-02) la resuelve el servicio real de optimización,
  // mandándole la selección vigente del panel. A diferencia del servicio
  // anterior, acá el id de técnico y de OT es el mismo en la ida y la
  // vuelta (no hace falta traducir nada), y la respuesta ya trae
  // dirección/coordenadas/horarios resueltos por técnico — no hace falta
  // ninguna consulta extra después de ejecutar.
  const onOptimizar = async () => {
    if (!OPTIMIZADOR_DISPONIBLE) return;
    const tecnicosSeleccionados = tecnicosDisponibles.filter(t => tecSel[t.id]);
    const otsSeleccionadas = otsDelDia.filter(o => otsSel[o.id]);
    if (!tecnicosSeleccionados.length || !otsSeleccionadas.length) {
      setError("Selecciona al menos una OT y un técnico para optimizar.");
      return;
    }

    setOptimizando(true);
    setError(null);
    try {
      const tecnicosPayload = tecnicosSeleccionados.map(t => ({ id: t.id, nombre: t.nombre, tipo: t.tipo, zona: t.zona }));
      const ordenesPayload = otsSeleccionadas.map(o => {
        const item = { id: o.id, tipo: o.tipo, direccion_instalacion: o.direccion };
        if (o.horaProgramada) item.hora_programada = o.horaProgramada;
        return item;
      });

      const resultado = await window.RUTAS_EXTERNO_API.ejecutarOptimizacion({ fecha, tecnicos: tecnicosPayload, ordenes: ordenesPayload });

      if (resultado.status !== "success") {
        const motivo = {
          no_data: "No se encontraron técnicos ni OT para optimizar.",
          infeasible: "No se encontró una asignación factible con la selección actual.",
          error_api: "El servicio de optimización tuvo un error interno.",
        }[resultado.status] || `El servicio de optimización devolvió un estado inesperado (${resultado.status}).`;
        setError(`No se pudo optimizar: ${motivo}`);
        return;
      }

      const { TIPO_OT_LABEL, sumarMinutos, colorPorId } = window.RUTAS_EXTERNO_API;
      const porTecnico = {};
      (resultado.rutas || []).forEach(ruta => {
        porTecnico[ruta.tecnico_id] = {
          tecnico: {
            id: ruta.tecnico_id, nombre: ruta.nombre, tipo: ruta.tipo, zona: ruta.zona_base,
            lat: ruta.base_latitud, lng: ruta.base_longitud, color: colorPorId(ruta.tecnico_id),
            // Totales de la ruta (ya calculados por el backend con ruteo
            // real) — se muestran en la cabecera de la tarjeta de ruta.
            resumen: {
              horaSalidaBase: ruta.hora_salida_base, horaRetornoBase: ruta.hora_retorno_base,
              distanciaTotalKm: ruta.distancia_total_km, capacidadUso: ruta.capacidad_uso,
              esperaTotalMin: ruta.tiempo_espera_total_min,
            },
          },
          paradas: (ruta.paradas || []).map(p => ({
            id: p.ot_id,
            tipo: p.tipo,
            cliente: TIPO_OT_LABEL[p.tipo] || p.tipo,
            direccion: p.direccion,
            lat: p.latitud,
            lng: p.longitud,
            ventanaInicio: p.hora_programada ? sumarMinutos(p.hora_programada, -30) : "08:00",
            ventanaFin: p.hora_programada ? sumarMinutos(p.hora_programada, 30) : "18:00",
            // Hora estimada de llegada/espera — ya viene calculada con
            // ruteo real; se muestra en cada parada de la tarjeta de ruta.
            horaEstimadaLlegada: p.hora_estimada_llegada,
            esperaMin: p.espera_min || 0,
          })),
        };
      });

      // Pendientes: el diagnóstico del backend da la razón pero no el
      // cliente/dirección (eso ya lo tenemos de la selección del panel) —
      // se cruza por id para mostrar la fila completa.
      const otsSeleccionadasPorId = Object.fromEntries(otsSeleccionadas.map(o => [o.id, o]));
      const pendientes = (resultado.diagnosticos || []).map(d => {
        const ot = otsSeleccionadasPorId[d.ot_id];
        return ot ? { ...ot, razones: d.razones || [] } : {
          id: d.ot_id, cliente: TIPO_OT_LABEL[d.tipo] || d.tipo, direccion: d.sector || "—", razones: d.razones || [],
        };
      });

      const r = resultado.resumen || {};
      setResumen({
        totalOts: r.total_ots, otsAsignadas: r.ots_asignadas, otsPendientes: r.ots_pendientes,
        totalTecnicos: r.total_tecnicos, tecnicosUtilizados: r.tecnicos_utilizados,
        distanciaTotalKm: r.distancia_total_km, fuenteMatriz: r.fuente_matriz,
      });
      setPropuesta({ porTecnico, pendientes });
      setEtapa("propuesta");
    } catch (err) {
      setError(`No se pudo optimizar: ${err.message}`);
    } finally {
      setOptimizando(false);
    }
  };

  const updatePropuesta = fn => setPropuesta(prev => fn(deepClone(prev)));

  const onMoveUp = (tecnicoId, otId) => updatePropuesta(p => {
    const arr = p.porTecnico[tecnicoId].paradas;
    const i = arr.findIndex(o => o.id === otId);
    if (i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    return p;
  });
  const onMoveDown = (tecnicoId, otId) => updatePropuesta(p => {
    const arr = p.porTecnico[tecnicoId].paradas;
    const i = arr.findIndex(o => o.id === otId);
    if (i >= 0 && i < arr.length - 1) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    return p;
  });
  const onMover = (fromId, otId, toId) => updatePropuesta(p => {
    const fromArr = p.porTecnico[fromId].paradas;
    const idx = fromArr.findIndex(o => o.id === otId);
    const [ot] = fromArr.splice(idx, 1);
    p.porTecnico[toId].paradas.push(ot);
    return p;
  });
  const onEliminar = (tecnicoId, otId) => updatePropuesta(p => {
    const arr = p.porTecnico[tecnicoId].paradas;
    const idx = arr.findIndex(o => o.id === otId);
    const [ot] = arr.splice(idx, 1);
    p.pendientes.push(ot);
    return p;
  });
  const onMoverPendiente = (otId, toTecId) => updatePropuesta(p => {
    const idx = p.pendientes.findIndex(o => o.id === otId);
    const [ot] = p.pendientes.splice(idx, 1);
    p.porTecnico[toTecId].paradas.push(ot);
    return p;
  });

  const onVolver = () => { setPropuesta(null); setResumen(null); setError(null); setEtapa("seleccion"); };

  // "Confirmar plan" todavía NO escribe de vuelta en el backend (queda
  // solo en sessionStorage, como antes). El contrato tiene un flag
  // aplicar_cambios para persistir la asignación, pero re-ejecutar el
  // optimizador con ese flag en true le pide resolver el problema de
  // nuevo — puede no respetar ediciones manuales que la coordinadora ya
  // hizo acá (mover/reordenar paradas). Falta decidir cómo conciliar eso
  // antes de conectar la escritura real; por ahora es deliberadamente de
  // solo lectura hacia el backend.
  const onConfirmar = () => {
    const r = window.RUTAS_EXTERNO_OPTIMIZER.validarConfirmacion(propuesta.porTecnico);
    if (!r.ok) { setError(r.duplicado); return; } // integridad de datos — esto sí bloquea
    setConfirmados(prev => ({ ...prev, [fecha]: { porTecnico: propuesta.porTecnico, fecha } }));
    setPropuesta(null);
    setResumen(null);
    setError(null);
    setEtapa("seleccion");
    onToast?.("Plan de rutas confirmado");
  };

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div className="page-title">Asignación de rutas</div>
        </div>
      </div>

      <RegistroAsignaciones fechaInicial={fecha} />

      {etapa === "seleccion" && Object.values(confirmados)
        .filter(c => Object.values(c.porTecnico).some(({ paradas }) => paradas.length > 0))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map(c => (
          <ConfirmadoBanner key={c.fecha} confirmado={c} onEditar={() => onEditarConfirmado(c.fecha)} />
        ))}

      {cargando ? (
        <div className="card empty"><Icon name="refresh" />Cargando datos del día…</div>
      ) : errorCarga ? (
        <div className="card empty"><Icon name="alert" />No se pudo cargar técnicos/OT: {errorCarga}</div>
      ) : etapa === "seleccion" ? (
        <SeleccionPanel fecha={fecha} onFechaChange={setFecha} otsDelDia={otsDelDia} tecnicosDisponibles={tecnicosDisponibles}
          otsSel={otsSel} tecSel={tecSel} toggleOt={toggleOt} toggleTec={toggleTec}
          onToggleTodosOts={setTodosOts} onToggleTodosTec={setTodosTec} onOptimizar={onOptimizar}
          optimizando={optimizando} error={error} />
      ) : (
        <PropuestaPanel propuesta={propuesta} resumen={resumen} error={error}
          onMoveUp={onMoveUp} onMoveDown={onMoveDown} onMover={onMover} onEliminar={onEliminar}
          onMoverPendiente={onMoverPendiente}
          onVolver={onVolver} onConfirmar={onConfirmar} />
      )}
    </div>
  );
}

Object.assign(window, { RutasExternoScreen });
