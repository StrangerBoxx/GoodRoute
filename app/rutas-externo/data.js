/* ============================================================
   Cliente del servicio de optimización — Planificación Diaria (HU-01/HU-09)
   ------------------------------------------------------------
   Backend real: https://optimizador-demo.onrender.com
   Contrato confirmado con el equipo de optimización (mensaje del
   30/09/2026, ampliado el 01/10/2026 con causa clasificada y el catálogo
   de configuración). Un solo backend sirve tanto los datos del panel
   (técnicos, OT) como la optimización en sí — ya no son dos
   servicios separados como antes.

   Circuito conectado por ahora (alcance "básico", HU-17):
     GET  /api/tecnicos                    lista de técnicos
     GET  /api/ordenes?estado=por_asignar  OT elegibles
     POST /api/optimizador/ejecutar        corre la optimización (causa
       clasificada real en diagnosticos[]: causa_principal/causas[]/
       precision_ubicacion — ya no hace falta parsear "razones")
     GET  /api/rutas?fecha=                consultar el registro (HU-18,
       de solo lectura por ahora — ver nota de aplicar_cambios más abajo)
     GET  /api/ruteo/geometria             trazado real por calle (mapa
       de "Asignaciones registradas") — devuelve coordenadas (vía OSRM),
       no una imagen; el mapa se dibuja con Leaflet en el frontend.
     GET  /api/optimizador/configuracion/parametros  catálogo de
       parámetros (HU-16) — la UI filtra ambito=="negocio"
     GET/PUT /api/optimizador/configuracion          leer/guardar esos
       parámetros (PUT solo con las claves a cambiar; fuera de rango 422)
     POST /api/optimizador/configuracion/restaurar   volver a los defaults

   Persistencia del plan confirmado (HU-18) — backend DISTINTO, del
   equipo de base de datos (confirmado el 01/10/2026):
     POST https://api-dummy-yurf.onrender.com/api/asignar-tecnicos
       Se llama una sola vez al confirmar el plan (onConfirmar), nunca al
       solo ejecutar el optimizador (eso sigue siendo una simulación
       descartable). Reemplaza la idea original de persistir vía
       aplicar_cambios:true en /ejecutar del optimizador — ese camino
       seguía bloqueado (volver a resolver podía no respetar las
       ediciones manuales); este endpoint recibe el plan YA armado
       (propuesto + final + qué se editó a mano), así que no hace falta
       volver a resolver nada.

   Deliberadamente NO conectado todavía (próxima etapa):
     POST    /api/simulacion/regenerar        regenerar datos de prueba
     GET     /api/metricas/resumen-diario     indicadores del día
     GET     /api/optimizador/modelo          declaración del modelo
       (catálogo de causas_no_asignacion — no se usa en la UI todavía,
       las causas llegan igual inline en el diagnóstico de cada OT)
   ============================================================ */
(function () {
  const API_BASE_URL = "https://optimizador-demo.onrender.com/api";

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
    };
  }

  /* Lista de técnicos para el panel de selección. Ya no se cruza contra
     /disponibilidad (el contrato actual la deja fuera de lo que usa la
     página — ver mensaje del equipo de optimización) ni se filtra por
     día: el backend resuelve disponibilidad por su cuenta al ejecutar. */
  async function obtenerTecnicos() {
    const tecnicos = await fetchJSON(`${API_BASE_URL}/tecnicos`);
    return tecnicos.map(construirTecnico);
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
    return {
      id: o.id,
      tipo: o.tipo,
      cliente: TIPO_OT_LABEL[o.tipo] || o.tipo,
      direccion: o.comuna ? `${o.direccion_instalacion}, ${o.comuna}` : o.direccion_instalacion,
      comuna: o.comuna,
      region: o.region,
      horaProgramada: o.hora_programada || null,
      ventanaInicio: o.hora_programada ? sumarMinutos(o.hora_programada, -30) : "08:00",
      ventanaFin: o.hora_programada ? sumarMinutos(o.hora_programada, 30) : "18:00",
    };
  }

  // "Elegible" = por_asignar, pedido directo al backend por query param
  // (antes había que traer todas las OT y filtrar acá — el filtro local
  // se mantiene como defensa por si el parámetro no se respeta).
  async function obtenerOtsPorAsignar() {
    const ordenes = await fetchJSON(`${API_BASE_URL}/ordenes?estado=por_asignar`);
    return ordenes
      .filter(o => o.estado === "por_asignar")
      .map(construirOt)
      // Se muestran ordenadas por ventana de atención (hora de inicio) —
      // si no, la lista se ve "desordenada" con horarios mezclados.
      .sort((a, b) => a.ventanaInicio.localeCompare(b.ventanaInicio));
  }

  // Ejecuta la optimización real (POST /api/optimizador/ejecutar).
  // aplicar_cambios se manda SIEMPRE explícito en false acá: esta llamada
  // es para generar la propuesta que se revisa/edita en pantalla, no para
  // persistirla (eso es "Confirmar plan" — ver onConfirmar() en
  // RutasExterno.jsx, todavía sin conectar: falta que el equipo del
  // optimizador defina cómo persistir el plan tal como queda editado acá,
  // sin volver a resolver desde cero). Mandarlo explícito importa: si la
  // planificadora deja "Aplicar asignaciones automáticamente" en true
  // desde el panel de configuración, esta llamada de solo-vista-previa NO
  // debe heredar ese default y aplicar cambios por sorpresa.
  // tiempo_limite_segundos sí se deja opcional: si no se pasa, el backend
  // lo calcula según la cantidad de OTs (comportamiento recomendado).
  async function ejecutarOptimizacion({ fecha, tecnicos, ordenes, tiempoLimiteSegundos }) {
    const body = { fecha, aplicar_cambios: false, tecnicos, ordenes };
    if (tiempoLimiteSegundos != null) body.tiempo_limite_segundos = tiempoLimiteSegundos;
    return postJSON(`${API_BASE_URL}/optimizador/ejecutar`, body);
  }

  // Consulta el registro real de asignaciones de un día (HU-18, criterio
  // "consultables desde la UI sin salir del asignador"). Solo lectura —
  // hoy siempre devuelve [] porque nunca se ejecutó con aplicar_cambios
  // en true, no porque el endpoint falle.
  async function obtenerRutasRegistradas(fecha) {
    return fetchJSON(`${API_BASE_URL}/rutas?fecha=${encodeURIComponent(fecha)}`);
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
  const ASIGNACIONES_API_BASE_URL = "https://api-dummy-yurf.onrender.com/api";

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

  async function confirmarAsignaciones(payload) {
    const res = await fetch(`${ASIGNACIONES_API_BASE_URL}/asignar-tecnicos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
  async function patchTecnicoOt(otId, tecnicoId, motivoReprogramacion, revisadoPor, tipoModificacion) {
    const res = await fetch(`${ASIGNACIONES_API_BASE_URL}/ordenes/${encodeURIComponent(otId)}/tecnico`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tecnico_id: tecnicoId,
        motivo_reprogramacion: motivoReprogramacion,
        revisado_por: revisadoPor,
        tipo_modificacion: tipoModificacion,
      }),
    });
    const data = await manejarRespuestaAsignaciones(res);
    if (data && data.guardado_en_bd === false) {
      throw new Error(`${otId} se actualizó pero no se pudo guardar en la base de datos.`);
    }
    return data;
  }

  window.RUTAS_EXTERNO_API = {
    API_BASE_URL, hoyISO, sumarDiasISO, fetchJSON,
    obtenerTecnicos, obtenerOtsPorAsignar,
    ejecutarOptimizacion, obtenerRutasRegistradas, obtenerGeometriaRuta,
    obtenerCatalogoParametros, obtenerConfiguracion, guardarConfiguracion, restaurarConfiguracion,
    confirmarAsignaciones, patchTecnicoOt,
    // Compartidos para reconstruir objetos ot/técnico a partir de la
    // respuesta de ejecutarOptimizacion (ver onOptimizar en RutasExterno.jsx).
    TIPO_OT_LABEL, sumarMinutos, colorPorId,
  };
})();
