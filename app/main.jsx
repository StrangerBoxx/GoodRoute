/* ============ App root: routing + state ============ */
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

const ACCENTS = {
  "Corporativo": ["#033E84", "#022c5f", "#e3ebf5", "#f0f4fa"],
  "Petróleo":    ["#0f766e", "#0b5d56", "#e1efed", "#f0f7f6"],
  "Grafito":     ["#374151", "#1f2937", "#e8ebef", "#f4f5f7"],
  "Terracota":   ["#c2410c", "#9a3412", "#fbeadf", "#fdf5f0"],
};
const FONTS = {
  "IBM Plex": "\"IBM Plex Sans\", system-ui, sans-serif",
  "Helvetica": "\"Helvetica Neue\", Helvetica, Arial, sans-serif",
};
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": ["#033E84", "#022c5f", "#e3ebf5", "#f0f4fa"],
  "font": "IBM Plex",
  "density": "regular",
  "scale": 14
}/*EDITMODE-END*/;

// (la optimización de rutas la hace el grupo externo; este sistema solo recibe y confirma)

function App() {
  const [authed, setAuthed] = useState(false);
  const [authView, setAuthView] = useState("login");
  const [route, setRoute] = useState({ screen: "dashboard", params: {} });
  const [query, setQuery] = useState("");
  const [ordenes, setOrdenes] = useState(() => deepClone(CP_DATA.ordenes));
  const [toast, setToast] = useState(null);
  const [evidenceOT, setEvidenceOT] = useState(null);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    const r = document.documentElement.style;
    const [a, s, soft, softer] = t.accent;
    r.setProperty("--accent", a);
    r.setProperty("--accent-strong", s);
    r.setProperty("--accent-soft", soft);
    r.setProperty("--accent-softer", softer);
    r.setProperty("--sans", FONTS[t.font] || FONTS["IBM Plex"]);
    document.documentElement.setAttribute("data-density", t.density === "compact" ? "compact" : "regular");
    document.body.style.fontSize = t.scale + "px";
  }, [t]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.removeItem("cp_dark");
  }, []);

  const go = (screen, params = {}) => {
    setRoute({ screen, params });
    document.querySelector(".scroll")?.scrollTo(0, 0);
  };

  const updateOT = (id, fn) => setOrdenes(prev => prev.map(o => o.id === id ? fn(deepClone(o)) : o));

  // 4) BO confirma la asignación → Asignada (visible para el técnico)
  const onConfirmAssignment = (id) => {
    let nm = "";
    updateOT(id, o => {
      o.estado = "asignada";
      o.rutaNueva = false;
      const tec = CP_DATA.techById[o.tecnico];
      nm = `${tec.nombre} ${tec.apellidos.split(" ")[0]}`;
      o.actualizada = "recién";
      o.historial = [...o.historial, { ev: `Asignación confirmada · ${nm}`, autor: "Camila Soto", fecha: "Hoy · ahora", t: "done" }];
      return o;
    });
    setToast(`${id} asignada y confirmada`);
  };

  // ---- Vista "Por técnico": confirmar/mover/quitar OT de una ruta recibida ----
  const onConfirmRoute = (techId) => {
    const tec = CP_DATA.techById[techId];
    let n = 0;
    setOrdenes(prev => prev.map(o => {
      if (o.tecnico === techId && o.estado === "asignacion_por_confirmar") {
        n++;
        const c = deepClone(o);
        c.estado = "asignada";
        c.actualizada = "recién";
        c.historial = [...c.historial, { ev: `Asignación confirmada en ruta · ${tec.nombre} ${tec.apellidos.split(" ")[0]}`, autor: "Camila Soto", fecha: "Hoy · ahora", t: "done" }];
        return c;
      }
      return o;
    }));
    setToast(`Ruta de ${tec.nombre} ${tec.apellidos.split(" ")[0]} confirmada · ${n} OT · técnico notificado`);
  };

  const onMoveOT = (id, techId) => {
    const tec = CP_DATA.techById[techId];
    updateOT(id, o => {
      o.tecnico = techId;
      o.actualizada = "recién";
      o.historial = [...o.historial, { ev: `Movida a la ruta de ${tec.nombre} ${tec.apellidos.split(" ")[0]}`, autor: "Camila Soto", fecha: "Hoy · ahora", t: "done" }];
      return o;
    });
    setToast(`OT movida a ${tec.nombre} ${tec.apellidos.split(" ")[0]}`);
  };

  const onRemoveFromRoute = (id) => {
    updateOT(id, o => {
      o.tecnico = null;
      o.estado = "por_asignar";
      o.actualizada = "recién";
      o.historial = [...o.historial, { ev: "Quitada de la ruta · vuelve a Por asignar", autor: "Camila Soto", fecha: "Hoy · ahora", t: "done" }];
      return o;
    });
    setToast(`${id} quitada de la ruta · vuelve a Por asignar`);
  };

  // reasignar manual desde el detalle → Asignada
  const onReassign = (id, techId) => {
    const tec = CP_DATA.techById[techId];
    updateOT(id, o => {
      o.tecnico = techId;
      o.estado = "asignada";
      o.actualizada = "recién";
      o.historial = [...o.historial, { ev: `Reasignada y confirmada · ${tec.nombre} ${tec.apellidos.split(" ")[0]}`, autor: "Camila Soto", fecha: "Hoy · ahora", t: "done" }];
      return o;
    });
    setToast(`${id} asignada a ${tec.nombre} ${tec.apellidos.split(" ")[0]}`);
  };

  // asignación manual directa (sin pasar por planificación) → Asignada
  const onAssignManual = (id, techId) => {
    const tec = CP_DATA.techById[techId];
    updateOT(id, o => {
      o.tecnico = techId;
      o.estado = "asignada";
      o.actualizada = "recién";
      o.historial = [...o.historial, { ev: `Asignación manual · ${tec.nombre} ${tec.apellidos.split(" ")[0]}`, autor: "Camila Soto", fecha: "Hoy · ahora", t: "done" }];
      return o;
    });
    setToast(`${id} asignada manualmente a ${tec.nombre} ${tec.apellidos.split(" ")[0]}`);
  };

  // envío a Cobranza tras finalizada → luego Cobranza emite factura en Bsale (simulado)
  // envío a Cobranza tras finalizada — último estado del ciclo en el backoffice.
  // La factura se emite en Bsale, fuera de este sistema.
  const onSendToCobranza = (id) => {
    updateOT(id, o => {
      o.estado = "enviada_cobranza";
      o.actualizada = "recién";
      o.facturacion = Object.assign({}, o.facturacion, { estado: "enviada_cobranza", enviada: "Hoy · ahora" });
      o.costos = o.costos.map(x => Object.assign({}, x, { estado: "Enviado a Cobranza" }));
      o.historial = [...o.historial, { ev: "Enviada a Cobranza para facturación", autor: "Camila Soto", fecha: "Hoy · ahora", t: "done" }];
      return o;
    });
    setToast(`${id} enviada a Cobranza`);
  };

  const onAddDevice = (id) => {
    updateOT(id, o => {
      const n = o.dispositivos.length + 1;
      o.dispositivos = [...o.dispositivos, { patente: "NUEVA·" + n, origen: "Cliente", estado: "por_instalar", imei: "", iccid: "", movil: "", firma: false }];
      return o;
    });
  };
  const onRemoveDevice = (id, idx) => {
    updateOT(id, o => { o.dispositivos = o.dispositivos.filter((_, i) => i !== idx); return o; });
  };

  const counts = {
    accion: ordenes.filter(o => ACTION_ESTADOS.includes(o.estado)).length,
  };

  let content;
  if (route.screen === "dashboard") content = <Dashboard ordenes={ordenes} go={go} />;
  else if (route.screen === "orders") content = <Orders ordenes={ordenes} go={go} onConfirmRoute={onConfirmRoute} onMoveOT={onMoveOT} onRemoveFromRoute={onRemoveFromRoute} />;
  else if (route.screen === "order") {
    const ot = ordenes.find(o => o.id === route.params.id);
    content = ot ? <OrderDetail ot={ot} go={go}
      onAssignManual={onAssignManual} onConfirmAssignment={onConfirmAssignment}
      onReassign={onReassign} onAddDevice={onAddDevice} onRemoveDevice={onRemoveDevice} onSendToCobranza={onSendToCobranza} />
      : <div className="page">No encontrada</div>;
  }
  else if (route.screen === "techs") content = <Technicians go={go} />;
  else if (route.screen === "tech") { const tt = CP_DATA.techById[route.params.id]; content = <TechDetail t={tt} go={go} />; }
  else if (route.screen === "techNew") content = <TechForm tech={null} go={go} />;
  else if (route.screen === "installations") content = <Installations go={go} onViewEvidence={(id) => setEvidenceOT(id)} />;
  else if (route.screen === "settings") content = <Settings initialSection={route.params.section} />;
  else if (route.screen === "profile") content = <Profile go={go} />;
  else if (route.screen === "rutasExterno") content = <RutasExternoScreen onToast={setToast} />;
  else if (route.screen === "analisis") content = <DashboardAnalisisScreen />;

  if (!authed) {
    if (authView === "forgot") return <ForgotPassword onBack={() => setAuthView("login")} />;
    return <Login onLogin={() => { setAuthed(true); setRoute({ screen: "dashboard", params: {} }); }} onForgot={() => setAuthView("forgot")} />;
  }

  return (
    <div className="app">
      <Sidebar route={route} go={go} counts={counts} />
      <div className="main">
        <TopBar query={query} setQuery={setQuery} go={go} onLogout={() => { setAuthed(false); }} />
        <div className="scroll">{content}</div>
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {evidenceOT && <EvidenceModal ot={ordenes.find(o => o.id === evidenceOT)} onClose={() => setEvidenceOT(null)} go={go} />}

      <TweaksPanel>
        <TweakSection label="Marca" />
        <TweakColor label="Color de acento" value={t.accent}
          options={Object.values(ACCENTS)}
          onChange={(v) => setTweak("accent", v)} />
        <TweakSection label="Tipografía" />
        <TweakRadio label="Familia" value={t.font}
          options={Object.keys(FONTS)}
          onChange={(v) => setTweak("font", v)} />
        <TweakSlider label="Escala base" value={t.scale} min={13} max={16} step={1} unit="px"
          onChange={(v) => setTweak("scale", v)} />
        <TweakSection label="Disposición" />
        <TweakRadio label="Densidad" value={t.density}
          options={["compact", "regular"]}
          onChange={(v) => setTweak("density", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
