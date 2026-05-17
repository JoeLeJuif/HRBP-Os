// ── SaaS Metrics panel ───────────────────────────────────────────────────────
// Super-admin-only cockpit surfaced inside Admin. Pulls aggregate counters via
// `services/saasMetrics.getSaaSMetrics()` (RLS does the gating; non-super_admin
// callers would only see their own-org numbers, so the parent gates rendering
// on currentProfile.role === "super_admin" before this is mounted).
//
// No charts and no Stripe API calls in this phase — just KPI cards grouped by
// theme (Organizations, Billing, Trials, Usage, Adoption).

import React, { useState, useEffect, useCallback } from "react";
import { C, css } from "../theme.js";
import { getSaaSMetrics } from "../services/saasMetrics.js";

export default function SaaSMetricsPanel() {
  const [status, setStatus]   = useState("loading"); // loading | ready | error
  const [metrics, setMetrics] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    const res = await getSaaSMetrics();
    if (!res.ok) {
      setStatus("error");
      setErrorMsg(
        res.reason === "no-client" ? "Supabase non configuré." :
        res.reason === "query-error" ? "Échec du chargement des métriques." :
        (res.reason || "Erreur inconnue.")
      );
      return;
    }
    setMetrics(res.metrics);
    setStatus("ready");
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ ...css.card, marginBottom: 14 }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.teal }}/>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
          Métriques SaaS
          <span style={{ color: C.textM, fontWeight: 400 }}> · super_admin</span>
        </div>
        <div style={{ flex: 1 }}/>
        <button onClick={load} disabled={status === "loading"}
          style={{ ...css.btn(C.em, true), padding:"4px 10px", fontSize: 11,
            opacity: status === "loading" ? .6 : 1 }}>
          {status === "loading" ? "…" : "Rafraîchir"}
        </button>
      </div>

      <div style={{ fontSize: 11, color: C.textM, marginBottom: 12, lineHeight: 1.5 }}>
        Cockpit santé SaaS — comptages agrégés tous tenants. Lecture seule, pas d'appels Stripe.
      </div>

      {status === "loading" && (
        <div style={{ fontSize: 12, color: C.textM, padding: "8px 0" }}>Chargement…</div>
      )}

      {status === "error" && (
        <div style={{ fontSize: 12, color: C.red, padding: "8px 0" }}>{errorMsg}</div>
      )}

      {status === "ready" && metrics && (
        <div style={{ display:"flex", flexDirection:"column", gap: 14 }}>
          <Group title="Organisations" color={C.em}>
            <Kpi label="Total"          value={metrics.organizations.total}/>
            <Kpi label="Actives"        value={metrics.organizations.active}/>
            <Kpi label="En essai"       value={metrics.organizations.trial}/>
            <Kpi label="Suspendues / annulées" value={metrics.organizations.suspendedOrCancelled}/>
          </Group>

          <Group title="Abonnements" color={C.blue}>
            <Kpi label="Active"          value={metrics.subscriptions.active}/>
            <Kpi label="Trialing"        value={metrics.subscriptions.trialing}/>
            <Kpi label="Past due"        value={metrics.subscriptions.pastDue} accent={metrics.subscriptions.pastDue > 0 ? C.amber : null}/>
            <Kpi label="Canceled"        value={metrics.subscriptions.canceled}/>
            <Kpi label="Unpaid / incomplete" value={metrics.subscriptions.unpaidOrIncomplete} accent={metrics.subscriptions.unpaidOrIncomplete > 0 ? C.red : null}/>
          </Group>

          <Group title="Revenu estimé" color={C.purple}>
            {metrics.revenue.available ? (
              <>
                <Kpi label="MRR" value={formatCurrency(metrics.revenue.mrrCents)}/>
                <Kpi label="ARR" value={formatCurrency(metrics.revenue.arrCents)}/>
                {Object.entries(metrics.revenue.byPlanCents).map(([code, cents]) => (
                  <Kpi key={code}
                    label={`Plan ${code}`}
                    value={formatCurrency(cents)}/>
                ))}
              </>
            ) : (
              <Kpi label="MRR / ARR" value="N/A" hint="Aucun prix de plan ou aucun abonnement actif"/>
            )}
          </Group>

          <Group title="Essais (trials)" color={C.amber}>
            <Kpi label="Actifs" value={metrics.trials.active}/>
            <Kpi label="Expirent ≤ 7 jours" value={metrics.trials.expiringIn7Days}
              accent={metrics.trials.expiringIn7Days > 0 ? C.amber : null}/>
            <Kpi label="Expirés non convertis" value={metrics.trials.expiredNotConverted}
              accent={metrics.trials.expiredNotConverted > 0 ? C.red : null}/>
          </Group>

          <Group title="Utilisation produit" color={C.teal}>
            <Kpi label="Utilisateurs"    value={metrics.usage.totalUsers}/>
            <Kpi label="Cases"           value={metrics.usage.totalCases}/>
            <Kpi label="Rencontres"      value={metrics.usage.totalMeetings}/>
            <Kpi label="Enquêtes"        value={metrics.usage.totalInvestigations}/>
          </Group>

          <Group title="Adoption" color={C.pink}>
            <Kpi label="Cases / org (moy.)"
              value={formatRate(metrics.adoption.avgCasesPerOrg)}/>
            <Kpi label="Rencontres / org (moy.)"
              value={formatRate(metrics.adoption.avgMeetingsPerOrg)}/>
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, color, children }) {
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }}/>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: .4,
          textTransform: "uppercase", color: C.textM }}>
          {title}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))",
        gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, hint }) {
  const valueColor = accent || C.text;
  return (
    <div style={{ background: C.surf, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: C.textM, marginBottom: 4,
        textTransform: "uppercase", letterSpacing: .3,
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: valueColor,
        fontFamily:"'DM Mono',monospace",
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: C.textD, marginTop: 4, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function formatCurrency(cents) {
  const dollars = (Number(cents) || 0) / 100;
  return `${dollars.toFixed(2)} $ / mois`;
}

function formatRate(n) {
  const v = Number(n) || 0;
  return v.toFixed(1);
}
