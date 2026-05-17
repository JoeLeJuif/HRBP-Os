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
import {
  listAllProfiles, listOrganizations, updateProfile,
  revokeUserAccess, restoreUserAccess, setUserRole, canActOnProfile,
  updateOrganizationStatus, ORG_STATUSES, isOrgStatusActive,
} from "../lib/profile.js";
import { useT } from "../lib/i18n.js";
import { tRole, ROLE_IDS as ROLES } from "../lib/i18nEnums.js";
import { applyMergeToLocalStorage } from "../utils/identity.js";
import { mergeIdentity } from "../services/identityMerge.js";
import { buildOrganizationExport, downloadExportFile } from "../services/orgExport.js";
import {
  getOrganizationBilling,
  createStarterTrial,
  isStripeConfigured,
  startStripeCheckout,
  openBillingPortal,
} from "../services/billing.js";
import { getBillingAccess } from "../services/billingAccess.js";
import { checkUsage } from "../services/planLimits.js";
import IdentityRenameForm from "../components/IdentityRenameForm.jsx";

// Background / border / text — picked from theme colors so badges read at a
// glance without introducing new palette entries.
const ROLE_STYLE = {
  super_admin: { bg: C.red    + "18", border: C.red    + "55", color: C.red    },
  admin:       { bg: C.amber  + "18", border: C.amber  + "55", color: C.amber  },
  hrbp:        { bg: C.surfL,          border: C.border,        color: C.textM  },
};

export default function ModuleAdmin({ currentProfile, currentOrganization, onOrganizationUpdated, subscription }) {
  const { t } = useT();
  const [profiles, setProfiles]         = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [status, setStatus]             = useState("loading"); // loading | ready | error
  const [errorMsg, setErrorMsg]         = useState("");
  const [pendingRoleById, setPendingRoleById] = useState({});
  const [pendingOrgById,  setPendingOrgById]  = useState({});
  const [busyById,        setBusyById]        = useState({});

  const isSuperAdmin = currentProfile?.role === "super_admin"
    && currentProfile?.status === "approved";

  // Org-scoped fetch: super_admin sees every profile; org admins narrow the
  // query to their own organization_id at the SQL layer (not just hidden in
  // UI — they cannot SELECT other orgs even from devtools).
  const listOpts = useMemo(() => (
    isSuperAdmin ? {} : { organization_id: currentProfile?.organization_id || null }
  ), [isSuperAdmin, currentProfile?.organization_id]);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    const [pRes, oRes] = await Promise.all([listAllProfiles(listOpts), listOrganizations()]);
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
  }, [listOpts]);

  useEffect(() => { refresh(); }, [refresh]);

  const orgNameById = useMemo(() => {
    const m = {};
    for (const o of organizations) m[o.id] = o.name;
    return m;
  }, [organizations]);

  // Org admins can never reassign anyone (their own org included), so reduce
  // the OrgSelect choices to a single locked option representing their org.
  // Super_admin keeps the full org list.
  const orgChoices = useMemo(() => {
    if (isSuperAdmin) return organizations;
    if (!currentProfile?.organization_id) return [];
    const own = organizations.find(o => o.id === currentProfile.organization_id);
    return own ? [own] : [];
  }, [isSuperAdmin, organizations, currentProfile?.organization_id]);

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
    const res = await updateProfile(profile.id, patch, { caller: currentProfile, target: profile });
    setBusy(profile.id, false);
    if (res.ok && res.profile) {
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, ...res.profile } : p));
      return true;
    }
    setErrorMsg(`${errorLabel} pour ${profile.email || profile.id}: ${res.reason || "erreur"}`);
    return false;
  };

  const approve = async (profile) => {
    const role = pendingRoleById[profile.id] || profile.role || "hrbp";
    // Org admins cannot pick another org — force their own org on approval.
    // Super_admin keeps the manual choice (incl. clearing the org).
    let orgVal;
    if (isSuperAdmin) {
      const orgRaw = pendingOrgById[profile.id];
      orgVal = orgRaw === undefined ? profile.organization_id : (orgRaw || null);
    } else {
      orgVal = currentProfile?.organization_id || null;
    }
    if (!isSuperAdmin && !canActOnProfile(currentProfile, { ...profile, organization_id: orgVal })) {
      setErrorMsg(`Approbation refusée: cible hors de votre organisation.`);
      return;
    }
    // Sprint 3 — Étape 4: per-plan user quota. Super_admin bypasses (they may
    // operate across orgs whose subscription isn't the one loaded here).
    if (!isSuperAdmin) {
      const activeUsers = profiles.filter(p => p.status === "approved").length;
      const check = checkUsage(subscription, "users", activeUsers, currentProfile?.email);
      if (!check.allowed) {
        setErrorMsg(check.message);
        return;
      }
    }
    await applyPatch(profile, { status: "approved", role, organization_id: orgVal }, "Échec d'approbation");
  };

  // Route role changes through the super_admin-only RPC so the server-side
  // checks (caller is super_admin, valid role, no self-demotion) run.
  const changeRole = async (profile, newRole) => {
    if (newRole === profile.role) return;
    setBusy(profile.id, true);
    const res = await setUserRole(profile.id, newRole, { caller: currentProfile, target: profile });
    setBusy(profile.id, false);
    if (res.ok && res.profile) {
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, ...res.profile } : p));
      return;
    }
    const detail =
      res.reason === "not-super-admin"   ? "rôle super_admin requis" :
      res.reason === "self-demote"       ? "vous ne pouvez pas vous rétrograder" :
      res.reason === "invalid-role"      ? "rôle invalide" :
      res.reason === "profile-not-found" ? "profil introuvable" :
      res.reason === "not-authenticated" ? "session expirée" :
      (res.reason || "erreur");
    setErrorMsg(`Échec du changement de rôle pour ${profile.email || profile.id}: ${detail}`);
  };

  const callRpc = async (profile, rpc, errorLabel) => {
    if (!canActOnProfile(currentProfile, profile)) {
      setErrorMsg(`${errorLabel} pour ${profile.email || profile.id}: cible hors de votre organisation.`);
      return false;
    }
    setBusy(profile.id, true);
    const res = await rpc(profile.id, { caller: currentProfile, target: profile });
    setBusy(profile.id, false);
    if (res.ok && res.profile) {
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, ...res.profile } : p));
      return true;
    }
    const detail =
      res.reason === "self-revoke"        ? "vous ne pouvez pas révoquer votre propre accès" :
      res.reason === "not-admin"          ? "droits administrateur requis" :
      res.reason === "profile-not-found"  ? "profil introuvable" :
      res.reason === "not-authenticated"  ? "session expirée" :
      (res.reason || "erreur");
    setErrorMsg(`${errorLabel} pour ${profile.email || profile.id}: ${detail}`);
    return false;
  };

  const disable = async (profile) => {
    if (profile.id === currentProfile?.id) {
      setErrorMsg("Vous ne pouvez pas désactiver votre propre compte.");
      return;
    }
    await callRpc(profile, revokeUserAccess, "Échec de désactivation");
  };

  const reenable = async (profile) => {
    await callRpc(profile, restoreUserAccess, "Échec de réactivation");
  };

  const assignOrg = async (profile, organization_id) => {
    // Org admins are not allowed to move users between orgs at all. The
    // service layer rejects mismatching org_id; surface a clear UI message
    // before sending.
    if (!isSuperAdmin) {
      setErrorMsg("Seul un super_admin peut réassigner l'organisation.");
      return;
    }
    await applyPatch(profile, { organization_id: organization_id || null }, "Échec d'assignation");
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          {t("admin.title")}
        </div>
        <div style={{ fontSize: 12, color: C.textM }}>
          {t("admin.subtitle")}
          {currentProfile?.email && <> · {t("admin.connectedAs")} : <b>{currentProfile.email}</b></>}
        </div>
      </div>

      {errorMsg && (
        <div style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{errorMsg}</div>
      )}

      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom: 10 }}>
        <button onClick={refresh} disabled={status === "loading"}
          style={{ ...css.btn(C.em, true), padding:"6px 12px", fontSize:11,
            opacity: status === "loading" ? .6 : 1 }}>
          {status === "loading" ? t("common.loading") : t("common.refresh")}
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
          <Section title={t("admin.section.pending")} count={buckets.pending.length} color={C.amber}>
            {buckets.pending.length === 0 ? (
              <Empty>{t("admin.empty.pending")}</Empty>
            ) : buckets.pending.map(p => {
              const selectedRole = pendingRoleById[p.id] ?? (p.role || "hrbp");
              const selectedOrg  = pendingOrgById[p.id]  ?? (p.organization_id || "");
              const busy = !!busyById[p.id];
              // Non-super_admin viewers can only assign 'admin' or 'hrbp' here:
              // attempting to grant 'super_admin' would be rejected by the
              // privileged-fields trigger; hide the option to avoid surprises.
              const roleOptions = isSuperAdmin ? ROLES : ROLES.filter(r => r !== "super_admin");
              return (
                <Row key={p.id} profile={p} orgNameById={orgNameById}>
                  <select value={selectedRole}
                    onChange={e => setRoleFor(p.id, e.target.value)}
                    disabled={busy}
                    title="Rôle"
                    style={{ ...css.select, width: 130, padding:"6px 8px", fontSize: 12 }}>
                    {roleOptions.map(r => <option key={r} value={r}>{tRole(t, r)}</option>)}
                  </select>
                  <OrgSelect organizations={orgChoices} value={isSuperAdmin ? selectedOrg : (currentProfile?.organization_id || "")}
                    onChange={v => setOrgFor(p.id, v)} disabled={busy || !isSuperAdmin}/>
                  <button onClick={() => approve(p)} disabled={busy}
                    style={{ ...css.btn(C.em), padding:"6px 14px", fontSize: 12,
                      opacity: busy ? .6 : 1 }}>
                    {busy ? "…" : t("admin.action.approve")}
                  </button>
                </Row>
              );
            })}
          </Section>

          {/* ── APPROVED ───────────────────────────────────────────────── */}
          <div id="admin-users"/>
          <div id="admin-permissions"/>
          <Section title={t("admin.section.approved")} count={buckets.approved.length} color={C.em}>
            {buckets.approved.length === 0 ? (
              <Empty>{t("admin.empty.approved")}</Empty>
            ) : buckets.approved.map(p => {
              const busy = !!busyById[p.id];
              const isSelf = p.id === currentProfile?.id;
              return (
                <Row key={p.id} profile={p} orgNameById={orgNameById}>
                  <RoleControl profile={p} isSuperAdmin={isSuperAdmin}
                    busy={busy} isSelf={isSelf}
                    onChange={role => changeRole(p, role)}/>
                  <OrgSelect organizations={orgChoices} value={p.organization_id || ""}
                    onChange={v => assignOrg(p, v)} disabled={busy || !isSuperAdmin}/>
                  <button onClick={() => disable(p)} disabled={busy || isSelf}
                    title={isSelf ? "Vous ne pouvez pas désactiver votre propre compte" : ""}
                    style={{ ...css.btn(C.red, true), padding:"6px 14px", fontSize: 12,
                      opacity: (busy || isSelf) ? .5 : 1,
                      cursor: (busy || isSelf) ? "not-allowed" : "pointer" }}>
                    {busy ? "…" : t("admin.action.disable")}
                  </button>
                </Row>
              );
            })}
          </Section>

          {/* ── DISABLED ───────────────────────────────────────────────── */}
          <Section title={t("admin.section.disabled")} count={buckets.disabled.length} color={C.textM}>
            {buckets.disabled.length === 0 ? (
              <Empty>{t("admin.empty.disabled")}</Empty>
            ) : buckets.disabled.map(p => {
              const busy = !!busyById[p.id];
              return (
                <Row key={p.id} profile={p} orgNameById={orgNameById}
                  badge={<RevokedBadge disabledAt={p.disabled_at}/>}>
                  <RoleBadge role={p.role}/>
                  <OrgSelect organizations={orgChoices} value={p.organization_id || ""}
                    onChange={v => assignOrg(p, v)} disabled={busy || !isSuperAdmin}/>
                  <button onClick={() => reenable(p)} disabled={busy}
                    style={{ ...css.btn(C.em), padding:"6px 14px", fontSize: 12,
                      opacity: busy ? .6 : 1 }}>
                    {busy ? "…" : t("admin.action.reenable")}
                  </button>
                </Row>
              );
            })}
          </Section>

          {buckets.other.length > 0 && (
            <Section title={t("admin.section.other")} count={buckets.other.length} color={C.textD}>
              {buckets.other.map(p => (
                <Row key={p.id} profile={p} orgNameById={orgNameById}>
                  <span style={{ fontSize: 11, color: C.textD }}>status: {p.status || "—"}</span>
                </Row>
              ))}
            </Section>
          )}

          <OrganizationStatusPanel
            currentProfile={currentProfile}
            currentOrganization={currentOrganization}
            isSuperAdmin={isSuperAdmin}
            onUpdated={onOrganizationUpdated}/>
          <BillingPanel currentProfile={currentProfile}/>
          <ExportOrganizationPanel currentProfile={currentProfile}/>
          <RenameIdentityPanel/>
          <IdentityMergePanel/>
        </>
      )}

      <div style={{ fontSize: 11, color: C.textD, lineHeight: 1.5, marginTop: 10 }}>
        Seuls les utilisateurs avec status <b>approved</b> accèdent à HRBP OS.
        Les profils ne sont jamais supprimés ; un compte désactivé peut être réactivé.
      </div>
    </div>
  );
}

// ── Identity merge panel ─────────────────────────────────────────────────────
// Renames or merges an employee/manager name across all entities. Always
// rewrites localStorage (the primary store) and best-effort fires the
// Supabase service. After a successful merge we reload so React state
// re-hydrates from the freshly-rewritten localStorage — avoids threading
// `setData` callbacks down into Admin.
function IdentityMergePanel() {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null); // { ok, local, remote, error? }

  const canMerge = source.trim().length > 0
    && target.trim().length > 0
    && source.trim() !== target.trim();

  const onMerge = async () => {
    setBusy(true);
    setResult(null);
    const sourceName = source.trim();
    const targetName = target.trim();

    // Local rewrite (sync) — always runs, primary store of truth today.
    let local;
    try {
      local = applyMergeToLocalStorage(sourceName, targetName);
    } catch (e) {
      setBusy(false);
      setResult({ ok: false, error: `Erreur localStorage: ${e?.message || e}` });
      return;
    }

    // Remote rewrite — best-effort. `no-client` (Supabase not configured)
    // and `not-authenticated` are not failures here; just unavailable.
    let remote = null;
    try {
      const r = await mergeIdentity({ sourceName, targetName });
      remote = r;
    } catch (e) {
      remote = { ok: false, reason: "exception", error: e };
    }
    setBusy(false);
    setResult({ ok: true, local, remote });
  };

  const localTotal = result?.local
    ? (result.local.cases + result.local.investigations + result.local.meetings + result.local.briefs)
    : 0;

  return (
    <div style={{ ...css.card, marginBottom: 14 }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.purple }}/>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Fusion d'identité</div>
      </div>
      <div style={{ fontSize: 11, color: C.textM, marginBottom: 10, lineHeight: 1.5 }}>
        Corrige une typo ou fusionne deux variantes d'un même nom. Met à jour les cases,
        rencontres, enquêtes et briefs (localStorage + Supabase si disponible). Append
        une entrée <code style={{ fontSize: 10 }}>identity.merged</code> à l'audit log.
      </div>
      <div style={{ display:"flex", gap: 8, alignItems:"center", flexWrap:"wrap" }}>
        <input
          type="text"
          value={source}
          placeholder="Nom source (ex: CHanny Tremblay)"
          onChange={e => setSource(e.target.value)}
          disabled={busy}
          style={{ ...css.input, flex:"1 1 220px", minWidth: 200, padding:"6px 10px", fontSize: 12 }}
        />
        <span style={{ color: C.textD, fontSize: 14 }}>→</span>
        <input
          type="text"
          value={target}
          placeholder="Nom cible (ex: Channy Tremblay)"
          onChange={e => setTarget(e.target.value)}
          disabled={busy}
          style={{ ...css.input, flex:"1 1 220px", minWidth: 200, padding:"6px 10px", fontSize: 12 }}
        />
        <button
          onClick={onMerge}
          disabled={!canMerge || busy}
          style={{ ...css.btn(C.purple), padding:"6px 14px", fontSize: 12,
            opacity: (!canMerge || busy) ? .5 : 1,
            cursor: (!canMerge || busy) ? "not-allowed" : "pointer" }}>
          {busy ? "…" : "Fusionner"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.6 }}>
          {result.ok === false ? (
            <div style={{ color: C.red }}>{result.error}</div>
          ) : (
            <>
              <div style={{ color: C.text, marginBottom: 4 }}>
                <b>Local</b> ({localTotal} entité{localTotal > 1 ? "s" : ""} mise{localTotal > 1 ? "s" : ""} à jour) ·
                cases {result.local.cases} · meetings {result.local.meetings} ·
                enquêtes {result.local.investigations} · briefs {result.local.briefs}
              </div>
              <RemoteSummary remote={result.remote}/>
              {localTotal > 0 && (
                <button
                  onClick={() => window.location.reload()}
                  style={{ ...css.btn(C.em, true), padding:"4px 10px", fontSize: 11, marginTop: 8 }}>
                  Recharger pour voir les changements
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RemoteSummary({ remote }) {
  if (!remote) return null;
  if (remote.ok) {
    const b = remote.breakdown || {};
    return (
      <div style={{ color: C.textM }}>
        <b>Supabase</b> ({remote.total} ligne{remote.total > 1 ? "s" : ""} mise{remote.total > 1 ? "s" : ""} à jour) ·
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
      Supabase: échec ({remote.reason || "erreur"}). Le rewrite local a quand même été appliqué.
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

function Row({ profile, orgNameById, badge, children }) {
  const orgName = profile.organization_id ? (orgNameById[profile.organization_id] || "—") : null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap: 10, padding:"10px 12px",
      background: C.surf, border:`1px solid ${C.border}`, borderRadius: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display:"flex", alignItems:"center", gap: 8, flexWrap:"wrap" }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 500,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {profile.email || <em style={{ color: C.textD }}>(sans email)</em>}
          </div>
          {badge}
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

function RevokedBadge({ disabledAt }) {
  const { t } = useT();
  let suffix = "";
  if (disabledAt) {
    const d = new Date(disabledAt);
    if (!Number.isNaN(d.getTime())) suffix = ` · ${d.toLocaleDateString("fr-CA")}`;
  }
  return (
    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: .4, textTransform: "uppercase",
      padding: "2px 7px", borderRadius: 4, background: C.red + "18",
      border: `1px solid ${C.red}55`, color: C.red, whiteSpace: "nowrap" }}
      title={disabledAt ? `Désactivé le ${disabledAt}` : t("admin.revokedBadge")}>
      {t("admin.revokedBadge")}{suffix}
    </span>
  );
}

function RoleBadge({ role }) {
  const { t } = useT();
  const r = ROLES.includes(role) ? role : "hrbp";
  const s = ROLE_STYLE[r];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: .3,
      padding: "3px 8px", borderRadius: 4,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      whiteSpace: "nowrap", textAlign: "center", minWidth: 90 }}>
      {tRole(t, r)}
    </span>
  );
}

// Approved-row role control: super_admin sees a dropdown that fires the RPC,
// everyone else sees a read-only badge. We block self-demotion in the UI to
// match the RPC's server-side check (the RPC would reject anyway).
function RoleControl({ profile, isSuperAdmin, busy, isSelf, onChange }) {
  const { t } = useT();
  const role = ROLES.includes(profile.role) ? profile.role : "hrbp";
  if (!isSuperAdmin) return <RoleBadge role={role}/>;
  return (
    <select value={role}
      onChange={e => onChange(e.target.value)}
      disabled={busy}
      title={isSelf ? "Vous ne pouvez pas vous rétrograder" : "Rôle"}
      style={{ ...css.select, width: 130, padding:"6px 8px", fontSize: 12,
        opacity: busy ? .6 : 1 }}>
      {ROLES.map(r => (
        <option key={r} value={r}
          disabled={isSelf && r !== "super_admin"}>
          {tRole(t, r)}
        </option>
      ))}
    </select>
  );
}

function OrgSelect({ organizations, value, onChange, disabled }) {
  const { t } = useT();
  if (!organizations || organizations.length === 0) {
    return (
      <span style={{ fontSize: 11, color: C.textD, fontStyle: "italic", width: 160, textAlign: "right" }}>
        {t("admin.noOrganization")}
      </span>
    );
  }
  return (
    <select value={value || ""}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      title="Organisation"
      style={{ ...css.select, width: 180, padding:"6px 8px", fontSize: 12 }}>
      <option value="">{t("common.none")}</option>
      {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

// ── Organization status panel ────────────────────────────────────────────────
// Shows the current org's subscription status. super_admin can change it via
// the `organizations_update_super_admin` RLS policy; admins see read-only.
function OrganizationStatusPanel({ currentProfile, currentOrganization, isSuperAdmin, onUpdated }) {
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState(null);
  const [draft, setDraft] = useState(currentOrganization?.status || "");

  useEffect(() => { setDraft(currentOrganization?.status || ""); }, [currentOrganization?.status]);

  if (!currentProfile?.organization_id) {
    return (
      <div style={{ ...css.card, marginBottom: 14 }}>
        <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.textD }}/>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Statut de l'organisation</div>
        </div>
        <div style={{ fontSize: 11, color: C.textM }}>Aucune organisation assignée.</div>
      </div>
    );
  }

  const status = currentOrganization?.status || "—";
  const active = isOrgStatusActive(status);
  const swatch = active ? C.em : C.red;

  const save = async () => {
    if (!draft || draft === status) return;
    setBusy(true);
    setMsg(null);
    const res = await updateOrganizationStatus(currentProfile.organization_id, draft);
    setBusy(false);
    if (res.ok && res.organization) {
      if (typeof onUpdated === "function") onUpdated(res.organization);
      setMsg({ kind: "ok", text: `Statut mis à jour : ${res.organization.status}` });
      return;
    }
    const detail =
      res.reason === "not-allowed"     ? "rôle super_admin requis" :
      res.reason === "invalid-status"  ? "statut invalide" :
      res.reason === "no-client"       ? "Supabase non configuré" :
      (res.reason || "erreur");
    setMsg({ kind: "err", text: `Échec : ${detail}` });
  };

  return (
    <div style={{ ...css.card, marginBottom: 14 }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: swatch }}/>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
          Statut de l'organisation
          {currentOrganization?.name && (
            <span style={{ color: C.textM, fontWeight: 400 }}> · {currentOrganization.name}</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.textM, marginBottom: 10, lineHeight: 1.5 }}>
        Les statuts <b>trialing</b> et <b>active</b> donnent accès à l'application. Les statuts
        <b> past_due</b>, <b>suspended</b> et <b>cancelled</b> bloquent l'accès des membres.
      </div>
      <div style={{ display:"flex", gap: 10, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: .3,
          padding: "3px 8px", borderRadius: 4,
          background: swatch + "18", border: `1px solid ${swatch}55`, color: swatch,
          whiteSpace: "nowrap", fontFamily:"'DM Mono',monospace" }}>
          {status}
        </span>
        {isSuperAdmin ? (
          <>
            <select value={draft} disabled={busy}
              onChange={e => setDraft(e.target.value)}
              style={{ ...css.select, width: 160, padding:"6px 8px", fontSize: 12 }}>
              {ORG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={save}
              disabled={busy || !draft || draft === status}
              style={{ ...css.btn(C.em), padding:"6px 14px", fontSize: 12,
                opacity: (busy || !draft || draft === status) ? .5 : 1,
                cursor: (busy || !draft || draft === status) ? "not-allowed" : "pointer" }}>
              {busy ? "…" : "Enregistrer"}
            </button>
          </>
        ) : (
          <span style={{ fontSize: 11, color: C.textD, fontStyle:"italic" }}>
            Seul un super_admin peut modifier ce statut.
          </span>
        )}
      </div>
      {msg && (
        <div style={{ marginTop: 10, fontSize: 12,
          color: msg.kind === "ok" ? C.em : C.red }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ── Billing panel (read-only) ────────────────────────────────────────────────
// Surfaces the org's subscription, the plan it points to, and the most recent
// usage counters. Read-only for Sprint 3 — Étape 1 (Stripe not wired yet).
// Hidden when the caller has no org assigned (nothing to show).
function BillingPanel({ currentProfile }) {
  const orgId = currentProfile?.organization_id || null;
  const isSuperAdmin = currentProfile?.role === "super_admin"
    && currentProfile?.status === "approved";
  const [state, setState] = useState({ status: "idle", data: null, reason: null });
  const [reloadTick, setReloadTick] = useState(0);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialMsg,  setTrialMsg]  = useState(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeMsg,  setStripeMsg]  = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalMsg,  setPortalMsg]  = useState(null);
  const stripeEnabled = isStripeConfigured();

  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setState({ status: "no-org", data: null, reason: null });
      return () => { cancelled = true; };
    }
    setState({ status: "loading", data: null, reason: null });
    getOrganizationBilling(orgId).then(res => {
      if (cancelled) return;
      if (!res.ok) {
        setState({ status: "error", data: null, reason: res.reason || "error" });
        return;
      }
      setState({ status: "ready", data: res, reason: null });
    });
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  if (state.status === "no-org") return null;

  const onCreateTrial = async () => {
    if (!orgId) return;
    setTrialBusy(true);
    setTrialMsg(null);
    const res = await createStarterTrial(orgId);
    setTrialBusy(false);
    if (!res.ok) {
      const txt = res.reason === "not-super-admin" ? "Réservé au super_admin."
        : res.reason === "no-client"               ? "Supabase non configuré."
        : res.reason === "not-found"               ? "Plan Starter ou organisation introuvable."
        : "Échec de la création de l'essai.";
      setTrialMsg({ kind: "err", text: txt });
      return;
    }
    setTrialMsg({ kind: "ok", text: "Essai Starter provisionné." });
    setReloadTick(t => t + 1);
  };

  const onStripeUpgrade = async () => {
    setStripeBusy(true);
    setStripeMsg(null);
    const res = await startStripeCheckout();
    if (!res.ok) {
      setStripeBusy(false);
      const txt = res.reason === "no-session"   ? "Session expirée — reconnecte-toi."
        : res.reason === "no-client"            ? "Supabase non configuré."
        : res.reason === "network-error"        ? "Erreur réseau."
        : res.message                            ? res.message
        : "Échec de la création de la session Stripe.";
      setStripeMsg({ kind: "err", text: txt });
      return;
    }
    // Leave the busy flag on — the page is about to unload.
    window.location.assign(res.url);
  };

  const onOpenPortal = async () => {
    setPortalBusy(true);
    setPortalMsg(null);
    const res = await openBillingPortal();
    if (!res.ok) {
      setPortalBusy(false);
      const txt = res.reason === "no-session"   ? "Session expirée — reconnecte-toi."
        : res.reason === "no-client"            ? "Supabase non configuré."
        : res.reason === "network-error"        ? "Erreur réseau."
        : res.message                            ? res.message
        : "Échec de l'ouverture du portail de facturation.";
      setPortalMsg({ kind: "err", text: txt });
      return;
    }
    // Leave the busy flag on — the page is about to unload.
    window.location.assign(res.url);
  };

  const hasSubscription = state.status === "ready" && !!state.data?.subscription;
  const hasStripeCustomer = hasSubscription
    && !!state.data?.subscription?.stripe_customer_id;

  return (
    <div style={{ ...css.card, marginBottom: 14 }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue }}/>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Facturation</div>
      </div>
      <div style={{ fontSize: 11, color: C.textM, marginBottom: 10, lineHeight: 1.5 }}>
        Plan, statut d'abonnement, limites et consommation. Lecture seule —
        Stripe sera branché dans une étape ultérieure.
      </div>
      <BillingBody state={state} userEmail={currentProfile?.email}/>
      {stripeEnabled && state.status === "ready" && (
        <div style={{ marginTop: 12 }}>
          <button onClick={onStripeUpgrade} disabled={stripeBusy}
            style={{ ...css.btn(C.em), padding:"6px 14px", fontSize: 12,
              opacity: stripeBusy ? .6 : 1, cursor: stripeBusy ? "not-allowed" : "pointer" }}>
            {stripeBusy ? "…" : "Upgrade with Stripe"}
          </button>
          {stripeMsg && (
            <div style={{ marginTop: 8, fontSize: 12,
              color: stripeMsg.kind === "ok" ? C.em : C.red }}>
              {stripeMsg.text}
            </div>
          )}
        </div>
      )}
      {hasStripeCustomer && (
        <div style={{ marginTop: 12 }}>
          <button onClick={onOpenPortal} disabled={portalBusy}
            style={{ ...css.btn(C.blue), padding:"6px 14px", fontSize: 12,
              opacity: portalBusy ? .6 : 1, cursor: portalBusy ? "not-allowed" : "pointer" }}>
            {portalBusy ? "…" : "Gérer la facturation"}
          </button>
          {portalMsg && (
            <div style={{ marginTop: 8, fontSize: 12,
              color: portalMsg.kind === "ok" ? C.em : C.red }}>
              {portalMsg.text}
            </div>
          )}
        </div>
      )}
      {isSuperAdmin && !hasSubscription && state.status === "ready" && (
        <div style={{ marginTop: 12 }}>
          <button onClick={onCreateTrial} disabled={trialBusy}
            style={{ ...css.btn(C.blue), padding:"6px 14px", fontSize: 12,
              opacity: trialBusy ? .6 : 1, cursor: trialBusy ? "not-allowed" : "pointer" }}>
            {trialBusy ? "…" : "Create Starter Trial"}
          </button>
          {trialMsg && (
            <div style={{ marginTop: 8, fontSize: 12,
              color: trialMsg.kind === "ok" ? C.em : C.red }}>
              {trialMsg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BillingBody({ state, userEmail }) {
  if (state.status === "loading") {
    return <div style={{ fontSize: 12, color: C.textM }}>Chargement…</div>;
  }
  if (state.status === "error") {
    if (state.reason === "no-client") {
      return <div style={{ fontSize: 12, color: C.textD, fontStyle:"italic" }}>Supabase non configuré.</div>;
    }
    return <div style={{ fontSize: 12, color: C.red }}>Erreur ({state.reason}).</div>;
  }
  if (state.status !== "ready" || !state.data) return null;
  const { subscription, plan, usage } = state.data;
  if (!subscription) {
    return (
      <div style={{ fontSize: 12, color: C.textM }}>
        Aucun abonnement provisionné pour cette organisation.
      </div>
    );
  }
  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 10 }}>
      <BillingHeader subscription={subscription} plan={plan} userEmail={userEmail}/>
      <BillingLimits plan={plan}/>
      <BillingUsage usage={usage} plan={plan}/>
    </div>
  );
}

function BillingHeader({ subscription, plan, userEmail }) {
  const access = getBillingAccess(subscription, userEmail);
  const status = subscription.status || "—";
  const swatch = access.hasFullAccess ? C.em : C.amber;
  const accessLabel = access.hasFullAccess ? "Accès complet" : "Accès limité";
  return (
    <div style={{ display:"flex", gap: 10, alignItems:"center", flexWrap:"wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: .3,
        padding: "3px 8px", borderRadius: 4,
        background: swatch + "18", border: `1px solid ${swatch}55`, color: swatch,
        whiteSpace: "nowrap", fontFamily:"'DM Mono',monospace" }}>
        {status}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: swatch }}>
        {accessLabel}
      </span>
      <div style={{ fontSize: 12, color: C.text }}>
        Plan : <b>{plan ? `${plan.name} (${plan.code})` : "—"}</b>
      </div>
      {subscription.current_period_end && (
        <div style={{ fontSize: 11, color: C.textM }}>
          fin de période : {new Date(subscription.current_period_end).toLocaleDateString("fr-CA")}
        </div>
      )}
      {subscription.trial_ends_at && (
        <div style={{ fontSize: 11, color: C.textM }}>
          fin d'essai : {new Date(subscription.trial_ends_at).toLocaleDateString("fr-CA")}
        </div>
      )}
    </div>
  );
}

function BillingLimits({ plan }) {
  if (!plan) return null;
  const fmt = (v) => (v == null ? "illimité" : String(v));
  const price = (plan.monthly_price_cents || 0) / 100;
  return (
    <div style={{ fontSize: 11, color: C.textM, lineHeight: 1.6 }}>
      <b>Limites :</b> utilisateurs {fmt(plan.max_users)} · dossiers {fmt(plan.max_cases)} ·
      requêtes IA {fmt(plan.max_ai_requests)} · prix {price.toFixed(2)} $ / mois
    </div>
  );
}

function BillingUsage({ usage, plan }) {
  if (!usage || usage.length === 0) {
    return <div style={{ fontSize: 11, color: C.textD, fontStyle:"italic" }}>Aucune donnée d'usage encore enregistrée.</div>;
  }
  // Show only the latest period (newest period_start) to keep the panel tight.
  const latestPeriod = usage[0].period_start;
  const current = usage.filter(u => u.period_start === latestPeriod);
  const limitByMetric = plan ? {
    users:        plan.max_users,
    cases:        plan.max_cases,
    ai_requests:  plan.max_ai_requests,
  } : {};
  return (
    <div>
      <div style={{ fontSize: 11, color: C.textM, marginBottom: 4 }}>
        <b>Usage</b> · période : {new Date(latestPeriod).toLocaleDateString("fr-CA")}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap: 4 }}>
        {current.map(row => {
          const limit = limitByMetric[row.metric];
          const limitStr = limit == null ? "illimité" : limit;
          return (
            <div key={row.id} style={{ fontSize: 11, color: C.text, fontFamily:"'DM Mono',monospace" }}>
              {row.metric} : {String(row.value)} / {limitStr}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Export organization data panel ───────────────────────────────────────────
// Builds a JSON snapshot of every org-scoped table the caller can read under
// RLS and triggers a browser download. Visible only to admin / super_admin.
function ExportOrganizationPanel({ currentProfile }) {
  const role = currentProfile?.role;
  const allowed = role === "admin" || role === "super_admin";
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState(null);

  if (!allowed) return null;

  const onExport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await buildOrganizationExport();
      if (!res.ok) {
        setMsg({ kind: "err", text: "Export indisponible. Réessayez plus tard." });
        return;
      }
      const ok = downloadExportFile(res.json, res.filename);
      setMsg(ok
        ? { kind: "ok",  text: `Téléchargement déclenché : ${res.filename}` }
        : { kind: "err", text: "Export indisponible. Réessayez plus tard." });
    } catch {
      setMsg({ kind: "err", text: "Export indisponible. Réessayez plus tard." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...css.card, marginBottom: 14 }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue }}/>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Export Organization Data</div>
      </div>
      <div style={{ fontSize: 11, color: C.textM, marginBottom: 10, lineHeight: 1.5 }}>
        Télécharge un instantané JSON de toutes les données de votre organisation
        (employés, dossiers, rencontres, enquêtes, briefs, tâches, journal d'audit).
      </div>
      <button onClick={onExport} disabled={busy}
        style={{ ...css.btn(C.blue), padding:"6px 14px", fontSize: 12,
          opacity: busy ? .6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
        {busy ? "…" : "Export Organization Data"}
      </button>
      {msg && (
        <div style={{ marginTop: 10, fontSize: 12,
          color: msg.kind === "ok" ? C.em : C.red }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ── Rename panel (single-name typo correction) ───────────────────────────────
// Thin admin-surface wrapper around the shared `IdentityRenameForm`. The form
// owns all state and calls the existing identity helpers/services.
function RenameIdentityPanel() {
  return (
    <div style={{ ...css.card, marginBottom: 14 }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.teal }}/>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Renommer un employé / gestionnaire</div>
      </div>
      <div style={{ fontSize: 11, color: C.textM, marginBottom: 10, lineHeight: 1.5 }}>
        Corrige une typo dans un nom (ex&nbsp;: <i>CHanny Tremblay</i> → <i>Channy Tremblay</i>).
        <b> Preview</b> compte les occurrences sans rien écrire ; <b>Appliquer</b> exécute le rename
        sur localStorage et Supabase (si disponible).
      </div>
      <IdentityRenameForm/>
    </div>
  );
}
