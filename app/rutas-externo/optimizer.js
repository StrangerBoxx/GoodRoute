/* ============================================================
   Soporte de rutas — HU-03 (edición/re-validación de la propuesta)
   ------------------------------------------------------------
   Funciones puras, sin estado, sobre distancia real (haversine):
   re-validar una propuesta editada a mano y recalcular horas de
   llegada para mostrarlas en pantalla. El cálculo de la propuesta
   en sí (HU-02, asignación inicial OT↔técnico) ya no se hace acá
   — lo resuelve el servicio real de optimización (OR-Tools VRPTW,
   ver app/rutas-externo/data.js → optimizarRemoto()).
   ============================================================ */
(function () {
  const VELOCIDAD_KMH = 35;
  const SERVICIO_MIN = 20;
  const JORNADA_INICIO_MIN = 8 * 60; // 08:00

  function haversineKm(a, b) {
    const R = 6371;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  function minutosViaje(km) { return (km / VELOCIDAD_KMH) * 60; }
  // null si no hay dato (no tira "hhmm.split no es función") — pasa con
  // paradas reconstruidas desde el historial de confirmaciones del
  // backend (ver RutasExterno.jsx, el useEffect que rehidrata
  // `confirmados` con obtenerAsignacionesConfirmadasPorFecha): ese
  // registro no trae ventana horaria, solo hora programada.
  function hhmmAMin(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
  function minAHhmm(min) {
    const m = Math.max(0, Math.round(min));
    const h = Math.floor(m / 60) % 24;
    return String(h).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }

  /* ¿A qué hora llegaría `tecnico` (parado en `desde`, libre en `clockMin`) a `ot`,
     y es factible (cae dentro de su ventana)? Sin ventana conocida (ver
     hhmmAMin) no hay con qué evaluar feasibilidad — se asume factible en
     vez de bloquear toda la validación por un dato que no está. */
  function evaluarLlegada(desde, clockMin, ot) {
    const dist = haversineKm(desde, ot);
    const inicioMin = hhmmAMin(ot.ventanaInicio);
    const finMin = hhmmAMin(ot.ventanaFin);
    const llegadaBruta = clockMin + minutosViaje(dist);
    const llegada = inicioMin != null ? Math.max(llegadaBruta, inicioMin) : llegadaBruta;
    const factible = finMin != null ? llegada <= finMin : true;
    return { dist, llegada, factible };
  }

  /* (técnico, paradas en su orden actual) → [{ id, llegada, factible }, ...]
     Recalcula la hora de llegada estimada a cada parada siguiendo el orden
     real de la ruta (no la ventana genérica de la OT) — así, al reordenar
     o mover paradas a mano (HU-03), lo que se muestra en pantalla siempre
     queda ordenado cronológicamente según la ruta vigente. */
  function calcularLlegadas(tecnico, paradas) {
    let pos = { lat: tecnico.lat, lng: tecnico.lng };
    let clock = JORNADA_INICIO_MIN;
    return paradas.map(ot => {
      const r = evaluarLlegada(pos, clock, ot);
      pos = { lat: ot.lat, lng: ot.lng };
      clock = r.llegada + SERVICIO_MIN;
      return { id: ot.id, llegada: r.llegada, factible: r.factible };
    });
  }

  /* propuesta editada → { ok, duplicado, fueraDeVentana }
     - duplicado: razón si una OT quedó en más de un técnico (bug de
       integridad — esto sí bloquea la confirmación).
     - fueraDeVentana: lista de avisos de paradas que, con el orden actual
       de la ruta, llegarían fuera de su ventana programada. No bloquea —
       la coordinadora puede confirmar igual a sabiendas del riesgo (las
       distancias del optimizador remoto todavía son aproximadas). */
  function validarConfirmacion(porTecnico) {
    const vistos = new Set();
    let duplicado = null;
    const fueraDeVentana = [];
    for (const tecnicoId of Object.keys(porTecnico)) {
      const { tecnico, paradas } = porTecnico[tecnicoId];
      let pos = { lat: tecnico.lat, lng: tecnico.lng };
      let clock = JORNADA_INICIO_MIN;
      for (const ot of paradas) {
        if (vistos.has(ot.id)) {
          duplicado = `${ot.id} está asignada a más de un técnico.`;
        }
        vistos.add(ot.id);
        const r = evaluarLlegada(pos, clock, ot);
        if (!r.factible) {
          fueraDeVentana.push(`${ot.id} en la ruta de ${tecnico.nombre}: llegada estimada ${minAHhmm(r.llegada)}, fuera de la ventana ${ot.ventanaInicio}–${ot.ventanaFin}.`);
        }
        pos = { lat: ot.lat, lng: ot.lng };
        clock = r.llegada + SERVICIO_MIN;
      }
    }
    return { ok: !duplicado, duplicado, fueraDeVentana };
  }

  /* Recalcula hora de salida/retorno, km totales, espera total y
     capacidad de un técnico con datos REALES — a diferencia de todo lo
     de arriba (haversine + velocidad/servicio fijos, que es la
     aproximación que traía el optimizador local viejo): ruteo real por
     calle tramo a tramo (OSRM vía /ruteo/geometria — ese endpoint no
     desglosa un trazado de varios puntos en una sola llamada, por eso se
     pide un tramo a la vez) y la configuración real de negocio (jornada,
     duración de servicio por tipo de OT, capacidad — HU-16). Se usa para
     mantener el encabezado de la tarjeta al día cuando la coordinadora
     mueve/reordena/quita paradas a mano (HU-03), en vez de dejar los
     números de la corrida original ya desactualizados.
     `obtenerGeometriaRuta` se inyecta (viene de RUTAS_EXTERNO_API) para no
     duplicar acá la URL del backend. */
  // `violaciones` acá son las restricciones "obvias" que la coordinadora
  // pidió aplicar al editar a mano: capacidad máxima del técnico y que la
  // ruta no termine después del fin de jornada ni haga llegar una OT
  // después de su propia ventana. RutasExterno.jsx revierte la edición si
  // alguna de estas sale true — no es solo un aviso.
  function evaluarViolaciones(paradasActualizadas, capacidadMax, horaRetornoBaseMin, finJornadaMin) {
    const sobrecapacidad = paradasActualizadas.length > capacidadMax;
    const excedeJornada = horaRetornoBaseMin > finJornadaMin;
    const otsFueraDeVentana = paradasActualizadas.filter(p => hhmmAMin(p.horaEstimadaLlegada) > hhmmAMin(p.ventanaFin));
    return { hay: sobrecapacidad || excedeJornada || otsFueraDeVentana.length > 0, sobrecapacidad, excedeJornada, otsFueraDeVentana };
  }

  async function recalcularResumenRuta(tecnico, paradas, config, obtenerGeometriaRuta) {
    const capacidadMax = tecnico.tipo === "interno"
      ? (config?.capacidad_max_interno ?? 12)
      : (config?.capacidad_max_externo ?? 8);
    const jornadaInicioMin = (config?.inicio_jornada_horas ?? 8) * 60;
    const finJornadaMin = jornadaInicioMin + (config?.fin_jornada_minutos ?? 600);

    if (paradas.length === 0) {
      return {
        paradas: [],
        resumen: { horaSalidaBase: null, horaRetornoBase: null, distanciaTotalKm: 0, esperaTotalMin: 0, capacidadUso: `0/${capacidadMax}` },
        violaciones: { hay: false, sobrecapacidad: false, excedeJornada: false, otsFueraDeVentana: [] },
      };
    }

    const tiemposServicio = config?.tiempos_servicio_por_tipo || {};
    const servicioDefault = config?.tiempo_servicio_default ?? 30;

    const puntos = [
      { lat: tecnico.lat, lng: tecnico.lng },
      ...paradas.map(p => ({ lat: p.lat, lng: p.lng })),
      { lat: tecnico.lat, lng: tecnico.lng },
    ];
    // Un tramo por par consecutivo de puntos, todos en paralelo (no
    // dependen uno del otro) para no sumar latencia de red por cada
    // parada de la ruta.
    const legsRaw = await Promise.all(
      Array.from({ length: puntos.length - 1 }, (_, i) => obtenerGeometriaRuta([puntos[i], puntos[i + 1]]))
    );
    const legs = legsRaw.map(geo => ({ km: (geo.distancia_metros || 0) / 1000, min: (geo.duracion_segundos || 0) / 60 }));

    let clock = jornadaInicioMin;
    let distanciaTotalKm = 0;
    let esperaTotalMin = 0;
    const paradasActualizadas = paradas.map((p, i) => {
      const leg = legs[i];
      distanciaTotalKm += leg.km;
      clock += leg.min;
      const ventanaInicioMin = hhmmAMin(p.ventanaInicio);
      let espera = 0;
      if (clock < ventanaInicioMin) { espera = ventanaInicioMin - clock; clock = ventanaInicioMin; }
      const horaEstimadaLlegada = minAHhmm(clock);
      const tiempoServicio = tiemposServicio[p.tipo] ?? servicioDefault;
      clock += tiempoServicio;
      esperaTotalMin += espera;
      return { ...p, horaEstimadaLlegada, esperaMin: Math.round(espera) };
    });
    const legVuelta = legs[legs.length - 1];
    distanciaTotalKm += legVuelta.km;
    clock += legVuelta.min;

    const resumen = {
      horaSalidaBase: minAHhmm(jornadaInicioMin),
      horaRetornoBase: minAHhmm(clock),
      distanciaTotalKm,
      esperaTotalMin: Math.round(esperaTotalMin),
      capacidadUso: `${paradas.length}/${capacidadMax}`,
    };
    return { paradas: paradasActualizadas, resumen, violaciones: evaluarViolaciones(paradasActualizadas, capacidadMax, clock, finJornadaMin) };
  }

  window.RUTAS_EXTERNO_OPTIMIZER = { validarConfirmacion, calcularLlegadas, haversineKm, minAHhmm, recalcularResumenRuta };
})();
