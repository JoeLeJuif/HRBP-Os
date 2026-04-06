// Source: HRBP_OS.jsx L.8163-9664
import { useState } from "react";
import { C, css } from '../theme.js';
import Badge from '../components/Badge.jsx';
import Mono from '../components/Mono.jsx';
import Divider from '../components/Divider.jsx';

// ── Data constants (Source: L.8163-8324) ─────────────────────────────────────
const CONV_SITUATIONS = [
  {
    id: "avoidant-perf",
    category: "Performance",
    icon: "🫥",
    color: "#f59e0b",
    title: "Manager évitant — feedback non livré",
    situation: "L'employé ne sait pas qu'il y a un problème. Le gestionnaire attend le 'bon moment' depuis 3 semaines.",
    opening: "«\u00a0Tu gères ou tu subis? Parce que là, tu subis. Et ton équipe le voit.\u00a0»",
    questions: [
      "Qu'est-ce que tu attends exactement pour avoir cette conversation?",
      "Si ton propre patron te gérait comme tu gères ça — comment tu te sentirais?",
      "Qu'est-ce que ton silence dit à ceux qui performent bien?"
    ],
    push: "«\u00a0Je ne ferai pas cette conversation à ta place. Tu l'as d'ici jeudi ou j'informe ton directeur que le problème n'est pas géré.\u00a0»",
    closing: "Date fixée. Pas 'bientôt'. Débrief vendredi. Pas eu lieu = escalade immédiate."
  },
  {
    id: "overloaded",
    category: "Leadership",
    icon: "🔥",
    color: "#ef4444",
    title: "Manager surchargé — équipe déstabilisée",
    situation: "Annule ses 1:1, décisions réactives, équipe qui contourne. Dit que 'ça va'.",
    opening: "«\u00a0Sur 10, ton énergie ces 30 derniers jours. Sans arrondir.\u00a0»",
    questions: [
      "Qu'est-ce que tu portes que tu n'aurais pas dû prendre?",
      "Ton directeur sait dans quel état tu es? Si non — pourquoi tu le protèges?",
      "Qu'est-ce que ton équipe absorbe en ce moment sans te le dire?"
    ],
    push: "«\u00a0Deux choses changent cette semaine. Concrètes. Pas un plan de bien-être — une décision.\u00a0»",
    closing: "1-2 décharges réelles avec délai. Si la pression vient du directeur: cette conversation se fait à trois."
  },
  {
    id: "micromanager",
    category: "Leadership",
    icon: "🔬",
    color: "#8b5cf6",
    title: "Micromanager — profils seniors sur le départ",
    situation: "Rien ne se décide sans lui. Ses seniors se désengagent. Il appelle ça 'standards élevés'.",
    opening: "«\u00a0Deux de tes seniors m'ont signalé qu'ils ne peuvent plus travailler sans validation constante. C'est un signal de départ, pas de confort.\u00a0»",
    questions: [
      "Qu'est-ce que tu vérifies que ton équipe pourrait décider seule?",
      "Tu leur fais confiance ou pas? Parce que ton comportement dit non.",
      "Le contrôle que tu exerces — c'est pour l'équipe ou pour toi?"
    ],
    push: "«\u00a03 décisions que tu délègues dès lundi. Si tu ne peux pas nommer lesquelles, le problème est plus profond qu'on pense.\u00a0»",
    closing: "Liste des décisions déléguées formellement. Revue à 30 jours. Pas de tolérance sur la rechute."
  },
  {
    id: "toxic-performer",
    category: "Relations de travail",
    icon: "⚡",
    color: "#ef4444",
    title: "Performant toxique — gestionnaire qui protège",
    situation: "Les résultats justifient tout. L'équipe paie. Le gestionnaire voit les plaintes mais ne bouge pas.",
    opening: "«\u00a0On compte. 1 performant difficile. Combien de bons qui ne veulent plus travailler avec lui? Fais le calcul.\u00a0»",
    questions: [
      "Si ses chiffres étaient moyens, ce comportement serait toléré depuis combien de temps?",
      "Combien de personnes ont quitté ou demandé un transfert à cause de lui?",
      "Qu'est-ce que tu dis à ton équipe en continuant de ne rien faire?"
    ],
    push: "«\u00a0Ce n'est pas un choix de style de management. C'est une décision organisationnelle. Et tu l'as prise par défaut en ne faisant rien.\u00a0»",
    closing: "Dossier d'impact cette semaine. Plan comportemental 30 jours. Conséquences nommées explicitement. Récidive = disciplinaire."
  },
  {
    id: "flight-risk",
    category: "Rétention",
    icon: "✈️",
    color: "#06b6d4",
    title: "Flight risk — profil clé silencieux",
    situation: "Retrait visible. LinkedIn actif. Gestionnaire dit 'il va bien' sans preuve. Décision probablement déjà prise.",
    opening: "«\u00a0Je vais te poser la question directement: est-ce que tu envisages de partir?\u00a0»",
    questions: [
      "Qu'est-ce qu'on aurait dû faire différemment pour toi ces 6 derniers mois?",
      "Si tu restes — qu'est-ce qui doit changer concrètement dans 30 jours?",
      "Qu'est-ce que tu ne m'as pas encore dit parce que tu pensais que ça ne servirait à rien?"
    ],
    push: "«\u00a0On préfère savoir maintenant plutôt que par un email de démission un lundi matin. Ce que tu dis ici a de l'impact.\u00a0»",
    closing: "Identifier le levier réel. 1 action concrète sous 30 jours. Si le levier c'est le gestionnaire: cette conversation se fait séparément."
  },
  {
    id: "conflict-employees",
    category: "Relations de travail",
    icon: "⚔️",
    color: "#ef4444",
    title: "Conflit entre employés — gestionnaire qui fuit",
    situation: "Tension qui dure. Équipe polarisée. Gestionnaire 'ne veut pas s'impliquer dans le personnel'.",
    opening: "«\u00a0Un événement précis. Récent. Concret. Pas des impressions — un fait.\u00a0»",
    questions: [
      "Tu lui as dit directement ce que tu viens de me dire? Mot pour mot?",
      "Qu'est-ce que tu as besoin qu'il arrête de faire — concrètement?",
      "Qu'est-ce qui serait suffisant pour que tu puisses travailler avec lui?"
    ],
    push: "«\u00a0Ce n'est pas une incompatibilité. C'est un comportement. Et les comportements changent — quand il y a des conséquences.\u00a0»",
    closing: "Entretiens séparés d'abord. Toujours. Médiation si malentendu. Enquête si comportement grave. Ne jamais confondre les deux."
  },
  {
    id: "director-misaligned",
    category: "Stratégie RH",
    icon: "🔀",
    color: "#8b5cf6",
    title: "Directeur déconnecté — image filtrée",
    situation: "Croit que tout va bien. Les données disent le contraire. Reçoit une version filtrée par ses gestionnaires.",
    opening: "«\u00a0J'ai des données qui contredisent ce que tu m'as dit. Je te les donne maintenant parce que dans 60 jours il sera trop tard.\u00a0»",
    questions: [
      "Quand as-tu eu ta dernière vraie conversation avec chacun de tes gestionnaires — pas un statut, une conversation?",
      "Si 3 personnes clés partaient ce trimestre, tu serais surpris?",
      "Qu'est-ce que personne ne t'a encore dit en face?"
    ],
    push: "«\u00a0Mon travail ce n'est pas de te rassurer. C'est de te dire ce que ton équipe ne te dit pas encore.\u00a0»",
    closing: "Signaux concrets sur la table, sans nommer les sources. Pas de réassurance mutuelle en sortant. Diagnostic structuré proposé."
  },
  {
    id: "manager-resisting-hr",
    category: "Stratégie RH",
    icon: "🛡️",
    color: "#f59e0b",
    title: "Manager résistant — 'je connais mon monde'",
    situation: "Minimise, conteste, ou ignore. Traite les recommandations HRBP comme une ingérence.",
    opening: "«\u00a0Je n'ai pas besoin que tu sois d'accord. Mais je vais nommer ce que je vois, et je vais le documenter. Si dans 60 jours ça explose, la question sera: pourquoi personne n'a rien dit?\u00a0»",
    questions: [
      "Qu'est-ce que je rate selon toi — concrètement?",
      "Si ton pair avait exactement ce dossier, qu'est-ce que tu lui dirais de faire?",
      "C'est quoi le signal qui te ferait dire que c'est effectivement un problème?"
    ],
    push: "«\u00a0Je documente cette conversation aujourd'hui. Tu as été informé. Si tu veux explorer d'autres options, je suis là. Sinon, on verra dans 60 jours.\u00a0»",
    closing: "Document écrit immédiatement. Escalade si risque légal. Le dossier ne se ferme pas pour préserver la relation."
  },
  {
    id: "blocked-promotion",
    category: "Développement",
    icon: "🚧",
    color: "#3b82f6",
    title: "Promotion bloquée — talent qui part",
    situation: "2+ cycles sans réponse. Gestionnaire 'attend le bon moment'. L'employé commence à chercher ailleurs.",
    opening: "«\u00a0Je vais être honnête: il n'y a pas de bonne nouvelle à court terme. Voici la réalité.\u00a0»",
    questions: [
      "Qu'est-ce qu'on t'a dit explicitement sur le blocage — pas ce que tu en penses, ce qu'on t'a dit?",
      "Si tu faisais le même travail ailleurs, quel titre tu aurais?",
      "Qu'est-ce qui te ferait rester si la promotion ne vient pas avant 12 mois?"
    ],
    push: "Au gestionnaire: «\u00a0Si ce profil est chez un concurrent dans 6 mois — comment tu l'expliques à ton propre directeur?\u00a0»",
    closing: "Nommer le blocage réel. Plan avec jalons mesurables ou alternative concrète. Pas de 'on verra' — une réponse."
  },
  {
    id: "return-sick-leave",
    category: "Gestion des absences",
    icon: "🌱",
    color: "#10b981",
    title: "Retour d'arrêt — situation fragile",
    situation: "Retour post-burnout. L'employé veut prouver qu'il va bien. Le gestionnaire ne sait pas comment se comporter.",
    opening: "«\u00a0Avant de parler du boulot: comment tu te sens par rapport à l'idée de revenir ici — pas ta santé en général, l'idée de remettre les pieds dans ce bureau.\u00a0»",
    questions: [
      "Qu'est-ce qui t'inquiète le plus pour les deux premières semaines?",
      "Qu'est-ce que tu ne veux pas que je partage avec ton gestionnaire?",
      "Sur quoi tu as besoin qu'on soit clairs avant lundi?"
    ],
    push: "Au gestionnaire: «\u00a0Qu'est-ce que tu vas faire différemment cette fois? Des actes — pas des intentions.\u00a0»",
    closing: "Plan progressif non négociable. Briefing équipe sans détails. Check-in hebdomadaire 30 jours minimum. Tout documenté."
  }
];

// ── Data constants (Source: L.8326-8550) ─────────────────────────────────────
const PROMPT_LIBRARY = [
  {
    id: "weekly-intervention",
    category: "Stratégie hebdomadaire",
    icon: "📅",
    title: "Plan d'intervention hebdomadaire",
    when: "Chaque lundi matin, après avoir identifié le thème de la semaine",
    prompt: `Mon thème HRBP de la semaine est: [THÈME]

Les éléments de contexte clés:
[RÉSUMÉ DES RISQUES / PATTERNS PRINCIPAUX]

Conçois un plan d'intervention HRBP pour les 5 prochains jours:
- 3 actions concrètes avec noms de responsables et délais réels
- 1 message à adresser au leadership (objet et angle spécifique)
- 1 correction structurelle à proposer (pas du coaching — une décision organisationnelle)

Contraintes: réaliste dans une charge de travail de 36 gestionnaires. Aucune action sans deadline. Aucune recommandation générique.`
  },
  {
    id: "manager-challenge",
    category: "Coaching gestionnaires",
    icon: "⚡",
    title: "Préparer un challenge gestionnaire",
    when: "Avant un 1:1 avec un gestionnaire sur un dossier sensible",
    prompt: `Situation avec [NOM/RÔLE DU GESTIONNAIRE]:
[DESCRIPTION DE LA SITUATION — 3-5 lignes]

Historique des interventions: [CE QUI A DÉJÀ ÉTÉ TENTÉ]

Donne-moi:
- 2 choses que je dois challenger directement ce gestionnaire (pas suggérer — challenger)
- 1 chose que je dois ignorer pour l'instant pour ne pas diluer le message
- 1 ligne d'ouverture directe en français (pas diplomatique — efficace)
- La résistance la plus probable et comment la traiter sans reculer

Tu es un HRBP senior. Sois direct. Ne m'épargne pas.`
  },
  {
    id: "exec-briefing",
    category: "Communication exécutive",
    icon: "🎙️",
    title: "Briefing exécutif 30 secondes",
    when: "Avant une réunion de direction ou pour escalader un risque",
    prompt: `Voici mes données HRBP cette semaine:
[COLLER LE RÉSUMÉ DU RADAR OU DE LA SITUATION]

Génère un briefing exécutif en 3 points:
- 1 enjeu principal (nommer la population concernée et l'impact business concret)
- 1 risque si rien n'est fait dans les 30 prochains jours (pas vague — chiffré ou concret)
- 1 recommandation avec un seul owner et un seul délai

Aucun jargon RH. Le directeur doit comprendre en 30 secondes sans contexte préalable.`
  },
  {
    id: "pattern-detection",
    category: "Diagnostic organisationnel",
    icon: "🔍",
    title: "Détection de patterns organisationnels",
    when: "Après avoir accumulé 3+ meetings ou signaux sur une même période",
    prompt: `Voici mes données des 2-3 dernières semaines:

Meetings: [RÉSUMÉS / RISQUES CLÉS]
Signaux: [SIGNAUX REÇUS]
Cas actifs: [TYPES ET STATUTS]

Analyse:
- Quels patterns émergent que je sous-estime probablement?
- Quelle est la connexion non évidente entre ces données?
- Sur quoi est-ce que je dois agir cette semaine — et sur quoi je dois attendre?
- Qu'est-ce que ces données ne me montrent PAS encore mais vont probablement me montrer dans 30 jours?

Sois direct. Si tu vois quelque chose que je ne vois pas — dis-le.`
  },
  {
    id: "retention-diagnosis",
    category: "Rétention",
    icon: "✈️",
    title: "Diagnostic rétention profil clé",
    when: "Quand un signal de départ potentiel est identifié sur un profil à impact élevé",
    prompt: `Profil à risque: [RÔLE / NIVEAU / ANCIENNETÉ]
Signaux observés: [CE QUI A ÉTÉ NOTÉ]
Contexte équipe: [GESTIONNAIRE, DYNAMIQUE, CHANGEMENTS RÉCENTS]
Dernier feedback connu: [CE QUI A ÉTÉ DIT À CET EMPLOYÉ]

Donne-moi:
- Le levier de rétention le plus probable (gestionnaire / croissance / rémunération / sens / appartenance)
- Les 2 erreurs classiques à éviter dans ce cas précis
- La question à poser à cet employé qui va révéler la vraie raison
- Si la rétention n'est pas possible — comment gérer un départ qui préserve la relation et le transfert de connaissance`
  },
  {
    id: "performance-framing",
    category: "Gestion de la performance",
    icon: "📉",
    title: "Cadrer un PIP ou démarche corrective",
    when: "Avant de lancer un plan de performance formel avec un gestionnaire",
    prompt: `Situation: [NOM DU RÔLE, PAS L'EMPLOYÉ] — sous-performance documentée depuis [DURÉE]
Feedbacks déjà livrés: [OUI/NON + RÉSUMÉ]
Réaction de l'employé: [CE QUI A ÉTÉ OBSERVÉ]
Position du gestionnaire: [ENGAGÉ / HÉSITANT / RÉSISTANT]

Aide-moi à:
- Valider si un PIP est le bon outil ici (ou s'il y a un problème de fond différent)
- Formuler 3 objectifs mesurables qui résisteraient à une contestation légale au Québec
- Identifier les 2 erreurs les plus probables que ce gestionnaire va faire pendant le suivi
- Préparer la réponse à "c'est injuste, je suis visé personnellement"

Contexte légal: employeur au Québec, normes du travail ou convention collective selon le cas.`
  },
  {
    id: "manager-profile-read",
    category: "Coaching gestionnaires",
    icon: "🧠",
    title: "Lire le profil d'un gestionnaire",
    when: "Avant un nouveau 1:1 ou quand la dynamique avec un gestionnaire est floue",
    prompt: `Gestionnaire: [RÔLE, ANCIENNETÉ, ÉQUIPE]
Ce que j'observe: [COMPORTEMENTS CONCRETS — PAS D'INTERPRÉTATION]
Ce que l'équipe remonte: [SIGNAUX INDIRECTS]
Historique de nos interactions: [RÉSUMÉ DES DERNIÈRES CONVERSATIONS]

Donne-moi:
- Le profil gestionnaire le plus probable (évitant / surchargé / politique / désaligné / en développement)
- La motivation principale qui explique son comportement actuel
- Mon angle d'approche optimal pour cette semaine
- 1 chose à NE PAS faire avec ce profil qui serait contre-productive
- La question qui va créer une vraie ouverture (pas de la résistance)`
  },
  {
    id: "conflict-mediation-prep",
    category: "Situations difficiles",
    icon: "⚔️",
    title: "Préparer une médiation ou confrontation",
    when: "Avant une session avec deux parties en conflit ou une conversation difficile tripartite",
    prompt: `Conflit entre: [RÔLE A] et [RÔLE B]
Durée: [DEPUIS QUAND]
Faits documentés: [CE QUI S'EST PASSÉ CONCRÈTEMENT]
Ce que chaque partie dit: [VERSION A] / [VERSION B]
Ce que le gestionnaire a fait jusqu'ici: [NÉANT / PARTIEL / INCORRECT]

Dis-moi:
- S'il s'agit d'un malentendu (médiation) ou d'un comportement (enquête) — et pourquoi
- L'ordre des conversations à tenir et pourquoi (qui vois-je en premier?)
- Les 2 pièges à éviter dans cette configuration précise
- Comment tenir la neutralité si une des parties essaie de me mettre dans son camp
- Le scénario d'échec le plus probable et comment le prévenir`
  },
  {
    id: "org-design-signal",
    category: "Diagnostic organisationnel",
    icon: "🏗️",
    title: "Lire un signal structurel",
    when: "Quand un problème récurrent ressemble à un problème d'organisation plutôt que de personnes",
    prompt: `Problème observé: [DESCRIPTION]
Durée: [DEPUIS QUAND]
Personnes impliquées: [RÔLES / ÉQUIPES]
Ce qui a été tenté: [COACHING / CLARIFICATIONS / CONVERSATIONS]
Résultat de ces tentatives: [AMÉLIORATION TEMPORAIRE / AUCUN EFFET / RETOUR AU POINT DE DÉPART]

Question centrale: est-ce un problème de personnes ou un problème de structure / rôles / gouvernance?

Analyse:
- Quel serait le diagnostic si on remplaçait les personnes impliquées — le problème disparaîtrait-il?
- Quelles questions poser au directeur pour tester l'hypothèse structurelle?
- Quelle recommandation organisationnelle (pas RH) pourrait régler ça à la source?
- Comment présenter un enjeu structurel à un directeur qui pense que c'est un problème de personnes?`
  },
  {
    id: "leadership-gap",
    category: "Diagnostic organisationnel",
    icon: "🎯",
    title: "Identifier un gap de leadership",
    when: "Quand une équipe sous-performe et que les données ne pointent pas vers un employé mais vers le gestionnaire",
    prompt: `Équipe concernée: [TAILLE, DOMAINE, CONTEXTE]
Signaux observés dans l'équipe: [ENGAGEMENT / PERFORMANCE / TURNOVER / COMMUNICATION]
Profil du gestionnaire: [ANCIENNETÉ, STYLE OBSERVÉ, CONTEXTE]
Ce que le gestionnaire dit de son équipe: [SA VERSION]
Ce que l'équipe dit du gestionnaire: [SIGNAUX INDIRECTS OU DIRECTS]

Aide-moi à:
- Distinguer gap de compétence vs gap de volonté vs gap de contexte (surcharge / mauvais rôle)
- Identifier les 2-3 comportements gestionnaires qui causent le plus de dommage en ce moment
- Construire un argumentaire basé sur les données pour présenter ce gap au directeur
- Décider entre coaching, recadrage ou changement de rôle — avec les critères pour chaque option`
  },
  {
    id: "escalation-prep",
    category: "Communication exécutive",
    icon: "🚨",
    title: "Préparer une escalade vers la direction",
    when: "Quand un risque dépasse le niveau gestionnaire et doit être porté à la direction ou au CODIR",
    prompt: `Risque à escalader: [DESCRIPTION FACTUELLE]
Durée depuis la détection: [DÉLAI]
Interventions HRBP tentées: [CE QUI A ÉTÉ FAIT]
Résultat de ces interventions: [IMPACT OU NON-IMPACT]
Risque si non escaladé: [CONSÉQUENCE CONCRÈTE — LÉGALE / OPÉRATIONNELLE / CULTURELLE]

Construis une escalade en 3 niveaux:
1. Le message au directeur immédiat (informel — 2 minutes)
2. Le brief structuré pour le DRH ou VP (5 minutes — faits, risque, recommandation)
3. La note écrite si la situation doit être documentée formellement

Pour chaque niveau: quel est l'objectif exact? Qu'est-ce qu'on demande? Comment on mesure que l'escalade a fonctionné?`
  },
  {
    id: "hrbp-posture-check",
    category: "Stratégie hebdomadaire",
    icon: "🔎",
    title: "Auto-diagnostic HRBP — posture de la semaine",
    when: "Vendredi matin — 5 minutes pour calibrer la semaine suivante",
    prompt: `Cette semaine:
- Situations actives: [LISTE RAPIDE]
- Actions prises: [CE QUE J'AI FAIT]
- Actions reportées: [CE QUE J'AI ÉVITÉ]
- Dossier où j'ai reculé face à la résistance: [OUI/NON + LEQUEL]

Questions de calibration:
1. Sur quoi est-ce que j'ai joué le rôle d'amortisseur au lieu d'agent de changement?
2. Quel gestionnaire est en train de me gérer plutôt que l'inverse?
3. Où est-ce que j'ai pris en charge quelque chose qui appartient à un gestionnaire?
4. Quel risque est-ce que j'ai vu et que je n'ai pas nommé clairement?

Pour chaque point identifié — 1 action correctrice concrète pour la semaine prochaine.`
  }
];

// ── Category filters (Source: L.9383-9384) ───────────────────────────────────
const CONV_CATEGORIES = ["Tous", "Performance", "Leadership", "Rétention", "Relations de travail", "Stratégie RH", "Développement", "Gestion des absences"];
const PROMPT_CATEGORIES = ["Tous", "Stratégie hebdomadaire", "Coaching gestionnaires", "Situations difficiles", "Rétention", "Gestion de la performance", "Communication exécutive", "Diagnostic organisationnel"];

// ── Component (Source: L.9386-9664) ──────────────────────────────────────────
export default function ModuleConvKit() {
  const [tab, setTab]               = useState("conv");      // conv | prompts
  const [convCat, setConvCat]       = useState("Tous");
  const [promptCat, setPromptCat]   = useState("Tous");
  const [openId, setOpenId]         = useState(null);
  const [copied, setCopied]         = useState(null);
  const [search, setSearch]         = useState("");

  const copyText = (text, id) => {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    setCopied(id); setTimeout(() => setCopied(null), 2000);
  };

  const convFiltered = CONV_SITUATIONS.filter(s => {
    if (convCat !== "Tous" && s.category !== convCat) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) &&
        !s.situation.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const promptFiltered = PROMPT_LIBRARY.filter(p => {
    if (promptCat !== "Tous" && p.category !== promptCat) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) &&
        !p.when.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const CONV_FIELD_COLORS = {
    "SITUATION":  C.textD,
    "OUVERTURE":  C.em,
    "QUESTIONS":  C.blue,
    "PUSH":       C.red,
    "CLOSING":    C.amber,
  };

  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      {/* Header + tab switch */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Conversation Kit + Prompt Library</div>
          <div style={{ fontSize:12, color:C.textM }}>Scripts live · {CONV_SITUATIONS.length} situations · {PROMPT_LIBRARY.length} prompts</div>
        </div>
        <div style={{ display:"flex", background:C.surfL, borderRadius:8, padding:3, gap:2 }}>
          {[{id:"conv",label:"💬 Kit conversations"},{id:"prompts",label:"⚡ Prompt Library"}].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setOpenId(null); setSearch(""); }}
              style={{ padding:"6px 16px", borderRadius:6, fontSize:12, cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif", border:"none",
                background: tab===t.id ? C.em : "none",
                color: tab===t.id ? C.bg : C.textM,
                fontWeight: tab===t.id ? 700 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder={tab==="conv" ? "Rechercher une situation..." : "Rechercher un prompt..."}
        style={{ ...css.input, marginBottom:12, fontSize:12 }}
        onFocus={e=>e.target.style.borderColor=C.em+"60"}
        onBlur={e=>e.target.style.borderColor=C.border}/>

      {/* ── CONVERSATION KIT ─────────────────────────────────────────────── */}
      {tab === "conv" && (
        <>
          {/* Category pills */}
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
            {CONV_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setConvCat(cat)}
                style={{ padding:"4px 11px", borderRadius:5, fontSize:11, cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif", border:"none",
                  background: convCat===cat ? C.em+"22" : C.surfL,
                  color: convCat===cat ? C.em : C.textM,
                  fontWeight: convCat===cat ? 700 : 400,
                  outline: convCat===cat ? `1px solid ${C.em}50` : "none" }}>
                {cat}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {convFiltered.map(s => {
              const isOpen = openId === s.id;
              return (
                <div key={s.id} style={{ background:C.surfL,
                  border:`1px solid ${isOpen ? s.color+"55" : C.border}`,
                  borderLeft:`3px solid ${s.color}`, borderRadius:9, overflow:"hidden" }}>
                  {/* Header row */}
                  <button onClick={() => setOpenId(isOpen ? null : s.id)}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:12,
                      padding:"12px 14px", background:"none", border:"none", cursor:"pointer",
                      textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>{s.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:2 }}>{s.title}</div>
                      {!isOpen && (
                        <div style={{ fontSize:11, color:C.textM, overflow:"hidden",
                          textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:560 }}>
                          {s.situation}
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:7, alignItems:"center", flexShrink:0 }}>
                      <Badge label={s.category} color={s.color} size={9}/>
                      {isOpen && (
                        <button onClick={e => { e.stopPropagation();
                          const full = `SITUATION: ${s.situation}\n\nOUVERTURE: ${s.opening}\n\nQUESTIONS:\n${s.questions.map((q,i)=>`${i+1}. ${q}`).join("\n")}\n\nPUSH: ${s.push}\n\nCLOSING: ${s.closing}`;
                          copyText(full, s.id); }}
                          style={{ padding:"4px 10px", borderRadius:5, fontSize:10, cursor:"pointer",
                            fontFamily:"'DM Sans',sans-serif", fontWeight:600,
                            background: copied===s.id ? C.em+"22" : C.surfLL,
                            border:`1px solid ${copied===s.id ? C.em+"55" : C.border}`,
                            color: copied===s.id ? C.em : C.textD }}>
                          {copied===s.id ? "✓ Copié" : "📋"}
                        </button>
                      )}
                      <span style={{ color:C.textD, fontSize:11,
                        transform: isOpen ? "rotate(180deg)" : "none", display:"block" }}>▾</span>
                    </div>
                  </button>

                  {/* Expanded script */}
                  {isOpen && (
                    <div style={{ borderTop:`1px solid ${C.border}`, padding:"14px 16px",
                      display:"flex", flexDirection:"column", gap:12 }}>
                      {/* SITUATION */}
                      <div style={{ display:"flex", gap:10 }}>
                        <Mono color={CONV_FIELD_COLORS["SITUATION"]} size={8} style={{ flexShrink:0, paddingTop:2, width:72 }}>SITUATION</Mono>
                        <div style={{ fontSize:12, color:C.textM, lineHeight:1.65 }}>{s.situation}</div>
                      </div>
                      <Divider my={4}/>
                      {/* OUVERTURE */}
                      <div style={{ display:"flex", gap:10 }}>
                        <Mono color={CONV_FIELD_COLORS["OUVERTURE"]} size={8} style={{ flexShrink:0, paddingTop:2, width:72 }}>OUVERTURE</Mono>
                        <div style={{ fontSize:13, color:C.text, lineHeight:1.7,
                          background:C.em+"0a", borderLeft:`3px solid ${C.em}`,
                          padding:"8px 12px", borderRadius:"0 7px 7px 0", flex:1,
                          fontStyle:"italic" }}>
                          {s.opening}
                        </div>
                      </div>
                      <Divider my={4}/>
                      {/* QUESTIONS */}
                      <div style={{ display:"flex", gap:10 }}>
                        <Mono color={CONV_FIELD_COLORS["QUESTIONS"]} size={8} style={{ flexShrink:0, paddingTop:2, width:72 }}>QUESTIONS</Mono>
                        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                          {s.questions.map((q,i) => (
                            <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                              <div style={{ width:18, height:18, background:C.blue+"22",
                                border:`1px solid ${C.blue}44`, borderRadius:"50%", flexShrink:0,
                                display:"flex", alignItems:"center", justifyContent:"center",
                                fontSize:10, fontWeight:700, color:C.blue }}>{i+1}</div>
                              <div style={{ fontSize:13, color:C.text, lineHeight:1.65,
                                fontStyle:"italic" }}>"{q}"</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <Divider my={4}/>
                      {/* PUSH */}
                      <div style={{ display:"flex", gap:10 }}>
                        <Mono color={CONV_FIELD_COLORS["PUSH"]} size={8} style={{ flexShrink:0, paddingTop:2, width:72 }}>PUSH</Mono>
                        <div style={{ fontSize:13, color:C.text, lineHeight:1.7,
                          background:C.red+"0a", borderLeft:`3px solid ${C.red}`,
                          padding:"8px 12px", borderRadius:"0 7px 7px 0", flex:1,
                          fontStyle:"italic" }}>
                          {s.push}
                        </div>
                      </div>
                      <Divider my={4}/>
                      {/* CLOSING */}
                      <div style={{ display:"flex", gap:10 }}>
                        <Mono color={CONV_FIELD_COLORS["CLOSING"]} size={8} style={{ flexShrink:0, paddingTop:2, width:72 }}>CLOSING</Mono>
                        <div style={{ fontSize:12, color:C.textM, lineHeight:1.65 }}>{s.closing}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {convFiltered.length === 0 && (
              <div style={{ textAlign:"center", padding:"40px", color:C.textD, fontSize:13 }}>Aucune situation trouvée.</div>
            )}
          </div>
        </>
      )}

      {/* ── PROMPT LIBRARY ───────────────────────────────────────────────── */}
      {tab === "prompts" && (
        <>
          {/* Category pills */}
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
            {PROMPT_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setPromptCat(cat)}
                style={{ padding:"4px 11px", borderRadius:5, fontSize:11, cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif", border:"none",
                  background: promptCat===cat ? C.purple+"22" : C.surfL,
                  color: promptCat===cat ? C.purple : C.textM,
                  fontWeight: promptCat===cat ? 700 : 400,
                  outline: promptCat===cat ? `1px solid ${C.purple}50` : "none" }}>
                {cat}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {promptFiltered.map(p => {
              const isOpen = openId === p.id;
              return (
                <div key={p.id} style={{ background:C.surfL,
                  border:`1px solid ${isOpen ? C.purple+"55" : C.border}`,
                  borderLeft:`3px solid ${C.purple}`, borderRadius:9, overflow:"hidden" }}>
                  {/* Header */}
                  <button onClick={() => setOpenId(isOpen ? null : p.id)}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:12,
                      padding:"12px 14px", background:"none", border:"none", cursor:"pointer",
                      textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
                    <span style={{ fontSize:15, flexShrink:0 }}>{p.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:2 }}>{p.title}</div>
                      <div style={{ fontSize:11, color:C.textD }}>{p.when}</div>
                    </div>
                    <div style={{ display:"flex", gap:7, alignItems:"center", flexShrink:0 }}>
                      <Badge label={p.category} color={C.purple} size={9}/>
                      {isOpen && (
                        <button onClick={e => { e.stopPropagation(); copyText(p.prompt, p.id); }}
                          style={{ padding:"5px 12px", borderRadius:5, fontSize:11, cursor:"pointer",
                            fontFamily:"'DM Sans',sans-serif", fontWeight:700,
                            background: copied===p.id ? C.em : C.purple,
                            border:"none", color:"#fff" }}>
                          {copied===p.id ? "✓ Copié" : "📋 Copier"}
                        </button>
                      )}
                      <span style={{ color:C.textD, fontSize:11,
                        transform: isOpen ? "rotate(180deg)" : "none", display:"block" }}>▾</span>
                    </div>
                  </button>

                  {/* Prompt content */}
                  {isOpen && (
                    <div style={{ borderTop:`1px solid ${C.border}`, padding:"14px 16px" }}>
                      <div style={{ fontSize:11, color:C.purple, fontWeight:600,
                        marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                        <span>⏰</span>
                        <span>Quand l'utiliser :</span>
                        <span style={{ color:C.textM, fontWeight:400 }}>{p.when}</span>
                      </div>
                      <div style={{ background:C.bg, border:`1px solid ${C.border}`,
                        borderRadius:8, padding:"13px 15px",
                        fontSize:12, color:C.textM, lineHeight:1.8,
                        whiteSpace:"pre-wrap", fontFamily:"'DM Mono',monospace" }}>
                        {p.prompt}
                      </div>
                      <div style={{ marginTop:8, display:"flex", justifyContent:"flex-end" }}>
                        <button onClick={() => copyText(p.prompt, p.id)}
                          style={{ ...css.btn(copied===p.id ? C.em : C.purple),
                            padding:"7px 18px", fontSize:12 }}>
                          {copied===p.id ? "✓ Copié dans le presse-papier" : "📋 Copier le prompt"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {promptFiltered.length === 0 && (
              <div style={{ textAlign:"center", padding:"40px", color:C.textD, fontSize:13 }}>Aucun prompt trouvé.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
