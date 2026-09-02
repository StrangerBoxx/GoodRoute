/* ==========================================================================
   PREÁMBULO PARA PUBLICACIÓN EN GITHUB PAGES
   --------------------------------------------------------------------------
   Este archivo corre en el navegador sin compilar: Babel standalone lo
   traduce en caliente y las librerías llegan como globales UMD.

   Si le pedís a Claude que regenere esta variante, conservá ESTE bloque y
   reemplazá sólo lo que viene después. No agregues sentencias import.
   ========================================================================== */
const { useState, useMemo, useEffect, useRef } = React;
const {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine
} = Recharts;
const {
  Zap, MapPin, LayoutGrid, ClipboardList, Users, Wrench, Settings, Search,
  ChevronDown, ChevronRight, Info, ArrowUpRight, ArrowDownRight, Minus,
  AlertTriangle, RefreshCw, Inbox, ArrowUpDown, X, Loader2
} = LucideReact;


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
   ========================================================================== */
const TECNICOS = [
  { id: "t1", nombre: "Camilo Ahumada", zona: "Maipú", tipo: "interno", f: 1.06 },
  { id: "t2", nombre: "Rodrigo Fuenzalida", zona: "Puente Alto", tipo: "interno", f: 0.92 },
  { id: "t3", nombre: "Marcela Quiroz", zona: "Quilicura", tipo: "interno", f: 1.14 },
  { id: "t4", nombre: "Ignacio Bustos", zona: "San Bernardo", tipo: "externo", f: 0.87 },
  { id: "t5", nombre: "Paulina Vergara", zona: "Ñuñoa", tipo: "interno", f: 0.79 },
  { id: "t6", nombre: "Héctor Sandoval", zona: "Pudahuel", tipo: "externo", f: 1.21 },
  { id: "t7", nombre: "Daniela Riquelme", zona: "La Florida", tipo: "interno", f: 0.98 },
  { id: "t8", nombre: "Óscar Peñaloza", zona: "Renca", tipo: "externo", f: 1.09 },
  { id: "t9", nombre: "Valentina Cárdenas", zona: "Providencia", tipo: "interno", f: 0.84 },
  { id: "t10", nombre: "Sebastián Molina", zona: "Melipilla", tipo: "externo", f: 1.33 },
];
const ZONAS = [...new Set(TECNICOS.map((t) => t.zona))].sort();
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
    const t = TECNICOS.find((x) => x.id === filtros.tecnico);
    if (t) f *= t.f;
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

  const previos = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(dias[0]); d.setDate(dias[0].getDate() - (i + 1)); previos.push(d);
  }
  const anterior = previos.map((d) => ({
    iso: iso(d), etiqueta: etiquetaFecha(d), valor: valorDelDia(ind, d, filtros),
  }));

  const candidatos = TECNICOS.filter(
    (t) =>
      (filtros.tecnico === "todos" || t.id === filtros.tecnico) &&
      (filtros.zona === "todas" || t.zona === filtros.zona)
  );
  const promedio = serie.reduce((a, b) => a + b.valor, 0) / Math.max(1, serie.length);
  const porTecnico = candidatos.map((t) => {
    const r = mulberry32(hash(ind.id + t.id + filtros.tipoOT))();
    return {
      id: t.id, nombre: t.nombre, zona: t.zona, tipo: t.tipo,
      valor: Math.max(ind.sim.min, promedio * t.f * (0.88 + r * 0.26)),
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

function calcularDelta(ind, serie, anterior) {
  const a = valorRepresentativo(ind, serie);
  const b = valorRepresentativo(ind, anterior);
  if (a == null || b == null || b === 0) return null;
  const pct = ((a - b) / Math.abs(b)) * 100;
  let signo = "neutro";
  if (ind.direccion === "mas") signo = pct > 0.5 ? "bueno" : pct < -0.5 ? "malo" : "neutro";
  else if (ind.direccion === "menos") signo = pct < -0.5 ? "bueno" : pct > 0.5 ? "malo" : "neutro";
  else if (ind.direccion === "rango") {
    const [lo, hi] = ind.objetivo;
    signo = a >= lo && a <= hi ? "bueno" : "malo";
  }
  return { pct, signo, actual: a, previo: b };
}

// Frase de lectura: qué le está diciendo el número al supervisor.
function lectura(ind, delta) {
  if (!delta) return "Sin período de comparación disponible.";
  const mag = Math.abs(delta.pct);
  const dir = delta.pct > 0 ? "subió" : "bajó";
  const cuanto = nf(mag, 1) + " %";
  if (ind.direccion === "rango") {
    const [lo, hi] = ind.objetivo;
    if (delta.actual > hi)
      return "Por sobre el rango objetivo (" + lo + "–" + hi + " %): la jornada queda sin holgura para insertar OT nuevas.";
    if (delta.actual < lo)
      return "Bajo el rango objetivo (" + lo + "–" + hi + " %): hay turno pagado que no se está usando.";
    return "Dentro del rango objetivo (" + lo + "–" + hi + " %), con espacio para reaccionar en el día.";
  }
  if (ind.direccion === "contexto")
    return "Volumen de referencia: " + dir + " " + cuanto + " respecto del período anterior. Sirve para leer los demás indicadores, no para juzgarlos.";
  if (mag < 1) return "Prácticamente sin cambio respecto del período anterior.";
  if (delta.signo === "bueno") return "Va en la dirección esperada: " + dir + " " + cuanto + " contra el período anterior.";
  return "Va en contra de lo esperado: " + dir + " " + cuanto + " contra el período anterior. Vale mirar qué cambió.";
}

/* ==========================================================================
   6. PALETA — heredada del backoffice Control Position (Sprint 1)
   ========================================================================== */
const C = {
  bg: "#FBF6F6", surface: "#ffffff", surface2: "#f8f3f3", surface3: "#f1eaea",
  border: "#ece4e4", border2: "#e0d6d6", border3: "#cfc4c4",
  text: "#1c1a1b", text2: "#635f60", text3: "#938d8e", text4: "#b6afaf",
  accent: "#033E84", accentStrong: "#022c5f", accentSoft: "#e3ebf5", accentSofter: "#f0f4fa",
  green: "#27945c", greenBg: "#e0f0e6", greenFg: "#1c6e44",
  red: "#d8442f", redBg: "#fbe3df", redFg: "#9c2f23",
  amber: "#d9930c", amberBg: "#fbefd6", amberFg: "#8a5d11",
  slateBg: "#e9ecef", slateFg: "#4c5763",
};
const FUENTE = { fontFamily: "\"IBM Plex Sans\", system-ui, -apple-system, sans-serif" };

const EstilosBase = () => (
  <style>{`
    @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap");
    .cp-scroll::-webkit-scrollbar { width: 11px; height: 11px; }
    .cp-scroll::-webkit-scrollbar-thumb { background: #d8d4c9; border-radius: 8px; border: 3px solid transparent; background-clip: content-box; }
    .cp-focus:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `}</style>
);

/* ==========================================================================
   7. PIEZAS DE INTERFAZ COMPARTIDAS
   ========================================================================== */

function AvisoDatoSimulado({ compacto }) {
  if (USANDO_DATOS_REALES) return null;
  return (
    <span
      className="inline-flex items-center gap-2 rounded-lg font-semibold"
      style={{
        background: C.amberBg, color: C.amberFg,
        padding: compacto ? "3px 9px" : "6px 12px",
        fontSize: compacto ? 11.5 : 12.5,
      }}
    >
      <AlertTriangle size={compacto ? 12 : 14} />
      Datos simulados — no usar para decisiones
    </span>
  );
}

function InfoIndicador({ ind }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    const esc = (e) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("mousedown", cerrar);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", cerrar); window.removeEventListener("keydown", esc); };
  }, [abierto]);

  return (
    <span className="relative inline-flex" ref={caja}>
      <button
        type="button"
        aria-label={"Qué mide " + ind.nombre}
        className="cp-focus inline-flex items-center justify-center rounded"
        style={{ color: abierto ? C.accent : C.text4, width: 20, height: 20 }}
        onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v); }}
      >
        <Info size={15} />
      </button>
      {abierto && (
        <div
          className="absolute z-50 rounded-xl p-4"
          style={{
            top: 26, left: -8, width: 320, background: C.surface,
            border: "1px solid " + C.border, boxShadow: "0 12px 40px rgba(28,20,20,.16)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <div className="font-semibold" style={{ fontSize: 13.5, color: C.text }}>{ind.nombre}</div>
            <button
              type="button" aria-label="Cerrar"
              className="cp-focus ml-auto rounded" style={{ color: C.text3 }}
              onClick={() => setAbierto(false)}
            ><X size={14} /></button>
          </div>
          <p className="mt-2" style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>{ind.definicion}</p>
          <dl className="mt-3 space-y-2">
            <div>
              <dt style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>Fórmula</dt>
              <dd style={{ fontSize: 12, color: C.text, fontFamily: "\"IBM Plex Mono\", monospace", marginTop: 2 }}>{ind.formula}</dd>
            </div>
            <div>
              <dt style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>Unidad</dt>
              <dd style={{ fontSize: 12, color: C.text, marginTop: 2 }}>
                {ind.unidad} · {ind.direccion === "mas" ? "más es mejor"
                  : ind.direccion === "menos" ? "menos es mejor"
                  : ind.direccion === "rango" ? "rango objetivo " + ind.objetivo[0] + "–" + ind.objetivo[1] + " %"
                  : "indicador de contexto"}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>Fuente del dato</dt>
              <dd style={{ fontSize: 12, color: C.text2, marginTop: 2, lineHeight: 1.5 }}>{ind.fuente}</dd>
            </div>
          </dl>
        </div>
      )}
    </span>
  );
}

function Delta({ delta, size = 12.5 }) {
  if (!delta) return <span style={{ fontSize: size, color: C.text4 }}>sin comparación</span>;
  const color = delta.signo === "bueno" ? C.greenFg : delta.signo === "malo" ? C.redFg : C.text3;
  const Icono = delta.pct > 0.5 ? ArrowUpRight : delta.pct < -0.5 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-1 font-semibold" style={{ fontSize: size, color }}>
      <Icono size={size + 2} />
      {nf(Math.abs(delta.pct), 1)} %
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
    <div className="rounded-lg p-3" style={{ background: C.surface, border: "1px solid " + C.border2, boxShadow: "0 6px 22px rgba(28,20,20,.12)" }}>
      <div style={{ fontSize: 11.5, color: C.text3, fontWeight: 600 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="mt-1 flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: "inline-block" }} />
          <span style={{ fontSize: 12, color: C.text2 }}>{p.name}</span>
          <span className="ml-auto font-semibold" style={{ fontSize: 12.5, color: C.text }}>
            {formatear(p.value, ind.formato)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SinDatos({ motivo, alto = 220 }) {
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ height: alto, padding: 24 }}>
      <Inbox size={30} style={{ color: C.text4 }} />
      <div className="mt-3 font-semibold" style={{ fontSize: 13.5, color: C.text2 }}>Sin datos en este rango</div>
      <p className="mt-1" style={{ fontSize: 12.5, color: C.text3, maxWidth: 380, lineHeight: 1.5 }}>
        {motivo || "Probá ampliar el período o sacar alguno de los filtros."}
      </p>
    </div>
  );
}

function Cargando({ alto = 220 }) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ height: alto }}>
      <Loader2 size={22} style={{ color: C.text4 }} className="animate-spin" />
      <div className="mt-2" style={{ fontSize: 12.5, color: C.text3 }}>Recalculando el período…</div>
    </div>
  );
}

function Esqueleto({ alto = 34 }) {
  return <div className="animate-pulse rounded" style={{ height: alto, background: C.surface3 }} />;
}

/* ---- Selectores ---- */
function Selector({ etiqueta, valor, onChange, opciones }) {
  return (
    <label className="inline-flex items-center gap-2">
      <span style={{ fontSize: 12, color: C.text3, fontWeight: 600 }}>{etiqueta}</span>
      <select
        className="cp-focus rounded-lg"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 12.5, fontWeight: 500, color: C.text, background: C.surface,
          border: "1px solid " + C.border2, padding: "7px 10px", ...FUENTE,
        }}
      >
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
    <div className="rounded-xl" style={{ background: C.surface, border: "1px solid " + C.border, padding: "12px 16px" }}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Selector etiqueta="Período" valor={rango.preset} onChange={cambiarPreset} opciones={PRESETS} />
        {rango.preset === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={rango.desde || ""} onChange={(e) => cambiarFecha("desde", e.target.value)}
              className="cp-focus rounded-lg"
              style={{ fontSize: 12.5, border: "1px solid " + C.border2, padding: "6px 9px", color: C.text, ...FUENTE }} />
            <span style={{ color: C.text3, fontSize: 12 }}>a</span>
            <input type="date" value={rango.hasta || ""} onChange={(e) => cambiarFecha("hasta", e.target.value)}
              className="cp-focus rounded-lg"
              style={{ fontSize: 12.5, border: "1px solid " + C.border2, padding: "6px 9px", color: C.text, ...FUENTE }} />
          </div>
        )}

        <div style={{ width: 1, height: 22, background: C.border2 }} />

        <Selector etiqueta="Técnico" valor={filtros.tecnico}
          onChange={(v) => setFiltros({ ...filtros, tecnico: v })}
          opciones={[{ valor: "todos", texto: "Todos los técnicos" },
            ...TECNICOS.map((t) => ({ valor: t.id, texto: t.nombre }))]} />
        <Selector etiqueta="Zona" valor={filtros.zona}
          onChange={(v) => setFiltros({ ...filtros, zona: v })}
          opciones={[{ valor: "todas", texto: "Todas las comunas" },
            ...ZONAS.map((z) => ({ valor: z, texto: z }))]} />
        <Selector etiqueta="Tipo de OT" valor={filtros.tipoOT}
          onChange={(v) => setFiltros({ ...filtros, tipoOT: v })}
          opciones={[{ valor: "todos", texto: "Todos los tipos" },
            ...TIPOS_OT.map((t) => ({ valor: t, texto: t }))]} />

        <button type="button" onClick={onRecargar}
          className="cp-focus ml-auto inline-flex items-center gap-2 rounded-lg font-medium"
          style={{ fontSize: 12.5, color: C.text2, border: "1px solid " + C.border2, background: C.surface, padding: "7px 11px" }}>
          <RefreshCw size={14} className={cargando ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
   8. SHELL DE NAVEGACIÓN — el mismo del backoffice Control Position
   El dashboard se monta dentro del módulo GoodRoute, ítem "Dashboard".
   ========================================================================== */
const NAV_OPERACION = [
  { id: "control", texto: "Centro de control", Icono: LayoutGrid },
  { id: "ordenes", texto: "Órdenes de trabajo", Icono: ClipboardList },
  { id: "tecnicos", texto: "Técnicos", Icono: Users },
  { id: "instalaciones", texto: "Instalaciones", Icono: Wrench },
];

function Shell({ children, titulo, bajada, acciones }) {
  const [abierto, setAbierto] = useState(true);
  const [activo, setActivo] = useState("gr-dashboard");

  const itemNav = (id, texto, Icono, sub) => {
    const on = activo === id;
    return (
      <button key={id} type="button" onClick={() => setActivo(id)}
        className="cp-focus flex w-full items-center gap-3 rounded-lg text-left"
        style={{
          padding: sub ? "8px 10px" : "9px 10px",
          fontSize: sub ? 13 : 13.5,
          fontWeight: on ? 600 : 500,
          color: on ? C.accentStrong : C.text2,
          background: on ? C.accentSoft : "transparent",
        }}>
        <Icono size={sub ? 17 : 18} style={{ color: on ? C.accent : C.text3, flex: "none" }} />
        {texto}
      </button>
    );
  };

  return (
    <div style={{ ...FUENTE, background: C.bg, color: C.text, height: "100vh", display: "grid", gridTemplateColumns: "252px 1fr", overflow: "hidden" }}>
      <EstilosBase />

      <aside className="flex flex-col gap-2" style={{ background: C.surface, borderRight: "1px solid " + C.border, padding: "18px 14px" }}>
        <div style={{ padding: "6px 8px 14px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px", lineHeight: 1.05, color: C.accent }}>
            CONTROL<br />POSITION
          </div>
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 6 }}>Back office</div>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".7px", color: C.text4, padding: "12px 10px 6px" }}>
          OPERACIÓN
        </div>
        {NAV_OPERACION.map((n) => itemNav(n.id, n.texto, n.Icono))}

        <div style={{ marginTop: 2 }}>
          <button type="button" onClick={() => setAbierto((v) => !v)}
            className="cp-focus flex w-full items-center gap-2 rounded-lg text-left"
            style={{ padding: "9px 10px", color: C.text2 }}>
            <span className="flex items-center gap-2.5" style={{ fontSize: 13.5, fontWeight: 600 }}>
              <Zap size={18} style={{ color: C.accent }} />
              GoodRoute
            </span>
            <ChevronDown size={14} className="ml-auto"
              style={{ color: C.text4, transform: abierto ? "rotate(180deg)" : "none", transition: "transform .16s" }} />
          </button>
          {abierto && (
            <div style={{ marginLeft: 19, paddingLeft: 12, borderLeft: "1.5px solid " + C.border2, marginTop: 4 }}>
              {itemNav("gr-rutas", "Asignar rutas", MapPin, true)}
              {itemNav("gr-dashboard", "Dashboard", LayoutGrid, true)}
            </div>
          )}
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".7px", color: C.text4, padding: "12px 10px 6px" }}>
          AJUSTES
        </div>
        {itemNav("config", "Configuración", Settings)}

        <div className="mt-auto flex items-center gap-2" style={{ paddingTop: 12, borderTop: "1px solid " + C.border }}>
          <span className="inline-flex items-center gap-1.5 rounded-md font-semibold"
            style={{ background: C.greenBg, color: C.greenFg, fontSize: 11.5, padding: "2px 8px" }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: C.green }} />
            RedGPS conectado
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col overflow-hidden">
        <header className="flex items-center gap-4"
          style={{ height: 62, flex: "none", borderBottom: "1px solid " + C.border, background: "rgba(255,255,255,.82)", padding: "0 26px" }}>
          <div className="flex flex-1 items-center gap-2 rounded-lg"
            style={{ maxWidth: 560, background: C.surface2, border: "1px solid " + C.border2, padding: "8px 12px", color: C.text3 }}>
            <Search size={16} />
            <input placeholder="Buscar orden, cliente, patente o IMEI…"
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 13.5, color: C.text, ...FUENTE }} />
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <div className="grid place-items-center rounded-full font-semibold"
              style={{ width: 34, height: 34, background: C.accent, color: "#fff", fontSize: 12.5 }}>CS</div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Camila Soto</div>
              <div style={{ fontSize: 11, color: C.text3 }}>Supervisora</div>
            </div>
          </div>
        </header>

        <div className="cp-scroll flex-1 overflow-y-auto">
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 30px 60px" }}>
            <div className="mb-6 flex flex-wrap items-start gap-4">
              <div>
                <h1 style={{ fontSize: 23, fontWeight: 650, letterSpacing: "-0.4px" }}>{titulo}</h1>
                <p style={{ color: C.text2, fontSize: 13.5, marginTop: 3 }}>{bajada}</p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <AvisoDatoSimulado />
                {acciones}
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   9. HOOK DE DATOS — un solo lugar donde se pide todo el tablero
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
      mapa[ind.id] = { ...d, delta: calcularDelta(ind, d.serie, d.anterior), valor: valorRepresentativo(ind, d.serie) };
    });
    return mapa;
  }, [rango, filtros, tick]);

  return { rango, setRango, filtros, setFiltros, cargando, datos, recargar: () => setTick((t) => t + 1) };
}

/* ==========================================================================
   VARIANTE A — TORRE DE CONTROL
   Hipótesis: el supervisor entra a chequear el estado del día.
   Tarjetas KPI arriba -> gráfico principal del indicador elegido -> tabla por técnico.
   ========================================================================== */

function TarjetaKPI({ ind, d, activo, onSelect, cargando }) {
  const grupo = GRUPOS.find((g) => g.id === ind.grupo);
  return (
    <button type="button" onClick={() => onSelect(ind.id)}
      className="cp-focus rounded-xl text-left"
      style={{
        background: C.surface, padding: "14px 15px 12px",
        border: "1px solid " + (activo ? C.accent : C.border),
        boxShadow: activo ? "0 0 0 3px " + C.accentSofter : "none",
      }}>
      <div className="flex items-start gap-1.5">
        <span style={{ width: 3, height: 15, borderRadius: 3, background: grupo.color, flex: "none", marginTop: 2 }} />
        <span className="font-medium" style={{ fontSize: 12, color: C.text2, lineHeight: 1.3 }}>{ind.nombre}</span>
        <span className="ml-auto" onClick={(e) => e.stopPropagation()}><InfoIndicador ind={ind} /></span>
      </div>

      {cargando ? <div className="mt-2"><Esqueleto alto={30} /></div> : d.vacio ? (
        <div className="mt-2" style={{ fontSize: 20, fontWeight: 650, color: C.text4 }}>—</div>
      ) : (
        <div className="mt-1.5" style={{ fontSize: 22, fontWeight: 680, letterSpacing: "-0.6px" }}>
          {formatearCorto(d.valor, ind.formato)}
          {ind.formato === "clpOT" && <span style={{ fontSize: 12, fontWeight: 500, color: C.text3 }}> /OT</span>}
        </div>
      )}

      <div className="mt-1 flex items-center gap-2">
        {!d.vacio && <Delta delta={d.delta} size={11.5} />}
        <div className="ml-auto" style={{ width: 64 }}>
          {!d.vacio && !cargando && <Sparkline datos={d.serie} color={grupo.color} alto={26} />}
        </div>
      </div>
    </button>
  );
}

function GraficoPrincipal({ ind, d, cargando }) {
  const datos = d.serie.map((p, i) => ({
    etiqueta: p.etiqueta, actual: p.valor, anterior: d.anterior[i] ? d.anterior[i].valor : null,
  }));
  const grupo = GRUPOS.find((g) => g.id === ind.grupo);

  return (
    <section className="rounded-xl" style={{ background: C.surface, border: "1px solid " + C.border }}>
      <header className="flex flex-wrap items-center gap-3" style={{ padding: "16px 20px", borderBottom: "1px solid " + C.border }}>
        <div>
          <div className="flex items-center gap-1.5">
            <h2 style={{ fontSize: 15.5, fontWeight: 620 }}>{ind.nombre}</h2>
            <InfoIndicador ind={ind} />
          </div>
          <p style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>{lectura(ind, d.delta)}</p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <div style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>
              {esAcumulable(ind) ? "Total del período" : "Promedio del período"}
            </div>
            <div style={{ fontSize: 21, fontWeight: 680, letterSpacing: "-0.5px" }}>
              {d.vacio ? "—" : formatear(d.valor, ind.formato)}
            </div>
          </div>
          <Delta delta={d.delta} size={13} />
        </div>
      </header>

      <div style={{ padding: "18px 14px 8px" }}>
        {cargando ? <Cargando alto={280} /> : d.vacio ? <SinDatos motivo={d.motivoVacio} alto={280} /> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={datos} margin={{ top: 4, right: 14, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="gPrincipal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={grupo.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={grupo.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: C.text3 }} tickLine={false}
                axisLine={{ stroke: C.border2 }} minTickGap={22} />
              <YAxis tick={{ fontSize: 11, fill: C.text3 }} tickLine={false} axisLine={false}
                width={62} tickFormatter={(v) => formatearCorto(v, ind.formato)} />
              <Tooltip content={<TooltipGrafico ind={ind} />} />
              {ind.direccion === "rango" && (
                <ReferenceArea y1={ind.objetivo[0]} y2={ind.objetivo[1]} fill={C.greenBg} fillOpacity={0.7} />
              )}
              <Area type="monotone" dataKey="anterior" name="Período anterior" stroke={C.border3}
                strokeWidth={1.4} strokeDasharray="4 3" fill="none" dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="actual" name="Período actual" stroke={grupo.color}
                strokeWidth={2.2} fill="url(#gPrincipal)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function TablaTecnicos({ ind, d, cargando }) {
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
    <th style={{ textAlign: alinearDerecha ? "right" : "left", padding: "10px 14px", borderBottom: "1px solid " + C.border }}>
      <button type="button"
        onClick={() => setOrden((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }))}
        className="cp-focus inline-flex items-center gap-1.5 rounded"
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".4px", color: orden.campo === campo ? C.accent : C.text3 }}>
        {texto}<ArrowUpDown size={11} />
      </button>
    </th>
  );

  const max = Math.max(...filas.map((f) => f.valor), 1);

  return (
    <section className="rounded-xl" style={{ background: C.surface, border: "1px solid " + C.border }}>
      <header className="flex items-center gap-3" style={{ padding: "14px 20px", borderBottom: "1px solid " + C.border }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 620 }}>Detalle por técnico</h2>
        <span style={{ fontSize: 12.5, color: C.text3 }}>{ind.nombre} · {esAcumulable(ind) ? "total" : "promedio"} del período</span>
      </header>
      {cargando ? <Cargando alto={200} /> : d.vacio ? <SinDatos motivo={d.motivoVacio} alto={200} /> : (
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {th("nombre", "TÉCNICO")}{th("zona", "COMUNA")}{th("tipo", "VÍNCULO")}
              {th("valor", ind.unidad.toUpperCase(), true)}
              <th style={{ width: 190, padding: "10px 14px", borderBottom: "1px solid " + C.border }} />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td style={{ padding: "11px 14px", borderBottom: "1px solid " + C.border, fontSize: 13, fontWeight: 600 }}>{f.nombre}</td>
                <td style={{ padding: "11px 14px", borderBottom: "1px solid " + C.border, fontSize: 13, color: C.text2 }}>{f.zona}</td>
                <td style={{ padding: "11px 14px", borderBottom: "1px solid " + C.border, fontSize: 13, color: C.text2 }}>
                  {f.tipo === "interno" ? "Interno" : "Externo"}
                </td>
                <td style={{ padding: "11px 14px", borderBottom: "1px solid " + C.border, fontSize: 13, fontWeight: 600, textAlign: "right" }}>
                  {formatear(f.valor, ind.formato)}
                </td>
                <td style={{ padding: "11px 14px", borderBottom: "1px solid " + C.border }}>
                  <div style={{ height: 6, borderRadius: 4, background: C.surface3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: (f.valor / max) * 100 + "%", background: GRUPOS.find((g) => g.id === ind.grupo).color }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DashboardTorreDeControl() {
  const { rango, setRango, filtros, setFiltros, cargando, datos, recargar } = useTablero();
  const [seleccionado, setSeleccionado] = useState(INDICADORES[0].id);
  const ind = INDICADORES.find((i) => i.id === seleccionado) || INDICADORES[0];

  return (
    <Shell titulo="Análisis" bajada="Indicadores de asignación en el tiempo">
      <div className="flex flex-col gap-5">
        <BarraFiltros rango={rango} setRango={setRango} filtros={filtros} setFiltros={setFiltros}
          cargando={cargando} onRecargar={recargar} />

        <div>
          <p className="mb-2.5" style={{ fontSize: 12.5, color: C.text3 }}>
            Elegí una tarjeta para ver su evolución abajo.
          </p>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
            {INDICADORES.map((i) => (
              <TarjetaKPI key={i.id} ind={i} d={datos[i.id]} cargando={cargando}
                activo={i.id === seleccionado} onSelect={setSeleccionado} />
            ))}
          </div>
        </div>

        <GraficoPrincipal ind={ind} d={datos[ind.id]} cargando={cargando} />
        <TablaTecnicos ind={ind} d={datos[ind.id]} cargando={cargando} />
      </div>
    </Shell>
  );
}


/* ---- Montaje ---- */
ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(DashboardTorreDeControl)
);
