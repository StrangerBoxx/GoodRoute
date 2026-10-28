/* ============================================================
   Cliente del servicio de optimización — Planificación Diaria (HU-01/HU-09)
   ------------------------------------------------------------
   Backend real: https://optimizador-demo.onrender.com
   Contrato confirmado con el equipo de optimización (mensaje del
   30/09/2026, ampliado el 01/10/2026 con causa clasificada y el catálogo
   de configuración). Un solo backend sirve tanto los datos del panel
   (técnicos, OT) como la optimización en sí — ya no son dos
   servicios separados como antes.

   27/10/2026: el equipo de BD reemplazó api-dummy-yurf por GoodRoute
   (https://goodroute-backend.onrender.com) — es la fuente de verdad de
   técnicos y OT (camelCase) y donde se persiste la confirmación. El
   optimizador tiene su PROPIO set de técnicos/OT (otros ids), así que ya
   no se leen de ahí: se cargan de GoodRoute y se le mandan al optimizador
   en el body de /ejecutar (técnicos y órdenes explícitos), que solo
   propone rutas. Ver GOODROUTE_API_BASE_URL más abajo.

   Del optimizador se usa:
     POST /api/optimizador/ejecutar        corre la optimización (causa
       clasificada real en diagnosticos[]: causa_principal/causas[]/
       precision_ubicacion — ya no hace falta parsear "razones")
     GET  /api/ruteo/geometria             trazado real por calle (mapa
       de "Asignaciones registradas") — devuelve coordenadas (vía OSRM),
       no una imagen; el mapa se dibuja con Leaflet en el frontend.
     GET  /api/optimizador/configuracion/parametros  catálogo de
       parámetros (HU-16) — la UI filtra ambito=="negocio"
     GET/PUT /api/optimizador/configuracion          leer/guardar esos
       parámetros (PUT solo con las claves a cambiar; fuera de rango 422)
     POST /api/optimizador/configuracion/restaurar   volver a los defaults

   GoodRoute (equipo de BD, desde el 27/10/2026):
     GET   /api/v1/tecnicos                         técnicos
     GET   /api/v1/ordenes?estado=porAsignar        OT elegibles
     GET   /api/v1/ordenes                          todas (para "Rutas confirmadas")
     PATCH /api/v1/ordenes/{id}/asignar-tecnico     reprogramar/descartar una OT
     POST  /api/asignar-tecnicos                    confirmar el plan completo
   (lo que sigue es la historia de cómo se llegó a este circuito, con el
   backend anterior):
     POST https://api-dummy-yurf.onrender.com/api/asignar-tecnicos
       Se llama una sola vez al confirmar el plan (onConfirmar), nunca al
       solo ejecutar el optimizador (eso sigue siendo una simulación
       descartable). Reemplaza la idea original de persistir vía
       aplicar_cambios:true en /ejecutar del optimizador — ese camino
       seguía bloqueado (volver a resolver podía no respetar las
       ediciones manuales); este endpoint recibe el plan YA armado
       (propuesto + final + qué se editó a mano), así que no hace falta
       volver a resolver nada.
     GET /api/ordenes + GET /api/tecnicos (mismo backend de arriba)
       "Rutas confirmadas" (HU-18, consultar sin salir del asignador) se
       reconstruye cruzando estos dos — este backend no tiene todavía un
       GET dedicado para listar asignaciones por fecha (ver
       obtenerRutasRegistradas más abajo, con el detalle del bug real que
       tenía esto hasta el 04/10/2026: pegaba contra el /api/rutas del
       OTRO backend, el del optimizador, que nunca refleja lo confirmado
       acá).

   Deliberadamente NO conectado todavía (próxima etapa):
     POST    /api/simulacion/regenerar        regenerar datos de prueba
     GET     /api/metricas/resumen-diario     indicadores del día
     GET     /api/optimizador/modelo          declaración del modelo
       (catálogo de causas_no_asignacion — no se usa en la UI todavía,
       las causas llegan igual inline en el diagnóstico de cada OT)
   ============================================================ */
(function () {
  const API_BASE_URL = "https://optimizador-demo.onrender.com/api";
  // Técnicos, OT y persistencia de asignaciones (equipo de BD).
  const GOODROUTE_API_BASE_URL = "https://goodroute-backend.onrender.com/api";

  // GoodRoute entrega el tipo de OT en camelCase ("instalacionSimple") y el
  // optimizador lo exige en snake_case ("instalacion_simple") — si le llega
  // en camelCase no falla, pero no lo reconoce y usa la duración de
  // servicio por defecto (30 min en vez de 45 para una instalación simple,
  // verificado contra el endpoint real). Adentro de la app se usa siempre
  // snake_case (igual que el optimizador y TIPO_OT_LABEL); al persistir en
  // GoodRoute se vuelve a camelCase, que es su propio vocabulario.
  // GoodRoute entrega fechaProgramada + horaProgramada en UTC (modelo v3.0
  // del backoffice). El optimizador trabaja en hora de Chile (su jornada
  // es 08:00–18:00 local): verificado el 27/10/2026, mandándole las horas
  // UTC dejaba 6 de 18 OT fuera de jornada; convertidas, 2 de 18. Toda la
  // app usa hora de Chile — la conversión se hace una sola vez, al leer.
  const TZ_CHILE = "America/Santiago";
  const formatoChile = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_CHILE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  function aHoraChile(fechaUTC, horaUTC) {
    if (!fechaUTC || !horaUTC) return { fecha: fechaUTC || null, hora: null };
    const [y, m, d] = fechaUTC.split("-").map(Number);
    const [h, mi] = horaUTC.split(":").map(Number);
    const partes = Object.fromEntries(formatoChile.formatToParts(new Date(Date.UTC(y, m - 1, d, h, mi))).map(x => [x.type, x.value]));
    return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
  }

  const tipoDesdeGoodRoute = (tipo) => (tipo || "").replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
  const tipoParaGoodRoute = (tipo) => (tipo || "").replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  // toISOString() convierte a UTC, lo que adelanta la fecha un día en
  // horario de tarde/noche en Chile (UTC-3/-4) — se arma el ISO a mano
  // con las partes de la fecha LOCAL para que "hoy" siempre sea hoy.
  function fechaLocalISO(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  function hoyISO() {
    return fechaLocalISO(new Date());
  }
  function sumarDiasISO(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return fechaLocalISO(d);
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
    return res.json();
  }
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
    return res.json();
  }

  // Misma paleta usada para técnicos/usuarios en el resto del backoffice
  // (ver CP_DATA.technicians en app/data.js) — este backend no entrega
  // color, así que se asigna por id para que la foto de perfil se vea
  // igual que en el resto de las pantallas.
  const AVATAR_PALETTE = ["#033E84", "#0f766e", "#b45309", "#7c3aed", "#be185d", "#0369a1"];
  function colorPorId(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  }

  function construirTecnico(t) {
    return {
      id: t.id,
      nombre: `${t.nombre} ${t.apellidos}`,
      zona: t.zona,
      region: t.region,
      tipo: t.tipo,
      color: colorPorId(t.id),
      // 7 booleanos, de lunes a domingo (GoodRoute). Como el optimizador
      // recibe los técnicos en el body, los asume disponibles: el filtro
      // por día lo hace RutasExterno.jsx (ver disponibleEn).
      disponibilidad: Array.isArray(t.disponibilidad) ? t.disponibilidad : null,
      activo: t.activo !== false,
    };
  }

  /* Lista de técnicos para el panel de selección. Ya no se cruza contra
     /disponibilidad del optimizador: la disponibilidad por día viene en
     cada técnico de GoodRoute y se aplica en la pantalla, según el día
     elegido (ver disponibleEn en RutasExterno.jsx). */
  async function obtenerTecnicos() {
    const tecnicos = await fetchJSON(`${GOODROUTE_API_BASE_URL}/v1/tecnicos`);
    return tecnicos.filter(t => t.activo !== false).map(construirTecnico);
  }

  const TIPO_OT_LABEL = {
    instalacion_simple: "Instalación simple",
    instalacion_con_corte: "Instalación con corte",
    mantencion: "Mantención",
    retiro: "Retiro",
  };

  function sumarMinutos(hhmm, minutos) {
    const [h, m] = hhmm.split(":").map(Number);
    const total = h * 60 + m + minutos;
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  }

  // El backend entrega dirección y comuna por separado; para mandarla de
  // vuelta al ejecutar la optimización se concatenan en un solo texto
  // ("<calle>, <comuna>") — así es como geocodifica bien (confirmado
  // probando el endpoint real: con eso arma coordenadas a nivel de calle).
  function construirOt(o) {
    const tipo = tipoDesdeGoodRoute(o.tipo);
    const local = aHoraChile(o.fechaProgramada, o.horaProgramada);
    return {
      id: o.id,
      tipo,
      cliente: TIPO_OT_LABEL[tipo] || tipo,
      direccion: o.comuna ? `${o.direccionInstalacion}, ${o.comuna}` : o.direccionInstalacion,
      comuna: o.comuna,
      region: o.region,
      // Día para el que está programada esta OT (puede venir null = sin
      // día asignado todavía) — antes no se usaba para nada, la pantalla
      // mostraba las mismas OT sin importar la fecha elegida en el
      // selector (ver el comentario de más abajo, en el efecto que carga
      // técnicos/OT). Ahora sí filtra por día (ver RutasExterno.jsx).
      // En hora de Chile (ver aHoraChile).
      fechaProgramada: local.fecha,
      horaProgramada: local.hora,
      ventanaInicio: local.hora ? sumarMinutos(local.hora, -30) : "08:00",
      ventanaFin: local.hora ? sumarMinutos(local.hora, 30) : "18:00",
    };
  }

  // "Elegible" = por_asignar, pedido directo al backend por query param
  // (antes había que traer todas las OT y filtrar acá — el filtro local
  // se mantiene como defensa por si el parámetro no se respeta).
  async function obtenerOtsPorAsignar() {
    const ordenes = await fetchJSON(`${GOODROUTE_API_BASE_URL}/v1/ordenes?estado=porAsignar`);
    return ordenes
      .filter(o => o.estado === "porAsignar")
      .map(construirOt)
      // Se muestran ordenadas por ventana de atención (hora de inicio) —
      // si no, la lista se ve "desordenada" con horarios mezclados.
      .sort((a, b) => a.ventanaInicio.localeCompare(b.ventanaInicio));
  }

  // Ejecuta la optimización real (POST /api/optimizador/ejecutar). Desde
  // la v3.0.0 del optimizador ya NO existe aplicar_cambios (responde 422
  // si se manda): solo propone rutas, y la asignación la persiste
  // GoodRoute recién al confirmar (ver confirmarAsignaciones).
  // tiempo_limite_segundos se deja opcional: si no se pasa, el backend
  // lo calcula según la cantidad de OTs (comportamiento recomendado).
  async function ejecutarOptimizacion({ fecha, tecnicos, ordenes, tiempoLimiteSegundos }) {
    const body = { fecha, tecnicos, ordenes };
    if (tiempoLimiteSegundos != null) body.tiempo_limite_segundos = tiempoLimiteSegundos;
    return postJSON(`${API_BASE_URL}/optimizador/ejecutar`, body);
  }

  // Consulta el registro real de asignaciones de un día (HU-18, criterio
  // "consultables desde la UI sin salir del asignador").
  //
  // BUG encontrado el 04/10/2026: esto pegaba contra GET /api/rutas del
  // backend del OPTIMIZADOR (API_BASE_URL, optimizador-demo) — ese
  // endpoint refleja el estado en memoria de la ÚLTIMA corrida ejecutada
  // con aplicar_cambios:true en /ejecutar, algo que este frontend NUNCA
  // hace a propósito (ejecutarOptimizacion más arriba manda ese flag
  // siempre en false: la corrida de /ejecutar es una vista previa
  // descartable, lo que persiste de verdad es el POST /asignar-tecnicos
  // de más abajo, a un backend DISTINTO). Probado contra el endpoint
  // real: con ese flag siempre en false, /api/rutas devuelve todos los
  // técnicos con paradas:[] para SIEMPRE — no tenía ninguna relación con
  // lo que se confirmaba acá. Por eso "Rutas confirmadas" nunca mostraba
  // nada real (ni siquiera recién confirmado, en la misma sesión); lo
  // único que daba la sensación de que "a veces funcionaba" era el
  // listado de confirmados en sessionStorage (RutasExterno.jsx,
  // RX_KEYS.confirmados), que se pierde al cerrar la pestaña/el
  // navegador — de ahí "solo si sigo el flujo, al cerrar y abrir se
  // pierde".
  //
  // El backend de persistencia real (ASIGNACIONES_API_BASE_URL,
  // api-dummy-yurf) sí guarda bien el tecnico_id de cada OT al confirmar
  // (POST /asignar-tecnicos) y al reprogramar (PATCH
  // /ordenes/{id}/tecnico) — verificado contra su propio GET /api/ordenes,
  // que muestra el tecnico_id ya persistido. Lo que no tiene todavía es
  // un GET dedicado para listar asignaciones por fecha, así que se
  // reconstruye acá cruzando /api/ordenes (filtradas por fecha_programada
  // y con tecnico_id asignado) con /api/tecnicos de ESE mismo backend.
  // Nota: esas OT no traen latitud/longitud ni la base del técnico, así
  // que "Ver en mapa" en el registro queda sin datos para trazar hasta
  // que el equipo de BD agregue esos campos o un endpoint propio — se
  // avisa solo, ya maneja el caso de "no hay puntos" (ver verEnMapa en
  // RutasExterno.jsx), no se cae.
  // Agrupa TODAS las OT con técnico asignado por fecha_programada y
  // luego por técnico — un solo fetch sirve tanto para consultar un día
  // puntual (obtenerRutasRegistradas) como para descubrir TODAS las
  // fechas que tienen algo confirmado, sin tener que adivinarlas ni
  // pedir fecha por fecha (ver obtenerAsignacionesConfirmadasPorFecha,
  // usada para rehidratar el banner "Rutas confirmadas" de cada día al
  // abrir la pantalla).
  // Desde el 27/10/2026 sale de GoodRoute (camelCase): mismo criterio,
  // OT con tecnicoId y fechaProgramada.
  async function agruparAsignacionesConfirmadas() {
    const [ordenes, tecnicos] = await Promise.all([
      fetchJSON(`${GOODROUTE_API_BASE_URL}/v1/ordenes`),
      fetchJSON(`${GOODROUTE_API_BASE_URL}/v1/tecnicos`),
    ]);
    const tecnicoPorId = Object.fromEntries(tecnicos.map(t => [t.id, t]));
    const porFecha = {};
    ordenes
      .filter(o => o.tecnicoId && o.fechaProgramada)
      .forEach(o => {
        const local = aHoraChile(o.fechaProgramada, o.horaProgramada);
        const porTecnico = porFecha[local.fecha] || (porFecha[local.fecha] = {});
        if (!porTecnico[o.tecnicoId]) {
          const t = tecnicoPorId[o.tecnicoId];
          porTecnico[o.tecnicoId] = {
            tecnico_id: o.tecnicoId,
            nombre: t ? `${t.nombre} ${t.apellidos}` : o.tecnicoId,
            zona: t ? t.zona : null,
            tipo: t ? t.tipo : null,
            paradas: [],
          };
        }
        porTecnico[o.tecnicoId].paradas.push({
          ot_id: o.id,
          tipo: tipoDesdeGoodRoute(o.tipo),
          direccion: o.comuna ? `${o.direccionInstalacion}, ${o.comuna}` : o.direccionInstalacion,
          hora_programada: local.hora,
        });
      });
    const resultado = {};
    Object.entries(porFecha).forEach(([fecha, porTecnico]) => {
      // No hay un "orden de ruta" guardado en este backend — se muestran
      // ordenadas por hora programada, nada más (esto es solo lectura).
      Object.values(porTecnico).forEach(r => r.paradas.sort((a, b) => (a.hora_programada || "").localeCompare(b.hora_programada || "")));
      resultado[fecha] = Object.values(porTecnico);
    });
    return resultado;
  }

  // KPI del catálogo HU-24 para un RANGO de fechas (GET /api/kpis/rango,
  // máx. 93 días) en una sola llamada — reemplaza pedir /api/kpis fecha por
  // fecha (eran ~500 llamadas para la ventana del dashboard). `kpis` es una
  // lista plana { sigla, fecha, tecnico_id, numerador, denominador, valor }:
  // sin opciones, solo filas globales (tecnico_id null); con
  // porTecnico:true, además una fila por fecha y técnico para OTA, OTR,
  // OTX, TTR, TPS y TAR (OTP y TPL existen solo en global). Si la BD falla,
  // OTA/OTR/TAR/TPL vienen en `errores` y el resto se devuelve igual.
  async function obtenerKpisRango(fechaDesde, fechaHasta, { porTecnico = false } = {}) {
    const q = new URLSearchParams({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta });
    if (porTecnico) q.set("por_tecnico", "true");
    const url = `${GOODROUTE_API_BASE_URL}/kpis/rango?${q}`;
    const res = await fetch(url);
    if (res.status === 404) throw new Error("GoodRoute todavía no tiene /api/kpis/rango desplegado");
    if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
    return res.json();
  }

  async function obtenerRutasRegistradas(fecha) {
    const porFecha = await agruparAsignacionesConfirmadas();
    return porFecha[fecha] || [];
  }

  // Todas las fechas con algo confirmado de una vez — { "2026-10-05": [...
  // rutas], "2026-10-06": [...] } — para que el banner "Rutas confirmadas"
  // de CADA día que corresponda reaparezca al abrir la pantalla, no solo
  // el de la fecha que esté elegida en el selector en ese momento.
  async function obtenerAsignacionesConfirmadasPorFecha() {
    return agruparAsignacionesConfirmadas();
  }

  // Trazado real por calle de una ruta (OSRM), para dibujarla en el mapa
  // de "Asignaciones registradas". Devuelve { coordenadas: [[lat,lng], ...],
  // distancia_metros, duracion_segundos } — no una imagen, el dibujo lo
  // hace Leaflet en el frontend con esto.
  // `puntos` es [{lat, lng}, ...] en el orden que se recorren (típicamente
  // base del técnico, luego cada parada en secuencia) — el endpoint pide
  // "lon,lat;lon,lat;..." (invertido respecto al orden en que se guarda acá).
  async function obtenerGeometriaRuta(puntos) {
    const coordenadas = puntos.map(p => `${p.lng},${p.lat}`).join(";");
    return fetchJSON(`${API_BASE_URL}/ruteo/geometria?coordenadas=${encodeURIComponent(coordenadas)}`);
  }

  // Catálogo de parámetros configurables (HU-16): de qué consta el panel
  // de configuración de negocio. Se filtra por ambito=="negocio" en la UI
  // — ambito solver/servicio son del equipo técnico, no se muestran acá.
  async function obtenerCatalogoParametros() {
    return fetchJSON(`${API_BASE_URL}/optimizador/configuracion/parametros`);
  }

  // Valores vigentes de TODOS los parámetros (negocio + solver + servicio)
  // — la UI solo edita las claves de ambito=="negocio", pero necesita el
  // mapa completo para no perder de vista las demás.
  async function obtenerConfiguracion() {
    return fetchJSON(`${API_BASE_URL}/optimizador/configuracion`);
  }

  // PUT solo con las claves que cambiaron (no hace falta mandar todo el
  // objeto). Fuera de rango responde 422 con el detalle de qué clave falló
  // — se intenta extraer ese detalle para mostrarlo en vez de "422" a secas.
  async function guardarConfiguracion(cambios) {
    const res = await fetch(`${API_BASE_URL}/optimizador/configuracion`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    if (!res.ok) {
      let detalle = `respondió ${res.status}`;
      try {
        const data = await res.json();
        if (typeof data.detail === "string") detalle = data.detail;
        else if (Array.isArray(data.detail)) detalle = data.detail.map(d => `${(d.loc || []).join(".")}: ${d.msg}`).join("; ");
      } catch {}
      throw new Error(detalle);
    }
    return res.json();
  }

  // Vuelve todos los parámetros a su valor por defecto. La configuración
  // vive en memoria del lado del servicio — se pierde igual al reiniciar.
  async function restaurarConfiguracion() {
    return postJSON(`${API_BASE_URL}/optimizador/configuracion/restaurar`, {});
  }

  /* ----------------------------------------------------------
     Persistencia del plan confirmado (HU-18) — backend DISTINTO: el del
     equipo de base de datos (confirmado por ellos el 01/10/2026), no el
     optimizador. Contrato verificado contra su /openapi.json — coincide
     con el schema que les pasamos (AsignarTecnicosRequest/RutaTecnico/
     ParadaRuta/ResumenCorrida/RevisadoPor).

     Dos caminos, según el momento:
       - Primera confirmación de un plan (recién salido del optimizador):
         POST /asignar-tecnicos con el plan COMPLETO (ver confirmarAsignaciones).
       - Reprogramación (se reabre un plan YA confirmado y se mueve/saca
         alguna OT): mandar el plan completo de nuevo duplicaría/pisaría
         sin motivo las OT que no se tocaron — en vez de eso, se llama
         PATCH /ordenes/{id}/tecnico UNA VEZ POR CADA OT que cambió (ver
         patchTecnicoOt), cada una con su propio motivo_reprogramacion.
         Probado contra el backend real: acepta campos extra sin
         problema (motivo_reprogramacion no está en su schema todavía,
         lo ignora hasta que lo agreguen) y persiste tecnico_id/estado.
     ---------------------------------------------------------- */
  // 27/10/2026: el POST y el PATCH van a GoodRoute (reemplaza a
  // api-dummy-yurf). Su contrato ya declara inicio_planificacion y
  // kilometraje_estimado (HU-30) en ambos.
  const ASIGNACIONES_API_BASE_URL = GOODROUTE_API_BASE_URL;

  async function manejarRespuestaAsignaciones(res) {
    if (!res.ok) {
      let detalle = `respondió ${res.status}`;
      try {
        const data = await res.json();
        if (typeof data.detail === "string") detalle = data.detail;
        else if (Array.isArray(data.detail)) detalle = data.detail.map(d => `${(d.loc || []).join(".")}: ${d.msg}`).join("; ");
      } catch {}
      throw new Error(detalle);
    }
    return res.json();
  }

  // GoodRoute aplica el plan con "estrategia parcial": lo válido se guarda
  // y los errores se reportan sin frenar el resto. Respuesta documentada:
  // total_recibidas, total_actualizadas, actualizadas[], errores[{ot_id,
  // error}] y base_de_datos{insertados, error} — RutasExterno.jsx avisa
  // ambos tipos de error. El tipo de OT se devuelve a camelCase, el
  // vocabulario de GoodRoute.
  async function confirmarAsignaciones(payload) {
    const cuerpo = {
      ...payload,
      rutas: payload.rutas.map(r => ({ ...r, paradas: r.paradas.map(p => ({ ...p, tipo: tipoParaGoodRoute(p.tipo) })) })),
      pendientes: (payload.pendientes || []).map(p => ({ ...p, tipo: tipoParaGoodRoute(p.tipo) })),
    };
    const res = await fetch(`${ASIGNACIONES_API_BASE_URL}/asignar-tecnicos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    return manejarRespuestaAsignaciones(res);
  }

  // Reprogramación de UNA OT puntual (HU-18) — no manda el plan entero,
  // solo la OT que cambió de técnico, con su propio motivo. El endpoint
  // ahora persiste en Postgres (02/10/2026, antes solo actualizaba en
  // memoria) y confirma con "guardado_en_bd" en la respuesta — si por lo
  // que sea volviera a venir en false, se trata como error en vez de
  // darlo por guardado solo porque el HTTP fue 200.
  //
  // `revisado_por` (el dispatcher/coordinador de turno que hizo la
  // reprogramación) y `tipo_modificacion` (qué le pasó a esta OT puntual:
  // "OT asignada a otro técnico" | "OT reordenada" | "OT descartada") se
  // mandan con la misma forma/vocabulario que ya usa el POST del plan
  // completo — hoy el schema de este PATCH no los tiene declarados (solo
  // tecnico_id/motivo_reprogramacion), así que de momento el backend los
  // va a ignorar hasta que los agreguen de su lado. Se mandan igual para
  // no tener que volver a tocar el frontend cuando los sumen.
  //
  // En GoodRoute el endpoint es /v1/ordenes/{id}/asignar-tecnico y ya
  // declara revisado_por/tipo_modificacion, además de
  // inicio_planificacion y kilometraje_estimado (HU-30), que ahora se
  // mandan también al reprogramar.
  async function patchTecnicoOt(otId, tecnicoId, motivoReprogramacion, revisadoPor, tipoModificacion, inicioPlanificacion, kilometrajeEstimado) {
    const res = await fetch(`${ASIGNACIONES_API_BASE_URL}/v1/ordenes/${encodeURIComponent(otId)}/asignar-tecnico`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tecnico_id: tecnicoId,
        // Edición manual, no propuesta del optimizador: GoodRoute la guarda
        // con id_propuesta NULL (y no cuenta para TAR). Se manda explícito.
        id_propuesta: null,
        motivo_reprogramacion: motivoReprogramacion,
        revisado_por: revisadoPor,
        tipo_modificacion: tipoModificacion,
        inicio_planificacion: inicioPlanificacion ?? null,
        kilometraje_estimado: kilometrajeEstimado ?? null,
      }),
    });
    const data = await manejarRespuestaAsignaciones(res);
    if (data && data.guardado_en_bd === false) {
      throw new Error(`${otId} se actualizó pero no se pudo guardar en la base de datos${data.db_error ? ` (${data.db_error})` : ""}.`);
    }
    return data;
  }

  window.RUTAS_EXTERNO_API = {
    API_BASE_URL, hoyISO, sumarDiasISO, fetchJSON,
    obtenerTecnicos, obtenerOtsPorAsignar,
    ejecutarOptimizacion, obtenerRutasRegistradas, obtenerAsignacionesConfirmadasPorFecha, obtenerGeometriaRuta,
    obtenerKpisRango,
    obtenerCatalogoParametros, obtenerConfiguracion, guardarConfiguracion, restaurarConfiguracion,
    confirmarAsignaciones, patchTecnicoOt,
    // Compartidos para reconstruir objetos ot/técnico a partir de la
    // respuesta de ejecutarOptimizacion (ver onOptimizar en RutasExterno.jsx).
    TIPO_OT_LABEL, sumarMinutos, colorPorId,
  };
})();
