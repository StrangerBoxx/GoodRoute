/* ============ Sidebar + Top header ============ */
// Apunta a la galería de prototipos mientras el supervisor elige la variante
// definitiva de dashboard; cuando la elija, alcanza con cambiar esta URL.
const GOODROUTE_DASHBOARD_URL = "https://strangerboxx.github.io/MVP-prototipo-cp/prototipos/";

function GoodRouteNavGroup({ active, onNavigate }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="nav-group">
      <button type="button" className="nav-group-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name="zap" />
        GoodRoute
        <span className={"nav-group-chev" + (open ? " open" : "")}><Icon name="chevD" /></span>
      </button>
      {open && (
        <div className="nav-group-children">
          <button type="button" className={"nav-item" + (active ? " active" : "")} onClick={onNavigate}>
            <Icon name="pin" />
            Asignar rutas
          </button>
          <a className="nav-item" href={GOODROUTE_DASHBOARD_URL} target="_blank" rel="noopener">
            <Icon name="dashboard" />
            Galería de dashboards
            <span className="nav-ext-ico"><Icon name="external" /></span>
          </a>
        </div>
      )}
    </div>
  );
}

function Sidebar({ route, go, counts }) {
  const opItems = [
    { id: "dashboard", label: "Centro de control", icon: "dashboard" },
    { id: "orders", label: "Órdenes de trabajo", icon: "orders", count: counts.accion, alert: counts.accion > 0 },
    { id: "techs", label: "Técnicos", icon: "techs" },
    { id: "installations", label: "Instalaciones", icon: "install" },
  ];
  return (
    <aside className="side">
      <div className="brand">
        <div>
          <Logo height={34} />
          <div className="brand-sub" style={{ marginTop: 6, marginLeft: 2 }}>Back office</div>
        </div>
      </div>

      <div className="nav-group-label">Operación</div>
      {opItems.map(it => (
        <button key={it.id} className={"nav-item" + (route.screen === it.id ? " active" : "")} onClick={() => go(it.id)}>
          <Icon name={it.icon} />
          {it.label}
          {it.count != null && it.count > 0 && <span className={"nav-count" + (it.alert ? " alert" : "")}>{it.count}</span>}
        </button>
      ))}
      <GoodRouteNavGroup active={route.screen === "rutasExterno"} onNavigate={() => go("rutasExterno")} />

      <div className="nav-group-label">Ajustes</div>
      <button className={"nav-item" + (route.screen === "settings" ? " active" : "")} onClick={() => go("settings")}>
        <Icon name="settings" />
        Configuración
      </button>

      <div className="side-foot">
        <span className="badge b-green" style={{ padding: "2px 7px" }}><span className="bdot" />RedGPS conectado</span>
      </div>
    </aside>
  );
}

function TopBar({ query, setQuery, go, onLogout }) {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);
  return (
    <header className="topbar">
      <div className="search">
        <Icon name="search" />
        <input
          placeholder="Buscar orden, cliente, patente o IMEI…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className="topbar-right">
        <div className="usermenu-wrap" onClick={e => e.stopPropagation()}>
          <button className="user-chip" onClick={() => setMenu(m => !m)}>
            <Avatar name="CS" color="var(--accent)" size="md" />
            <div className="user-meta">
              <div className="user-name">Camila Soto</div>
              <div className="user-role">Coordinadora</div>
            </div>
            <Icon name="chevD" style={{ width: 14, height: 14, color: "var(--text-3)" }} />
          </button>
          {menu && (
            <div className="dropdown">
              <div className="dropdown-head">
                <div className="dropdown-name">Camila Soto</div>
                <div className="dropdown-mail">c.soto@controlposition.cl</div>
              </div>
              <button className="dropdown-item" onClick={() => { setMenu(false); go("profile"); }}>
                <Icon name="user" />Mi cuenta
              </button>
              <button className="dropdown-item" onClick={() => { setMenu(false); go("settings"); }}>
                <Icon name="settings" />Configuración
              </button>
              <div className="dropdown-sep" />
              <button className="dropdown-item danger" onClick={() => { setMenu(false); onLogout && onLogout(); }}>
                <Icon name="arrowL" />Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

Object.assign(window, { Sidebar, TopBar });
