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
   1. ORIGEN DEL DATO
   Todos los indicadores del catálogo salen de GoodRoute (GET
   /api/kpis/rango, sección 4b): los 8 KPI de HU-24 más CVH y UJO,
   sumados por el backend el 28/10/2026. Los que no tenían fuente real
   (KMT, TIV, KMA) se sacaron del catálogo; si vuelven, tienen que venir
   con datos reales.
   ========================================================================== */

/* ==========================================================================
   2. CATÁLOGO DE INDICADORES  —  ÚNICO PUNTO DE EDICIÓN
   --------------------------------------------------------------------------
   Agregar, quitar o reordenar un indicador se hace SOLO acá. Los componentes
   iteran sobre este array; el layout no conoce ningún indicador por nombre.

   Campos:
     id            clave estable, usada por el adaptador de datos
     sigla         identificador corto visible en tarjeta, gráfico y popover
                   (HU-27) — el supervisor reconoce el KPI por su sigla
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
   ========================================================================== */
const INDICADORES = [
  // ---- Operación ----
  {
    id: "ot_asignadas",
    sigla: "OTA",
    nombre: "OT asignadas",
    definicion: "Cantidad de OT que quedaron asignadas a un técnico (sin contar las reprogramaciones).",
    formula: "filas de asignación con técnico aceptado y sin motivo de reprogramación",
    fuente: "GoodRoute (HU-24): tabla asignacion.",
    unidad: "OT", formato: "ot", direccion: "contexto", granularidad: "tecnico",
    grupo: "operacion", grafico: "barras_verticales",
  },
  {
    id: "ot_realizadas",
    sigla: "OTX",
    nombre: "OT realizadas con éxito",
    definicion: "Cantidad de OT ejecutadas y finalizadas correctamente (una OT parcial no cuenta).",
    formula: "conteo de OT en estado finalizada",
    fuente: "GoodRoute (HU-24): OT del sistema externo.",
    unidad: "OT", formato: "ot", direccion: "mas", granularidad: "tecnico",
    grupo: "operacion", grafico: "barras_verticales",
  },
  {
    id: "ot_pendientes",
    sigla: "OTP",
    nombre: "OT pendientes",
    definicion: "OT del día que, al terminar el día en hora de Chile, todavía no estaban finalizadas.",
    formula: "conteo de OT del día no finalizadas al cierre del día",
    fuente: "GoodRoute (HU-24): OT del sistema externo. No se calcula por técnico.",
    unidad: "OT", formato: "ot", direccion: "menos", granularidad: "global",
    grupo: "operacion", grafico: "barras_verticales",
  },
  {
    id: "ot_reprogramadas",
    sigla: "OTR",
    nombre: "OT reprogramadas",
    definicion: "Cantidad de OT que se reprogramaron después de haber sido asignadas.",
    formula: "filas de asignación con motivo de reprogramación",
    fuente: "GoodRoute (HU-24): tabla asignacion.",
    unidad: "OT", formato: "ot", direccion: "menos", granularidad: "tecnico",
    grupo: "operacion", grafico: "barras_verticales",
  },
  {
    id: "cumplimiento_ventana",
    sigla: "CVH",
    nombre: "Cumplimiento de ventana horaria",
    definicion: "Porcentaje de OT en que el técnico llegó dentro de la ventana comprometida (hasta 30 min antes y 15 min después de la hora programada).",
    formula: "OT con inicio de visita dentro de la ventana / OT con inicio de visita",
    fuente: "GoodRoute: inicio de visita y hora programada de las OT.",
    unidad: "%", formato: "pct", direccion: "mas", granularidad: "tecnico",
    grupo: "operacion", grafico: "linea_banda_min_max",
  },

  // ---- Uso de recursos ----
  {
    id: "tiempo_traslado",
    sigla: "TTR",
    nombre: "Tiempo de traslado",
    definicion: "Tiempo promedio de traslado entre una OT y la siguiente del mismo técnico.",
    formula: "promedio(documento de inicio de la OT siguiente − comprobante de la OT anterior)",
    fuente: "GoodRoute (HU-24): documento de inicio y comprobantes de las OT.",
    unidad: "min", formato: "min", direccion: "menos", granularidad: "tecnico",
    grupo: "recurso", grafico: "linea_banda_min_max",
  },
  {
    id: "tiempo_servicio",
    sigla: "TPS",
    nombre: "Tiempo promedio de servicio",
    definicion: "Cuánto demora realmente un técnico desde que inicia hasta que termina una OT.",
    formula: "promedio(comprobante de la OT − documento de inicio de la OT)",
    fuente: "GoodRoute (HU-24): documento de inicio y comprobantes de las OT.",
    unidad: "min", formato: "min", direccion: "menos", granularidad: "tecnico",
    grupo: "recurso", grafico: "linea_banda_min_max",
  },
  {
    id: "utilizacion_jornada",
    sigla: "UJO",
    nombre: "Utilización de jornada",
    definicion: "Porcentaje de la jornada (08:00 a 19:00) que los técnicos con OT ese día pasaron trabajando.",
    formula: "minutos de trabajo (inicio de visita → comprobante) / (660 min × técnicos con OT)",
    fuente: "GoodRoute: inicio de visita y comprobantes de las OT.",
    unidad: "%", formato: "pct", direccion: "mas", granularidad: "tecnico",
    grupo: "recurso", grafico: "linea_banda_min_max",
  },

  // ---- Optimización ----
  {
    id: "tasa_aceptacion_rutas",
    sigla: "TAR",
    nombre: "Tasa de aceptación de rutas",
    definicion: "Porcentaje de las propuestas del optimizador que la planificadora aceptó sin modificar. Las ediciones manuales no cuentan.",
    formula: "propuestas del optimizador sin modificar / propuestas del optimizador",
    fuente: "GoodRoute (HU-24): tabla asignacion.",
    unidad: "%", formato: "pct", direccion: "mas", granularidad: "tecnico",
    grupo: "optimizacion", grafico: "linea",
  },
  {
    id: "tiempo_planificacion",
    sigla: "TPL",
    nombre: "Tiempo de planificación",
    definicion: "Tiempo promedio que Operaciones demora en planificar una jornada.",
    formula: "promedio(fecha de asignación − inicio de la planificación)",
    fuente: "GoodRoute (HU-24): tabla asignacion. No se calcula por técnico.",
    unidad: "min", formato: "min", direccion: "menos", granularidad: "global",
    grupo: "optimizacion",
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
   Técnicos y zonas salen de GoodRoute (base.tecnicos, cargado en
   useTablero), así los filtros muestran exactamente lo que existe en los
   datos reales. No hay filtro por tipo de OT: /api/kpis no lo soporta. La
   zona es el único caso que se calcula en el front (ver sección 4b).
   ========================================================================== */
const zonasDe = (tecnicos) => [...new Set(tecnicos.map((t) => t.zona).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
const TIPO_OT_LABEL = window.RUTAS_EXTERNO_API.TIPO_OT_LABEL;

/* ==========================================================================
   4. ADAPTADOR DE DATOS  —  ÚNICO PUNTO DE CONEXIÓN AL BACKEND
   --------------------------------------------------------------------------
   >>> PUNTO DE REEMPLAZO <<<
   Cada indicador se calcula en derivarKpiReal() (sección 4b, KPI de HU-24).
   Para sumar uno nuevo: que GoodRoute lo entregue en /api/kpis/rango y
   agregarlo al catálogo con esa sigla. La forma del objeto de retorno no
   cambia, así que ningún componente se toca.

   Devuelve:
     {
       serie: [{
         iso, etiqueta, valor,        // siempre
         min, max,                    // sólo si ind.grafico === "linea_banda_min_max"
       }],
       anterior: [{ iso, etiqueta, valor }]   período inmediatamente previo
       porTecnico: [{ id, nombre, zona, tipo, valor }]   agregado del período completo (sin cambios)
       vacio:    boolean  -> true cuando la combinación de filtros no tiene dato
       motivoVacio: string
     }

   Todos los campos nuevos son opcionales: un indicador cuyo "grafico" no los
   necesita simplemente no los recibe — el backend real sólo tiene que llenar
   los campos que el "grafico" de cada indicador efectivamente usa.
   ========================================================================== */

// Hoy real (medianoche local): los datos reales de GoodRoute son de las
// últimas semanas, así que el período por defecto termina hoy.
const HOY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

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

function obtenerSerie(indicadorId, rango, filtros, base) {
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

  const candidatos = ((base && base.tecnicos) || []).filter(
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
  return derivarKpiReal(ind, dias, filtros, base, candidatos);
  /* ---- FIN DEL CUERPO REEMPLAZABLE ------------------------------------- */
}

/* ==========================================================================
   4b. KPI REALES — GET /api/kpis/rango, calculados por la API
   --------------------------------------------------------------------------
   El cálculo de los indicadores es de la API (aviso del backend del
   28/10/2026). useTablero pide el PERÍODO elegido con dos llamadas a
   /api/kpis/rango — la global (con eso ya se ve el tablero) y la de
   por_tecnico=true (filtros, tabla y banda min/máx) — y de cada respuesta
   usa:
     kpis     una fila por fecha (y técnico): sparkline y detalle diario
     totales  una fila por KPI (y técnico) con el total del período: valor
              grande de la tarjeta, "Total del período" y tabla por técnico
   Cambiar el período vuelve a pedir los datos (los totales dependen del
   rango); cambiar técnico o zona no, porque el desglose ya vino completo.

   Única excepción, acordada con el backend: el filtro de ZONA. La API no
   tiene totales por zona, así que se suman acá las filas por técnico de
   los técnicos de esa zona (ver sumarPorZona).

   base = {
     periodo: { desde, hasta },          // ISO, lo que se pidió
     tecnicos: [...],                    // padrón de GoodRoute
     global: { [fecha]: { [sigla]: kpi } },
     porTecnico: { [tecnicoId]: { [fecha]: { [sigla]: kpi } } },
     totales: { [sigla]: total },
     totalesPorTecnico: { [tecnicoId]: { [sigla]: total } },
     tecnicosCargados: n,                // 0 hasta que llega el desglose
   }
   ========================================================================== */
const VENTANA_DIAS_ATRAS = 30;
const VENTANA_DIAS_ADELANTE = 7;
// Fechas que GoodRoute puede devolver: 30 días de historia y los próximos
// días ya programados. Acota el rango personalizado.
const VENTANA = (() => {
  const desde = new Date(HOY); desde.setDate(HOY.getDate() - VENTANA_DIAS_ATRAS);
  const hasta = new Date(HOY); hasta.setDate(HOY.getDate() + VENTANA_DIAS_ADELANTE);
  return { desde: iso(desde), hasta: iso(hasta) };
})();
// OTP y TPL existen solo en global (/api/kpis/rango no los desglosa por técnico).
const SIN_DESGLOSE_POR_TECNICO = new Set(["OTP", "TPL"]);

// Solo para el filtro de zona: suma numeradores y denominadores de las
// filas de los técnicos de la zona y divide al final — razones (%) por 100,
// promedios (min) num/den, conteos con el numerador. Denominador 0 -> null.
function sumarPorZona(ind, filas) {
  const presentes = filas.filter(Boolean);
  if (!presentes.length) return null;
  const num = presentes.reduce((a, k) => a + (k.numerador || 0), 0);
  if (presentes.every((k) => k.denominador == null)) return num;
  const den = presentes.reduce((a, k) => a + (k.denominador || 0), 0);
  if (!den) return null;
  return (num / den) * (ind.formato === "pct" ? 100 : 1);
}

function derivarKpiReal(ind, dias, filtros, base, candidatos) {
  const vacio = (motivo, extra) => ({ serie: [], anterior: [], porTecnico: [], vacio: true, motivoVacio: motivo, ...extra });
  if (!base) return vacio("Cargando indicadores de GoodRoute…");
  const sigla = ind.sigla;
  const tecnicoId = filtros.tecnico !== "todos" ? filtros.tecnico : null;
  // Con un técnico elegido manda su valor (de la API); la zona solo se
  // calcula acá cuando se filtra por zona sin técnico.
  const porZona = !tecnicoId && filtros.zona !== "todas";

  if (tecnicoId && SIN_DESGLOSE_POR_TECNICO.has(sigla)) {
    return vacio("GoodRoute calcula " + sigla + " solo a nivel de sistema: no se puede filtrar por técnico. Sacá ese filtro para verlo.");
  }
  if (porZona && SIN_DESGLOSE_POR_TECNICO.has(sigla)) {
    return vacio(sigla + " no está disponible por zona: GoodRoute lo calcula solo a nivel de sistema. Sacá el filtro de zona para verlo.");
  }
  const desgloseCargando = base.tecnicosCargados === 0;
  if ((tecnicoId || porZona) && desgloseCargando) {
    return vacio("Cargando el desglose por técnico…", { desgloseCargando: true });
  }

  const valorDe = (kpi) => (kpi && kpi.valor != null ? kpi.valor : null);
  const filaDe = (tecId, f) => { const m = base.porTecnico[tecId]; return m && m[f] ? m[f][sigla] : null; };
  const valorDelDia = (f) => {
    if (porZona) return sumarPorZona(ind, candidatos.map((t) => filaDe(t.id, f)));
    if (tecnicoId) return valorDe(filaDe(tecnicoId, f));
    return valorDe(base.global[f] && base.global[f][sigla]);
  };

  const banda = ind.grafico === "linea_banda_min_max" && !desgloseCargando;
  const serie = dias.map((d) => {
    const f = iso(d);
    const punto = { iso: f, etiqueta: etiquetaFecha(d), valor: valorDelDia(f) };
    // Banda: el menor y el mayor valor diario entre los técnicos, tal cual
    // los entrega la API (solo se ordenan, no se combinan).
    if (banda) {
      const valores = candidatos.map((t) => valorDe(filaDe(t.id, f))).filter((v) => v != null).sort((a, b) => a - b);
      if (valores.length) { punto.min = valores[0]; punto.max = valores[valores.length - 1]; }
    }
    return punto;
  });

  let valorPeriodo;
  if (porZona) {
    // base solo trae el período pedido: todas las filas de cada técnico.
    valorPeriodo = sumarPorZona(ind, candidatos.flatMap((t) => Object.values(base.porTecnico[t.id] || {}).map((m) => m[sigla])));
  } else {
    valorPeriodo = valorDe(tecnicoId ? (base.totalesPorTecnico[tecnicoId] || {})[sigla] : base.totales[sigla]);
  }

  let porTecnico = [];
  if (ind.granularidad !== "global" && !desgloseCargando) {
    porTecnico = candidatos
      .map((t) => ({ id: t.id, nombre: t.nombre, zona: t.zona, tipo: t.tipo, valor: valorDe((base.totalesPorTecnico[t.id] || {})[sigla]) }))
      .filter((x) => x.valor != null);
  }

  return {
    serie, anterior: [], porTecnico, vacio: false, motivoVacio: "",
    valorPeriodo, desgloseCargando,
    motivoDesglose: desgloseCargando ? "Cargando el desglose por técnico…" : "",
  };
}

/* ==========================================================================
   5. FORMATO Y LECTURA
   ========================================================================== */
const nf = (v, d = 0) =>
  v.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });

// null = sin datos (ej. un promedio con denominador 0): nunca se muestra como 0.
function formatear(valor, formato) {
  if (valor == null || Number.isNaN(valor)) return "Sin datos";
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
  if (valor == null) return "Sin datos";
  if (formato === "clp" || formato === "clpOT") {
    if (Math.abs(valor) >= 1000000) return "$" + nf(valor / 1000000, 1) + "M";
    if (Math.abs(valor) >= 1000) return "$" + nf(Math.round(valor / 1000)) + "k";
    return "$" + nf(Math.round(valor));
  }
  return formatear(valor, formato);
}

// Solo para el rótulo del valor del período (lo calcula la API): los
// conteos se leen como total; el resto, como promedio.
const esAcumulable = (ind) => ["ot_asignadas", "ot_realizadas", "ot_pendientes", "ot_reprogramadas"].includes(ind.id);

// Texto corto de la dirección declarada de un indicador — sale de INDICADORES,
// nunca a mano. Se usa en la tarjeta y en las exportaciones.
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

// Popover "qué mide": definición y fórmula — el nombre y la dirección ya se
// ven en la tarjeta, y la fuente queda en el PDF. En pantallas angostas se
// muestra fijo abajo (ver .ind-pop en styles.css); en el resto se corre a
// la izquierda si se saldría por el borde derecho.
function InfoIndicador({ ind }) {
  const [abierto, setAbierto] = useState(false);
  const [desplazamiento, setDesplazamiento] = useState(0);
  const caja = useRef(null);
  const pop = useRef(null);
  useLayoutEffect(() => {
    if (!abierto || !pop.current) { setDesplazamiento(0); return; }
    const sobra = pop.current.getBoundingClientRect().right - (window.innerWidth - 16);
    setDesplazamiento(sobra > 0 ? -sobra : 0);
  }, [abierto]);
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
        aria-expanded={abierto}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 4,
          // Abierto: borde cuadrado alrededor de la "i" — marca qué tarjeta
          // abrió el popover (el popover ya no repite el nombre).
          border: "1.5px solid " + (abierto ? "var(--text)" : "transparent"),
          color: abierto ? "var(--text)" : "var(--text-4)",
        }}
        onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v); }}
      >
        <Icon name="info" style={{ width: 15, height: 15 }} />
      </button>
      {abierto && (
        <div className="ind-pop" ref={pop} style={{ "--pop-dx": desplazamiento + "px" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <p style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>{ind.definicion}</p>
            <button
              type="button" aria-label="Cerrar"
              style={{ marginLeft: "auto", color: "var(--text-3)", width: 20, height: 20, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}
              onClick={() => setAbierto(false)}
            ><Icon name="x" style={{ width: 14, height: 14 }} /></button>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>Fórmula</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text)", marginTop: 2 }}>{ind.formula}</div>
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

function Cargando({ alto = 220, texto }) {
  return (
    <div style={{ height: alto, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <span className="icon-spin" style={{ color: "var(--text-4)" }}><Icon name="refresh" style={{ width: 22, height: 22 }} /></span>
      <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-3)" }}>{texto || "Cargando indicadores…"}</div>
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

// GoodRoute guarda 30 días de historia (más los próximos días ya
// programados): no tiene sentido ofrecer 90 días.
const PRESETS = [
  { valor: "7", texto: "Últimos 7 días" },
  { valor: "14", texto: "Últimos 14 días" },
  { valor: "30", texto: "Últimos 30 días" },
  { valor: "custom", texto: "Rango personalizado" },
];

function BarraFiltros({ rango, setRango, filtros, setFiltros, cargando, onRecargar, tecnicos, ventana }) {
  const cambiarPreset = (v) => {
    if (v === "custom") {
      // Por defecto: la última semana y los próximos días ya programados.
      const desde = new Date(HOY); desde.setDate(HOY.getDate() - 6);
      const hasta = new Date(HOY); hasta.setDate(HOY.getDate() + VENTANA_DIAS_ADELANTE);
      setRango({ preset: "custom", dias: 7 + VENTANA_DIAS_ADELANTE, desde: iso(desde), hasta: iso(hasta) });
    } else {
      setRango({ preset: v, dias: Number(v), desde: null, hasta: null });
    }
  };
  const cambiarFecha = (campo, valor) => {
    const nuevo = { ...rango, [campo]: valor };
    const d1 = new Date(nuevo.desde), d2 = new Date(nuevo.hasta);
    const dias = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    setRango({ ...nuevo, dias: Math.min(dias, VENTANA_DIAS_ATRAS + VENTANA_DIAS_ADELANTE + 1) });
  };

  return (
    <div className="card card-pad" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 18 }}>
      <Selector etiqueta="Período" valor={rango.preset} onChange={cambiarPreset} opciones={PRESETS} />
      {rango.preset === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="date" className="field-input" value={rango.desde || ""} min={ventana && ventana.desde} max={rango.hasta || (ventana && ventana.hasta)} onChange={(e) => cambiarFecha("desde", e.target.value)} style={{ width: 150 }} />
          <span style={{ color: "var(--text-3)", fontSize: 12 }}>a</span>
          <input type="date" className="field-input" value={rango.hasta || ""} min={rango.desde || (ventana && ventana.desde)} max={ventana && ventana.hasta} onChange={(e) => cambiarFecha("hasta", e.target.value)} style={{ width: 150 }} />
        </div>
      )}

      <div style={{ width: 1, alignSelf: "stretch", background: "var(--border-2)" }} />

      <Selector etiqueta="Técnico" valor={filtros.tecnico}
        onChange={(v) => setFiltros({ ...filtros, tecnico: v })}
        opciones={[{ valor: "todos", texto: "Todos" },
          ...tecnicos.map((t) => ({ valor: t.id, texto: t.nombre }))]} />
      <Selector etiqueta="Zona" valor={filtros.zona}
        onChange={(v) => setFiltros({ ...filtros, zona: v })}
        opciones={[{ valor: "todas", texto: "Todas" },
          ...zonasDe(tecnicos).map((z) => ({ valor: z, texto: z }))]} />
      {/* Sin filtro por tipo de OT: /api/kpis (HU-24) solo segmenta por
          fecha y técnico. La zona se resuelve sumando los técnicos de esa
          zona (ver sumarPorZona). */}

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
// Última base cargada — solo para los textos de las exportaciones (nombre
// del técnico filtrado), que se arman fuera de React.
let BASE_ACTUAL = null;

// Los datos se piden al entrar, con "Actualizar" y al cambiar el período
// (los totales de la API dependen del rango pedido). Son dos llamadas a
// /api/kpis/rango: primero la global (con eso ya se ve el tablero) y
// después la de por_tecnico=true (filtros de técnico/zona, tabla y banda
// min/máx). Cambiar técnico o zona no vuelve a llamar: ese desglose ya vino.
function useTablero() {
  const [rango, setRango] = useState({ preset: "30", dias: 30, desde: null, hasta: null });
  // tipoOT queda fijo en "todos": HU-24 no segmenta por tipo (ver BarraFiltros).
  const [filtros, setFiltros] = useState({ tecnico: "todos", zona: "todas", tipoOT: "todos" });
  // Estado explícito del servicio: cargando | ok | error — nunca un
  // intermedio sin nombre. `actualizadoEn` es la hora de la última carga
  // exitosa, que se muestra como confirmación de éxito.
  const [servicio, setServicio] = useState({ estado: "cargando", error: null, actualizadoEn: null });
  const [base, setBase] = useState(null);
  const [tick, setTick] = useState(0);
  const periodo = periodoDelRango(rango);

  useEffect(() => {
    if (!periodo) return;
    let activo = true;
    setServicio((s) => ({ ...s, estado: "cargando", error: null, erroresKpi: [], errorDesglose: null }));
    const api = window.RUTAS_EXTERNO_API;
    // Filas diarias -> { [fecha]: { [sigla]: kpi } }, global o por técnico.
    const indexar = (filas) => {
      const global = {}, porTecnico = {};
      filas.forEach((k) => {
        const destino = k.tecnico_id ? (porTecnico[k.tecnico_id] = porTecnico[k.tecnico_id] || {}) : global;
        (destino[k.fecha] = destino[k.fecha] || {})[k.sigla] = k;
      });
      return { global, porTecnico };
    };
    // Totales del período -> { [sigla]: total }, global o por técnico.
    const indexarTotales = (filas) => {
      const global = {}, porTecnico = {};
      filas.forEach((t) => {
        const destino = t.tecnico_id ? (porTecnico[t.tecnico_id] = porTecnico[t.tecnico_id] || {}) : global;
        destino[t.sigla] = t;
      });
      return { global, porTecnico };
    };
    const siglasConError = (r) => [...new Set((r.errores || []).map((e) => e.sigla))];

    (async () => {
      try {
        const [tecnicos, rGlobal] = await Promise.all([
          api.obtenerTecnicos(),
          api.obtenerKpisRango(periodo.desde, periodo.hasta),
        ]);
        if (!activo) return;
        let b = {
          periodo: { desde: periodo.desde, hasta: periodo.hasta }, tecnicos,
          global: indexar(rGlobal.kpis || []).global, totales: indexarTotales(rGlobal.totales || []).global,
          porTecnico: {}, totalesPorTecnico: {}, tecnicosCargados: 0,
        };
        BASE_ACTUAL = b;
        setBase(b);
        setServicio({ estado: "ok", error: null, actualizadoEn: new Date(), erroresKpi: siglasConError(rGlobal), errorDesglose: null });

        try {
          const rTec = await api.obtenerKpisRango(periodo.desde, periodo.hasta, { porTecnico: true });
          if (!activo) return;
          const { porTecnico } = indexar(rTec.kpis || []);
          const totalesPorTecnico = indexarTotales(rTec.totales || []).porTecnico;
          // Un técnico sin ninguna fila en el período igual queda "cargado"
          // (vacío), para que el filtro no se quede esperando para siempre.
          tecnicos.forEach((t) => { porTecnico[t.id] = porTecnico[t.id] || {}; });
          b = { ...b, porTecnico, totalesPorTecnico, tecnicosCargados: tecnicos.length };
          BASE_ACTUAL = b;
          setBase(b);
          setServicio((s) => ({ ...s, erroresKpi: [...new Set([...(s.erroresKpi || []), ...siglasConError(rTec)])] }));
        } catch (err) {
          if (activo) setServicio((s) => ({ ...s, errorDesglose: err.message || "error desconocido" }));
        }
      } catch (err) {
        if (activo) setServicio((s) => ({ ...s, estado: "error", error: err.message || "error desconocido" }));
      }
    })();
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, periodo && periodo.desde, periodo && periodo.hasta]);

  const datos = useMemo(() => {
    const mapa = {};
    INDICADORES.forEach((ind) => {
      const d = obtenerSerie(ind.id, rango, filtros, base);
      // Valor del período: el total de la API (o la suma por zona, 4b).
      mapa[ind.id] = { ...d, valor: d.valorPeriodo !== undefined ? d.valorPeriodo : null };
    });
    return mapa;
  }, [rango, filtros, base]);

  const cargando = servicio.estado === "cargando";
  return {
    rango, setRango, filtros, setFiltros, cargando, servicio, datos,
    tecnicos: (base && base.tecnicos) || [], ventana: VENTANA,
    desglose: base ? { cargados: base.tecnicosCargados, total: base.tecnicos.length } : null,
    recargar: () => setTick((t) => t + 1),
  };
}

// Período efectivo en fechas concretas (no "últimos 30 días") — se muestra
// en la cabecera, el gráfico y la tabla, para que el período sea
// reconocible en todo momento sin inferirlo de los filtros (HU-27).
function periodoDelRango(rango) {
  const dias = diasDelRango(rango);
  if (!dias.length) return null;
  return { desde: iso(dias[0]), hasta: iso(dias[dias.length - 1]), dias: dias.length };
}
function textoPeriodo(p) {
  if (!p) return "—";
  return fechaCompleta(p.desde) + " – " + fechaCompleta(p.hasta) + " · " + p.dias + (p.dias === 1 ? " día" : " días");
}

function EstadoServicio({ servicio, desglose, onReintentar }) {
  if (servicio.estado === "cargando") {
    return (
      <span className="row-flex" style={{ gap: 6, fontSize: 12.5, color: "var(--text-3)" }}>
        <span className="rx-ring rx-ring-14" aria-hidden="true" />Cargando indicadores…
      </span>
    );
  }
  if (servicio.estado === "error") {
    return (
      <span className="row-flex" style={{ gap: 8, fontSize: 12.5, color: "var(--red-fg)" }}>
        <Icon name="alert" style={{ width: 14, height: 14 }} />No se pudieron cargar los indicadores: {servicio.error}
        <button type="button" className="btn btn-sm" onClick={onReintentar}>Reintentar</button>
      </span>
    );
  }
  const hora = servicio.actualizadoEn
    ? String(servicio.actualizadoEn.getHours()).padStart(2, "0") + ":" + String(servicio.actualizadoEn.getMinutes()).padStart(2, "0")
    : null;
  const avisos = [];
  if (servicio.erroresKpi && servicio.erroresKpi.length) avisos.push("GoodRoute no pudo calcular " + servicio.erroresKpi.join(", ") + " (por ejemplo, sin conexión a su base de datos)");
  if (servicio.errorDesglose) avisos.push("No se pudo cargar el desglose por técnico: " + servicio.errorDesglose);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: "6px 18px", fontSize: 12.5, color: "var(--text-3)" }}>
      <span className="row-flex" style={{ gap: 6 }}>
        <Icon name="checkC" style={{ width: 14, height: 14, color: "var(--green-fg)" }} />
        Datos actualizados{hora ? " a las " + hora : ""}
      </span>
      {desglose && desglose.cargados < desglose.total && !servicio.errorDesglose && (
        <span className="row-flex" style={{ gap: 6 }}>
          <span className="rx-ring rx-ring-14" aria-hidden="true" />
          Cargando el desglose por técnico…
        </span>
      )}
      {avisos.length > 0 && (
        <span className="row-flex" style={{ gap: 6, color: "var(--amber-fg)" }}>
          <Icon name="alert" style={{ width: 14, height: 14 }} />{avisos.join(" · ")}
        </span>
      )}
    </div>
  );
}

function SiglaKPI({ ind }) {
  return <span className="kpi-sigla">{ind.sigla}</span>;
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

// tiempo_traslado, tiempo_servicio:
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

// ot_asignadas: barras verticales — conteo/flujo diario
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

// Único punto que sabe qué componente corresponde a cada "grafico" — y la
// frase corta que explica qué se está mostrando. Un indicador nuevo con
// un "grafico" existente hereda ambos solo con aparecer acá.
const GRAFICOS_POR_TIPO = {
  area: GraficoArea,
  linea: GraficoLinea,
  linea_banda_min_max: GraficoBandaMinMax,
  barras_verticales: GraficoBarras,
};
const EXPLICACION_POR_TIPO = {
  area: "evolución diaria",
  linea: "evolución diaria",
  linea_banda_min_max: "promedio con mínimo y máximo entre técnicos",
  barras_verticales: "total diario",
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
        <SiglaKPI ind={ind} />
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
// plana con todos los indicadores juntos. Por eso no vive en GRUPOS: agregar
// una entrada falsa ahí rompería los lookups que hacen TarjetaKPI/TablaTecnicos
// contra el grupo real de cada indicador.
const TODOS_ID = "todos";

// Botonera de categorías: una pestaña por grupo, generada iterando GRUPOS —
// un grupo nuevo en INDICADORES/GRUPOS aparece acá solo, sin tocar este
// componente. "Todos" va al final, fijo.
function BotonesCategoria({ grupoActivo, onCambiar, indicadores }) {
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
        boton(g.id, g.id === grupoActivo, g.color, g.nombre, indicadores.filter((i) => i.grupo === g.id).length)
      )}
      {boton(TODOS_ID, grupoActivo === TODOS_ID, "var(--text-3)", "Todos", indicadores.length)}
    </nav>
  );
}

function GraficoPrincipal({ ind, d, cargando, graficoRef, periodo }) {
  const grupo = GRUPOS.find((g) => g.id === ind.grupo);
  const nota = lectura(ind, d.valor);
  const explicacion = EXPLICACION_POR_TIPO[ind.grafico] || EXPLICACION_POR_TIPO.area;
  const Grafico = GRAFICOS_POR_TIPO[ind.grafico] || GRAFICOS_POR_TIPO.area;

  return (
    <section className="block">
      <div className="block-head" style={{ flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <SiglaKPI ind={ind} />
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
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{textoPeriodo(periodo)}</div>
        </div>
      </div>

      <div ref={graficoRef} className="block-body" style={{ paddingTop: 18, paddingBottom: 8 }}>
        {cargando || (d.vacio && d.desgloseCargando) ? <Cargando alto={280} texto={d.motivoVacio} /> : d.vacio ? <SinDatos motivo={d.motivoVacio} alto={280} /> : (
          <Grafico ind={ind} d={d} grupo={grupo} />
        )}
      </div>
    </section>
  );
}

function TablaTecnicos({ ind, d, cargando, tablaRef, periodo }) {
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
        <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{ind.sigla} · {esAcumulable(ind) ? "total" : "promedio"} · {textoPeriodo(periodo)}</span>
      </div>
      <div ref={tablaRef} className="card">
        {cargando || d.desgloseCargando ? <Cargando alto={200} texto={d.motivoDesglose || d.motivoVacio} /> : d.vacio ? <SinDatos motivo={d.motivoVacio} alto={200} /> : ind.granularidad === "global" ? (
          <SinDatos alto={160} motivo="Este indicador se mide a nivel de sistema: no tiene desglose por técnico." />
        ) : (
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
    const t = BASE_ACTUAL && BASE_ACTUAL.tecnicos.find((x) => x.id === filtros.tecnico);
    partes.push("Técnico: " + (t ? t.nombre : filtros.tecnico));
  }
  if (filtros.zona !== "todas") partes.push("Zona: " + filtros.zona);
  if (filtros.tipoOT !== "todos") partes.push("Tipo de OT: " + (TIPO_OT_LABEL[filtros.tipoOT] || filtros.tipoOT));
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
  const columnasBase = [
    { header: "Fecha", key: "etiqueta", width: 12 },
    { header: ind.nombre + " (" + ind.unidad + ")", key: "valor", width: 26 },
  ];
  if (tieneBanda) {
    columnasBase.push({ header: "Mínimo entre técnicos", key: "min", width: 22 });
    columnasBase.push({ header: "Máximo entre técnicos", key: "max", width: 22 });
  }
  wsSerie.columns = columnasBase;
  if (d.vacio || !d.serie.length) {
    wsSerie.addRow({ etiqueta: "Sin datos con los filtros actuales." });
  } else {
    d.serie.forEach((p) => {
      wsSerie.addRow({
        etiqueta: p.etiqueta, valor: p.valor != null ? Number(p.valor.toFixed(2)) : undefined,
        min: p.min != null ? Number(p.min.toFixed(2)) : undefined,
        max: p.max != null ? Number(p.max.toFixed(2)) : undefined,
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
  const { rango, setRango, filtros, setFiltros, cargando, servicio, datos, tecnicos, ventana, desglose, recargar } = useTablero();
  const periodo = periodoDelRango(rango);
  const visibles = INDICADORES;
  const [grupoActivo, setGrupoActivo] = useState(GRUPOS[0].id);
  const grupo = grupoActivo === TODOS_ID ? null : GRUPOS.find((g) => g.id === grupoActivo);
  const delGrupo = grupoActivo === TODOS_ID ? visibles : visibles.filter((i) => i.grupo === grupoActivo);

  const [seleccionado, setSeleccionado] = useState(delGrupo[0].id);
  const ind = delGrupo.find((i) => i.id === seleccionado) || delGrupo[0];

  // Cambiar de categoría siempre mueve el gráfico grande al primer indicador
  // del conjunto que queda visible (todo INDICADORES si es "Todos"), para que
  // nunca quede mostrando un KPI que no está en la grilla filtrada.
  const cambiarCategoria = (grupoId) => {
    setGrupoActivo(grupoId);
    const conjunto = grupoId === TODOS_ID ? visibles : visibles.filter((i) => i.grupo === grupoId);
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
          <div className="page-sub">
            Período: <b style={{ color: "var(--text)" }}>{textoPeriodo(periodo)}</b>
          </div>
        </div>
        {/* Botones de descarga y, debajo, el estado de la última carga —
            a la altura del período. */}
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div className="page-head-actions">
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
          <EstadoServicio servicio={servicio} desglose={desglose} onReintentar={recargar} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <BarraFiltros rango={rango} setRango={setRango} filtros={filtros} setFiltros={setFiltros}
          cargando={cargando} onRecargar={recargar} tecnicos={tecnicos} ventana={ventana} />

        {servicio.estado === "error" ? (
          <div className="card empty">
            <Icon name="alert" />No hay indicadores para mostrar mientras el servicio no responda.
            <button type="button" className="btn btn-sm" onClick={recargar}>Reintentar</button>
          </div>
        ) : (
          <>
            <BotonesCategoria grupoActivo={grupoActivo} onCambiar={cambiarCategoria} indicadores={visibles} />

            <div>
              <div className="ind-grid">
                {delGrupo.map((i) => (
                  <TarjetaKPI key={i.id} ind={i} d={datos[i.id]} cargando={cargando}
                    activo={i.id === seleccionado} onSelect={setSeleccionado} />
                ))}
              </div>
            </div>

            <GraficoPrincipal ind={ind} d={datos[ind.id]} cargando={cargando} graficoRef={graficoRef} periodo={periodo} />
            <TablaTecnicos ind={ind} d={datos[ind.id]} cargando={cargando} tablaRef={tablaRef} periodo={periodo} />
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { DashboardAnalisisScreen });
