// ── Module: Auto Prompt Engine ────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.8553–9381
// Extraction fidèle — aucune modification de logique

import { useState } from "react";
import { C, css } from '../theme.js';
import { fmtDate, normKey } from '../utils/format.js';
import Mono from '../components/Mono.jsx';

// ── Internal prompt templates ────────────────────────────────────────────────
const APE_TEMPLATES = {
  weekly_intervention: {
    title: "Plan d'intervention hebdomadaire",
    modes: ["act"],
    diagnose: null,
    act: (ctx) => `Tu es un HRBP senior, IT, Québec. Contexte cette semaine:

THÈME: ${ctx.theme || "Non défini"}
RISQUES: ${ctx.risks}
PATTERNS: ${ctx.patterns}
MANAGERS À RISQUE: ${ctx.managers}

Génère un plan d'intervention HRBP pour les 5 prochains jours:
— 3 actions nommées avec owner + deadline non négociable
— 1 message direct à adresser au leadership (objet et angle précis)
— 1 correction structurelle (pas du coaching — une décision)

Contraintes: workload de 36 gestionnaires. Aucune action sans deadline. Aucune généralité.`,
    say: (ctx) => `Voici ma situation cette semaine: ${ctx.theme || ctx.risks}

Écris le message exact que j'envoie à mon directeur — objet, corps, 5 lignes max.
Ton: direct, pas de jargon RH. Le directeur doit comprendre l'enjeu et l'action attendue sans contexte préalable.`,
  },

  exec_briefing: {
    title: "Briefing exécutif 30 secondes",
    modes: ["say", "act"],
    diagnose: null,
    act: (ctx) => `SITUATION: ${ctx.risks}
DURÉE: ${ctx.duration || "En cours"}
INTERVENTIONS TENTÉES: ${ctx.interventions || "Aucune"}

Construis une escalade en 2 niveaux:
1. Message verbal au directeur immédiat (2 minutes — faits, risque, ce que je demande)
2. Note écrite si documentation formelle requise

Pour chaque niveau: objectif exact, ce qu'on demande, comment on sait que ça a fonctionné.`,
    say: (ctx) => `Données HRBP cette semaine:
${ctx.risks}
${ctx.patterns ? "Patterns: " + ctx.patterns : ""}

Briefing exécutif en 3 points:
— 1 enjeu principal (population concernée + impact business chiffré ou concret)
— 1 risque si rien n'est fait dans 30 jours (pas vague)
— 1 recommandation avec 1 owner et 1 délai

Zéro jargon RH. 30 secondes à l'oral.`,
  },

  manager_challenge: {
    title: "Challenge gestionnaire",
    modes: ["diagnose", "act", "say"],
    diagnose: (ctx) => `Gestionnaire: ${ctx.managerName || "N/A"} — ${ctx.managerType || "profil non défini"}
Ce que j'observe: ${ctx.signals}
Historique: ${ctx.history || "Aucun"}${ctx.leaderContext ? `\nContexte croisé (Portfolio · Meetings · Exits): ${ctx.leaderContext}` : ""}

Diagnostic HRBP:
— Quel est le vrai problème (compétence / volonté / contexte)?
— Quel pattern est en train de s'installer?
— Quelle est la probabilité que ça change sans intervention directe?
— Ce que je sous-estime probablement dans cette situation.`,
    act: (ctx) => `Situation: ${ctx.signals}
Gestionnaire: ${ctx.managerName || "N/A"} — ${ctx.managerType || ""}

— 2 choses à challenger directement cette semaine (pas suggérer — challenger)
— 1 chose à ignorer pour ne pas diluer le message
— La résistance la plus probable et comment la tenir sans reculer
— Deadline pour voir un changement observable`,
    say: (ctx) => `Gestionnaire: ${ctx.managerName || "N/A"}
Situation: ${ctx.signals}

Donne-moi:
— 1 ligne d'ouverture directe en français (pas diplomatique)
— 3 questions qui créent une ouverture sans offrir d'issue de secours
— 1 ligne de push si résistance
— 1 phrase de closing avec une deadline explicite

Le ton: HRBP senior qui n'a pas besoin d'être apprécié.`,
  },

  pattern_detection: {
    title: "Détection de patterns",
    modes: ["diagnose"],
    diagnose: (ctx) => `Données des 2-3 dernières semaines:

MEETINGS: ${ctx.meetings}
SIGNAUX: ${ctx.signals}
CAS ACTIFS: ${ctx.cases}
PATTERNS RADAR: ${ctx.patterns}

Analyse:
— Quel pattern j'amplifie en ne faisant rien?
— Connexion non évidente entre ces données
— Ce que les données ne me montrent pas encore mais vont me montrer dans 30 jours
— Sur quoi j'agis cette semaine vs ce que j'attends — et pourquoi

Sois direct. Si tu vois quelque chose que je ne vois pas — dis-le.`,
    act: null,
    say: null,
  },

  flight_risk: {
    title: "Flight risk — rétention profil clé",
    modes: ["diagnose", "act", "say"],
    diagnose: (ctx) => `Profil: ${ctx.managerName || "employé à risque"} — ${ctx.team || "équipe N/A"}
Signaux observés: ${ctx.signals}
Gestionnaire: ${ctx.managerType || "N/A"}
Dernier feedback connu: ${ctx.history || "aucun"}${ctx.leaderContext ? `\nContexte gestionnaire (croisé): ${ctx.leaderContext}` : ""}

Diagnostic:
— Levier de départ le plus probable (gestionnaire / croissance / rémunération / sens)
— Probabilité de départ dans les 60 jours sur 10
— Ce que le gestionnaire ne voit pas ou minimise
— Si la rétention n'est pas possible — comment gérer le départ sans perdre la connaissance`,
    act: (ctx) => `Profil à risque: ${ctx.managerName || "N/A"} — ${ctx.signals}

Plan de rétention:
— Action concrète sous 7 jours (pas une promesse — une décision)
— Ce que le gestionnaire doit faire vs ce que l'HRBP doit faire
— 2 erreurs classiques à éviter dans ce cas précis
— Critère de succès à 30 jours: comment je sais si ça a marché?`,
    say: (ctx) => `Employé à risque de départ. Contexte: ${ctx.signals}

Prépare la conversation de rétention:
— 1 ouverture directe qui pose la vraie question (sans détour)
— 3 questions qui révèlent la vraie raison sans mettre l'employé sur la défensive
— Si la réponse est froide ou fermée: 1 ligne de relance directe
— Ce que je NE DIS PAS dans cette conversation`,
  },

  performance_escalation: {
    title: "Escalade performance / PIP",
    modes: ["diagnose", "act", "say"],
    diagnose: (ctx) => `Situation: ${ctx.signals}
Durée de la sous-performance: ${ctx.duration || "N/A"}
Feedbacks déjà livrés: ${ctx.history || "aucun documenté"}
Position du gestionnaire: ${ctx.managerType || "N/A"}

Diagnostic:
— Est-ce que le PIP est le bon outil ici ou y a-t-il un problème de fond différent?
— Quel est le risque légal si on agit / si on n'agit pas (contexte Québec)?
— Ce que le gestionnaire va faire de mal pendant le suivi
— Critère de succès vs critère d'échec du plan`,
    act: (ctx) => `Sous-performance: ${ctx.signals}

Plan d'action:
— 3 objectifs mesurables qui résistent à une contestation légale au Québec
— Structure de suivi hebdomadaire (qui fait quoi, comment on documente)
— Réponse prête pour "c'est injuste, je suis ciblé"
— Scénario si échec à 30 jours: étapes exactes`,
    say: (ctx) => `Conversation de remise du plan de performance. Contexte: ${ctx.signals}

Prépare:
— Ouverture directe en français (pas diplomatique — efficace)
— Message clé en 30 secondes: les faits, l'attente, la conséquence
— Réponse si "je ne suis pas d'accord"
— Phrase de fermeture avec date de suivi explicite`,
  },

  conflict_intervention: {
    title: "Intervention conflit",
    modes: ["diagnose", "act", "say"],
    diagnose: (ctx) => `Conflit: ${ctx.signals}
Parties impliquées: ${ctx.managers || "N/A"}
Durée: ${ctx.duration || "N/A"}
Ce que le gestionnaire a fait: ${ctx.history || "rien"}

Diagnostic:
— Malentendu (médiation) ou comportement (enquête)? Critère de décision
— Qui est moteur du conflit vs qui réagit?
— Ce que le gestionnaire n'a pas fait et qui a laissé ça escalader
— Risque si on ne fait rien dans les 7 prochains jours`,
    act: (ctx) => `Conflit actif: ${ctx.signals}

Plan d'intervention:
— Ordre des conversations (qui en premier, pourquoi)
— 2 pièges à éviter dans cette configuration
— Comment tenir la neutralité si une partie essaie de me rallier
— Délai maximum avant que ce soit irréparable`,
    say: (ctx) => `Conflit entre: ${ctx.managers || "deux employés"}. Contexte: ${ctx.signals}

Pour chaque entretien individuel:
— Ouverture qui demande des faits, pas des opinions
— 3 questions qui révèlent sans prendre parti
— Si une partie attaque l'autre: 1 phrase de recadrage immédiat
— Closing: ce qui va se passer ensuite, sans promettre ce que je ne contrôle pas`,
  },

  leadership_alignment: {
    title: "Alignement leadership",
    modes: ["diagnose", "act", "say"],
    diagnose: (ctx) => `Directeur / Leader: ${ctx.managerName || "N/A"}
Signaux de désalignement: ${ctx.signals}
Ce que le terrain remonte: ${ctx.cases}
Image présentée par le leader: ${ctx.history || "version optimiste"}

Diagnostic:
— Quelle est la nature du désalignement (information filtrée / déni / surcharge)?
— Quel est le coût organisationnel actuel de ce désalignement?
— Ce que ce leader n'entend pas parce que personne ne le lui dit en face
— Est-ce que c'est corrigeable ou est-ce structurel?`,
    act: (ctx) => `Désalignement leadership: ${ctx.signals}

Plan:
— Comment présenter les données sans déclencher une réaction défensive
— Ce que je dois dire vs ce que je ne dis pas encore
— Qui d'autre doit être dans cette conversation?
— Délai pour voir un changement de posture observable`,
    say: (ctx) => `Leader déconnecté. Données: ${ctx.signals}

Prépare la conversation de recadrage:
— Ouverture directe: j'ai des données qui contredisent ce que tu m'as dit
— Comment nommer les faits sans nommer les sources
— La question qui va le forcer à sortir de sa narrative
— Comment clore sans réassurance mutuelle`,
  },

  structural_fix: {
    title: "Correction structurelle",
    modes: ["diagnose", "act"],
    diagnose: (ctx) => `Problème récurrent: ${ctx.signals}
Durée: ${ctx.duration || "N/A"}
Tentatives passées: ${ctx.history || "coaching, conversations"}
Résultat: ${ctx.interventions || "amélioration temporaire ou aucun effet"}

Diagnostic:
— Est-ce un problème de personnes ou de structure / rôles / gouvernance?
— Si on remplaçait les personnes: le problème disparaîtrait-il?
— Quelle décision organisationnelle réglerait ça à la source?
— Comment présenter un enjeu structurel à un directeur qui pense que c'est un problème de personnes?`,
    act: (ctx) => `Problème structurel identifié: ${ctx.signals}

Plan de correction:
— 1 recommandation organisationnelle précise (pas RH)
— Argument business pour la présenter (pas HR jargon)
— Qui doit prendre cette décision et comment je la facilite
— Délai et critère de succès mesurable`,
    say: null,
  },

  return_leave: {
    title: "Retour d'arrêt — situation fragile",
    modes: ["act", "say"],
    diagnose: null,
    act: (ctx) => `Retour d'arrêt: ${ctx.managerName || "employé"}
Contexte: ${ctx.signals}
Gestionnaire: ${ctx.managerType || "N/A"}

Plan de retour:
— Actions concrètes avant le retour (HRBP, gestionnaire, équipe)
— Ce que le gestionnaire doit changer — des actes observables, pas des intentions
— Signaux de rechute à surveiller les 2 premières semaines
— Obligations légales CNESST si applicable`,
    say: (ctx) => `Retour post-arrêt. Contexte: ${ctx.signals}

Prépare la conversation d'accueil:
— Ouverture sur le ressenti par rapport au retour (pas la santé — le retour ici)
— 2 questions qui révèlent les vraies inquiétudes sans surcharger
— Ce que je ne partage pas avec le gestionnaire (et comment je le dis)
— Phrase de closing qui donne le contrôle à l'employé`,
  },
};

// ── Situation detection engine ────────────────────────────────────────────────
function detectSituations(data) {
  const situations = [];
  // Filtre cas par statut + priorité (statuts réels: open/active/pending/resolved/closed/escalated)
  // Exclus: resolved, closed. Priorité: escalated > active/open > pending (conditionnel)
  const _allCases = data.cases || [];
  const _escalated = _allCases.filter(c => c.status === "escalated");
  const _active    = _allCases.filter(c => c.status === "active" || c.status === "open");
  const _pending   = _allCases.filter(c => {
    if (c.status !== "pending") return false;
    const updatedRecently = c.updatedAt &&
      (Date.now() - new Date(c.updatedAt).getTime()) < 14 * 24 * 60 * 60 * 1000;
    const highImportance = c.riskLevel === "Critique" || c.riskLevel === "Élevé" || c.riskLevel === "Eleve";
    return updatedRecently || highImportance;
  });
  const cases = [..._escalated, ..._active, ..._pending];
  const meetings = (data.meetings||[]).slice().reverse().slice(0,10);
  const signals  = (data.signals||[]).slice().reverse().slice(0,8);
  const radar    = (data.radars||[])[0]?.radar;
  const prevRadar= (data.radars||[])[1]?.radar;
  const portfolio= data.portfolio||[];

  const RS = {"Critique":4,"Élevé":3,"Eleve":3,"Modéré":2,"Modere":2,"Faible":1};
  const todayISO = new Date().toISOString().split("T")[0];

  // Helper: days since a date string
  const daysSince = (d) => d ? Math.floor((Date.now()-new Date(d).getTime())/86400000) : 999;

  // ── New sources ──────────────────────────────────────────────────────────────
  const exits        = (data.exits||[]).slice().reverse().slice(0,5);
  const recentBriefs = (data.briefs||[]).slice().reverse().slice(0,2);
  const plans        = (data.plans306090||[]);

  // Helper: current phase of a 30-60-90 plan from startDate
  const getPlanPhase = (startDate) => {
    if (!startDate) return null;
    const daysIn = Math.floor((Date.now()-new Date(startDate).getTime())/86400000);
    if (isNaN(daysIn)||daysIn<0) return null;
    if (daysIn<=30) return { key:"days30", label:"30 jours", daysLeft:Math.max(0,30-daysIn) };
    if (daysIn<=60) return { key:"days60", label:"60 jours", daysLeft:Math.max(0,60-daysIn) };
    if (daysIn<=90) return { key:"days90", label:"90 jours", daysLeft:Math.max(0,90-daysIn) };
    return null;
  };

  // Exit-derived signals: regrettable or negative management sentiment, within 60 days
  const recentRegrettableExits = exits.filter(e=>
    daysSince(e.savedAt)<=60 && (
      e.result?.summary?.regrettable==="Oui" ||
      ["Négatif","Critique"].includes(e.result?.management?.overallSentiment)
    )
  );
  const negMgmtExits = exits.filter(e=>["Négatif","Critique"].includes(e.result?.management?.overallSentiment));

  // Brief persistence signals: carryOver or Aggravé in the most recent brief
  const latestBrief       = recentBriefs[0]?.brief;
  const persistentRetention = latestBrief ? (latestBrief.retentionWatch||[]).filter(r=>r.carryOver||r.evolution==="Aggravé") : [];
  const carryOverRisks      = latestBrief ? (latestBrief.keyRisks||[]).filter(r=>r.carryOver||r.evolution==="Aggravé") : [];

  // 30-60-90 critical plans: high transitionRisk OR daysLeft ≤ 10 in current phase
  const criticalPlans = plans.filter(p=>{
    const phase = getPlanPhase(p.startDate);
    if (!phase) return false;
    const risk = p.output?.summary?.transitionRisk||"";
    return risk==="Critique"||risk==="Élevé"||risk==="Eleve"||phase.daysLeft<=10;
  });

  // ── Manager context map — leader-centric aggregation ────────────────────────
  // Keyed by normKey(name). Aggregates portfolio, cases, meetings, exits, plans per manager.
  // Liaison reliability: portfolio=structural · cases.director=moderate · meetings.director=moderate
  //                      exits.managerKey=structural · exits.managerName=moderate · plans.manager=text
  const mgCtx = {};
  const _touch = (key, name, field, value) => {
    if (!key) return;
    if (!mgCtx[key]) mgCtx[key] = { name:name||key, portfolio:null, cases:[], meetings:[], exits:[], plans:[] };
    if (name && mgCtx[key].name === key) mgCtx[key].name = name; // prefer display name over key
    if (field === "portfolio") mgCtx[key].portfolio = value;
    else mgCtx[key][field].push(value);
  };
  portfolio.forEach(p => { if (p.name) _touch(normKey(p.name), p.name, "portfolio", p); });
  cases.forEach(c    => { if (c.director) _touch(normKey(c.director), c.director, "cases", c); });
  meetings.forEach(m => { if (m.director) _touch(normKey(m.director), m.director, "meetings", m); });
  exits.forEach(e    => {
    const k = e.managerKey || normKey(e.managerName||""); // managerKey = structural (from Exit.jsx)
    if (k) _touch(k, e.managerName||"", "exits", e);
  });
  plans.forEach(p    => { if (p.manager) _touch(normKey(p.manager), p.manager, "plans", p); });

  // Compact readable summary for prompt context injection — max ~80 chars
  const ldrSummary = (key) => {
    const l = mgCtx[key]; if (!l) return "";
    const parts = [];
    if (l.portfolio) parts.push(`Portfolio: ${l.portfolio.type||"?"} · risque ${l.portfolio.risk||"?"}`);
    if (l.cases.length) parts.push(`${l.cases.length} cas (${[...new Set(l.cases.map(c=>c.riskLevel).filter(Boolean))].join(", ")||"?"})`);
    if (l.meetings.length) parts.push(`${l.meetings.length} meeting(s) récent(s)`);
    const negEx = (l.exits||[]).filter(e=>["Négatif","Critique"].includes(e.result?.management?.overallSentiment));
    if (l.exits.length) parts.push(`${l.exits.length} exit(s)${negEx.length?` dont ${negEx.length} mgmt négatif`:""}`);
    if (l.plans.length) parts.push(`${l.plans.length} plan(s) 30-60-90`);
    return parts.join(" · ");
  };

  // Convergence score: how many independent sources flag this leader as a risk
  const ldrConv = (key) => {
    const l = mgCtx[key]; if (!l) return 0;
    let sc = 0;
    if (l.portfolio) sc += (RS[l.portfolio.risk]||0) >= 3 ? 2 : 1;
    sc += Math.min(l.cases.length, 3);
    sc += Math.min(l.meetings.filter(m=>(RS[m.analysis?.overallRisk]||0)>=2).length, 2);
    sc += (l.exits.filter(e=>["Négatif","Critique"].includes(e.result?.management?.overallSentiment)).length) * 2;
    return sc;
  };

  // ── Flight risk ──
  // Structural first (type field), text regex as fallback on title+situation only
  const flightCases   = cases.filter(c=>
    c.type==="retention" || c.type==="exit" ||
    /retent|départ|flight|quitt/i.test(c.title+c.situation));
  // Signals: use severity+category structurally, text as fallback
  const flightSignals = signals.filter(s=>
    /retent|départ|quitt|flight|démission/i.test((s.analysis?.title||"")+(s.analysis?.interpretation||"")) ||
    (["Élevé","Critique"].includes(s.analysis?.severity) && /retent|départ/i.test(s.analysis?.category||"")));
  const flightMgrs    = portfolio.filter(m=>/flight|retent/i.test(m.topIssue||""));
  if (flightCases.length||flightSignals.length||flightMgrs.length||recentRegrettableExits.length) {
    const evidenceCount       = flightCases.length + flightSignals.length + flightMgrs.length + recentRegrettableExits.length;
    const urgentFlightCases   = flightCases.filter(c=>c.urgency==="Immediat");
    const highRiskFlightCases = flightCases.filter(c=>c.riskLevel==="Critique"||c.riskLevel==="Élevé"||c.riskLevel==="Eleve");
    const conf        = urgentFlightCases.length||recentRegrettableExits.length>=2||evidenceCount>=3?"Élevée":evidenceCount>=2||recentRegrettableExits.length?"Moyenne":"Faible";
    const flightUrgency = urgentFlightCases.length>=1||highRiskFlightCases.length>=2||recentRegrettableExits.length>=2?"Critique":"Élevé";
    const newestCase = flightCases.sort((a,b)=>daysSince(a.openDate)-daysSince(b.openDate))[0];
    const prevFlightCount = (prevRadar?.patternTracking||[]).find(p=>/retent|flight/i.test(p.pattern))?.count||0;
    // Leader context
    const flightLdrKey  = normKey(flightMgrs[0]?.name||flightCases[0]?.director||recentRegrettableExits[0]?.managerName||"");
    const flightLdrConv = ldrConv(flightLdrKey);
    const flightLdrCtx  = ldrSummary(flightLdrKey);
    // Exit departure context for prompt
    const exitCtxParts = recentRegrettableExits.map(e=>{
      const sent = e.result?.management?.overallSentiment||"";
      return `Départ${e.employeeName?` ${e.employeeName}`:""}${e.team?` (${e.team})`:""}${e.managerName?` — gest: ${e.managerName}`:""}${sent?` — management: ${sent}`:""}`;
    });
    situations.push({
      id:"flight_risk", urgency:flightUrgency, template:"flight_risk",
      title:"Flight risk détecté",
      reason:`${flightCases.length} cas rétention · ${flightSignals.length} signaux · ${recentRegrettableExits.length} départ(s) regrettable(s) récent(s)`,
      confidence: conf,
      evidence: [
        flightCases.length && `${flightCases.length} cas actif(s) rétention (${flightCases.map(c=>c.riskLevel).join(", ")})`,
        urgentFlightCases.length && `${urgentFlightCases.length} cas urgence Immédiat`,
        flightSignals.length && `${flightSignals.length} signal(s) récent(s) de départ potentiel`,
        recentRegrettableExits.length && `${recentRegrettableExits.length} exit interview(s) regrettable(s) dans les 60 derniers jours`,
        persistentRetention.length && `${persistentRetention.length} profil(s) rétention persistant(s) dans le Weekly Brief`,
        flightMgrs.length && `${flightMgrs.map(m=>m.name).join(", ")} marqué(s) flight risk dans Portfolio`,
        newestCase?.openDate && `Cas le plus récent ouvert il y a ${daysSince(newestCase.openDate)} jours`,
      ].filter(Boolean).slice(0,4),
      whyNow: persistentRetention.length
        ? `${persistentRetention.length} profil(s) rétention en aggravation ou persistants dans le Brief — ce signal est actif depuis au moins 2 semaines.`
        : recentRegrettableExits.length
          ? `${recentRegrettableExits.length} départ(s) regrettable(s) dans les 60 jours — le pattern est déjà en train de se matérialiser.`
          : prevFlightCount && flightCases.length > prevFlightCount
            ? `+${flightCases.length-prevFlightCount} nouveau(x) cas depuis le dernier radar — le signal s'amplifie.`
            : newestCase && daysSince(newestCase.openDate) < 7
              ? `Cas ouvert il y a ${daysSince(newestCase.openDate)} jours — fenêtre d'intervention encore ouverte.`
              : `Départs silencieux: les décisions se prennent avant la démission. La fenêtre se ferme.`,
      bestNextMove: flightCases[0]?.director
        ? `Conversation directe avec ${flightCases[0].director} — poser la question sans détour: est-ce qu'il envisage de partir?`
        : recentRegrettableExits[0]?.managerName
          ? `Parler à ${recentRegrettableExits[0].managerName} — un départ regrettable récent dans son équipe est un signal à ne pas minimiser.`
          : `Identifier le profil à plus haut impact et poser la question directement cette semaine.`,
      _leaderConvergence: flightLdrConv,
      context:{
        signals:[
          ...flightCases.map(c=>`Cas: ${c.title} (${c.riskLevel})`),
          ...flightSignals.map(s=>s.analysis?.title||"Signal rétention"),
          ...exitCtxParts,
        ].join("; ")||"Signaux rétention détectés",
        managerName:flightMgrs[0]?.name||flightCases[0]?.director||recentRegrettableExits[0]?.managerName||"",
        team:flightMgrs[0]?.team||recentRegrettableExits[0]?.team||"",
        history:flightCases[0]?.interventionsDone||(recentRegrettableExits[0]?.result?.management?.coachingImplication||""),
        leaderContext:flightLdrCtx,
      },
      source:"Cases + Exits + Brief", icon:"✈️", color:C.teal,
    });
  }

  // ── Manager avoidance ──
  const avoidMgrs  = portfolio.filter(m=>m.type==="Évitant"||m.type==="Evitant");
  const avoidMeets = meetings.filter(m=>/évit|avoid|report|delay|n.a pas eu/i.test((m.analysis?.overallRiskRationale||"")+(m.analysis?.summary||[]).join(" ")));
  if (avoidMgrs.length||avoidMeets.length||negMgmtExits.length) {
    const avoidLdrKey  = normKey(avoidMgrs[0]?.name||negMgmtExits[0]?.managerName||"");
    const avoidLdrConv = ldrConv(avoidLdrKey);
    const avoidLdrCtx  = ldrSummary(avoidLdrKey);
    const highRisk = avoidMgrs.filter(m=>m.risk==="Critique"||m.risk==="Élevé"||m.risk==="Eleve");
    const conf = highRisk.length>=2||negMgmtExits.length>=2?"Élevée":avoidMgrs.length>=2||avoidMeets.length||negMgmtExits.length?"Moyenne":"Faible";
    const mostOverdue = avoidMgrs.sort((a,b)=>daysSince(b.lastInteraction)-daysSince(a.lastInteraction))[0];
    situations.push({
      id:"manager_avoidance",
      urgency:highRisk.length||negMgmtExits.length>=2?"Élevé":"Modéré",
      template:"manager_challenge",
      title:"Évitement gestionnaire",
      reason:`${avoidMgrs.length} gestionnaire(s) évitant(s) — ${negMgmtExits.length} exit(s) avec feedback management négatif`,
      confidence: conf,
      evidence:[
        avoidMgrs.length && `${avoidMgrs.length} gestionnaire(s) classifié(s) Évitant dans Portfolio`,
        highRisk.length && `${highRisk.map(m=>m.name).join(", ")} — risque Élevé ou Critique`,
        avoidMeets.length && `${avoidMeets.length} meeting(s) avec signaux d'évitement dans les notes`,
        negMgmtExits.length && `${negMgmtExits.length} exit interview(s) avec feedback management Négatif/Critique`,
        mostOverdue?.lastInteraction && `${mostOverdue.name}: dernière interaction il y a ${daysSince(mostOverdue.lastInteraction)} jours`,
      ].filter(Boolean).slice(0,4),
      whyNow: negMgmtExits.length
        ? `${negMgmtExits.length} employé(s) parti(s) en citant explicitement le management comme problème — le pattern est nommé, pas seulement supposé.`
        : mostOverdue && daysSince(mostOverdue.lastInteraction)>21
          ? `${mostOverdue.name} sans contact depuis ${daysSince(mostOverdue.lastInteraction)} jours — le problème s'installe sans intervention.`
          : highRisk.length
            ? `${highRisk.length} profil(s) à risque élevé sans action HRBP documentée — chaque semaine d'inaction valide le pattern.`
            : `Pattern d'évitement visible dans les notes — il s'amplifie sans signal clair de changement.`,
      bestNextMove:`Nommer le pattern directement à ${avoidMgrs[0]?.name||negMgmtExits[0]?.managerName||"ce gestionnaire"} — pas une suggestion, un constat. Fixer une date d'action cette semaine.`,
      _leaderConvergence: avoidLdrConv,
      context:{
        signals:[
          ...avoidMgrs.map(m=>`${m.name}: ${m.topIssue||"évitement"}`),
          ...negMgmtExits.map(e=>`Exit${e.employeeName?` ${e.employeeName}`:""}${e.managerName?` — gest. ${e.managerName}`:""}: management ${e.result?.management?.overallSentiment||""}`),
        ].join("; ")||"Pattern évitement",
        managerName:avoidMgrs[0]?.name||negMgmtExits[0]?.managerName||"",
        managerType:"Évitant",
        history:[avoidMgrs[0]?.hrbpAction, negMgmtExits[0]?.result?.management?.coachingImplication].filter(Boolean).join(" / ")||"",
        leaderContext:avoidLdrCtx,
      },
      source:"Portfolio + Exits", icon:"🫥", color:C.amber,
    });
  }

  // ── Overloaded managers ──
  const overloadMgrs = portfolio.filter(m=>m.type==="Surchargé"||m.type==="Surcharge"||m.pressure==="Elevee"||m.pressure==="Élevée");
  if (overloadMgrs.length>=2) {
    const criticalOv = overloadMgrs.filter(m=>m.risk==="Critique"||m.risk==="Élevé"||m.risk==="Eleve");
    const conf = criticalOv.length>=2?"Élevée":overloadMgrs.length>=3?"Élevée":"Moyenne";
    situations.push({
      id:"manager_overload", urgency:"Élevé",
      template:"manager_challenge",
      title:"Surcharge gestionnaires",
      reason:`${overloadMgrs.length} gestionnaire(s) sous pression élevée`,
      confidence: conf,
      evidence:[
        `${overloadMgrs.length} gestionnaire(s) avec pression Élevée dans Portfolio`,
        criticalOv.length && `${criticalOv.map(m=>m.name).join(", ")} — risque Élevé ou Critique combiné`,
        overloadMgrs.some(m=>daysSince(m.lastInteraction)>14) && `Au moins 1 gestionnaire sans contact depuis +14 jours`,
        `Équipes concernées: ${[...new Set(overloadMgrs.map(m=>m.team).filter(Boolean))].join(", ")||"Non spécifié"}`,
      ].filter(Boolean).slice(0,4),
      whyNow: overloadMgrs.length >= 3
        ? `${overloadMgrs.length} gestionnaires simultanément en surcharge — signal systémique, pas individuel.`
        : `Pression élevée sur ${overloadMgrs.map(m=>m.name).join(" et ")} — les équipes absorbent ce que les gestionnaires ne gèrent plus.`,
      bestNextMove:`Appel rapide avec ${overloadMgrs.sort((a,b)=>(RS[b.risk]||0)-(RS[a.risk]||0))[0]?.name||"le gestionnaire le plus à risque"} — une question: qu'est-ce qu'on enlève cette semaine?`,
      context:{
        signals:overloadMgrs.map(m=>`${m.name} (${m.team||"N/A"}): pression ${m.pressure}, risque ${m.risk}`).join("; "),
        managerName:overloadMgrs[0]?.name||"",
        managerType:"Surchargé",
        managers:overloadMgrs.map(m=>m.name).join(", "),
      },
      source:"Portfolio", icon:"🔥", color:C.red,
    });
  }

  // ── Performance ──
  // Structural first (type field), text on title only as fallback
  const perfCases = cases.filter(c=>
    c.type==="performance" || c.type==="pip" ||
    /perf|pip|plan|correct/i.test(c.title));
  const perfMeets = meetings.filter(m=>/performance|pip|correct/i.test((m.analysis?.summary||[]).join(" ")+(m.analysis?.overallRiskRationale||"")));
  if (perfCases.length||perfMeets.length) {
    const perfLdrKey  = normKey(perfCases[0]?.director||"");
    const perfLdrConv = ldrConv(perfLdrKey);
    const perfLdrCtx  = ldrSummary(perfLdrKey);
    const critPerf      = perfCases.filter(c=>c.riskLevel==="Critique"||c.riskLevel==="Élevé"||c.riskLevel==="Eleve");
    const overduePerf   = perfCases.filter(c=>c.dueDate&&c.dueDate<todayISO);
    const immediatePerf = perfCases.filter(c=>c.urgency==="Immediat");
    const stalePerf     = perfCases.filter(c=>!c.interventionsDone&&daysSince(c.openDate)>30);
    const conf = critPerf.length||immediatePerf.length||overduePerf.length?"Élevée":perfCases.length>=2?"Moyenne":"Faible";
    situations.push({
      id:"performance", urgency:immediatePerf.length||overduePerf.length?"Critique":critPerf.length?"Critique":"Élevé",
      template:"performance_escalation",
      title:"Enjeu de performance actif",
      reason:`${perfCases.length} cas performance · ${perfMeets.length} meeting(s) avec signaux`,
      confidence: conf,
      evidence:[
        perfCases.length && `${perfCases.length} cas actif(s): ${perfCases.map(c=>c.title).join(", ")}`,
        (overduePerf.length||immediatePerf.length) && `${overduePerf.length} échéance(s) dépassée(s) · ${immediatePerf.length} urgence Immédiat`,
        critPerf.length && `${critPerf.length} cas à risque Critique ou Élevé`,
        stalePerf.length && `${stalePerf.length} cas sans intervention documentée depuis +30 jours`,
        perfMeets.length && `${perfMeets.length} meeting(s) avec signaux performance dans les notes`,
      ].filter(Boolean).slice(0,4),
      whyNow: overduePerf.length
        ? `${overduePerf.length} cas avec échéance dépassée — délai légal et documentaire à risque immédiat.`
        : stalePerf.length
          ? `${stalePerf.length} cas ouvert(s) depuis +30 jours sans intervention — chaque semaine sans action fragilise la position légale.`
          : critPerf.length
            ? `Cas à risque Critique en cours — fenêtre d'action disciplinaire ou PIP à sécuriser rapidement.`
            : `Signaux performance dans les meetings récents — documenter maintenant avant que ça devienne un dossier.`,
      bestNextMove: stalePerf[0]
        ? `Revoir le cas "${stalePerf[0].title}" avec ${stalePerf[0].director||"le gestionnaire"} — soit on documente un plan, soit on le ferme. Pas de zone grise.`
        : `Confirmer avec ${perfCases[0]?.director||"le gestionnaire"} que la documentation du cas est à jour cette semaine.`,
      _leaderConvergence: perfLdrConv,
      context:{
        signals:perfCases.map(c=>`${c.title}: ${c.situation?.substring(0,80)||""}`).join("; ")||perfMeets.map(m=>m.analysis?.overallRiskRationale||"").join("; "),
        history:perfCases[0]?.interventionsDone||"",
        managerName:perfCases[0]?.director||"",
        duration:perfCases[0]?.openDate?`Depuis ${fmtDate(perfCases[0].openDate)}`:"N/A",
        leaderContext:perfLdrCtx,
      },
      source:"Cases + Meetings", icon:"📉", color:C.red,
    });
  }

  // ── Conflict ──
  // Structural first (type field + hrPosture), text on title+situation only as fallback
  const conflictCases   = cases.filter(c=>
    c.type==="conflict_ee" || c.type==="conflict_em" || c.type==="complaint" || c.type==="investigation" ||
    c.hrPosture==="Enquêteur" ||
    /conflit|conflict|tension|harc/i.test(c.title+c.situation));
  // Signals: add severity-based structural check
  const conflictSignals = signals.filter(s=>
    /conflit|tension|conflict/i.test((s.analysis?.title||"")+(s.analysis?.category||"")) ||
    (["Élevé","Critique"].includes(s.analysis?.severity) && /conflit|tension|climat/i.test(s.analysis?.title||"")));
  if (conflictCases.length||conflictSignals.length) {
    const conflictLdrKey  = normKey(conflictCases[0]?.director||"");
    const conflictLdrConv = ldrConv(conflictLdrKey);
    const conflictLdrCtx  = ldrSummary(conflictLdrKey);
    const immediateConflict = conflictCases.filter(c=>c.urgency==="Immediat");
    const oldConflicts = conflictCases.filter(c=>daysSince(c.openDate)>14&&!c.interventionsDone);
    const conf = immediateConflict.length||conflictCases.length>=2||conflictSignals.length>=2?"Élevée":conflictCases.length+conflictSignals.length>=2?"Moyenne":"Faible";
    situations.push({
      id:"conflict", urgency:immediateConflict.length?"Critique":"Élevé",
      template:"conflict_intervention",
      title:"Conflit actif détecté",
      reason:`${conflictCases.length} cas conflit + ${conflictSignals.length} signaux`,
      confidence: conf,
      evidence:[
        conflictCases.length && `${conflictCases.length} cas conflit actif(s): ${conflictCases.map(c=>c.title).join(", ")}`,
        conflictSignals.length && `${conflictSignals.length} signal(s) de tension récent(s)`,
        oldConflicts.length && `${oldConflicts.length} cas sans intervention depuis +14 jours`,
        conflictCases[0]?.director && `Gestionnaire impliqué: ${conflictCases[0].director}`,
      ].filter(Boolean).slice(0,4),
      whyNow: oldConflicts.length
        ? `Conflit non adressé depuis +${daysSince(oldConflicts[0].openDate)} jours — l'équipe se polarise. Médiation devient plus difficile chaque semaine.`
        : `Conflit récent — intervenir maintenant coûte 10 minutes. Attendre coûte un départ ou une plainte formelle.`,
      bestNextMove: `Entretiens individuels séparés cette semaine — ${conflictCases[0]?.director||"les parties"} en premier. Jamais les deux ensemble avant ça.`,
      _leaderConvergence: conflictLdrConv,
      context:{
        signals:conflictCases.map(c=>c.title).join("; ")||conflictSignals.map(s=>s.analysis?.title||"").join("; "),
        managers:conflictCases.map(c=>c.director||c.employee||"").filter(Boolean).join(" vs ")||"",
        history:conflictCases[0]?.interventionsDone||"",
        duration:conflictCases[0]?.openDate?`Depuis ${fmtDate(conflictCases[0].openDate)}`:"N/A",
        leaderContext:conflictLdrCtx,
      },
      source:"Cases + Signaux", icon:"⚔️", color:C.red,
    });
  }

  // ── Radar theme ──
  if (radar?.themeOfWeek?.theme) {
    const prevTheme = prevRadar?.themeOfWeek?.theme;
    const sameTheme = prevTheme && prevTheme.toLowerCase()===radar.themeOfWeek.theme.toLowerCase();
    situations.push({
      id:"weekly_theme", urgency:radar.overallRisk||"Modéré",
      template:"weekly_intervention",
      title:`Thème: ${radar.themeOfWeek.theme}`,
      reason:radar.themeOfWeek.why||"Thème identifié par le Radar",
      confidence:"Élevée",
      evidence:[
        `Thème généré par l'Org Radar sur ${(radar.topRisks||[]).length} risques et ${(radar.managersAtRisk||[]).length} managers à risque`,
        radar.themeOfWeek.businessImpact && `Impact: ${radar.themeOfWeek.businessImpact}`,
        sameTheme && `Même thème que la semaine précédente — le problème persiste.`,
        (radar.orgPatterns||[]).length && `${(radar.orgPatterns||[]).length} pattern(s) org liés détectés`,
      ].filter(Boolean).slice(0,4),
      whyNow: sameTheme
        ? `Deuxième semaine consécutive sur le même thème — l'absence d'action est maintenant le problème.`
        : radar.themeOfWeek.businessImpact||`Identifié comme priorité dominante de la semaine par le Radar.`,
      bestNextMove:`Construire le plan d'intervention de la semaine autour de ce thème — 3 actions max, 1 décision structurelle.`,
      context:{
        theme:radar.themeOfWeek.theme,
        risks:(radar.topRisks||[]).map(r=>`${r.level}: ${r.title}`).join("; ")||"Voir Radar",
        patterns:(radar.orgPatterns||[]).map(p=>p.pattern).join(", ")||"",
        managers:(radar.managersAtRisk||[]).map(m=>m.identifier).join(", ")||"",
      },
      source:"Org Radar", icon:"🎯", color:C.em,
    });
  }

  // ── Pattern rising ──
  if (radar?.patternTracking?.some(p=>p.trend==="Hausse")) {
    const rising = radar.patternTracking.filter(p=>p.trend==="Hausse");
    const prevCount = prevRadar?.patternTracking?.filter(p=>p.trend==="Hausse")?.length||0;
    const conf = rising.length>=2?"Élevée":"Moyenne";
    situations.push({
      id:"pattern_emerging", urgency:"Élevé",
      template:"pattern_detection",
      title:`Pattern en hausse: ${rising[0]?.pattern}`,
      reason:`${rising.length} pattern(s) en hausse · ${rising[0]?.count} ${rising[0]?.unit}`,
      confidence: conf,
      evidence:[
        `${rising.length} pattern(s) en hausse ce radar`,
        rising[0] && `${rising[0].pattern}: ${rising[0].count} ${rising[0].unit} · ${rising[0].trendDetail||""}`,
        rising[1] && `${rising[1].pattern}: ${rising[1].count} ${rising[1].unit}`,
        rising.length>prevCount && `+${rising.length-prevCount} pattern(s) en hausse vs radar précédent`,
      ].filter(Boolean).slice(0,4),
      whyNow: rising.length>prevCount
        ? `${rising.length-prevCount} nouveau(x) pattern(s) en hausse vs la semaine dernière — tendance émergente.`
        : `Pattern confirmé sur 2+ radars — ce n'est plus un signal isolé, c'est une tendance.`,
      bestNextMove:`Analyser les 3-5 derniers meetings liés à "${rising[0]?.pattern}" — identifier le mécanisme commun avant d'intervenir.`,
      context:{
        signals:signals.map(s=>`${s.analysis?.title} (${s.analysis?.severity})`).join("; ")||"Voir signaux",
        meetings:meetings.slice(0,5).map(m=>`${m.analysis?.meetingTitle}: ${m.analysis?.overallRisk}`).join("; ")||"",
        cases:cases.slice(0,3).map(c=>`${c.title} (${c.riskLevel})`).join("; ")||"Aucun",
        patterns:rising.map(p=>`${p.pattern}: ${p.count} ${p.unit} ↑`).join("; "),
      },
      source:"Org Radar — Pattern Tracking", icon:"📊", color:C.purple,
    });
  }

  // ── Leadership misalignment ──
  const misalignPort  = portfolio.filter(m=>m.type==="Politique");
  const execMeetings  = meetings.filter(m=>(m.meetingType==="executif"||m.meetingType==="vp")&&m.analysis?.overallRisk&&(RS[m.analysis.overallRisk]||0)>=2);
  if (misalignPort.length||execMeetings.length) {
    const misalignLdrKey  = normKey(misalignPort[0]?.name||execMeetings[0]?.director||"");
    const misalignLdrConv = ldrConv(misalignLdrKey);
    const misalignLdrCtx  = ldrSummary(misalignLdrKey);
    const conf = misalignPort.length>=2||execMeetings.length>=2?"Élevée":misalignPort.length+execMeetings.length>=2?"Moyenne":"Faible";
    situations.push({
      id:"leadership_misalignment", urgency:"Modéré",
      template:"leadership_alignment",
      title:"Désalignement leadership détecté",
      reason:misalignPort.length?`${misalignPort.length} profil(s) politique(s) · ${execMeetings.length} meeting(s) exec à risque`:"Signaux dans les meetings exécutifs",
      confidence: conf,
      evidence:[
        misalignPort.length && `${misalignPort.length} gestionnaire(s) type Politique: ${misalignPort.map(m=>m.name).join(", ")}`,
        execMeetings.length && `${execMeetings.length} meeting(s) exécutif(s) avec risque Modéré+`,
        misalignPort[0]?.topIssue && `Enjeu principal: ${misalignPort[0].topIssue}`,
        execMeetings[0]?.analysis?.overallRiskRationale && `Signal récent: ${execMeetings[0].analysis.overallRiskRationale.substring(0,60)}`,
      ].filter(Boolean).slice(0,4),
      whyNow: execMeetings.length
        ? `Meeting exécutif récent avec signal de risque — moment optimal pour intervention avant que la position se fige.`
        : `Profil politique dans le portfolio sans action HRBP récente — le désalignement se consolide en silence.`,
      bestNextMove:`Préparer un briefing de 2 minutes avec 1 fait concret qui contredit la narrative actuelle du leadership. Pas une analyse — un fait.`,
      _leaderConvergence: misalignLdrConv,
      context:{
        signals:misalignPort.map(m=>`${m.name}: ${m.topIssue||""}`).join("; ")||execMeetings.map(m=>m.analysis?.overallRiskRationale||"").join("; "),
        managerName:misalignPort[0]?.name||"",
        cases:cases.slice(0,3).map(c=>c.title).join("; ")||"",
        history:misalignPort[0]?.notes||"",
        leaderContext:misalignLdrCtx,
      },
      source:"Portfolio + Meetings", icon:"🔀", color:C.purple,
    });
  }

  // ── 30-60-90 integration risk ──
  if (criticalPlans.length) {
    const mostCritical = criticalPlans.reduce((best, p)=>{
      const bPhase = getPlanPhase(best.startDate); const pPhase = getPlanPhase(p.startDate);
      const bLeft = bPhase?.daysLeft??999; const pLeft = pPhase?.daysLeft??999;
      return pLeft < bLeft ? p : best;
    }, criticalPlans[0]);
    const critPhase = getPlanPhase(mostCritical.startDate);
    const watchouts = critPhase ? (mostCritical.output?.[critPhase.key]?.watchouts||[]) : [];
    const transRisk = mostCritical.output?.summary?.transitionRisk||"Modéré";
    const isUrgent = transRisk==="Critique"||(critPhase?.daysLeft??99)<=5;
    situations.push({
      id:"integration_risk", urgency:isUrgent?"Critique":"Élevé",
      template:"flight_risk",
      title:`Intégration à risque — ${mostCritical.employeeName||"Employé"}`,
      reason:`${criticalPlans.length} plan(s) 30-60-90 en phase critique · Risque transition: ${transRisk}`,
      confidence:transRisk==="Critique"?"Élevée":critPhase?.daysLeft<=10?"Moyenne":"Faible",
      evidence:[
        `${mostCritical.employeeName||"Employé"} — ${mostCritical.role||""}${mostCritical.team?` (${mostCritical.team})` :""}`,
        critPhase && `Phase ${critPhase.label} — ${critPhase.daysLeft} jour(s) restant(s)`,
        mostCritical.output?.summary?.hrbpNote && `Note HRBP: ${mostCritical.output.summary.hrbpNote.substring(0,80)}`,
        watchouts.length && `Watchout actuel: ${watchouts[0]}`,
      ].filter(Boolean).slice(0,4),
      whyNow: critPhase?.daysLeft<=5
        ? `${critPhase.daysLeft} jour(s) restant(s) dans la phase ${critPhase.label} — fenêtre de correction quasi fermée.`
        : transRisk==="Critique"
          ? `Risque de transition Critique identifié — chaque semaine sans action augmente la probabilité de perte.`
          : `Phase d'intégration en cours avec signaux de risque — moment optimal pour ajustement proactif.`,
      bestNextMove: mostCritical.manager
        ? `Checkpoint avec ${mostCritical.manager} sur l'intégration de ${mostCritical.employeeName||"l'employé"} — pas une mise à jour, une évaluation honnête.`
        : `Évaluer l'intégration de ${mostCritical.employeeName||"l'employé"} directement — est-ce que ça va vraiment bien ou est-ce qu'on se rassure mutuellement?`,
      context:{
        signals:`Intégration ${mostCritical.employeeName||""} (${mostCritical.role||""}${mostCritical.team?`, ${mostCritical.team}`:""}): risque ${transRisk}${watchouts.length?` — ${watchouts[0]}`:""}`,
        managerName:mostCritical.employeeName||"",
        managerType:mostCritical.manager||"N/A",
        team:mostCritical.team||"",
        history:mostCritical.output?.summary?.hrbpNote||"",
      },
      source:"Plans 30-60-90", icon:"🗓️", color:C.blue,
    });
  }

  // ── Brief carryover: aggravated risks surfaced from Weekly ──
  if (carryOverRisks.length && !situations.some(s=>s.id==="pattern_emerging")) {
    const topRisk = carryOverRisks[0];
    situations.push({
      id:"brief_pattern", urgency:topRisk.level==="Critique"?"Critique":topRisk.level==="Élevé"||topRisk.level==="Eleve"?"Élevé":"Modéré",
      template:"pattern_detection",
      title:`Risque persistant (Brief): ${topRisk.risk?.substring(0,50)||"Voir Weekly"}`,
      reason:`${carryOverRisks.length} risque(s) en aggravation ou persistant(s) dans le Weekly Brief`,
      confidence:"Moyenne",
      evidence:[
        `${carryOverRisks.length} risque(s) avec carryOver ou évolution Aggravé dans le dernier Brief`,
        topRisk.risk && `Risque principal: ${topRisk.risk}`,
        topRisk.evolution && `Évolution: ${topRisk.evolution}`,
        latestBrief?.riskLevel && `Niveau de risque org cette semaine: ${latestBrief.riskLevel}`,
      ].filter(Boolean).slice(0,4),
      whyNow:`Ce risque est présent depuis au moins 2 semaines dans le Weekly Brief — il ne se résout pas seul.`,
      bestNextMove:`Revoir ce risque dans le prochain Brief: est-ce que c'est Persistant parce qu'on l'adresse, ou Persistant parce qu'on l'évite?`,
      context:{
        signals:carryOverRisks.map(r=>r.risk||"").join("; "),
        meetings:meetings.slice(0,3).map(m=>`${m.analysis?.meetingTitle||""}: ${m.analysis?.overallRisk||""}`).join("; ")||"",
        cases:cases.slice(0,3).map(c=>`${c.title} (${c.riskLevel})`).join("; ")||"",
        patterns:carryOverRisks.map(r=>`${r.risk} (${r.evolution})`).join("; "),
      },
      source:"Weekly Brief", icon:"📊", color:C.amber,
    });
  }

  // ── Prioritization score: urgency + cross-impact + time-sensitivity + pattern + accountability ──
  const pScore = (s) => {
    let score = 0;
    // Urgency base
    score += ({"Critique":40,"Élevé":30,"Eleve":30,"Modéré":15,"Modere":15,"Faible":5}[s.urgency]||10);
    // Confidence amplifier
    score += ({"Élevée":10,"Moyenne":5,"Faible":0}[s.confidence]||0);
    // Cross-team impact: situations with multiple managers/teams score higher
    const mgrsCount = (s.context.managers||"").split(",").filter(Boolean).length;
    score += Math.min(mgrsCount*4, 12);
    // Time-sensitivity: theme+conflict+flight punished if old, boosted if fresh
    if (s.id==="weekly_theme") score += 8; // always this week
    if (s.id==="conflict"&&s.context.duration?.includes("7")) score += 6; // recent
    if (s.id==="flight_risk") score += 5; // inherently time-sensitive
    // Pattern repetition: seen in prev radar
    if (s.whyNow?.includes("semaine consécutive")||s.whyNow?.includes("2+ radars")) score += 8;
    // Manager accountability risk: avoidance + performance without action = high accountability
    if (s.id==="manager_avoidance"||s.id==="performance") score += 5;
    // Integration risk: time-bounded — daysLeft ≤ 5 is always urgent
    if (s.id==="integration_risk") score += 6;
    // Brief carryover: persistent pattern needs attention
    if (s.id==="brief_pattern") score += 4;
    // Leader convergence: multiple independent sources pointing to same manager
    const conv = s._leaderConvergence||0;
    if (conv >= 5) score += 10;
    else if (conv >= 3) score += 6;
    else if (conv >= 2) score += 3;
    return score;
  };

  return situations.sort((a,b)=>pScore(b)-pScore(a));
}

// ── Module ────────────────────────────────────────────────────────────────────
export default function ModuleAutoPrompt({ data }) {
  const [selected, setSelected]   = useState(null);   // selected situation
  const [mode, setMode]           = useState(null);   // diagnose|act|say
  const [generated, setGenerated] = useState("");
  const [copied, setCopied]       = useState(false);
  const [variant, setVariant]     = useState(null);   // stronger|direct|executive

  const situations = detectSituations(data);
  const riskC = (r) => ({"Critique":C.red,"Élevé":C.amber,"Eleve":C.amber,"Modéré":C.blue,"Modere":C.blue,"Faible":C.em}[r]||C.textD);

  const generate = (sit, m, vari) => {
    const tpl = APE_TEMPLATES[sit.template];
    if (!tpl) return;
    let base = tpl[m]?.(sit.context) || "";
    if (!base) { setGenerated("Mode non disponible pour ce template."); return; }
    if (vari === "stronger") base += "\n\nSois encore plus direct. Moins de nuances. Plus de conséquences. Ne m'épargne pas.";
    if (vari === "direct")   base += "\n\nRéduis de 30%. Coupe tout ce qui n'est pas actionnable. Reste uniquement les faits et les actes.";
    if (vari === "executive") base += "\n\nReformule pour un VP ou CODIR. Langage business, pas RH. Enjeu organisationnel en premier. Recommandation courte et nette.";
    setGenerated(base);
    setMode(m);
    setVariant(vari||null);
  };

  const selectSit = (sit) => {
    setSelected(sit);
    setGenerated("");
    setMode(null);
    setVariant(null);
  };

  const copy = () => {
    if (!generated) return;
    const ta = document.createElement("textarea");
    ta.value = generated; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const tpl = selected ? APE_TEMPLATES[selected.template] : null;
  const availableModes = tpl ? ["diagnose","act","say"].filter(m => !!tpl[m]) : [];

  const MODE_META = {
    diagnose: { label:"🔍 Diagnose", desc:"Lire la situation en profondeur", color:C.purple },
    act:      { label:"🎯 Act",      desc:"Plan d'action ou prochaines étapes",  color:C.em },
    say:      { label:"💬 Say",      desc:"Formulation exacte pour la conversation", color:C.blue },
  };

  const URGENCY_C = (u) => ({"Critique":C.red,"Élevé":C.amber,"Eleve":C.amber,"Modéré":C.blue,"Modere":C.blue}[u]||C.textD);

  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Auto Prompt Engine</div>
        <div style={{ fontSize:12, color:C.textM }}>
          Contexte détecté automatiquement · {situations.length} situation{situations.length!==1?"s":""} identifiée{situations.length!==1?"s":""}
        </div>
      </div>

      {/* Empty state */}
      {situations.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:C.textD }}>
          <div style={{ fontSize:36, marginBottom:14 }}>🔍</div>
          <div style={{ fontSize:14, color:C.textM, marginBottom:6 }}>Aucune situation détectée</div>
          <div style={{ fontSize:12, color:C.textD, maxWidth:380, margin:"0 auto" }}>
            Alimente le OS — ajoute des cas, des meetings, des signaux ou génère un Org Radar pour que le moteur détecte des situations.
          </div>
        </div>
      )}

      {situations.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns: selected ? "320px 1fr" : "1fr", gap:14 }}>

          {/* Left — situation list */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {selected && <Mono color={C.textD} size={8} style={{ display:"block", marginBottom:4 }}>SITUATIONS DÉTECTÉES</Mono>}
            {situations.map((sit, i) => {
              const isSelected = selected?.id === sit.id;
              const uc = URGENCY_C(sit.urgency);
              return (
                <button key={sit.id} onClick={() => selectSit(sit)}
                  style={{ display:"flex", gap:10, alignItems:"flex-start",
                    padding:"10px 12px", borderRadius:8, cursor:"pointer",
                    textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                    background: isSelected ? sit.color+"15" : C.surfL,
                    border:`1px solid ${isSelected ? sit.color+"66" : C.border}`,
                    borderLeft:`3px solid ${isSelected ? sit.color : uc}` }}>
                  <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{sit.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{sit.title}</div>
                      {sit.confidence && (() => {
                        const cc = {"Élevée":C.em,"Moyenne":C.amber,"Faible":C.textD}[sit.confidence]||C.textD;
                        return <div style={{ background:cc+"18", border:`1px solid ${cc}35`,
                          borderRadius:4, padding:"1px 5px", fontSize:8, color:cc,
                          fontWeight:700, flexShrink:0 }}>
                          {sit.confidence==="Élevée"?"✓ Élevée":sit.confidence==="Moyenne"?"~ Moyenne":"? Faible"}
                        </div>;
                      })()}
                    </div>
                    {sit.whyNow && (
                      <div style={{ fontSize:11, color:C.amber, lineHeight:1.5, marginBottom:4,
                        overflow:"hidden", textOverflow:"ellipsis",
                        display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                        ⏱ {sit.whyNow}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:5, marginTop:4, flexWrap:"wrap" }}>
                      <div style={{ background:uc+"18", border:`1px solid ${uc}35`,
                        borderRadius:4, padding:"1px 6px", fontSize:9, color:uc, fontWeight:700 }}>
                        {sit.urgency}
                      </div>
                      <Mono color={C.textD} size={8}>{sit.source}</Mono>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right — generator */}
          {selected && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {/* Situation detail */}
              <div style={{ padding:"12px 14px", background:selected.color+"0d",
                border:`1px solid ${selected.color}35`, borderRadius:9,
                borderLeft:`4px solid ${selected.color}` }}>
                <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
                  <span style={{ fontSize:20 }}>{selected.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:2 }}>{selected.title}</div>
                    <div style={{ fontSize:12, color:C.textM, lineHeight:1.6 }}>{selected.reason}</div>
                  </div>
                  <button onClick={() => { setSelected(null); setGenerated(""); setMode(null); }}
                    style={{ background:"none", border:"none", cursor:"pointer", color:C.textD,
                      fontSize:14, padding:"2px 4px", flexShrink:0 }}>✕</button>
                </div>
                {/* Evidence */}
                {selected.evidence?.length > 0 && (
                  <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:3 }}>
                    {selected.evidence.map((e,i) => (
                      <div key={i} style={{ display:"flex", gap:7, alignItems:"baseline" }}>
                        <span style={{ color:selected.color, fontSize:10, flexShrink:0 }}>·</span>
                        <span style={{ fontSize:11, color:C.textD }}>{e}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Best next move */}
              {selected.bestNextMove && (
                <div style={{ display:"flex", gap:10, alignItems:"flex-start",
                  padding:"10px 14px", background:C.em+"0d",
                  border:`1px solid ${C.em}30`, borderRadius:8 }}>
                  <div style={{ width:22, height:22, background:C.em, borderRadius:5,
                    flexShrink:0, display:"flex", alignItems:"center",
                    justifyContent:"center", fontSize:12, marginTop:1 }}>→</div>
                  <div>
                    <Mono color={C.em} size={8} style={{ display:"block", marginBottom:4 }}>MEILLEUR MOVE EN 10 MINUTES</Mono>
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.65 }}>{selected.bestNextMove}</div>
                  </div>
                </div>
              )}

              {/* Mode selector */}
              <div>
                <Mono color={C.textD} size={8} style={{ display:"block", marginBottom:6 }}>CHOISIR LE MODE</Mono>
                <div style={{ display:"flex", gap:6 }}>
                  {["diagnose","act","say"].map(m => {
                    const meta = MODE_META[m];
                    const avail = availableModes.includes(m);
                    const isActive = mode===m;
                    return (
                      <button key={m}
                        onClick={() => avail && generate(selected, m, null)}
                        disabled={!avail}
                        style={{ flex:1, padding:"10px 8px", borderRadius:8, cursor:avail?"pointer":"not-allowed",
                          fontFamily:"'DM Sans',sans-serif", border:"none",
                          background: isActive ? meta.color : avail ? meta.color+"15" : C.surfLL,
                          color: isActive ? "#fff" : avail ? meta.color : C.textD,
                          opacity: avail ? 1 : 0.35 }}>
                          <div style={{ fontSize:14, marginBottom:3 }}>{meta.label.split(" ")[0]}</div>
                          <div style={{ fontSize:11, fontWeight:700 }}>{meta.label.split(" ").slice(1).join(" ")}</div>
                          <div style={{ fontSize:9, marginTop:2, opacity:0.75,
                            color: isActive?"#fff":meta.color }}>{meta.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Generated prompt */}
              {generated && (
                <div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                    <Mono color={C.textD} size={8}>PROMPT GÉNÉRÉ — PRÊT À COLLER</Mono>
                    <div style={{ display:"flex", gap:5 }}>
                      {/* Variants */}
                      {[
                        {id:"stronger",  label:"⬆ Plus fort"},
                        {id:"direct",    label:"✂ Plus court"},
                        {id:"executive", label:"🎙️ Exec"},
                      ].map(v=>(
                        <button key={v.id}
                          onClick={() => generate(selected, mode, v.id)}
                          style={{ padding:"3px 9px", borderRadius:5, fontSize:10,
                            cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                            background: variant===v.id ? C.purple+"22" : C.surfLL,
                            border:`1px solid ${variant===v.id ? C.purple+"55" : C.border}`,
                            color: variant===v.id ? C.purple : C.textD }}>
                          {v.label}
                        </button>
                      ))}
                      <button onClick={copy}
                        style={{ ...css.btn(copied?C.em:C.blue),
                          padding:"4px 14px", fontSize:11 }}>
                        {copied ? "✓ Copié" : "📋 Copier"}
                      </button>
                    </div>
                  </div>
                  <div style={{ background:C.bg, border:`1px solid ${C.border}`,
                    borderRadius:8, padding:"13px 15px", fontSize:12, color:C.textM,
                    lineHeight:1.8, whiteSpace:"pre-wrap",
                    fontFamily:"'DM Mono',monospace", maxHeight:380, overflowY:"auto" }}>
                    {generated}
                  </div>
                </div>
              )}

              {/* No mode selected hint */}
              {!generated && (
                <div style={{ textAlign:"center", padding:"30px 20px",
                  color:C.textD, fontSize:12,
                  background:C.surfL, borderRadius:8,
                  border:`1px solid ${C.border}` }}>
                  Choisis un mode ci-dessus pour générer le prompt
                </div>
              )}
            </div>
          )}

          {/* No selection hint when list is shown full-width */}
          {!selected && situations.length > 0 && (
            <div style={{ marginTop:8, textAlign:"center", padding:"20px",
              color:C.textD, fontSize:12 }}>
              Sélectionne une situation pour générer le prompt
            </div>
          )}
        </div>
      )}
    </div>
  );
}
