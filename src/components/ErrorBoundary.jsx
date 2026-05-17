// ── ErrorBoundary ────────────────────────────────────────────────────────────
// Catches uncaught React render errors. Reports to Sentry (no-op if DSN absent)
// and renders a professional fallback UI with retry. Lean, no external CSS.
//
// Usage:
//   <ErrorBoundary scope="root">             <App />              </ErrorBoundary>
//   <ErrorBoundary scope="cases" compact>    <ModuleCases ... />  </ErrorBoundary>
//
// `compact` switches to an inline panel suitable for a module slot. Default
// renders a full-screen fallback for top-level use.

import React from "react";
import { captureException } from "../lib/sentry.js";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      captureException(error, {
        scope: this.props.scope || "unknown",
        componentStack: info?.componentStack,
      });
    } catch {}
    try {
      console.error(`[ErrorBoundary:${this.props.scope || "unknown"}]`, error);
    } catch {}
  }

  handleRetry = () => {
    this.setState({ error: null });
    if (this.props.onRetry) {
      try { this.props.onRetry(); } catch {}
    }
  };

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const compact = !!this.props.compact;
    const scope = this.props.scope || "app";
    const palette = {
      bg:      "#0f1117",
      surf:    "#171b24",
      text:    "#e9ecf2",
      textM:   "#9aa3b2",
      textD:   "#6b7280",
      border:  "#262b36",
      red:     "#ef4444",
      em:      "#10b981",
    };
    const wrap = compact
      ? { padding: 24, background: palette.surf, border: `1px solid ${palette.border}`,
          borderRadius: 12, margin: 16, fontFamily: "'DM Sans',sans-serif",
          color: palette.text, maxWidth: 560 }
      : { display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "100vh", background: palette.bg, padding: 24,
          fontFamily: "'DM Sans',sans-serif", color: palette.text };
    const inner = compact
      ? { width: "100%" }
      : { maxWidth: 460, width: "100%", textAlign: "center" };
    const btn = (bg, primary) => ({
      background: primary ? bg : "transparent",
      color: primary ? "#0f1117" : palette.textM,
      border: primary ? "none" : `1px solid ${palette.border}`,
      borderRadius: 8, padding: "10px 18px", fontSize: 13, cursor: "pointer",
      fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
    });

    return (
      <div style={wrap}>
        <div style={inner}>
          <div style={{ width: 44, height: 44, background: palette.red, borderRadius: 10,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, marginBottom: 14 }}>!</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Une erreur est survenue
          </div>
          <div style={{ fontSize: 13, color: palette.textM, marginBottom: 16, lineHeight: 1.5 }}>
            Le module a rencontré un problème inattendu. Réessayez ou rechargez la page.
            Si le problème persiste, l'incident a été automatiquement signalé.
          </div>
          <div style={{ fontSize: 10, color: palette.textD, marginBottom: 18,
            fontFamily: "'DM Mono',monospace" }}>
            scope: {scope}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={this.handleRetry} style={btn(palette.em, true)}>Réessayer</button>
            <button onClick={this.handleReload} style={btn(palette.em, false)}>Recharger la page</button>
          </div>
        </div>
      </div>
    );
  }
}
