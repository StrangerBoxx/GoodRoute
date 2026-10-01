/* ==========================================================================
   Dashboard de análisis — HU-12 (Sprint 2)
   --------------------------------------------------------------------------
   Pantalla real del backoffice: vive en el routing de app/main.jsx
   (route.screen === "analisis"), montada dentro del Sidebar/TopBar de
   siempre. Es la variante A ("Torre de control") con el diseño que el
   supervisor terminó aprobando: botonera de categorías (con un tab "Todos"
   al final) en vez de una grilla plana, sin comparación contra el período
   anterior, y un tipo de gráfico distinto por indicador según su
   naturaleza (ver INDICADORES[].grafico y GRAFICOS_POR_TIPO).

   Esta es la ÚNICA copia conectada al proyecto — la fuente de verdad para
   cualquier cambio futuro del dashboard.

   Sin bundler: Recharts y pdfmake llegan como globales UMD (agregados en
   index.html). Los íconos usan el registro compartido de app/ui.jsx, no
   lucide-react, y los colores salen de las variables CSS de app/styles.css
   en vez de una paleta propia, para heredar el tema (incluyendo los
   Tweaks de Marca).
   ========================================================================== */
const {
  ResponsiveContainer, ComposedChart, AreaChart, Area, Bar, Line,
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
     grafico       tipo de gráfico grande para este indicador — una clave de
                   GRAFICOS_POR_TIPO/EXPLICACION_POR_TIPO más abajo. Si falta,
                   se usa "area" (el gráfico de área simple de siempre). El
                   componente nunca decide el tipo mirando el id: agregar un
                   indicador nuevo con su "grafico" alcanza para que se vea
                   bien, sin tocar GraficoPrincipal ni ningún otro componente.
     sim           parámetros del generador de datos simulados
   ========================================================================== */
const INDICADORES = [
  // ---- Operación ----
  {
    id: "ot_asignadas",
    nombre: "OT asignadas",
    definicion: "Cantidad de órdenes de trabajo asignadas en el período.",
    formula: "conteo de OT con técnico asignado",
    fuente: "Backoffice: ID OT, fecha, técnico asignado, estado de OT, hora de asignación.",
    unidad: "OT", formato: "ot", direccion: "contexto", granularidad: "tecnico",
    grupo: "operacion", grafico: "barras_verticales",
    sim: { base: 34, ruido: 0.19, tendencia: 0.13, finde: 0.24, min: 4, max: 62 },
  },
  {
    id: "ot_realizadas",
    nombre: "OT realizadas con éxito",
    definicion: "Cantidad de OT que fueron ejecutadas y finalizadas correctamente.",
    formula: "conteo de OT con estado final exitoso",
    fuente: "Backoffice: ID OT, estado final, fecha de término, técnico, resultado de servicio.",
    unidad: "OT", formato: "ot", direccion: "mas", granularidad: "tecnico",
    grupo: "operacion", grafico: "barras_verticales",
    sim: { base: 29, ruido: 0.17, tendencia: 0.12, finde: 0.22, min: 2, max: 55 },
  },
  {
    id: "ot_pendientes",
    nombre: "OT pendientes",
    definicion: "Cantidad de OT que permanecen pendientes al cierre del período.",
    formula: "conteo de OT en estado pendiente al corte",
    fuente: "Backoffice: ID OT, estado actual, fecha programada, técnico asignado o sin asignar.",
    unidad: "OT", formato: "ot", direccion: "menos", granularidad: "tecnico",
    grupo: "operacion", grafico: "linea",
    sim: { base: 6, ruido: 0.35, tendencia: -0.15, finde: 0.6, min: 0, max: 20 },
  },
  {
    id: "ot_reprogramadas",
    nombre: "OT reprogramadas",
    definicion: "Porcentaje de OT que debieron ser reprogramadas después de haber sido asignadas.",
    formula: "OT reprogramadas / OT asignadas",
    fuente: "Backoffice: ID OT, fecha original, fecha nueva, motivo de reprogramación, cantidad de reprogramaciones.",
    unidad: "%", formato: "pct", direccion: "menos", granularidad: "tecnico",
    grupo: "operacion", grafico: "linea",
    sim: { base: 9, ruido: 0.3, tendencia: -0.12, finde: 1.3, min: 1, max: 28 },
  },
  {
    id: "cumplimiento_ventana",
    nombre: "Cumplimiento de ventana horaria",
    definicion: "Porcentaje de servicios realizados dentro de la ventana horaria comprometida con el cliente.",
    formula: "servicios dentro de ventana / servicios totales",
    fuente: "Hora inicio ventana, hora término ventana, hora de llegada del técnico, ID OT, estado de la OT.",
    unidad: "%", formato: "pct", direccion: "mas", granularidad: "tecnico",
    grupo: "operacion", grafico: "linea_banda_min_max",
    sim: { base: 82, ruido: 0.08, tendencia: 0.07, finde: 0.97, min: 55, max: 98 },
  },

  // ---- Uso de recursos ----
  {
    id: "km_tecnico",
    nombre: "Kilometraje por técnico",
    definicion: "Distancia recorrida por cada técnico en el período.",
    formula: "Σ km recorridos, agrupado por técnico",
    fuente: "GPS del vehículo (RedGPS): técnico, ubicación inicial, ubicación final, distancia recorrida, fecha.",
    unidad: "km", formato: "km", direccion: "menos", granularidad: "tecnico",
    grupo: "recurso", grafico: "barras_horizontales_ranking",
    sim: { base: 118, ruido: 0.14, tendencia: -0.09, finde: 0.38, min: 40, max: 210 },
  },
  {
    id: "tiempo_traslado",
    nombre: "Tiempo de traslado",
    definicion: "Tiempo promedio de traslado entre una OT y la siguiente.",
    formula: "promedio(hora de llegada siguiente OT − hora de término de la OT anterior)",
    fuente: "Hora de término y ubicación de la OT anterior; hora de llegada y ubicación de la siguiente OT; técnico.",
    unidad: "min", formato: "min", direccion: "menos", granularidad: "tecnico",
    grupo: "recurso", grafico: "linea_banda_min_max",
    sim: { base: 22, ruido: 0.2, tendencia: -0.08, finde: 0.85, min: 8, max: 55 },
  },
  {
    id: "utilizacion_jornada",
    nombre: "Utilización de jornada",
    definicion: "Porcentaje de la jornada disponible de un técnico utilizado en OT y desplazamientos planificados.",
    formula: "(tiempo en OT + tiempo de traslado planificado) / duración de la jornada",
    fuente: "Hora de inicio y término de jornada, duración de OT, tiempo de espera, técnico.",
    unidad: "%", formato: "pct", direccion: "rango", objetivo: [75, 88],
    granularidad: "tecnico", grupo: "recurso", grafico: "linea_banda_min_max",
    sim: { base: 80, ruido: 0.09, tendencia: 0.09, finde: 0.96, min: 45, max: 97 },
  },
  {
    id: "tiempo_servicio",
    nombre: "Tiempo promedio de servicio",
    definicion: "Cuánto demora realmente un técnico desde que inicia hasta que termina una OT.",
    formula: "promedio(hora de término de la OT − hora de inicio de la OT)",
    fuente: "Hora de inicio y término de la OT, ID OT, tipo de servicio, técnico.",
    unidad: "min", formato: "min", direccion: "menos", granularidad: "tecnico",
    grupo: "recurso", grafico: "linea_banda_min_max",
    sim: { base: 38, ruido: 0.18, tendencia: -0.05, finde: 1.1, min: 15, max: 90 },
  },

  // ---- Optimización ----
  {
    id: "tasa_aceptacion_rutas",
    nombre: "Tasa de aceptación de rutas",
    definicion: "Porcentaje de rutas propuestas por el optimizador que Operaciones aceptó sin modificar.",
    formula: "rutas no modificadas / rutas propuestas",
    fuente: "Registro de modificaciones sobre rutas optimizadas: ID ruta, ruta propuesta, ruta modificada o no, fecha, usuario.",
    unidad: "%", formato: "pct", direccion: "mas", granularidad: "global",
    grupo: "optimizacion", grafico: "linea",
    sim: { base: 71, ruido: 0.11, tendencia: 0.16, finde: 0.94, min: 40, max: 96 },
  },
  {
    id: "insercion_vivo",
    nombre: "Tasa de inserción en vivo",
    definicion:
      "Porcentaje de OT nuevas que logran integrarse de forma factible en jornadas ya iniciadas, sin alterar los compromisos existentes de la ruta.",
    formula: "OT_insertadas_factibles / OT_nuevas_solicitadas",
    fuente: "ID OT nueva, hora de creación, técnico asignado, ruta existente, posibilidad de inserción, ruta modificada o no, resultado.",
    unidad: "%", formato: "pct", direccion: "mas", granularidad: "global",
    grupo: "optimizacion", grafico: "barras_apiladas_linea_secundaria",
    sim: { base: 63, ruido: 0.17, tendencia: 0.21, finde: 0.7, min: 20, max: 92 },
  },
  {
    id: "dist_optimizada",
    nombre: "Reducción de distancia / km ahorrados",
    definicion:
      "Kilómetros ahorrados por la ruta optimizada respecto de la línea base (asignación manual o secuencial).",
    formula: "km_baseline − km_optimizados",
    fuente: "Km de planificación manual o base, km de la ruta optimizada, ID ruta, fecha. Línea base por acordar.",
    unidad: "km", formato: "km", direccion: "mas", granularidad: "tecnico",
    grupo: "optimizacion", grafico: "barras_verticales",
    sim: { base: 96, ruido: 0.21, tendencia: 0.24, finde: 0.3, min: 15, max: 220 },
  },
  {
    id: "tiempo_planificacion",
    nombre: "Tiempo de planificación",
    definicion: "Tiempo promedio que Operaciones demora en planificar o asignar una jornada.",
    formula: "promedio(hora de término de planificación − hora de inicio de planificación)",
    fuente: "Hora de inicio y término de planificación, fecha, usuario, cantidad de OT planificadas.",
    unidad: "min", formato: "min", direccion: "menos", granularidad: "global",
    grupo: "optimizacion",
    sim: { base: 45, ruido: 0.22, tendencia: -0.2, finde: 0.5, min: 8, max: 95 },
  },
];

const GRUPOS = [
  { id: "operacion", nombre: "Operación", color: "#033E84" },
  { id: "recurso", nombre: "Uso de recursos", color: "#e07419" },
  { id: "optimizacion", nombre: "Optimización", color: "#1c6e44" },
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
       serie: [{
         iso, etiqueta, valor,        // siempre
         min, max,                    // sólo si ind.grafico === "linea_banda_min_max"
         insertadas, rechazadas,      // sólo si ind.grafico === "barras_apiladas_linea_secundaria"
       }],
       anterior: [{ iso, etiqueta, valor }]   período inmediatamente previo
       porTecnico: [{ id, nombre, zona, tipo, valor }]   agregado del período completo (sin cambios)
       porTecnicoDia: [{ id, nombre, zona, tipo, dias: [{ iso, etiqueta, valor }] }]
                       opcional — sólo si ind.grafico === "barras_horizontales_ranking".
                       Es el desglose día a día por técnico que ese gráfico
                       necesita (porTecnico sólo trae un valor agregado para
                       todo el período, no sirve para un ranking por día).
       vacio:    boolean  -> true cuando la combinación de filtros no tiene dato
       motivoVacio: string
     }

   Todos los campos nuevos son opcionales: un indicador cuyo "grafico" no los
   necesita simplemente no los recibe — el backend real sólo tiene que llenar
   los campos que el "grafico" de cada indicador efectivamente usa.
   ========================================================================== */

// Hoy fijo: el sistema opera sobre el lunes 1 de junio de 2026.
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

// Valor simulado de un indicador para UN técnico en UN día — perturba
// valorDelDia con el factor estable de ese técnico. Es la base de
// porTecnicoDia y de la banda min/máx (que necesitan un valor por
// técnico, no sólo el agregado del día).
function valorDelDiaTecnico(ind, fecha, filtros, tecnico) {
  const base = valorDelDia(ind, fecha, filtros);
  const semilla = hash(ind.id + "|tecnico|" + tecnico.id + "|" + iso(fecha));
  const r = mulberry32(semilla)();
  return Math.max(ind.sim.min, base * tecnicoFactor(tecnico.id) * (0.85 + r * 0.3));
}

// Solicitudes de inserción en vivo ese día (denominador de la tasa) — sin
// esto, un 60% sobre 3 solicitudes se ve idéntico a un 60% sobre 40.
function solicitudesDelDia(fecha, filtros) {
  const semilla = hash("insercion_vivo_solicitudes|" + iso(fecha) + "|" + filtros.zona + "|" + filtros.tipoOT);
  const r = mulberry32(semilla)();
  return Math.round(4 + r * 38);
}

function obtenerSerie(indicadorId, rango, filtros) {
  /* ---- INICIO DEL CUERPO REEMPLAZABLE ---------------------------------- */
  const ind = INDICADORES.find((x) => x.id === indicadorId);
  if (!ind) return { serie: [], anterior: [], porTecnico: [], vacio: true, motivoVacio: "Indicador no encontrado." };

  // Regla honesta del producto: los indicadores de nivel sistema no se
  // desagregan por técnico, así que filtrar por uno deja el gráfico sin dato.
  if (ind.granularidad === "global" && filtros.tecnico !== "todos") {
    return {
      serie: [], anterior: [], porTecnico: [], vacio: true,
      motivoVacio: "Este indicador se mide a nivel de sistema y no se desagrega por técnico. Sacá el filtro de técnico para verlo.",
    };
  }

  const candidatos = CP_DATA.tecnicos.filter(
    (t) =>
      (filtros.tecnico === "todos" || t.id === filtros.tecnico) &&
      (filtros.zona === "todas" || t.zona === filtros.zona)
  );

  // Mismo espíritu que la regla de arriba: un indicador por técnico sin
  // ningún técnico que combine los filtros de técnico y zona no tiene nada
  // que mostrar — ni en el gráfico, ni en la tabla, ni en el PDF.
  if (ind.granularidad === "tecnico" && candidatos.length === 0) {
    return {
      serie: [], anterior: [], porTecnico: [], vacio: true,
      motivoVacio: "No hay ningún técnico que combine el filtro de técnico y el de zona elegidos.",
    };
  }

  const dias = diasDelRango(rango);
  const n = dias.length;
  const serie = dias.map((d) => {
    const punto = { iso: iso(d), etiqueta: etiquetaFecha(d), valor: valorDelDia(ind, d, filtros) };

    if (ind.grafico === "linea_banda_min_max" && candidatos.length) {
      const valores = candidatos.map((t) => valorDelDiaTecnico(ind, d, filtros, t)).sort((a, b) => a - b);
      punto.min = valores[0];
      punto.max = valores[valores.length - 1];
    }
    if (ind.grafico === "barras_apiladas_linea_secundaria") {
      const solicitudes = solicitudesDelDia(d, filtros);
      const insertadas = Math.round(solicitudes * (punto.valor / 100));
      punto.insertadas = insertadas;
      punto.rechazadas = Math.max(0, solicitudes - insertadas);
    }
    return punto;
  });

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

  const promedio = serie.reduce((a, b) => a + b.valor, 0) / Math.max(1, serie.length);
  const porTecnico = candidatos.map((t) => {
    const r = mulberry32(hash(ind.id + t.id + filtros.tipoOT))();
    return {
      id: t.id, nombre: CP_DATA.tnombre(t), zona: t.zona, tipo: t.tipo,
      valor: Math.max(ind.sim.min, promedio * tecnicoFactor(t.id) * (0.88 + r * 0.26)),
    };
  });

  // Desglose día a día por técnico — sólo para el ranking horizontal, que
  // es el único gráfico que lo necesita. El resto de los indicadores no
  // paga el costo de calcularlo.
  let porTecnicoDia;
  if (ind.grafico === "barras_horizontales_ranking") {
    porTecnicoDia = candidatos.map((t) => ({
      id: t.id, nombre: CP_DATA.tnombre(t), zona: t.zona, tipo: t.tipo,
      dias: dias.map((d) => ({
        iso: iso(d), etiqueta: etiquetaFecha(d), valor: valorDelDiaTecnico(ind, d, filtros, t),
      })),
    }));
  }

  return { serie, anterior, porTecnico, porTecnicoDia, vacio: serie.length === 0, motivoVacio: "" };
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
const esAcumulable = (ind) => ["ot_asignadas", "ot_realizadas", "dist_optimizada"].includes(ind.id);
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

// El sparkline mide ~26px de alto: ahí no se leen barras ni bandas, así que
// siempre es línea/área simple sin importar ind.grafico. El único ajuste es
// "relleno": los formatos de porcentaje no lo llevan, porque el área bajo
// una curva de porcentaje no representa ninguna cantidad real.
function Sparkline({ datos, color, alto = 34, relleno = true }) {
  if (!datos.length) return <div style={{ height: alto }} />;
  const idGrad = "sp" + color.replace("#", "");
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <AreaChart data={datos} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        {relleno && (
          <defs>
            <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        <Area type="monotone" dataKey="valor" stroke={color} strokeWidth={1.6}
          fill={relleno ? "url(#" + idGrad + ")" : "none"} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Tooltip genérico: un punto con una o más series simples (mismo formato
// para todas). Sirve para área/línea/barras de un solo valor y para las
// barras apiladas por técnico (cada Bar ya trae su nombre y su color).
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

// Tooltip para los gráficos de banda (min/máx y percentiles): no lista
// series sueltas (el "min" y el "rango" son un truco de apilado interno,
// no algo que el usuario tenga que ver) — muestra el valor central y el
// rango completo en dos líneas con nombres claros.
function TooltipBanda({ active, payload, label, ind, etiquetaCentral, etiquetaBanda }) {
  if (!active || !payload || !payload.length) return null;
  const punto = payload[0].payload;
  const tieneBanda = punto.min != null;
  const max = tieneBanda ? punto.min + (punto.rango || 0) : null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12, boxShadow: "var(--shadow-pop)" }}>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text)" }}>
        {etiquetaCentral}: <strong>{formatear(punto.valor, ind.formato)}</strong>
      </div>
      {tieneBanda && (
        <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-2)" }}>
          {etiquetaBanda}: {formatear(punto.min, ind.formato)} – {formatear(max, ind.formato)}
        </div>
      )}
    </div>
  );
}

// Tooltip para gráficos que mezclan series de distinta unidad en un mismo
// punto (ej. OT contadas junto a un porcentaje) — cada dataKey define cómo
// formatear su propio valor en vez de usar el formato del indicador para todo.
function TooltipMixto({ active, payload, label, formatoPorClave }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12, boxShadow: "var(--shadow-pop)" }}>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 600 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "var(--text-2)" }}>{p.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600, fontSize: 12.5, color: "var(--text)" }}>
            {formatoPorClave[p.dataKey] ? formatoPorClave[p.dataKey](p.value) : p.value}
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
   8. GRÁFICO GRANDE — un componente por tipo, elegido por ind.grafico
   --------------------------------------------------------------------------
   Cada uno recibe { ind, d, grupo } y arma su propio eje/tooltip, porque la
   forma de los datos cambia según el tipo. GRAFICOS_POR_TIPO más abajo es
   el único lugar que sabe qué componente corresponde a qué "grafico".
   ========================================================================== */
const EJE_X = { tick: { fontSize: 11, fill: "var(--text-3)" }, tickLine: false, axisLine: { stroke: "var(--border-2)" }, minTickGap: 22 };
const MARGEN_GRAFICO = { top: 4, right: 14, bottom: 0, left: 4 };

// Fallback / comportamiento original: área simple, un valor por día.
function GraficoArea({ ind, d, grupo }) {
  const datos = d.serie.map((p) => ({ etiqueta: p.etiqueta, valor: p.valor }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={datos} margin={MARGEN_GRAFICO}>
        <defs>
          <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={grupo.color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={grupo.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE_X} />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} width={62} tickFormatter={(v) => formatearCorto(v, ind.formato)} />
        <Tooltip content={<TooltipGrafico ind={ind} />} />
        {ind.direccion === "rango" && <ReferenceArea y1={ind.objetivo[0]} y2={ind.objetivo[1]} fill="var(--green-bg)" fillOpacity={0.7} />}
        <Area type="monotone" dataKey="valor" name="Valor" stroke={grupo.color} strokeWidth={2.2} fill="url(#gArea)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// tasa_aceptacion_rutas, ot_pendientes, ot_reprogramadas: línea sin
// relleno — son tasas o niveles continuos, el área bajo la curva no
// representa ninguna cantidad real.
function GraficoLinea({ ind, d, grupo }) {
  const datos = d.serie.map((p) => ({ etiqueta: p.etiqueta, valor: p.valor }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={datos} margin={MARGEN_GRAFICO}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE_X} />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} width={62} tickFormatter={(v) => formatearCorto(v, ind.formato)} />
        <Tooltip content={<TooltipGrafico ind={ind} />} />
        {ind.direccion === "rango" && <ReferenceArea y1={ind.objetivo[0]} y2={ind.objetivo[1]} fill="var(--green-bg)" fillOpacity={0.7} />}
        <Line type="monotone" dataKey="valor" name="Valor" stroke={grupo.color} strokeWidth={2.2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// utilizacion_jornada, cumplimiento_ventana, tiempo_traslado, tiempo_servicio:
// promedio + banda sombreada entre el mínimo y el máximo entre técnicos ese
// día. La dispersión es el hallazgo: 81% de promedio puede ser todos en 81,
// o uno en 98 y otro en 60. Mantiene la banda verde del rango objetivo
// cuando el indicador la declara (criterio acordado, no comparación temporal).
function GraficoBandaMinMax({ ind, d, grupo }) {
  const datos = d.serie.map((p) => ({
    etiqueta: p.etiqueta, valor: p.valor,
    min: p.min != null ? p.min : p.valor,
    rango: p.min != null && p.max != null ? Math.max(0, p.max - p.min) : 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={datos} margin={MARGEN_GRAFICO}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE_X} />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} width={62} tickFormatter={(v) => formatearCorto(v, ind.formato)} />
        <Tooltip content={<TooltipBanda ind={ind} etiquetaCentral="Promedio" etiquetaBanda="Rango entre técnicos" />} />
        {ind.direccion === "rango" && <ReferenceArea y1={ind.objetivo[0]} y2={ind.objetivo[1]} fill="var(--green-bg)" fillOpacity={0.7} />}
        <Area type="monotone" dataKey="min" stackId="banda" stroke="none" fill="none" isAnimationActive={false} />
        <Area type="monotone" dataKey="rango" stackId="banda" name="Rango entre técnicos" stroke="none" fill={grupo.color} fillOpacity={0.16} isAnimationActive={false} />
        <Line type="monotone" dataKey="valor" name="Promedio" stroke={grupo.color} strokeWidth={2.2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// insercion_vivo: OT insertadas + rechazadas apiladas (volumen), más la tasa
// como línea sobre un eje secundario. 60% sobre 3 solicitudes y 60% sobre
// 40 son situaciones distintas — el volumen tiene que verse.
function GraficoBarrasStackLinea({ ind, d }) {
  const datos = d.serie.map((p) => ({
    etiqueta: p.etiqueta, insertadas: p.insertadas || 0, rechazadas: p.rechazadas || 0, tasa: p.valor,
  }));
  const formatos = {
    insertadas: (v) => nf(v, 0) + " OT", rechazadas: (v) => nf(v, 0) + " OT", tasa: (v) => formatear(v, "pct"),
  };
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={datos} margin={MARGEN_GRAFICO}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE_X} />
        <YAxis yAxisId="izq" tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => nf(v, 0)} />
        <YAxis yAxisId="der" orientation="right" tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} width={46} domain={[0, 100]} tickFormatter={(v) => nf(v, 0) + "%"} />
        <Tooltip content={<TooltipMixto formatoPorClave={formatos} />} />
        <Bar yAxisId="izq" dataKey="insertadas" name="Insertadas" stackId="ot" fill="var(--accent)" isAnimationActive={false} />
        <Bar yAxisId="izq" dataKey="rechazadas" name="Rechazadas" stackId="ot" fill="var(--border-3)" isAnimationActive={false} />
        <Line yAxisId="der" type="monotone" dataKey="tasa" name="Tasa" stroke="var(--accent-strong)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ot_asignadas / dist_optimizada: barras verticales — conteo/flujo diario
// discreto, una línea inventaría continuidad entre un día y el siguiente.
function GraficoBarras({ ind, d, grupo }) {
  const datos = d.serie.map((p) => ({ etiqueta: p.etiqueta, valor: p.valor }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={datos} margin={MARGEN_GRAFICO}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="etiqueta" {...EJE_X} />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} width={62} tickFormatter={(v) => formatearCorto(v, ind.formato)} />
        <Tooltip content={<TooltipGrafico ind={ind} />} />
        <Bar dataKey="valor" name="Valor" fill={grupo.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// km_tecnico: ranking horizontal — la pregunta es quién recorre de más, no
// cómo evolucionó el total. Un valor por técnico (promedio del período,
// mismo criterio que el resto de la pantalla para este indicador),
// ordenado de mayor a menor.
function GraficoBarrasHorizontales({ ind, d, grupo }) {
  const porTecnicoDia = d.porTecnicoDia || [];
  if (!porTecnicoDia.length) return <SinDatos motivo="No hay técnicos para mostrar en este período." alto={280} />;
  const datos = porTecnicoDia
    .map((t) => ({ nombre: t.nombre, valor: promedio(t.dias) }))
    .sort((a, b) => b.valor - a.valor);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={datos} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={{ stroke: "var(--border-2)" }} tickFormatter={(v) => formatearCorto(v, ind.formato)} />
        <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 11.5, fill: "var(--text-2)" }} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipGrafico ind={ind} />} />
        <Bar dataKey="valor" name="Valor" fill={grupo.color} radius={[0, 3, 3, 0]} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Único punto que sabe qué componente corresponde a cada "grafico" — y la
// frase corta que explica qué se está mostrando. Un indicador nuevo con
// un "grafico" existente hereda ambos solo con aparecer acá.
const GRAFICOS_POR_TIPO = {
  area: GraficoArea,
  linea: GraficoLinea,
  linea_banda_min_max: GraficoBandaMinMax,
  barras_apiladas_linea_secundaria: GraficoBarrasStackLinea,
  barras_verticales: GraficoBarras,
  barras_horizontales_ranking: GraficoBarrasHorizontales,
};
const EXPLICACION_POR_TIPO = {
  area: "evolución diaria",
  linea: "evolución diaria",
  linea_banda_min_max: "promedio con mínimo y máximo entre técnicos",
  barras_apiladas_linea_secundaria: "insertadas y rechazadas por día, con la tasa",
  barras_verticales: "total diario",
  barras_horizontales_ranking: "promedio del período por técnico, de mayor a menor",
};

/* ==========================================================================
   9. TORRE DE CONTROL — botonera de categorías, gráfico principal, tabla
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
          {!d.vacio && !cargando && <Sparkline datos={d.serie} color={grupo.color} alto={26} relleno={ind.formato !== "pct"} />}
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
  const grupo = GRUPOS.find((g) => g.id === ind.grupo);
  const nota = lectura(ind, d.valor);
  const explicacion = EXPLICACION_POR_TIPO[ind.grafico] || EXPLICACION_POR_TIPO.area;
  const Grafico = GRAFICOS_POR_TIPO[ind.grafico] || GRAFICOS_POR_TIPO.area;

  return (
    <section className="block">
      <div className="block-head" style={{ flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="block-title">{ind.nombre}</div>
            <InfoIndicador ind={ind} />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>{explicacion}</p>
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
          <Grafico ind={ind} d={d} grupo={grupo} />
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
   10. EXPORTACIÓN A PDF
   --------------------------------------------------------------------------
   Exporta exactamente lo que el usuario tiene en pantalla en ese momento
   (categoría activa, indicador elegido, orden de tabla, período y filtros),
   nunca el dashboard completo. Genera el documento con pdfmake (texto y
   tablas vectoriales reales, no una captura de pantalla) — el único
   contenido rasterizado es el gráfico grande, porque pdfmake no sabe dibujar
   el SVG de Recharts; se lo convierte a PNG a 3x para que no se vea pixelado.
   Como se rasteriza el <svg> que esté montado en ese momento, el PDF sale
   siempre con el gráfico que corresponde al indicador (barras, bandas,
   ranking horizontal, etc.) sin ningún código extra acá.
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
    let cadena = new XMLSerializer().serializeToString(clon);
    // El SVG serializado se carga como imagen aislada, sin acceso a las
    // variables CSS de la página (:root) — cualquier var(--x) que haya
    // quedado en un atributo (fill="var(--green-bg)" del ReferenceArea del
    // rango objetivo, o los colores de respaldo por técnico) no resolvería
    // y el navegador la pintaría negra. Se resuelven acá a su valor literal
    // antes de serializar la imagen.
    const raiz = getComputedStyle(document.documentElement);
    cadena = cadena.replace(/var\(--([a-zA-Z0-9-]+)\)/g, (match, nombre) => {
      const valor = raiz.getPropertyValue("--" + nombre).trim();
      return valor || "#000000";
    });
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
  const explicacion = EXPLICACION_POR_TIPO[ind.grafico] || EXPLICACION_POR_TIPO.area;

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
            { text: explicacion, fontSize: 8.5, italics: true, color: paleta.text3, margin: [0, 0, 0, 3] },
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
   11. EXPORTACIÓN A EXCEL
   --------------------------------------------------------------------------
   Mismo criterio que el PDF: exporta exactamente lo que el usuario tiene en
   pantalla (categoría activa, indicador elegido, orden de tabla, filtros),
   no un volcado de toda la base. Tres hojas: indicadores de la categoría
   activa, serie diaria del indicador elegido (con su gráfico incrustado
   como imagen — ExcelJS no arma gráficos nativos de Excel desde el
   navegador sin un backend, así que se reusa el mismo PNG rasterizado que
   ya construye svgAPng para el PDF) y el detalle por técnico tal como está
   ordenado en pantalla.
   ========================================================================== */

// ExcelJS pide color ARGB (8 hex: alpha + rgb); el sistema de diseño da
// hex de 6 — se antepone el canal alpha en opaco.
function argbExcel(hex) {
  return "FF" + hex.replace("#", "").toUpperCase();
}

function numFmtExcel(formato) {
  switch (formato) {
    case "pct": return '0.0"%"';
    case "clp": case "clpOT": return '"$"#,##0';
    default: return "#,##0";
  }
}

async function construirLibroExcel({ grupo, delGrupo, ind, datos, imagenGrafico, filasTabla }) {
  const wb = new window.ExcelJS.Workbook();
  wb.creator = "Control Position";
  wb.created = new Date();

  const colorCategoria = argbExcel((grupo && grupo.color) || "#033E84");
  const estiloEncabezado = (ws) => {
    const fila = ws.getRow(1);
    fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
    fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorCategoria } };
  };

  // ---- Hoja 1: indicadores de la categoría activa ----
  const wsResumen = wb.addWorksheet("Indicadores");
  wsResumen.columns = [
    { header: "Indicador", key: "nombre", width: 34 },
    { header: "Valor", key: "valor", width: 16 },
    { header: "Dirección", key: "direccion", width: 40 },
  ];
  delGrupo.forEach((i) => {
    const d = datos[i.id];
    wsResumen.addRow({
      nombre: i.nombre,
      valor: d.vacio ? "—" : formatear(d.valor, i.formato),
      direccion: d.vacio ? "Sin datos con los filtros actuales" : direccionTexto(i),
    });
  });
  estiloEncabezado(wsResumen);

  // ---- Hoja 2: serie diaria del indicador elegido, con el gráfico ----
  const wsSerie = wb.addWorksheet("Serie diaria");
  const d = datos[ind.id];
  const tieneBanda = ind.grafico === "linea_banda_min_max";
  const tieneInsercion = ind.grafico === "barras_apiladas_linea_secundaria";
  const columnasBase = [
    { header: "Fecha", key: "etiqueta", width: 12 },
    { header: ind.nombre + " (" + ind.unidad + ")", key: "valor", width: 26 },
  ];
  if (tieneBanda) {
    columnasBase.push({ header: "Mínimo entre técnicos", key: "min", width: 22 });
    columnasBase.push({ header: "Máximo entre técnicos", key: "max", width: 22 });
  }
  if (tieneInsercion) {
    columnasBase.push({ header: "Insertadas", key: "insertadas", width: 14 });
    columnasBase.push({ header: "Rechazadas", key: "rechazadas", width: 14 });
  }
  wsSerie.columns = columnasBase;
  if (d.vacio || !d.serie.length) {
    wsSerie.addRow({ etiqueta: "Sin datos con los filtros actuales." });
  } else {
    d.serie.forEach((p) => {
      wsSerie.addRow({
        etiqueta: p.etiqueta, valor: Number(p.valor.toFixed(2)),
        min: p.min != null ? Number(p.min.toFixed(2)) : undefined,
        max: p.max != null ? Number(p.max.toFixed(2)) : undefined,
        insertadas: p.insertadas, rechazadas: p.rechazadas,
      });
    });
    wsSerie.getColumn("valor").numFmt = numFmtExcel(ind.formato);
    if (tieneBanda) {
      wsSerie.getColumn("min").numFmt = numFmtExcel(ind.formato);
      wsSerie.getColumn("max").numFmt = numFmtExcel(ind.formato);
    }
  }
  estiloEncabezado(wsSerie);

  if (imagenGrafico) {
    const base64 = imagenGrafico.dataUrl.split(",")[1];
    const imageId = wb.addImage({ base64, extension: "png" });
    wsSerie.addImage(imageId, {
      tl: { col: columnasBase.length + 1, row: 0 },
      ext: { width: imagenGrafico.width, height: imagenGrafico.height },
    });
  }

  // ---- Hoja 3: detalle por técnico, tal como está ordenado en pantalla ----
  const wsDetalle = wb.addWorksheet("Detalle por técnico");
  wsDetalle.columns = [
    { header: "Técnico", key: "nombre", width: 26 },
    { header: "Comuna", key: "zona", width: 16 },
    { header: "Vínculo", key: "tipo", width: 12 },
    { header: ind.unidad.toUpperCase(), key: "valor", width: 16 },
  ];
  if (!filasTabla.length) {
    wsDetalle.addRow({ nombre: "Sin datos con los filtros actuales." });
  } else {
    filasTabla.forEach((f) => wsDetalle.addRow({ nombre: f[0], zona: f[1], tipo: f[2], valor: f[3] }));
  }
  estiloEncabezado(wsDetalle);

  return wb.xlsx.writeBuffer();
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

  const [generandoExcel, setGenerandoExcel] = useState(false);
  const [errorExcel, setErrorExcel] = useState(null);

  const descargarExcel = async () => {
    setGenerandoExcel(true);
    setErrorExcel(null);
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

      const buffer = await construirLibroExcel({ grupo, delGrupo, ind, datos, imagenGrafico, filasTabla });
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const nombreArchivo = "analisis-" + grupoActivo + "-" + fechaInicioISO + "-al-" + fechaFinISO + ".xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombreArchivo;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generando el Excel de análisis:", err);
      setErrorExcel("No se pudo generar el Excel. Probá de nuevo.");
    } finally {
      setGenerandoExcel(false);
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
          {errorExcel && <span style={{ fontSize: 12, color: "var(--red-fg)" }}>{errorExcel}</span>}
          <button type="button" onClick={descargarExcel} disabled={generandoExcel || cargando} className="btn"
            style={{ opacity: generandoExcel || cargando ? 0.6 : 1, cursor: generandoExcel || cargando ? "not-allowed" : "pointer" }}>
            <span className={generandoExcel ? "icon-spin" : ""}><Icon name={generandoExcel ? "refresh" : "download"} /></span>
            {generandoExcel ? "Generando…" : "Descargar Excel"}
          </button>
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
