// ── Admin module ─────────────────────────────────────────────────────────────
// Minimal approval surface — admins approve pending users and assign roles.
// Visible only when current user is { status:"approved", role:"admin" }.
// Gating is enforced in src/index.jsx (nav + route).

import React, { useState, useEffect, useCallback } from "react";
import { C, css } from "../theme.js";
import { listPendingProfiles, updateProfile } from "../lib/profile.js";

const ROLES = ["admin", "hrbp", "viewer"];

export default function ModuleAdmin({ currentProfile }) {
  const [pending, setPending] = useState([]);
  const [status, setStatus]   = useState("loading"); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingRoleById, setPendingRoleById] = useState({});
  const [busyById, setBusyById] = useState({});

  const refresh = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    const res = await listPendingProfiles();
    if (res.ok) {
      setPending(res.profiles);
      setStatus("ready");
    } else {
      setStatus("error");
      setErrorMsg(res.reason === "no-client" ? "Supabase non configuré." : "Échec du chargement.");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setRoleFor = (id, role) => {
    setPendingRoleById(m => ({ ...m, [id]: role }));
  };

  const approve = async (profile) => {
    const id = profile.id;
    const role = pendingRoleById[id] || profile.role || "viewer";
    setBusyById(m => ({ ...m, [id]: true }));
    const res = await updateProfile(id, { status: "approved", role });
    setBusyById(m => ({ ...m, [id]: false }));
    if (res.ok) {
      setPending(prev => prev.filter(p => p.id !== id));
    } else {
      setErrorMsg(`Échec pour ${profile.email}: ${res.reason}`);
    }
  };

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Administration
        </div>
        <div style={{ fontSize: 12, color: C.textM }}>
          Approuver les nouveaux utilisateurs et assigner leur rôle.
          {currentProfile?.email && <> · Connecté : <b>{currentProfile.email}</b></>}
        </div>
      </div>

      <div style={{ ...css.card, marginBottom: 14 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            Demandes en attente {status === "ready" && <span style={{ color: C.textM, fontWeight: 400 }}>({pending.length})</span>}
          </div>
          <button onClick={refresh} disabled={status === "loading"}
            style={{ ...css.btn(C.em, true), padding:"6px 12px", fontSize:11,
              opacity: status === "loading" ? .6 : 1 }}>
            {status === "loading" ? "Chargement…" : "Rafraîchir"}
          </button>
        </div>

        {status === "error" && (
          <div style={{ fontSize:12, color:C.red, marginBottom: 10 }}>{errorMsg || "Erreur inconnue."}</div>
        )}

        {status === "ready" && pending.length === 0 && (
          <div style={{ fontSize:12, color:C.textM, padding: "8px 0" }}>
            Aucune demande en attente.
          </div>
        )}

        {status === "ready" && pending.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap: 8 }}>
            {pending.map(p => {
              const selectedRole = pendingRoleById[p.id] ?? (p.role || "viewer");
              const busy = !!busyById[p.id];
              return (
                <div key={p.id}
                  style={{ display:"flex", alignItems:"center", gap: 10, padding:"10px 12px",
                    background: C.surf, border:`1px solid ${C.border}`, borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {p.email || <em style={{ color: C.textD }}>(sans email)</em>}
                    </div>
                    <div style={{ fontSize: 10, color: C.textD, fontFamily:"'DM Mono',monospace" }}>
                      {p.id}
                    </div>
                  </div>
                  <select value={selectedRole}
                    onChange={e => setRoleFor(p.id, e.target.value)}
                    disabled={busy}
                    style={{ ...css.select, width: 110, padding:"6px 8px", fontSize: 12 }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button onClick={() => approve(p)} disabled={busy}
                    style={{ ...css.btn(C.em), padding:"6px 14px", fontSize: 12,
                      opacity: busy ? .6 : 1 }}>
                    {busy ? "…" : "Approuver"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.textD, lineHeight: 1.5 }}>
        Les utilisateurs approuvés accèdent à HRBP OS.
        Seuls les <b>admin</b> approuvés voient cette page.
      </div>
    </div>
  );
}
