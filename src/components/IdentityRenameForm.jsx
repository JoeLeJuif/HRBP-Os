// ── Identity rename form ─────────────────────────────────────────────────────
// Self-contained Preview/Apply form that rewrites a person's name across
// localStorage (cases/meetings/investigations/briefs) and Supabase (same
// + case_tasks + employees) using the existing identity helpers.
//
// Shared between Admin.jsx (general-purpose admin tool) and Leader.jsx
// (per-profile "Modifier le nom" action). Pass `defaultCurrent` to prefill
// the current name; pass `onCancel` to show a Cancel button. After a
// successful Apply, the consumer typically reloads since name-based links
// are recomputed from data.
//
// Reuses:
//   - applyMergeToLocalStorage / previewMergeInLocalStorage (utils/identity)
//   - mergeIdentity / previewMergeIdentity (services/identityMerge)
// No new write paths.

import { useState } from "react";
import { C, css } from "../theme.js";
import {
  applyMergeToLocalStorage,
  previewMergeInLocalStorage,
} from "../utils/identity.js";
import {
  mergeIdentity,
  previewMergeIdentity,
} from "../services/identityMerge.js";

export default function IdentityRenameForm({
  defaultCurrent = "",
  onCancel,
  onApplied,
  compact = false,
}) {
  const [current, setCurrent]     = useState(defaultCurrent || "");
  const [corrected, setCorrected] = useState("");
  const [busy, setBusy]           = useState(false);
  const [preview, setPreview]     = useState(null);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState("");

  const canSubmit = current.trim().length > 0
    && corrected.trim().length > 0
    && current.trim() !== corrected.trim();

  const invalidateOnEdit = () => {
    setPreview(null); setResult(null); setError("");
  };

  const onPreview = async () => {
    setBusy(true); setError(""); setResult(null);
    const sourceName = current.trim();
    const targetName = corrected.trim();
    let local;
    try {
      local = previewMergeInLocalStorage(sourceName, targetName);
    } catch (e) {
      setBusy(false);
      setError(`Erreur preview localStorage: ${e?.message || e}`);
      return;
    }
    let remote = null;
    try {
      remote = await previewMergeIdentity({ sourceName, targetName });
    } catch (e) {
      remote = { ok: false, reason: "exception", error: e };
    }
    setBusy(false);
    setPreview({ local, remote });
  };

  const onApply = async () => {
    setBusy(true); setError(""); setResult(null);
    const sourceName = current.trim();
    const targetName = corrected.trim();
    let local;
    try {
      local = applyMergeToLocalStorage(sourceName, targetName);
    } catch (e) {
      setBusy(false);
      setError(`Erreur apply localStorage: ${e?.message || e}`);
      return;
    }
    let remote = null;
    try {
      remote = await mergeIdentity({ sourceName, targetName });
    } catch (e) {
      remote = { ok: false, reason: "exception", error: e };
    }
    setBusy(false);
    const next = { local, remote };
    setResult(next);
    setPreview(null);
    if (typeof onApplied === "function") {
      try { onApplied(next); } catch { /* consumer error must not break form */ }
    }
  };

  const localSum = (b) => b ? (b.cases + b.investigations + b.meetings + b.briefs) : 0;
  const resultLocalTotal = localSum(result?.local);

  return (
    <div>
      <div style={{ display:"flex", gap: 8, alignItems:"center", flexWrap:"wrap" }}>
        <input
          type="text"
          value={current}
          placeholder="Nom actuel"
          onChange={e => { setCurrent(e.target.value); invalidateOnEdit(); }}
          disabled={busy}
          style={{ ...css.input, flex:"1 1 220px", minWidth: 180, padding:"6px 10px", fontSize: 12 }}
        />
        <span style={{ color: C.textD, fontSize: 14 }}>→</span>
        <input
          type="text"
          value={corrected}
          placeholder="Nom corrigé"
          onChange={e => { setCorrected(e.target.value); invalidateOnEdit(); }}
          disabled={busy}
          style={{ ...css.input, flex:"1 1 220px", minWidth: 180, padding:"6px 10px", fontSize: 12 }}
        />
        <button
          onClick={onPreview}
          disabled={!canSubmit || busy}
          style={{ ...css.btn(C.em, true), padding:"6px 14px", fontSize: 12,
            opacity: (!canSubmit || busy) ? .5 : 1,
            cursor: (!canSubmit || busy) ? "not-allowed" : "pointer" }}>
          {busy && !result ? "…" : "Preview"}
        </button>
        <button
          onClick={onApply}
          disabled={!canSubmit || busy}
          style={{ ...css.btn(C.teal), padding:"6px 14px", fontSize: 12,
            opacity: (!canSubmit || busy) ? .5 : 1,
            cursor: (!canSubmit || busy) ? "not-allowed" : "pointer" }}>
          {busy && !preview ? "…" : "Appliquer"}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6,
              padding:"6px 12px", fontSize:12, color: C.textM,
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .5 : 1 }}>
            Annuler
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>{error}</div>
      )}

      {preview && (
        <div style={{ marginTop: compact ? 8 : 12, fontSize: 12, lineHeight: 1.6,
          padding: "8px 10px", background: C.surfL, border: `1px dashed ${C.border}`, borderRadius: 6 }}>
          <div style={{ color: C.text, marginBottom: 4, fontWeight: 600 }}>Preview (rien écrit)</div>
          <BreakdownLine label="Local"    breakdown={preview.local}/>
          <RemoteBreakdown remote={preview.remote}/>
        </div>
      )}

      {result && (
        <div style={{ marginTop: compact ? 8 : 12, fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ color: C.text, marginBottom: 4, fontWeight: 600 }}>Renommé</div>
          <BreakdownLine label="Local" breakdown={result.local}/>
          <RemoteBreakdown remote={result.remote}/>
          {resultLocalTotal > 0 && (
            <button
              onClick={() => window.location.reload()}
              style={{ ...css.btn(C.em, true), padding:"4px 10px", fontSize: 11, marginTop: 8 }}>
              Recharger pour voir les changements
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BreakdownLine({ label, breakdown }) {
  if (!breakdown) return null;
  const total = breakdown.cases + breakdown.investigations + breakdown.meetings + breakdown.briefs;
  return (
    <div style={{ color: C.text }}>
      <b>{label}</b> ({total} entité{total > 1 ? "s" : ""}) ·
      cases {breakdown.cases} · meetings {breakdown.meetings} ·
      enquêtes {breakdown.investigations} · briefs {breakdown.briefs}
    </div>
  );
}

function RemoteBreakdown({ remote }) {
  if (!remote) return null;
  if (remote.ok) {
    const b = remote.breakdown || {};
    return (
      <div style={{ color: C.textM }}>
        <b>Supabase</b> ({remote.total} ligne{remote.total > 1 ? "s" : ""}) ·
        cases {b.cases || 0} · meetings {b.meetings || 0} ·
        enquêtes {b.investigations || 0} · briefs {b.briefs || 0} ·
        case_tasks {b.case_tasks || 0} ·
        employees {(b.employees_full_name || 0) + (b.employees_manager_name || 0)}
      </div>
    );
  }
  if (remote.reason === "no-client") {
    return <div style={{ color: C.textD, fontStyle: "italic" }}>Supabase non configuré — local uniquement.</div>;
  }
  if (remote.reason === "not-authenticated") {
    return <div style={{ color: C.textD, fontStyle: "italic" }}>Supabase: session expirée — local uniquement.</div>;
  }
  return (
    <div style={{ color: C.amber }}>
      Supabase: échec ({remote.reason || "erreur"}).
    </div>
  );
}
