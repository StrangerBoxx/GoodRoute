/* ==========================================================================
   Dashboard de análisis — HU-12 (Sprint 2)
   --------------------------------------------------------------------------
   Pantalla real del backoffice: vive en el routing de app/main.jsx
   (route.screen === "analisis"), montada dentro del Sidebar/TopBar de
   siempre. Es la variante A ("Torre de control") con el diseño que el
   supervisor terminó aprobando después de dos rondas de feedback:
   botonera de categorías (con un tab "Todos" al final) en vez de una
   grilla plana, y sin comparación contra el período anterior.

   Esta es la ÚNICA copia conectada al proyecto — la fuente de verdad para
   cualquier cambio futuro del dashboard. prototipos/hu-12-dashboard/ (A, B
   y C) queda congelado como registro de la revisión que llevó a este
   diseño; no se vuelve a tocar ni se vuelve a sincronizar desde ahí.

   Sin bundler: Recharts y pdfmake llegan como globales UMD (agregados en
   index.html). Los íconos usan el registro compartido de app/ui.jsx, no
   lucide-react, y los colores salen de las variables CSS de app/styles.css
   en vez de una paleta propia, para heredar el tema (incluyendo los
   Tweaks de Marca).
   ========================================================================== */
const {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea,
} = Recharts;

/* ==========================================================================
   1. INTERRUPTOR DE HONESTIDAD DEL DATO
   Al conectar el backend, poner en true: el aviso "Datos simulados" desaparece
   de toda la aplicación sin tocar ninguna otra línea.
   ========================================================================== */
const USANDO_DATOS_REALES = false;

/* ==========================================================================
   2. CATÁLOGO DE INDICADORES  —  ÚNICO PUNTO DE EDICIÓN
   --------------------------------------------------------------------------
   Agregar, quitar o reordenar un indicador se hace SOLO acá. Los componentes
   iteran sobre este array; el layout no conoce ningún indicador por nombre.

   Campos:
     id            clave estable, usada por el adaptador de datos
     nombre        rótulo visible
     definicion    qué mide, en palabras del supervisor (se muestra en el popover)
     formula       cómo se calcula (se muestra en el popover)
     fuente        de dónde sale el dato (se muestra en el popover)
     unidad        símbolo corto
     formato       "pct" | "clp" | "km" | "min" | "ot" | "clpOT"
     direccion     "mas" | "menos" | "contexto" | "rango"
     granularidad  "tecnico"  -> se puede filtrar y desagregar por técnico
                   "global"   -> sólo existe a nivel de sistema
     objetivo      [min, max] opcional; sólo para direccion "rango"
     sim           parámetros del generador de datos simulados
   ========================================================================== */
const INDICADORES = [
  {
    id: "km_tecnico",
    nombre: "Kilometraje por técnico",
    definicion: "Distancia recorrida por cada técnico en el período.",
    formula: "Σ km recorridos, agrupado por técnico",
    fuente: "GPS del vehículo (RedGPS), tramos entre paradas de la ruta.",
    unidad: "km", formato: "km", direccion: "menos", granularidad: "tecnico",
    grupo: "recurso",
    sim: { base: 118, ruido: 0.14, tendencia: -0.09, finde: 0.38, min: 40, max: 210 },
  },
  {
    id: "tasa_asignacion",
    nombre: "Tasa de asignación",
    definicion:
      "Porcentaje de rutas optimizadas que el usuario aceptó sin modificar. Una ruta no modificada es un éxito del optimizador.",
    formula: "rutas_no_modificadas / rutas_propuestas",
    fuente: "Log de aceptación del optimizador. Ojo: hoy cuenta como modificada cualquier edición.",
    unidad: "%", formato: "pct", direccion: "mas", granularidad: "global",
    grupo: "optimizador",
    sim: { base: 71, ruido: 0.11, tendencia: 0.16, finde: 0.94, min: 40, max: 96 },
  },
  {
    id: "saturacion",
    nombre: "Saturación de turnos",
    definicion:
      "Porcentaje del turno de un técnico interno efectivamente comprometido en traslados y atención de OT, frente al tiempo inactivo.",
    formula: "(tiempo_traslado + tiempo_atencion) / duracion_turno",
    fuente: "Marcas de inicio y cierre de OT en la app del técnico + tramos GPS.",
    unidad: "%", formato: "pct", direccion: "rango", objetivo: [75, 88],
    granularidad: "tecnico", grupo: "recurso",
    sim: { base: 80, ruido: 0.09, tendencia: 0.09, finde: 0.96, min: 45, max: 97 },
  },
  {
    id: "insercion_vivo",
    nombre: "Tasa de inserción en vivo",
    definicion:
      "Porcentaje de OT nuevas que logran integrarse de forma factible en jornadas ya iniciadas, sin alterar los compromisos existentes de la ruta.",
    formula: "OT_insertadas_factibles / OT_nuevas_solicitadas",
    fuente: "Motor de reoptimización, eventos de inserción durante la jornada.",
    unidad: "%", formato: "pct", direccion: "mas", granularidad: "global",
    grupo: "optimizador",
    sim: { base: 63, ruido: 0.17, tendencia: 0.21, finde: 0.7, min: 20, max: 92 },
  },
  {
    id: "ot_asignadas",
    nombre: "OT asignadas",
    definicion: "Cantidad de órdenes de trabajo asignadas en el período.",
    formula: "conteo de OT con técnico asignado",
    fuente: "Backoffice Control Position, tabla de órdenes de trabajo.",
    unidad: "OT", formato: "ot", direccion: "contexto", granularidad: "tecnico",
    grupo: "recurso",
    sim: { base: 34, ruido: 0.19, tendencia: 0.13, finde: 0.24, min: 4, max: 62 },
  },
  {
    id: "dist_optimizada",
    nombre: "Distancia total optimizada",
    definicion:
      "Kilómetros ahorrados por la ruta optimizada respecto de la línea base (asignación manual o secuencial).",
    formula: "km_baseline − km_optimizados",
    fuente: "Comparación contra ruta secuencial por orden de ingreso. Línea base por acordar.",
    unidad: "km", formato: "km", direccion: "mas", granularidad: "tecnico",
    grupo: "optimizador",
    sim: { base: 96, ruido: 0.21, tendencia: 0.24, finde: 0.3, min: 15, max: 220 },
  },
  {
    id: "dinero_ahorrado",
    nombre: "Dinero ahorrado",
    definicion: "Valorización monetaria del ahorro en distancia y tiempo.",
    formula: "km_ahorrados × costo_km + horas_ahorradas × costo_hora_tecnico",
    fuente: "Indicador derivado. Depende de la misma línea base que la distancia optimizada.",
    unidad: "$", formato: "clp", direccion: "mas", granularidad: "tecnico",
    grupo: "economicos",
    sim: { base: 268000, ruido: 0.22, tendencia: 0.26, finde: 0.28, min: 40000, max: 620000 },
  },
  {
    id: "costo_inactividad",
    nombre: "Costo de oportunidad por inactividad",
    definicion:
      "Valor monetario de los tiempos muertos cuando un técnico llega antes y debe esperar en el vehículo a que abra la ventana horaria del cliente.",
    formula: "Σ minutos_espera_en_sitio × costo_minuto_tecnico",
    fuente: "Diferencia entre llegada GPS e inicio de OT en la app, × costo minuto.",
    unidad: "$", formato: "clp", direccion: "menos", granularidad: "tecnico",
    grupo: "economicos",
    sim: { base: 84000, ruido: 0.24, tendencia: -0.19, finde: 0.3, min: 12000, max: 210000 },
  },
  {
    id: "costo_por_ot",
    nombre: "Costo operativo por OT",
    definicion:
      "Valor del tiempo del técnico más el costo de combustible por kilómetro, dividido por las instalaciones exitosas del día.",
    formula: "(horas × costo_hora + km × costo_km) / instalaciones_exitosas",
    fuente: "Nómina + consumo de combustible + cierres exitosos del día.",
    unidad: "$/OT", formato: "clpOT", direccion: "menos", granularidad: "tecnico",
    grupo: "economicos",
    sim: { base: 12400, ruido: 0.13, tendencia: -0.11, finde: 1.28, min: 6500, max: 21000 },
  },
  {
    id: "espera_cliente",
    nombre: "Tiempo medio de espera del cliente",
    definicion:
      "Promedio de minutos entre el inicio de la ventana horaria acordada y la llegada efectiva del técnico.",
    formula: "promedio(hora_llegada − inicio_ventana)",
    fuente: "Llegada GPS vs. ventana pactada. Las llegadas anticipadas hoy se cuentan como cero.",
    unidad: "min", formato: "min", direccion: "menos", granularidad: "tecnico",
    grupo: "cliente",
    sim: { base: 17, ruido: 0.19, tendencia: -0.16, finde: 1.15, min: 3, max: 42 },
  },
];

const GRUPOS = [
  { id: "optimizador", nombre: "Desempeño del optimizador", color: "#033E84",
    pregunta: "¿El optimizador está proponiendo rutas que se usan tal cual?" },
  { id: "recurso", nombre: "Uso del recurso técnico", color: "#e07419",
    pregunta: "¿Estamos cargando bien a la cuadrilla?" },
  { id: "economicos", nombre: "Económicos", color: "#1c6e44",
    pregunta: "¿Cuánta plata deja o cuesta la operación de hoy?" },
  { id: "cliente", nombre: "Experiencia del cliente", color: "#7c54c9",
    pregunta: "¿Estamos llegando cuando dijimos que íbamos a llegar?" },
];

/* ==========================================================================
   3. MAESTROS DE FILTRO
   --------------------------------------------------------------------------
   El técnico y la zona salen del padrón real del backoffice (CP_DATA.tecnicos),
   no de una lista aparte, para que el filtro muestre gente real del sistema.
   ========================================================================== */
function tecnicoFactor(id) {
  // Factor estable por técnico (0.8–1.3), para que la simulación no salte
  // de un refresh a otro. Reemplaza al campo "f" de un padrón de prueba.
  return 0.8 + mulberry32(hash(id))() * 0.5;
}
const ZONAS = [...new Set(CP_DATA.tecnicos.map((t) => t.zona))].sort();
const TIPOS_OT = ["Instalación", "Mantención", "Retiro", "Revisión en terreno"];

/* ==========================================================================
   4. ADAPTADOR DE DATOS  —  ÚNICO PUNTO DE CONEXIÓN AL BACKEND
   --------------------------------------------------------------------------
   >>> PUNTO DE REEMPLAZO <<<
   Cuando exista el backend, se reemplaza EL CUERPO de obtenerSerie() por un
   fetch al endpoint histórico y se pone USANDO_DATOS_REALES = true. La firma y
   la forma del objeto de retorno no cambian, así que ningún componente se toca.

   Devuelve:
     {
       serie:    [{ iso, etiqueta, valor }]   período seleccionado
       anterior: [{ iso, etiqueta, valor }]   período inmediatamente previo
       porTecnico: [{ id, nombre, zona, tipo, valor }]
       vacio:    boolean  -> true cuando la combinación de filtros no tiene dato
       motivoVacio: string
     }
   ========================================================================== */

// Hoy fijo: el prototipo del Sprint 1 opera sobre el lunes 1 de junio de 2026.
const HOY = new Date(2026, 5, 1);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const iso = (d) => d.toISOString().slice(0, 10);
const etiquetaFecha = (d) =>
  String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");

function diasDelRango(rango) {
  const dias = [];
  const fin = rango.desde && rango.hasta ? new Date(rango.hasta) : HOY;
  const n = rango.dias;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(fin); d.setDate(fin.getDate() - i); dias.push(d);
  }
  return dias;
}

function factorFiltros(filtros) {
  let f = 1;
  if (filtros.tecnico !== "todos") {
    const t = CP_DATA.techById[filtros.tecnico];
    if (t) f *= tecnicoFactor(t.id);
  }
  if (filtros.zona !== "todas") f *= 0.94 + (hash(filtros.zona) % 13) / 100;
  if (filtros.tipoOT !== "todos") f *= 0.9 + (hash(filtros.tipoOT) % 21) / 100;
  return f;
}

// Horizonte sobre el que se despliega la tendencia declarada en cada indicador.
const HORIZONTE_DIAS = 180;

function valorDelDia(ind, fecha, filtros) {
  const s = ind.sim;
  const semilla = hash(ind.id + "|" + iso(fecha) + "|" + filtros.zona + "|" + filtros.tipoOT);
  const r = mulberry32(semilla)();
  const dow = fecha.getDay();
  const finde = dow === 0 || dow === 6;
  // La deriva depende de la fecha real, no de la posición en la ventana: así el
  // período anterior queda genuinamente antes en la tendencia.
  const diasAtras = Math.min(HORIZONTE_DIAS, Math.max(0, (HOY - fecha) / 86400000));
  const t = 1 - diasAtras / HORIZONTE_DIAS;
  const deriva = s.tendencia * (t - 0.5);
  let v = s.base * (1 + deriva) + (r - 0.5) * 2 * s.ruido * s.base;
  // pequeña ondulación intrasemanal, para que no se lea como ruido plano
  v *= 1 + Math.sin((dow / 7) * Math.PI * 2) * 0.035;
  if (finde) v *= s.finde;
  v *= factorFiltros(filtros);
  return Math.max(s.min, Math.min(s.max, v));
}

function obtenerSerie(indicadorId, rango, filtros) {
  /* ---- INICIO DEL CUERPO REEMPLAZABLE ---------------------------------- */
  const ind = INDICADORES.find((x) => x.id === indicadorId);
  if (!ind) return { serie: [], anterior: [], porTecnico: [], vacio: true, motivoVacio: "Indicador no encontrado." };

  // Regla honesta del prototipo: los indicadores de nivel sistema no se
  // desagregan por técnico, así que filtrar por uno deja el gráfico sin dato.
  if (ind.granularidad === "global" && filtros.tecnico !== "todos") {
    return {
      serie: [], anterior: [], porTecnico: [], vacio: true,
      motivoVacio: "Este indicador se mide a nivel de sistema y no se desagrega por técnico. Sacá el filtro de técnico para verlo.",
    };
  }

  const dias = diasDelRango(rango);
  const n = dias.length;
  const serie = dias.map((d) => ({
    iso: iso(d), etiqueta: etiquetaFecha(d), valor: valorDelDia(ind, d, filtros),
  }));

  // "anterior" (el período inmediatamente previo) hoy NO se muestra en la
  // interfaz: la línea base para comparar todavía no está acordada con el
  // supervisor. Se deja calculado para reactivar la comparación el día que
  // sí lo esté — no borrar este bloque.
  const previos = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(dias[0]); d.setDate(dias[0].getDate() - (i + 1)); previos.push(d);
  }
  const anterior = previos.map((d) => ({
    iso: iso(d), etiqueta: etiquetaFecha(d), valor: valorDelDia(ind, d, filtros),
  }));

  const candidatos = CP_DATA.tecnicos.filter(
    (t) =>
      (filtros.tecnico === "todos" || t.id === filtros.tecnico) &&
      (filtros.zona === "todas" || t.zona === filtros.zona)
  );
  const promedio = serie.reduce((a, b) => a + b.valor, 0) / Math.max(1, serie.length);
  const porTecnico = candidatos.map((t) => {
    const r = mulberry32(hash(ind.id + t.id + filtros.tipoOT))();
    return {
      id: t.id, nombre: CP_DATA.tnombre(t), zona: t.zona, tipo: t.tipo,
      valor: Math.max(ind.sim.min, promedio * tecnicoFactor(t.id) * (0.88 + r * 0.26)),
    };
  });

  return { serie, anterior, porTecnico, vacio: serie.length === 0, motivoVacio: "" };
  /* ---- FIN DEL CUERPO REEMPLAZABLE ------------------------------------- */
}

/* ==========================================================================
   5. FORMATO Y LECTURA
   ========================================================================== */
const nf = (v, d = 0) =>
  v.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });

function formatear(valor, formato) {
  if (valor == null || Number.isNaN(valor)) return "—";
  switch (formato) {
    case "pct": return nf(valor, 1) + " %";
    case "clp": return "$" + nf(Math.round(valor));
    case "clpOT": return "$" + nf(Math.round(valor));
    case "km": return nf(Math.round(valor)) + " km";
    case "min": return nf(Math.round(valor)) + " min";
    case "ot": return nf(Math.round(valor));
    default: return nf(valor, 1);
  }
}
function formatearCorto(valor, formato) {
  if (valor == null) return "—";
  if (formato === "clp" || formato === "clpOT") {
    if (Math.abs(valor) >= 1000000) return "$" + nf(valor / 1000000, 1) + "M";
    if (Math.abs(valor) >= 1000) return "$" + nf(Math.round(valor / 1000)) + "k";
    return "$" + nf(Math.round(valor));
  }
  return formatear(valor, formato);
}

const promedio = (arr) => (arr.length ? arr.reduce((a, b) => a + b.valor, 0) / arr.length : null);
const suma = (arr) => arr.reduce((a, b) => a + b.valor, 0);

// Los indicadores de conteo y de ahorro se leen como total; el resto, como promedio.
const esAcumulable = (ind) => ["ot_asignadas", "dinero_ahorrado", "costo_inactividad", "dist_optimizada"].includes(ind.id);
const valorRepresentativo = (ind, serie) =>
  serie.length === 0 ? null : esAcumulable(ind) ? suma(serie) : promedio(serie);

// Texto corto de la dirección declarada de un indicador — sale de INDICADORES,
// nunca a mano. Se usa en la tarjeta y en el popover de definición.
function direccionTexto(ind) {
  return ind.direccion === "mas" ? "más es mejor"
    : ind.direccion === "menos" ? "menos es mejor"
    : ind.direccion === "rango" ? "rango objetivo " + ind.objetivo[0] + "–" + ind.objetivo[1] + " %"
    : "indicador de contexto";
}

// Lectura bajo el gráfico principal: sólo para indicadores de rango, porque
// ahí la referencia es un umbral acordado (no una comparación temporal).
// Para el resto no hay nada honesto que decir sin la línea base — no se
// muestra ninguna frase. Esta es la decisión del supervisor: sin delta,
// sin comparación contra el período anterior en ningún lado de la pantalla.
function lectura(ind, valorActual) {
  if (ind.direccion !== "rango" || valorActual == null) return null;
  const [lo, hi] = ind.objetivo;
  if (valorActual > hi)
    return "Por sobre el rango objetivo (" + lo + "–" + hi + " %): la jornada queda sin holgura para insertar OT nuevas.";
  if (valorActual < lo)
    return "Bajo el rango objetivo (" + lo + "–" + hi + " %): hay turno pagado que no se está usando.";
  return "Dentro del rango objetivo (" + lo + "–" + hi + " %), con espacio para reaccionar en el día.";
}

/* ==========================================================================
   6. PIEZAS DE INTERFAZ COMPARTIDAS
   ========================================================================== */

function AvisoDatoSimulado() {
  if (USANDO_DATOS_REALES) return null;
  return <Badge cls="b-amber" icon="alert">Datos simulados — no usar para decisiones</Badge>;
}

function InfoIndicador({ ind }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    const escKey = (e) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("mousedown", cerrar);
    window.addEventListener("keydown", escKey);
    return () => { window.removeEventListener("mousedown", cerrar); window.removeEventListener("keydown", escKey); };
  }, [abierto]);

  return (
    <span style={{ position: "relative", display: "inline-flex" }} ref={caja}>
      <button
        type="button"
        aria-label={"Qué mide " + ind.nombre}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 6, color: abierto ? "var(--accent)" : "var(--text-4)" }}
        onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v); }}
      >
        <Icon name="info" style={{ width: 15, height: 15 }} />
      </button>
      {abierto && (
        <div className="ind-pop" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>{ind.nombre}</div>
            <button
              type="button" aria-label="Cerrar"
              style={{ marginLeft: "auto", color: "var(--text-3)", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}
              onClick={() => setAbierto(false)}
            ><Icon name="x" style={{ width: 14, height: 14 }} /></button>
          </div>
          <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>{ind.definicion}</p>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>Fórmula</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--text)", marginTop: 2 }}>{ind.formula}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>Unidad</div>
              <div style={{ fontSize: 12, color: "var(--text)", marginTop: 2 }}>
                {ind.unidad} · {direccionTexto(ind)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>Fuente del dato</div>
              <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2, lineHeight: 1.5 }}>{ind.fuente}</div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

function Sparkline({ datos, color, alto = 34 }) {
  if (!datos.length) return <div style={{ height: alto }} />;
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <AreaChart data={datos} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={"sp" + color.replace("#", "")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="valor" stroke={color} strokeWidth={1.6}
          fill={"url(#sp" + color.replace("#", "") + ")"} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TooltipGrafico({ active, payload, label, ind }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12, boxShadow: "var(--shadow-pop)" }}>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 600 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "var(--text-2)" }}>{p.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600, fontSize: 12.5, color: "var(--text)" }}>
            {formatear(p.value, ind.formato)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SinDatos({ motivo, alto = 220 }) {
  return (
    <div className="empty" style={{ height: alto, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <Icon name="inbox" />
      <div style={{ marginTop: 4, fontWeight: 600, fontSize: 13.5, color: "var(--text-2)" }}>Sin datos en este rango</div>
      <p style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-3)", maxWidth: 380, lineHeight: 1.5 }}>
        {motivo || "Probá ampliar el período o sacar alguno de los filtros."}
      </p>
    </div>
  );
}

function Cargando({ alto = 220 }) {
  return (
    <div style={{ height: alto, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <span className="icon-spin" style={{ color: "var(--text-4)" }}><Icon name="refresh" style={{ width: 22, height: 22 }} /></span>
      <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-3)" }}>Recalculando el período…</div>
    </div>
  );
}

function Esqueleto({ alto = 34 }) {
  return <div className="skel" style={{ height: alto, borderRadius: 6, background: "var(--surface-3)" }} />;
}

/* ---- Selectores ---- */
function Selector({ etiqueta, valor, onChange, opciones }) {
  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <span className="field-label">{etiqueta}</span>
      <select className="field-input" value={valor} onChange={(e) => onChange(e.target.value)} style={{ width: "auto" }}>
        {opciones.map((o) => (<option key={o.valor} value={o.valor}>{o.texto}</option>))}
      </select>
    </label>
  );
}

const PRESETS = [
  { valor: "7", texto: "Últimos 7 días" },
  { valor: "30", texto: "Últimos 30 días" },
  { valor: "90", texto: "Últimos 90 días" },
  { valor: "custom", texto: "Rango personalizado" },
];

function BarraFiltros({ rango, setRango, filtros, setFiltros, cargando, onRecargar }) {
  const cambiarPreset = (v) => {
    if (v === "custom") {
      const desde = new Date(HOY); desde.setDate(HOY.getDate() - 44);
      setRango({ preset: "custom", dias: 45, desde: iso(desde), hasta: iso(HOY) });
    } else {
      setRango({ preset: v, dias: Number(v), desde: null, hasta: null });
    }
  };
  const cambiarFecha = (campo, valor) => {
    const nuevo = { ...rango, [campo]: valor };
    const d1 = new Date(nuevo.desde), d2 = new Date(nuevo.hasta);
    const dias = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    setRango({ ...nuevo, dias: Math.min(dias, 180) });
  };

  return (
    <div className="card card-pad" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 18 }}>
      <Selector etiqueta="Período" valor={rango.preset} onChange={cambiarPreset} opciones={PRESETS} />
      {rango.preset === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="date" className="field-input" value={rango.desde || ""} onChange={(e) => cambiarFecha("desde", e.target.value)} style={{ width: 150 }} />
          <span style={{ color: "var(--text-3)", fontSize: 12 }}>a</span>
          <input type="date" className="field-input" value={rango.hasta || ""} onChange={(e) => cambiarFecha("hasta", e.target.value)} style={{ width: 150 }} />
        </div>
      )}

      <div style={{ width: 1, alignSelf: "stretch", background: "var(--border-2)" }} />

      <Selector etiqueta="Técnico" valor={filtros.tecnico}
        onChange={(v) => setFiltros({ ...filtros, tecnico: v })}
        opciones={[{ valor: "todos", texto: "Todos" },
          ...CP_DATA.tecnicos.map((t) => ({ valor: t.id, texto: CP_DATA.tnombre(t) }))]} />
      <Selector etiqueta="Zona" valor={filtros.zona}
        onChange={(v) => setFiltros({ ...filtros, zona: v })}
        opciones={[{ valor: "todas", texto: "Todas" },
          ...ZONAS.map((z) => ({ valor: z, texto: z }))]} />
      <Selector etiqueta="Tipo de OT" valor={filtros.tipoOT}
        onChange={(v) => setFiltros({ ...filtros, tipoOT: v })}
        opciones={[{ valor: "todos", texto: "Todos" },
          ...TIPOS_OT.map((t) => ({ valor: t, texto: t }))]} />

      <button type="button" onClick={onRecargar} className="btn" style={{ marginLeft: "auto" }}>
        <span className={cargando ? "icon-spin" : ""}><Icon name="refresh" /></span>
        Actualizar
      </button>
    </div>
  );
}

/* ==========================================================================
   7. HOOK DE DATOS — un solo lugar donde se pide todo el tablero
   ========================================================================== */
function useTablero() {
  const [rango, setRango] = useState({ preset: "30", dias: 30, desde: null, hasta: null });
  const [filtros, setFiltros] = useState({ tecnico: "todos", zona: "todas", tipoOT: "todos" });
  const [cargando, setCargando] = useState(false);
  const [tick, setTick] = useState(0);

  // Estado de carga: hoy es simulado; al conectar el backend queda igual,
  // porque obtenerSerie() pasará a ser asíncrona detrás de este mismo hook.
  useEffect(() => {
    setCargando(true);
    const t = setTimeout(() => setCargando(false), 380);
    return () => clearTimeout(t);
  }, [rango, filtros, tick]);

  const datos = useMemo(() => {
    const mapa = {};
    INDICADORES.forEach((ind) => {
      const d = obtenerSerie(ind.id, rango, filtros);
      mapa[ind.id] = { ...d, valor: valorRepresentativo(ind, d.serie) };
    });
    return mapa;
  }, [rango, filtros, tick]);

  return { rango, setRango, filtros, setFiltros, cargando, datos, recargar: () => setTick((t) => t + 1) };
}

/* ==========================================================================
   8. TORRE DE CONTROL — botonera de categorías, gráfico principal, tabla
   ========================================================================== */

function TarjetaKPI({ ind, d, activo, onSelect, cargando }) {
  const grupo = GRUPOS.find((g) => g.id === ind.grupo);
  return (
    <div onClick={() => onSelect(ind.id)} className={"ind-card" + (activo ? " active" : "")}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <span style={{ width: 3, height: 15, borderRadius: 3, background: grupo.color, flex: "none", marginTop: 2 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)", lineHeight: 1.3 }}>{ind.nombre}</span>
        <span style={{ marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}><InfoIndicador ind={ind} /></span>
      </div>

      {cargando ? <div style={{ marginTop: 8 }}><Esqueleto alto={30} /></div> : d.vacio ? (
        <div style={{ marginTop: 8, fontSize: 20, fontWeight: 650, color: "var(--text-4)" }}>—</div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 22, fontWeight: 680, letterSpacing: "-0.6px" }}>
          {formatearCorto(d.valor, ind.formato)}
          {ind.formato === "clpOT" && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}> /OT</span>}
        </div>
      )}

      {!d.vacio && <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-3)" }}>{direccionTexto(ind)}</div>}

      <div style={{ marginTop: 6, display: "flex", alignItems: "center" }}>
        <div style={{ width: "100%" }}>
          {!d.vacio && !cargando && <Sparkline datos={d.serie} color={grupo.color} alto={26} />}
        </div>
      </div>
    </div>
  );
}

// "Todos" no es un grupo real — es un atajo de UI para volver a la grilla
// plana con los diez indicadores juntos. Por eso no vive en GRUPOS: agregar
// una entrada falsa ahí rompería los lookups que hacen TarjetaKPI/TablaTecnicos
// contra el grupo real de cada indicador.
const TODOS_ID = "todos";

// Botonera de categorías: una pestaña por grupo, generada iterando GRUPOS —
// un grupo nuevo en INDICADORES/GRUPOS aparece acá solo, sin tocar este
// componente. "Todos" va al final, fijo.
function BotonesCategoria({ grupoActivo, onCambiar }) {
  const boton = (key, on, color, nombre, cantidad) => (
    <button key={key} type="button" role="tab" aria-selected={on}
      onClick={() => onCambiar(key)}
      style={{
        display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        padding: "11px 15px", borderRadius: "var(--radius)",
        background: on ? "var(--surface)" : "transparent",
        border: "1px solid " + (on ? "var(--border-2)" : "transparent"),
        boxShadow: on ? "var(--shadow-sm)" : "none",
      }}>
      <span style={{ width: 4, height: 26, borderRadius: 3, background: on ? color : "var(--border-3)", flex: "none" }} />
      <span>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: on ? 650 : 550, color: on ? "var(--text)" : "var(--text-2)" }}>
          {nombre}
        </span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--text-3)" }}>
          {cantidad} {cantidad === 1 ? "indicador" : "indicadores"}
        </span>
      </span>
    </button>
  );

  return (
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="tablist" aria-label="Categorías de indicadores">
      {GRUPOS.map((g) =>
        boton(g.id, g.id === grupoActivo, g.color, g.nombre, INDICADORES.filter((i) => i.grupo === g.id).length)
      )}
      {boton(TODOS_ID, grupoActivo === TODOS_ID, "var(--text-3)", "Todos", INDICADORES.length)}
    </nav>
  );
}

function GraficoPrincipal({ ind, d, cargando, graficoRef }) {
  const datos = d.serie.map((p) => ({ etiqueta: p.etiqueta, actual: p.valor }));
  const grupo = GRUPOS.find((g) => g.id === ind.grupo);
  const nota = lectura(ind, d.valor);

  return (
    <section className="block">
      <div className="block-head" style={{ flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="block-title">{ind.nombre}</div>
            <InfoIndicador ind={ind} />
          </div>
          {nota && <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>{nota}</p>}
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>
            {esAcumulable(ind) ? "Total del período" : "Promedio del período"}
          </div>
          <div style={{ fontSize: 21, fontWeight: 680, letterSpacing: "-0.5px" }}>
            {d.vacio ? "—" : formatear(d.valor, ind.formato)}
          </div>
        </div>
      </div>

      <div ref={graficoRef} className="block-body" style={{ paddingTop: 18, paddingBottom: 8 }}>
        {cargando ? <Cargando alto={280} /> : d.vacio ? <SinDatos motivo={d.motivoVacio} alto={280} /> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={datos} margin={{ top: 4, right: 14, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="gPrincipal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={grupo.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={grupo.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false}
                axisLine={{ stroke: "var(--border-2)" }} minTickGap={22} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false}
                width={62} tickFormatter={(v) => formatearCorto(v, ind.formato)} />
              <Tooltip content={<TooltipGrafico ind={ind} />} />
              {ind.direccion === "rango" && (
                <ReferenceArea y1={ind.objetivo[0]} y2={ind.objetivo[1]} fill="var(--green-bg)" fillOpacity={0.7} />
              )}
              <Area type="monotone" dataKey="actual" name="Valor" stroke={grupo.color}
                strokeWidth={2.2} fill="url(#gPrincipal)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function TablaTecnicos({ ind, d, cargando, tablaRef }) {
  const [orden, setOrden] = useState({ campo: "valor", asc: false });
  const filas = useMemo(() => {
    const copia = [...d.porTecnico];
    copia.sort((a, b) => {
      const x = a[orden.campo], y = b[orden.campo];
      const cmp = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "es");
      return orden.asc ? cmp : -cmp;
    });
    return copia;
  }, [d.porTecnico, orden]);

  const th = (campo, texto, alinearDerecha) => (
    <th style={{ textAlign: alinearDerecha ? "right" : "left" }}>
      <button type="button"
        onClick={() => setOrden((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }))}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, letterSpacing: ".4px", textTransform: "uppercase", color: orden.campo === campo ? "var(--accent)" : "var(--text-3)" }}>
        {texto}<Icon name="arrowUpDown" style={{ width: 11, height: 11 }} />
      </button>
    </th>
  );

  const max = Math.max(...filas.map((f) => f.valor), 1);
  const grupo = GRUPOS.find((g) => g.id === ind.grupo);

  return (
    <>
      <div className="sec-head">
        <div className="sec-title">Detalle por técnico</div>
        <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{ind.nombre} · {esAcumulable(ind) ? "total" : "promedio"} del período</span>
      </div>
      <div ref={tablaRef} className="card">
        {cargando ? <Cargando alto={200} /> : d.vacio ? <SinDatos motivo={d.motivoVacio} alto={200} /> : (
          <table className="tbl">
            <thead>
              <tr>
                {th("nombre", "TÉCNICO")}{th("zona", "COMUNA")}{th("tipo", "VÍNCULO")}
                {th("valor", ind.unidad.toUpperCase(), true)}
                <th style={{ width: 190 }} />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="cell-strong">{f.nombre}</td>
                  <td className="cell-muted">{f.zona}</td>
                  <td className="cell-muted">{f.tipo === "interno" ? "Interno" : "Externo"}</td>
                  <td style={{ fontWeight: 600, textAlign: "right" }}>{formatear(f.valor, ind.formato)}</td>
                  <td>
                    <div className="pbar" style={{ width: "100%" }}>
                      <i style={{ width: (f.valor / max) * 100 + "%", background: grupo.color }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ==========================================================================
   9. EXPORTACIÓN A PDF
   --------------------------------------------------------------------------
   Exporta exactamente lo que el usuario tiene en pantalla en ese momento
   (categoría activa, indicador elegido, orden de tabla, período y filtros),
   nunca el dashboard completo. Genera el documento con pdfmake (texto y
   tablas vectoriales reales, no una captura de pantalla) — el único
   contenido rasterizado es el gráfico grande, porque pdfmake no sabe dibujar
   el SVG de Recharts; se lo convierte a PNG a 3x para que no se vea pixelado.
   ========================================================================== */

// dd/mm/aaaa a partir de un iso yyyy-mm-dd — el PDF exige fechas concretas,
// nunca "últimos 30 días".
function fechaCompleta(iso) {
  const [y, m, d] = iso.split("-");
  return d + "/" + m + "/" + y;
}

function textoCategoriaActiva(grupoActivo, grupo) {
  return grupoActivo === TODOS_ID ? "Todos los indicadores" : grupo.nombre;
}

function textoFiltrosActivos(filtros) {
  const partes = [];
  if (filtros.tecnico !== "todos") {
    const t = CP_DATA.techById[filtros.tecnico];
    if (t) partes.push("Técnico: " + CP_DATA.tnombre(t));
  }
  if (filtros.zona !== "todas") partes.push("Zona: " + filtros.zona);
  if (filtros.tipoOT !== "todos") partes.push("Tipo de OT: " + filtros.tipoOT);
  return partes.length ? partes.join("  ·  ") : "Sin filtros aplicados";
}

// pdfmake no corre en el DOM: no puede resolver var(--accent) ni nada de
// app/styles.css. Se resuelven acá las pocas variables que el PDF necesita
// a valores concretos, así el documento sigue el mismo tema/Tweaks de la
// pantalla en el momento de exportar, sin duplicar una paleta a mano.
function resolverPaletaPdf() {
  const raiz = getComputedStyle(document.documentElement);
  const leer = (v) => raiz.getPropertyValue(v).trim();
  return {
    accent: leer("--accent"), text: leer("--text"), text2: leer("--text-2"), text3: leer("--text-3"),
    amberFg: leer("--amber-fg"), amberBg: leer("--amber-bg"), redFg: leer("--red-fg"), border: leer("--border"),
  };
}

// Rasteriza el <svg> vivo del gráfico principal a un PNG de alta resolución.
// Se clona en vez de leer el original para no arriesgar el DOM que React
// sigue controlando, y se fija un fondo blanco (la app es de fondo crema).
function svgAPng(svgVivo, escala) {
  return new Promise((resolve, reject) => {
    const rect = svgVivo.getBoundingClientRect();
    const ancho = Math.max(1, Math.round(rect.width));
    const alto = Math.max(1, Math.round(rect.height));
    const clon = svgVivo.cloneNode(true);
    clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clon.setAttribute("width", ancho);
    clon.setAttribute("height", alto);
    clon.style.fontFamily = "'IBM Plex Sans', Arial, sans-serif";
    const cadena = new XMLSerializer().serializeToString(clon);
    const svg64 = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(cadena)));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ancho * escala;
      canvas.height = alto * escala;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(escala, escala);
      ctx.drawImage(img, 0, 0, ancho, alto);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width: ancho, height: alto });
    };
    img.onerror = () => reject(new Error("No se pudo convertir el gráfico a imagen."));
    img.src = svg64;
  });
}

// Lee el <table> ya ordenado por el usuario directamente del DOM (vía el
// ref que TablaTecnicos expone) en vez de recalcular el orden acá: así el
// PDF queda atado a lo que el usuario efectivamente ve, sin duplicar la
// lógica de ordenamiento de la tabla ni tocarla.
function leerFilasTabla(tablaRef) {
  if (!tablaRef.current) return [];
  const tabla = tablaRef.current.querySelector("table");
  if (!tabla) return [];
  return Array.from(tabla.querySelectorAll("tbody tr")).map((tr) => {
    const celdas = tr.querySelectorAll("td");
    return [
      celdas[0].textContent.trim(),
      celdas[1].textContent.trim(),
      celdas[2].textContent.trim(),
      celdas[3].textContent.trim(),
    ];
  });
}

function celdaTarjetaPdf(ind, d, paleta) {
  const grupo = GRUPOS.find((g) => g.id === ind.grupo);
  return {
    unbreakable: true,
    margin: [0, 0, 10, 12],
    stack: [
      { canvas: [{ type: "rect", x: 0, y: 0, w: 18, h: 3, color: grupo.color }], margin: [0, 0, 0, 4] },
      { text: ind.nombre, fontSize: 9.5, bold: true, margin: [0, 0, 0, 2] },
      { text: d.vacio ? "—" : formatearCorto(d.valor, ind.formato) + (!d.vacio && ind.formato === "clpOT" ? " /OT" : ""), fontSize: 15, bold: true },
      { text: d.vacio ? "Sin datos con los filtros actuales" : direccionTexto(ind), fontSize: 8, color: paleta.text3, margin: [0, 1, 0, 0] },
    ],
  };
}

function tablaTarjetasPdf(indicadores, datos, paleta) {
  const columnas = 3;
  const filas = [];
  for (let i = 0; i < indicadores.length; i += columnas) {
    const fila = indicadores.slice(i, i + columnas).map((ind) => celdaTarjetaPdf(ind, datos[ind.id], paleta));
    while (fila.length < columnas) fila.push({ text: "" });
    filas.push(fila);
  }
  return {
    table: { widths: Array(columnas).fill("*"), body: filas, dontBreakRows: true },
    layout: "noBorders",
    margin: [0, 0, 0, 6],
  };
}

// Arma el árbol de contenido que pdfmake necesita — sin tocar ningún dato
// que no sea el que ya está en pantalla (delGrupo/ind/datos/rango/filtros
// vienen tal cual del estado de DashboardAnalisisScreen).
function construirDocDefinicionPdf({ grupoActivo, grupo, delGrupo, ind, datos, filtros, fechaInicioISO, fechaFinISO, imagenGrafico, filasTabla }) {
  const paleta = resolverPaletaPdf();
  const d = datos[ind.id];
  const fechaGeneracion = new Date();
  const fechaGeneracionTexto =
    fechaGeneracion.toLocaleDateString("es-CL") + " a las " +
    fechaGeneracion.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const textoCategoria = textoCategoriaActiva(grupoActivo, grupo);

  const contenido = [
    { text: "CONTROL POSITION", fontSize: 13, bold: true, color: paleta.accent },
    { text: "Análisis de indicadores de asignación", fontSize: 17, bold: true, margin: [0, 3, 0, 2] },
    { text: "Generado el " + fechaGeneracionTexto, fontSize: 9, color: paleta.text3, margin: [0, 0, 0, 10] },
    {
      text: [
        { text: "Categoría: ", bold: true }, textoCategoria + "   ·   ",
        { text: "Período: ", bold: true }, fechaCompleta(fechaInicioISO) + " al " + fechaCompleta(fechaFinISO) + "   ·   ",
        { text: "Filtros: ", bold: true }, textoFiltrosActivos(filtros),
      ],
      fontSize: 9.5, color: paleta.text2, margin: [0, 0, 0, 12],
    },
  ];

  // Aviso de datos simulados: obligatorio mientras USANDO_DATOS_REALES sea
  // false, no hay manera de omitirlo desde acá.
  if (!USANDO_DATOS_REALES) {
    contenido.push({
      table: { widths: ["*"], body: [[{ text: "AVISO — Datos simulados: no usar para decisiones", fontSize: 10.5, bold: true, color: paleta.amberFg, fillColor: paleta.amberBg, margin: [10, 8, 10, 8], border: [false, false, false, false] }]] },
      layout: "noBorders",
      margin: [0, 0, 0, 14],
    });
  }

  // Cada título va pegado (unbreakable) a lo primero de su sección, para que
  // nunca quede un encabezado solo al final de una página con el contenido
  // recién en la siguiente.
  const tituloSeccion = (texto, margenSup) => ({ text: texto, fontSize: 13, bold: true, margin: [0, margenSup, 0, 8] });

  contenido.push({
    unbreakable: true,
    stack: [tituloSeccion("Indicadores — " + textoCategoria, 0), tablaTarjetasPdf(delGrupo, datos, paleta)],
  });

  const cuerpoEvolucion = d.vacio
    ? { text: "Sin datos para este indicador con los filtros actuales. " + (d.motivoVacio || ""), italics: true, color: paleta.text3, fontSize: 9.5, margin: [0, 0, 0, 12] }
    : imagenGrafico
      ? {
          stack: [
            { text: (esAcumulable(ind) ? "Total del período: " : "Promedio del período: ") + formatear(d.valor, ind.formato), fontSize: 9.5, color: paleta.text2, margin: [0, 0, 0, 6] },
            { image: imagenGrafico.dataUrl, fit: [500, 280], margin: [0, 0, 0, 12] },
          ],
        }
      : { text: "" };
  contenido.push({ unbreakable: true, stack: [tituloSeccion("Evolución — " + ind.nombre, 14), cuerpoEvolucion] });

  const tablaTecnicoPdf = (d.vacio || !filasTabla.length)
    ? { text: "Sin datos por técnico para este indicador con los filtros actuales.", italics: true, color: paleta.text3, fontSize: 9.5, margin: [0, 0, 0, 12] }
    : {
        table: {
          headerRows: 1,
          widths: ["*", "*", "auto", "auto"],
          dontBreakRows: true,
          body: [
            [
              { text: "TÉCNICO", fontSize: 8.5, bold: true, color: paleta.text3 },
              { text: "COMUNA", fontSize: 8.5, bold: true, color: paleta.text3 },
              { text: "VÍNCULO", fontSize: 8.5, bold: true, color: paleta.text3 },
              { text: ind.unidad.toUpperCase(), fontSize: 8.5, bold: true, color: paleta.text3, alignment: "right" },
            ],
            ...filasTabla.map((f) => [
              { text: f[0], fontSize: 9.5 },
              { text: f[1], fontSize: 9.5, color: paleta.text2 },
              { text: f[2], fontSize: 9.5, color: paleta.text2 },
              { text: f[3], fontSize: 9.5, bold: true, alignment: "right" },
            ]),
          ],
        },
        layout: {
          hLineWidth: (i) => (i === 0 ? 0 : 0.5),
          vLineWidth: () => 0,
          hLineColor: () => paleta.border,
          paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6,
        },
        margin: [0, 0, 0, 14],
      };
  contenido.push({ unbreakable: true, stack: [tituloSeccion("Detalle por técnico — " + ind.nombre, 4), tablaTecnicoPdf] });

  const definicionIndicador = (i) => ({
    stack: [
      { text: i.nombre, fontSize: 11, bold: true, margin: [0, 8, 0, 3] },
      { text: i.definicion, fontSize: 9.5, margin: [0, 0, 0, 4] },
      { text: "Fórmula", fontSize: 8, bold: true, color: paleta.text3 },
      { text: i.formula, fontSize: 9.5, italics: true, margin: [0, 1, 0, 4] },
      { text: "Unidad", fontSize: 8, bold: true, color: paleta.text3 },
      { text: i.unidad + "  ·  " + direccionTexto(i), fontSize: 9.5, margin: [0, 1, 0, 4] },
      { text: "Fuente del dato", fontSize: 8, bold: true, color: paleta.text3 },
      { text: i.fuente, fontSize: 9.5, margin: [0, 1, 0, 0] },
    ],
  });
  contenido.push({
    unbreakable: true,
    stack: [tituloSeccion("Definiciones de los indicadores", 4), definicionIndicador(delGrupo[0])],
  });
  delGrupo.slice(1).forEach((i) => {
    contenido.push({ unbreakable: true, ...definicionIndicador(i) });
  });

  return {
    pageSize: "LETTER",
    pageOrientation: "portrait",
    pageMargins: [40, 40, 40, 46],
    footer: (paginaActual, totalPaginas) =>
      totalPaginas > 1
        ? { text: paginaActual + " / " + totalPaginas, alignment: "center", fontSize: 8, color: paleta.text3, margin: [0, 10, 0, 0] }
        : null,
    content: contenido,
    defaultStyle: { font: "Roboto", fontSize: 10, color: paleta.text },
  };
}

/* ==========================================================================
   PANTALLA — montada por app/main.jsx en route.screen === "analisis"
   ========================================================================== */
function DashboardAnalisisScreen() {
  const { rango, setRango, filtros, setFiltros, cargando, datos, recargar } = useTablero();
  const [grupoActivo, setGrupoActivo] = useState(GRUPOS[0].id);
  const grupo = grupoActivo === TODOS_ID ? null : GRUPOS.find((g) => g.id === grupoActivo);
  const delGrupo = grupoActivo === TODOS_ID ? INDICADORES : INDICADORES.filter((i) => i.grupo === grupoActivo);

  const [seleccionado, setSeleccionado] = useState(delGrupo[0].id);
  const ind = INDICADORES.find((i) => i.id === seleccionado) || delGrupo[0];

  // Cambiar de categoría siempre mueve el gráfico grande al primer indicador
  // del conjunto que queda visible (todo INDICADORES si es "Todos"), para que
  // nunca quede mostrando un KPI que no está en la grilla filtrada.
  const cambiarCategoria = (grupoId) => {
    setGrupoActivo(grupoId);
    const conjunto = grupoId === TODOS_ID ? INDICADORES : INDICADORES.filter((i) => i.grupo === grupoId);
    if (conjunto[0]) setSeleccionado(conjunto[0].id);
  };

  const graficoRef = useRef(null);
  const tablaRef = useRef(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [errorPdf, setErrorPdf] = useState(null);

  const descargarPdf = async () => {
    setGenerandoPdf(true);
    setErrorPdf(null);
    try {
      const d = ind ? datos[ind.id] : null;
      if (!d) throw new Error("No hay un indicador seleccionado.");

      const conSerie = Object.values(datos).find((x) => x.serie && x.serie.length) || d;
      if (!conSerie.serie.length) throw new Error("El período elegido no tiene días para exportar.");
      const fechaInicioISO = conSerie.serie[0].iso;
      const fechaFinISO = conSerie.serie[conSerie.serie.length - 1].iso;

      let imagenGrafico = null;
      if (!d.vacio && graficoRef.current) {
        const svg = graficoRef.current.querySelector("svg");
        if (svg) imagenGrafico = await svgAPng(svg, 3);
      }
      const filasTabla = leerFilasTabla(tablaRef);

      const docDefinition = construirDocDefinicionPdf({
        grupoActivo, grupo, delGrupo, ind, datos, filtros,
        fechaInicioISO, fechaFinISO, imagenGrafico, filasTabla,
      });

      const nombreArchivo = "analisis-" + grupoActivo + "-" + fechaInicioISO + "-al-" + fechaFinISO + ".pdf";
      await new Promise((resolve, reject) => {
        try {
          window.pdfMake.createPdf(docDefinition).download(nombreArchivo, resolve);
        } catch (err) { reject(err); }
      });
    } catch (err) {
      console.error("Error generando el PDF de análisis:", err);
      setErrorPdf("No se pudo generar el PDF. Probá de nuevo.");
    } finally {
      setGenerandoPdf(false);
    }
  };

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div className="page-title">Análisis</div>
          <div className="page-sub">Indicadores de asignación en el tiempo</div>
        </div>
        <div className="page-head-actions">
          <AvisoDatoSimulado />
          {errorPdf && <span style={{ fontSize: 12, color: "var(--red-fg)" }}>{errorPdf}</span>}
          <button type="button" onClick={descargarPdf} disabled={generandoPdf || cargando} className="btn"
            style={{ opacity: generandoPdf || cargando ? 0.6 : 1, cursor: generandoPdf || cargando ? "not-allowed" : "pointer" }}>
            <span className={generandoPdf ? "icon-spin" : ""}><Icon name={generandoPdf ? "refresh" : "download"} /></span>
            {generandoPdf ? "Generando…" : "Descargar PDF"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <BarraFiltros rango={rango} setRango={setRango} filtros={filtros} setFiltros={setFiltros}
          cargando={cargando} onRecargar={recargar} />

        <BotonesCategoria grupoActivo={grupoActivo} onCambiar={cambiarCategoria} />

        {grupo && (
          <div className="card card-pad" style={{ background: "var(--accent-softer)", borderColor: "var(--accent-soft)" }}>
            <p style={{ fontSize: 13.5, color: "var(--accent-strong)", fontWeight: 550 }}>{grupo.pregunta}</p>
          </div>
        )}

        <div>
          <p style={{ marginBottom: 10, fontSize: 12.5, color: "var(--text-3)" }}>
            Elegí una tarjeta para ver su evolución abajo.
          </p>
          <div className="ind-grid">
            {delGrupo.map((i) => (
              <TarjetaKPI key={i.id} ind={i} d={datos[i.id]} cargando={cargando}
                activo={i.id === seleccionado} onSelect={setSeleccionado} />
            ))}
          </div>
        </div>

        <GraficoPrincipal ind={ind} d={datos[ind.id]} cargando={cargando} graficoRef={graficoRef} />
        <TablaTecnicos ind={ind} d={datos[ind.id]} cargando={cargando} tablaRef={tablaRef} />
      </div>
    </div>
  );
}

Object.assign(window, { DashboardAnalisisScreen });
