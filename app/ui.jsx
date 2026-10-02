/* ============ Shared UI primitives + helpers ============ */
const { useState, useEffect, useLayoutEffect, useRef, useMemo } = React;

/* ---- Icon set (functional line icons) ---- */
const ICONS = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  orders: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9h6m-6 4h4",
  techs: "M17 20h5v-1a4 4 0 0 0-3-3.87M9 20H4v-1a4 4 0 0 1 3-3.87m6-1.13a4 4 0 1 0-4 0M15.5 7.5a3 3 0 1 1 0 .01",
  install: "M12 2a9 9 0 0 0-9 9c0 6 9 11 9 11s9-5 9-11a9 9 0 0 0-9-9zm0 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  search: "M21 21l-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z",
  menu: "M3 6h18M3 12h18M3 18h18",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  chevR: "M9 18l6-6-6-6",
  chevD: "M6 9l6 6 6-6",
  arrowR: "M5 12h14M12 5l7 7-7 7",
  arrowL: "M19 12H5M12 19l-7-7 7-7",
  alert: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  check: "M20 6L9 17l-5-5",
  checkC: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3",
  plus: "M12 5v14M5 12h14",
  x: "M18 6L6 18M6 6l12 12",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  pin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10a3 3 0 1 0 0-.01",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  signal: "M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16",
  wifiOff: "M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01",
  sign: "M3 21h18M5 17l3.5-3.5M12 3l4 4-7 7-4 1 1-4 6-8zM14 5l4 4",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
  userPlus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  building: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  money: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  cpu: "M4 4h16v16H4zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  cloud: "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  arrowUpRight: "M7 7h10v10M7 17L17 7",
  arrowDownRight: "M7 7v10h10M7 7l10 10",
  minus: "M5 12h14",
  arrowUpDown: "M21 16l-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
};
function Icon({ name, style }) {
  const d = ICONS[name] || "";
  const paths = d.split(" M").map((p, i) => (i === 0 ? p : "M" + p));
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

/* ---- Avatar ---- */
function Avatar({ t, size = "md", name, color }) {
  const init = t ? CP_DATA.tinit(t) : (name || "?");
  const bg = (t && t.color) || color || "#7a8794";
  return <div className={"avatar " + size} style={{ background: bg }}>{init}</div>;
}

/* ---- Badge ---- */
function Badge({ cls, dot = true, pulse, icon, children }) {
  return (
    <span className={"badge " + cls + (pulse ? " pulse" : "")}>
      {icon ? <Icon name={icon} /> : (dot ? <span className="bdot" /> : null)}
      {children}
    </span>
  );
}

/* ---- OT estado meta ---- */
const OT_ESTADOS = {
  por_revisar:            { label: "Por revisar", cls: "b-gray" },
  por_asignar:            { label: "Por asignar", cls: "b-amber" },
  enviada_planificacion:  { label: "Enviada a planificación", cls: "b-slate" },
  asignacion_por_confirmar:{ label: "Asignación por confirmar", cls: "b-violet" },
  asignada:               { label: "Asignada", cls: "b-blue" },
  en_terreno:             { label: "En terreno", cls: "b-orange" },
  finalizada:             { label: "Finalizada", cls: "b-green" },
  enviada_cobranza:       { label: "Enviada a Cobranza", cls: "b-teal" },
};
// states that demand backoffice action today
const ACTION_ESTADOS = ["por_revisar", "por_asignar", "asignacion_por_confirmar"];
// states where OT data/devices are still editable by backoffice
const EDITABLE_ESTADOS = ["por_revisar", "por_asignar"];
function isEditable(estado) { return EDITABLE_ESTADOS.includes(estado); }

/* device estados que ve backoffice: por_instalar | pendiente | transmitiendo
   (la validación RedGPS y la falta de señal se resuelven en terreno, antes de la firma) */
const DEV_ESTADOS = {
  por_instalar:  { label: "Por instalar", cls: "b-gray" },
  pendiente:     { label: "Pendiente", cls: "b-amber" },
  transmitiendo: { label: "Transmitiendo", cls: "b-green", icon: "check" },
};

function devMeta(d) {
  return DEV_ESTADOS[d.estado];
}

/* OT progress derivation */
function otProgress(ot) {
  const devs = ot.dispositivos;
  const n = devs.length;
  const transmitiendo = devs.filter(d => d.estado === "transmitiendo").length;
  const instalados = transmitiendo; // firmados ⇒ ya transmitiendo
  const pendientes = devs.filter(d => d.estado === "pendiente").length;
  const porInstalar = devs.filter(d => d.estado === "por_instalar").length;
  return { n, transmitiendo, instalados, pendientes, porInstalar };
}

/* full OT estado label incl. subestados */
function otEstadoLabel(ot) {
  if (ot.estado !== "en_terreno") return OT_ESTADOS[ot.estado].label;
  const p = otProgress(ot);
  if (p.pendientes > 0 || p.porInstalar > 0) return "En terreno · parcial";
  return "En terreno";
}

/* ---- Toast ---- */
function Toast({ msg, onDone }) {
  useEffect(() => { const x = setTimeout(onDone, 2600); return () => clearTimeout(x); }, []);
  return <div className="toast"><Icon name="checkC" />{msg}</div>;
}

/* ---- Overlay de carga a pantalla completa — para operaciones que
   bloquean la pantalla mientras esperan al backend (optimizar, guardar,
   confirmar), no solo el ícono del botón que la dispara. ---- */
function CargandoOverlay({ mensaje }) {
  return (
    <div className="overlay">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <span className="icon-spin" style={{ color: "var(--accent)" }}><Icon name="refresh" style={{ width: 40, height: 40 }} /></span>
        {mensaje && <div style={{ color: "#fff", fontWeight: 600 }}>{mensaje}</div>}
      </div>
    </div>
  );
}

/* CLP money */
function clp(n) { return "$" + n.toLocaleString("es-CL"); }

/* ---- Logo: real Control Position wordmark (brand blue #2a4092 baked in) ---- */
const BRAND_BLUE = "#2a4092";
function Logo({ height = 30, style }) {
  return (
    <img src={window.CP_LOGO_URI} alt="Control Position"
      style={Object.assign({ height, width: "auto", display: "block" }, style)} />
  );
}

Object.assign(window, {
  Icon, Avatar, Badge, Toast, Logo, BRAND_BLUE,
  OT_ESTADOS, ACTION_ESTADOS, EDITABLE_ESTADOS, DEV_ESTADOS,
  isEditable, devMeta, otProgress, otEstadoLabel, clp,
});
