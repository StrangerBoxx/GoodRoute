/* ============================================================
   Asignación de rutas — módulo del equipo de rutas
   ------------------------------------------------------------
   Todo lo relacionado a optimización/asignación de rutas vive
   acá. El backoffice solo recibe rutas ya armadas y las confirma
   (ver onConfirmRoute / onConfirmAssignment en main.jsx); no debe
   implementarse lógica de optimización fuera de esta carpeta.

   Maqueta de HU-01/02/03 (Sprint 1) — técnicos/OTs desde el mock
   real (Render); la asignación (HU-02) la calcula el servicio real
   de optimización (OR-Tools VRPTW, optimizador-demo.onrender.com,
   ver optimizarRemoto() en data.js). Se le manda la selección del
   panel — POST { tecnicos: [{id: entero, nombre, zona}], ordenes:
   [{id, direccion_instalacion}] } — el id de técnico es un entero
   propio de ese servicio, no el UUID real del mock, así que
   onOptimizar lo mapea por posición y lo traduce de vuelta al leer
   la respuesta. El contrato real de OT/técnico aún no está
   congelado; cuando exista, solo data.js debería cambiar.
   ============================================================ */

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
  const puedeOptimizar = otsCount > 0 && tecCount > 0;

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
        <span className="cell-muted" style={{ fontSize: 12.5 }}>La disponibilidad de los técnicos se carga según el día elegido.</span>
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
            <div className="rx-card-title">Técnicos Disponibles {fechaDDMMYYYY(fecha)}</div>
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
            <div className="card empty"><Icon name="techs" />No hay técnicos disponibles para el día elegido.</div>
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
          {puedeOptimizar ? "El cálculo lo hace el servicio real de optimización (OR-Tools), con la selección de aquí." : "Selecciona al menos una OT y un técnico."}
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

/* ---- Panel de propuesta + edición + confirmación (HU-02/HU-03) ---- */
function PropuestaPanel({ propuesta, error, onMoveUp, onMoveDown, onMover, onEliminar, onMoverPendiente, onVolver, onConfirmar }) {
  const tecIds = Object.keys(propuesta.porTecnico);
  return (
    <>
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

/* ---- Pantalla raíz: orquesta selección → propuesta → confirmación ---- */
function RutasExternoScreen({ onToast }) {
  // Día que se está planificando — el mock genera disponibilidad para los
  // próximos 14 días, así que no tiene que ser forzosamente "hoy". Se
  // persiste para no perderlo si solo cambiaste de pantalla.
  const [fecha, setFecha] = useState(() => rxLoad(RX_KEYS.fecha, null) || window.RUTAS_EXTERNO_API.hoyISO());

  // HU-01: técnicos disponibles y OT elegibles del día, ambos desde el mock real (Render).
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
  // Mapa fecha (ISO) -> plan confirmado de ese día. Cada día se confirma y
  // se edita por separado; todos los planes confirmados se muestran a la vez,
  // sin importar qué día esté elegido en el selector de planificación.
  const [confirmados, setConfirmados] = useState(() => rxLoad(RX_KEYS.confirmados, {}));
  const [error, setError] = useState(null);
  const [optimizando, setOptimizando] = useState(false);

  // Las OT que ya quedaron en algún plan confirmado (de cualquier día) no se
  // vuelven a ofrecer como elegibles (el write-back al mock sigue diferido
  // — esto es un filtro local para no proponer dos veces lo mismo).
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
    let activo = true;
    setCargando(true);
    setErrorCarga(null);
    Promise.all([
      window.RUTAS_EXTERNO_API.obtenerTecnicosDisponibles(fecha),
      window.RUTAS_EXTERNO_API.obtenerOtsDelDia(),
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
  }, [fecha]);

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
    setError(null);
    setEtapa("propuesta");
  };

  // La asignación (HU-02) la resuelve el servicio real de optimización
  // (OR-Tools VRPTW), mandándole la selección vigente del panel. Su
  // contrato pide el id de técnico como ENTERO propio de ese servicio, no
  // el UUID real del mock — se mapea por posición al armar el payload y se
  // traduce de vuelta al leer la respuesta (idRealPorIndice).
  const onOptimizar = async () => {
    const tecnicosSeleccionados = tecnicosDisponibles.filter(t => tecSel[t.id]);
    const otsSeleccionadas = otsDelDia.filter(o => otsSel[o.id]);
    if (!tecnicosSeleccionados.length || !otsSeleccionadas.length) {
      setError("Selecciona al menos una OT y un técnico para optimizar.");
      return;
    }

    setOptimizando(true);
    setError(null);
    try {
      const idRealPorIndice = tecnicosSeleccionados.map(t => t.id);
      const tecnicosPayload = tecnicosSeleccionados.map((t, i) => ({ id: i + 1, nombre: t.nombre, zona: t.zona }));
      const ordenesPayload = otsSeleccionadas.map(o => ({ id: o.id, direccion_instalacion: o.direccion }));

      const resultado = await window.RUTAS_EXTERNO_API.optimizarRemoto({ tecnicos: tecnicosPayload, ordenes: ordenesPayload });
      const asignaciones = resultado.asignaciones || [];
      const otIds = asignaciones.flatMap(a => a.ordenes_asignadas);
      const tecIdsReales = asignaciones.map(a => idRealPorIndice[a.tecnico_id - 1]).filter(Boolean);
      const [otsPorId, tecPorId] = await Promise.all([
        window.RUTAS_EXTERNO_API.obtenerOtsPorIds(otIds),
        window.RUTAS_EXTERNO_API.obtenerTecnicosPorIds(tecIdsReales),
      ]);

      const porTecnico = {};
      asignaciones.forEach(a => {
        const tecnicoIdReal = idRealPorIndice[a.tecnico_id - 1];
        if (!tecnicoIdReal) return; // id fuera del rango que mandamos — no debería pasar
        porTecnico[tecnicoIdReal] = {
          tecnico: tecPorId[tecnicoIdReal] || { id: tecnicoIdReal, nombre: a.tecnico_nombre, zona: "—", tipo: "externo", color: "#7a8794", lat: -33.4489, lng: -70.6693 },
          paradas: a.ordenes_asignadas.map(id => otsPorId[id]).filter(Boolean),
        };
      });

      // Pendientes: de las OTs que se seleccionaron en el panel, las que el
      // optimizador remoto no dejó asignadas a ningún técnico.
      const asignadasSet = new Set(otIds);
      const pendientes = otsDelDia.filter(o => otsSel[o.id] && !asignadasSet.has(o.id));

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

  const onVolver = () => { setPropuesta(null); setError(null); setEtapa("seleccion"); };

  const onConfirmar = () => {
    const r = window.RUTAS_EXTERNO_OPTIMIZER.validarConfirmacion(propuesta.porTecnico);
    if (!r.ok) { setError(r.duplicado); return; } // integridad de datos — esto sí bloquea
    setConfirmados(prev => ({ ...prev, [fecha]: { porTecnico: propuesta.porTecnico, fecha } }));
    setPropuesta(null);
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

      {etapa === "seleccion" && Object.values(confirmados)
        .filter(c => Object.values(c.porTecnico).some(({ paradas }) => paradas.length > 0))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map(c => (
          <ConfirmadoBanner key={c.fecha} confirmado={c} onEditar={() => onEditarConfirmado(c.fecha)} />
        ))}

      {cargando ? (
        <div className="card empty"><Icon name="refresh" />Cargando datos del día…</div>
      ) : errorCarga ? (
        <div className="card empty"><Icon name="alert" />No se pudo cargar el mock: {errorCarga}</div>
      ) : etapa === "seleccion" ? (
        <SeleccionPanel fecha={fecha} onFechaChange={setFecha} otsDelDia={otsDelDia} tecnicosDisponibles={tecnicosDisponibles}
          otsSel={otsSel} tecSel={tecSel} toggleOt={toggleOt} toggleTec={toggleTec}
          onToggleTodosOts={setTodosOts} onToggleTodosTec={setTodosTec} onOptimizar={onOptimizar}
          optimizando={optimizando} error={error} />
      ) : (
        <PropuestaPanel propuesta={propuesta} error={error}
          onMoveUp={onMoveUp} onMoveDown={onMoveDown} onMover={onMover} onEliminar={onEliminar}
          onMoverPendiente={onMoverPendiente}
          onVolver={onVolver} onConfirmar={onConfirmar} />
      )}
    </div>
  );
}

Object.assign(window, { RutasExternoScreen });
