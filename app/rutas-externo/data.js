/* ============================================================
   Cliente del servicio de optimización — Planificación Diaria (HU-01/HU-09)
   ------------------------------------------------------------
   Backend real: https://optimizador-demo.onrender.com
   Contrato confirmado con el equipo de optimización (mensaje del
   30/09/2026). Un solo backend sirve tanto los datos del panel
   (técnicos, OT) como la optimización en sí — ya no son dos
   servicios separados como antes.

   Circuito conectado por ahora (alcance "básico", HU-17):
     GET  /api/tecnicos                    lista de técnicos
     GET  /api/ordenes?estado=por_asignar  OT elegibles
     POST /api/optimizador/ejecutar        corre la optimización
     GET  /api/rutas?fecha=                consultar el registro (HU-18,
       de solo lectura por ahora — ver nota de aplicar_cambios más abajo)

   Deliberadamente NO conectado todavía (próxima etapa):
     GET/PUT /api/optimizador/configuracion   panel de parámetros (HU-16:
       falta que el equipo del optimizador documente cuáles son de la
       operación del cliente y cuáles son supuestos internos del solver)
     POST    /api/optimizador/configuracion/restaurar
     POST    /api/simulacion/regenerar        regenerar datos de prueba
     GET     /api/metricas/resumen-diario     indicadores del día
     GET     /api/ruteo/geometria             trazado por calles (mapa)
     GET     /api/optimizador/pendientes      (alternativa a los
       diagnósticos que ya vienen inline en la respuesta de ejecutar)
     PATCH   /ordenes/{id}/tecnico, PATCH /ordenes/asignaciones-masivas,
       aplicar_cambios:true en /ejecutar — la escritura real del registro
       (HU-18, criterio de persistir con ajustes manuales incluidos).
       Sin probar: son escrituras sobre el backend compartido, no algo
       para disparar sin avisar primero.
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
  // aplicar_cambios queda siempre en false por ahora: "Confirmar plan" en
  // esta pantalla todavía guarda el resultado solo en sessionStorage, no
  // escribe de vuelta en el backend — ver comentario en onConfirmar()
  // dentro de RutasExterno.jsx sobre por qué eso queda para otra etapa.
  async function ejecutarOptimizacion({ fecha, tecnicos, ordenes, tiempoLimiteSegundos = 10 }) {
    return postJSON(`${API_BASE_URL}/optimizador/ejecutar`, {
      fecha,
      aplicar_cambios: false,
      tiempo_limite_segundos: tiempoLimiteSegundos,
      tecnicos,
      ordenes,
    });
  }

  // Consulta el registro real de asignaciones de un día (HU-18, criterio
  // "consultables desde la UI sin salir del asignador"). Solo lectura —
  // hoy siempre devuelve [] porque nunca se ejecutó con aplicar_cambios
  // en true, no porque el endpoint falle.
  async function obtenerRutasRegistradas(fecha) {
    return fetchJSON(`${API_BASE_URL}/rutas?fecha=${encodeURIComponent(fecha)}`);
  }

  window.RUTAS_EXTERNO_API = {
    API_BASE_URL, hoyISO, sumarDiasISO, fetchJSON,
    obtenerTecnicos, obtenerOtsPorAsignar,
    ejecutarOptimizacion, obtenerRutasRegistradas,
    // Compartidos para reconstruir objetos ot/técnico a partir de la
    // respuesta de ejecutarOptimizacion (ver onOptimizar en RutasExterno.jsx).
    TIPO_OT_LABEL, sumarMinutos, colorPorId,
  };
})();
