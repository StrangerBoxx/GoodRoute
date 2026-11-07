/* ============ Error boundary ============
   Un error al dibujar una pantalla ya no deja la app en blanco (React
   desmonta todo el árbol si nadie lo atrapa). Se usa en dos niveles
   (main.jsx): alrededor del contenido de cada pantalla, con `resetKey` = la
   ruta, así navegar a otra sección limpia el error; y alrededor de toda la
   app (`pantallaCompleta`), para lo que falle fuera de las pantallas (menú,
   barra superior, login). Estilos en errores.css. */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info && info.componentStack);
  }
  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorFallback error={this.state.error} pantallaCompleta={this.props.pantallaCompleta}
      onReintentar={() => this.setState({ error: null })} />;
  }
}

function ErrorFallback({ error, pantallaCompleta, onReintentar }) {
  const tarjeta = (
    <div className="card card-pad error-fallback" role="alert">
      <div className="error-fallback-icon"><Icon name="alert" /></div>
      <div className="error-fallback-title">{pantallaCompleta ? "Algo salió mal" : "No se pudo mostrar esta pantalla"}</div>
      <p className="error-fallback-text">
        {pantallaCompleta
          ? "Ocurrió un error inesperado. Recarga la página para volver a intentarlo."
          : "Ocurrió un error inesperado al mostrarla. Puedes reintentar, recargar la página o ir a otra sección desde el menú."}
      </p>
      <div className="error-fallback-actions">
        {!pantallaCompleta && <button type="button" className="btn" onClick={onReintentar}>Reintentar</button>}
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}><Icon name="refresh" />Recargar página</button>
      </div>
      {/* Para reportar el error al equipo sin tener que abrir la consola. */}
      <details className="error-fallback-detail">
        <summary>Detalle técnico</summary>
        <pre>{String((error && error.message) || error)}</pre>
      </details>
    </div>
  );
  return pantallaCompleta ? <div className="error-fallback-page">{tarjeta}</div> : <div className="page">{tarjeta}</div>;
}

Object.assign(window, { ErrorBoundary });
