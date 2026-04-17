// ── Module: Meeting Engine ───────────────────────────────────────────────────
// Fusion of 1:1 Engine + Meetings transcript analysis.
// Based on Prep1on1.jsx — enhanced output via MEETING_ENGINE_SP.

import { useState, useEffect } from "react";
import { C, css, RISK, DELAY_C } from '../theme.js';
import { buildLegalPromptContext, isLegalSensitive } from '../utils/legal.js';
import { normKey } from '../utils/format.js';
import { emptyMeta, setMeta, getLeadersMap } from '../utils/leaderStore.js';
import { callAI } from '../api/index.js';
import { MEETING_ENGINE_SP } from '../prompts/meetingEngine.js';
import Mono          from '../components/Mono.jsx';
import Badge         from '../components/Badge.jsx';
import AILoader      from '../components/AILoader.jsx';
import ProvinceSelect from '../components/ProvinceSelect.jsx';

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
  {value:"regular",label:"1:1 régulier"},{value:"perf",label:"Discussion de performance"},
  {value:"org",label:"Changement organisationnel"},{value:"talent",label:"Revue de talent"},
  {value:"concern",label:"Enjeu RH sensible"},{value:"strategic",label:"Alignement stratégique"},
];
const PREP_FUNCTIONS = [
  {value:"",label:"Sélectionner…"},{value:"IT",label:"Technologies de l'information"},
  {value:"network",label:"Network Planning"},{value:"ops",label:"Opérations"},
  {value:"finance",label:"Finance"},{value:"corporate",label:"Corporate / Siège"},
  {value:"hr",label:"Ressources humaines"},{value:"other",label:"Autre"},
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

const ENGINE_TYPES = [
  { id:"1on1",          label:"1:1",                        icon:"👤", color:C.blue,   legal:false, desc:"Rencontre régulière de suivi avec un gestionnaire" },
  { id:"disciplinaire", label:"Disciplinaire",              icon:"⚖️", color:C.red,    legal:true,  desc:"Notifier formellement un manquement, documenter les faits" },
  { id:"performance",   label:"Performance",                icon:"📊", color:C.amber,  legal:false, desc:"Discuter d'écarts de performance et convenir d'un plan" },
  { id:"coaching",      label:"Coaching / Développement",   icon:"🎯", color:C.teal,   legal:false, desc:"Renforcer les forces, identifier les zones de croissance" },
  { id:"recadrage",     label:"Recadrage / Clarification",  icon:"🔄", color:C.amber,  legal:false, desc:"Recadrer un comportement précis sans escalade" },
  { id:"mediation",     label:"Médiation / Conflit",        icon:"🤝", color:C.purple, legal:false, desc:"Faciliter une conversation entre deux parties en conflit" },
  { id:"enquete",       label:"Enquête / Investigation",    icon:"🔍", color:C.red,    legal:true,  desc:"Recueillir des faits dans le cadre d'une enquête formelle" },
  { id:"suivi",         label:"Suivi",                      icon:"📋", color:C.blue,   legal:false, desc:"Faire le suivi d'un engagement pris lors d'une rencontre antérieure" },
  { id:"transition",    label:"Transition",                 icon:"🚀", color:C.em,     legal:false, desc:"Annoncer ou accompagner un changement de rôle, équipe ou structure" },
];

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
  summary: ["Voir les notes manuelles."], people: { performance: "A completer", leadership: "A completer", engagement: "A completer" },
  signals: [], risks: [], decisions: [], actions: [{ action: "Faire le suivi", owner: "HRBP", delai: "7 jours", priorite: "Normale" }],
  overallRisk: "Modere", overallRiskRationale: "A evaluer", hrbpKeyMessage: "Completer l analyse manuellement.",
  strategieHRBP: { lectureGestionnaire: { style: "A identifier", forces: "", angle: "" }, santeEquipe: { performance: "Correcte", engagement: "Modere", dynamique: "" }, risqueCle: { nature: "A identifier", niveau: "Modere", rationale: "" }, postureHRBP: { mode: "Coach", rationale: "" }, strategieInfluence: "", objectifRencontre: "" },
  keySignals: ["A completer"], mainRisks: ["A identifier"], hrbpFollowups: ["Reviser les notes"],
  nextMeetingContext: "", nextMeetingQuestions: ["A definir"], crossQuestions: [], caseEntry: null,
};

// ── Manager dropdown + free-text fallback ─────────────────────────────────────
function ManagerField({ data, ctx, setCtx, managerManual, setManagerManual }) {
  const leadersList = Object.values(data.leaders || {})
    .map(l => l.name || "")
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b, "fr"));
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
        Nom du gestionnaire
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
        <option value="" style={{background:C.surfL}}>— Sélectionner un gestionnaire —</option>
        {leadersList.map(n => (
          <option key={n} value={n} style={{background:C.surfL}}>{n}</option>
        ))}
        <option value="__manual__" style={{background:C.surfL}}>Autre (saisir manuellement)</option>
      </select>
      {managerManual && (
        <input
          value={ctx.managerName}
          onChange={e => setCtx(p => ({...p, managerName: e.target.value}))}
          placeholder="ex. Marie Tremblay"
          style={{...css.input, marginTop:6}}
          onFocus={e => e.target.style.borderColor = C.em}
          onBlur={e => e.target.style.borderColor = C.border}
          autoFocus/>
      )}
    </div>
  );
}

export default function MeetingEngine({ data, onSave, onNavigate, level = "gestionnaire" }) {

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

  // ── B-25: Consume pending meeting context bridge (from Cases) ─────────────
  useEffect(() => {
    try {
      if (typeof sessionStorage === "undefined") return;
      const raw = sessionStorage.getItem("hrbpos:pendingMeetingContext");
      if (!raw) return;
      sessionStorage.removeItem("hrbpos:pendingMeetingContext");
      const bridge = JSON.parse(raw);
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
    const risks    = (a.risks    || []).slice(0,2).map(r => r.risk || r.risque || r).join("; ");
    const actions  = (a.actions  || []).slice(0,3).map(ac => ac.action || ac).join("; ");
    const questions= (a.questions|| []).slice(0,3).map(q  => q.question|| q).join("; ");
    return `[Meeting ${i+1} — ${m.savedAt}]
Titre: ${a.meetingTitle||"N/D"} | Risque: ${a.overallRisk||"N/D"}
Resume: ${(a.summary||[]).slice(0,2).join(" / ")}
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
      c.status !== "closed" && c.status !== "resolved"
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
    const up = [
      `TYPE: ${engineType}`,
      `TYPE_LABEL: ${_engineMeta?.label || engineType}`,
      `CONTEXTE_TYPE: ${_typeCtxOut}`,
      `NIVEAU: ${niveau}`,
      `Gestionnaire: ${ctx.managerName||"N/A"}`,
      `Equipe: ${ctx.team||"N/A"}`,
      `Objectif: ${ctx.purpose||"N/A"}`,
      `Contexte: ${ctx.background||"N/A"}`,
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
    try { const p = await callAI(MEETING_ENGINE_SP, up); setOutput(p); }
    catch { setOutput(FALLBACK_OUTPUT); }
    finally { setOutputLoading(false); }
  };

  // ── Save current session ──────────────────────────────────────────────────
  const save1on1 = () => {
    if (!output || saved1on1) return;
    const today = new Date().toISOString().split("T")[0];
    const session = {
      id: Date.now().toString(), savedAt: today,
      managerName: ctx.managerName, team: ctx.team, meetingType: ctx.meetingType,
      engineType, niveau, kind: "1:1-meeting",
      date: ctx.date, purpose: ctx.purpose, notes, output,
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
        id: `mtg_${Date.now()}`,
        savedAt: today,
        dateCreated: today,
        director: ctx.managerName || "Non assigné",
        meetingType: ctx.meetingType || engineType || "1:1",
        scope: "leader",
        province: ctx.province || data.profile?.defaultProvince || "QC",
        kind: "1:1-meeting",
        niveau,
        analysis: {
          meetingTitle: output.meetingTitle || `1:1 — ${ctx.managerName || "?"} (${niveau || "gestionnaire"})`,
          director: ctx.managerName || "Non assigné",
          overallRisk: output.overallRisk || "Modéré",
          overallRiskRationale: output.overallRiskRationale || "",
          summary: output.summary || [],
          signals: output.signals || [],
          decisions: output.decisions || [],
          risks: output.risks || [],
          actions: output.actions || [],
          people: output.people || {},
          strategieHRBP: output.strategieHRBP || {},
          hrbpKeyMessage: output.hrbpKeyMessage || "",
          keySignals: output.keySignals || [],
          mainRisks: output.mainRisks || [],
          hrbpFollowups: output.hrbpFollowups || [],
          crossQuestions: output.crossQuestions || [],
          caseEntry: output.caseEntry || null,
        },
      };
      onSave("meetings", [meetingSession, ...(data.meetings || [])]);
    } catch (err) {
      console.warn("Meeting Engine — sync Meetings Hub failed:", err);
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

  // ── Static tab/category data ──────────────────────────────────────────────
  const PTABS = [
    {id:"guidance", icon:"🧭", label:"Guidance",        color:C.teal},
    {id:"context",  icon:"📋", label:"Contexte",        color:C.blue},
    {id:"history",  icon:"🕐", label:"Historique",      color:C.purple, badge:histCount||null},
    {id:"prep",     icon:"🎯", label:"Préparation",     color:C.em,     badge:prep?"✓":null},
    {id:"analyse",  icon:"🎙️", label:"Analyse meeting", color:C.blue,   badge:(meetingAnalysis.transcript||meetingAnalysis.keyPoints)?"✓":null},
    {id:"signals",  icon:"📡", label:"Signaux",         color:C.amber},
    {id:"notes",    icon:"📝", label:"Notes",           color:C.blue},
    {id:"output",   icon:"📊", label:"Output",          color:C.red,    badge:output?"✓":null},
  ];
  const PREP_CATS = [
    {key:"objectives",label:"Objectifs HRBP",       icon:"🎯",color:C.em},
    {key:"strategic", label:"Questions stratégiques",icon:"♟", color:C.blue},
    {key:"people",    label:"Personnes",             icon:"👥",color:C.teal},
    {key:"org",       label:"Organisation",          icon:"🏗", color:C.amber},
    {key:"leadership",label:"Leadership",            icon:"🧭",color:C.purple},
    {key:"performance",label:"Performance & Talent", icon:"📈",color:C.red},
    {key:"capacity",  label:"Capacité & Structure",  icon:"⚖️",color:C.em},
  ];
  const SIGNAL_CATS = [
    {key:"disengagement",label:"Désengagement",        icon:"🌡",color:C.amber},
    {key:"burnout",      label:"Épuisement / Surcharge",icon:"🔥",color:C.red},
    {key:"retention",    label:"Risques de rétention", icon:"✈", color:C.purple},
    {key:"tensions",     label:"Tensions d équipe",    icon:"⚡",color:C.amber},
    {key:"leadership",   label:"Enjeux de leadership", icon:"🧭",color:C.blue},
    {key:"org",          label:"Enjeux organisationnels",icon:"🏗",color:C.teal},
    {key:"succession",   label:"Succession & Capacités",icon:"🎯",color:C.em},
  ];
  const GUIDE_CATS = [
    {key:"positioning",label:"Me positionner",        icon:"♟",color:C.blue},
    {key:"challenge",  label:"Challenger",            icon:"🧲",color:C.purple},
    {key:"redirect",   label:"Rediriger vers le RH",  icon:"🔄",color:C.amber},
    {key:"probe",      label:"Sonder pour des preuves",icon:"🔍",color:C.teal},
    {key:"hidden_risks",label:"Risques cachés",       icon:"🎭",color:C.red},
  ];
  const NOTE_CATS = [
    {key:"people",     label:"Personnes",  icon:"👥",color:C.teal},
    {key:"performance",label:"Performance",icon:"📈",color:C.blue},
    {key:"risks",      label:"Risques",    icon:"⚠", color:C.red},
    {key:"org",        label:"Organisation",icon:"🏗",color:C.amber},
    {key:"leadership", label:"Leadership", icon:"🧭",color:C.purple},
    {key:"actions",    label:"Actions",    icon:"✅",color:C.em},
    {key:"followups",  label:"Suivis HRBP",icon:"🔁",color:C.blue},
  ];
  const RISK_C = {Critique:C.red,Eleve:C.amber,"Élevé":C.amber,"Elevé":C.amber,Modere:C.blue,"Modéré":C.blue,"Moderé":C.blue,Faible:C.em};
  const AMPLEUR_C = {"Isole":C.blue,"Isolé":C.blue,"Recurrent":C.amber,"Récurrent":C.amber,"Systemique":C.red,"Systémique":C.red};
  const TENDANCE_C = {"Nouveau":C.blue,"Persistant":C.amber,"Aggrave":C.red,"Aggravé":C.red,"En amelioration":C.em,"En amélioration":C.em};
  const normPrio = v => { if (!v) return v; const l = v.toLowerCase(); if (l==="faible"||l==="low") return "Faible"; if (l==="modéré"||l==="modere"||l==="moyen"||l==="medium") return "Modéré"; if (l==="élevé"||l==="eleve"||l==="elevé"||l==="haute"||l==="high") return "Élevé"; return v; };
  const activePTab = PTABS.find(t => t.id === pTab);
  const questions  = prep || PREP_QUESTIONS_DB;
  const activeEngine = ENGINE_TYPES.find(t => t.id === engineType);

  // ── FLOW STEPS ────────────────────────────────────────────────────────────
  const flowSteps = [
    { n:"1", label:"Contexte",           done:!!ctx.managerName,       tab:"context"  },
    { n:"2", label:"Historique",         done:histCount>0,             tab:"history"  },
    { n:"3", label:"Génère questions",   done:!!prep,                  tab:"prep"     },
    { n:"4", label:"Fais le meeting",    done:false },
    { n:"5", label:"Analyse meeting",    done:!!(meetingAnalysis.transcript||meetingAnalysis.keyPoints), tab:"analyse" },
    { n:"6", label:"Output + Archiver",  done:!!output && saved1on1,   tab:"output"   },
  ];

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"calc(100vh - 112px)", overflow:"hidden",
                  borderRadius:10, border:`1px solid ${C.border}` }}>

      {/* ── SIDEBAR ── */}
      <div style={{ width:210, background:C.surf, borderRight:`1px solid ${C.border}`,
                    display:"flex", flexDirection:"column", flexShrink:0 }}>

        {/* Header */}
        <div style={{ padding:"16px 14px 12px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, fontFamily:"'DM Mono',monospace", color:C.em,
                        letterSpacing:2, marginBottom:3 }}>MEETING ENGINE</div>
          <div style={{ fontSize:13, fontWeight:800, color:C.text }}>Analyse & Stratégie</div>
          {ctx.managerName && (
            <div style={{ marginTop:8, padding:"6px 9px", background:C.emD+"30",
                          borderRadius:6, border:`1px solid ${C.emD}` }}>
              <div style={{ fontSize:12, color:C.em, fontWeight:700 }}>{ctx.managerName}</div>
              <div style={{ fontSize:10, color:C.textD }}>
                {histCount > 0 ? `${histCount} meeting(s) archivé(s)` : "Nouveau gestionnaire"}
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
                        letterSpacing:1, marginBottom:8 }}>CYCLE EN COURS</div>
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
          {PTABS.map(t => {
            const active = pTab === t.id;
            return (
              <button key={t.id} onClick={()=>setPTab(t.id)} style={{
                display:"flex", alignItems:"center", gap:8, padding:"8px 9px",
                borderRadius:7, border:"none", cursor:"pointer", width:"100%",
                background: active ? t.color+"22" : "transparent",
                fontFamily:"'DM Sans',sans-serif", transition:"all .15s",
              }}>
                <span style={{ fontSize:13 }}>{t.icon}</span>
                <span style={{ fontSize:12, fontWeight:active?600:400,
                                color:active?t.color:C.textM, flex:1, textAlign:"left" }}>
                  {t.label}
                </span>
                {t.badge && (
                  <span style={{ background:t.color+"33", color:t.color, borderRadius:10,
                                  padding:"1px 6px", fontSize:9,
                                  fontFamily:"'DM Mono',monospace" }}>
                    {t.badge}
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
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{activePTab?.label}</div>
          {ctx.managerName && (
            <div style={{ fontSize:11, color:C.textD }}>
              {ctx.managerName}
              {ctx.team ? " · " + (PREP_FUNCTIONS.find(f=>f.value===ctx.team)?.label||ctx.team) : ""}
            </div>
          )}

          <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
            {pTab==="prep" && (
              <>
                {prepAI && <Badge label="✦ IA" color={C.em}/>}
                {histCount > 0 && <Badge label={`${histCount} meetings en mémoire`} color={C.purple}/>}
                <button onClick={generatePrep} disabled={!ctx.managerName||prepLoading}
                  style={{ ...css.btn(C.em), padding:"6px 14px", fontSize:12,
                            opacity:!ctx.managerName?.5:1 }}>
                  {prepLoading ? "Génération…"
                    : histCount > 0 ? `✦ Générer avec historique` : "✦ Générer"}
                </button>
              </>
            )}
            {pTab==="output" && (
              <>
                {output && (
                  <button onClick={copyOutput}
                    style={{ ...css.btn(C.blue,true), padding:"6px 12px", fontSize:11 }}>
                    {copied ? "✓ Copié" : "📋 Copier"}
                  </button>
                )}
                {output && (
                  <button onClick={save1on1} disabled={saved1on1}
                    style={{ ...css.btn(saved1on1?C.textD:C.purple,true),
                              padding:"6px 12px", fontSize:11 }}>
                    {saved1on1 ? "✓ Archivé" : "💾 Archiver"}
                  </button>
                )}
                <button onClick={generateOutput} disabled={outputLoading}
                  style={{ ...css.btn(C.em), padding:"6px 14px", fontSize:12 }}>
                  {outputLoading ? "Génération…" : "✦ Générer l'output"}
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
                <Mono color={C.blue} size={9}>TYPE D'ANALYSE</Mono>
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
                    ⚖ Le cadre juridique provincial sera injecté automatiquement dans l'analyse.
                  </div>
                )}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                <div style={{...css.card}}>
                  <Mono color={C.blue} size={9}>IDENTIFICATION</Mono>
                  <div style={{marginTop:10}}>
                    {/* ── Manager dropdown + fallback libre ── */}
                    <ManagerField data={data} ctx={ctx} setCtx={setCtx}
                      managerManual={managerManual} setManagerManual={setManagerManual}/>
                    {/* Date field */}
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        Date de la rencontre
                      </div>
                      <input value={ctx.date}
                        onChange={e=>setCtx(p=>({...p,date:e.target.value}))}
                        placeholder={new Date().toLocaleDateString("fr-CA")} style={{...css.input}}
                        onFocus={e=>e.target.style.borderColor=C.em}
                        onBlur={e=>e.target.style.borderColor=C.border}/>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        Niveau
                      </div>
                      <select value={niveau}
                        onChange={e=>setNiveau(e.target.value)}
                        style={{...css.select}}>
                        <option value="employe" style={{background:C.surfL}}>Employé</option>
                        <option value="gestionnaire" style={{background:C.surfL}}>Gestionnaire</option>
                        <option value="directeur" style={{background:C.surfL}}>Directeur</option>
                        <option value="vp" style={{background:C.surfL}}>VP</option>
                        <option value="executif" style={{background:C.surfL}}>Exécutif</option>
                        <option value="hrbp_team" style={{background:C.surfL}}>HRBP Team</option>
                        <option value="ta_team" style={{background:C.surfL}}>TA Team</option>
                        <option value="autres" style={{background:C.surfL}}>Autres</option>
                      </select>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        Équipe / Fonction
                      </div>
                      <select value={ctx.team}
                        onChange={e=>setCtx(p=>({...p,team:e.target.value}))}
                        style={{...css.select}}>
                        {PREP_FUNCTIONS.map(o =>
                          <option key={o.value} value={o.value}
                            style={{background:C.surfL}}>{o.label}</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        Type de rencontre
                      </div>
                      <select value={ctx.meetingType}
                        onChange={e=>setCtx(p=>({...p,meetingType:e.target.value}))}
                        style={{...css.select}}>
                        {PREP_MEETING_TYPES.map(o =>
                          <option key={o.value} value={o.value}
                            style={{background:C.surfL}}>{o.label}</option>
                        )}
                      </select>
                    </div>
                    <div style={{marginTop:12}}>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        Province
                      </div>
                      <ProvinceSelect
                        value={ctx.province||data.profile?.defaultProvince||"QC"}
                        onChange={e=>setCtx(p=>({...p,province:e.target.value}))}
                        style={{width:"100%"}}/>
                    </div>
                  </div>
                </div>

                <div style={{...css.card}}>
                  <Mono color={C.em} size={9}>INTENTION STRATÉGIQUE</Mono>
                  <div style={{marginTop:10}}>
                    {[["Objectif principal","purpose",
                        "ex. Faire le point sur la rétention suite aux changements…",4],
                      ["Contexte / notes de fond","background",
                        "ex. Dernier 1:1 il y a 3 semaines — conflit inter-équipes…",5]
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
                <Mono color={C.amber} size={9}>SIGNAUX CONNUS AVANT LA RENCONTRE</Mono>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:10}}>
                  {[["Dossiers actifs","activeCases","ex. PIP en cours, plainte déposée…",3],
                    ["Données récentes","recentData","ex. 2 départs Q4, taux abs en hausse…",3],
                    ["Tensions / alertes","alerts","ex. Tensions avec l équipe de Morgan…",3]
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
                    🕐 <strong>{histCount} meeting(s)</strong> trouvé(s) pour{" "}
                    <strong>{ctx.managerName}</strong>
                  </span>
                  <button onClick={()=>setPTab("history")}
                    style={{...css.btn(C.purple,true),padding:"5px 12px",fontSize:11}}>
                    Voir l'historique →
                  </button>
                </div>
              )}
              {ctx.managerName && histCount === 0 && (
                <div style={{marginTop:12,padding:"10px 14px",
                              background:C.emD+"20",border:`1px solid ${C.emD}`,
                              borderRadius:8}}>
                  <span style={{fontSize:11,color:C.em}}>
                    🆕 Premier 1:1 avec <strong>{ctx.managerName}</strong> —
                    les questions seront génériques. À chaque cycle, l'historique s'enrichit.
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
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:8}}>Aucun historique</div>
                  <div style={{fontSize:12,color:C.textD,maxWidth:360,margin:"0 auto",marginBottom:16}}>
                    {ctx.managerName
                      ? `Aucun transcript analysé pour "${ctx.managerName}". Chaque meeting analysé dans Meetings Hub alimentera automatiquement cet historique.`
                      : "Remplis le nom du gestionnaire dans Contexte pour voir son historique."}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4}}>Historique — {ctx.managerName}</div>
                    <div style={{fontSize:12,color:C.textD}}>{histCount} transcript(s) analysé(s) · Les 3 plus récents alimentent la génération.</div>
                  </div>

                  {lastAnalysis && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.em}`,marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                        <Mono color={C.em} size={9}>DERNIER MEETING — {lastMeeting.savedAt}</Mono>
                        <RiskBadge level={lastAnalysis.overallRisk||"Faible"}/>
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>{lastAnalysis.meetingTitle}</div>

                      {(lastAnalysis.risks||[]).length > 0 && (
                        <div style={{marginBottom:12}}>
                          <Mono color={C.red} size={8}>RISQUES IDENTIFIÉS</Mono>
                          {lastAnalysis.risks.slice(0,3).map((r,i) => (
                            <div key={i} style={{display:"flex",gap:8,marginTop:7,padding:"7px 10px",background:C.red+"10",borderRadius:7}}>
                              <span style={{color:C.red,fontFamily:"'DM Mono',monospace",fontSize:10,flexShrink:0,marginTop:2}}>{String(i+1).padStart(2,"0")}</span>
                              <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{r.risk||r.risque||r}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {(lastAnalysis.actions||[]).length > 0 && (
                        <div style={{marginBottom:12}}>
                          <Mono color={C.amber} size={8}>ACTIONS — À VÉRIFIER</Mono>
                          {lastAnalysis.actions.slice(0,4).map((a,i) => (
                            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginTop:6,padding:"7px 10px",background:C.amber+"10",borderRadius:7}}>
                              <span style={{fontSize:12,color:C.textM,flex:1}}>{a.action||a}</span>
                              {(a.delay||a.delai) && <Badge label={a.delay||a.delai} color={C.amber} size={9}/>}
                              {a.owner && <Badge label={a.owner} color={C.blue} size={9}/>}
                            </div>
                          ))}
                        </div>
                      )}

                      {(lastAnalysis.questions||[]).length > 0 && (
                        <div>
                          <Mono color={C.blue} size={8}>QUESTIONS DU DERNIER MEETING</Mono>
                          {lastAnalysis.questions.slice(0,3).map((q,i) => (
                            <div key={i} style={{display:"flex",gap:8,marginTop:6}}>
                              <span style={{color:C.blue,fontFamily:"'DM Mono',monospace",fontSize:10,flexShrink:0,marginTop:2}}>Q{i+1}</span>
                              <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{q.question||q}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <Mono color={C.textD} size={9}>TOUS LES MEETINGS ({histCount})</Mono>
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
                            <span style={{fontSize:13,color:C.text,flex:1,textAlign:"left",fontWeight:500}}>{a.meetingTitle||"Meeting"}</span>
                            <RiskBadge level={a.overallRisk||"Faible"}/>
                            <Mono color={C.textD} size={8}>{m.savedAt}</Mono>
                            <span style={{color:C.textD,fontSize:12,marginLeft:4}}>{open?"▲":"▼"}</span>
                          </button>
                          {open && (
                            <div style={{padding:"0 13px 12px",borderTop:`1px solid ${C.border}`}}>
                              {(a.summary||[]).map((s,j) => (
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
                      🎯 Générer les questions avec cet historique →
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
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>Questions non générées</div>
                  <div style={{fontSize:12,color:C.textD,marginBottom:16,maxWidth:420,margin:"0 auto 16px"}}>
                    {histCount > 0
                      ? `L'IA va s'appuyer sur les ${histCount} meeting(s) avec ${ctx.managerName||"ce gestionnaire"} pour personnaliser les questions.`
                      : "Remplis le contexte puis génère des questions stratégiques."}
                  </div>
                  <button onClick={generatePrep} disabled={!ctx.managerName}
                    style={{...css.btn(!ctx.managerName?C.textD:C.em),opacity:!ctx.managerName?.5:1}}>
                    {histCount > 0 ? `✦ Générer avec l'historique (${histCount} meetings)` : "✦ Générer les questions"}
                  </button>
                </div>
              )}

              {prepLoading && <AILoader label="Génération des questions…"/>}

              {prep && (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {prep.overallPriority && <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                    <Mono color={C.textD} size={9}>PRIORITÉ GLOBALE</Mono>
                    <Badge label={normPrio(prep.overallPriority)} color={{"Faible":C.em,"Modéré":C.amber,"Élevé":C.red}[normPrio(prep.overallPriority)]||C.textM}/>
                  </div>}

                  {prep.objective && <div style={{...css.card,borderLeft:`3px solid ${C.em}`}}>
                    <Mono color={C.em} size={9}>🎯 OBJECTIF DU 1:1</Mono>
                    <div style={{marginTop:10}}>
                      <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:3}}>But</div>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.65,marginBottom:10}}>{prep.objective.purpose}</div>
                      <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:3}}>Résultat attendu</div>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.65}}>{prep.objective.expectedOutcome}</div>
                    </div>
                  </div>}

                  {/* ── Checklist + Déroulement (from PREP_META) ── */}
                  {(() => {
                    const pm = PREP_META[engineType] || null;
                    if (!pm) return null;
                    return <>
                      {pm.checklist?.length > 0 && <div style={{...css.card,borderLeft:`3px solid ${C.teal}`}}>
                        <Mono color={C.teal} size={9}>✓ CHECKLIST DE PRÉPARATION</Mono>
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
                        <Mono color={C.blue} size={9}>🗺 DÉROULEMENT SUGGÉRÉ</Mono>
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
                    <Mono color={C.red} size={9}>⚠ ENJEUX PRIORITAIRES</Mono>
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
                    <Mono color={C.blue} size={9}>📋 CONTEXTE</Mono>
                    <div style={{marginTop:10}}>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.65}}>{prep.context.summary}</div>
                      {prep.context.relevantHistory && prep.context.relevantHistory!=="Non disponible" && <div style={{marginTop:10,padding:"7px 10px",background:C.blue+"0D",borderRadius:7,fontSize:12,color:C.textM,lineHeight:1.55}}><span style={{color:C.blue,fontWeight:600}}>Historique → </span>{prep.context.relevantHistory}</div>}
                      {prep.context.keySignals?.length > 0 && <div style={{marginTop:10}}>
                        <Mono color={C.blue} size={8}>Signaux à garder en tête</Mono>
                        {prep.context.keySignals.map((sig,i) => <div key={i} style={{display:"flex",gap:8,marginTop:6}}><div style={{width:4,height:4,borderRadius:"50%",background:C.blue,marginTop:7,flexShrink:0}}/><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{sig}</span></div>)}
                      </div>}
                    </div>
                  </div>}

                  {prep.followUpFromLast1on1 && (prep.followUpFromLast1on1.evolutions?.length>0||prep.followUpFromLast1on1.stagnations?.length>0||prep.followUpFromLast1on1.newRisks?.length>0) && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.purple}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                        <Mono color={C.purple} size={9}>🔁 SUIVI DEPUIS LE DERNIER 1:1</Mono>
                        <Badge label="Basé sur l'historique" color={C.purple}/>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {prep.followUpFromLast1on1.evolutions?.length > 0 && <div>
                          <Mono color={C.em} size={8}>Évolutions</Mono>
                          {prep.followUpFromLast1on1.evolutions.map((e,i) => <div key={i} style={{display:"flex",gap:8,marginTop:5}}><div style={{width:4,height:4,borderRadius:"50%",background:C.em,marginTop:7,flexShrink:0}}/><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{e}</span></div>)}
                        </div>}
                        {prep.followUpFromLast1on1.stagnations?.length > 0 && <div>
                          <Mono color={C.amber} size={8}>Stagnations</Mono>
                          {prep.followUpFromLast1on1.stagnations.map((s,i) => <div key={i} style={{display:"flex",gap:8,marginTop:5}}><div style={{width:4,height:4,borderRadius:"50%",background:C.amber,marginTop:7,flexShrink:0}}/><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{s}</span></div>)}
                        </div>}
                        {prep.followUpFromLast1on1.newRisks?.length > 0 && <div>
                          <Mono color={C.red} size={8}>Nouveaux risques</Mono>
                          {prep.followUpFromLast1on1.newRisks.map((r,i) => <div key={i} style={{display:"flex",gap:8,marginTop:5}}><div style={{width:4,height:4,borderRadius:"50%",background:C.red,marginTop:7,flexShrink:0}}/><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{r}</span></div>)}
                        </div>}
                      </div>
                    </div>
                  )}

                  {prep.recommendedApproach && <div style={{...css.card,borderLeft:`3px solid ${C.amber}`}}>
                    <Mono color={C.amber} size={9}>🧭 APPROCHE RECOMMANDÉE</Mono>
                    <div style={{marginTop:10}}>
                      <div style={{marginBottom:10}}><div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:3}}>Comment aborder</div><div style={{fontSize:13,color:C.text,lineHeight:1.65}}>{prep.recommendedApproach.how}</div></div>
                      <div style={{marginBottom:prep.recommendedApproach.pitfalls?.length>0?10:0}}><div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:3}}>Ton à adopter</div><div style={{fontSize:13,color:C.text,lineHeight:1.65}}>{prep.recommendedApproach.tone}</div></div>
                      {prep.recommendedApproach.pitfalls?.length > 0 && <div>
                        <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:6}}>Pièges à éviter</div>
                        {prep.recommendedApproach.pitfalls.map((p,i) => <div key={i} style={{display:"flex",gap:8,marginBottom:5}}><span style={{color:C.amber,fontSize:11,flexShrink:0,marginTop:2}}>⚠</span><span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{p}</span></div>)}
                      </div>}
                    </div>
                  </div>}

                  {prep.suggestedPhrasing?.length > 0 && <div style={{...css.card,borderLeft:`3px solid ${C.teal}`}}>
                    <Mono color={C.teal} size={9}>💬 PHRASES SUGGÉRÉES</Mono>
                    <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                      {prep.suggestedPhrasing.map((ph,i) => {
                        const pc = {"Ouverture":C.em,"Recadrage":C.amber,"Confrontation":C.amber,"Suivi":C.blue}[ph.type]||C.teal;
                        return <div key={i} style={{borderRadius:8,border:`1px solid ${pc}28`,overflow:"hidden"}}>
                          <div style={{background:pc+"18",borderLeft:`3px solid ${pc}`,padding:"6px 12px",display:"flex",alignItems:"center",gap:8}}><Badge label={ph.type||"Script"} color={pc} size={10}/></div>
                          <div style={{padding:"10px 13px",background:C.surfL,borderLeft:`3px solid ${pc}`}}><div style={{fontSize:13,color:C.text,lineHeight:1.7,fontStyle:"italic"}}>"{ph.text||ph}"</div></div>
                        </div>;
                      })}
                    </div>
                  </div>}

                  {prep.recommendedActions?.length > 0 && <div style={{...css.card,borderLeft:`3px solid ${C.em}`}}>
                    <Mono color={C.em} size={9}>✅ ACTIONS RECOMMANDÉES</Mono>
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
                    ✅ Plan d'intervention prêt. Fais ton meeting, puis reviens dans l'onglet Analyse meeting.
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
                        <span style={{fontSize:13,fontWeight:600,color:C.text}}>{cat.label}</span>
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
                <Mono color={C.em} size={9}>GRILLE D'OBSERVATION — PENDANT LA RENCONTRE</Mono>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:12}}>
                  {[
                    {label:"Énergie générale",  values:["Haute","Normale","Basse","Épuisée"]},
                    {label:"Ouverture",          values:["Très ouverte","Normale","Réservée","Défensive"]},
                    {label:"Clarté / équipe",    values:["Excellente","Bonne","Partielle","Floue"]},
                    {label:"Alerte globale",     values:["Aucune","Légère","Modérée","Élevée"]},
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
                    <div style={{fontSize:14,fontWeight:700,color:C.text}}>{cat.label}</div>
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
                  <Mono color={C.blue} size={9}>TRANSCRIPT / NOTES DU MEETING</Mono>
                </div>
                <textarea
                  value={meetingAnalysis.transcript}
                  onChange={e=>setMeetingAnalysis(p=>({...p,transcript:e.target.value}))}
                  placeholder="Colle ici le transcript ou les notes du meeting avec ce gestionnaire..."
                  rows={8} style={{...css.textarea,fontSize:12}}
                  onFocus={e=>e.target.style.borderColor=C.blue}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
              </div>
              <div style={{...css.card,borderLeft:`3px solid ${C.amber}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:13}}>⭐</span>
                  <Mono color={C.amber} size={9}>POINTS CLÉS OBSERVÉS (optionnel)</Mono>
                </div>
                <textarea
                  value={meetingAnalysis.keyPoints}
                  onChange={e=>setMeetingAnalysis(p=>({...p,keyPoints:e.target.value}))}
                  placeholder="Points saillants, tensions, signaux observés pendant la rencontre..."
                  rows={4} style={{...css.textarea,fontSize:12}}
                  onFocus={e=>e.target.style.borderColor=C.amber}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
              </div>
              <div style={{padding:"10px 14px",background:C.blue+"10",border:`1px solid ${C.blue}33`,borderRadius:8}}>
                <span style={{fontSize:11,color:C.blue}}>
                  💡 Ces données seront injectées dans le prompt IA lors de la génération de l'Output.
                </span>
              </div>
            </div>
          )}

          {/* ════════════════ NOTES ════════════════ */}
          {pTab==="notes" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {NOTE_CATS.map(cat => (
                  <div key={cat.key} style={{...css.card,borderLeft:`3px solid ${cat.color}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <span style={{fontSize:13}}>{cat.icon}</span>
                      <Mono color={cat.color} size={9}>{cat.label}</Mono>
                    </div>
                    <textarea value={notes[cat.key]||""}
                      onChange={e=>setNotes(p=>({...p,[cat.key]:e.target.value}))}
                      placeholder={`Notes sur ${cat.label.toLowerCase()}…`}
                      rows={4} style={{...css.textarea,fontSize:12}}
                      onFocus={e=>e.target.style.borderColor=cat.color}
                      onBlur={e=>e.target.style.borderColor=C.border}/>
                  </div>
                ))}
              </div>
              <div style={{marginTop:12,padding:"10px 14px",background:C.teal+"10",border:`1px solid ${C.teal}33`,borderRadius:8}}>
                <span style={{fontSize:11,color:C.teal}}>
                  💾 Ces notes alimentent directement l'output. Sois précis — l'IA s'appuie sur ce contenu.
                </span>
              </div>
            </div>
          )}

          {/* ════════════════ OUTPUT ════════════════ */}
          {pTab==="output" && (
            <div>
              {outputLoading && <AILoader label="Génération de l'analyse complète…"/>}

              {!output && !outputLoading && (
                <div style={{background:C.surfL,border:`2px dashed ${C.border}`,borderRadius:12,padding:"48px 24px",textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:12}}>📊</div>
                  <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>Aucun output généré</div>
                  <div style={{fontSize:12,color:C.textD,maxWidth:400,margin:"0 auto 16px"}}>
                    Complète les notes et/ou le transcript, puis génère l'analyse enrichie.
                  </div>
                  <button onClick={generateOutput} style={{...css.btn(C.em)}}>
                    ✦ Générer l'output
                  </button>
                </div>
              )}

              {output && (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>

                  {/* ── Section 1: Résumé exécutif ── */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12}}>
                    <div style={{...css.card,borderLeft:`3px solid ${RISK_C[output.overallRisk]||C.em}`}}>
                      {output.meetingTitle && <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4}}>{output.meetingTitle}</div>}
                      {output.director && <div style={{fontSize:11,color:C.textD,marginBottom:8}}>Gestionnaire : {output.director}</div>}
                      <Mono color={C.em} size={9}>RÉSUMÉ</Mono>
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
                          <span style={{fontSize:11,color:C.purple,fontWeight:600}}>Message clé HRBP → </span>
                          <span style={{fontSize:12,color:C.text,lineHeight:1.6}}>{output.hrbpKeyMessage}</span>
                        </div>
                      )}
                    </div>
                    <div style={{background:(RISK_C[output.overallRisk]||C.em)+"18",border:`2px solid ${RISK_C[output.overallRisk]||C.em}`,borderRadius:10,padding:"16px 20px",textAlign:"center",minWidth:110,flexShrink:0}}>
                      <Mono color={RISK_C[output.overallRisk]||C.em} size={9}>RISQUE</Mono>
                      <div style={{fontSize:18,fontWeight:800,color:RISK_C[output.overallRisk]||C.em,marginTop:8}}>{output.overallRisk}</div>
                      {output.overallRiskRationale && <div style={{fontSize:10,color:C.textM,marginTop:6,lineHeight:1.4}}>{output.overallRiskRationale}</div>}
                    </div>
                  </div>

                  {/* ── Section 2: Signaux & Risques enrichis ── */}
                  {(output.signals||[]).length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.amber}`}}>
                      <Mono color={C.amber} size={9}>📡 SIGNAUX DÉTAILLÉS</Mono>
                      <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:10}}>
                        {output.signals.map((s,i) => (
                          <div key={i} style={{padding:"10px 12px",background:C.amber+"08",borderRadius:8,border:`1px solid ${C.amber}20`}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                              <span style={{fontSize:13,fontWeight:600,color:C.text}}>{s.signal}</span>
                              {s.ampleur && <Badge label={s.ampleur} color={AMPLEUR_C[s.ampleur]||C.blue} size={9}/>}
                              {s.categorie && <Badge label={s.categorie} color={C.textD} size={9}/>}
                            </div>
                            {s.interpretation && <div style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{s.interpretation}</div>}
                            {s.consequence && <div style={{fontSize:11,color:C.red,fontStyle:"italic",marginTop:4}}>Si non adressé : {s.consequence}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(output.risks||[]).length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.red}`}}>
                      <Mono color={C.red} size={9}>⚠ RISQUES DÉTAILLÉS</Mono>
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
                        {key:"performance",label:"Performance",icon:"📈",color:C.blue},
                        {key:"leadership", label:"Leadership", icon:"🧭",color:C.purple},
                        {key:"engagement", label:"Engagement", icon:"🌡", color:C.amber},
                      ].map(({key,label,icon,color}) => (
                        <div key={key} style={{...css.card,borderLeft:`3px solid ${color}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                            <span style={{fontSize:13}}>{icon}</span>
                            <Mono color={color} size={9}>{label}</Mono>
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
                  {engineType === "disciplinaire" && output.cadreJuridique && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.red}`,background:C.red+"06"}}>
                      <Mono color={C.red} size={9}>⚖ CADRE JURIDIQUE</Mono>
                      <div style={{marginTop:10}}>
                        {output.cadreJuridique.politiquesVisees?.length > 0 && <div style={{marginBottom:8}}>
                          <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:4}}>Politiques visées</div>
                          {output.cadreJuridique.politiquesVisees.map((p,i) => <div key={i} style={{display:"flex",gap:8,marginBottom:4}}><span style={{color:C.red,fontSize:10}}>•</span><span style={{fontSize:12,color:C.textM}}>{p}</span></div>)}
                        </div>}
                        {output.cadreJuridique.loisApplicables?.length > 0 && <div style={{marginBottom:8}}>
                          <div style={{fontSize:11,color:C.textD,fontWeight:600,marginBottom:4}}>Lois applicables</div>
                          {output.cadreJuridique.loisApplicables.map((l,i) => <div key={i} style={{display:"flex",gap:8,marginBottom:4}}><span style={{color:C.purple,fontSize:10}}>•</span><span style={{fontSize:12,color:C.textM}}>{l}</span></div>)}
                        </div>}
                        {output.cadreJuridique.progressivite && <div style={{padding:"6px 10px",background:C.amber+"10",borderRadius:6,fontSize:11,color:C.amber}}>Progressivité : {output.cadreJuridique.progressivite}{output.cadreJuridique.progressiviteNote ? ` — ${output.cadreJuridique.progressiviteNote}` : ""}</div>}
                      </div>
                    </div>
                  )}
                  {engineType === "disciplinaire" && output.sanctions?.length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.red}`}}>
                      <Mono color={C.red} size={9}>🔴 SANCTIONS</Mono>
                      <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                        {output.sanctions.map((s,i) => (
                          <div key={i} style={{padding:"8px 12px",background:C.red+"08",borderRadius:7}}>
                            <div style={{fontSize:13,fontWeight:600,color:C.red}}>{s.type}</div>
                            {s.duree && <div style={{fontSize:11,color:C.textM,marginTop:3}}>Durée : {s.duree}</div>}
                            {s.conditions?.length > 0 && <div style={{marginTop:6}}>{s.conditions.map((c,j) => <div key={j} style={{fontSize:11,color:C.textM}}>→ {c}</div>)}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {engineType === "disciplinaire" && output.risquesLegaux?.length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.amber}`}}>
                      <Mono color={C.amber} size={9}>🚨 RISQUES LÉGAUX</Mono>
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

                  {/* ── Variante: TA ── */}
                  {engineType === "ta" && output.postes?.length > 0 && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.teal}`}}>
                      <Mono color={C.teal} size={9}>🎯 PIPELINE — POSTES</Mono>
                      {output.pipeline && (
                        <div style={{display:"flex",gap:10,marginTop:8,marginBottom:12,flexWrap:"wrap"}}>
                          {[{l:"Actifs",v:output.pipeline.postesActifs,c:C.blue},{l:"En offre",v:output.pipeline.enOffre,c:C.amber},{l:"Fermés",v:output.pipeline.fermes,c:C.teal}].map((m,i) => (
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
                      <Mono color={C.em} size={9}>🚀 SUIVI DES INITIATIVES</Mono>
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
                    <Mono color={C.em} size={9}>PLAN D'ACTION</Mono>
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
                          <div style={{fontSize:13,fontWeight:700,color:C.purple}}>Stratégie HRBP</div>
                          <div style={{fontSize:10,color:C.textD,fontFamily:"'DM Mono',monospace",letterSpacing:0.5}}>ANALYSE STRATÉGIQUE</div>
                        </div>
                      </div>

                      <div style={{padding:"16px 18px",display:"flex",flexDirection:"column",gap:14}}>
                        {s.lectureGestionnaire && (
                          <div>
                            <Mono color={C.purple} size={9}>LECTURE DU GESTIONNAIRE</Mono>
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
                                <span style={{color:C.purple,fontWeight:600}}>Angle → </span>{s.lectureGestionnaire.angle}
                              </div>
                            )}
                          </div>
                        )}

                        {s.santeEquipe && (
                          <div>
                            <Mono color={C.purple} size={9}>SANTÉ DE L'ÉQUIPE</Mono>
                            <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                              <div style={{display:"flex",gap:6,alignItems:"center",padding:"5px 11px",borderRadius:7,background:perfColor+"15",border:`1px solid ${perfColor}35`}}>
                                <span style={{fontSize:10,color:C.textD,fontFamily:"'DM Mono',monospace"}}>PERF</span>
                                <span style={{fontSize:12,fontWeight:700,color:perfColor}}>{s.santeEquipe.performance}</span>
                              </div>
                              <div style={{display:"flex",gap:6,alignItems:"center",padding:"5px 11px",borderRadius:7,background:engColor+"15",border:`1px solid ${engColor}35`}}>
                                <span style={{fontSize:10,color:C.textD,fontFamily:"'DM Mono',monospace"}}>ENG</span>
                                <span style={{fontSize:12,fontWeight:700,color:engColor}}>{s.santeEquipe.engagement}</span>
                              </div>
                            </div>
                            {s.santeEquipe.dynamique && <div style={{marginTop:8,fontSize:12,color:C.textM,lineHeight:1.6}}>{s.santeEquipe.dynamique}</div>}
                          </div>
                        )}

                        {s.risqueCle && (
                          <div style={{padding:"10px 12px",background:riskColor+"10",border:`1px solid ${riskColor}30`,borderRadius:8}}>
                            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                              <Mono color={riskColor} size={9}>RISQUE CLÉ</Mono>
                              <div style={{background:riskColor+"20",border:`1px solid ${riskColor}50`,borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:700,color:riskColor}}>{s.risqueCle.niveau}</div>
                              <div style={{fontSize:12,fontWeight:600,color:riskColor}}>{s.risqueCle.nature}</div>
                            </div>
                            {s.risqueCle.rationale && <div style={{fontSize:12,color:C.textM}}>{s.risqueCle.rationale}</div>}
                          </div>
                        )}

                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                          {s.postureHRBP && (
                            <div>
                              <Mono color={C.purple} size={9}>POSTURE HRBP</Mono>
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
                              <Mono color={C.purple} size={9}>OBJECTIF MEETING</Mono>
                              <div style={{marginTop:8,padding:"8px 12px",background:C.em+"10",border:`1px solid ${C.em}30`,borderRadius:8,fontSize:12,color:C.text,lineHeight:1.65}}>{s.objectifRencontre}</div>
                            </div>
                          )}
                        </div>

                        {s.strategieInfluence && (
                          <div>
                            <Mono color={C.purple} size={9}>STRATÉGIE D'INFLUENCE</Mono>
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
                      {title:"📡 Signaux clés",    key:"keySignals",          color:C.amber},
                      {title:"⚠ Risques",           key:"mainRisks",           color:C.red},
                      {title:"🔁 Suivis HRBP",      key:"hrbpFollowups",       color:C.em},
                      {title:"❓ Prochain meeting", key:"nextMeetingQuestions", color:C.blue},
                    ].map(({title,key,color}) => (
                      <div key={key} style={{...css.card,borderLeft:`3px solid ${color}`}}>
                        <Mono color={color} size={9}>{title}</Mono>
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
                      <Mono color={C.teal} size={9}>👥 QUESTIONS CROISÉES</Mono>
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
                      <Mono color={C.blue} size={9}>📂 CAS RH SUGGÉRÉ</Mono>
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

                  {/* ── CYCLE CLOSER ── */}
                  <div style={{padding:"16px 18px",background:C.purple+"18",border:`2px solid ${C.purple}40`,borderRadius:11}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.purple,marginBottom:5}}>
                          🔄 Préparer le prochain 1:1 avec cet output
                        </div>
                        <div style={{fontSize:12,color:C.textD,marginBottom:10}}>
                          {output.nextMeetingContext || "Les risques, signaux et questions seront injectés dans le prochain cycle."}
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
                        🔄 Nouveau cycle →
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
  );
}
