// ── Admin module ─────────────────────────────────────────────────────────────
// User & organization management surface for HRBP OS admins.
// Visible only when current user is { status:"approved", role:"admin" }.
// Gating is enforced in src/index.jsx (nav + route).
//
// Capabilities:
//   - List pending / approved / disabled users (separated)
//   - Approve a pending user (must pick role; org optional but offered)
//   - Disable an approved user (status → "disabled" → blocked at gate)
//   - Re-enable a disabled user (status → "approved")
//   - Assign / change / clear an organization on any profile
//
// Profiles and auth.users are NEVER deleted from this UI.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { C, css } from "../theme.js";
import { listAllProfiles, listOrganizations, updateProfile } from "../lib/profile.js";

const ROLES = ["admin", "hrbp", "viewer"];

export default function ModuleAdmin({ currentProfile }) {
  const [profiles, setProfiles]         = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [status, setStatus]             = useState("loading"); // loading | ready | error
  const [errorMsg, setErrorMsg]         = useState("");
  const [pendingRoleById, setPendingRoleById] = useState({});
  const [pendingOrgById,  setPendingOrgById]  = useState({});
  const [busyById,        setBusyById]        = useState({});

  const refresh = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    const [pRes, oRes] = await Promise.all([listAllProfiles(), listOrganizations()]);
    if (!pRes.ok) {
      setStatus("error");
      setErrorMsg(pRes.reason === "no-client" ? "Supabase non configuré." : "Échec du chargement des profils.");
      return;
    }
    if (!oRes.ok && oRes.reason !== "no-client") {
      console.warn("[admin] listOrganizations failed:", oRes.reason, oRes.error);
    }
    setProfiles(pRes.profiles);
    setOrganizations(oRes.ok ? oRes.organizations : []);
    setStatus("ready");
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const orgNameById = useMemo(() => {
    const m = {};
    for (const o of organizations) m[o.id] = o.name;
    return m;
  }, [organizations]);

  const buckets = useMemo(() => {
    const pending = [], approved = [], disabled = [], other = [];
    for (const p of profiles) {
      if      (p.status === "pending")  pending.push(p);
      else if (p.status === "approved") approved.push(p);
      else if (p.status === "disabled") disabled.push(p);
      else                              other.push(p);
    }
    return { pending, approved, disabled, other };
  }, [profiles]);

  const setRoleFor = (id, role) => setPendingRoleById(m => ({ ...m, [id]: role }));
  const setOrgFor  = (id, org)  => setPendingOrgById (m => ({ ...m, [id]: org  }));

  const setBusy = (id, v) => setBusyById(m => ({ ...m, [id]: v }));

  const applyPatch = async (profile, patch, errorLabel) => {
    setBusy(profile.id, true);
    const res = await updateProfile(profile.id, patch);
    setBusy(profile.id, false);
    if (res.ok && res.profile) {
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, ...res.profile } : p));
      return true;
    }
    setErrorMsg(`${errorLabel} pour ${profile.email || profile.id}: ${res.reason || "erreur"}`);
    return false;
  };

  const approve = async (profile) => {
    const role = pendingRoleById[profile.id] || profile.role || "viewer";
    const orgRaw = pendingOrgById[profile.id];
    const orgVal = orgRaw === undefined ? profile.organization_id : (orgRaw || null);
    await applyPatch(profile, { status: "approved", role, organization_id: orgVal }, "Échec d'approbation");
  };

  const disable = async (profile) => {
    if (profile.id === currentProfile?.id) {
      setErrorMsg("Vous ne pouvez pas désactiver votre propre compte.");
      return;
    }
    await applyPatch(profile, { status: "disabled" }, "Échec de désactivation");
  };

  const reenable = async (profile) => {
    await applyPatch(profile, { status: "approved" }, "Échec de réactivation");
  };

  const assignOrg = async (profile, organization_id) => {
    await applyPatch(profile, { organization_id: organization_id || null }, "Échec d'assignation");
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Administration
        </div>
        <div style={{ fontSize: 12, color: C.textM }}>
          Approuver, désactiver et assigner les organisations.
          {currentProfile?.email && <> · Connecté : <b>{currentProfile.email}</b></>}
        </div>
      </div>

      {errorMsg && (
        <div style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{errorMsg}</div>
      )}

      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom: 10 }}>
        <button onClick={refresh} disabled={status === "loading"}
          style={{ ...css.btn(C.em, true), padding:"6px 12px", fontSize:11,
            opacity: status === "loading" ? .6 : 1 }}>
          {status === "loading" ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>

      {status === "error" && (
        <div style={{ ...css.card, fontSize:12, color:C.red }}>
          {errorMsg || "Erreur inconnue."}
        </div>
      )}

      {status === "ready" && (
        <>
          {/* ── PENDING ────────────────────────────────────────────────── */}
          <Section title="Demandes en attente" count={buckets.pending.length} color={C.amber}>
            {buckets.pending.length === 0 ? (
              <Empty>Aucune demande en attente.</Empty>
            ) : buckets.pending.map(p => {
              const selectedRole = pendingRoleById[p.id] ?? (p.role || "viewer");
              const selectedOrg  = pendingOrgById[p.id]  ?? (p.organization_id || "");
              const busy = !!busyById[p.id];
              return (
                <Row key={p.id} profile={p} orgNameById={orgNameById}>
                  <select value={selectedRole}
                    onChange={e => setRoleFor(p.id, e.target.value)}
                    disabled={busy}
                    title="Rôle"
                    style={{ ...css.select, width: 100, padding:"6px 8px", fontSize: 12 }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <OrgSelect organizations={organizations} value={selectedOrg}
                    onChange={v => setOrgFor(p.id, v)} disabled={busy}/>
                  <button onClick={() => approve(p)} disabled={busy}
                    style={{ ...css.btn(C.em), padding:"6px 14px", fontSize: 12,
                      opacity: busy ? .6 : 1 }}>
                    {busy ? "…" : "Approuver"}
                  </button>
                </Row>
              );
            })}
          </Section>

          {/* ── APPROVED ───────────────────────────────────────────────── */}
          <Section title="Utilisateurs approuvés" count={buckets.approved.length} color={C.em}>
            {buckets.approved.length === 0 ? (
              <Empty>Aucun utilisateur approuvé.</Empty>
            ) : buckets.approved.map(p => {
              const busy = !!busyById[p.id];
              const isSelf = p.id === currentProfile?.id;
              return (
                <Row key={p.id} profile={p} orgNameById={orgNameById}>
                  <span style={{ fontSize: 11, color: C.textM, fontWeight: 500,
                    padding:"3px 8px", background: C.surfL, borderRadius: 4,
                    border: `1px solid ${C.border}` }}>
                    {p.role || "viewer"}
                  </span>
                  <OrgSelect organizations={organizations} value={p.organization_id || ""}
                    onChange={v => assignOrg(p, v)} disabled={busy}/>
                  <button onClick={() => disable(p)} disabled={busy || isSelf}
                    title={isSelf ? "Vous ne pouvez pas désactiver votre propre compte" : ""}
                    style={{ ...css.btn(C.red, true), padding:"6px 14px", fontSize: 12,
                      opacity: (busy || isSelf) ? .5 : 1,
                      cursor: (busy || isSelf) ? "not-allowed" : "pointer" }}>
                    {busy ? "…" : "Désactiver"}
                  </button>
                </Row>
              );
            })}
          </Section>

          {/* ── DISABLED ───────────────────────────────────────────────── */}
          <Section title="Utilisateurs désactivés" count={buckets.disabled.length} color={C.textM}>
            {buckets.disabled.length === 0 ? (
              <Empty>Aucun utilisateur désactivé.</Empty>
            ) : buckets.disabled.map(p => {
              const busy = !!busyById[p.id];
              return (
                <Row key={p.id} profile={p} orgNameById={orgNameById}>
                  <span style={{ fontSize: 11, color: C.textM, fontWeight: 500,
                    padding:"3px 8px", background: C.surfL, borderRadius: 4,
                    border: `1px solid ${C.border}` }}>
                    {p.role || "viewer"}
                  </span>
                  <OrgSelect organizations={organizations} value={p.organization_id || ""}
                    onChange={v => assignOrg(p, v)} disabled={busy}/>
                  <button onClick={() => reenable(p)} disabled={busy}
                    style={{ ...css.btn(C.em), padding:"6px 14px", fontSize: 12,
                      opacity: busy ? .6 : 1 }}>
                    {busy ? "…" : "Réactiver"}
                  </button>
                </Row>
              );
            })}
          </Section>

          {buckets.other.length > 0 && (
            <Section title="Autres" count={buckets.other.length} color={C.textD}>
              {buckets.other.map(p => (
                <Row key={p.id} profile={p} orgNameById={orgNameById}>
                  <span style={{ fontSize: 11, color: C.textD }}>status: {p.status || "—"}</span>
                </Row>
              ))}
            </Section>
          )}
        </>
      )}

      <div style={{ fontSize: 11, color: C.textD, lineHeight: 1.5, marginTop: 10 }}>
        Seuls les utilisateurs avec status <b>approved</b> accèdent à HRBP OS.
        Les profils ne sont jamais supprimés ; un compte désactivé peut être réactivé.
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, count, color, children }) {
  return (
    <div style={{ ...css.card, marginBottom: 14 }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }}/>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
          {title} <span style={{ color: C.textM, fontWeight: 400 }}>({count})</span>
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ fontSize:12, color:C.textM, padding: "6px 0" }}>{children}</div>
  );
}

function Row({ profile, orgNameById, children }) {
  const orgName = profile.organization_id ? (orgNameById[profile.organization_id] || "—") : null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap: 10, padding:"10px 12px",
      background: C.surf, border:`1px solid ${C.border}`, borderRadius: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 500,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {profile.email || <em style={{ color: C.textD }}>(sans email)</em>}
        </div>
        <div style={{ fontSize: 10, color: C.textD, fontFamily:"'DM Mono',monospace",
          display:"flex", gap: 8, flexWrap:"wrap" }}>
          <span>{profile.id}</span>
          {orgName && <span>· org: <b style={{ color: C.textM }}>{orgName}</b></span>}
        </div>
      </div>
      {children}
    </div>
  );
}

function OrgSelect({ organizations, value, onChange, disabled }) {
  if (!organizations || organizations.length === 0) {
    return (
      <span style={{ fontSize: 11, color: C.textD, fontStyle: "italic", width: 160, textAlign: "right" }}>
        aucune organisation
      </span>
    );
  }
  return (
    <select value={value || ""}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      title="Organisation"
      style={{ ...css.select, width: 180, padding:"6px 8px", fontSize: 12 }}>
      <option value="">— aucune —</option>
      {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}
