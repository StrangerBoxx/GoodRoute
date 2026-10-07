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
  propuestaOriginal: "rutasExterno.propuestaOriginal",
  generadoEn: "rutasExterno.generadoEn",
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

// Solo para mostrar al usuario — el resto del estado sigue en ISO (YYYY-MM-DD).
function fechaDDMMYYYY(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/* ---- Helpers de fecha para la tira de días / calendario — Date nativo,
   sin librerías. Todo a mano con getFullYear/getMonth/getDate (hora
   LOCAL), nunca con toISOString() o "new Date('YYYY-MM-DD')": ambas
   interpretan el string como UTC medianoche, que en Chile (UTC-3/-4) cae
   el día ANTERIOR en horario de tarde/noche — el mismo tipo de bug que
   ya se corrigió para las horas (ver horaVista arriba), pero acá
   correría el DÍA entero, no solo la hora. ---- */
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fechaLocalISO(d) {
  const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
// "YYYY-MM-DD" -> Date a medianoche LOCAL (ver nota arriba sobre por qué
// no alcanza con new Date(iso) a secas).
function fechaDesdeISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function sumarDiasAFecha(iso, dias) {
  const d = fechaDesdeISO(iso);
  d.setDate(d.getDate() + dias);
  return fechaLocalISO(d);
}
// Lunes de la semana que contiene `iso` (semana empezando en lunes, como
// pide el calendario — la tira de 7 días usa el mismo criterio para que
// "saltar" desde el calendario a la tira sea consistente).
function lunesDeSemana(iso) {
  const d = fechaDesdeISO(iso);
  const dow = d.getDay(); // 0=domingo … 6=sábado
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return fechaLocalISO(d);
}
// "miércoles 7 de octubre" — sin año, para que coincida con el ejemplo
// pedido; la tira/calendario ya muestran el año en su propio rótulo.
function fechaLarga(iso) {
  const d = fechaDesdeISO(iso);
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}`;
}
// "martes 6 de octubre 2026" — como fechaLarga pero con año, para el
// rótulo de la cabecera de la tira (el día elegido, no el rango de la
// semana visible — antes decía solo "octubre 2026").
function fechaLargaConAnio(iso) {
  return `${fechaLarga(iso)} ${fechaDesdeISO(iso).getFullYear()}`;
}

// Las horas que entrega el backend vienen 3 horas adelantadas respecto a
// la hora real de Chile (dato confirmado, no un bug de acá) — esto
// ajusta SOLO lo que se muestra en pantalla. Los cálculos internos
// (ventanas, jornada, lo que se manda al confirmar/reprogramar) siguen
// usando la hora cruda tal cual llega del backend, sin tocar — si se
// ajustara ahí también, esas cuentas quedarían mal contra la jornada
// configurada (que usa esa misma hora cruda como referencia).
function horaVista(hhmm) {
  if (!hhmm) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h * 60 + m - 180) % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

// Qué OT cambiaron entre dos versiones de la propuesta (la corrida del
// optimizador sin editar, o el plan que ya estaba confirmado si se
// reabrió con "Editar", contra el estado actual) — se usa tanto para la
// marca visual "Editada" como para saber, al confirmar, qué OT puntuales
// hay que mandar por PATCH (ver onConfirmar) y a cuáles les falta su
// motivo de reprogramación.
//
// No alcanza con comparar el índice crudo: si se saca la 1ª parada de
// una ruta de 5, las otras 4 "corren" un lugar sin que nadie las haya
// tocado — compararlas por índice las marcaría como cambiadas sin
// serlo. Por técnico, se compara el orden relativo SOLO entre las OT que
// siguen ahí en ambas versiones, usando la subsecuencia más larga que SÍ
// mantiene el orden original entre sí (LIS) — todo lo que quede fuera de
// esa subsecuencia es lo mínimo que realmente se reordenó.
// Índices de `seq` (una lista de posiciones originales, con huecos donde
// no aplica) que SÍ respetan el orden original entre sí — la subsecuencia
// creciente más larga (LIS). Todo índice que quede fuera es lo mínimo que
// realmente se reordenó. Factorizada porque la necesitan tanto
// calcularOtIdsCambiados (global) como cambiosRutaTecnico (un solo
// técnico, para "Restablecer ruta") — mismo cálculo, dos usos distintos.
function indicesEnOrdenLIS(seq) {
  const n = seq.length;
  const largo = new Array(n).fill(1);
  const previo = new Array(n).fill(-1);
  let mejorFinal = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (seq[j] < seq[i] && largo[j] + 1 > largo[i]) { largo[i] = largo[j] + 1; previo[i] = j; }
    }
    if (largo[i] > largo[mejorFinal]) mejorFinal = i;
  }
  const enOrden = new Set();
  for (let k = mejorFinal; k !== -1; k = previo[k]) enOrden.add(k);
  return enOrden;
}

// A qué técnico (o "pendientes") pertenece cada OT en una versión de la
// propuesta — mapa id -> tid, usado por calcularOtIdsCambiados y por
// cambiosRutaTecnico para saber de dónde vino / a dónde fue cada OT.
function tecnicoDeCadaOt(p) {
  const map = {};
  Object.entries(p.porTecnico).forEach(([tid, { paradas }]) => paradas.forEach(ot => { map[ot.id] = tid; }));
  (p.pendientes || []).forEach(ot => { map[ot.id] = "pendientes"; });
  return map;
}

function calcularOtIdsCambiados(propuesta, propuestaOriginal) {
  const original = propuestaOriginal || propuesta;
  const tecOriginal = tecnicoDeCadaOt(original);
  const tecActual = tecnicoDeCadaOt(propuesta);
  const cambiados = new Set();

  // Cambio de técnico (incluye ida/vuelta de pendientes).
  const todosLosIds = new Set([...Object.keys(tecOriginal), ...Object.keys(tecActual)]);
  todosLosIds.forEach(id => { if (tecOriginal[id] !== tecActual[id]) cambiados.add(id); });

  Object.keys(propuesta.porTecnico).forEach(tid => {
    const idsOriginal = (original.porTecnico[tid]?.paradas || []).map(p => p.id).filter(id => tecActual[id] === tid);
    const idsActual = (propuesta.porTecnico[tid]?.paradas || []).map(p => p.id).filter(id => tecOriginal[id] === tid);
    if (idsOriginal.join(",") === idsActual.join(",")) return;
    const indiceOriginal = Object.fromEntries(idsOriginal.map((id, i) => [id, i]));
    const enOrden = indicesEnOrdenLIS(idsActual.map(id => indiceOriginal[id]));
    idsActual.forEach((id, i) => { if (!enOrden.has(i)) cambiados.add(id); });
  });

  return cambiados;
}

// Qué cambió en la ruta de UN técnico puntual respecto de la propuesta
// original — para "Restablecer ruta" (botón + marca en la lista + texto
// del diálogo de confirmación). A diferencia de calcularOtIdsCambiados
// (que da el conjunto global de OT cambiadas), esto separa el motivo del
// cambio en palabras: cuántas se reordenaron entre sí, cuántas salieron
// hacia otro técnico o a pendientes, cuántas entraron desde ahí — y qué
// otras rutas quedarían tocadas si se restablece esta.
function cambiosRutaTecnico(tid, propuesta, propuestaOriginal) {
  const vacio = { tieneCambios: false, reordenadas: 0, salientesAOtroTecnico: 0, salientesAPendientes: 0, entrantesDeOtroTecnico: 0, entrantesDesdePendientes: 0, otrasRutasAfectadas: [] };
  const original = propuestaOriginal || propuesta;
  const originalIds = (original.porTecnico[tid]?.paradas || []).map(p => p.id);
  const currentIds = (propuesta.porTecnico[tid]?.paradas || []).map(p => p.id);
  if (originalIds.join(",") === currentIds.join(",")) return vacio;

  const tecOriginal = tecnicoDeCadaOt(original);
  const tecActual = tecnicoDeCadaOt(propuesta);

  const entrantes = currentIds.filter(id => tecOriginal[id] !== tid);
  const salientes = originalIds.filter(id => tecActual[id] !== tid);
  const entrantesDeOtroTecnico = entrantes.filter(id => tecOriginal[id] && tecOriginal[id] !== "pendientes").length;
  const entrantesDesdePendientes = entrantes.length - entrantesDeOtroTecnico;
  const salientesAOtroTecnico = salientes.filter(id => tecActual[id] && tecActual[id] !== "pendientes").length;
  const salientesAPendientes = salientes.length - salientesAOtroTecnico;

  // De las que sigue teniendo este técnico en ambas versiones, cuántas
  // están fuera de su orden relativo original (mismo criterio LIS que
  // calcularOtIdsCambiados, pero acotado a este técnico).
  const idsOriginalQueSiguen = originalIds.filter(id => tecActual[id] === tid);
  const idsActualesQueSeguian = currentIds.filter(id => tecOriginal[id] === tid);
  let reordenadas = 0;
  if (idsOriginalQueSiguen.join(",") !== idsActualesQueSeguian.join(",")) {
    const indiceOriginal = Object.fromEntries(idsOriginalQueSiguen.map((id, i) => [id, i]));
    const enOrden = indicesEnOrdenLIS(idsActualesQueSeguian.map(id => indiceOriginal[id]));
    reordenadas = idsActualesQueSeguian.length - enOrden.size;
  }

  const otrasRutasAfectadas = new Set();
  entrantes.forEach(id => { const h = tecOriginal[id]; if (h && h !== "pendientes" && h !== tid) otrasRutasAfectadas.add(h); });
  salientes.forEach(id => { const h = tecActual[id]; if (h && h !== "pendientes" && h !== tid) otrasRutasAfectadas.add(h); });

  return {
    tieneCambios: true, reordenadas, salientesAOtroTecnico, salientesAPendientes, entrantesDeOtroTecnico, entrantesDesdePendientes,
    otrasRutasAfectadas: Array.from(otrasRutasAfectadas),
  };
}

// Texto humano del resumen de cambios ("2 paradas reordenadas, 1 movida a
// otro técnico") — usado en la cabecera del panel de detalle y en el
// diálogo de confirmación de "Restablecer ruta".
function resumenCambiosTexto(c) {
  const n = (num, sing, plur) => `${num} ${num === 1 ? sing : plur}`;
  const partes = [];
  if (c.reordenadas > 0) partes.push(n(c.reordenadas, "parada reordenada", "paradas reordenadas"));
  if (c.salientesAOtroTecnico > 0) partes.push(n(c.salientesAOtroTecnico, "movida a otro técnico", "movidas a otro técnico"));
  if (c.salientesAPendientes > 0) partes.push(n(c.salientesAPendientes, "quitada de la ruta", "quitadas de la ruta"));
  if (c.entrantesDeOtroTecnico > 0) partes.push(n(c.entrantesDeOtroTecnico, "recibida de otro técnico", "recibidas de otro técnico"));
  if (c.entrantesDesdePendientes > 0) partes.push(n(c.entrantesDesdePendientes, "agregada desde pendientes", "agregadas desde pendientes"));
  return partes.join(", ");
}

// Total de cambios (para "Se van a descartar N cambios…" en el diálogo).
function totalCambios(c) {
  return c.reordenadas + c.salientesAOtroTecnico + c.salientesAPendientes + c.entrantesDeOtroTecnico + c.entrantesDesdePendientes;
}

// Busca una OT por id en toda la propuesta (en la ruta de cualquier
// técnico, o en pendientes) — para mostrar su dirección/cliente en el
// popup de motivo de reprogramación.
function buscarOtEnPropuesta(propuesta, otId) {
  if (!propuesta || !otId) return null;
  for (const { paradas } of Object.values(propuesta.porTecnico)) {
    const encontrada = paradas.find(p => p.id === otId);
    if (encontrada) return encontrada;
  }
  return (propuesta.pendientes || []).find(p => p.id === otId) || null;
}

// Vocabulario cerrado del motivo de reprogramación (HU-18) — se pide al
// volver a confirmar un plan que ya estaba confirmado (ver esReedicion
// en RutasExternoScreen). "Otro" habilita un texto libre al lado.
const MOTIVOS_REPROGRAMACION = [
  "Cliente No Disponible", "Falta de Coordinación", "Técnico No Disponible",
  "Falta de Tiempo", "Problema de Ruta", "Problema Técnico",
  "Dirección Incorrecta", "Cliente Solicitó Cambio", "Otro",
];

// Popup obligatorio: aparece apenas se mueve/reordena/saca una OT de un
// plan YA confirmado (reprogramación) y el cambio no dio error — cada OT
// tocada necesita su propio motivo, no uno solo para todo el plan. Sin
// botón de cancelar: el cambio ya se aplicó en pantalla, lo único que
// falta es documentar por qué.
function MotivoReprogramacionModal({ ot, onGuardar }) {
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  const puedeGuardar = motivo && (motivo !== "Otro" || otro.trim());
  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Motivo de reprogramación</div>
            <div className="modal-sub">{ot ? `${ot.id} · ${ot.cliente || ""}${ot.direccion ? " — " + ot.direccion : ""}` : ""}</div>
          </div>
        </div>
        <div className="modal-body">
          <div className="field">
            <div className="field-label">Motivo</div>
            <select className="field-input" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus>
              <option value="">Selecciona un motivo…</option>
              {MOTIVOS_REPROGRAMACION.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {motivo === "Otro" && (
            <div className="field" style={{ marginTop: 12 }}>
              <div className="field-label">Especifica el motivo</div>
              <input className="field-input" value={otro} onChange={e => setOtro(e.target.value)} autoFocus />
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" disabled={!puedeGuardar} onClick={() => onGuardar(motivo === "Otro" ? otro.trim() : motivo)}>
            <Icon name="check" />Guardar motivo
          </button>
        </div>
      </div>
    </div>
  );
}

// Confirmación antes de "Restablecer ruta" (destructivo, sin deshacer):
// dice cuántos cambios se pierden y, si el único cambio fue reordenar, lo
// dice explícitamente en vez de un texto genérico. Si restablecer esta
// ruta implica devolver/quitar OT en la ruta de otro técnico (porque se
// movieron entre ambos), lo avisa por nombre antes de aplicar nada.
function ConfirmarRestablecerModal({ tecnico, cambios, otrasRutasNombres, onConfirmar, onCancelar }) {
  const total = totalCambios(cambios);
  const soloReordeno = total > 0 && total === cambios.reordenadas;
  return (
    <div className="overlay" onClick={onCancelar}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Restablecer ruta</div>
            <div className="modal-sub">
              {soloReordeno
                ? `Se va a deshacer el reordenamiento de ${total} ${total === 1 ? "parada" : "paradas"} en la ruta de ${tecnico.nombre}.`
                : `Se van a descartar ${total} ${total === 1 ? "cambio" : "cambios"} en la ruta de ${tecnico.nombre}: ${resumenCambiosTexto(cambios)}.`}
            </div>
          </div>
        </div>
        <div className="modal-body">
          <Badge cls="b-amber" icon="alert">Esta acción no se puede deshacer</Badge>
          {otrasRutasNombres.length > 0 && (
            <div className="cell-muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              También se va a actualizar la ruta de <b style={{ color: "var(--text)" }}>{otrasRutasNombres.join(" y ")}</b>, porque {otrasRutasNombres.length === 1 ? "recibe o entrega" : "reciben o entregan"} alguna de estas OT.
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" onClick={onConfirmar}><Icon name="refresh" />Restablecer ruta</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Tarjeta de un día en la tira de 7 (CAMBIO 1) ---- */
function DiaCard({ iso, seleccionado, esHoy, deshabilitado, confirmadas, porAsignar, onClick }) {
  const d = fechaDesdeISO(iso);
  const sinOt = confirmadas === 0 && porAsignar === 0;
  const estadoTexto = confirmadas > 0 ? `${confirmadas} confirmada${confirmadas === 1 ? "" : "s"}` : porAsignar > 0 ? `${porAsignar} por asignar` : "sin OT";
  return (
    <button type="button" className={"dia-card" + (seleccionado ? " selected" : "") + (sinOt ? " sin-ot" : "")}
      disabled={deshabilitado} onClick={onClick}
      title={`${fechaLarga(iso)} · ${estadoTexto}`}>
      {esHoy && <span className="dia-card-hoy">HOY</span>}
      <div className="dia-card-dow">{DIAS_CORTOS[d.getDay()]}</div>
      <div className="dia-card-num">{d.getDate()}</div>
      <div className="dia-card-estado">
        {confirmadas > 0 && <span className="dia-dot dia-dot-verde" />}
        {confirmadas === 0 && porAsignar > 0 && <span className="dia-dot dia-dot-ambar" />}
        <span>{estadoTexto}</span>
      </div>
    </button>
  );
}

/* ---- Calendario mensual emergente — "Ir a una fecha" (CAMBIO 2) ----
   Abierto desde TiraDias. Se cierra con Escape o clic afuera (mismo
   patrón que RxMoveMenu: listener en window + stopPropagation en el
   propio popup), nunca al navegar de mes (los botones de mes están
   adentro del popup, así que ese clic nunca llega al listener de
   window). */
function CalendarioPopover({ fecha, onSeleccionar, onCerrar, estadoDelDia, fechaMin, fechaMax }) {
  const [mesVisible, setMesVisible] = useState(() => {
    const d = fechaDesdeISO(fecha);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onCerrar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onCerrar);
    };
  }, []);

  const anio = mesVisible.getFullYear(), mes = mesVisible.getMonth();
  const inicioGrilla = lunesDeSemana(fechaLocalISO(new Date(anio, mes, 1)));
  // 6 semanas (42 días) alcanzan siempre para un mes completo empezando
  // en lunes, sea cual sea el día en que caiga el 1º.
  const celdas = Array.from({ length: 42 }, (_, i) => sumarDiasAFecha(inicioGrilla, i));
  const hoy = window.RUTAS_EXTERNO_API.hoyISO();

  return (
    <div className="rx-calendario" role="dialog" aria-label="Elegir fecha" onClick={e => e.stopPropagation()}>
      <div className="rx-calendario-head">
        <button type="button" className="rx-tira-nav-btn" aria-label="Mes anterior" onClick={() => setMesVisible(new Date(anio, mes - 1, 1))}>
          <Icon name="chevR" style={{ transform: "rotate(180deg)" }} />
        </button>
        <span className="rx-calendario-mes">{MESES_LARGOS[mes]} {anio}</span>
        <button type="button" className="rx-tira-nav-btn" aria-label="Mes siguiente" onClick={() => setMesVisible(new Date(anio, mes + 1, 1))}>
          <Icon name="chevR" />
        </button>
      </div>
      <div className="rx-calendario-dow">
        {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="rx-calendario-grid">
        {celdas.map(iso => {
          const d = fechaDesdeISO(iso);
          const delMes = d.getMonth() === mes;
          const deshabilitado = iso < fechaMin || iso > fechaMax;
          const { confirmadas, porAsignar } = estadoDelDia(iso);
          const estadoTexto = confirmadas > 0 ? `${confirmadas} confirmada${confirmadas === 1 ? "" : "s"}` : porAsignar > 0 ? `${porAsignar} por asignar` : "sin OT";
          return (
            <button key={iso} type="button"
              className={"rx-calendario-dia" + (iso === fecha ? " selected" : "") + (iso === hoy ? " hoy" : "") + (!delMes ? " fuera-de-mes" : "")}
              disabled={deshabilitado}
              title={`${fechaLarga(iso)} · ${estadoTexto}`}
              onClick={() => onSeleccionar(iso)}>
              <span>{d.getDate()}</span>
              {confirmadas > 0 && <span className="dia-dot dia-dot-verde" />}
              {confirmadas === 0 && porAsignar > 0 && <span className="dia-dot dia-dot-ambar" />}
            </button>
          );
        })}
      </div>
      <div className="rx-calendario-leyenda">
        <span><span className="dia-dot dia-dot-verde" />Confirmadas</span>
        <span><span className="dia-dot dia-dot-ambar" />Por asignar</span>
      </div>
    </div>
  );
}

/* ---- Tira de 7 días + navegación + disparador del calendario ----
   La fecha es el contexto de TODA la pantalla (selección y propuesta),
   no un campo más del formulario — por eso vive en RutasExternoScreen,
   arriba de ambos paneles, en vez de adentro de SeleccionPanel. */
function TiraDias({ fecha, onSeleccionar, estadoDelDia, fechaMin, fechaMax, conResumen = true, otsPorAsignarCount, tecnicosCount, totalConfirmadas, onVerConfirmadas }) {
  const [anchor, setAnchor] = useState(() => lunesDeSemana(fecha));
  const [calAbierto, setCalAbierto] = useState(false);
  const hoy = window.RUTAS_EXTERNO_API.hoyISO();
  const esHoy = fecha === hoy;
  const confirmado = totalConfirmadas > 0;

  // Si la fecha seleccionada cambia desde afuera (botón "Hoy", calendario,
  // o entrar directo a editar un día confirmado) y cae fuera de la
  // semana visible, la tira se corre sola hasta esa semana — nunca puede
  // quedar una tira que no incluya el día seleccionado.
  useEffect(() => {
    const fin = sumarDiasAFecha(anchor, 6);
    if (fecha < anchor || fecha > fin) setAnchor(lunesDeSemana(fecha));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  const dias = Array.from({ length: 7 }, (_, i) => sumarDiasAFecha(anchor, i));
  const fin = dias[6];

  const irAFecha = iso => { onSeleccionar(iso); setCalAbierto(false); };

  return (
    <div className="rx-tira">
      <div className="rx-tira-head">
        <div className="rx-tira-nav">
          <button type="button" className="rx-tira-nav-btn" aria-label="Día anterior" disabled={fecha <= fechaMin}
            onClick={() => onSeleccionar(sumarDiasAFecha(fecha, -1))}>
            <Icon name="chevR" style={{ transform: "rotate(180deg)" }} />
          </button>
          <span className="rx-tira-mes">{fechaLargaConAnio(fecha)}</span>
          <button type="button" className="rx-tira-nav-btn" aria-label="Día siguiente" disabled={fecha >= fechaMax}
            onClick={() => onSeleccionar(sumarDiasAFecha(fecha, 1))}>
            <Icon name="chevR" />
          </button>
        </div>

        {/* Resumen del día elegido (CAMBIO 3) — vive acá, en la misma
            cabecera que la navegación y el calendario, no en una franja
            aparte debajo de la tira. El día ya se dice arriba, en
            rx-tira-mes — acá solo lo que hay ese día. No aplica en
            pantallas que solo usan la tira como selector de fecha (ej.
            "Rutas confirmadas", que ya tiene su propio resumen de
            resultados más abajo) — ahí conResumen=false y este bloque se
            reemplaza por un espaciador para que Hoy/Ir a una fecha sigan
            quedando a la derecha. */}
        {conResumen ? (
          <div className="rx-tira-resumen">
            <span className="cell-muted">
              {confirmado
                ? `${totalConfirmadas} OT ya asignada${totalConfirmadas === 1 ? "" : "s"}`
                : `${otsPorAsignarCount} OT sin asignar · ${tecnicosCount} técnicos disponibles`}
            </span>
            {confirmado && <button className="btn btn-sm" onClick={onVerConfirmadas}>Ver / Editar</button>}
          </div>
        ) : <div style={{ flex: 1 }} />}

        <div className="rx-tira-acciones">
          <button type="button" className="btn btn-sm" disabled={esHoy} onClick={() => onSeleccionar(hoy)}>Hoy</button>
          <div style={{ position: "relative" }}>
            <button type="button" className="btn btn-sm" aria-expanded={calAbierto}
              onClick={e => { e.stopPropagation(); setCalAbierto(v => !v); }}>
              <Icon name="calendar" />Ir a una fecha
            </button>
            {calAbierto && (
              <CalendarioPopover fecha={fecha} onSeleccionar={irAFecha} onCerrar={() => setCalAbierto(false)}
                estadoDelDia={estadoDelDia} fechaMin={fechaMin} fechaMax={fechaMax} />
            )}
          </div>
        </div>
      </div>
      <div className="rx-tira-dias">
        {dias.map(iso => {
          const { confirmadas, porAsignar } = estadoDelDia(iso);
          return (
            <DiaCard key={iso} iso={iso} seleccionado={iso === fecha} esHoy={iso === hoy}
              deshabilitado={iso < fechaMin || iso > fechaMax}
              confirmadas={confirmadas} porAsignar={porAsignar}
              onClick={() => onSeleccionar(iso)} />
          );
        })}
      </div>
    </div>
  );
}

// Confirmación antes de cambiar de día con una propuesta sin confirmar
// todavía en pantalla — cambiar de fecha la descarta (está ligada al día
// que se estaba editando), así que se avisa antes en vez de perderla
// en silencio.
function ConfirmarCambioFechaModal({ onConfirmar, onCancelar }) {
  return (
    <div className="overlay" onClick={onCancelar}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Cambiar de día</div>
            <div className="modal-sub">Hay una propuesta sin confirmar para el día actual. Si cambiás de fecha, se descarta.</div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancelar}>Seguir editando</button>
          <button className="btn btn-primary" onClick={onConfirmar}>Cambiar de día igual</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Panel de selección (HU-01) ---- */
function SeleccionPanel({ fecha, otsDelDia, tecnicosDisponibles, otsSel, tecSel, toggleOt, toggleTec, onToggleTodosOts, onToggleTodosTec, onOptimizar, onAsignacionManual, optimizando, error, diaConfirmado }) {
  const otsCount = otsDelDia.filter(o => otsSel[o.id]).length;
  const tecCount = tecnicosDisponibles.filter(t => tecSel[t.id]).length;
  // La asignación manual no pasa por el optimizador, así que no depende
  // de que ese servicio esté disponible — solo de tener algo seleccionado.
  const haySeleccion = otsCount > 0 && tecCount > 0;
  const puedeOptimizar = OPTIMIZADOR_DISPONIBLE && haySeleccion;

  return (
    <>
      {error && (
        <div className="card" style={{ borderColor: "var(--red-fg)", background: "var(--accent-softer)", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 16 }}>
          <Icon name="alert" style={{ width: 18, height: 18, color: "var(--red-fg)", flex: "none" }} />
          <span>{error}</span>
        </div>
      )}

      {/* Si no hay ninguna OT programada para este día, no tiene sentido
          mostrar dos listas vacías (ni una lista de técnicos sin nada que
          asignarles) — un solo estado vacío que lo diga y empuje a
          cambiar de día en la tira de arriba. */}
      {otsDelDia.length === 0 ? (
        <div className="card empty" style={{ marginBottom: 16 }}>
          <Icon name="inbox" />No hay OT programadas para el {fechaLarga(fecha)} — elegí otro día en la tira de arriba.
        </div>
      ) : (
        <div className="rx-grid">
          <div className="card card-pad">
            <div className="rx-card-head">
              <div className="rx-card-title">OTs por Asignar</div>
              <div className="row-flex" style={{ gap: 10 }}>
                <button className="btn btn-sm" onClick={() => onToggleTodosOts(otsCount < otsDelDia.length)}>
                  {otsCount < otsDelDia.length ? "Seleccionar todo" : "Deseleccionar todo"}
                </button>
                <span className="rx-card-count">{otsCount} / {otsDelDia.length} seleccionadas</span>
              </div>
            </div>
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
                  <span className="badge b-slate" style={{ flex: "none" }}><Icon name="clock" />{ot.horaProgramada ? horaVista(ot.horaProgramada) : "Sin hora"}</span>
                </label>
              ))}
            </div>
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
      )}

      <div className="rx-actions">
        <button className="btn btn-primary" disabled={optimizando || !puedeOptimizar} onClick={onOptimizar}>
          {optimizando ? <span className="icon-spin"><Icon name="refresh" /></span> : <Icon name="zap" />}
          {optimizando ? "Optimizando…" : diaConfirmado ? "Volver a optimizar" : "Optimizar planificación"}
        </button>
        <button className="btn" disabled={optimizando || !haySeleccion} onClick={onAsignacionManual}
          title="Arma la propuesta directo de la selección, sin correr el optimizador, para asignar las OT a mano">
          <Icon name="edit" />Asignación manual
        </button>
        {(!OPTIMIZADOR_DISPONIBLE || !haySeleccion) && (
          <span className="cell-muted" style={{ fontSize: 12.5 }}>
            {!haySeleccion
              ? "Selecciona al menos una OT y un técnico."
              : "El servicio de optimización está en actualización — la asignación manual sigue disponible."}
          </span>
        )}
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

/* ---- Lista maestra: técnicos con ruta asignada (layout maestro/detalle) ---- */
function TecnicoRouteList({ tecIds, propuesta, selectedId, onSelect, cambiosPorTecnico }) {
  return (
    <div className="card rx-tech-list">
      {tecIds.map(tid => {
        const { tecnico, paradas } = propuesta.porTecnico[tid];
        const activo = tid === selectedId;
        const modificada = cambiosPorTecnico && cambiosPorTecnico[tid] && cambiosPorTecnico[tid].tieneCambios;
        return (
          <button key={tid} type="button" className={"rx-tech-item" + (activo ? " active" : "")}
            aria-pressed={activo} onClick={() => onSelect(tid)}>
            <Avatar name={tecnico.nombre.split(" ").map(p => p[0]).join("").slice(0, 2)} size="md" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row-flex" style={{ gap: 6 }}>
                <div className="rx-tech-item-name">{tecnico.nombre}</div>
                {/* Marca discreta de "esta ruta ya no es la que entregó el
                    optimizador" — sin texto, solo para que se note que
                    "Restablecer ruta" tiene algo que hacer acá. */}
                {modificada && <span className="rx-tech-item-dot" title="Ruta modificada respecto del original" />}
              </div>
              <div className="rx-tech-item-sub">{tecnico.tipo === "interno" ? "Interno" : "Externo"} · {tecnico.zona}</div>
            </div>
            <span className="rx-tech-item-count">{paradas.length}</span>
          </button>
        );
      })}
    </div>
  );
}

// Evita repetir, en cada parada, la comuna del técnico que ya está en la
// cabecera — las direcciones llegan como "<calle>, <comuna>"; si el
// último tramo coincide con la zona base del técnico, se muestra solo la
// calle (ej. un técnico de Viña con una parada en Quilpué SÍ la muestra,
// porque ahí no coinciden).
function direccionParada(direccion, zonaTecnico) {
  if (!direccion) return direccion;
  const idx = direccion.lastIndexOf(",");
  if (idx === -1 || !zonaTecnico) return direccion;
  const calle = direccion.slice(0, idx).trim();
  const comuna = direccion.slice(idx + 1).trim();
  return comuna.toLowerCase() === zonaTecnico.trim().toLowerCase() ? calle : direccion;
}

/* ---- Métrica chica de la franja de resumen del panel de detalle ---- */
function RxMetric({ value, label }) {
  if (value == null || value === "") return null;
  return (
    <div className="rx-metric">
      <div className="rx-metric-value">{value}</div>
      <div className="rx-metric-label">{label}</div>
    </div>
  );
}

/* ---- Panel de detalle: la ruta del técnico seleccionado, y solo esa (HU-03) ---- */
function TecnicoRouteDetail({ tecnico, paradas, otrosTecnicos, recalculando, otIdsCambiados, errorTecnico, cambios, otrasRutasNombres, onMoveUp, onMoveDown, onMover, onEliminar, onRestablecer }) {
  const [menuFor, setMenuFor] = useState(null);
  const [confirmandoReset, setConfirmandoReset] = useState(false);

  // El mensaje se borra del estado (ver mostrarErrorTecnico) a los pocos
  // segundos, pero acá se lo mantiene montado un ratito más para que se
  // desvanezca con transición en vez de desaparecer de golpe.
  const [errorMostrado, setErrorMostrado] = useState(null);
  const [errorSaliendo, setErrorSaliendo] = useState(false);
  useEffect(() => {
    if (errorTecnico) {
      setErrorMostrado(errorTecnico);
      setErrorSaliendo(false);
    } else if (errorMostrado) {
      setErrorSaliendo(true);
      const t = setTimeout(() => { setErrorMostrado(null); setErrorSaliendo(false); }, 300);
      return () => clearTimeout(t);
    }
  }, [errorTecnico]);

  return (
    <div className={"route-card rx-detail" + (menuFor ? " menu-open" : "")}>
      <div className="route-head">
        <Avatar name={tecnico.nombre.split(" ").map(p => p[0]).join("").slice(0, 2)} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-flex" style={{ gap: 8 }}>
            <span className="route-name">{tecnico.nombre}</span>
            <Badge cls={tecnico.tipo === "interno" ? "b-blue" : "b-slate"} dot={false}>{tecnico.tipo === "interno" ? "Interno" : "Externo"}</Badge>
          </div>
          <div className="route-zone"><Icon name="pin" style={{ width: 12, height: 12 }} />{tecnico.zona}</div>
          {/* Qué cambió respecto de lo que entregó el optimizador, en
              palabras — para que el botón de restablecer tenga sentido
              antes de necesitarlo. */}
          {cambios && cambios.tieneCambios && (
            <div className="rx-cambios-resumen"><Icon name="alert" style={{ width: 11, height: 11 }} />{resumenCambiosTexto(cambios)}</div>
          )}
        </div>
        <button className="btn btn-sm" disabled={!cambios || !cambios.tieneCambios}
          title={cambios && cambios.tieneCambios ? "Volver esta ruta a como la entregó el optimizador" : "Esta ruta no tiene cambios respecto del original"}
          onClick={() => setConfirmandoReset(true)}>
          <Icon name="refresh" />Restablecer ruta
        </button>
        <div className="route-count"><b>{paradas.length}</b> OT</div>
      </div>

      {confirmandoReset && (
        <ConfirmarRestablecerModal tecnico={tecnico} cambios={cambios} otrasRutasNombres={otrasRutasNombres || []}
          onCancelar={() => setConfirmandoReset(false)}
          onConfirmar={() => { setConfirmandoReset(false); onRestablecer(); }} />
      )}

      {tecnico.resumen && (
        <div className="rx-metrics" style={{ opacity: recalculando ? 0.55 : 1, transition: "opacity .12s" }}>
          {/* Ventana PROGRAMADA (1ª a última parada, fijas) — no la
              estimada de llegada, que puede caer hasta 30 min antes. Con
              una sola OT, 1ª y última son la misma: se muestra una sola
              hora en vez de un rango "09:00–09:00". */}
          <RxMetric value={paradas.length} label="Paradas" />
          <RxMetric
            value={
              paradas.length === 1
                ? (paradas[0].horaProgramada ? horaVista(paradas[0].horaProgramada) : null)
                : (paradas[0].horaProgramada || paradas[paradas.length - 1].horaProgramada)
                  ? `${paradas[0].horaProgramada ? horaVista(paradas[0].horaProgramada) : "—"}–${paradas[paradas.length - 1].horaProgramada ? horaVista(paradas[paradas.length - 1].horaProgramada) : "—"}`
                  : null
            }
            label="Ventana horaria" />
          <RxMetric value={tecnico.resumen.distanciaTotalKm != null ? tecnico.resumen.distanciaTotalKm.toFixed(1) + " km" : "—"} label="Km recorridos" />
          <RxMetric value={tecnico.resumen.capacidadUso || `${paradas.length}/?`} label="Capacidad" />
          {tecnico.resumen.esperaTotalMin > 0 && (
            <div className="rx-metric">
              <span className="badge b-amber">{tecnico.resumen.esperaTotalMin} min</span>
              <div className="rx-metric-label">Espera</div>
            </div>
          )}
        </div>
      )}

      {(errorMostrado || recalculando) && (
        <div className="row-flex" style={{ gap: 16, flexWrap: "wrap", padding: "10px 18px 0", fontSize: 12 }}>
          {errorMostrado && (
            <span className={"row-flex rx-error-tecnico" + (errorSaliendo ? " saliendo" : "")} style={{ gap: 5, color: "var(--amber-fg)", fontWeight: 600 }}>
              <Icon name="alert" style={{ width: 12, height: 12 }} />{errorMostrado}
            </span>
          )}
          {recalculando && (
            <span className="row-flex" style={{ gap: 5, color: "var(--text-3)" }}>
              <span className="icon-spin"><Icon name="refresh" style={{ width: 11, height: 11 }} /></span>Actualizando…
            </span>
          )}
        </div>
      )}

      {paradas.length === 0 ? (
        <div className="card empty"><Icon name="checkC" />Sin OTs asignadas.</div>
      ) : (
        <div className="route-stops">
          {paradas.map((ot, i) => {
            const cambiada = otIdsCambiados && otIdsCambiados.has(ot.id);
            return (
            <div key={ot.id} className={"route-stop" + (cambiada ? " route-stop-cambiada" : "")}>
              <div className="stop-n">{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-flex" style={{ gap: 7 }}>
                  <span className="id-pill">{ot.id}</span>
                  <span className="stop-cliente">{ot.cliente}</span>
                  {cambiada && <Badge cls="b-amber" dot={false}>Editada</Badge>}
                </div>
                <div className="stop-dir"><Icon name="pin" style={{ width: 12, height: 12 }} />{direccionParada(ot.direccion, tecnico.zona)}</div>
              </div>
              {ot.horaProgramada && (
                <span className="badge b-slate" style={{ flex: "none" }}><Icon name="clock" />{horaVista(ot.horaProgramada)}</span>
              )}
              <div className="rx-stop-actions">
                <button className="btn btn-sm" disabled={i === 0} onClick={() => onMoveUp(tecnico.id, ot.id)} title="Subir"><Icon name="chevD" style={{ transform: "rotate(180deg)" }} /></button>
                <button className="btn btn-sm" disabled={i === paradas.length - 1} onClick={() => onMoveDown(tecnico.id, ot.id)} title="Bajar"><Icon name="chevD" /></button>
                <div style={{ position: "relative" }}>
                  <button className="btn btn-sm" disabled={otrosTecnicos.length === 0}
                    title={otrosTecnicos.length === 0 ? "No hay otro técnico en esta propuesta para moverla" : "Mover a otro técnico"}
                    onClick={(ev) => { ev.stopPropagation(); setMenuFor(menuFor === ot.id ? null : ot.id); }}><Icon name="techs" /></button>
                  {menuFor === ot.id && (
                    <RxMoveMenu otros={otrosTecnicos} onClose={() => setMenuFor(null)}
                      onMove={(toId) => { setMenuFor(null); onMover(tecnico.id, ot.id, toId); }} />
                  )}
                </div>
                <button className="dev-remove" title="Quitar de la ruta" onClick={() => onEliminar(tecnico.id, ot.id)}><Icon name="x" style={{ width: 15, height: 15 }} /></button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Causa clasificada real, entregada por el optimizador (HU-16) en
// causa_principal/causas[] de cada diagnóstico — ya no hace falta parsear
// el prefijo del texto libre de "razones".
const CAUSA_LABEL = {
  georreferencia: "Georreferencia",
  sectorial: "Sector",
  temporal: "Horario",
  capacidad: "Capacidad",
  optimizacion: "Optimización",
};

/* ---- Fila de OT pendiente/no asignable, con botón "Mover" a un técnico ---- */
function PendienteRow({ ot, tecnicos, onMover, cambiada }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  return (
    <div className="rx-check-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row-flex" style={{ gap: 7 }}>
          <span className="id-pill">{ot.id}</span>
          <span className="cell-strong">{ot.cliente}</span>
          {ot.causaPrincipal && <Badge cls="b-amber">{CAUSA_LABEL[ot.causaPrincipal] || ot.causaPrincipal}</Badge>}
          {cambiada && <Badge cls="b-amber" dot={false}>Editada</Badge>}
        </div>
        <div className="stop-dir"><Icon name="pin" style={{ width: 12, height: 12 }} />{ot.direccion}</div>
        {(ot.causas || []).map((c, i) => (
          <div key={i} className="stop-dir" style={{ color: "var(--amber-fg)", alignItems: "flex-start" }}>
            <Icon name="alert" style={{ width: 12, height: 12, marginTop: 2, flex: "none" }} />
            <span><b style={{ fontWeight: 700 }}>{CAUSA_LABEL[c.categoria] || c.categoria}: </b>{c.detalle}</span>
          </div>
        ))}
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
      {resumen.otsPendientes > 0 && resumen.pendientesPorCausa && (
        <span className="cell-muted" style={{ fontSize: 12.5 }}>
          {Object.entries(resumen.pendientesPorCausa)
            .filter(([, n]) => n > 0)
            .map(([causa, n]) => `${n} por ${CAUSA_LABEL[causa] || causa}`)
            .join(" · ")}
        </span>
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
function PropuestaPanel({ propuesta, propuestaOriginal, resumen, error, recalculando, erroresTecnico, confirmando, onMoveUp, onMoveDown, onMover, onEliminar, onMoverPendiente, onVolver, onConfirmar, onRestablecerRuta, esReedicion, motivosPorOt }) {
  const tecIds = Object.keys(propuesta.porTecnico);
  const tecIdsConTarjeta = tecIds.filter(id => propuesta.porTecnico[id].paradas.length > 0);
  const tecIdsSinTarjeta = tecIds.filter(id => propuesta.porTecnico[id].paradas.length === 0);
  // Orden en el que se ofrecen en el menú "Mover a…": primero los
  // técnicos con ruta, en el mismo orden en que aparecen en la lista
  // maestra (izquierda) — un único listado vertical, así que ese orden
  // YA es el orden visual (sin la ambigüedad del masonry de 2 columnas
  // de antes). Los sin OTs todavía van al final.
  const ordenTecnicos = [...tecIdsConTarjeta, ...tecIdsSinTarjeta];

  // Qué OT cambiaron respecto al punto de partida — solo visual acá, para
  // que se note de un vistazo qué se movió/reordenó/sacó y qué sigue
  // exactamente igual (ver calcularOtIdsCambiados arriba).
  const otIdsCambiados = useMemo(() => calcularOtIdsCambiados(propuesta, propuestaOriginal), [propuesta, propuestaOriginal]);
  // Cuántas de las OT que cambiaron todavía no tienen su motivo de
  // reprogramación guardado (se pide con un popup apenas se edita cada
  // una — esto es solo para avisar si quedó alguna sin responder).
  const otsFaltanMotivo = esReedicion
    ? Array.from(otIdsCambiados).filter(id => !(motivosPorOt && motivosPorOt[id])).length
    : 0;
  // Qué cambió en la ruta de CADA técnico respecto del original — para la
  // marca en la lista maestra y para habilitar/explicar "Restablecer
  // ruta" en el panel de detalle (ver cambiosRutaTecnico arriba).
  const cambiosPorTecnico = useMemo(
    () => Object.fromEntries(tecIdsConTarjeta.map(tid => [tid, cambiosRutaTecnico(tid, propuesta, propuestaOriginal)])),
    [propuesta, propuestaOriginal, tecIdsConTarjeta.join(",")]
  );

  // Técnico seleccionado en la lista maestra (izquierda) — arranca en el
  // primero; si deja de tener OTs (se le quitó la última) o deja de
  // existir, cae al primero que sí tenga.
  const [selectedTecId, setSelectedTecId] = useState(null);
  const tecIdsConTarjetaKey = tecIdsConTarjeta.join(",");
  useEffect(() => {
    if (!tecIdsConTarjeta.includes(selectedTecId)) setSelectedTecId(tecIdsConTarjeta[0] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tecIdsConTarjetaKey]);

  return (
    <>
      <ResumenCorrida resumen={resumen} />

      {error && (
        <div className="card" style={{ borderColor: "var(--red-fg)", background: "var(--accent-softer)", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 16 }}>
          <Icon name="alert" style={{ width: 18, height: 18, color: "var(--red-fg)", flex: "none" }} />
          <span>{error}</span>
        </div>
      )}

      {tecIdsConTarjeta.length === 0 ? (
        <div className="card empty"><Icon name="checkC" />Ningún técnico tiene OTs asignadas todavía.</div>
      ) : (
        <div className="rx-master-detail">
          <TecnicoRouteList tecIds={tecIdsConTarjeta} propuesta={propuesta} selectedId={selectedTecId} onSelect={setSelectedTecId} cambiosPorTecnico={cambiosPorTecnico} />
          {selectedTecId && propuesta.porTecnico[selectedTecId] && (() => {
            const { tecnico, paradas } = propuesta.porTecnico[selectedTecId];
            // Para "Mover" se ofrecen TODOS los técnicos de la propuesta
            // (no solo los que ya tienen ruta armada) — así una OT se
            // puede mandar a un técnico que hoy está vacío.
            const otros = ordenTecnicos.filter(id => id !== selectedTecId).map(id => propuesta.porTecnico[id].tecnico);
            const cambios = cambiosPorTecnico[selectedTecId];
            const otrasRutasNombres = (cambios?.otrasRutasAfectadas || []).map(id => propuesta.porTecnico[id]?.tecnico.nombre).filter(Boolean);
            return (
              <TecnicoRouteDetail tecnico={tecnico} paradas={paradas} otrosTecnicos={otros}
                recalculando={!!(recalculando && recalculando[selectedTecId])} otIdsCambiados={otIdsCambiados}
                errorTecnico={erroresTecnico && erroresTecnico[selectedTecId]}
                cambios={cambios} otrasRutasNombres={otrasRutasNombres}
                onMoveUp={onMoveUp} onMoveDown={onMoveDown} onMover={onMover} onEliminar={onEliminar}
                onRestablecer={() => onRestablecerRuta(selectedTecId)} />
            );
          })()}
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
                tecnicos={ordenTecnicos.map(id => propuesta.porTecnico[id].tecnico)}
                onMover={onMoverPendiente} cambiada={otIdsCambiados.has(ot.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="rx-actions">
        <button className="btn" onClick={onVolver} disabled={confirmando}><Icon name="arrowL" />Volver a selección</button>
        {esReedicion && otsFaltanMotivo > 0 && (
          <span className="cell-muted" style={{ fontSize: 12.5, marginLeft: "auto", color: "var(--amber-fg)" }}>
            <Icon name="alert" style={{ width: 13, height: 13 }} />{" "}
            Falta el motivo de {otsFaltanMotivo} OT — se pide apenas se edita cada una.
          </span>
        )}
        <button className="btn btn-primary" onClick={onConfirmar} disabled={confirmando || (esReedicion && otsFaltanMotivo > 0)} style={esReedicion && otsFaltanMotivo === 0 ? { marginLeft: "auto" } : undefined}>
          {confirmando ? <span className="icon-spin"><Icon name="refresh" /></span> : <Icon name="check" />}{confirmando ? "Asignando…" : "Asignar"}
        </button>
      </div>
    </>
  );
}

// Dibuja el trazado real de una ruta sobre un mapa de OpenStreetMap.
// Leaflet no es un componente de React — se monta a mano sobre un div y
// se destruye al desmontar, como pide su propia API. Por eso este
// componente se desmonta del todo al cerrar el mapa (no se oculta con
// CSS): reabrirlo vuelve a crear el mapa de cero, que es exactamente lo
// que Leaflet espera — ocultar y reaparecer el mismo contenedor con
// display:none es el bug clásico que lo deja en blanco.
function MapaRuta({ base, paradas, geometria }) {
  const divRef = useRef(null);

  useEffect(() => {
    if (!divRef.current || !window.L) return;
    const map = window.L.map(divRef.current, { scrollWheelZoom: false });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    // El punto de inicio del trayecto es la base (si la ruta parte de ahí)
    // o, si no hay base, la primera parada — así se arma `puntos` en
    // verEnMapa(). El de llegada es siempre la última parada. Se pintan
    // distinto (verde/rojo) para que el sentido del recorrido se note de
    // un vistazo, sin tener que leer los números uno por uno.
    const bounds = [];
    if (base) {
      window.L.marker([base.lat, base.lng], {
        icon: window.L.divIcon({ className: "map-pin map-pin-base map-pin-start", html: "B", iconSize: [22, 22] }),
      }).addTo(map).bindTooltip("Inicio — Base del técnico");
      bounds.push([base.lat, base.lng]);
    }
    paradas.forEach((p, i) => {
      const esInicio = !base && i === 0;
      const esFinal = i === paradas.length - 1;
      const clase = esFinal ? "map-pin map-pin-end" : esInicio ? "map-pin map-pin-start" : "map-pin";
      const tooltip = esFinal
        ? `Destino final — ${p.direccion || p.id}`
        : esInicio
        ? `Inicio — ${p.direccion || p.id}`
        : p.direccion || p.id;
      window.L.marker([p.lat, p.lng], {
        icon: window.L.divIcon({ className: clase, html: String(i + 1), iconSize: [22, 22] }),
      }).addTo(map).bindTooltip(tooltip);
      bounds.push([p.lat, p.lng]);
    });

    const trazado = (geometria && geometria.coordenadas) || [];
    if (trazado.length > 1) {
      window.L.polyline(trazado, { color: "#033E84", weight: 4, opacity: 0.85 }).addTo(map);
      bounds.push(...trazado);
    }

    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });

    return () => map.remove();
  }, []);

  return <div ref={divRef} className="ruta-mapa" />;
}

// Fila de una ruta ya registrada en el backend (HU-18, "consultar sin
// salir del asignador"). Solo lectura, salvo el mapa — no hay acciones de
// edición acá, es historial. El trazado se pide bajo demanda (botón "Ver
// en mapa"): no tiene sentido llamar a /ruteo/geometria para las 7+ rutas
// del día si la planificadora solo quiere mirar una.
function RegistroRutaCard({ ruta }) {
  const paradas = (ruta.paradas || ruta.ordenes_asignadas || []).map((p, i) => ({
    id: p.ot_id || p.id || `parada-${i}`,
    direccion: p.direccion,
    lat: p.latitud ?? p.lat,
    lng: p.longitud ?? p.lng,
    // Hora PROGRAMADA real de la OT (fija) — no la estimada de llegada,
    // que puede caer hasta 30 min antes y confunde.
    horaProgramada: p.hora_programada || p.horaProgramada || null,
  }));
  const nombre = ruta.nombre || ruta.tecnico_nombre || ruta.tecnico_id || "Técnico";
  const zona = ruta.zona_base || ruta.zona || null;
  const base = (ruta.base_latitud != null && ruta.base_longitud != null)
    ? { lat: ruta.base_latitud, lng: ruta.base_longitud } : null;

  const [mapa, setMapa] = useState({ abierto: false, estado: "inicial", geometria: null, error: null });

  const verEnMapa = async () => {
    if (mapa.abierto) { setMapa(m => ({ ...m, abierto: false })); return; }
    if (mapa.estado === "ok") { setMapa(m => ({ ...m, abierto: true })); return; }
    setMapa(m => ({ ...m, abierto: true, estado: "cargando", error: null }));
    try {
      const puntos = [...(base ? [base] : []), ...paradas.filter(p => p.lat != null && p.lng != null)];
      if (puntos.length < 2) throw new Error("No hay suficientes puntos con coordenadas para trazar la ruta.");
      const geometria = await window.RUTAS_EXTERNO_API.obtenerGeometriaRuta(puntos);
      setMapa({ abierto: true, estado: "ok", geometria, error: null });
    } catch (err) {
      setMapa(m => ({ ...m, estado: "error", error: err.message }));
    }
  };

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="route-head" style={{ padding: "12px 16px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cell-strong">{nombre}</div>
          {zona && <div className="route-zone"><Icon name="pin" style={{ width: 12, height: 12 }} />{zona}</div>}
        </div>
        {paradas.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={verEnMapa}>
            <Icon name="pin" style={{ width: 14, height: 14 }} />{mapa.abierto ? "Ocultar mapa" : "Ver en mapa"}
          </button>
        )}
        {paradas.length === 1 && paradas[0].horaProgramada && (
          <span className="cell-muted" style={{ fontSize: 12.5, flex: "none" }}>
            <Icon name="clock" style={{ width: 12, height: 12 }} />{" "}{horaVista(paradas[0].horaProgramada)}
          </span>
        )}
        {paradas.length > 1 && (paradas[0].horaProgramada || paradas[paradas.length - 1].horaProgramada) && (
          <span className="cell-muted" style={{ fontSize: 12.5, flex: "none" }}>
            <Icon name="clock" style={{ width: 12, height: 12 }} />{" "}
            {paradas[0].horaProgramada ? horaVista(paradas[0].horaProgramada) : "—"}
            –{paradas[paradas.length - 1].horaProgramada ? horaVista(paradas[paradas.length - 1].horaProgramada) : "—"}
          </span>
        )}
        {ruta.distancia_total_km != null && (
          <span className="cell-muted" style={{ fontSize: 12.5, flex: "none" }}>{ruta.distancia_total_km.toFixed(1)} km</span>
        )}
        <div className="route-count"><b>{paradas.length}</b> OT</div>
      </div>
      {paradas.length > 0 && (
        <div style={{ padding: "10px 16px 14px", display: "flex", flexWrap: "wrap", gap: 7 }}>
          {paradas.map((p, i) => (
            <span key={p.id || i} className="badge b-slate">
              {p.id}{p.horaProgramada ? ` · ${horaVista(p.horaProgramada)}` : ""}
            </span>
          ))}
        </div>
      )}
      {mapa.abierto && (
        <div style={{ padding: "0 16px 16px" }}>
          {mapa.estado === "cargando" && (
            <div className="cell-muted" style={{ fontSize: 12.5, padding: "14px 0", display: "flex", alignItems: "center", gap: 7 }}>
              <span className="icon-spin"><Icon name="refresh" style={{ width: 14, height: 14 }} /></span>Trazando la ruta…
            </div>
          )}
          {mapa.estado === "error" && (
            <div className="cell-muted" style={{ fontSize: 12.5, color: "var(--red-fg)", padding: "14px 0", display: "flex", alignItems: "center", gap: 7 }}>
              <Icon name="alert" style={{ width: 14, height: 14 }} />No se pudo trazar la ruta: {mapa.error}
            </div>
          )}
          {mapa.estado === "ok" && <MapaRuta base={base} paradas={paradas} geometria={mapa.geometria} />}
        </div>
      )}
    </div>
  );
}

// Consulta bajo demanda (no se auto-carga al entrar al módulo, para no
// sumar una llamada de red en cada visita cuando normalmente no hay nada
// que ver todavía). HU-18 criterio 3 y 4: consultable sin salir de acá,
// y un error de red se comunica, no se confunde con "no hay registros".
function RegistroAsignaciones({ fechaInicial, go }) {
  const [fechaConsulta, setFechaConsulta] = useState(fechaInicial);
  const [estado, setEstado] = useState("cargando"); // cargando | ok | error
  const [rutas, setRutas] = useState([]);
  const [error, setError] = useState(null);

  // Sin botón "Consultar": al elegir un día en la tira (o al entrar),
  // se consulta solo — mismo criterio que "Planificar rutas", donde
  // cambiar de día ya recarga sin un paso extra.
  useEffect(() => {
    let activo = true;
    setEstado("cargando");
    setError(null);
    window.RUTAS_EXTERNO_API.obtenerRutasRegistradas(fechaConsulta)
      .then(data => { if (activo) { setRutas(Array.isArray(data) ? data : []); setEstado("ok"); } })
      .catch(err => { if (activo) { setError(err.message); setEstado("error"); } });
    return () => { activo = false; };
  }, [fechaConsulta]);

  // Rango navegable en la tira/calendario de esta pantalla: a diferencia
  // de "Planificar rutas" (que solo mira hacia adelante, hoy..hoy+13),
  // acá se consultan rutas YA confirmadas, así que tiene que poder
  // mirar hacia atrás — 90 días es un margen generoso sin dejarlo sin
  // límite. El tope hacia adelante es el mismo que el de planificación:
  // no se puede haber confirmado nada más allá de esa ventana.
  const fechaMin = sumarDiasAFecha(window.RUTAS_EXTERNO_API.hoyISO(), -90);
  const fechaMax = window.RUTAS_EXTERNO_API.sumarDiasISO(13);

  // Punto verde de la tira/calendario acá: lee directo de sessionStorage
  // (mismo criterio que puedeEditar más abajo) — esta pantalla es una
  // ruta aparte de "Planificar rutas", sin ese estado en memoria, y
  // reconstruir cada día contra el backend sería una llamada por celda
  // del calendario. Por eso no hay punto ámbar acá (no hay de dónde
  // sacar "OT por asignar" sin ese mismo costo).
  const estadoDelDiaLocal = iso => {
    const confirmadosLocal = rxLoad(RX_KEYS.confirmados, {});
    const c = confirmadosLocal[iso];
    const confirmadas = c ? Object.values(c.porTecnico).reduce((s, { paradas }) => s + (paradas || []).length, 0) : 0;
    return { confirmadas, porAsignar: 0 };
  };

  // El backend puede devolver un técnico incluido en la corrida sin
  // ninguna parada asignada — eso no es una "asignación registrada" para
  // la planificadora, así que no se muestra (mismo criterio que ya usa
  // PropuestaPanel con las tarjetas de ruta en la etapa de propuesta).
  const rutasConParadas = rutas.filter(r => (r.paradas || r.ordenes_asignadas || []).length > 0);
  const totalOts = rutasConParadas.reduce((sum, r) => sum + (r.paradas || r.ordenes_asignadas || []).length, 0);
  // null, no 0, cuando ninguna ruta trae distancia: el registro
  // reconstruido desde /api/ordenes (ver obtenerRutasRegistradas en
  // data.js) no tiene ese dato — mostrar "0.0 km" ahí sería inventar un
  // número en vez de simplemente no tenerlo.
  const hayDistancias = rutasConParadas.some(r => r.distancia_total_km != null);
  const kmTotal = rutasConParadas.reduce((sum, r) => sum + (r.distancia_total_km || 0), 0);

  // "Editar" manda a la sección de edición de "Planificar rutas" (ver
  // onEditarConfirmado en RutasExternoScreen) — solo tiene de dónde partir
  // si ese plan se confirmó EN ESTA MISMA SESIÓN (confirmados vive en
  // sessionStorage, no hay un fetch del plan editable desde el backend
  // todavía). Se lee directo de sessionStorage porque esta pantalla es
  // una ruta aparte de "Planificar rutas", sin ese estado en memoria.
  const puedeEditar = useMemo(() => {
    const confirmados = rxLoad(RX_KEYS.confirmados, {});
    const c = confirmados[fechaConsulta];
    return !!(c && Object.values(c.porTecnico || {}).some(({ paradas }) => (paradas || []).length > 0));
  }, [fechaConsulta, estado]);

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <TiraDias fecha={fechaConsulta} onSeleccionar={setFechaConsulta} estadoDelDia={estadoDelDiaLocal}
        fechaMin={fechaMin} fechaMax={fechaMax} conResumen={false} />

      {estado === "ok" && rutasConParadas.length > 0 && (
        <div className="row-flex" style={{ gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <span className="cell-muted" style={{ fontSize: 12.5 }}>
            <b style={{ color: "var(--text)" }}>{rutasConParadas.length}</b> ruta(s) · <b style={{ color: "var(--text)" }}>{totalOts}</b> OT{hayDistancias && <> · <b style={{ color: "var(--text)" }}>{kmTotal.toFixed(1)}</b> km en total</>}
          </span>
          <button className="btn btn-sm" style={{ marginLeft: "auto" }} disabled={!puedeEditar}
            title={puedeEditar ? "Ir a editar este plan" : "Este plan no se confirmó en esta sesión — no hay desde dónde editarlo todavía"}
            onClick={() => go("rutasExterno", { editarFecha: fechaConsulta })}>
            <Icon name="edit" />Editar
          </button>
        </div>
      )}

      {estado === "cargando" && (
        <div className="empty" style={{ marginTop: 14 }}><span className="icon-spin"><Icon name="refresh" /></span>Consultando…</div>
      )}
      {estado === "error" && (
        <div className="cell-muted" style={{ marginTop: 12, color: "var(--red-fg)", display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="alert" style={{ width: 14, height: 14 }} />No se pudo consultar el registro: {error}
        </div>
      )}
      {estado === "ok" && rutasConParadas.length === 0 && (
        <div className="empty"><Icon name="inbox" />No hay rutas confirmadas para el {fechaDDMMYYYY(fechaConsulta)}.</div>
      )}
      {estado === "ok" && rutasConParadas.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {rutasConParadas.map((r, i) => <RegistroRutaCard key={r.tecnico_id || i} ruta={r} />)}
        </div>
      )}
    </div>
  );
}

/* ---- Pantalla propia para consultar las rutas ya confirmadas (antes
   vivía inline arriba de "Planificar rutas"; ahora es una pantalla
   aparte, a la que se entra con el botón "Rutas confirmadas") ---- */
function RegistroAsignacionesScreen({ go }) {
  return (
    <div className="page fade-in">
      <a className="back-link back-link-accent" onClick={() => go("rutasExterno")}><Icon name="arrowL" />Volver a planificar rutas</a>
      <div className="page-head">
        <div>
          <div className="page-title">Rutas confirmadas</div>
        </div>
      </div>
      <RegistroAsignaciones fechaInicial={window.RUTAS_EXTERNO_API.hoyISO()} go={go} />
    </div>
  );
}

// Fusiona el resultado de una nueva ronda de "Optimizar + Asignar" con lo
// que YA estaba confirmado ese mismo día (de una ronda anterior en esta
// sesión, o rehidratado del backend) — sin esto, cada confirmación nueva
// reemplazaba entera la anterior y "desaparecían" los técnicos/OT que no
// formaban parte de la ronda recién optimizada. Por diseño, una OT ya
// confirmada nunca se vuelve a ofrecer en "OTs por Asignar" (ver
// otsConfirmadasIds más abajo), así que cada ronda nueva trabaja sobre un
// conjunto de OT disjunto del anterior: lo correcto es sumar, no
// reemplazar. Solo se usa para la PRIMERA confirmación de cada ronda
// (onConfirmar, rama no esReedicion) — al reeditar un plan ya confirmado,
// `propuesta` YA arranca siendo el acumulado completo más las ediciones,
// así que ahí sí corresponde reemplazar entero (si se fusionara también
// ahí, un técnico al que se le sacaron todas sus OT durante la edición
// resucitaría con sus paradas viejas).
function fusionarPorTecnico(previo, nuevo) {
  const fusionado = { ...(previo || {}) };
  Object.entries(nuevo).forEach(([tid, entry]) => {
    if (!entry.paradas.length) return; // técnico sin OT en esta ronda: no aporta nada nuevo
    const existente = fusionado[tid];
    if (!existente) { fusionado[tid] = entry; return; }
    const idsExistentes = new Set(existente.paradas.map(p => p.id));
    fusionado[tid] = {
      tecnico: entry.tecnico,
      paradas: [...existente.paradas, ...entry.paradas.filter(p => !idsExistentes.has(p.id))],
    };
  });
  return fusionado;
}

/* ---- Pantalla raíz: orquesta selección → propuesta → confirmación ---- */
function RutasExternoScreen({ onToast, go, route }) {
  // Día que se está planificando — no tiene que ser forzosamente "hoy"
  // (el selector permite hasta 13 días hacia adelante). Se persiste para
  // no perderlo si solo cambiaste de pantalla.
  const [fecha, setFecha] = useState(() => rxLoad(RX_KEYS.fecha, null) || window.RUTAS_EXTERNO_API.hoyISO());
  // Rango navegable en la tira/calendario — igual al que ya tenía el
  // selector de fecha anterior (hoy .. hoy+13).
  const fechaMin = window.RUTAS_EXTERNO_API.hoyISO();
  const fechaMax = window.RUTAS_EXTERNO_API.sumarDiasISO(13);
  // Fecha a la que se quiere saltar, pendiente de que se confirme el
  // aviso de "se va a perder la propuesta sin confirmar" (ver
  // onSeleccionarFecha/ConfirmarCambioFechaModal más abajo).
  const [fechaPendienteCambio, setFechaPendienteCambio] = useState(null);

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
  // Snapshot de la propuesta SIN editar (recién salida del optimizador, o
  // recién reabierta desde un plan confirmado) + cuándo se generó — para
  // poder armar ruta_propuesta/modificaciones al confirmar (HU-18: el
  // backend de persistencia quiere saber qué cambió a mano, no solo el
  // resultado final). Ver onOptimizar/onEditarConfirmado/onConfirmar.
  const [propuestaOriginal, setPropuestaOriginal] = useState(() => rxLoad(RX_KEYS.propuestaOriginal, null));
  const [generadoEn, setGeneradoEn] = useState(() => rxLoad(RX_KEYS.generadoEn, null));
  // Resumen de la última corrida (para el estado de éxito explícito) — no
  // se persiste: es contexto de la corrida recién hecha, no parte del plan.
  const [resumen, setResumen] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  // Reprogramación: solo aplica al reeditar un plan YA confirmado (no la
  // primera vez que se arma uno — ahí no se está reprogramando nada
  // todavía). El motivo es POR OT, no uno solo para todo el plan: cada
  // vez que se mueve/reordena/saca una OT sin que dé error, se pide su
  // propio motivo con un popup (ver aplicarYRecalcular/onGuardarMotivoOt)
  // y se manda individualmente por PATCH al confirmar (onConfirmar) — no
  // se reenvía el plan completo, para no duplicar lo que no cambió.
  const [esReedicion, setEsReedicion] = useState(false);
  const [motivosPorOt, setMotivosPorOt] = useState({});
  // OT esperando su popup de motivo ahora mismo: { id, tecnicoId, ot }
  const [otPidiendoMotivo, setOtPidiendoMotivo] = useState(null);
  // Mapa fecha (ISO) -> plan confirmado de ese día. Cada día se confirma y
  // se edita por separado; todos los planes confirmados se muestran a la vez,
  // sin importar qué día esté elegido en el selector de planificación.
  const [confirmados, setConfirmados] = useState(() => rxLoad(RX_KEYS.confirmados, {}));

  // El punto verde "N confirmadas" de la tira de días (y el distintivo
  // en el resumen del día, ver TiraDias) hasta ahora solo
  // sabía de lo confirmado EN ESTA SESIÓN (confirmados vive en
  // sessionStorage, se pierde al cerrar la pestaña/el navegador). Al
  // entrar a la pantalla, se intenta reconstruir TODAS las fechas con
  // algo confirmado desde el backend de persistencia
  // (obtenerAsignacionesConfirmadasPorFecha en data.js) — no solo la
  // fecha elegida en ese momento — para que, al cerrar y volver a abrir,
  // cada día que corresponda (ej. el 5 y el 6) muestre su propio punto
  // verde con su propia suma, en vez de solo el de la fecha que se haya
  // quedado seleccionada. Una fecha que ya tiene una versión completa de
  // esta sesión (por ejemplo porque se acaba de confirmar, con la fusión
  // de fusionarPorTecnico) no se pisa. Esa reconstrucción no trae
  // coordenadas ni resumen de ruta (el backend no las tiene todavía), así
  // que si se usa "Ver / Editar" sobre un día reaparecido así, mover/
  // reordenar sigue funcionando pero sin recalcular km/hora — misma
  // limitación ya conocida de "Rutas confirmadas". Si el backend no
  // tiene nada, o falla, el día simplemente no muestra el punto verde —
  // no es un error que haya que mostrar.
  useEffect(() => {
    let activo = true;
    window.RUTAS_EXTERNO_API.obtenerAsignacionesConfirmadasPorFecha().then(porFecha => {
      if (!activo) return;
      const { TIPO_OT_LABEL, colorPorId } = window.RUTAS_EXTERNO_API;
      setConfirmados(prev => {
        let cambio = false;
        const next = { ...prev };
        Object.entries(porFecha).forEach(([f, rutas]) => {
          if (next[f]) return; // esa fecha ya tiene una versión completa de esta sesión — no la pisa
          const conParadas = (rutas || []).filter(r => (r.paradas || []).length > 0);
          if (conParadas.length === 0) return;
          const porTecnico = {};
          conParadas.forEach(r => {
            porTecnico[r.tecnico_id] = {
              tecnico: { id: r.tecnico_id, nombre: r.nombre, tipo: r.tipo, zona: r.zona, color: colorPorId(r.tecnico_id) },
              paradas: r.paradas.map(p => ({
                id: p.ot_id, tipo: p.tipo, cliente: TIPO_OT_LABEL[p.tipo] || p.tipo,
                direccion: p.direccion, horaProgramada: p.hora_programada || null,
              })),
            };
          });
          next[f] = { porTecnico, fecha: f, generadoEn: null };
          cambio = true;
        });
        return cambio ? next : prev;
      });
    }).catch(() => {});
    return () => { activo = false; };
  }, []);

  const [error, setError] = useState(null);
  const [optimizando, setOptimizando] = useState(false);

  // Configuración de negocio real (HU-16: jornada, duración de servicio
  // por tipo de OT, capacidad por tipo de técnico) — se usa para
  // recalcular hora/km/capacidad con datos reales al editar la propuesta
  // a mano (ver recalcularTecnico más abajo). No bloquea la pantalla si
  // todavía no cargó: mientras tanto, mover/reordenar sigue funcionando,
  // solo no se recalcula el resumen hasta que esté disponible.
  const [configNegocio, setConfigNegocio] = useState(null);
  useEffect(() => {
    window.RUTAS_EXTERNO_API.obtenerConfiguracion().then(setConfigNegocio).catch(() => {});
  }, []);
  // Técnicos cuyo resumen se está recalculando ahora mismo (para mostrar
  // un indicador breve en su tarjeta en vez de que el número cambie de
  // golpe sin aviso).
  const [recalculando, setRecalculando] = useState({});
  // Error de restricción (capacidad/jornada/ventana) por técnico — se
  // muestra DENTRO de la tarjeta afectada, junto a hora/km/capacidad, en
  // vez de un aviso genérico arriba de la pantalla (así se ve de
  // inmediato cuál ruta rechazó el cambio y por qué OT).
  const [erroresTecnico, setErroresTecnico] = useState({});

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
  // Filtradas también por fecha_programada: antes se mostraban las
  // mismas OT sin importar el día elegido (ver nota más abajo, en el
  // efecto que las carga) — ahora que la tira de días es el contexto de
  // toda la pantalla, cambiar de día tiene que cambiar también qué OT se
  // ofrecen, y nunca dejar seleccionada una de otro día (una OT sin
  // fecha_programada, null, no pertenece a ningún día puntual, así que no
  // aparece en ninguno).
  const otsDelDia = useMemo(
    () => otsDelDiaCrudo.filter(o => !otsConfirmadasIds.has(o.id) && o.fechaProgramada === fecha),
    [otsDelDiaCrudo, otsConfirmadasIds, fecha]
  );

  // Estado de UN día cualquiera (no solo el elegido) para la tira y el
  // calendario — verde si ya tiene algo confirmado (confirmados, que se
  // rehidrata para TODAS las fechas al entrar, no solo la seleccionada),
  // ámbar si tiene OT sin asignar todavía. No pega a la red: ambas
  // fuentes (otsDelDiaCrudo, confirmados) ya están cargadas en memoria.
  const estadoDelDia = iso => {
    const c = confirmados[iso];
    const confirmadas = c ? Object.values(c.porTecnico).reduce((s, { paradas }) => s + paradas.length, 0) : 0;
    const porAsignar = otsDelDiaCrudo.filter(o => o.fechaProgramada === iso && !otsConfirmadasIds.has(o.id)).length;
    return { confirmadas, porAsignar };
  };

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
    // Sin [fecha]: el backend no filtra por día al pedir estos dos
    // listados (trae las OT por_asignar de TODOS los días de una), así
    // que se piden una sola vez al entrar al módulo. El filtro por día
    // se hace del lado del cliente con fecha_programada (ver otsDelDia
    // más abajo) — por eso técnicosDisponibles no depende de la fecha
    // (el backend tampoco los filtra por día en este contrato) pero
    // otsDelDia sí.
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
  useEffect(() => rxSave(RX_KEYS.propuestaOriginal, propuestaOriginal), [propuestaOriginal]);
  useEffect(() => rxSave(RX_KEYS.generadoEn, generadoEn), [generadoEn]);
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
    // Punto de partida para esta sesión de edición: lo que ya estaba
    // confirmado. Si se mueve algo de acá en más y se vuelve a confirmar,
    // eso cuenta como modificación nueva (no se compara contra la corrida
    // original del optimizador, que ya no es lo relevante acá).
    setPropuestaOriginal({ porTecnico: deepClone(c.porTecnico), pendientes: [] });
    setGeneradoEn(c.generadoEn || new Date().toISOString());
    setResumen(null); // no es una corrida nueva, no hay resumen que mostrar
    setError(null);
    setEsReedicion(true); // reabrir un plan confirmado = reprogramación, pide motivo al editar cada OT
    setMotivosPorOt({});
    setOtPidiendoMotivo(null);
    setEtapa("propuesta");
  };

  // Entrada directa a edición desde "Rutas confirmadas" (botón "Editar"
  // ahí, ver RegistroAsignaciones): esa pantalla navega acá con
  // go("rutasExterno", { editarFecha }) en vez de duplicar la lógica de
  // armar la propuesta editable — un solo lugar (onEditarConfirmado) sabe
  // cómo reabrir un plan confirmado. Depende solo de editarFecha, así que
  // no se vuelve a disparar si después se "vuelve a selección" sin salir
  // de esta pantalla.
  useEffect(() => {
    if (route?.params?.editarFecha) onEditarConfirmado(route.params.editarFecha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.editarFecha]);

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
            // Hora programada real de la OT (fija) — distinta de la
            // estimada de llegada, que puede caer hasta 30 min antes
            // (ventana de tolerancia) y confunde si se muestra sola.
            horaProgramada: p.hora_programada || null,
            // Hora estimada de llegada/espera — ya viene calculada con
            // ruteo real; se muestra en cada parada de la tarjeta de ruta.
            horaEstimadaLlegada: p.hora_estimada_llegada,
            esperaMin: p.espera_min || 0,
          })),
        };
      });

      // Pendientes: el diagnóstico del backend da la razón pero no el
      // cliente/dirección (eso ya lo tenemos de la selección del panel) —
      // se cruza por id para mostrar la fila completa. lat/lng SÍ vienen
      // del diagnóstico (y no de la selección, que no las trae) — hacen
      // falta si la coordinadora mueve esta OT a la ruta de un técnico,
      // para poder recalcular esa ruta con datos reales (ver
      // recalcularTecnico/onMoverPendiente).
      const otsSeleccionadasPorId = Object.fromEntries(otsSeleccionadas.map(o => [o.id, o]));
      const pendientes = (resultado.diagnosticos || []).map(d => {
        const causa = { causaPrincipal: d.causa_principal, causas: d.causas || [], precisionUbicacion: d.precision_ubicacion, lat: d.latitud, lng: d.longitud };
        const ot = otsSeleccionadasPorId[d.ot_id];
        return ot ? { ...ot, ...causa } : {
          id: d.ot_id, cliente: TIPO_OT_LABEL[d.tipo] || d.tipo, direccion: d.sector || "—", ...causa,
        };
      });

      const r = resultado.resumen || {};
      setResumen({
        totalOts: r.total_ots, otsAsignadas: r.ots_asignadas, otsPendientes: r.ots_pendientes,
        totalTecnicos: r.total_tecnicos, tecnicosUtilizados: r.tecnicos_utilizados,
        distanciaTotalKm: r.distancia_total_km, fuenteMatriz: r.fuente_matriz,
        pendientesPorCausa: r.pendientes_por_causa || null,
      });
      setPropuesta({ porTecnico, pendientes });
      // Snapshot SIN editar, para poder armar ruta_propuesta/modificaciones
      // al confirmar (ver aplicarYRecalcular arriba ya editó `propuesta`
      // en cuanto la coordinadora mueva algo — esto queda fijo).
      setPropuestaOriginal({ porTecnico: deepClone(porTecnico), pendientes: deepClone(pendientes) });
      setGeneradoEn(new Date().toISOString());
      setEsReedicion(false); // primera corrida: todavía no se está reprogramando nada
      setMotivosPorOt({});
      setOtPidiendoMotivo(null);
      setEtapa("propuesta");
    } catch (err) {
      setError(`No se pudo optimizar: ${err.message}`);
    } finally {
      setOptimizando(false);
    }
  };

  // "Asignación manual": arma la propuesta directo de la selección, SIN
  // correr el optimizador — cada OT seleccionada arranca en Pendientes y
  // cada técnico seleccionado arranca con la ruta vacía, para asignarlas
  // a mano con el mismo "Mover" que ya existe para reubicar pendientes
  // (PendienteRow/RxMoveMenu). Pensado para cuando no hace falta esperar
  // una corrida completa del optimizador para una asignación puntual, o
  // cuando el servicio de optimización está caído (ver OPTIMIZADOR_
  // DISPONIBLE: esto no depende de él). Sin corrida real no hay
  // resumen de optimización que mostrar (ResumenCorrida se queda oculta,
  // como siempre que `resumen` es null) ni coordenadas de OT/técnico, así
  // que al mover algo el recálculo de km/hora se omite igual que ya pasa
  // hoy cuando faltan esos datos (ver aplicarYRecalcular).
  const onAsignacionManual = () => {
    const tecnicosSeleccionados = tecnicosDisponibles.filter(t => tecSel[t.id]);
    const otsSeleccionadas = otsDelDia.filter(o => otsSel[o.id]);
    if (!tecnicosSeleccionados.length || !otsSeleccionadas.length) {
      setError("Selecciona al menos una OT y un técnico para asignar manualmente.");
      return;
    }

    const { TIPO_OT_LABEL, colorPorId } = window.RUTAS_EXTERNO_API;
    const porTecnico = {};
    tecnicosSeleccionados.forEach(t => {
      porTecnico[t.id] = {
        tecnico: { id: t.id, nombre: t.nombre, tipo: t.tipo, zona: t.zona, color: colorPorId(t.id) },
        paradas: [],
      };
    });
    const pendientes = otsSeleccionadas.map(o => ({
      id: o.id, tipo: o.tipo, cliente: TIPO_OT_LABEL[o.tipo] || o.tipo, direccion: o.direccion,
      ventanaInicio: o.ventanaInicio, ventanaFin: o.ventanaFin, horaProgramada: o.horaProgramada || null,
    }));

    setResumen(null); // no hubo corrida del optimizador, no hay nada que resumir
    setPropuesta({ porTecnico, pendientes });
    setPropuestaOriginal({ porTecnico: deepClone(porTecnico), pendientes: deepClone(pendientes) });
    setGeneradoEn(new Date().toISOString());
    setEsReedicion(false); // primera confirmación: todavía no se está reprogramando nada
    setMotivosPorOt({});
    setOtPidiendoMotivo(null);
    setError(null);
    setEtapa("propuesta");
  };

  // Muestra el aviso de un técnico — queda fijo en su tarjeta mientras la
  // ruta siga en ese estado (ya no se borra solo a los pocos segundos).
  // Se limpia al empezar cada edición nueva sobre ese técnico (ver el
  // setErroresTecnico al inicio de aplicarYRecalcular/onRestablecerRuta)
  // y se vuelve a poner acá solo si, tras recalcular, la ruta SIGUE
  // violando capacidad/jornada/ventana — así que, mientras no se edite
  // nada más en esa ruta, el aviso queda visible todo el tiempo que
  // corresponda.
  const mostrarAvisoTecnico = (tid, mensaje) => {
    setErroresTecnico(e => ({ ...e, [tid]: mensaje }));
  };

  // Al reeditar un plan ya confirmado, cada OT que se edita necesita su
  // propio motivo de reprogramación — se pide con un popup apenas
  // termina esa edición.
  const pedirMotivoSiCorresponde = (otId) => {
    if (esReedicion) setOtPidiendoMotivo(otId);
  };

  // Capacidad máxima del técnico según su tipo (HU-16, config real).
  const capacidadMaxDe = (tecnico) => {
    if (!configNegocio) return Infinity; // config no cargó todavía: no avisar a ciegas
    return tecnico.tipo === "interno" ? configNegocio.capacidad_max_interno : configNegocio.capacidad_max_externo;
  };

  // Aplica una edición manual (mover/reordenar/quitar) y chequea las
  // restricciones "obvias" de capacidad y horario del técnico — pero NO
  // bloquea ni revierte: la coordinadora puede tener motivos válidos para
  // una ruta "no óptima" (ej. un cliente que solo puede en cierto
  // horario), así que el cambio queda igual y solo se avisa que puede no
  // ser lo más eficiente. El aviso se guarda por técnico (erroresTecnico)
  // y se muestra DENTRO de esa tarjeta, para que quede claro de
  // inmediato a qué ruta y OT corresponde.
  const aplicarYRecalcular = async (fn, tecnicoIds, otId) => {
    const prev = propuesta;
    const next = fn(deepClone(prev));
    setErroresTecnico(e => { const n = { ...e }; tecnicoIds.forEach(id => { delete n[id]; }); return n; });

    for (const tid of tecnicoIds) {
      const entry = next.porTecnico[tid];
      if (entry && entry.paradas.length > capacidadMaxDe(entry.tecnico)) {
        mostrarAvisoTecnico(tid, `Atención (${otId}) · sobre la capacidad máxima (${capacidadMaxDe(entry.tecnico)} OT)`);
      }
    }

    setPropuesta(next);
    if (!configNegocio) { pedirMotivoSiCorresponde(otId); return; } // sin configuración no se puede chequear jornada/ventana; la edición queda aplicada igual

    setRecalculando(p => { const n = { ...p }; tecnicoIds.forEach(id => { n[id] = true; }); return n; });
    try {
      const resultados = await Promise.all(tecnicoIds.map(async tid => {
        const entry = next.porTecnico[tid];
        if (!entry) return null;
        const { tecnico, paradas } = entry;
        if (tecnico.lat == null || tecnico.lng == null) return null; // sin base conocida, no se puede trazar
        // Una OT sin georreferenciar (causa "georreferencia") trae lat/lng
        // en null — si se movió una de esas acá, no hay con qué trazar.
        if (paradas.some(p => p.lat == null || p.lng == null)) return null;
        const r = await window.RUTAS_EXTERNO_OPTIMIZER.recalcularResumenRuta(tecnico, paradas, configNegocio, window.RUTAS_EXTERNO_API.obtenerGeometriaRuta);
        return { tid, ...r };
      }));

      // Se aplica el recálculo SIEMPRE (nunca se revierte) — solo si
      // quedó alguna restricción fuera de rango, se avisa cuál y por qué.
      setPropuesta(actual => {
        if (!actual) return actual;
        const out = deepClone(actual);
        resultados.forEach(r => {
          if (!r || !out.porTecnico[r.tid]) return;
          out.porTecnico[r.tid].tecnico.resumen = r.resumen;
          out.porTecnico[r.tid].paradas = r.paradas;
        });
        return out;
      });

      const conViolacion = resultados.find(r => r && r.violaciones && r.violaciones.hay);
      if (conViolacion) {
        const v = conViolacion.violaciones;
        const otAviso = v.otsFueraDeVentana[0]?.id || otId;
        const motivo = v.sobrecapacidad
          ? "sobre la capacidad máxima"
          : v.excedeJornada
            ? "termina después del fin de jornada"
            : `${otAviso} llega a las ${horaVista(v.otsFueraDeVentana[0].horaEstimadaLlegada)}, después de su ventana (hasta las ${horaVista(v.otsFueraDeVentana[0].ventanaFin)})`;
        mostrarAvisoTecnico(conViolacion.tid, `Atención (${otAviso}) · ${motivo}`);
      }
      pedirMotivoSiCorresponde(otId);
    } catch (err) {
      // Si falla (red, OSRM caído), se deja la edición aplicada sin los
      // números recalculados — no es crítico, se puede seguir editando.
      pedirMotivoSiCorresponde(otId);
    } finally {
      setRecalculando(p => { const n = { ...p }; tecnicoIds.forEach(id => { delete n[id]; }); return n; });
    }
  };

  const onMoveUp = (tecnicoId, otId) => aplicarYRecalcular(p => {
    const arr = p.porTecnico[tecnicoId].paradas;
    const i = arr.findIndex(o => o.id === otId);
    if (i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    return p;
  }, [tecnicoId], otId);
  const onMoveDown = (tecnicoId, otId) => aplicarYRecalcular(p => {
    const arr = p.porTecnico[tecnicoId].paradas;
    const i = arr.findIndex(o => o.id === otId);
    if (i >= 0 && i < arr.length - 1) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    return p;
  }, [tecnicoId], otId);
  const onMover = (fromId, otId, toId) => aplicarYRecalcular(p => {
    const fromArr = p.porTecnico[fromId].paradas;
    const idx = fromArr.findIndex(o => o.id === otId);
    const [ot] = fromArr.splice(idx, 1);
    p.porTecnico[toId].paradas.push(ot);
    return p;
  }, [fromId, toId], otId);
  const onEliminar = (tecnicoId, otId) => aplicarYRecalcular(p => {
    const arr = p.porTecnico[tecnicoId].paradas;
    const idx = arr.findIndex(o => o.id === otId);
    const [ot] = arr.splice(idx, 1);
    p.pendientes.push(ot);
    return p;
  }, [tecnicoId], otId);
  const onMoverPendiente = (otId, toTecId) => aplicarYRecalcular(p => {
    const idx = p.pendientes.findIndex(o => o.id === otId);
    const [ot] = p.pendientes.splice(idx, 1);
    p.porTecnico[toTecId].paradas.push(ot);
    return p;
  }, [toTecId], otId);

  // "Restablecer ruta": vuelve la ruta de UN técnico puntual exactamente
  // a como la entregó el optimizador (propuestaOriginal, que nunca se
  // toca). Si alguna de sus OT había sido movida desde/hacia otro
  // técnico, esa otra ruta también se ajusta — se le quita o se le
  // devuelve esa OT puntual, sin reordenar el resto de lo que ya tenía
  // (el diálogo de confirmación, en TecnicoRouteDetail, avisa de esto por
  // nombre antes de llegar hasta acá — ver cambiosRutaTecnico).
  const onRestablecerRuta = (tid) => {
    const original = propuestaOriginal || propuesta;
    const originalParadas = deepClone(original.porTecnico[tid]?.paradas || []);

    const tecnicoOriginalDe = {};
    Object.entries(original.porTecnico).forEach(([t, { paradas }]) => paradas.forEach(p => { tecnicoOriginalDe[p.id] = t; }));
    (original.pendientes || []).forEach(p => { tecnicoOriginalDe[p.id] = "pendientes"; });

    const next = deepClone(propuesta);
    const currentParadasTid = next.porTecnico[tid].paradas;

    // OT que hoy están en esta ruta pero no eran de este técnico: vuelven
    // a su dueño original (o a pendientes si ahí vivían).
    currentParadasTid.filter(p => tecnicoOriginalDe[p.id] !== tid).forEach(p => {
      const home = tecnicoOriginalDe[p.id];
      if (home && home !== "pendientes" && next.porTecnico[home]) next.porTecnico[home].paradas.push(p);
      else next.pendientes.push(p);
    });

    // OT que eran de este técnico pero hoy están en otro lado: se sacan
    // de donde estén (pendientes o la ruta de otro técnico) para volver.
    originalParadas.forEach(p => {
      next.pendientes = next.pendientes.filter(x => x.id !== p.id);
      Object.keys(next.porTecnico).forEach(otherTid => {
        if (otherTid === tid) return;
        next.porTecnico[otherTid].paradas = next.porTecnico[otherTid].paradas.filter(x => x.id !== p.id);
      });
    });

    // La ruta de este técnico vuelve a ser exactamente la original (mismo
    // orden, mismos datos que calculó el optimizador).
    next.porTecnico[tid].paradas = originalParadas;

    // Técnicos cuya ruta terminó distinta a como estaba antes de este
    // restablecimiento (el propio tid, siempre, y cualquier otro que
    // recibió/entregó una OT) — a esos se les recalcula hora/km/capacidad.
    const tecnicoIds = [tid];
    Object.keys(next.porTecnico).forEach(otherTid => {
      if (otherTid === tid) return;
      const antes = (propuesta.porTecnico[otherTid]?.paradas || []).map(p => p.id).join(",");
      const despues = next.porTecnico[otherTid].paradas.map(p => p.id).join(",");
      if (antes !== despues) tecnicoIds.push(otherTid);
    });

    setErroresTecnico(e => { const n = { ...e }; tecnicoIds.forEach(id => { delete n[id]; }); return n; });
    for (const t of tecnicoIds) {
      const entry = next.porTecnico[t];
      if (entry && entry.paradas.length > capacidadMaxDe(entry.tecnico)) {
        mostrarAvisoTecnico(t, `Atención · sobre la capacidad máxima (${capacidadMaxDe(entry.tecnico)} OT)`);
      }
    }
    setPropuesta(next);
    if (!configNegocio) return; // sin configuración no se puede recalcular jornada/ventana; el restablecimiento queda aplicado igual

    setRecalculando(p => { const n = { ...p }; tecnicoIds.forEach(id => { n[id] = true; }); return n; });
    (async () => {
      try {
        const resultados = await Promise.all(tecnicoIds.map(async t => {
          const entry = next.porTecnico[t];
          if (!entry) return null;
          const { tecnico, paradas } = entry;
          if (tecnico.lat == null || tecnico.lng == null) return null;
          if (paradas.some(p => p.lat == null || p.lng == null)) return null;
          const r = await window.RUTAS_EXTERNO_OPTIMIZER.recalcularResumenRuta(tecnico, paradas, configNegocio, window.RUTAS_EXTERNO_API.obtenerGeometriaRuta);
          return { t, ...r };
        }));

        setPropuesta(actual => {
          if (!actual) return actual;
          const out = deepClone(actual);
          resultados.forEach(r => {
            if (!r || !out.porTecnico[r.t]) return;
            out.porTecnico[r.t].tecnico.resumen = r.resumen;
            out.porTecnico[r.t].paradas = r.paradas;
          });
          return out;
        });

        const conViolacion = resultados.find(r => r && r.violaciones && r.violaciones.hay);
        if (conViolacion) {
          const v = conViolacion.violaciones;
          const motivo = v.sobrecapacidad
            ? "sobre la capacidad máxima"
            : v.excedeJornada
              ? "termina después del fin de jornada"
              : `${v.otsFueraDeVentana[0]?.id || ""} queda fuera de su ventana horaria`;
          mostrarAvisoTecnico(conViolacion.t, `Atención · ${motivo}`);
        }
      } finally {
        setRecalculando(p => { const n = { ...p }; tecnicoIds.forEach(id => { delete n[id]; }); return n; });
      }
    })();
  };

  const onVolver = () => {
    setPropuesta(null); setPropuestaOriginal(null); setGeneradoEn(null); setResumen(null); setError(null);
    setEsReedicion(false); setMotivosPorOt({}); setOtPidiendoMotivo(null);
    setEtapa("seleccion");
  };

  // Cambia de día de verdad: descarta cualquier propuesta sin confirmar
  // (está ligada al día que se estaba editando, no tiene sentido
  // arrastrarla a otro) y vuelve a la etapa de selección para que se
  // carguen las OT/técnicos del nuevo día.
  const cambiarFecha = iso => {
    setFecha(iso);
    setPropuesta(null); setPropuestaOriginal(null); setGeneradoEn(null); setResumen(null); setError(null);
    setEsReedicion(false); setMotivosPorOt({}); setOtPidiendoMotivo(null);
    setEtapa("seleccion");
  };
  // Disparado desde la tira de días o el calendario — si hay una
  // propuesta sin confirmar en pantalla, avisa antes de perderla
  // (ConfirmarCambioFechaModal); si no, cambia directo.
  const onSeleccionarFecha = iso => {
    if (iso === fecha) return;
    if (etapa === "propuesta" && propuesta) { setFechaPendienteCambio(iso); return; }
    cambiarFecha(iso);
  };

  // Arma el JSON que espera POST /asignar-tecnicos (equipo de base de
  // datos, HU-18, contrato verificado contra su /openapi.json). Compara
  // la propuesta actual contra propuestaOriginal (la versión sin editar)
  // para separar "aceptado tal cual" de lo que se movió/reordenó/sacó a
  // mano — eso es lo que arma ruta_propuesta/ruta_final/modificaciones.
  const construirPayloadAsignaciones = () => {
    const u = CP_DATA.usuarios[0];
    const original = propuestaOriginal || propuesta;

    // Dónde vivía cada OT en la versión SIN editar — para poder explicar
    // el origen de una OT que apareció en una ruta que no la tenía antes.
    const ubicacionOriginal = {};
    Object.values(original.porTecnico).forEach(({ tecnico, paradas }) => {
      paradas.forEach(p => { ubicacionOriginal[p.id] = tecnico.nombre; });
    });
    (original.pendientes || []).forEach(p => { ubicacionOriginal[p.id] = "pendientes"; });

    const rutas = Object.entries(propuesta.porTecnico)
      .filter(([, { paradas }]) => paradas.length > 0)
      .map(([tid, { tecnico, paradas }]) => {
        const idsOriginal = (original.porTecnico[tid]?.paradas || []).map(p => p.id);
        const idsFinal = paradas.map(p => p.id);
        const mismoSet = idsOriginal.length === idsFinal.length && idsOriginal.every(id => idsFinal.includes(id));
        const aceptadaSinModificacion = JSON.stringify(idsOriginal) === JSON.stringify(idsFinal);
        const modificaciones = [];
        if (!aceptadaSinModificacion) {
          if (mismoSet) {
            modificaciones.push({ tipo: "reordenada" });
          } else {
            idsFinal.filter(id => !idsOriginal.includes(id)).forEach(id => {
              modificaciones.push({ tipo: "ot_agregada", ot_id: id, origen: ubicacionOriginal[id] || "nueva" });
            });
            // "ot_removida" solo cuenta cuando la OT quedó sin asignar —
            // si se movió a otro técnico, ese movimiento ya se refleja
            // como "ot_agregada" en la ruta destino (ver contrato).
            idsOriginal.filter(id => !idsFinal.includes(id)).forEach(id => {
              if (propuesta.pendientes.some(p => p.id === id)) modificaciones.push({ tipo: "ot_removida", ot_id: id });
            });
          }
        }
        const r = tecnico.resumen || {};
        return {
          tecnico_id: tid,
          tecnico_nombre: tecnico.nombre,
          zona_base: tecnico.zona || "",
          distancia_total_km: r.distanciaTotalKm ?? 0,
          capacidad_uso: r.capacidadUso || `${paradas.length}/?`,
          hora_salida_base: r.horaSalidaBase || "",
          hora_retorno_base: r.horaRetornoBase || "",
          ruta_propuesta: idsOriginal,
          ruta_final: idsFinal,
          aceptada_sin_modificacion: aceptadaSinModificacion,
          modificaciones,
          paradas: paradas.map((p, i) => ({
            ot_id: p.id, secuencia: i + 1, tipo: p.tipo, direccion: p.direccion,
            hora_estimada_llegada: p.horaEstimadaLlegada || "", espera_min: p.esperaMin || 0,
          })),
        };
      });

    // propuesta_modificada / tipo_modificacion: a diferencia de
    // `modificaciones` (por ruta), esto es a nivel de todo el plan — se
    // arma comparando dónde vivía cada OT (qué técnico, en qué posición)
    // en la versión sin editar contra dónde vive ahora. Así no se pierde
    // el caso donde un técnico se quedó sin ninguna OT (ya no aparece en
    // `rutas`, pero sus OTs sí se movieron a otro lado o a pendientes).
    const mapaOriginal = {};
    Object.entries(original.porTecnico).forEach(([tid, { paradas }]) => {
      paradas.forEach((p, i) => { mapaOriginal[p.id] = `${tid}:${i}`; });
    });
    const mapaFinal = {};
    Object.entries(propuesta.porTecnico).forEach(([tid, { paradas }]) => {
      paradas.forEach((p, i) => { mapaFinal[p.id] = `${tid}:${i}`; });
    });
    const tiposModificacion = new Set();
    Object.keys(mapaOriginal).forEach(otId => {
      const final = mapaFinal[otId];
      if (!final) { tiposModificacion.add("OT descartada"); return; }
      const [tidOriginal, idxOriginal] = mapaOriginal[otId].split(":");
      const [tidFinal, idxFinal] = final.split(":");
      if (tidFinal !== tidOriginal) tiposModificacion.add("OT asignada a otro técnico");
      else if (idxFinal !== idxOriginal) tiposModificacion.add("OT reordenada");
    });
    Object.keys(mapaFinal).forEach(otId => {
      if (!mapaOriginal[otId]) tiposModificacion.add("OT asignada a otro técnico");
    });
    const propuestaModificada = tiposModificacion.size > 0;

    // resumen_corrida: el de la corrida recién hecha si hay (onOptimizar);
    // si no (se reabrió un plan ya confirmado sin volver a correr el
    // optimizador), se arma a partir del estado actual de la propuesta.
    const resumenCorrida = resumen ? {
      total_ots: resumen.totalOts, ots_asignadas: resumen.otsAsignadas, ots_pendientes: resumen.otsPendientes,
      total_tecnicos: resumen.totalTecnicos, tecnicos_utilizados: resumen.tecnicosUtilizados,
      distancia_total_km: resumen.distanciaTotalKm, fuente_matriz: resumen.fuenteMatriz || "osrm",
    } : {
      total_ots: rutas.reduce((n, r) => n + r.paradas.length, 0) + propuesta.pendientes.length,
      ots_asignadas: rutas.reduce((n, r) => n + r.paradas.length, 0),
      ots_pendientes: propuesta.pendientes.length,
      total_tecnicos: Object.keys(propuesta.porTecnico).length,
      tecnicos_utilizados: rutas.length,
      distancia_total_km: rutas.reduce((n, r) => n + (r.distancia_total_km || 0), 0),
      fuente_matriz: "osrm",
    };

    return {
      fecha_planificacion: fecha,
      generado_en: generadoEn || new Date().toISOString(),
      revisado_en: new Date().toISOString(),
      revisado_por: { usuario_id: u.id, nombre: u.nombre, rol: u.rol },
      resumen_corrida: resumenCorrida,
      rutas,
      pendientes: propuesta.pendientes.map(p => ({
        ot_id: p.id, tipo: p.tipo, direccion: p.direccion,
        causa_principal: p.causaPrincipal || null, causas: p.causas || [],
      })),
      propuesta_modificada: propuestaModificada,
      tipo_modificacion: Array.from(tiposModificacion),
    };
  };

  // Al confirmar hay dos caminos (ver header de data.js):
  //  - Primera confirmación (esReedicion=false): se manda el PLAN
  //    COMPLETO por POST /asignar-tecnicos, como siempre.
  //  - Reprogramación (esReedicion=true, se reabrió un plan ya
  //    confirmado): mandar el plan entero de nuevo duplicaría sin razón
  //    lo que no cambió — en vez de eso, se manda UNA llamada PATCH por
  //    cada OT que efectivamente cambió, cada una con el motivo que se
  //    le pidió al momento de editarla (ver pedirMotivoSiCorresponde).
  //    Si a alguna le falta el motivo, no se manda nada todavía.
  const onConfirmar = async () => {
    const r = window.RUTAS_EXTERNO_OPTIMIZER.validarConfirmacion(propuesta.porTecnico);
    if (!r.ok) { setError(r.duplicado); return; }

    const otIdsCambiados = esReedicion ? calcularOtIdsCambiados(propuesta, propuestaOriginal) : new Set();
    if (esReedicion && Array.from(otIdsCambiados).some(id => !motivosPorOt[id])) {
      setError("Falta el motivo de reprogramación de alguna OT editada.");
      return;
    }

    setConfirmando(true);
    setError(null);
    try {
      if (esReedicion) {
        // Dónde vive AHORA cada OT que cambió, para saber a qué técnico
        // mandarla en el PATCH. Las que quedaron en pendientes (sin
        // técnico) no se pueden representar en este endpoint — se
        // avisa aparte en vez de fallar todo el guardado.
        const tecnicoActualDe = {};
        Object.entries(propuesta.porTecnico).forEach(([tid, { paradas }]) => {
          paradas.forEach(p => { tecnicoActualDe[p.id] = tid; });
        });
        // Dónde vivía cada OT ANTES de esta sesión de edición — para
        // distinguir "la movieron a otro técnico" de "se reordenó dentro
        // del mismo técnico" (mismo vocabulario que usa el plan completo).
        const original = propuestaOriginal || propuesta;
        const tecnicoOriginalDe = {};
        Object.entries(original.porTecnico).forEach(([tid, { paradas }]) => {
          paradas.forEach(p => { tecnicoOriginalDe[p.id] = tid; });
        });
        const u = CP_DATA.usuarios[0];
        const revisadoPor = { usuario_id: u.id, nombre: u.nombre, rol: u.rol };
        const otIdsList = Array.from(otIdsCambiados);
        // Las que quedaron en pendientes (sin técnico) también se
        // intentan — hoy el endpoint exige tecnico_id como string, así
        // que esto va a fallar con 422 hasta que lo acepten como
        // opcional/null, pero se manda igual para que funcione solo
        // apenas lo agreguen del otro lado (ver prompt pendiente).
        const resultados = await Promise.allSettled(
          otIdsList.map(otId => {
            const tecnicoId = tecnicoActualDe[otId] || null;
            const tipoModificacion = !tecnicoId
              ? "OT descartada"
              : tecnicoOriginalDe[otId] !== tecnicoId ? "OT asignada a otro técnico" : "OT reordenada";
            return window.RUTAS_EXTERNO_API.patchTecnicoOt(otId, tecnicoId, motivosPorOt[otId], revisadoPor, tipoModificacion);
          })
        );
        // No se bloquea el guardado entero por esto: cada PATCH es una
        // llamada independiente, así que las que sí funcionaron ya
        // quedaron guardadas — frenar todo acá solo escondería ese
        // progreso real detrás de un error genérico.
        const exitosas = [];
        const fallidas = [];
        resultados.forEach((r, i) => {
          if (r.status === "fulfilled") exitosas.push(otIdsList[i]);
          else fallidas.push({ otId: otIdsList[i], motivo: r.reason?.message || "error desconocido" });
        });

        setConfirmados(prev => ({ ...prev, [fecha]: { porTecnico: propuesta.porTecnico, fecha, generadoEn } }));
        if (fallidas.length > 0) {
          // Se queda en esta pantalla con el error a la vista — si
          // navegara a selección, PropuestaPanel (donde se muestra el
          // error) se desmonta y el aviso desaparece antes de que se
          // alcance a leer. Lo ya guardado no se pierde (cada PATCH es
          // independiente); solo falta resolver lo que no se guardó.
          setError(`${exitosas.length} OT guardadas, ${fallidas.length} no se pudieron guardar: ${fallidas.map(f => `${f.otId} (${f.motivo})`).join("; ")}`);
          onToast?.(`Plan reprogramado parcialmente — ${exitosas.length} de ${otIdsList.length} OT guardadas`);
          setConfirmando(false);
          return;
        }
        onToast?.(`Plan reprogramado — ${exitosas.length} OT actualizadas`);
      } else {
        const payload = construirPayloadAsignaciones();
        await window.RUTAS_EXTERNO_API.confirmarAsignaciones(payload);
        setConfirmados(prev => ({ ...prev, [fecha]: { porTecnico: fusionarPorTecnico(prev[fecha]?.porTecnico, propuesta.porTecnico), fecha, generadoEn } }));
        onToast?.("Plan de rutas confirmado y guardado");
      }
      setPropuesta(null);
      setPropuestaOriginal(null);
      setGeneradoEn(null);
      setResumen(null);
      setError(null);
      setEsReedicion(false);
      setMotivosPorOt({});
      setOtPidiendoMotivo(null);
      setEtapa("seleccion");
    } catch (err) {
      setError(`No se pudo guardar la confirmación: ${err.message}`);
    } finally {
      setConfirmando(false);
    }
  };

  // Totales de la ruta que se está editando (etapa "propuesta") — se
  // muestran en vez del botón "Rutas confirmadas" en esa pantalla (ver
  // page-head-actions más abajo): no tiene sentido ir al historial desde
  // ahí a mitad de una edición, y en cambio sí importa ver de un vistazo
  // cuántos técnicos y OT quedaron en el plan que se está por confirmar.
  const totalTecnicosConRuta = propuesta
    ? Object.values(propuesta.porTecnico).filter(({ paradas }) => paradas.length > 0).length
    : 0;
  const totalOtsEnRutas = propuesta
    ? Object.values(propuesta.porTecnico).reduce((sum, { paradas }) => sum + paradas.length, 0)
    : 0;

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div className="page-title">Planificar rutas</div>
        </div>
        <div className="page-head-actions">
          {etapa === "seleccion" ? (
            <button className="btn btn-primary" style={{ padding: "10px 18px", fontSize: 14 }} onClick={() => go("rutasExternoRegistro")}>
              <Icon name="clock" />Rutas confirmadas
            </button>
          ) : propuesta && (
            <span className="cell-muted" style={{ fontSize: 13 }}>
              <b style={{ color: "var(--text)" }}>{totalTecnicosConRuta}</b> técnico{totalTecnicosConRuta === 1 ? "" : "s"} ·{" "}
              <b style={{ color: "var(--text)" }}>{totalOtsEnRutas}</b> OT
            </span>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <TiraDias fecha={fecha} onSeleccionar={onSeleccionarFecha} estadoDelDia={estadoDelDia}
          fechaMin={fechaMin} fechaMax={fechaMax}
          otsPorAsignarCount={otsDelDia.length} tecnicosCount={tecnicosDisponibles.length}
          totalConfirmadas={estadoDelDia(fecha).confirmadas} onVerConfirmadas={() => onEditarConfirmado(fecha)} />
      </div>

      {fechaPendienteCambio && (
        <ConfirmarCambioFechaModal
          onCancelar={() => setFechaPendienteCambio(null)}
          onConfirmar={() => { cambiarFecha(fechaPendienteCambio); setFechaPendienteCambio(null); }}
        />
      )}

      {cargando ? (
        <div className="card empty"><Icon name="refresh" />Cargando datos del día…</div>
      ) : errorCarga ? (
        <div className="card empty"><Icon name="alert" />No se pudo cargar técnicos/OT: {errorCarga}</div>
      ) : etapa === "seleccion" ? (
        <SeleccionPanel fecha={fecha} otsDelDia={otsDelDia} tecnicosDisponibles={tecnicosDisponibles}
          otsSel={otsSel} tecSel={tecSel} toggleOt={toggleOt} toggleTec={toggleTec}
          onToggleTodosOts={setTodosOts} onToggleTodosTec={setTodosTec} onOptimizar={onOptimizar}
          onAsignacionManual={onAsignacionManual} diaConfirmado={estadoDelDia(fecha).confirmadas > 0}
          optimizando={optimizando} error={error} />
      ) : (
        <PropuestaPanel propuesta={propuesta} propuestaOriginal={propuestaOriginal} resumen={resumen} error={error} recalculando={recalculando} erroresTecnico={erroresTecnico} confirmando={confirmando}
          onMoveUp={onMoveUp} onMoveDown={onMoveDown} onMover={onMover} onEliminar={onEliminar}
          onMoverPendiente={onMoverPendiente} onRestablecerRuta={onRestablecerRuta}
          onVolver={onVolver} onConfirmar={onConfirmar}
          esReedicion={esReedicion} motivosPorOt={motivosPorOt} />
      )}

      {otPidiendoMotivo && (
        <MotivoReprogramacionModal
          ot={buscarOtEnPropuesta(propuesta, otPidiendoMotivo)}
          onGuardar={(motivo) => {
            setMotivosPorOt(prev => ({ ...prev, [otPidiendoMotivo]: motivo }));
            setOtPidiendoMotivo(null);
          }}
        />
      )}
      {optimizando && <CargandoOverlay mensaje="Optimizando planificación…" />}
      {confirmando && <CargandoOverlay mensaje={esReedicion ? "Reprogramando…" : "Asignando…"} />}
    </div>
  );
}

Object.assign(window, { RutasExternoScreen, RegistroAsignacionesScreen });
