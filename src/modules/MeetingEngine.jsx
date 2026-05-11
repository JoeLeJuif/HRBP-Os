// ── Module: Meeting Engine ───────────────────────────────────────────────────
// Fusion of 1:1 Engine + Meetings transcript analysis.
// Based on Prep1on1.jsx — enhanced output via MEETING_ENGINE_SP.

import { useState, useEffect } from "react";
import { C, css, RISK, DELAY_C, INV_RED } from '../theme.js';
import { buildLegalPromptContext, isLegalSensitive } from '../utils/legal.js';
import { normKey } from '../utils/format.js';
import { emptyMeta, setMeta, getLeadersMap } from '../utils/leaderStore.js';
import { callAI } from '../api/index.js';
import { MEETING_ENGINE_SP } from '../prompts/meetingEngine.js';
import { normalizeMeetingOutput, toArray } from '../utils/meetingModel.js';
import { generateInvestigationTitle } from './Investigation.jsx';
import { ENGINE_MEETING_TYPES } from '../utils/engineMeetingTypes.js';
import { useT } from '../lib/i18n.js';
import Mono          from '../components/Mono.jsx';
import Badge         from '../components/Badge.jsx';
import AILoader      from '../components/AILoader.jsx';
import ProvinceSelect from '../components/ProvinceSelect.jsx';
import { isCaseActive } from '../utils/caseStatus.js';

// ── Inline shared helper ──────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const r = RISK[level] || RISK["Modéré"];
  return <Badge label={level} color={r.color} />;
}

// ── Static data ───────────────────────────────────────────────────────────────
const PREP_QUESTIONS_DB = {
  objectives: [
    "Obtenir une lecture directe de l'état de l'équipe, au-delà des indicateurs formels.",
    "Identifier les tensions non verbalisées ou les risques émergents sur les personnes.",
    "Valider l'alignement du gestionnaire avec les priorités RH et les valeurs organisationnelles.",
    "Anticiper les enjeux qui pourraient remonter avant la prochaine revue de performance.",
    "Positionner le HRBP comme partenaire stratégique, pas seulement administratif.",
  ],
  strategic: [
    "Quels sont tes 2-3 enjeux les plus préoccupants en ce moment — sur les personnes, pas les projets ?",
    "Si tu avais à identifier le risque RH numéro 1 dans ton équipe cette semaine, ce serait quoi ?",
    "Est-ce que tu as l'impression d'avoir les bonnes personnes aux bons endroits pour les 12 prochains mois ?",
    "Qu'est-ce qui s'est passé dans ton équipe depuis notre dernière rencontre qui t'a surpris ?",
  ],
  people: [
    "Qui dans ton équipe performe au-dessus de tes attentes ? Qu'est-ce qui l'explique ?",
    "Y a-t-il quelqu'un dont tu es moins certain·e de l'engagement ou de la trajectoire en ce moment ?",
    "As-tu des personnes clés dont tu perçois un risque de rétention ou d'épuisement ?",
    "Est-ce qu'il y a des dynamiques interpersonnelles que tu surveilles de près ?",
  ],
  org: [
    "Est-ce que la structure actuelle de ton équipe est encore adaptée à vos priorités ?",
    "Y a-t-il des rôles ou des responsabilités qui créent de la confusion ou des frictions ?",
    "As-tu des besoins de ressources ou de changement de périmètre à court terme ?",
    "Comment est la collaboration avec les autres équipes — tensions, dépendances à risque ?",
  ],
  leadership: [
    "Comment tu te sens toi-même dans ton rôle en ce moment — charge, clarté, soutien ?",
    "Est-ce qu'il y a des situations managériales que tu trouves difficiles à gérer seul·e ?",
    "Comment perçois-tu ta propre efficacité comme gestionnaire sur les dernières semaines ?",
    "Y a-t-il des décisions que tu remets à plus tard sur lesquelles tu aimerais qu'on travaille ?",
  ],
  performance: [
    "Qui sont tes A-players en ce moment, et est-ce qu'ils sont bien positionnés pour réussir ?",
    "As-tu des situations de performance insuffisante qui nécessitent une intervention formelle ?",
    "Comment se passe la gestion de la performance au quotidien — feedbacks, clarté des attentes ?",
    "Y a-t-il des talents à risque de partir ou de décrocher auxquels on devrait porter attention ?",
  ],
  capacity: [
    "Comment tu évalues la charge de travail globale de ton équipe en ce moment — soutenable ?",
    "Est-ce qu'il y a des personnes ou des sous-équipes en surcharge ? Des goulets d'étranglement ?",
    "As-tu des préoccupations liées à des absences, congés ou transitions à venir ?",
    "Quels sont tes besoins en développement ou en formation dans les 3 à 6 prochains mois ?",
  ],
};

const SIGNALS_DB = {
  disengagement: ["Moins de proactivité, participation en retrait lors des réunions","Réponses monosyllabiques, évitement des discussions sur les projets","Absences plus fréquentes ou départs précipités","Diminution de la qualité du travail sans raison apparente"],
  burnout: ["Irritabilité ou cynisme inhabituel dans les échanges","Mentions fréquentes de surcharge, de fatigue ou de manque de temps","Difficulté à déléguer ou à lâcher prise sur les tâches","Congés de maladie récurrents ou non posés malgré le besoin apparent"],
  retention: ["Questions sur les opportunités internes ou les progressions de carrière","Comparaisons avec d'autres employeurs ou d'autres équipes","Attitudes indifférentes face aux reconnaissances ou promotions","Signaux LinkedIn — activité accrue, mise à jour du profil"],
  tensions: ["Commentaires indirects sur les comportements d'autres membres","Évitement ou plaintes récurrentes liées à des collègues précis","Conflits autour des responsabilités ou des priorités","Silences ou non-dits perceptibles lors d'échanges d'équipe"],
  leadership: ["Hésitation à prendre des décisions ou à donner du feedback difficile","Gestion par l'évitement — problèmes non adressés depuis longtemps","Micromanagement ou délégation insuffisante","Manque d'alignement visible avec la culture ou les valeurs organisationnelles"],
  org: ["Confusion sur les rôles, chevauchements ou zones grises fréquentes","Décisions qui ne se prennent pas par manque de clarté sur l'imputabilité","Résistance passive à des changements organisationnels","Structures informelles contournant la hiérarchie formelle"],
  succession: ["Absence de backup ou de plan de relève pour les rôles critiques","Dépendance trop forte à une ou deux personnes clés","Talents à fort potentiel non développés ou sous-utilisés","Aucune conversation de développement depuis plus de 6 mois"],
};

const GUIDANCE_DB = {
  positioning: ["Ouvrir avec une question large et stratégique, pas administrative.","Montrer que tu as lu les signaux de la dernière rencontre — démontre ta présence.","Nommer les enjeux systémiques avant les cas individuels — pense à la forêt, pas aux arbres.","Te positionner comme allié dans la décision, pas comme policier de la conformité."],
  challenge: ["Reformuler ce que le gestionnaire dit pour l'aider à voir ses angles morts sans l'attaquer.","Utiliser 'Qu'est-ce qui te retient de…?' plutôt que 'Tu devrais…'","Nommer l'inconfort avec bienveillance : 'J'entends que c'est inconfortable, et c'est normal ici.'","Offrir une perspective externe : 'Ce que j'observe depuis ma position, c'est que…'"],
  redirect: ["Si la conversation devient trop opérationnelle : 'Là tu me décris le quoi — dis-moi plutôt l'impact humain.'","Ramener aux personnes : 'Intéressant. Et dans ton équipe, comment c'est vécu ?'","Recadrer sur le rôle RH : 'Mon angle ici, c'est les gens. Dis-moi ce que ça fait comme pression sur eux.'","Valider puis élever : 'Je comprends l'enjeu opérationnel. Et si on regarde ça du côté talent/culture ?'"],
  probe: ["Demander des exemples concrets : 'Tu peux me donner une situation récente ?'","Creuser les intuitions : 'Tu dis que tu le sens — qu'est-ce qui te donne ce signal ?'","Explorer la durée : 'C'est quelque chose de récent ou tu observes ça depuis longtemps ?'","Tester la cohérence : 'Et ça, tu l'as partagé avec la personne concernée ?'"],
  hidden_risks: ["Ce qui n'est PAS dit est souvent plus révélateur que ce qui l'est — noter les silences.","Les enjeux framés comme 'opérationnels' cachent souvent des enjeux relationnels.","Un gestionnaire très 'tout va bien' sans nuances mérite une attention particulière.","Les changements de ton, de rythme de parole ou d'énergie sont des données RH."],
};

const FALLBACK_PREP = {
  objective: { purpose: "Faire le point sur l'état de l'équipe et les priorités RH du gestionnaire.", expectedOutcome: "Identifier 2-3 actions concrètes à mettre en place d'ici la prochaine rencontre." },
  priorityIssues: [{ issue: "Enjeux à identifier selon le contexte", why: "Génération IA non disponible — compléter manuellement.", riskLevel: "Modéré" }],
  recommendedApproach: { how: "Ouvrir avec une question large stratégique, puis sonder les enjeux personnes.", tone: "Partenaire stratégique — allié, pas policier.", pitfalls: ["Éviter de rester dans l'opérationnel", "Ne pas surinterpréter un commentaire isolé"] },
  suggestedPhrasing: [
    { type: "Ouverture", text: "Qu'est-ce qui te préoccupe le plus en ce moment sur ton équipe ?" },
    { type: "Recadrage", text: "J'entends l'enjeu opérationnel — dis-moi ce que ça fait comme pression sur les personnes." },
  ],
  context: { summary: "Contexte non disponible — génération IA échouée.", relevantHistory: "Non disponible", keySignals: [] },
  followUpFromLast1on1: { evolutions: [], stagnations: [], newRisks: [] },
  recommendedActions: [{ action: "Valider les priorités et l'état de l'équipe avec le gestionnaire", priority: "Modéré" }],
  overallPriority: "Modéré",
};

const LEVEL_CONTEXT = {
  gestionnaire: "Focus opérationnel : cas employés individuels, suivis concrets, actions de gestion quotidienne, coaching terrain.",
  directeur:    "Focus équipe/système : dynamiques d'équipe, qualité de gestion des gestionnaires, patterns systémiques, arbitrages RH.",
  vp:           "Focus risques stratégiques : talents critiques, tensions inter-équipes, structure organisationnelle, impact business des enjeux RH.",
  executif:     "Focus transformation : leadership bench, risques culturels, enjeux organisationnels majeurs, alignement stratégique.",
  employe:      "Focus individuel : situation personnelle de l'employé, performance, bien-être, engagement, plan de développement, accommodements, retour au travail. Ton empathique et orienté solution.",
  hrbp_team:    "Focus équipe RH : collaboration interne HRBP, alignement pratiques RH, partage de connaissances, développement de l'équipe RH, enjeux opérationnels RH.",
  ta_team:      "Focus acquisition de talents : prise de besoin, profil de poste, pipeline candidats, délais, enjeux de recrutement, feedback hiring manager, stratégie d'attraction. Ton consultatif et orienté résultats.",
  autres:       "Focus général : situation spécifique à documenter, contexte particulier, suivi ad hoc selon le besoin identifié.",
};

const PREP_MEETING_TYPES = [
  {value:"regular",  labelKey:"prep1on1.meetingType.regular"},
  {value:"perf",     labelKey:"prep1on1.meetingType.perf"},
  {value:"org",      labelKey:"prep1on1.meetingType.org"},
  {value:"talent",   labelKey:"prep1on1.meetingType.talent"},
  {value:"concern",  labelKey:"prep1on1.meetingType.concern"},
  {value:"strategic",labelKey:"prep1on1.meetingType.strategic"},
];
const PREP_FUNCTIONS = [
  {value:"",         labelKey:"prep1on1.function.placeholder"},
  {value:"IT",       labelKey:"prep1on1.function.it"},
  {value:"network",  labelKey:"prep1on1.function.network"},
  {value:"ops",      labelKey:"prep1on1.function.ops"},
  {value:"finance",  labelKey:"prep1on1.function.finance"},
  {value:"corporate",labelKey:"prep1on1.function.corporate"},
  {value:"hr",       labelKey:"prep1on1.function.hr"},
  {value:"other",    labelKey:"prep1on1.function.other"},
];

// ── Prep metadata per engine type (checklist + flow) ─────────────────────────
const PREP_META = {
  disciplinaire: {
    checklist:["Faits documentés (dates, lieux, témoins)","Politique applicable identifiée et citée","Historique disciplinaire de l'employé revu","Mesure envisagée (avis écrit / suspension / etc.)","Avis légal obtenu si requis selon la province","Représentant syndical avisé si applicable"],
    flow:["Ouverture neutre","Faits reprochés","Politique enfreinte","Réponse de l'employé","Mesure appliquée","Prochaines étapes et droit d'appel"],
  },
  performance: {
    checklist:["Données objectives (KPIs, exemples concrets)","Attentes communiquées antérieurement","Historique des feedbacks donnés","Plan de soutien proposé (PIP si requis)","Échéancier réaliste des mesures"],
    flow:["Ouverture","Constat objectif","Écart vs attentes","Discussion ouverte","Plan de soutien","Suivi convenu"],
  },
  coaching: {
    checklist:["Forces observées récemment","Zones de développement prioritaires","Aspirations de carrière de l'employé","Objectifs SMART à proposer","Engagement du gestionnaire (temps, ressources)"],
    flow:["Ouverture positive","Forces reconnues","Zones de croissance","Aspirations","Objectifs co-construits","Engagement mutuel"],
  },
  recadrage: {
    checklist:["Comportement précis et observable","Impact concret sur l'équipe / le travail","Attentes claires pour l'avenir","Conséquences si récidive","Soutien offert pour réussir"],
    flow:["Ouverture","Comportement observé","Impact","Attente claire","Engagement","Conséquence si récidive"],
  },
  mediation: {
    checklist:["Position de chaque partie écoutée séparément","Faits neutres documentés","Émotions reconnues sans jugement","Terrain commun identifié","Objectif de résolution mutuellement accepté"],
    flow:["Cadre et règles","Position partie A","Position partie B","Faits neutres","Terrain commun","Engagements mutuels"],
  },
  enquete: {
    checklist:["Allégations documentées par écrit","Parties impliquées identifiées","Confidentialité expliquée et garantie","Questions ouvertes préparées","Avis légal obtenu sur le processus","Prochaines étapes définies"],
    flow:["Cadre et confidentialité","Récit du témoin","Questions de précision","Documents cités","Engagements de confidentialité","Prochaines étapes"],
  },
  suivi: {
    checklist:["Décisions et engagements précédents revus","Écarts observés depuis la dernière rencontre","Obstacles rencontrés","Ajustements requis au plan initial","Prochaine étape claire"],
    flow:["Rappel du contexte","Engagements pris","Écarts observés","Obstacles","Ajustements","Prochaine étape"],
  },
  transition: {
    checklist:["Contexte du changement clair","Impacts concrets sur l'employé","Calendrier et étapes documentés","Soutien disponible (formation, mentorat)","Questions anticipées préparées"],
    flow:["Contexte","Annonce claire","Impacts","Calendrier","Soutien offert","Questions et engagement"],
  },
};

const ENGINE_TYPES = ENGINE_MEETING_TYPES;

function PrepObsSelector({ label, values }) {
  const [selected, setSelected] = useState(null);
  const colors = [C.em, C.teal, C.amber, C.red];
  return (
    <div>
      <div style={{ fontSize:11, color:C.textM, marginBottom:6, fontWeight:500 }}>{label}</div>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {values.map((v,i) => (
          <button key={i} onClick={() => setSelected(i)} style={{
            background: selected===i ? colors[i]+"25" : "transparent",
            border:`1px solid ${selected===i ? colors[i]+"80" : C.border}`,
            borderRadius:5, padding:"5px 10px", fontSize:11,
            color: selected===i ? colors[i] : C.textD, cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif", textAlign:"left", transition:"all .15s",
          }}>{v}</button>
        ))}
      </div>
    </div>
  );
}

// ── FALLBACK OUTPUT ──────────────────────────────────────────────────────────
const FALLBACK_OUTPUT = {
  meetingTitle: "Rencontre completee", director: null,
  summary: ["Voir les notes manuelles."],
  people: { performance: [], leadership: [], engagement: [] },
  signals: [], risks: [], decisions: [],
  actions: [{ action: "Faire le suivi", owner: "HRBP", delai: "7 jours", priorite: "Normale" }],
  overallRisk: "Modere", overallRiskRationale: "A evaluer", hrbpKeyMessage: "Completer l analyse manuellement.",
  strategieHRBP: { lectureGestionnaire: { style: "A identifier", forces: "", angle: "" }, santeEquipe: { performance: "Correcte", engagement: "Modere", dynamique: "" }, risqueCle: { nature: "A identifier", niveau: "Modere", rationale: "" }, postureHRBP: { mode: "Coach", rationale: "" }, strategieInfluence: "", objectifRencontre: "" },
  keySignals: [], mainRisks: [], hrbpFollowups: ["Reviser les notes"],
  nextMeetingContext: "", nextMeetingQuestions: [], crossQuestions: [], caseEntry: null,
};

// Per-type overrides layered on top of FALLBACK_OUTPUT when the AI call fails.
// Only covers types where a contextual hint is clearly more useful than the generic text.
const FALLBACK_BY_TYPE = {
  "1on1": {
    meetingTitle: "1:1 — a completer",
    summary: ["Rencontre 1:1 a documenter manuellement.", "Revoir les notes relationnelles et de continuite."],
    hrbpKeyMessage: "Generation IA indisponible — completer le 1:1 manuellement a partir des notes.",
    hrbpFollowups: ["Relire les notes", "Identifier signaux relationnels", "Planifier le prochain 1:1"],
  },
  disciplinaire: {
    meetingTitle: "Rencontre disciplinaire — a completer",
    summary: ["Rencontre disciplinaire a documenter manuellement.", "Verifier cadre juridique et progressivite des mesures."],
    hrbpKeyMessage: "Generation IA indisponible — completer manuellement avec cadre juridique et faits.",
    overallRisk: "Eleve",
    cadreJuridique: { politiquesVisees: [], loisApplicables: [], progressivite: "a justifier", progressiviteNote: "A completer manuellement" },
    sanctions: [],
    risquesLegaux: [],
    hrbpFollowups: ["Documenter les faits", "Valider la progressivite", "Consulter contexte legal"],
  },
  performance: {
    meetingTitle: "Rencontre performance — a completer",
    summary: ["Discussion de performance a documenter manuellement.", "Definir ecarts mesurables et plan 30-60-90."],
    hrbpKeyMessage: "Generation IA indisponible — completer manuellement ecarts, attentes et jalons.",
    hrbpFollowups: ["Lister KPIs en ecart", "Clarifier attentes", "Definir jalons 30-60-90 jours"],
    actions: [{ action: "Definir plan d amelioration 30-60-90 jours", owner: "HRBP + Gestionnaire", delai: "7 jours", priorite: "Elevee" }],
  },
  mediation: {
    meetingTitle: "Mediation — a completer",
    summary: ["Mediation a documenter manuellement.", "Positions, perceptions et attentes des deux parties a clarifier."],
    hrbpKeyMessage: "Generation IA indisponible — completer manuellement les positions et le terrain commun.",
    hrbpFollowups: ["Recueillir position partie A", "Recueillir position partie B", "Identifier terrain commun"],
    partieA: { nom: "", position: "", perception: "", attentes: [] },
    partieB: { nom: "", position: "", perception: "", attentes: [] },
  },
  enquete: {
    meetingTitle: "Entrevue d enquete — a completer",
    summary: ["Entrevue d enquete a documenter manuellement.", "Faits, temoins et chronologie a clarifier."],
    hrbpKeyMessage: "Generation IA indisponible — completer manuellement faits et cadre legal.",
    overallRisk: "Eleve",
    cadreJuridique: { politiquesVisees: [], loisApplicables: [], progressivite: "non applicable", progressiviteNote: "Contexte d enquete" },
    risquesLegaux: [],
    hrbpFollowups: ["Documenter la chronologie", "Identifier les temoins", "Verifier le cadre legal"],
  },
};

function buildFallbackOutput(engineType) {
  return { ...FALLBACK_OUTPUT, ...(FALLBACK_BY_TYPE[engineType] || {}) };
}

// ── Case candidate detection ────────────────────────────────────────────────
// Maps engine types to default Case Log type ids (see Cases.jsx CASE_TYPES).
const ENGINE_TO_CASE_TYPE = {
  "1on1":          "conflict_ee",
  disciplinaire:   "investigation",
  performance:     "performance",
  coaching:        "retention",
  recadrage:       "performance",
  mediation:       "conflict_ee",
  enquete:         "investigation",
  suivi:           "conflict_ee",
  transition:      "reorg",
};

const HIGH_RISK_TOKENS = ["élev", "eleve", "critique", "high", "critical"];
const isHighRisk = (lvl) => {
  const s = String(lvl || "").toLowerCase();
  return HIGH_RISK_TOKENS.some(t => s.includes(t));
};

// Detect case candidates from a normalized AI output. Returns up to N items
// with shape: { id, title, type, riskLevel, summary, source }.
function detectCaseCandidates(output, engineType, meetingId) {
  if (!output) return [];
  const items = [];
  const seen = new Set();
  const fallbackType = ENGINE_TO_CASE_TYPE[engineType] || "conflict_ee";
  const overallRisk = output.overallRisk || "Modéré";

  const push = (cand) => {
    const key = String(cand.title || "").toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(cand);
  };

  // 1) Primary: AI-suggested caseEntry (always include if present)
  const ce = output.caseEntry;
  if (ce && (ce.titre || ce.title)) {
    push({
      id: `cand_${meetingId}_main`,
      title: ce.titre || ce.title,
      type: ce.type || fallbackType,
      riskLevel: ce.risque || ce.riskLevel || overallRisk,
      summary: ce.situation || ce.notes || "",
      source: "caseEntry",
    });
  }

  // 2) Legal risks (always treated as high signal)
  toArray(output.risquesLegaux).forEach((rl, i) => {
    const text = typeof rl === "string"
      ? rl
      : (rl?.risque || rl?.risk || rl?.titre || rl?.title || rl?.description || "");
    if (!text) return;
    push({
      id: `cand_${meetingId}_legal_${i}`,
      title: String(text).slice(0, 90),
      type: "investigation",
      riskLevel: (rl && (rl.severite || rl.severity)) || "Élevé",
      summary: (rl && (rl.description || rl.mitigation)) || String(text),
      source: "legal-risk",
    });
  });

  // 3) High-priority risks from risks / mainRisks
  const riskItems = [...toArray(output.risks), ...toArray(output.mainRisks)];
  riskItems.forEach((r, i) => {
    const obj = (r && typeof r === "object") ? r : null;
    const text = obj
      ? (obj.risque || obj.risk || obj.titre || obj.title || obj.description || "")
      : String(r || "");
    if (!text) return;
    const lvl = obj ? (obj.niveau || obj.level || obj.priorite || obj.priority) : null;
    if (!isHighRisk(lvl) && !isHighRisk(overallRisk)) return;
    push({
      id: `cand_${meetingId}_risk_${i}`,
      title: String(text).slice(0, 90),
      type: fallbackType,
      riskLevel: typeof lvl === "string" ? lvl : "Élevé",
      summary: obj ? (obj.description || obj.mitigation || text) : text,
      source: "risk",
    });
  });

  return items.slice(0, 6);
}

// ── Build investigation context block for AI prompt enrichment ──────────────
// Pulls from inv.caseData (caseSummary, plan, findings) — only what is set.
function buildInvestigationCtxBlock(inv) {
  if (!inv) return "";
  const cs = inv.caseData?.caseSummary || {};
  const p  = inv.caseData?.investigationPlan || {};
  const f  = inv.caseData?.findings || {};
  const parties = (cs.parties || []).map(x => `${x.role}: ${x.description}`).join(" | ");
  const lines = [
    `\nINVESTIGATION LIEE (id=${inv.id}):`,
    `Dossier: ${inv.caseId || ""} — ${inv.caseTitle || inv.title || ""}`,
    inv.caseType ? `Type: ${inv.caseType}` : "",
    inv.urgencyLevel ? `Urgence: ${inv.urgencyLevel}` : "",
    cs.situation ? `Situation: ${cs.situation}` : "",
    cs.triggerEvent ? `Declencheur: ${cs.triggerEvent}` : "",
    cs.thresholdAnalysis ? `Analyse seuil: ${cs.thresholdAnalysis}` : "",
    parties ? `Parties: ${parties}` : "",
    p.mandate ? `Mandat: ${p.mandate}` : "",
    (p.objectives || []).length ? `Objectifs: ${p.objectives.join("; ")}` : "",
    f.overallFinding ? `Conclusion actuelle: ${f.overallFinding}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

// ── Manager dropdown + free-text fallback ─────────────────────────────────────
function ManagerField({ data, ctx, setCtx, managerManual, setManagerManual, t }) {
  const leadersList = Object.values(data.leaders || {})
    .map(l => l.name || "")
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  const knownSet = new Set(leadersList.map(n => normKey(n)));
  const curNk = ctx.managerName ? normKey(ctx.managerName) : "";
  const isKnown = curNk && knownSet.has(curNk);

  // Determine select value
  const selectVal = managerManual ? "__manual__"
    : isKnown ? ctx.managerName
    : "";

  return (
    <div style={{marginBottom:12}}>
      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
        Nom de l’employé
      </div>
      <select
        value={selectVal}
        onChange={e => {
          const v = e.target.value;
          if (v === "__manual__") {
            setManagerManual(true);
            setCtx(p => ({...p, managerName: ""}));
          } else {
            setManagerManual(false);
            setCtx(p => ({...p, managerName: v}));
          }
        }}
        style={{...css.select}}>
        <option value="" style={{background:C.surfL}}>{t("meetingEngine.manager.selectPh")}</option>
        {leadersList.map(n => (
          <option key={n} value={n} style={{background:C.surfL}}>{n}</option>
        ))}
        <option value="__manual__" style={{background:C.surfL}}>{t("meetingEngine.manager.manualOption")}</option>
      </select>
      {managerManual && (
        <input
          value={ctx.managerName}
          onChange={e => setCtx(p => ({...p, managerName: e.target.value}))}
          placeholder={t("prep1on1.context.managerNamePh")}
          style={{...css.input, marginTop:6}}
          onFocus={e => e.target.style.borderColor = C.em}
          onBlur={e => e.target.style.borderColor = C.border}
          autoFocus/>
      )}
    </div>
  );
}

export default function MeetingEngine({ data, onSave, onNavigate, level = "gestionnaire" }) {
  const { t } = useT();

  // ── State ────────────────────────────────────────────────────────────────
  const [pTab, setPTab]           = useState("context");
  const [engineType, setEngineType] = useState("1on1");
  const [niveau, setNiveau]         = useState("gestionnaire");
  const [ctx, setCtx]             = useState({
    managerName:"", team:"", date:"", meetingType:"regular",
    purpose:"", background:"", activeCases:"", recentData:"", alerts:"",
  });
  const [managerManual, setManagerManual] = useState(false); // true = free-text mode
  const [prep, setPrep]           = useState(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepAI, setPrepAI]       = useState(false);
  const [notes, setNotes]         = useState({ people:"", performance:"", risks:"", org:"", leadership:"", actions:"", followups:"" });
  const [meetingAnalysis, setMeetingAnalysis] = useState({ transcript:"", keyPoints:"" });
  const [output, setOutput]       = useState(null);
  const [outputLoading, setOutputLoading] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [saved1on1, setSaved1on1] = useState(false);
  const [prepPrompt, setPrepPrompt] = useState("");
  const [outputPrompt, setOutputPrompt] = useState("");
  const [sigExp, setSigExp]       = useState({});
  const [histExp, setHistExp]     = useState({});
  const [linkedInvestigationId, setLinkedInvestigationId] = useState(null);
  // Case candidate review (post-archive)
  const [caseCandidates, setCaseCandidates] = useState([]);
  const [candidateActions, setCandidateActions] = useState({}); // id -> "created" | "ignored"
  const [showCandidatesModal, setShowCandidatesModal] = useState(false);
  const [archivedMeetingId, setArchivedMeetingId] = useState(null);

  // ── Phase 0 — Unification Meeting ↔ Enquête ─────────────────────────────
  // Règle : un meeting de type "enquete" doit toujours être rattaché à un
  // dossier d'enquête. Bloque generateOutput/save tant que le lien manque.
  const needsInvestigationLink = engineType === "enquete" && !linkedInvestigationId;

  // ── Phase 1 — Création express d'un dossier minimal depuis Meeting Engine
  // Crée un dossier "draft" directement sans quitter l'écran. Aucun appel
  // IA : les sections INV_SP_1/2 sont enrichies plus tard depuis le module
  // Investigation. Le lien linkedInvestigationId est établi immédiatement.
  const makeExpressCaseId = (existing) => {
    const year = new Date().getFullYear();
    const existingIds = new Set((existing || []).map(i => i.caseId).filter(Boolean));
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude I, O for legibility
    const rand3 = () => A[Math.floor(Math.random()*A.length)]
                      + A[Math.floor(Math.random()*A.length)]
                      + A[Math.floor(Math.random()*A.length)];
    for (let i = 0; i < 40; i++) {
      const id = `ENQ-${year}-${rand3()}`;
      if (!existingIds.has(id)) return id;
    }
    return `ENQ-${year}-${rand3()}${Date.now().toString().slice(-2)}`;
  };

  const createDraftInvestigation = () => {
    const invs = data.investigations || [];
    const today = new Date().toISOString().split("T")[0];
    const subject = (ctx.purpose || "").trim().slice(0, 80)
      || (ctx.managerName ? `Dossier — ${ctx.managerName}` : "")
      || "Dossier brouillon";
    const draft = {
      id: Date.now().toString(),
      caseId: makeExpressCaseId(invs),
      caseTitle: subject,
      caseType: "enquete",
      urgencyLevel: "Moderee",
      province: ctx.province || data.profile?.defaultProvince || "QC",
      status: "draft",
      savedAt: today,
      createdAt: new Date().toISOString(),
      caseData: {},
      source: "meeting-engine-express",
    };
    onSave("investigations", [...invs, draft]);
    setLinkedInvestigationId(draft.id);
    console.info("[MeetingEngine] express investigation created", { id: draft.id, caseId: draft.caseId });
  };

  // ── B-25: Consume pending meeting context bridge (from Cases) ─────────────
  useEffect(() => {
    try {
      if (typeof sessionStorage === "undefined") return;
      const raw = sessionStorage.getItem("hrbpos:pendingMeetingContext");
      if (!raw) return;
      sessionStorage.removeItem("hrbpos:pendingMeetingContext");
      const bridge = JSON.parse(raw);
      console.info("[MeetingEngine] bridge consumed:", { engineType: bridge?.engineType, linkedInvestigationId: bridge?.linkedInvestigationId, hasCtx: !!bridge?.ctx });
      setLinkedInvestigationId(bridge?.linkedInvestigationId || null);
      const validTypes = ENGINE_TYPES.map(t => t.id);
      if (bridge?.engineType && validTypes.includes(bridge.engineType)) {
        setEngineType(bridge.engineType);
      }
      if (bridge?.ctx && typeof bridge.ctx === "object") {
        setCtx(p => ({ ...p, ...bridge.ctx }));
        if (bridge.ctx.managerName) setManagerManual(false);
      }
      setPTab("context");
    } catch {}
  }, []);

  // ── History: all meetings for this manager ────────────────────────────────
  const managerHistory = (data.meetings || [])
    .filter(m => {
      if (!m.director || !ctx.managerName) return false;
      return normKey(m.director) === normKey(ctx.managerName);
    })
    .sort((a, b) => Number(b.id) - Number(a.id));

  const lastMeeting  = managerHistory[0] || null;
  const lastAnalysis = lastMeeting?.analysis || null;
  const histCount    = managerHistory.length;

  // ── Build history string for AI prompt ───────────────────────────────────
  const buildHistCtx = () => managerHistory.slice(0, 3).map((m, i) => {
    const a = m.analysis || {};
    const risks    = toArray(a.risks   ).slice(0,2).map(r => r.risk || r.risque || r).join("; ");
    const actions  = toArray(a.actions ).slice(0,3).map(ac => ac.action || ac).join("; ");
    const questions= toArray(a.questions).slice(0,3).map(q  => q.question|| q).join("; ");
    return `[Meeting ${i+1} — ${m.savedAt}]
Titre: ${a.meetingTitle||"N/D"} | Risque: ${a.overallRisk||"N/D"}
Resume: ${toArray(a.summary).slice(0,2).join(" / ")}
Risques: ${risks}
Actions: ${actions}
Questions posees: ${questions}`;
  }).join("\n\n");

  // ── Type context for AI prompt enrichment ──────────────────────────────
  const TYPE_CONTEXT = {
    "1on1":          "Rencontre reguliere de suivi — focus sur continuite, engagement, obstacles et developpement.",
    "disciplinaire": "Rencontre disciplinaire formelle — focus sur les faits documentes, le manquement precis, les attentes claires et la mesure envisagee. Ton rigoureux, factuel, sans ambiguite.",
    "performance":   "Rencontre de gestion de la performance — focus sur les ecarts observables, les attentes non atteintes, le plan de soutien et les jalons de suivi.",
    "coaching":      "Rencontre de coaching et developpement — focus sur les forces, les zones de croissance, les objectifs convenus et l engagement du gestionnaire.",
    "recadrage":     "Rencontre de recadrage comportemental — focus sur le comportement precis observe, son impact, les attentes revisees et les consequences si recidive.",
    "mediation":     "Rencontre de mediation ou gestion de conflit — focus sur les positions des parties, les faits neutres, le terrain commun et l objectif de resolution.",
    "enquete":       "Rencontre dans le cadre d une enquete — focus sur la collecte de faits, la confidentialite, les droits des parties et la rigueur procedurale.",
    "suivi":         "Rencontre de suivi — focus sur les engagements pris, les ecarts observes, la progression et les prochaines etapes.",
    "transition":    "Rencontre de transition — focus sur le contexte du changement, l impact sur l employe, le soutien disponible et le calendrier.",
  };
  const LEGAL_SENSITIVE_TYPES = ["disciplinaire", "enquete", "performance", "recadrage"];

  // ── AI: generate prep questions ──────────────────────────────────────────
  const generatePrep = async () => {
    if (!ctx.managerName) return;
    setPrepLoading(true);
    const histCtx = buildHistCtx();
    const openCases = (data.cases || []).filter(c =>
      isCaseActive(c)
      && c.director && normKey(c.director) === normKey(ctx.managerName)
    );
    const openCasesCtx = openCases.map(c =>
      `- ${c.title || "Sans titre"} [${c.status}${c.riskLevel?` · ${c.riskLevel}`:""}]${c.employee?` · ${c.employee}`:""}: ${(c.description||c.summary||"").slice(0,200)}`
    ).join("\n");
    const _typeCtx = TYPE_CONTEXT[engineType] || TYPE_CONTEXT["1on1"];
    const _prov = ctx.province || data.profile?.defaultProvince || "QC";
    const _isLegal = LEGAL_SENSITIVE_TYPES.includes(engineType);
    const _legalPrep = _isLegal ? `\n${buildLegalPromptContext(_prov)}\n` : "";
    const sp = `Tu es un HRBP senior expert. Genere un plan d intervention structure pour preparer une rencontre avec un gestionnaire.
Type de rencontre : ${ENGINE_TYPES.find(t=>t.id===engineType)?.label || engineType}
Contexte specifique : ${_typeCtx}
${_legalPrep}${histCtx ? "Tu as l historique des rencontres precedentes — personnalise le plan et fais des liens explicites avec les enjeux non resolus." : "Aucun historique disponible — base-toi uniquement sur le contexte fourni."}
Reponds UNIQUEMENT en JSON strict. Aucun texte avant ou apres. Aucun backtick. Francais professionnel. Max 3 items par liste.
{"objective":{"purpose":"but principal de la rencontre en 1 phrase","expectedOutcome":"resultat concret attendu en 1 phrase"},"priorityIssues":[{"issue":"enjeu prioritaire specifique","why":"pourquoi c est un enjeu maintenant — contexte ou signal precis","riskLevel":"Faible|Modere|Eleve"}],"recommendedApproach":{"how":"comment aborder les sujets — concret et actionnable","tone":"ton a adopter avec ce gestionnaire specifiquement","pitfalls":["piege concret a eviter"]},"suggestedPhrasing":[{"type":"Ouverture","text":"formulation d ouverture naturelle et professionnelle"},{"type":"Recadrage","text":"formulation de recadrage ou confrontation bienveillante"}],"context":{"summary":"resume des elements pertinents disponibles","relevantHistory":"synthese historique utile ou Non disponible","keySignals":["signal important a garder en tete"]},"followUpFromLast1on1":{"evolutions":[],"stagnations":[],"newRisks":[]},"recommendedActions":[{"action":"action concrete a convenir avec le gestionnaire","priority":"Faible|Modere|Eleve"}],"overallPriority":"Faible|Modere|Eleve"}
Regles : sois direct et specifique, pas generique. Ne pas inventer d information absente du contexte. Utiliser UNIQUEMENT les valeurs exactes Faible, Modere ou Eleve pour riskLevel, priority et overallPriority. Si historique disponible : remplir followUpFromLast1on1. Si aucun historique : laisser les trois listes vides. suggestedPhrasing doit contenir au moins 1 phrase d ouverture ET 1 phrase de recadrage.
Niveau de leadership : ${LEVEL_CONTEXT[niveau] || LEVEL_CONTEXT[level] || LEVEL_CONTEXT.gestionnaire}`;
    const up = [
      `Gestionnaire: ${ctx.managerName}`,
      `Equipe: ${ctx.team}`,
      `Type de rencontre: ${ENGINE_TYPES.find(t=>t.id===engineType)?.label || engineType}`,
      `Objectif: ${ctx.purpose}`,
      ``,
      `CONTEXTE ACTUEL (priorite maximale):`,
      ctx.background || "Aucun contexte saisi",
      ctx.alerts ? `Alertes: ${ctx.alerts}` : "",
      ``,
      `CAS OUVERTS (${openCases.length}):`,
      openCasesCtx || "Aucun cas ouvert",
      ``,
      `HISTORIQUE PERTINENT:`,
      histCtx || "Aucun historique disponible",
      ``,
      `Priorise le contexte actuel et les cas ouverts. N utilise l historique que si le sujet est encore non resolu.`,
    ].filter(Boolean).join("\n");
    try { const p = await callAI(sp, up); setPrep(p); setPrepAI(true); }
    catch { setPrep(FALLBACK_PREP); setPrepAI(false); }
    finally { setPrepLoading(false); }
  };

  // ── AI: generate enriched output via MEETING_ENGINE_SP ─────────────────
  const generateOutput = async () => {
    if (needsInvestigationLink) {
      console.warn("[MeetingEngine] blocked: 'enquete' meeting requires a linked investigation");
      setPTab("context");
      return;
    }
    setOutputLoading(true);
    const _prov = ctx.province || data.profile?.defaultProvince || "QC";
    const _engineMeta = ENGINE_TYPES.find(t => t.id === engineType);
    const _legalText = (_engineMeta?.legal || isLegalSensitive(
      [ctx.purpose,ctx.background,notes.risks,notes.performance,notes.actions].join(" ")
    )) ? `\n${buildLegalPromptContext(_prov)}\n` : "";
    const histCtx = buildHistCtx();
    const _meetingBlock = (meetingAnalysis.transcript || meetingAnalysis.keyPoints)
      ? `\n\nTRANSCRIPT / NOTES DU MEETING :\n${meetingAnalysis.transcript || ""}${meetingAnalysis.transcript && meetingAnalysis.keyPoints ? "\n" : ""}${meetingAnalysis.keyPoints ? `Points cles observes : ${meetingAnalysis.keyPoints}` : ""}`
      : "";
    const _typeCtxOut = TYPE_CONTEXT[engineType] || TYPE_CONTEXT["1on1"];

    // ── Pull linked investigation context (B-30 fix) ─────────────────────
    const linkedInv = linkedInvestigationId
      ? (data.investigations || []).find(i => i.id === linkedInvestigationId)
      : null;
    if (linkedInvestigationId && !linkedInv) {
      console.warn("[MeetingEngine] linkedInvestigationId set but no matching investigation in data.investigations:", linkedInvestigationId);
    }
    const _invBlock = buildInvestigationCtxBlock(linkedInv);
    console.info("[MeetingEngine] generateOutput", {
      engineType, linkedInvestigationId,
      hasInvestigation: !!linkedInv,
      ctxBackgroundLen: (ctx.background || "").length,
      notesFilled: Object.values(notes).filter(Boolean).length,
      hasTranscript: !!meetingAnalysis.transcript,
    });

    const up = [
      `TYPE: ${engineType}`,
      `TYPE_LABEL: ${_engineMeta?.label || engineType}`,
      `CONTEXTE_TYPE: ${_typeCtxOut}`,
      `NIVEAU: ${niveau}`,
      `Gestionnaire: ${ctx.managerName||"N/A"}`,
      `Equipe: ${ctx.team||"N/A"}`,
      `Objectif: ${ctx.purpose||"N/A"}`,
      `Contexte: ${ctx.background||"N/A"}`,
      _invBlock,
      _legalText,
      _meetingBlock,
      histCtx ? `\nHISTORIQUE PERTINENT:\n${histCtx}` : "",
      `\nNotes — Personnes: ${notes.people||"Aucune"}`,
      `Notes — Performance: ${notes.performance||"Aucune"}`,
      `Notes — Risques: ${notes.risks||"Aucune"}`,
      `Notes — Org: ${notes.org||"Aucune"}`,
      `Notes — Leadership: ${notes.leadership||"Aucune"}`,
      `Notes — Actions: ${notes.actions||"Aucune"}`,
      `Notes — Suivis: ${notes.followups||"Aucune"}`,
    ].filter(Boolean).join("\n");
    try { const p = await callAI(MEETING_ENGINE_SP, up); setOutput(normalizeMeetingOutput(p)); }
    catch (err) {
      console.warn("[MeetingEngine] generateOutput AI call failed — using fallback:", err?.message);
      // Defensive fallback: enrich placeholders with investigation summary if available
      const fb = buildFallbackOutput(engineType);
      if (linkedInv) {
        const cs = linkedInv.caseData?.caseSummary || {};
        fb.meetingTitle = `Entrevue enquete — ${linkedInv.caseTitle || linkedInv.title || linkedInv.caseId || ""}`.trim();
        fb.summary = [
          cs.situation || "Voir resume du dossier d enquete lie.",
          cs.triggerEvent ? `Declencheur: ${cs.triggerEvent}` : "Voir notes manuelles.",
        ].filter(Boolean);
        fb.hrbpKeyMessage = "Generation IA indisponible — completer manuellement a partir du dossier d enquete lie.";
      }
      setOutput(normalizeMeetingOutput(fb));
    }
    finally { setOutputLoading(false); }
  };

  // ── Save current session ──────────────────────────────────────────────────
  const save1on1 = () => {
    if (!output || saved1on1) return;
    if (needsInvestigationLink) {
      console.warn("[MeetingEngine] blocked: cannot archive 'enquete' meeting without linked investigation");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    const mtgId = `mtg_${Date.now()}`;
    // Re-normalize at persist-time so older in-memory outputs land clean in storage too.
    const normOutput = normalizeMeetingOutput(output);
    const session = {
      id: Date.now().toString(), savedAt: today,
      managerName: ctx.managerName, team: ctx.team, meetingType: engineType,
      engineType, niveau, kind: "1:1-meeting",
      date: ctx.date, purpose: ctx.purpose, notes, output: normOutput,
      meetingTranscript: meetingAnalysis.transcript || "",
      meetingKeyPoints: meetingAnalysis.keyPoints || "",
      province: ctx.province || data.profile?.defaultProvince || "QC",
      level,
    };
    onSave("prep1on1", [...(data["prep1on1"]||[]), session]);
    setSaved1on1(true);

    // ── Double save: also create a Meetings Hub session in SK.meetings ───
    try {
      const meetingSession = {
        id: mtgId,
        savedAt: today,
        dateCreated: today,
        director: ctx.managerName || "Non assigné",
        meetingType: engineType || "1:1",
        scope: "leader",
        province: ctx.province || data.profile?.defaultProvince || "QC",
        kind: "1:1-meeting",
        niveau,
        linkedInvestigationId,
        analysis: {
          meetingTitle: normOutput.meetingTitle || `1:1 — ${ctx.managerName || "?"} (${niveau || "gestionnaire"})`,
          director: ctx.managerName || "Non assigné",
          overallRisk: normOutput.overallRisk || "Modéré",
          overallRiskRationale: normOutput.overallRiskRationale || "",
          summary: normOutput.summary,
          signals: normOutput.signals,
          decisions: normOutput.decisions,
          risks: normOutput.risks,
          actions: normOutput.actions,
          people: normOutput.people,
          strategieHRBP: normOutput.strategieHRBP || {},
          hrbpKeyMessage: normOutput.hrbpKeyMessage || "",
          keySignals: normOutput.keySignals,
          mainRisks: normOutput.mainRisks,
          hrbpFollowups: normOutput.hrbpFollowups,
          crossQuestions: normOutput.crossQuestions,
          caseEntry: normOutput.caseEntry,
          cadreJuridique: normOutput.cadreJuridique || null,
          sanctions: normOutput.sanctions,
          risquesLegaux: normOutput.risquesLegaux,
          nextMeetingContext: normOutput.nextMeetingContext || "",
          nextMeetingQuestions: normOutput.nextMeetingQuestions,
        },
      };
      onSave("meetings", [meetingSession, ...(data.meetings || [])]);
    } catch (err) {
      console.warn("Meeting Engine — sync Meetings Hub failed:", err);
    }

    // ── Detect case candidates (review modal — no auto-create) ────────────
    try {
      const candidates = detectCaseCandidates(normOutput, engineType, mtgId);
      setArchivedMeetingId(mtgId);
      if (candidates.length > 0) {
        setCaseCandidates(candidates);
        setCandidateActions({});
        setShowCandidatesModal(true);
        console.info("[MeetingEngine] case candidates detected:", candidates.length);
      } else {
        console.log("[MeetingEngine] no case candidates detected");
      }
    } catch (err) {
      console.warn("Meeting Engine — case candidate detection failed:", err);
    }

    // ── Sync Portfolio ────────────────────────────────────────────────────
    try {
      const mName = (ctx.managerName || "").trim();
      const nk = mName ? normKey(mName) : "";
      if (nk && onSave) {
        const leadersMap = getLeadersMap(data) || {};
        const existing = leadersMap[nk];
        const historyEntry = {
          date: today,
          event: `1:1 archivé — ${ENGINE_TYPES.find(t=>t.id===engineType)?.label || engineType}`,
          source: "meeting-engine",
        };
        let updatedMap;
        if (existing) {
          updatedMap = setMeta(leadersMap, mName, {
            lastInteraction: today,
            history: [...(existing.history || []), historyEntry],
          });
        } else {
          updatedMap = { ...leadersMap, [nk]: {
            ...emptyMeta(),
            name: mName,
            level: niveau || "gestionnaire",
            lastInteraction: today,
            createdAt: today,
            history: [{ date: today, event: "Fiche créée automatiquement via Meeting Engine", source: "meeting-engine" }],
          }};
        }
        onSave("leaders", updatedMap);
      }
    } catch (err) {
      console.warn("Meeting Engine — sync Portfolio failed:", err);
    }
  };

  // ── Case candidate handlers ───────────────────────────────────────────────
  const buildCaseFromCandidate = (cand, today) => ({
    id: `case_${Date.now()}_${String(cand.id).slice(-6)}`,
    title: cand.title,
    type: cand.type || "conflict_ee",
    riskLevel: cand.riskLevel || "Modéré",
    status: "open",
    director: ctx.managerName || "Non assigné",
    employee: "",
    department: ctx.team || "",
    openDate: today,
    situation: cand.summary || "",
    notes: "",
    province: ctx.province || data.profile?.defaultProvince || "QC",
    meetingId: archivedMeetingId,
    source: "meeting",
    source_id: archivedMeetingId,
    updatedAt: today,
  });

  const createCaseFromCandidate = (cand) => {
    if (candidateActions[cand.id]) return;
    const today = new Date().toISOString().split("T")[0];
    onSave("cases", [...(data.cases || []), buildCaseFromCandidate(cand, today)]);
    setCandidateActions(prev => ({ ...prev, [cand.id]: "created" }));
  };

  const ignoreCandidate = (cand) => {
    if (candidateActions[cand.id]) return;
    setCandidateActions(prev => ({ ...prev, [cand.id]: "ignored" }));
  };

  const createAllCandidates = () => {
    const today = new Date().toISOString().split("T")[0];
    const pending = caseCandidates.filter(c => !candidateActions[c.id]);
    if (pending.length === 0) return;
    const newCases = pending.map(c => buildCaseFromCandidate(c, today));
    onSave("cases", [...(data.cases || []), ...newCases]);
    const next = { ...candidateActions };
    pending.forEach(c => { next[c.id] = "created"; });
    setCandidateActions(next);
  };

  const ignoreAllCandidates = () => {
    const next = { ...candidateActions };
    caseCandidates.forEach(c => { if (!next[c.id]) next[c.id] = "ignored"; });
    setCandidateActions(next);
  };

  const closeCandidatesModal = () => {
    setShowCandidatesModal(false);
  };

  // ── Start next cycle ─────────────────────────────────────────────────────
  const startNextCycle = () => {
    if (!saved1on1) save1on1();
    setCtx(p => ({
      ...p,
      date: "",
      purpose: "",
      background: [
        output?.nextMeetingContext || "",
        (output?.nextMeetingQuestions||[]).length
          ? "Suivis a adresser: " + output.nextMeetingQuestions.join(" / ")
          : "",
      ].filter(Boolean).join("\n"),
      activeCases: "",
      recentData: "",
      alerts: (output?.mainRisks||[]).join("; "),
    }));
    setPrep(null); setPrepAI(false);
    setNotes({ people:"", performance:"", risks:"", org:"", leadership:"", actions:"", followups:"" });
    setMeetingAnalysis({ transcript:"", keyPoints:"" });
    setOutput(null); setSaved1on1(false);
    setPTab("context");
  };

  // ── Copy output ──────────────────────────────────────────────────────────
  const copyOutput = () => {
    if (!output) return;
    const lines = [
      `MEETING ENGINE — ${ctx.managerName||"Gestionnaire"} (${ctx.date||new Date().toLocaleDateString("fr-CA")})`,
      output.meetingTitle ? `TITRE: ${output.meetingTitle}` : "",
      "", `RESUME\n${(output.summary||[]).join("\n")}`,
      "", `RISQUE: ${output.overallRisk}`,
      output.hrbpKeyMessage ? `MESSAGE CLE: ${output.hrbpKeyMessage}` : "",
      "", `SIGNAUX\n${(output.keySignals||[]).map((s,i)=>`${i+1}. ${s}`).join("\n")}`,
      "", `RISQUES\n${(output.mainRisks||[]).map((s,i)=>`${i+1}. ${s}`).join("\n")}`,
      "", `SUIVIS HRBP\n${(output.hrbpFollowups||[]).map((s,i)=>`${i+1}. ${s}`).join("\n")}`,
      "", `PROCHAINE RENCONTRE\n${(output.nextMeetingQuestions||[]).map((s,i)=>`${i+1}. ${s}`).join("\n")}`,
      "", `PLAN D ACTION\n${(output.actions||[]).map(a=>`- ${a.action} [${a.owner} / ${a.delai} / ${a.priorite}]`).join("\n")}`,
    ];
    navigator.clipboard.writeText(lines.filter(Boolean).join("\n"))
      .then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  // ── Static tab/category data (labelKey resolved via t() at render time) ──
  const PTABS = [
    {id:"guidance", icon:"🧭", labelKey:"prep1on1.tab.guidance", color:C.teal},
    {id:"context",  icon:"📋", labelKey:"prep1on1.tab.context",  color:C.blue},
    {id:"history",  icon:"🕐", labelKey:"prep1on1.tab.history",  color:C.purple, badge:histCount||null},
    {id:"prep",     icon:"🎯", labelKey:"prep1on1.tab.prep",     color:C.em,     badge:prep?"✓":null},
    {id:"analyse",  icon:"🎙️", labelKey:"prep1on1.tab.analyse",  color:C.blue,   badge:(meetingAnalysis.transcript||meetingAnalysis.keyPoints)?"✓":null},
    {id:"signals",  icon:"📡", labelKey:"prep1on1.tab.signals",  color:C.amber},
    {id:"notes",    icon:"📝", labelKey:"prep1on1.tab.notes",    color:C.blue},
    {id:"output",   icon:"📊", labelKey:"prep1on1.tab.output",   color:C.red,    badge:output?"✓":null},
  ];
  const PREP_CATS = [
    {key:"objectives", labelKey:"prep1on1.prepCat.objectives",  icon:"🎯", color:C.em},
    {key:"strategic",  labelKey:"prep1on1.prepCat.strategic",   icon:"♟",  color:C.blue},
    {key:"people",     labelKey:"prep1on1.prepCat.people",      icon:"👥", color:C.teal},
    {key:"org",        labelKey:"prep1on1.prepCat.org",         icon:"🏗", color:C.amber},
    {key:"leadership", labelKey:"prep1on1.prepCat.leadership",  icon:"🧭", color:C.purple},
    {key:"performance",labelKey:"prep1on1.prepCat.performance", icon:"📈", color:C.red},
    {key:"capacity",   labelKey:"prep1on1.prepCat.capacity",    icon:"⚖️", color:C.em},
  ];
  const SIGNAL_CATS = [
    {key:"disengagement", labelKey:"prep1on1.signalCat.disengagement", icon:"🌡", color:C.amber},
    {key:"burnout",       labelKey:"prep1on1.signalCat.burnout",       icon:"🔥", color:C.red},
    {key:"retention",     labelKey:"prep1on1.signalCat.retention",     icon:"✈",  color:C.purple},
    {key:"tensions",      labelKey:"prep1on1.signalCat.tensions",      icon:"⚡", color:C.amber},
    {key:"leadership",    labelKey:"prep1on1.signalCat.leadership",    icon:"🧭", color:C.blue},
    {key:"org",           labelKey:"prep1on1.signalCat.org",           icon:"🏗", color:C.teal},
    {key:"succession",    labelKey:"prep1on1.signalCat.succession",    icon:"🎯", color:C.em},
  ];
  const GUIDE_CATS = [
    {key:"positioning",  labelKey:"prep1on1.guideCat.positioning",  icon:"♟",  color:C.blue},
    {key:"challenge",    labelKey:"prep1on1.guideCat.challenge",    icon:"🧲", color:C.purple},
    {key:"redirect",     labelKey:"prep1on1.guideCat.redirect",     icon:"🔄", color:C.amber},
    {key:"probe",        labelKey:"prep1on1.guideCat.probe",        icon:"🔍", color:C.teal},
    {key:"hidden_risks", labelKey:"prep1on1.guideCat.hidden_risks", icon:"🎭", color:C.red},
  ];
  const NOTE_CATS = [
    {key:"people",     labelKey:"prep1on1.noteCat.people",      icon:"👥", color:C.teal},
    {key:"performance",labelKey:"prep1on1.noteCat.performance", icon:"📈", color:C.blue},
    {key:"risks",      labelKey:"prep1on1.noteCat.risks",       icon:"⚠",  color:C.red},
    {key:"org",        labelKey:"prep1on1.noteCat.org",         icon:"🏗", color:C.amber},
    {key:"leadership", labelKey:"prep1on1.noteCat.leadership",  icon:"🧭", color:C.purple},
    {key:"actions",    labelKey:"prep1on1.noteCat.actions",     icon:"✅", color:C.em},
    {key:"followups",  labelKey:"prep1on1.noteCat.followups",   icon:"🔁", color:C.blue},
  ];
  const RISK_C = {Critique:C.red,Eleve:C.amber,"Élevé":C.amber,"Elevé":C.amber,Modere:C.blue,"Modéré":C.blue,"Moderé":C.blue,Faible:C.em};
  const AMPLEUR_C = {"Isole":C.blue,"Isolé":C.blue,"Recurrent":C.amber,"Récurrent":C.amber,"Systemique":C.red,"Systémique":C.red};
  const TENDANCE_C = {"Nouveau":C.blue,"Persistant":C.amber,"Aggrave":C.red,"Aggravé":C.red,"En amelioration":C.em,"En amélioration":C.em};
  const normPrio = v => { if (!v) return v; const l = v.toLowerCase(); if (l==="faible"||l==="low") return "Faible"; if (l==="modéré"||l==="modere"||l==="moyen"||l==="medium") return "Modéré"; if (l==="élevé"||l==="eleve"||l==="elevé"||l==="haute"||l==="high") return "Élevé"; return v; };
  const activePTab = PTABS.find(t => t.id === pTab);
  const questions  = prep || PREP_QUESTIONS_DB;
  const activeEngine = ENGINE_TYPES.find(t => t.id === engineType);

  // ── Cases liés au meeting courant (créés depuis ce meeting) ───────────────
  const linkedCases = archivedMeetingId
    ? (data.cases || []).filter(c => c && c.source === "meeting" && c.source_id === archivedMeetingId)
    : [];

  const openLinkedCase = (cid) => {
    if (!cid || typeof onNavigate !== "function") return;
    onNavigate("cases", { focusCaseId: cid });
  };

  // ── FLOW STEPS ────────────────────────────────────────────────────────────
  const flowSteps = [
    { n:"1", label:t("prep1on1.flow.context"),           done:!!ctx.managerName,       tab:"context"  },
    { n:"2", label:t("prep1on1.flow.history"),           done:histCount>0,             tab:"history"  },
    { n:"3", label:t("prep1on1.flow.generateQuestions"), done:!!prep,                  tab:"prep"     },
    { n:"4", label:t("prep1on1.flow.runMeeting"),        done:false },
    { n:"5", label:t("prep1on1.flow.analyzeMeeting"),    done:!!(meetingAnalysis.transcript||meetingAnalysis.keyPoints), tab:"analyse" },
    { n:"6", label:t("prep1on1.flow.outputArchive"),     done:!!output && saved1on1,   tab:"output"   },
  ];

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
    <div style={{ display:"flex", height:"calc(100vh - 112px)", overflow:"hidden",
                  borderRadius:10, border:`1px solid ${C.border}` }}>

      {/* ── SIDEBAR ── */}
      <div style={{ width:210, background:C.surf, borderRight:`1px solid ${C.border}`,
                    display:"flex", flexDirection:"column", flexShrink:0 }}>

        {/* Header */}
        <div style={{ padding:"16px 14px 12px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, fontFamily:"'DM Mono',monospace", color:C.em,
                        letterSpacing:2, marginBottom:3 }}>{t("meetingEngine.sidebar.brand")}</div>
          <div style={{ fontSize:13, fontWeight:800, color:C.text }}>{t("meetingEngine.sidebar.title")}</div>
          {ctx.managerName && (
            <div style={{ marginTop:8, padding:"6px 9px", background:C.emD+"30",
                          borderRadius:6, border:`1px solid ${C.emD}` }}>
              <div style={{ fontSize:12, color:C.em, fontWeight:700 }}>{ctx.managerName}</div>
              <div style={{ fontSize:10, color:C.textD }}>
                {histCount > 0 ? `${histCount} ${t("prep1on1.sidebar.archivedSuffix")}` : t("prep1on1.sidebar.newManager")}
              </div>
            </div>
          )}
          {activeEngine && (
            <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:11 }}>{activeEngine.icon}</span>
              <span style={{ fontSize:10, color:activeEngine.color, fontWeight:600 }}>{activeEngine.label}</span>
            </div>
          )}
        </div>

        {/* Flow tracker */}
        <div style={{ padding:"12px 13px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, color:C.textD, fontFamily:"'DM Mono',monospace",
                        letterSpacing:1, marginBottom:8 }}>{t("prep1on1.sidebar.cycle")}</div>
          {flowSteps.map((s, i) => (
            <div key={i}
              onClick={() => s.tab ? setPTab(s.tab) : null}
              style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6,
                       cursor:s.tab?"pointer":"default" }}>
              <div style={{ width:18, height:18, borderRadius:"50%", flexShrink:0,
                             background: s.done ? C.em : C.surfLL,
                             border:`1px solid ${s.done ? C.em : C.border}`,
                             display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:9, color:s.done?C.bg:C.textD,
                                fontFamily:"'DM Mono',monospace", fontWeight:700 }}>
                  {s.done ? "✓" : s.n}
                </span>
              </div>
              <span style={{ fontSize:11, color:s.done?C.em:C.textM, lineHeight:1.3 }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Tab nav */}
        <nav style={{ flex:1, padding:"8px 7px", display:"flex", flexDirection:"column", gap:2,
                      overflowY:"auto" }}>
          {PTABS.map(tab => {
            const active = pTab === tab.id;
            return (
              <button key={tab.id} onClick={()=>setPTab(tab.id)} style={{
                display:"flex", alignItems:"center", gap:8, padding:"8px 9px",
                borderRadius:7, border:"none", cursor:"pointer", width:"100%",
                background: active ? tab.color+"22" : "transparent",
                fontFamily:"'DM Sans',sans-serif", transition:"all .15s",
              }}>
                <span style={{ fontSize:13 }}>{tab.icon}</span>
                <span style={{ fontSize:12, fontWeight:active?600:400,
                                color:active?tab.color:C.textM, flex:1, textAlign:"left" }}>
                  {t(tab.labelKey)}
                </span>
                {tab.badge && (
                  <span style={{ background:tab.color+"33", color:tab.color, borderRadius:10,
                                  padding:"1px 6px", fontSize:9,
                                  fontFamily:"'DM Mono',monospace" }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column",
                    overflow:"hidden", background:C.bg }}>

        {/* Topbar */}
        <div style={{ padding:"11px 18px", borderBottom:`1px solid ${C.border}`,
                      background:C.surf, display:"flex", alignItems:"center",
                      gap:10, flexShrink:0, flexWrap:"wrap" }}>
          <span style={{ fontSize:15 }}>{activePTab?.icon}</span>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{activePTab ? t(activePTab.labelKey) : ""}</div>
          {ctx.managerName && (
            <div style={{ fontSize:11, color:C.textD }}>
              {ctx.managerName}
              {ctx.team ? " · " + (() => { const f = PREP_FUNCTIONS.find(f=>f.value===ctx.team); return f ? t(f.labelKey) : ctx.team; })() : ""}
            </div>
          )}

          <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
            {pTab==="prep" && (
              <>
                {prepAI && <Badge label={t("prep1on1.topbar.aiBadge")} color={C.em}/>}
                {histCount > 0 && <Badge label={`${histCount} ${t("prep1on1.topbar.memorySuffix")}`} color={C.purple}/>}
                <button onClick={generatePrep} disabled={!ctx.managerName||prepLoading}
                  style={{ ...css.btn(C.em), padding:"6px 14px", fontSize:12,
                            opacity:!ctx.managerName?.5:1 }}>
                  {prepLoading ? t("prep1on1.topbar.generating")
                    : histCount > 0 ? t("prep1on1.topbar.generateWithHistory") : t("prep1on1.topbar.generate")}
                </button>
              </>
            )}
            {pTab==="output" && (
              <>
                {output && (
                  <button onClick={copyOutput}
                    style={{ ...css.btn(C.blue,true), padding:"6px 12px", fontSize:11 }}>
                    {copied ? t("prep1on1.topbar.copied") : t("prep1on1.topbar.copy")}
                  </button>
                )}
                {output && (
                  <button onClick={save1on1} disabled={saved1on1}
                    style={{ ...css.btn(saved1on1?C.textD:C.purple,true),
                              padding:"6px 12px", fontSize:11 }}>
                    {saved1on1 ? t("prep1on1.topbar.archived") : t("prep1on1.topbar.archive")}
                  </button>
                )}
                <button onClick={generateOutput} disabled={outputLoading || needsInvestigationLink}
                  title={needsInvestigationLink ? t("meetingEngine.context.linkRequiredTip") : undefined}
                  style={{ ...css.btn(needsInvestigationLink ? C.textD : C.em), padding:"6px 14px", fontSize:12, opacity: needsInvestigationLink ? 0.6 : 1 }}>
                  {outputLoading ? t("prep1on1.topbar.generating") : t("prep1on1.topbar.generateOutput")}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 22px" }}>

          {/* ════════════════ CONTEXT ════════════════ */}
          {pTab==="context" && (
            <div>
              {/* Engine type selector — cards */}
              <div style={{...css.card, borderLeft:`3px solid ${activeEngine?.color||C.blue}`, marginBottom:14}}>
                <Mono color={C.blue} size={9}>{t("meetingEngine.engineType.title")}</Mono>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8, marginTop:10 }}>
                  {ENGINE_TYPES.map(t => {
                    const active = engineType === t.id;
                    return (
                      <button key={t.id} onClick={() => setEngineType(t.id)}
                        style={{ padding:"12px 14px", borderRadius:9, cursor:"pointer",
                          fontFamily:"'DM Sans',sans-serif", textAlign:"left",
                          background: active ? t.color+"18" : C.surfL,
                          border:`1px solid ${active ? t.color+"66" : C.border}`,
                          transition:"all .15s" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                          <span style={{ fontSize:16 }}>{t.icon}</span>
                          <span style={{ fontSize:12, fontWeight:active?700:500, color:active?t.color:C.text }}>{t.label}</span>
                        </div>
                        <div style={{ fontSize:10, color:active?t.color:C.textD, lineHeight:1.4 }}>{t.desc}</div>
                      </button>
                    );
                  })}
                </div>
                {activeEngine?.legal && (
                  <div style={{ marginTop:10, fontSize:11, color:C.red, fontStyle:"italic" }}>
                    {t("meetingEngine.engineType.legalWarning")}
                  </div>
                )}
              </div>

              {/* ── Phase 0 — Lien vers dossier d'enquête (type=enquete uniquement) ── */}
              {engineType === "enquete" && (() => {
                const invs = data.investigations || [];
                const linkedInv = linkedInvestigationId
                  ? invs.find(i => i.id === linkedInvestigationId)
                  : null;
                return (
                  <div style={{ ...css.card, borderLeft:`3px solid ${INV_RED}`, marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                      <Mono color={INV_RED} size={9}>{linkedInv ? t("meetingEngine.inv.titleLinked") : t("meetingEngine.inv.titleRequired")}</Mono>
                      {linkedInv && (
                        <button onClick={() => setLinkedInvestigationId(null)}
                          style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.textM,
                            borderRadius:6, padding:"3px 8px", fontSize:10, cursor:"pointer" }}>
                          {t("meetingEngine.inv.detach")}
                        </button>
                      )}
                    </div>

                    {linkedInv ? (
                      <div style={{ marginTop:10, fontSize:12, color:C.text }}>
                        <span style={{ fontWeight:600 }}>{linkedInv.caseId || "—"}</span>
                        <span style={{ color:C.textM }}> · {generateInvestigationTitle(linkedInv)}</span>
                        {linkedInv.status === "draft" && (
                          <span style={{ marginLeft:8, fontSize:10, padding:"2px 6px", borderRadius:4,
                            background:C.surfLL, border:`1px solid ${C.border}`, color:C.textM,
                            fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>
                            {t("meetingEngine.inv.draftBadge")}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontSize:11, color:C.textM, marginBottom:10, lineHeight:1.5 }}>
                          {t("meetingEngine.inv.body")}
                        </div>
                        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                          <select value=""
                            onChange={(e) => { if (e.target.value) setLinkedInvestigationId(e.target.value); }}
                            disabled={invs.length === 0}
                            style={{ flex:"1 1 260px", minWidth:220, padding:"8px 10px",
                              background:C.surfL, color:C.text, border:`1px solid ${C.border}`,
                              borderRadius:7, fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>
                            <option value="">
                              {invs.length === 0 ? t("meetingEngine.inv.noFiles") : t("meetingEngine.inv.selectExisting")}
                            </option>
                            {invs.slice().reverse().map(inv => (
                              <option key={inv.id} value={inv.id}>
                                {(inv.caseId || inv.id?.toString().slice(-6) || "?")} — {generateInvestigationTitle(inv)}{inv.status === "draft" ? t("meetingEngine.inv.draftSuffix") : ""}
                              </option>
                            ))}
                          </select>
                          <span style={{ fontSize:10, color:C.textD, fontFamily:"'DM Mono',monospace" }}>{t("meetingEngine.inv.or")}</span>
                          <button onClick={createDraftInvestigation}
                            title={t("meetingEngine.inv.createTooltip")}
                            style={{ ...css.btn(INV_RED, true), padding:"8px 12px", fontSize:11 }}>
                            {t("meetingEngine.inv.create")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                <div style={{...css.card}}>
                  <Mono color={C.blue} size={9}>{t("prep1on1.context.identification")}</Mono>
                  <div style={{marginTop:10}}>
                    {/* ── Manager dropdown + fallback libre ── */}
                    <ManagerField data={data} ctx={ctx} setCtx={setCtx}
                      managerManual={managerManual} setManagerManual={setManagerManual} t={t}/>
                    {/* Date field */}
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        {t("prep1on1.context.meetingDate")}
                      </div>
                      <input value={ctx.date}
                        onChange={e=>setCtx(p=>({...p,date:e.target.value}))}
                        placeholder={new Date().toLocaleDateString("fr-CA")} style={{...css.input}}
                        onFocus={e=>e.target.style.borderColor=C.em}
                        onBlur={e=>e.target.style.borderColor=C.border}/>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        {t("meetingEngine.context.level")}
                      </div>
                      <select value={niveau}
                        onChange={e=>setNiveau(e.target.value)}
                        style={{...css.select}}>
                        <option value="employe" style={{background:C.surfL}}>{t("leader.level.employe")}</option>
                        <option value="gestionnaire" style={{background:C.surfL}}>{t("leader.level.gestionnaire")}</option>
                        <option value="directeur" style={{background:C.surfL}}>{t("leader.level.directeur")}</option>
                        <option value="vp" style={{background:C.surfL}}>{t("leader.level.vp")}</option>
                        <option value="executif" style={{background:C.surfL}}>{t("leader.level.executif")}</option>
                        <option value="hrbp_team" style={{background:C.surfL}}>{t("leader.level.hrbp_team")}</option>
                        <option value="ta_team" style={{background:C.surfL}}>{t("leader.level.ta_team")}</option>
                        <option value="autres" style={{background:C.surfL}}>{t("leader.level.autres")}</option>
                      </select>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        {t("prep1on1.context.team")}
                      </div>
                      <select value={ctx.team}
                        onChange={e=>setCtx(p=>({...p,team:e.target.value}))}
                        style={{...css.select}}>
                        {PREP_FUNCTIONS.map(o =>
                          <option key={o.value} value={o.value}
                            style={{background:C.surfL}}>{t(o.labelKey)}</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        {t("prep1on1.context.province")}
                      </div>
                      <ProvinceSelect
                        value={ctx.province||data.profile?.defaultProvince||"QC"}
                        onChange={e=>setCtx(p=>({...p,province:e.target.value}))}
                        style={{width:"100%"}}/>
                    </div>
                  </div>
                </div>

                <div style={{...css.card}}>
                  <Mono color={C.em} size={9}>{t("prep1on1.context.intent")}</Mono>
                  <div style={{marginTop:10}}>
                    {[[t("prep1on1.context.purpose"),"purpose",
                        t("prep1on1.context.purposePh"),4],
                      [t("prep1on1.context.background"),"background",
                        t("prep1on1.context.backgroundPh"),5]
                    ].map(([label,key,ph,rows]) => (
                      <div key={key} style={{marginBottom:12}}>
                        <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                          {label}
                        </div>
                        <textarea value={ctx[key]}
                          onChange={e=>setCtx(p=>({...p,[key]:e.target.value}))}
                          placeholder={ph} rows={rows} style={{...css.textarea}}
                          onFocus={e=>e.target.style.borderColor=C.em}
                          onBlur={e=>e.target.style.borderColor=C.border}/>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{...css.card, borderLeft:`3px solid ${C.amber}`}}>
                <Mono color={C.amber} size={9}>{t("prep1on1.context.knownSignals")}</Mono>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:10}}>
                  {[[t("prep1on1.context.activeCases"),"activeCases",t("prep1on1.context.activeCasesPh"),3],
                    [t("prep1on1.context.recentData"),"recentData",t("prep1on1.context.recentDataPh"),3],
                    [t("prep1on1.context.alerts"),"alerts",t("prep1on1.context.alertsPh"),3]
                  ].map(([label,key,ph,rows]) => (
                    <div key={key}>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>{label}</div>
                      <textarea value={ctx[key]}
                        onChange={e=>setCtx(p=>({...p,[key]:e.target.value}))}
                        placeholder={ph} rows={rows}
                        style={{...css.textarea,fontSize:12}}
                        onFocus={e=>e.target.style.borderColor=C.amber}
                        onBlur={e=>e.target.style.borderColor=C.border}/>
                    </div>
                  ))}
                </div>
              </div>

              {ctx.managerName && histCount > 0 && (
                <div style={{marginTop:12,padding:"11px 14px",
                              background:C.purple+"18",
                              border:`1px solid ${C.purple}40`,borderRadius:8,
                              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:C.purple}}>
                    🕐 <strong>{histCount} {t("prep1on1.context.banner.foundFor")}</strong>{" "}
                    <strong>{ctx.managerName}</strong>
                  </span>
                  <button onClick={()=>setPTab("history")}
                    style={{...css.btn(C.purple,true),padding:"5px 12px",fontSize:11}}>
                    {t("prep1on1.context.banner.viewHistory")}
                  </button>
                </div>
              )}
              {ctx.managerName && histCount === 0 && (
                <div style={{marginTop:12,padding:"10px 14px",
                              background:C.emD+"20",border:`1px solid ${C.emD}`,
                              borderRadius:8}}>
                  <span style={{fontSize:11,color:C.em}}>
                    🆕 {t("prep1on1.context.banner.firstWith")} <strong>{ctx.managerName}</strong> {t("prep1on1.context.banner.firstNote")}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ HISTORY ════════════════ */}
          {pTab==="history" && (
            <div>
              {histCount === 0 ? (
                <div style={{background:C.surfL,border:`2px dashed ${C.border}`,
                              borderRadius:12,padding:"48px 24px",textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:12}}>🕐</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:8}}>{t("prep1on1.history.empty.title")}</div>
                  <div style={{fontSize:12,color:C.textD,maxWidth:360,margin:"0 auto",marginBottom:16}}>
                    {ctx.managerName
                      ? `${t("meetingEngine.history.empty.bodyWith")} "${ctx.managerName}"${t("meetingEngine.history.empty.bodyWithEnd")}`
                      : t("prep1on1.history.empty.bodyNoMgr")}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4}}>{t("prep1on1.history.heading")} {ctx.managerName}</div>
                    <div style={{fontSize:12,color:C.textD}}>{histCount} {t("meetingEngine.history.subtitleA")}</div>
                  </div>

                  {lastAnalysis && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.em}`,marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                        <Mono color={C.em} size={9}>{t("prep1on1.history.lastMeeting")} {lastMeeting.savedAt}</Mono>
                        <RiskBadge level={lastAnalysis.overallRisk||"Faible"}/>
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>{lastAnalysis.meetingTitle}</div>

                      {toArray(lastAnalysis.risks).length > 0 && (
                        <div style={{marginBottom:12}}>
                          <Mono color={C.red} size={8}>{t("prep1on1.history.risksIdentified")}</Mono>
                          {toArray(lastAnalysis.risks).slice(0,3).map((r,i) => (
                            <div key={i} style={{display:"flex",gap:8,marginTop:7,padding:"7px 10px",background:C.red+"10",borderRadius:7}}>
                              <span style={{color:C.red,fontFamily:"'DM Mono',monospace",fontSize:10,flexShrink:0,marginTop:2}}>{String(i+1).padStart(2,"0")}</span>
                              <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{r.risk||r.risque||r}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {toArray(lastAnalysis.actions).length > 0 && (
                        <div style={{marginBottom:12}}>
                          <Mono color={C.amber} size={8}>{t("meetingEngine.history.actionsToCheck")}</Mono>
                          {toArray(lastAnalysis.actions).slice(0,4).map((a,i) => (
                            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginTop:6,padding:"7px 10px",background:C.amber+"10",borderRadius:7}}>
                              <span style={{fontSize:12,color:C.textM,flex:1}}>{a.action||a}</span>
                              {(a.delay||a.delai) && <Badge label={a.delay||a.delai} color={C.amber} size={9}/>}
                              {a.owner && <Badge label={a.owner} color={C.blue} size={9}/>}
                            </div>
                          ))}
                        </div>
                      )}

                      {toArray(lastAnalysis.questions).length > 0 && (
                        <div>
                          <Mono color={C.blue} size={8}>{t("meetingEngine.history.questionsLast")}</Mono>
                          {toArray(lastAnalysis.questions).slice(0,3).map((q,i) => (
                            <div key={i} style={{display:"flex",gap:8,marginTop:6}}>
                              <span style={{color:C.blue,fontFamily:"'DM Mono',monospace",fontSize:10,flexShrink:0,marginTop:2}}>Q{i+1}</span>
                              <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{q.question||q}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <Mono color={C.textD} size={9}>{t("prep1on1.history.allMeetings")} ({histCount})</Mono>
                  <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:7}}>
                    {managerHistory.map((m,i) => {
                      const a = m.analysis || {};
                      const r = RISK[a.overallRisk] || RISK["Faible"];
                      const open = histExp[i];
                      return (
                        <div key={i} style={{background:C.surfL,border:`1px solid ${open?r.color+"50":C.border}`,borderRadius:9,overflow:"hidden",transition:"border-color .15s"}}>
                          <button onClick={()=>setHistExp(p=>({...p,[i]:!p[i]}))}
                            style={{width:"100%",background:"none",border:"none",padding:"11px 13px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:r.color,flexShrink:0}}/>
                            <span style={{fontSize:13,color:C.text,flex:1,textAlign:"left",fontWeight:500}}>{a.meetingTitle||t("leader.bloc.history.fallback.meeting")}</span>
                            <RiskBadge level={a.overallRisk||"Faible"}/>
                            <Mono color={C.textD} size={8}>{m.savedAt}</Mono>
                            <span style={{color:C.textD,fontSize:12,marginLeft:4}}>{open?"▲":"▼"}</span>
                          </button>
                          {open && (
                            <div style={{padding:"0 13px 12px",borderTop:`1px solid ${C.border}`}}>
                              {toArray(a.summary).map((s,j) => (
                                <div key={j} style={{display:"flex",gap:8,marginTop:8}}>
                                  <div style={{width:4,height:4,borderRadius:"50%",background:C.em,marginTop:7,flexShrink:0}}/>
                                  <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{s}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{marginTop:14,display:"flex",gap:10}}>
                    <button onClick={()=>setPTab("prep")} style={{...css.btn(C.em),flex:1}}>
                      {t("prep1on1.history.generateWithCta")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ PREP ════════════════ */}
          {pTab==="prep" && (
            <div>
              {!prep && !prepLoading && (
                <div style={{background:C.surfL,border:`2px dashed ${C.border}`,borderRadius:12,padding:"32px 24px",textAlign:"center",marginBottom:16}}>
                  <div style={{fontSize:32,marginBottom:10}}>🎯</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>{t("prep1on1.prep.empty.title")}</div>
                  <div style={{fontSize:12,color:C.textD,marginBottom:16,maxWidth:420,margin:"0 auto 16px"}}>
                    {histCount > 0
                      ? t("meetingEngine.prep.empty.bodyHist").replace("{n}", histCount).replace("{name}", ctx.managerName||t("meetingEngine.prep.thisManager"))
                      : t("meetingEngine.prep.empty.bodyNoHist")}
                  </div>
                  <button onClick={generatePrep} disabled={!ctx.managerName}
                    style={{...css.btn(!ctx.managerName?C.textD:C.em),opacity:!ctx.managerName?.5:1}}>
                    {histCount > 0 ? `${t("prep1on1.prep.empty.btnHistA")}${histCount} ${t("prep1on1.prep.empty.btnHistB")}` : t("prep1on1.prep.empty.btnNoHist")}
                  </button>
                </div>
              )}

              {prepLoading && <AILoader label={t("prep1on1.prep.loader")}/>}

              {prep && (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {prep.overallPriority && <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                    <Mono color={C.textD} size={9}>{t("prep1on1.prep.overallPriority")}</Mono>
                    <Badge label={normPrio(prep.overallPriority)} color={{"Faible":C.em,"Modéré":C.amber,"Élevé":C.red}[normPrio(prep.overallPriority)]||C.textM}/>
                  </div>}

                  {prep.objective && <div style={{...css.card,borderLeft:`3px solid ${C.em}`}}>
                    <Mono color={C.em} size={9}>{t("prep1on1.prep.objective")}</Mono>
                    <div style={{marginTop:10}}>
                      <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:3}}>{t("prep1on1.prep.purpose")}</div>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.65,marginBottom:10}}>{prep.objective.purpose}</div>
                      <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:3}}>{t("prep1on1.prep.expectedOutcome")}</div>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.65}}>{prep.objective.expectedOutcome}</div>
                    </div>
                  </div>}

                  {/* ── Checklist + Déroulement (from PREP_META) ── */}
                  {(() => {
                    const pm = PREP_META[engineType] || null;
                    if (!pm) return null;
                    return <>
                      {pm.checklist?.length > 0 && <div style={{...css.card,borderLeft:`3px solid ${C.teal}`}}>
                        <Mono color={C.teal} size={9}>{t("meetingEngine.output.checklist")}</Mono>
                        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:5}}>
                          {pm.checklist.map((item,i) => (
                            <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                              <div style={{width:5,height:5,borderRadius:"50%",background:C.teal,flexShrink:0,marginTop:7}}/>
                              <span style={{fontSize:12,color:C.text,lineHeight:1.55}}>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>}
                      {pm.flow?.length > 0 && <div style={{...css.card,borderLeft:`3px solid ${C.blue}`}}>
                        <Mono color={C.blue} size={9}>{t("meetingEngine.output.flow")}</Mono>
                        <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:6}}>
                          {pm.flow.map((step,i) => (
                            <span key={i} style={{background:C.blue+"14",border:`1px solid ${C.blue}30`,
                              borderRadius:6,padding:"4px 10px",fontSize:11,color:C.blue,fontWeight:500}}>
                              {i+1}. {step}
                            </span>
                          ))}
                        </div>
                      </div>}
                    </>;
                  })()}

                  {prep.priorityIssues?.length > 0 && <div style={{...css.card,borderLeft:`3px solid ${C.red}`}}>
                    <Mono color={C.red} size={9}>{t("prep1on1.prep.priorityIssues")}</Mono>
                    <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:10}}>
                      {prep.priorityIssues.map((issue,i) => {
                        const rc = {"Faible":C.em,"Modéré":C.amber,"Élevé":C.red}[normPrio(issue.riskLevel)]||C.textM;
                        return <div key={i} style={{padding:"10px 12px",background:rc+"0D",borderRadius:8,border:`1px solid ${rc}25`}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:issue.why?6:0}}>
                            <Badge label={normPrio(issue.riskLevel)||issue.riskLevel} color={rc} size={10}/>
                            <span style={{fontSize:13,fontWeight:600,color:C.text}}>{issue.issue}</span>
                          </div>
                          {issue.why && <div style={{fontSize:12,color:C.textM,lineHeight:1.55,fontStyle:"italic"}}>{issue.why}</div>}
                        </div>;
                      })}
                    </div>
                  </div>}

                  {prep.context && <div style={{...css.card,borderLeft:`3px solid ${C.blue}`}}>
                    <Mono color={C.blue} size={9}>{t("prep1on1.prep.context")}</Mono>
                    <div style={{marginTop:10}}>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.65}}>{prep.context.summary}</div>
                      {prep.context.relevantHistory && prep.context.relevantHistory!=="Non disponible" && <div style={{marginTop:10,padding:"7px 10px",background:C.blue+"0D",borderRadius:7,fontSize:12,color:C.textM,lineHeight:1.55}}><span style={{color:C.blue,fontWeight:600}}>{t("prep1on1.prep.historyArrow")}</span>{prep.context.relevantHistory}</div>}
                      {prep.context.keySignals?.length > 0 && <div style={{marginTop:10}}>
                        <Mono color={C.blue} size={8}>{t("prep1on1.prep.keySignals")}</Mono>
                        {prep.context.keySignals.map((sig,i) => <div key={i} style={{display:"flex",gap:8,marginTop:6}}><div style={{width:4,height:4,borderRadius:"50%",background:C.blue,marginTop:7,flexShrink:0}}/><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{sig}</span></div>)}
                      </div>}
                    </div>
                  </div>}

                  {prep.followUpFromLast1on1 && (prep.followUpFromLast1on1.evolutions?.length>0||prep.followUpFromLast1on1.stagnations?.length>0||prep.followUpFromLast1on1.newRisks?.length>0) && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.purple}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                        <Mono color={C.purple} size={9}>{t("prep1on1.prep.followUp")}</Mono>
                        <Badge label={t("prep1on1.prep.basedOnHistory")} color={C.purple}/>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {prep.followUpFromLast1on1.evolutions?.length > 0 && <div>
                          <Mono color={C.em} size={8}>{t("prep1on1.prep.evolutions")}</Mono>
                          {prep.followUpFromLast1on1.evolutions.map((e,i) => <div key={i} style={{display:"flex",gap:8,marginTop:5}}><div style={{width:4,height:4,borderRadius:"50%",background:C.em,marginTop:7,flexShrink:0}}/><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{e}</span></div>)}
                        </div>}
                        {prep.followUpFromLast1on1.stagnations?.length > 0 && <div>
                          <Mono color={C.amber} size={8}>{t("prep1on1.prep.stagnations")}</Mono>
                          {prep.followUpFromLast1on1.stagnations.map((s,i) => <div key={i} style={{display:"flex",gap:8,marginTop:5}}><div style={{width:4,height:4,borderRadius:"50%",background:C.amber,marginTop:7,flexShrink:0}}/><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{s}</span></div>)}
                        </div>}
                        {prep.followUpFromLast1on1.newRisks?.length > 0 && <div>
                          <Mono color={C.red} size={8}>{t("prep1on1.prep.newRisks")}</Mono>
                          {prep.followUpFromLast1on1.newRisks.map((r,i) => <div key={i} style={{display:"flex",gap:8,marginTop:5}}><div style={{width:4,height:4,borderRadius:"50%",background:C.red,marginTop:7,flexShrink:0}}/><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{r}</span></div>)}
                        </div>}
                      </div>
                    </div>
                  )}

                  {prep.recommendedApproach && <div style={{...css.card,borderLeft:`3px solid ${C.amber}`}}>
                    <Mono color={C.amber} size={9}>{t("prep1on1.prep.approach")}</Mono>
                    <div style={{marginTop:10}}>
                      <div style={{marginBottom:10}}><div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:3}}>{t("prep1on1.prep.howToApproach")}</div><div style={{fontSize:13,color:C.text,lineHeight:1.65}}>{prep.recommendedApproach.how}</div></div>
                      <div style={{marginBottom:prep.recommendedApproach.pitfalls?.length>0?10:0}}><div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:3}}>{t("prep1on1.prep.tone")}</div><div style={{fontSize:13,color:C.text,lineHeight:1.65}}>{prep.recommendedApproach.tone}</div></div>
                      {prep.recommendedApproach.pitfalls?.length > 0 && <div>
                        <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:6}}>{t("prep1on1.prep.pitfalls")}</div>
                        {prep.recommendedApproach.pitfalls.map((p,i) => <div key={i} style={{display:"flex",gap:8,marginBottom:5}}><span style={{color:C.amber,fontSize:11,flexShrink:0,marginTop:2}}>⚠</span><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{p}</span></div>)}
                      </div>}
                    </div>
                  </div>}

                  {prep.suggestedPhrasing?.length > 0 && <div style={{...css.card,borderLeft:`3px solid ${C.teal}`}}>
                    <Mono color={C.teal} size={9}>{t("prep1on1.prep.phrasing")}</Mono>
                    <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                      {prep.suggestedPhrasing.map((ph,i) => {
                        const pc = {"Ouverture":C.em,"Recadrage":C.amber,"Confrontation":C.amber,"Suivi":C.blue}[ph.type]||C.teal;
                        return <div key={i} style={{borderRadius:8,border:`1px solid ${pc}28`,overflow:"hidden"}}>
                          <div style={{background:pc+"18",borderLeft:`3px solid ${pc}`,padding:"6px 12px",display:"flex",alignItems:"center",gap:8}}><Badge label={ph.type||t("prep1on1.prep.phrasing.script")} color={pc} size={10}/></div>
                          <div style={{padding:"10px 13px",background:C.surfL,borderLeft:`3px solid ${pc}`}}><div style={{fontSize:13,color:C.text,lineHeight:1.7,fontStyle:"italic"}}>"{ph.text||ph}"</div></div>
                        </div>;
                      })}
                    </div>
                  </div>}

                  {prep.recommendedActions?.length > 0 && <div style={{...css.card,borderLeft:`3px solid ${C.em}`}}>
                    <Mono color={C.em} size={9}>{t("prep1on1.prep.actions")}</Mono>
                    <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:7}}>
                      {prep.recommendedActions.map((a,i) => {
                        const ac = {"Faible":C.em,"Modéré":C.amber,"Élevé":C.red}[normPrio(a.priority)]||C.textM;
                        return <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",background:C.surfLL,borderRadius:8,border:`1px solid ${C.border}`}}>
                          <span style={{color:C.em,fontFamily:"'DM Mono',monospace",fontSize:10,flexShrink:0}}>{String(i+1).padStart(2,"0")}</span>
                          <span style={{fontSize:13,color:C.text,flex:1,lineHeight:1.5}}>{a.action}</span>
                          <Badge label={normPrio(a.priority)||a.priority} color={ac} size={10}/>
                        </div>;
                      })}
                    </div>
                  </div>}
                </div>
              )}

              {prep && (
                <div style={{marginTop:14,padding:"11px 14px",background:C.em+"10",border:`1px solid ${C.em}33`,borderRadius:8}}>
                  <span style={{fontSize:12,color:C.em}}>
                    {t("meetingEngine.prep.readyBanner")}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ SIGNALS ════════════════ */}
          {pTab==="signals" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                {SIGNAL_CATS.map(cat => (
                  <div key={cat.key}
                    style={{background:C.surfL,border:`1px solid ${sigExp[cat.key]?cat.color+"60":C.border}`,borderLeft:`3px solid ${cat.color}`,borderRadius:10,overflow:"hidden",transition:"border-color .2s"}}>
                    <button onClick={()=>setSigExp(p=>({...p,[cat.key]:!p[cat.key]}))}
                      style={{width:"100%",background:"none",border:"none",padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                      <div style={{display:"flex",alignItems:"center",gap:9}}>
                        <span style={{fontSize:15}}>{cat.icon}</span>
                        <span style={{fontSize:13,fontWeight:600,color:C.text}}>{t(cat.labelKey)}</span>
                      </div>
                      <span style={{color:cat.color,fontSize:14,fontWeight:700}}>{sigExp[cat.key]?"−":"+"}</span>
                    </button>
                    {sigExp[cat.key] && (
                      <div style={{padding:"0 13px 12px"}}>
                        {SIGNALS_DB[cat.key].map((sig,i) => (
                          <div key={i} style={{display:"flex",gap:8,marginBottom:7}}>
                            <div style={{width:5,height:5,borderRadius:"50%",background:cat.color,marginTop:7,flexShrink:0}}/>
                            <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{sig}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{...css.card,borderLeft:`3px solid ${C.em}`}}>
                <Mono color={C.em} size={9}>{t("prep1on1.signals.observation")}</Mono>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:12}}>
                  {[
                    {label:t("prep1on1.signals.obs.energy"),   values:[t("prep1on1.signals.energy.high"),t("prep1on1.signals.energy.normal"),t("prep1on1.signals.energy.low"),t("prep1on1.signals.energy.exhausted")]},
                    {label:t("prep1on1.signals.obs.openness"), values:[t("prep1on1.signals.openness.veryOpen"),t("prep1on1.signals.openness.normal"),t("prep1on1.signals.openness.reserved"),t("prep1on1.signals.openness.defensive")]},
                    {label:t("prep1on1.signals.obs.clarity"),  values:[t("prep1on1.signals.clarity.excellent"),t("prep1on1.signals.clarity.good"),t("prep1on1.signals.clarity.partial"),t("prep1on1.signals.clarity.unclear")]},
                    {label:t("prep1on1.signals.obs.alert"),    values:[t("prep1on1.signals.alert.none"),t("prep1on1.signals.alert.light"),t("prep1on1.signals.alert.moderate"),t("prep1on1.signals.alert.high")]},
                  ].map((obs,i) => (
                    <PrepObsSelector key={i} label={obs.label} values={obs.values}/>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════════════════ GUIDANCE ════════════════ */}
          {pTab==="guidance" && (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {GUIDE_CATS.map(cat => (
                <div key={cat.key} style={{...css.card,borderLeft:`3px solid ${cat.color}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <span style={{fontSize:15}}>{cat.icon}</span>
                    <div style={{fontSize:14,fontWeight:700,color:C.text}}>{t(cat.labelKey)}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {GUIDANCE_DB[cat.key].map((tip,i) => (
                      <div key={i} style={{background:cat.color+"08",border:`1px solid ${cat.color}25`,borderRadius:8,padding:"11px 12px",display:"flex",gap:9}}>
                        <span style={{color:cat.color,fontFamily:"'DM Mono',monospace",fontSize:10,marginTop:2,flexShrink:0}}>{String(i+1).padStart(2,"0")}</span>
                        <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ════════════════ ANALYSE MEETING ════════════════ */}
          {pTab==="analyse" && (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{...css.card,borderLeft:`3px solid ${C.blue}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:13}}>🎙️</span>
                  <Mono color={C.blue} size={9}>{t("prep1on1.analyse.transcript")}</Mono>
                </div>
                <textarea
                  value={meetingAnalysis.transcript}
                  onChange={e=>setMeetingAnalysis(p=>({...p,transcript:e.target.value}))}
                  placeholder={t("prep1on1.analyse.transcriptPh")}
                  rows={8} style={{...css.textarea,fontSize:12}}
                  onFocus={e=>e.target.style.borderColor=C.blue}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
              </div>
              <div style={{...css.card,borderLeft:`3px solid ${C.amber}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:13}}>⭐</span>
                  <Mono color={C.amber} size={9}>{t("prep1on1.analyse.keyPoints")}</Mono>
                </div>
                <textarea
                  value={meetingAnalysis.keyPoints}
                  onChange={e=>setMeetingAnalysis(p=>({...p,keyPoints:e.target.value}))}
                  placeholder={t("prep1on1.analyse.keyPointsPh")}
                  rows={4} style={{...css.textarea,fontSize:12}}
                  onFocus={e=>e.target.style.borderColor=C.amber}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
              </div>
              <div style={{padding:"10px 14px",background:C.blue+"10",border:`1px solid ${C.blue}33`,borderRadius:8}}>
                <span style={{fontSize:11,color:C.blue}}>
                  {t("prep1on1.analyse.injectedNote")}
                </span>
              </div>
            </div>
          )}

          {/* ════════════════ NOTES ════════════════ */}
          {pTab==="notes" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {NOTE_CATS.map(cat => {
                  const catLabel = t(cat.labelKey);
                  return (
                  <div key={cat.key} style={{...css.card,borderLeft:`3px solid ${cat.color}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <span style={{fontSize:13}}>{cat.icon}</span>
                      <Mono color={cat.color} size={9}>{catLabel}</Mono>
                    </div>
                    <textarea value={notes[cat.key]||""}
                      onChange={e=>setNotes(p=>({...p,[cat.key]:e.target.value}))}
                      placeholder={`${t("prep1on1.notes.placeholderPrefix")} ${catLabel.toLowerCase()}…`}
                      rows={4} style={{...css.textarea,fontSize:12}}
                      onFocus={e=>e.target.style.borderColor=cat.color}
                      onBlur={e=>e.target.style.borderColor=C.border}/>
                  </div>
                  );
                })}
              </div>
              <div style={{marginTop:12,padding:"10px 14px",background:C.teal+"10",border:`1px solid ${C.teal}33`,borderRadius:8}}>
                <span style={{fontSize:11,color:C.teal}}>
                  {t("meetingEngine.notes.helper")}
                </span>
              </div>
            </div>
          )}

          {/* ════════════════ OUTPUT ════════════════ */}
          {pTab==="output" && (
            <div>
              {outputLoading && <AILoader label={t("meetingEngine.output.loaderFull")}/>}

              {!output && !outputLoading && (
                <div style={{background:C.surfL,border:`2px dashed ${C.border}`,borderRadius:12,padding:"48px 24px",textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:12}}>📊</div>
                  <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>{t("prep1on1.output.empty.title")}</div>
                  <div style={{fontSize:12,color:C.textD,maxWidth:400,margin:"0 auto 16px"}}>
                    {needsInvestigationLink
                      ? t("meetingEngine.output.empty.bodyBlocked")
                      : t("meetingEngine.output.empty.body")}
                  </div>
                  <button onClick={generateOutput} disabled={needsInvestigationLink}
                    title={needsInvestigationLink ? t("meetingEngine.context.linkRequiredTip") : undefined}
                    style={{...css.btn(needsInvestigationLink ? C.textD : C.em), opacity: needsInvestigationLink ? 0.6 : 1}}>
                    {t("prep1on1.topbar.generateOutput")}
                  </button>
                </div>
              )}

              {output && (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>

                  {/* ── Section 1: Résumé exécutif ── */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12}}>
                    <div style={{...css.card,borderLeft:`3px solid ${RISK_C[output.overallRisk]||C.em}`}}>
                      {output.meetingTitle && <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4}}>{output.meetingTitle}</div>}
                      {output.director && <div style={{fontSize:11,color:C.textD,marginBottom:8}}>{t("meetingEngine.output.managerLabel")} {output.director}</div>}
                      <Mono color={C.em} size={9}>{t("meetingEngine.output.summaryHeader")}</Mono>
                      <div style={{marginTop:8}}>
                        {(output.summary||[]).map((s,i) => (
                          <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
                            <div style={{width:5,height:5,borderRadius:"50%",background:C.em,marginTop:6,flexShrink:0}}/>
                            <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{s}</span>
                          </div>
                        ))}
                      </div>
                      {output.hrbpKeyMessage && (
                        <div style={{marginTop:10,padding:"8px 11px",background:C.purple+"10",border:`1px solid ${C.purple}25`,borderRadius:7}}>
                          <span style={{fontSize:11,color:C.purple,fontWeight:600}}>{t("meetingEngine.output.keyMessageArrow")}</span>
                          <span style={{fontSize:12,color:C.text,lineHeight:1.6}}>{output.hrbpKeyMessage}</span>
                        </div>
                      )}
                    </div>
                    <div style={{background:(RISK_C[output.overallRisk]||C.em)+"18",border:`2px solid ${RISK_C[output.overallRisk]||C.em}`,borderRadius:10,padding:"16px 20px",textAlign:"center",minWidth:110,flexShrink:0}}>
                      <Mono color={RISK_C[output.overallRisk]||C.em} size={9}>{t("prep1on1.output.risk")}</Mono>
                      <div style={{fontSize:18,fontWeight:800,color:RISK_C[output.overallRisk]||C.em,marginTop:8}}>{output.overallRisk}</div>
                      {output.overallRiskRationale && <div style={{fontSize:10,color:C.textM,marginTop:6,lineHeight:1.4}}>{output.overallRiskRationale}</div>}
                    </div>
                  </div>

                  {/* ── Section 2: Signaux & Risques enrichis ── */}
                  {(output.signals||[]).length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.amber}`}}>
                      <Mono color={C.amber} size={9}>{t("meetingEngine.output.signalsDetailed")}</Mono>
                      <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:10}}>
                        {output.signals.map((s,i) => (
                          <div key={i} style={{padding:"10px 12px",background:C.amber+"08",borderRadius:8,border:`1px solid ${C.amber}20`}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                              <span style={{fontSize:13,fontWeight:600,color:C.text}}>{s.signal}</span>
                              {s.ampleur && <Badge label={s.ampleur} color={AMPLEUR_C[s.ampleur]||C.blue} size={9}/>}
                              {s.categorie && <Badge label={s.categorie} color={C.textD} size={9}/>}
                            </div>
                            {s.interpretation && <div style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{s.interpretation}</div>}
                            {s.consequence && <div style={{fontSize:11,color:C.red,fontStyle:"italic",marginTop:4}}>{t("meetingEngine.output.signalsIfUnaddressed")}{s.consequence}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(output.risks||[]).length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.red}`}}>
                      <Mono color={C.red} size={9}>{t("meetingEngine.output.risksDetailed")}</Mono>
                      <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                        {output.risks.map((r,i) => (
                          <div key={i} style={{padding:"9px 12px",background:C.red+"08",borderRadius:8,border:`1px solid ${C.red}20`}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                              <span style={{fontSize:13,fontWeight:600,color:C.text}}>{r.risque}</span>
                              <Badge label={r.niveau} color={RISK_C[r.niveau]||C.textD} size={9}/>
                              {r.tendance && <Badge label={r.tendance} color={TENDANCE_C[r.tendance]||C.textD} size={9}/>}
                            </div>
                            {r.rationale && <div style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{r.rationale}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Section 3: People ── */}
                  {output.people && (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                      {[
                        {key:"performance",labelKey:"prep1on1.noteCat.performance",icon:"📈",color:C.blue},
                        {key:"leadership", labelKey:"prep1on1.noteCat.leadership", icon:"🧭",color:C.purple},
                        {key:"engagement", labelKey:"prep1on1.signalCat.disengagement", icon:"🌡", color:C.amber},
                      ].map(({key,labelKey,icon,color}) => (
                        <div key={key} style={{...css.card,borderLeft:`3px solid ${color}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                            <span style={{fontSize:13}}>{icon}</span>
                            <Mono color={color} size={9}>{key === "engagement" ? "Engagement" : t(labelKey)}</Mono>
                          </div>
                          <div style={{fontSize:12,color:C.textM,lineHeight:1.6}}>
                            {typeof output.people[key] === "string" ? output.people[key]
                              : Array.isArray(output.people[key]) ? output.people[key].join(". ")
                              : "N/D"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Variante: Disciplinaire ── */}
                  {(engineType === "disciplinaire" || engineType === "enquete") && output.cadreJuridique && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.red}`,background:C.red+"06"}}>
                      <Mono color={C.red} size={9}>{t("meetingEngine.output.cadre.title")}</Mono>
                      <div style={{marginTop:10}}>
                        {output.cadreJuridique.politiquesVisees?.length > 0 && <div style={{marginBottom:8}}>
                          <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:4}}>{t("meetingEngine.output.cadre.policies")}</div>
                          {output.cadreJuridique.politiquesVisees.map((p,i) => <div key={i} style={{display:"flex",gap:8,marginBottom:4}}><span style={{color:C.red,fontSize:10}}>•</span><span style={{fontSize:12,color:C.textM}}>{p}</span></div>)}
                        </div>}
                        {output.cadreJuridique.loisApplicables?.length > 0 && <div style={{marginBottom:8}}>
                          <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:4}}>{t("meetingEngine.output.cadre.laws")}</div>
                          {output.cadreJuridique.loisApplicables.map((l,i) => <div key={i} style={{display:"flex",gap:8,marginBottom:4}}><span style={{color:C.purple,fontSize:10}}>•</span><span style={{fontSize:12,color:C.textM}}>{l}</span></div>)}
                        </div>}
                        {output.cadreJuridique.progressivite && <div style={{padding:"6px 10px",background:C.amber+"10",borderRadius:6,fontSize:11,color:C.amber}}>{t("meetingEngine.output.cadre.progressivityPrefix")}{output.cadreJuridique.progressivite}{output.cadreJuridique.progressiviteNote ? ` — ${output.cadreJuridique.progressiviteNote}` : ""}</div>}
                      </div>
                    </div>
                  )}
                  {(engineType === "disciplinaire" || engineType === "enquete") && output.sanctions?.length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.red}`}}>
                      <Mono color={C.red} size={9}>{t("meetingEngine.output.sanctions.title")}</Mono>
                      <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                        {output.sanctions.map((s,i) => (
                          <div key={i} style={{padding:"8px 12px",background:C.red+"08",borderRadius:7}}>
                            <div style={{fontSize:13,fontWeight:600,color:C.red}}>{s.type}</div>
                            {s.duree && <div style={{fontSize:11,color:C.textM,marginTop:3}}>{t("meetingEngine.output.sanctions.duration")}{s.duree}</div>}
                            {s.conditions?.length > 0 && <div style={{marginTop:6}}>{s.conditions.map((c,j) => <div key={j} style={{fontSize:11,color:C.textM}}>→ {c}</div>)}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(engineType === "disciplinaire" || engineType === "enquete") && output.risquesLegaux?.length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.amber}`}}>
                      <Mono color={C.amber} size={9}>{t("meetingEngine.output.legalRisks")}</Mono>
                      <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                        {output.risquesLegaux.map((r,i) => (
                          <div key={i} style={{padding:"8px 12px",background:C.amber+"08",borderRadius:7}}>
                            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}><Badge label={r.niveau} color={RISK_C[r.niveau]||C.textD} size={9}/><span style={{fontSize:12,color:C.text}}>{r.risque}</span></div>
                            {r.mitigation && <div style={{fontSize:11,color:C.em}}>→ {r.mitigation}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Variante: Mediation ── */}
                  {engineType === "mediation" && (output.partieA || output.partieB) && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.purple}`}}>
                      <Mono color={C.purple} size={9}>{t("meetingEngine.output.parties.title")}</Mono>
                      <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                        {[{key:"partieA",label:t("meetingEngine.output.parties.partyA"),data:output.partieA},{key:"partieB",label:t("meetingEngine.output.parties.partyB"),data:output.partieB}].map((p) => p.data && (
                          <div key={p.key} style={{padding:"10px 12px",background:C.purple+"08",borderRadius:7,border:`1px solid ${C.purple}25`}}>
                            <div style={{fontSize:12,fontWeight:700,color:C.purple,marginBottom:6}}>{p.label}{p.data.nom ? ` — ${p.data.nom}` : ""}</div>
                            {p.data.position && <div style={{fontSize:11,color:C.textM,marginBottom:6}}><span style={{color:C.textD,fontWeight:600}}>{t("meetingEngine.output.parties.position")}</span>{p.data.position}</div>}
                            {p.data.perception && <div style={{fontSize:11,color:C.textM,marginBottom:6}}><span style={{color:C.textD,fontWeight:600}}>{t("meetingEngine.output.parties.perception")}</span>{p.data.perception}</div>}
                            {p.data.attentes?.length > 0 && (
                              <div>
                                <div style={{fontSize:10,color:C.textD,fontWeight:600,marginBottom:3}}>{t("meetingEngine.output.parties.expectations")}</div>
                                {p.data.attentes.map((a,j) => <div key={j} style={{display:"flex",gap:6,marginBottom:2}}><span style={{color:C.purple,fontSize:10}}>→</span><span style={{fontSize:11,color:C.textM}}>{a}</span></div>)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Variante: TA ── */}
                  {engineType === "ta" && output.postes?.length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.teal}`}}>
                      <Mono color={C.teal} size={9}>{t("meetingEngine.output.ta.title")}</Mono>
                      {output.pipeline && (
                        <div style={{display:"flex",gap:10,marginTop:8,marginBottom:12,flexWrap:"wrap"}}>
                          {[{l:t("meetingEngine.output.ta.active"),v:output.pipeline.postesActifs,c:C.blue},{l:t("meetingEngine.output.ta.inOffer"),v:output.pipeline.enOffre,c:C.amber},{l:t("meetingEngine.output.ta.closed"),v:output.pipeline.fermes,c:C.teal}].map((m,i) => (
                            <div key={i} style={{background:m.c+"12",border:`1px solid ${m.c}30`,borderRadius:7,padding:"8px 14px",textAlign:"center"}}>
                              <div style={{fontSize:18,fontWeight:800,color:m.c}}>{m.v ?? "—"}</div>
                              <div style={{fontSize:9,color:C.textD,fontFamily:"'DM Mono',monospace"}}>{m.l.toUpperCase()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {output.postes.map((p,i) => (
                          <div key={i} style={{padding:"9px 12px",background:C.teal+"08",borderRadius:7,border:`1px solid ${C.teal}20`}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                              <span style={{fontSize:13,fontWeight:600,color:C.text}}>{p.titre}</span>
                              {p.etape && <Badge label={p.etape} color={C.blue} size={9}/>}
                              {p.risque && <Badge label={p.risque} color={RISK_C[p.risque]||C.textD} size={9}/>}
                            </div>
                            {p.prochainePriorite && <div style={{fontSize:11,color:C.em}}>→ {p.prochainePriorite}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Variante: Initiatives ── */}
                  {engineType === "initiatives" && output.initiatives?.length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.em}`}}>
                      <Mono color={C.em} size={9}>{t("meetingEngine.output.initiatives")}</Mono>
                      <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                        {output.initiatives.map((init,i) => {
                          const sc = {"En cours":C.em,"Planifiee":C.blue,"Planifiée":C.blue,"Bloquee":C.red,"Bloquée":C.red,"Completee":C.teal,"Complétée":C.teal}[init.statut]||C.blue;
                          return (
                            <div key={i} style={{padding:"10px 12px",background:sc+"08",borderRadius:7,border:`1px solid ${sc}25`}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                <span style={{fontSize:13,fontWeight:600,color:C.text}}>{init.nom}</span>
                                <Badge label={init.statut} color={sc} size={9}/>
                                {init.avancement && <Badge label={init.avancement} color={C.textD} size={9}/>}
                              </div>
                              {init.prochainePas && <div style={{fontSize:11,color:C.em}}>→ {init.prochainePas}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Section 4: Plan d'action ── */}
                  <div style={{...css.card,borderLeft:`3px solid ${C.em}`}}>
                    <Mono color={C.em} size={9}>{t("prep1on1.output.actionPlan")}</Mono>
                    <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:7}}>
                      {(output.actions||[]).map((a,i) => (
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",background:C.surfLL,borderRadius:8,border:`1px solid ${C.border}`}}>
                          <span style={{color:C.em,fontFamily:"'DM Mono',monospace",fontSize:10,flexShrink:0}}>{String(i+1).padStart(2,"0")}</span>
                          <span style={{fontSize:13,color:C.text,flex:1}}>{a.action}</span>
                          <Badge label={a.owner} color={C.blue} size={10}/>
                          <Badge label={a.delai} color={DELAY_C[a.delai]||C.teal} size={10}/>
                          <Badge label={a.priorite} color={a.priorite==="Critique"?C.red:a.priorite==="Elevee"||a.priorite==="Élevée"?C.red:C.textD} size={10}/>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Section 5: Stratégie HRBP ── */}
                  {output.strategieHRBP && (() => {
                    const s = output.strategieHRBP;
                    const postureColor = {"Coach":C.em,"Challenge":C.amber,"Directif":C.red,"Escalader":"#7a1e2e"}[s.postureHRBP?.mode] || C.purple;
                    const perfColor = {"Forte":C.em,"Correcte":C.blue,"A risque":C.amber,"Critique":C.red}[s.santeEquipe?.performance] || C.textD;
                    const engColor  = {"Eleve":C.em,"Modere":C.blue,"Fragile":C.amber,"Critique":C.red}[s.santeEquipe?.engagement] || C.textD;
                    const riskColor = RISK_C[s.risqueCle?.niveau] || C.textD;
                    return (
                    <div style={{border:`2px solid ${C.purple}40`,borderRadius:11,background:C.purple+"06",overflow:"hidden"}}>
                      <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.purple}25`,display:"flex",alignItems:"center",gap:10,background:C.purple+"10"}}>
                        <div style={{width:28,height:28,background:C.purple,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🧠</div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:C.purple}}>{t("prep1on1.strategy.title")}</div>
                          <div style={{fontSize:10,color:C.textD,fontFamily:"'DM Mono',monospace",letterSpacing:0.5}}>ANALYSE STRATÉGIQUE</div>
                        </div>
                      </div>

                      <div style={{padding:"16px 18px",display:"flex",flexDirection:"column",gap:14}}>
                        {s.lectureGestionnaire && (
                          <div>
                            <Mono color={C.purple} size={9}>{t("prep1on1.strategy.managerRead")}</Mono>
                            <div style={{marginTop:8,display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-start"}}>
                              <div style={{background:C.purple+"18",border:`1px solid ${C.purple}40`,borderRadius:7,padding:"5px 12px",fontSize:12,color:C.purple,fontWeight:600}}>{s.lectureGestionnaire.style}</div>
                            </div>
                            {s.lectureGestionnaire.forces && (
                              <div style={{marginTop:8,display:"flex",gap:8,alignItems:"flex-start"}}>
                                <span style={{color:C.em,fontSize:11,flexShrink:0,marginTop:2}}>+</span>
                                <span style={{fontSize:12,color:C.textM,lineHeight:1.6}}>{typeof s.lectureGestionnaire.forces === "string" ? s.lectureGestionnaire.forces : (s.lectureGestionnaire.forces||[]).join(", ")}</span>
                              </div>
                            )}
                            {s.lectureGestionnaire.angle && (
                              <div style={{marginTop:8,padding:"7px 10px",background:C.purple+"10",borderRadius:7,fontSize:12,color:C.text,lineHeight:1.6}}>
                                <span style={{color:C.purple,fontWeight:600}}>{t("prep1on1.strategy.angleArrow")}</span>{s.lectureGestionnaire.angle}
                              </div>
                            )}
                          </div>
                        )}

                        {s.santeEquipe && (
                          <div>
                            <Mono color={C.purple} size={9}>{t("prep1on1.strategy.teamHealth")}</Mono>
                            <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                              <div style={{display:"flex",gap:6,alignItems:"center",padding:"5px 11px",borderRadius:7,background:perfColor+"15",border:`1px solid ${perfColor}35`}}>
                                <span style={{fontSize:10,color:C.textD,fontFamily:"'DM Mono',monospace"}}>{t("prep1on1.strategy.perf")}</span>
                                <span style={{fontSize:12,fontWeight:700,color:perfColor}}>{s.santeEquipe.performance}</span>
                              </div>
                              <div style={{display:"flex",gap:6,alignItems:"center",padding:"5px 11px",borderRadius:7,background:engColor+"15",border:`1px solid ${engColor}35`}}>
                                <span style={{fontSize:10,color:C.textD,fontFamily:"'DM Mono',monospace"}}>{t("prep1on1.strategy.eng")}</span>
                                <span style={{fontSize:12,fontWeight:700,color:engColor}}>{s.santeEquipe.engagement}</span>
                              </div>
                            </div>
                            {s.santeEquipe.dynamique && <div style={{marginTop:8,fontSize:12,color:C.textM,lineHeight:1.6}}>{s.santeEquipe.dynamique}</div>}
                          </div>
                        )}

                        {s.risqueCle && (
                          <div style={{padding:"10px 12px",background:riskColor+"10",border:`1px solid ${riskColor}30`,borderRadius:8}}>
                            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                              <Mono color={riskColor} size={9}>{t("prep1on1.strategy.keyRisk")}</Mono>
                              <div style={{background:riskColor+"20",border:`1px solid ${riskColor}50`,borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:700,color:riskColor}}>{s.risqueCle.niveau}</div>
                              <div style={{fontSize:12,fontWeight:600,color:riskColor}}>{s.risqueCle.nature}</div>
                            </div>
                            {s.risqueCle.rationale && <div style={{fontSize:12,color:C.textM}}>{s.risqueCle.rationale}</div>}
                          </div>
                        )}

                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                          {s.postureHRBP && (
                            <div>
                              <Mono color={C.purple} size={9}>{t("prep1on1.strategy.posture")}</Mono>
                              <div style={{marginTop:8,display:"flex",gap:8,alignItems:"center",padding:"8px 12px",background:postureColor+"15",border:`2px solid ${postureColor}50`,borderRadius:8}}>
                                <span style={{fontSize:18,flexShrink:0}}>{{"Coach":"🎯","Challenge":"⚡","Directif":"🔴","Escalader":"🚨"}[s.postureHRBP.mode]||"🧠"}</span>
                                <div>
                                  <div style={{fontSize:13,fontWeight:700,color:postureColor}}>{s.postureHRBP.mode}</div>
                                  {s.postureHRBP.rationale && <div style={{fontSize:11,color:C.textM,lineHeight:1.5,marginTop:2}}>{s.postureHRBP.rationale}</div>}
                                </div>
                              </div>
                            </div>
                          )}
                          {s.objectifRencontre && (
                            <div>
                              <Mono color={C.purple} size={9}>{t("prep1on1.strategy.objective")}</Mono>
                              <div style={{marginTop:8,padding:"8px 12px",background:C.em+"10",border:`1px solid ${C.em}30`,borderRadius:8,fontSize:12,color:C.text,lineHeight:1.65}}>{s.objectifRencontre}</div>
                            </div>
                          )}
                        </div>

                        {s.strategieInfluence && (
                          <div>
                            <Mono color={C.purple} size={9}>{t("prep1on1.strategy.influence")}</Mono>
                            <div style={{marginTop:8,padding:"9px 12px",background:C.purple+"10",border:`1px solid ${C.purple}25`,borderRadius:8,fontSize:12,color:C.text,lineHeight:1.7,fontStyle:"italic"}}>"{s.strategieInfluence}"</div>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                  {/* ── Section 6: Prochain meeting + Cross-questions + Case ── */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    {[
                      {titleKey:"prep1on1.output.quadrant.signals",   key:"keySignals",           color:C.amber},
                      {titleKey:"prep1on1.output.quadrant.risks",     key:"mainRisks",            color:C.red},
                      {titleKey:"prep1on1.output.quadrant.followups", key:"hrbpFollowups",        color:C.em},
                      {titleKey:"prep1on1.output.quadrant.next",      key:"nextMeetingQuestions", color:C.blue},
                    ].map(({titleKey,key,color}) => (
                      <div key={key} style={{...css.card,borderLeft:`3px solid ${color}`}}>
                        <Mono color={color} size={9}>{t(titleKey)}</Mono>
                        <div style={{marginTop:10}}>
                          {(output[key]||[]).map((item,i) => (
                            <div key={i} style={{display:"flex",gap:8,marginBottom:7}}>
                              <div style={{width:5,height:5,borderRadius:"50%",background:color,marginTop:6,flexShrink:0}}/>
                              <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Cross-questions */}
                  {(output.crossQuestions||[]).length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.teal}`}}>
                      <Mono color={C.teal} size={9}>{t("meetingEngine.output.crossQuestions")}</Mono>
                      <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                        {output.crossQuestions.map((cq,i) => (
                          <div key={i} style={{padding:"9px 12px",background:C.teal+"08",borderRadius:7,border:`1px solid ${C.teal}20`}}>
                            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                              <span style={{fontSize:12,fontWeight:600,color:C.text}}>{cq.nom||cq.person}</span>
                              {(cq.role||cq.relationship) && <Badge label={cq.role||cq.relationship} color={C.purple} size={9}/>}
                            </div>
                            <div style={{fontSize:12,color:C.textM,fontStyle:"italic",lineHeight:1.5}}>
                              "{cq.question || (cq.questions||[]).map(q=>q.question||q).join(" / ")}"
                            </div>
                            {(cq.contexte||cq.context) && <div style={{fontSize:11,color:C.textD,marginTop:4}}>{cq.contexte||cq.context}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Case entry suggestion */}
                  {output.caseEntry && output.caseEntry.titre && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.blue}`,background:C.blue+"06"}}>
                      <Mono color={C.blue} size={9}>{t("meetingEngine.output.caseEntry")}</Mono>
                      <div style={{marginTop:10}}>
                        <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:6}}>{output.caseEntry.titre || output.caseEntry.title}</div>
                        <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                          {(output.caseEntry.type) && <Badge label={output.caseEntry.type} color={C.blue} size={10}/>}
                          {(output.caseEntry.risque || output.caseEntry.riskLevel) && <Badge label={output.caseEntry.risque || output.caseEntry.riskLevel} color={RISK_C[output.caseEntry.risque||output.caseEntry.riskLevel]||C.textD} size={10}/>}
                        </div>
                        <div style={{fontSize:12,color:C.textM,lineHeight:1.6}}>{output.caseEntry.situation}</div>
                      </div>
                    </div>
                  )}

                  {/* ── Cases liés (créés depuis ce meeting) ── */}
                  {linkedCases.length > 0 && (
                    <div style={{...css.card, borderLeft:`3px solid ${C.em}`, background:C.em+"06"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <Mono color={C.em} size={9}>{t("meetingEngine.output.linkedCases")}</Mono>
                        <span style={{fontSize:10,color:C.textD}}>{linkedCases.length}</span>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {linkedCases.map(lc => {
                          const riskColor = RISK_C[lc.riskLevel] || C.textD;
                          const clickable = typeof onNavigate === "function";
                          return (
                            <div key={lc.id}
                              onClick={clickable ? () => openLinkedCase(lc.id) : undefined}
                              role={clickable ? "button" : undefined}
                              tabIndex={clickable ? 0 : undefined}
                              onKeyDown={clickable ? (e => { if (e.key === "Enter" || e.key === " ") openLinkedCase(lc.id); }) : undefined}
                              style={{
                                background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
                                padding:"8px 12px", display:"flex", alignItems:"center", gap:10,
                                cursor: clickable ? "pointer" : "default", transition:"border-color .15s",
                              }}
                              onMouseEnter={clickable ? (e => { e.currentTarget.style.borderColor = C.em; }) : undefined}
                              onMouseLeave={clickable ? (e => { e.currentTarget.style.borderColor = C.border; }) : undefined}>
                              <div style={{flex:1, minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:600,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                  {lc.title || t("meetingEngine.output.linkedCases.fallback")}
                                </div>
                              </div>
                              {lc.type && <Badge label={lc.type} color={C.blue} size={9}/>}
                              {lc.riskLevel && <Badge label={lc.riskLevel} color={riskColor} size={9}/>}
                              {clickable && <span style={{fontSize:11,color:C.em,fontWeight:600}}>→</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── CYCLE CLOSER ── */}
                  <div style={{padding:"16px 18px",background:C.purple+"18",border:`2px solid ${C.purple}40`,borderRadius:11}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.purple,marginBottom:5}}>
                          {t("prep1on1.cycle.title")}
                        </div>
                        <div style={{fontSize:12,color:C.textD,marginBottom:10}}>
                          {output.nextMeetingContext || t("meetingEngine.cycle.fallback")}
                        </div>
                        {output.nextMeetingQuestions?.length > 0 && (
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {output.nextMeetingQuestions.map((q,i) => (
                              <div key={i} style={{background:C.purple+"20",border:`1px solid ${C.purple}40`,borderRadius:6,padding:"4px 10px",fontSize:11,color:C.purple}}>
                                {q.length > 55 ? q.substring(0,55)+"…" : q}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={startNextCycle}
                        style={{...css.btn(C.purple),padding:"10px 18px",fontSize:13,whiteSpace:"nowrap",flexShrink:0}}>
                        {t("prep1on1.cycle.cta")}
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

        </div>{/* end body */}
      </div>{/* end main */}
    </div>

    {/* ── CASE CANDIDATES REVIEW MODAL ── */}
    {showCandidatesModal && caseCandidates.length > 0 && (() => {
      const pendingCount = caseCandidates.filter(c => !candidateActions[c.id]).length;
      const allDone = pendingCount === 0;
      return (
        <div role="dialog" aria-modal="true"
             style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      zIndex:1000, padding:20 }}
             onClick={closeCandidatesModal}>
          <div onClick={e => e.stopPropagation()}
               style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:12,
                        width:"min(720px, 100%)", maxHeight:"85vh", display:"flex",
                        flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}` }}>
              <Mono color={C.em} size={9}>{t("meetingEngine.candidates.header")}</Mono>
              <div style={{ fontSize:15, fontWeight:700, color:C.text, marginTop:4 }}>
                {t("meetingEngine.candidates.title")}
              </div>
              <div style={{ fontSize:11, color:C.textD, marginTop:4 }}>
                {t("meetingEngine.candidates.subtitle")}
              </div>
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:"14px 20px" }}>
              {caseCandidates.map(cand => {
                const action = candidateActions[cand.id];
                const riskColor = RISK_C[cand.riskLevel] || C.textD;
                return (
                  <div key={cand.id}
                       style={{ ...css.card, marginBottom:10,
                                borderLeft:`3px solid ${action==="created"?C.em:action==="ignored"?C.textD:C.blue}`,
                                opacity: action ? 0.7 : 1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:6 }}>
                          {cand.title}
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
                          {cand.type && <Badge label={cand.type} color={C.blue} size={9}/>}
                          {cand.riskLevel && <Badge label={cand.riskLevel} color={riskColor} size={9}/>}
                          {cand.source && <Badge label={cand.source} color={C.textD} size={9}/>}
                        </div>
                        {cand.summary && (
                          <div style={{ fontSize:12, color:C.textM, lineHeight:1.5 }}>
                            {cand.summary}
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                        {action === "created" ? (
                          <span style={{ fontSize:11, color:C.em, fontWeight:600 }}>{t("meetingEngine.candidates.created")}</span>
                        ) : action === "ignored" ? (
                          <span style={{ fontSize:11, color:C.textD, fontWeight:600 }}>{t("meetingEngine.candidates.ignored")}</span>
                        ) : (
                          <>
                            <button onClick={() => createCaseFromCandidate(cand)}
                                    style={{ ...css.btn(C.em), padding:"6px 12px", fontSize:11 }}>
                              {t("meetingEngine.candidates.create")}
                            </button>
                            <button onClick={() => ignoreCandidate(cand)}
                                    style={{ ...css.btn(C.textD, true), padding:"6px 12px", fontSize:11 }}>
                              {t("meetingEngine.candidates.ignore")}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding:"12px 20px", borderTop:`1px solid ${C.border}`,
                          display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <button onClick={createAllCandidates} disabled={allDone}
                      style={{ ...css.btn(C.em), padding:"8px 14px", fontSize:12,
                               opacity: allDone ? 0.5 : 1,
                               cursor: allDone ? "not-allowed" : "pointer" }}>
                {t("meetingEngine.candidates.createAll")}
              </button>
              <button onClick={ignoreAllCandidates} disabled={allDone}
                      style={{ ...css.btn(C.textD, true), padding:"8px 14px", fontSize:12,
                               opacity: allDone ? 0.5 : 1,
                               cursor: allDone ? "not-allowed" : "pointer" }}>
                {t("meetingEngine.candidates.ignoreAll")}
              </button>
              <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:11, color:C.textD }}>
                  {pendingCount > 0 ? `${pendingCount} ${t("meetingEngine.candidates.pendingSuffix")}` : t("meetingEngine.candidates.allDone")}
                </span>
                <button onClick={closeCandidatesModal}
                        style={{ ...css.btn(C.blue, true), padding:"8px 14px", fontSize:12 }}>
                  {t("meetingEngine.candidates.close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
