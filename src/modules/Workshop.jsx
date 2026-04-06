// Source: HRBP_OS.jsx L.7325-8157
import { useState } from "react";
import { C, css } from '../theme.js';
import Badge from '../components/Badge.jsx';
import Mono from '../components/Mono.jsx';

// ── Data constant (Source: L.7325-7766) ──────────────────────────────────────
export const WORKSHOP_DB = [
  {
    id: "manager-evitant",
    category: "Leadership",
    icon: "🫥",
    color: C.amber,
    title: "Manager évitant",
    objective: "Un gestionnaire qui n'a pas ses conversations difficiles ne gère pas — il subit. Ton rôle : le forcer à reprendre le leadership qu'il délègue par défaut à l'HRBP.",
    whenToUse: [
      "Les problèmes d'équipe arrivent à l'HRBP avant d'avoir passé par le gestionnaire",
      "Les feedbacks ne sont jamais livrés ou sont si dilués qu'ils ne sont pas entendus",
      "L'équipe sait qu'elle peut ignorer les attentes sans conséquence",
      "Le gestionnaire 'attend le bon moment' depuis plus de 3 semaines",
    ],
    structure: [
      { step: "1. Nommer sans ménager", detail: "'Tu n'as pas eu cette conversation. Pendant ce temps, l'équipe le sait et ça affecte ta crédibilité comme gestionnaire.' Pas de métaphore." },
      { step: "2. Quantifier le coût de l'inaction", detail: "Qui s'est plaint ? Qui compense ? Qui risque de partir ? Rendre le coût de l'évitement plus douloureux que la conversation elle-même." },
      { step: "3. Bloquer la délégation à l'HRBP", detail: "'Ce n'est pas mon rôle de faire cette conversation à ta place. Je vais te préparer, mais c'est toi qui la fais.' Tenir cette ligne." },
      { step: "4. Fixer une date, pas une intention", detail: "'Tu as cette conversation d'ici jeudi. On se reparle vendredi matin.' Une date. Pas 'dès que possible'." },
      { step: "5. Responsabiliser sur le résultat", detail: "Si la conversation n'a pas eu lieu vendredi : escalader au supérieur. L'évitement du gestionnaire devient alors un enjeu de gestion de sa propre performance." },
    ],
    questions: [
      "Si tu savais que ça allait mal tourner, qu'est-ce que tu aurais fait différemment il y a 3 mois ?",
      "Pourquoi penses-tu que l'employé ne sait pas encore qu'il y a un problème ?",
      "Qu'est-ce que ça dit à ton équipe quand ce comportement n'a aucune conséquence ?",
      "Si c'était l'employé de ton pair qui faisait ça, qu'est-ce que tu lui conseillerais ?",
    ],
    signals: [
      "L'équipe contourne le gestionnaire — elle sait que ça ne sert à rien de lui parler",
      "Le gestionnaire sur-documente en privé mais ne dit jamais rien en face",
      "Chaque fois qu'on approche du sujet, il trouve une raison pour reporter",
      "L'HRBP reçoit les plaintes parce que 'le gestionnaire ne fera rien de toute façon'",
    ],
    mistakes: [
      "Faire la conversation à sa place — il n'apprend rien et ça recommence au prochain dossier",
      "Accepter 'j'en ai parlé brièvement' comme une conversation de feedback",
      "Lui donner un script trop propre — il faut qu'il soit inconfortable, c'est là qu'il grandit",
      "Ne pas escalader quand la date n'est pas respectée — tu valides l'évitement",
    ],
    actions: [
      { delay: "J0", action: "Nommer le pattern. Fixer une date non négociable pour la conversation." },
      { delay: "J+3", action: "Coaching de préparation : faits, impact, message clé. Pas de script complet." },
      { delay: "J+7", action: "Débriefer. La conversation a-t-elle eu lieu ? Si non : escalader au supérieur." },
    ],
  },
  {
    id: "conversation-difficile",
    category: "Leadership",
    icon: "💬",
    color: C.purple,
    title: "Conversation difficile",
    objective: "Un gestionnaire qui ne livre pas ses messages difficiles transfère son inconfort sur l'organisation. L'objectif n'est pas qu'il soit à l'aise — c'est qu'il soit efficace.",
    whenToUse: [
      "Le même sujet revient sans avoir été adressé depuis > 3 semaines",
      "Le gestionnaire veut que l'HRBP 'gère' la situation à sa place",
      "L'employé n'a aucune idée qu'il y a un problème malgré des mois de friction",
      "Une annonce difficile doit être faite et le gestionnaire cherche à la noyer dans du contexte",
    ],
    structure: [
      { step: "1. Clarifier l'intention réelle", detail: "'Qu'est-ce que tu veux que l'autre personne fasse différemment après cette conversation ?' Si le gestionnaire ne sait pas répondre, il n'est pas prêt." },
      { step: "2. Construire les faits — pas les impressions", detail: "3 faits. Récents. Observables. Non contestables. Tout ce qui est une interprétation est retiré du message." },
      { step: "3. L'ouverture en 10 secondes", detail: "'Je veux te parler de X. Ce que j'ai observé c'est Y. L'impact c'est Z.' Pas d'introduction. Pas de contexte qui noie le message principal." },
      { step: "4. Tenir face à la réaction", detail: "L'autre va se défendre, minimiser ou attaquer. La réponse correcte : 'Je comprends que c'est difficile à entendre. Mes observations restent les mêmes.'" },
      { step: "5. Conclure avec un engagement mesurable", detail: "'Voici ce que j'attends de toi d'ici 2 semaines. On fait le point le [date].' Pas de 'on verra' — une date et une attente précise." },
    ],
    questions: [
      "Si cette conversation n'a pas lieu, qu'est-ce qui se passe dans 30 jours ?",
      "Quelle est la différence entre ce que tu veux dire et ce que tu oses dire ?",
      "Tu m'as donné 3 exemples de comportement. Lequel as-tu adressé directement à cette personne ?",
      "Est-ce que tu cherches à résoudre le problème ou à éviter le conflit ?",
    ],
    signals: [
      "Le gestionnaire a 'essayé d'en parler' mais l'employé 'n'a pas compris' — message jamais livré clairement",
      "La conversation 'difficile' dure 45 minutes mais le message réel prend 2 minutes",
      "Le gestionnaire parle au 'nous' pour diluer sa responsabilité individuelle",
      "Il demande à l'HRBP d'être présent pour 'soutien' alors qu'il veut un témoin ou un bouclier",
    ],
    mistakes: [
      "Commencer par les points positifs — ça prépare l'autre à entendre 'mais', pas le message",
      "Mélanger 3 sujets dans une seule conversation — rien n'est retenu",
      "Terminer par 'on verra comment ça évolue' — aucun engagement, aucun suivi possible",
      "Appeler ça une conversation difficile alors que c'est juste une conversation inconfortable — normaliser",
    ],
    actions: [
      { delay: "Avant", action: "Préparer les 3 faits. Formuler le message en 30 secondes. Jouer la réaction la plus difficile." },
      { delay: "J0", action: "La conversation a lieu. HRBP absent sauf si risque légal ou sécurité." },
      { delay: "J+2", action: "Débriefer dans les 48h. Documenter ce qui a été dit et l'engagement pris." },
    ],
  },
  {
    id: "toxique-performant",
    category: "Relations de travail",
    icon: "⚡",
    color: C.red,
    title: "Employé performant mais toxique",
    objective: "Quand une organisation tolère un comportement toxique au nom de la performance, elle dit à tous les autres que les résultats justifient n'importe quoi. C'est le problème à résoudre — pas seulement le comportement d'un individu.",
    whenToUse: [
      "Plaintes récurrentes sur un même individu ignorées parce qu'il 'performe bien'",
      "Départs ou désengagements corrélés à la présence d'une seule personne",
      "Le gestionnaire utilise les résultats comme bouclier à chaque discussion RH",
      "La culture d'équipe se dégrade graduellement sans cause apparente unique",
    ],
    structure: [
      { step: "1. Construire le dossier d'impact", detail: "Pas des plaintes — des faits : qui a quitté, qui évite ce profil, quelle est la valeur collective perdue. Quantifier l'impact de garder cette personne." },
      { step: "2. Confronter le gestionnaire sur le vrai arbitrage", detail: "'Tu gardes 1 performant toxique. Tu perds 3 performants sains qui ne veulent plus travailler avec lui. C'est ça le calcul réel.' Forcer la décision consciente." },
      { step: "3. Conversation directe sur les comportements", detail: "Faits comportementaux précis, sans jugement de personnalité. Message non négociable : 'Ces comportements doivent cesser. Ce n'est pas une option.' Pas de nuance." },
      { step: "4. Plan comportemental serré", detail: "30-45 jours max. Comportements ciblés, observables. Conséquences explicites si récidive. Pas de deuxième avertissement informel." },
      { step: "5. Tolérance zéro sur la récidive", detail: "Un incident documenté post-plan = processus disciplinaire. Si le gestionnaire hésite : escalader. La crédibilité de l'organisation est en jeu." },
    ],
    questions: [
      "Si ses résultats étaient moyens, est-ce que ce comportement serait toléré depuis autant de temps ?",
      "Combien de personnes compétentes ont quitté ou se sont plaintes à cause de lui dans les 12 derniers mois ?",
      "Que dit ton silence à l'équipe qui observe et attend de voir ce que tu vas faire ?",
      "Si tu étais son supérieur, est-ce que tu trouverais que tu as géré cette situation correctement jusqu'ici ?",
    ],
    signals: [
      "Les autres high performers refusent de travailler avec lui sur des projets clés",
      "Le gestionnaire minimise chaque incident individuellement — refuse de voir le pattern",
      "L'employé sait qu'il est intouchable et calibre son comportement en conséquence",
      "L'équipe attend de voir si l'organisation a le courage d'agir — crédibilité RH en jeu",
    ],
    mistakes: [
      "Traiter chaque plainte séparément — l'individu s'en sort chaque fois, le pattern n'est jamais nommé",
      "Demander au gestionnaire s'il veut 'agir' — lui présenter la décision à prendre, pas une question ouverte",
      "Faire une conversation 'de mise en garde' sans conséquences documentées et date de revue — inutile",
      "Attendre une plainte formelle pour agir — à ce stade le dommage culturel est déjà fait",
    ],
    actions: [
      { delay: "J0", action: "Construire le dossier d'impact. Entretiens confidentiels, départs corrélés, pattern documenté." },
      { delay: "J+7", action: "Confrontation gestionnaire + HRBP : présenter l'arbitrage réel. Décision sur l'approche." },
      { delay: "J+14", action: "Conversation directe avec l'employé. Plan comportemental 30-45 jours. Conséquences explicites." },
    ],
  },
  {
    id: "flight-risk",
    category: "Rétention",
    icon: "✈",
    color: C.teal,
    title: "Flight risk / Rétention",
    objective: "Une rétention qui commence quand l'employé remet sa démission n'est pas une rétention — c'est une négociation de départ. L'intervention efficace se passe 3 mois avant.",
    whenToUse: [
      "Désengagement visible : retrait, baisse de qualité, absences inhabituelles",
      "Pair ayant quitté — l'effet d'entraînement est réel et sous-estimé",
      "Relation dégradée avec le gestionnaire non résolue depuis > 60 jours",
      "Changement organisationnel impactant le rôle sans conversation proactive",
    ],
    structure: [
      { step: "1. Scorer et prioriser", detail: "Impact du départ (1-5) × Probabilité (1-5). Agir seulement sur les scores ≥ 15. Ne pas diluer l'énergie sur tout le monde." },
      { step: "2. Diagnostiquer le bon levier", detail: "Rémunération ? Gestionnaire ? Croissance ? Sens ? Appartenance ? Cibler le mauvais levier = gaspiller des ressources et perdre la crédibilité de l'intervention." },
      { step: "3. Conversation directe — pas de fausse douceur", detail: "'Je veux m'assurer qu'on ne rate pas quelque chose d'important pour toi. Est-ce que tout va bien dans ton rôle en ce moment ?' Direct, pas condescendant." },
      { step: "4. Engagement concret sous 30 jours", detail: "Pas de promesse générique. Une action tangible, un délai court, un nom de responsable. L'employé doit sentir que quelque chose a bougé." },
      { step: "5. Réévaluer à 30 jours", detail: "Le score a-t-il changé ? Si non, l'action n'a pas fonctionné. Ajuster ou accepter le risque conscient." },
    ],
    questions: [
      "Qu'est-ce qui t'a donné le plus d'énergie dans ton travail ces 30 derniers jours ?",
      "Si tu pouvais changer une chose dans ton rôle ou ton équipe, ce serait quoi ?",
      "Est-ce qu'il y a quelque chose qu'on aurait dû faire différemment pour toi ces 6 derniers mois ?",
      "Comment tu vois la suite ici dans les 12-18 prochains mois ?",
    ],
    signals: [
      "Questions inhabituelles sur les avantages de départ, les vacances accumulées, les délais de préavis",
      "Profil LinkedIn mis à jour ou activité soudaine sur les réseaux professionnels",
      "Moins d'opinions, moins d'initiatives — l'employé ne se projette plus",
      "Gestionnaire dit 'il va bien' mais ne peut pas citer un exemple concret d'engagement récent",
    ],
    mistakes: [
      "Attendre que la démission soit remise — dans 80% des cas la décision est déjà prise",
      "Offrir une augmentation quand le problème est le gestionnaire — ça achète 3 mois au mieux",
      "Demander au gestionnaire de faire la rétention quand le gestionnaire EST le problème",
      "Promettre quelque chose de conditionnel : 'Si tu restes, on va voir...' — détruit la confiance",
    ],
    actions: [
      { delay: "J0", action: "Scorer le risque. Identifier le levier. Décider qui fait la conversation." },
      { delay: "J+3", action: "Conversation de rétention. Écoute réelle, pas de script. Identifier l'action concrète." },
      { delay: "J+30", action: "Réévaluer le score. L'action a-t-elle changé quelque chose ? Ajuster ou clore." },
    ],
  },
  {
    id: "manager-protege-low-performer",
    category: "Performance",
    icon: "🛡",
    color: C.amber,
    title: "Manager qui protège un low performer",
    objective: "Un gestionnaire qui couvre un sous-performant prend une décision organisationnelle qu'il n'a pas l'autorité de prendre seul. Ton rôle : rendre ce choix explicite et le lui faire assumer.",
    whenToUse: [
      "Sous-performance documentée depuis > 6 mois sans plan formel",
      "Le gestionnaire change le cadrage à chaque discussion : 'il s'améliore', 'c'est une période difficile'",
      "L'équipe porte la charge du sous-performant sans reconnaissance ni fin en vue",
      "Lien personnel ou amical visible entre le gestionnaire et l'employé",
    ],
    structure: [
      { step: "1. Forcer le diagnostic honnête", detail: "'Si cet employé était dans l'équipe de ton pair, qu'est-ce que tu lui conseillerais de faire ?' Sortir le gestionnaire de sa relation personnelle avec le dossier." },
      { step: "2. Présenter le coût réel à l'équipe", detail: "Nommer qui compense, depuis combien de temps, quel impact sur l'engagement. Ce n'est pas juste un problème individuel — c'est un problème d'équipe que le gestionnaire crée activement." },
      { step: "3. Recadrer la responsabilité", detail: "'En protégeant cet employé, tu lui rends un mauvais service à lui aussi. Il mérite un feedback honnête, pas de la protection.' Retourner l'argument de la loyauté." },
      { step: "4. Co-construire le plan — sans laisser le choix de ne pas en avoir un", detail: "Plan de performance co-rédigé. Critères mesurables. Délai non négociable. Si le gestionnaire refuse : escalader au supérieur comme problème de gestion de sa propre performance." },
      { step: "5. Check-ins rapprochés avec l'HRBP", detail: "Bihebdomadaire pendant le plan. Si le gestionnaire continue de couvrir ou de minimiser : documenter et escalader." },
    ],
    questions: [
      "Qu'est-ce qui t'empêche de mettre ce plan en place cette semaine — pas dans 2 semaines ?",
      "Comment les autres membres de l'équipe parlent de cette situation entre eux, selon toi ?",
      "Depuis combien de temps cet employé sait-il qu'il y a un problème avec sa performance ?",
      "Si tu n'agis pas, quelle décision tu prends par défaut pour ton équipe ?",
    ],
    signals: [
      "Documentation absente malgré des discussions HRBP répétées — le gestionnaire ne veut pas de traces",
      "Les autres membres d'équipe ont commencé à compenser sans jamais se plaindre formellement",
      "Le gestionnaire sous-documente ou réencadre les incidents pour protéger l'employé",
      "Chaque feedback donné est accompagné d'une excuse qui efface le message",
    ],
    mistakes: [
      "Faire confiance à 'la prochaine revue' sans date ni critère — ça ne viendra jamais",
      "Traiter ça comme un problème de l'employé — c'est d'abord un problème du gestionnaire",
      "Ne pas impliquer le supérieur si le pattern dure > 3 mois malgré les discussions",
      "Oublier que l'employé a droit à un feedback honnête — le protéger lui nuit aussi",
    ],
    actions: [
      { delay: "J0", action: "Confrontation gestionnaire : nommer le pattern, présenter le coût à l'équipe, demander un plan cette semaine." },
      { delay: "J+7", action: "Plan co-rédigé si pas remis. Critères, délai, conséquences. Aucune zone grise." },
      { delay: "J+14", action: "Premier check-in. Si le gestionnaire continue de couvrir : escalader au supérieur." },
    ],
  },
  {
    id: "conflit-employes",
    category: "Relations de travail",
    icon: "⚔",
    color: C.red,
    title: "Conflit entre deux employés",
    objective: "Un conflit non géré n'est jamais statique — il s'aggrave, se polarise et finit par coûter des départs ou des plaintes formelles. L'objectif est une résolution rapide, pas une réconciliation forcée.",
    whenToUse: [
      "Tension visible affectant la productivité ou la collaboration depuis > 4 semaines",
      "Gestionnaire prend parti ou ignore pour 'ne pas s'impliquer'",
      "Refus de collaborer documenté ou altercations rapportées",
      "L'HRBP apprend le conflit par une tierce personne — le gestionnaire ne l'a pas remonté",
    ],
    structure: [
      { step: "1. Entretiens individuels séparés — toujours", detail: "Jamais les deux ensemble avant d'avoir les deux versions séparément. Écouter sans prendre parti. Identifier ce qui est factuel et ce qui est perçu." },
      { step: "2. Évaluer : médiation ou enquête", detail: "Malentendu ou différend de style → médiation. Comportement grave ou allégation → enquête formelle. Ne pas médiatiser ce qui mérite une enquête." },
      { step: "3. Session conjointe (si médiation)", detail: "Cadre non négociable dès l'ouverture : règles, objectif, ce qui est acceptable ou non. Chaque partie exprime son besoin — pas son grief." },
      { step: "4. Engagements comportementaux mutuels", detail: "2-3 comportements concrets de chaque côté. Documentés. Pas de 'faire des efforts' — des actes observables." },
      { step: "5. Suivi à 2 semaines", detail: "La résolution tient ou non. Si non : directive managériale directe ou processus formel. Pas de troisième chance informelle." },
    ],
    questions: [
      "Décris-moi un incident précis — pas une tendance générale, un événement spécifique.",
      "Qu'est-ce que tu as besoin que l'autre arrête de faire ? Commence à faire ?",
      "As-tu déjà dit directement à cette personne ce que tu m'as dit là ?",
      "Qu'est-ce qui serait suffisant pour toi pour considérer que la situation est résolue ?",
    ],
    signals: [
      "Le conflit recrute des alliés — l'équipe se polarise autour de deux camps",
      "L'une des parties a commencé à documenter les interactions sans en parler à personne",
      "Le gestionnaire dit 'c'est personnel' pour justifier de ne pas intervenir — erreur",
      "Les deux personnes fonctionnent mais s'évitent activement — ça tient jusqu'à ce que ça lâche",
    ],
    mistakes: [
      "Mettre les deux personnes ensemble dès la première conversation — sans préparation, ça empire",
      "Chercher qui a tort au lieu de chercher comment les deux peuvent travailler ensemble",
      "Croire que le temps règle les conflits — sans intervention, ils s'enkystent et coûtent plus cher",
      "Ne pas documenter la session de médiation — si ça revient, il n'y a aucune trace",
    ],
    actions: [
      { delay: "J0-J+3", action: "Entretiens individuels séparés. Évaluer la nature du conflit. Décider : médiation ou enquête." },
      { delay: "J+7", action: "Session conjointe ou enquête formelle. Engagements documentés." },
      { delay: "J+21", action: "Vérifier si les engagements tiennent. Escalader si récidive." },
    ],
  },
  {
    id: "pip",
    category: "Performance",
    icon: "📉",
    color: C.amber,
    title: "PIP / Démarche corrective",
    objective: "Un PIP mal exécuté est pire qu'aucun PIP. Il donne une fausse impression de gestion tout en fragilisant la position légale. Un PIP réel : objectifs mesurables, suivi hebdomadaire, conséquences explicites.",
    whenToUse: [
      "Feedbacks informels documentés sans amélioration depuis > 60 jours",
      "Écart objectif entre les attentes du poste et la performance réelle",
      "Avant d'envisager une terminaison — le PIP est le dernier filet légal",
      "Après avoir validé que les causes systémiques ne sont pas le problème (outils, clarté, charge)",
    ],
    structure: [
      { step: "1. Valider que c'est le bon outil", detail: "Un PIP ne règle pas un mauvais recrutement, un rôle mal défini ou un gestionnaire qui n'a jamais livré de feedback. Ces problèmes ont d'autres réponses." },
      { step: "2. Rédiger des objectifs non contestables", detail: "SMART, avec métriques, délai 30-90 jours. Tout objectif subjectif sera contesté en cas de terminaison. L'HRBP revoit et valide avant la remise." },
      { step: "3. Remise en présence de l'HRBP", detail: "Gestionnaire + HRBP. Lire le document ensemble. L'employé n'a pas à être d'accord — mais doit le recevoir formellement. Documenter la remise." },
      { step: "4. Suivis hebdomadaires sans exception", detail: "Si le suivi saute, le PIP n'existe plus dans les faits. Chaque check-in : progrès documenté, ou écart documenté. Pas de zone grise." },
      { step: "5. Clôture sans ambiguïté", detail: "Succès → lever formellement par écrit. Échec → processus de terminaison avec dossier complet. Pas de prolongation informelle qui fragilise la position légale." },
    ],
    questions: [
      "Cet objectif peut-il être mesuré par un tiers qui ne connaît pas l'employé ? Si non, le reformuler.",
      "Est-ce que l'employé a un historique de feedbacks documentés qui justifie ce niveau d'intervention ?",
      "Si cet employé est terminé en fin de PIP, ce dossier tient-il devant une contestation légale ?",
      "Le gestionnaire est-il prêt à faire les suivis hebdomadaires sans exception ? Sinon, qui le fait ?",
    ],
    signals: [
      "Le PIP est rédigé en 20 minutes — les objectifs sont vagues, le risque légal est élevé",
      "Le gestionnaire fait 1 suivi puis disparaît jusqu'à la fin du délai",
      "L'employé n'avait aucun feedback documenté avant le PIP — position légale fragile",
      "Le plan est présenté comme une 'surprise totale' pour l'employé — signal que rien n'a été dit avant",
    ],
    mistakes: [
      "Objectifs non mesurables : 'améliorer son attitude', 'être plus proactif', 'mieux communiquer'",
      "Aucun suivi intermédiaire — contact seulement à la fin du délai, quand il est trop tard",
      "Prolonger le PIP parce que 'il s'améliore un peu' — sans critère de succès clair, ça dure indéfiniment",
      "Traiter le PIP comme une formalité administrative — l'employé le ressent et l'engagement chute davantage",
    ],
    actions: [
      { delay: "J-7", action: "Valider le dossier antérieur. Co-rédiger les objectifs avec le gestionnaire. Revue HRBP obligatoire." },
      { delay: "J0", action: "Remise formelle. Gestionnaire + HRBP présents. Documenter la date et les présents." },
      { delay: "Hebdo", action: "Check-in gestionnaire → HRBP. Documenter progrès ou écarts. Sans exception." },
    ],
  },
  {
    id: "promotion-bloquee",
    category: "Développement",
    icon: "🚧",
    color: C.blue,
    title: "Promotion bloquée",
    objective: "Un employé méritant à qui on ne dit pas la vérité finit par partir. L'objectif : transparence totale sur le blocage réel, plan concret ou alternative honnête — jamais de faux espoir.",
    whenToUse: [
      "Employé performant qui exprime sa frustration face à l'absence de progression depuis > 2 cycles",
      "Gestionnaire qui reconnaît le talent mais 'attend le bon moment' depuis 12 mois",
      "Candidature interne refusée sans explication claire livrée à l'employé",
      "Risque de départ lié au sentiment de stagnation malgré la performance",
    ],
    structure: [
      { step: "1. Nommer le blocage réel sans ambiguïté", detail: "Budget ? Structure ? Poste inexistant ? Gestionnaire qui retient ? Feedback de développement jamais livré ? Chaque cause a une réponse différente et l'employé mérite de la connaître." },
      { step: "2. Conversation de transparence radicale", detail: "'Voici où tu en es. Voici ce qui manque encore. Voici le délai réaliste.' Aucune fausse espérance, aucun 'bientôt', aucun 'on va voir'." },
      { step: "3. Challenger le gestionnaire qui retient", detail: "'Si ce profil avait ce niveau dans une autre équipe, où serait-il ?' Forcer la confrontation avec la réalité du marché. Retenir un talent pour des raisons opérationnelles est une décision consciente avec un coût." },
      { step: "4. Plan de développement avec jalons mesurables", detail: "2-3 jalons concrets pour 6-12 mois. Pas 'être plus visible' — 'livrer X projet, prendre X responsabilité, démontrer Y compétence à l'occasion Z'." },
      { step: "5. Alternative concrète si délai > 12 mois", detail: "Mobilité interne, rôle élargi, responsabilité additionnelle, rémunération ajustée. Quelque chose de tangible. Sinon : accepter que l'employé parte et agir en conséquence." },
    ],
    questions: [
      "Qu'est-ce qu'on t'a dit concrètement sur ce qui bloque ta progression — pas ce que tu penses, ce qu'on t'a dit ?",
      "Si tu faisais le même travail dans une autre organisation, quel titre aurais-tu ?",
      "Qu'est-ce qui te ferait choisir de rester si la promotion ne peut pas venir avant 12 mois ?",
      "Gestionnaire : si cet employé est dans l'équipe d'un concurrent dans 6 mois, comment tu expliques ça à ton propre supérieur ?",
    ],
    signals: [
      "L'employé ne croit plus aux promesses — chaque conversation devient une transaction sans valeur",
      "Le gestionnaire dit 'il est prêt' mais ne fait aucun geste pour débloquer — inaction active",
      "L'employé a appliqué en interne, été refusé, et n'a reçu aucune explication claire",
      "Pairs promus sans critères expliqués — sentiment d'arbitraire qui accélère le désengagement",
    ],
    mistakes: [
      "Promettre 'la prochaine fois' sans critères ni délai — détruit définitivement la confiance",
      "Laisser le gestionnaire gérer seul une conversation sur une promotion qu'il bloque lui-même",
      "Confondre 'l'employé est prêt' et 'le poste existe' — deux problèmes, deux solutions différentes",
      "Ignorer le risque de départ parce que 'c'est le budget qui décide' — le budget n'est pas responsable, les personnes le sont",
    ],
    actions: [
      { delay: "J0", action: "Diagnostic du blocage réel avec le gestionnaire. Pas d'interprétation — les faits." },
      { delay: "J+7", action: "Conversation transparente avec l'employé. Situation réelle, délai honnête, alternative concrète si applicable." },
      { delay: "J+14", action: "Plan de développement formalisé. Jalons mesurables. Date de revue dans le calendrier." },
    ],
  },
  {
    id: "manager-sous-pression",
    category: "Leadership",
    icon: "🔥",
    color: C.purple,
    title: "Manager sous pression",
    objective: "Un gestionnaire en surcharge qui ne le dit pas finit par le montrer — irritabilité, décisions réactives, équipe déstabilisée. L'objectif : détecter tôt et agir avant que la pression devienne un problème d'équipe.",
    whenToUse: [
      "Signaux comportementaux : irritabilité, erreurs inhabituelles, annulations de 1:1 en série",
      "Gestionnaire absorbé par la livraison et qui a arrêté de gérer son équipe",
      "Retour d'équipe négatif sur l'accessibilité ou la qualité des décisions",
      "Période de crise organisationnelle absorbée sans ressources additionnelles",
    ],
    structure: [
      { step: "1. Ouvrir l'espace sans agenda", detail: "'Comment tu vas, toi — pas l'équipe, toi.' Première conversation sans solution, sans évaluation. Si le gestionnaire sent qu'il va être jugé, il ne dira rien." },
      { step: "2. Cartographier la source réelle", detail: "Volume ? Complexité ? Attentes floues ? Manque de ressources ? Relation avec son propre supérieur ? Chaque cause a une réponse différente." },
      { step: "3. Séparer urgent/structurel/inutile", detail: "Qu'est-ce qui doit être fait par lui ? Par quelqu'un d'autre ? Par personne ? La clarification seule réduit souvent la charge perçue de 20-30%." },
      { step: "4. Impliquer le supérieur si nécessaire", detail: "Si la pression vient des attentes du supérieur hiérarchique : l'HRBP facilite la conversation vers le haut. Ce n'est pas la responsabilité seule du gestionnaire de négocier ses ressources." },
      { step: "5. Plan de décharge tangible sous 2 semaines", detail: "Délégation forcée ? Ressource additionnelle ? Report de délai négocié ? Nommer 1-2 actions concrètes. Pas un plan de bien-être — une réduction réelle de charge." },
    ],
    questions: [
      "Sur une échelle de 1 à 10, ton niveau d'énergie moyen ces 30 derniers jours — sans arrondir.",
      "Qu'est-ce que tu portes en ce moment que tu n'aurais pas dû prendre ou que tu pourrais arrêter ?",
      "Est-ce que ton supérieur sait dans quel état tu es ? Sinon, pourquoi pas ?",
      "Qu'est-ce que j'aurais dû voir plus tôt comme HRBP pour détecter ça avant aujourd'hui ?",
    ],
    signals: [
      "Le gestionnaire annule ses 1:1 avec l'équipe 'parce qu'il n'a pas le temps' — premier signal clair",
      "Décisions prises en réaction, sans consultation, dont il doit revenir en arrière",
      "L'équipe commence à contourner le gestionnaire — elle cherche de la stabilité ailleurs",
      "Le gestionnaire se compare négativement à ses pairs ou minimise sa propre charge publiquement",
    ],
    mistakes: [
      "Attendre que la situation devienne une crise — à ce stade l'équipe a déjà absorbé les dommages",
      "Proposer uniquement du coaching comme réponse à un problème structurel de charge",
      "Normaliser : 'C'est intense pour tout le monde' — vrai, mais ça ne règle rien",
      "Oublier l'équipe dans l'équation — la pression du gestionnaire se transfère toujours vers le bas",
    ],
    actions: [
      { delay: "Cette semaine", action: "Conversation d'écoute HRBP → gestionnaire. Cartographier la source de pression." },
      { delay: "J+7", action: "Identifier 1-2 actions de décharge concrètes. Impliquer le supérieur si la pression vient de lui." },
      { delay: "J+21", action: "Suivi : la situation a-t-elle changé ? Ajuster le plan ou escalader si stagnation." },
    ],
  },
  {
    id: "retour-travail",
    category: "Gestion des absences",
    icon: "🌱",
    color: C.em,
    title: "Retour au travail / Arrêt maladie",
    objective: "Un retour mal structuré génère une rechute dans 40% des cas. L'objectif : un retour progressif, réel, avec des ajustements concrets — pas un retour 'de principe' pour vider le dossier.",
    whenToUse: [
      "Retour après arrêt santé mentale (burnout, anxiété, dépression) — cas le plus fréquent",
      "Retour après arrêt physique avec limitations fonctionnelles documentées",
      "Retour CNESST avec obligations légales d'accommodement",
      "Tout arrêt > 4 semaines, quelle qu'en soit la nature",
    ],
    structure: [
      { step: "1. Contact avant le retour — obligatoire", detail: "Appel HRBP à J-7 minimum. Pas d'attentes professionnelles. Objectif : prendre des nouvelles et confirmer que le terrain est préparé." },
      { step: "2. Réunion de retour tripartite", detail: "HRBP + gestionnaire + employé. Clarifier : limitations, horaire progressif, adaptations du poste, ce que l'équipe sait et ne sait pas." },
      { step: "3. Plan de retour progressif non négociable", detail: "Heures graduelles si médecin l'indique. Tâches adaptées. Aucune pression implicite de 'rattraper'. Le gestionnaire doit le comprendre explicitement." },
      { step: "4. Préparer le gestionnaire à préparer l'équipe", detail: "Communication à l'équipe sans détails médicaux : 'X revient progressivement. On s'adapte.' Le gestionnaire, pas l'HRBP, fait cette communication." },
      { step: "5. Suivi rapproché J+30 minimum", detail: "Check-ins réguliers HRBP + employé. Les premiers signaux de rechute sont subtils. Documenter chaque étape — CNESST ou non." },
    ],
    questions: [
      "Comment tu te sens par rapport à l'idée de revenir — pas par rapport à ton état de santé général, mais à l'idée spécifique de retourner au travail ?",
      "Y a-t-il quelque chose dans ton environnement de travail qui t'inquiète pour le retour ?",
      "Qu'est-ce que tu ne veux pas que je partage avec ton gestionnaire ?",
      "Gestionnaire : qu'est-ce que tu vas changer concrètement pour que ce retour soit différent de l'avant-départ ?",
    ],
    signals: [
      "L'employé dit 'je vais bien' mais montre une anxiété visible à la moindre pression ou questionnement",
      "Le gestionnaire remet la pression de la charge dès la première ou deuxième semaine",
      "L'équipe ne sait pas comment se comporter — le silence crée un malaise que l'employé ressent",
      "L'employé isole progressivement — mange seul, évite les interactions, réduit ses communications",
    ],
    mistakes: [
      "Accueillir l'employé directement sur ses dossiers en retard dès le jour 1 — rechute probable",
      "Ne pas préparer l'équipe — le silence génère des rumeurs et un malaise involontaire",
      "Considérer le retour comme 'réglé' parce que l'employé est physiquement présent",
      "Ignorer les obligations CNESST par méconnaissance ou commodité — risque légal direct",
    ],
    actions: [
      { delay: "J-7", action: "Appel HRBP → employé. Prendre des nouvelles. Préparer la réunion de retour." },
      { delay: "J0", action: "Réunion tripartite. Plan de retour signé. Briefing équipe par le gestionnaire." },
      { delay: "Hebdo J+30", action: "Check-ins HRBP + employé. Ajuster le plan si signaux. Documenter chaque étape." },
    ],
  },
];

// ── Component (Source: L.7769-8157) ──────────────────────────────────────────
export default function ModuleWorkshop() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [openId, setOpenId] = useState(null);
  const [activeSection, setActiveSection] = useState({});

  // ── Coach Me state
  const [coachId, setCoachId] = useState(null);
  const [coachSit, setCoachSit] = useState({});
  const [coachCtx, setCoachCtx] = useState({});
  const [coachMgr, setCoachMgr] = useState({});
  const [coachPrompt, setCoachPrompt] = useState({});
  const [coachCopied, setCoachCopied] = useState(null);

  const buildPrompt = (w, situation, context, manager) => {
    const steps = w.structure.map((s,i) => `  ${s.step}: ${s.detail}`).join("\n");
    const questions = w.questions.map(q => `  - "${q}"`).join("\n");
    const signals = w.signals.map(s => `  - ${s}`).join("\n");
    const mistakes = w.mistakes.map(m => `  - ${m}`).join("\n");
    const actions = w.actions.map(a => `  [${a.delay}] ${a.action}`).join("\n");

    return `You are a senior HRBP advisor operating at executive level, with deep expertise in tech/corporate environments (Quebec/Canada context).

## SITUATION
${situation}
${context ? `\n## ADDITIONAL CONTEXT\n${context}` : ""}
${manager ? `\n## MANAGER PROFILE\n${manager}` : ""}

## INTERVENTION FRAMEWORK: ${w.title.toUpperCase()}
Objective: ${w.objective}

Structure:
${steps}

Key questions to use:
${questions}

Warning signals to watch for:
${signals}

Common HRBP mistakes to avoid:
${mistakes}

Action plan reference:
${actions}

---

## YOUR TASK

Using the intervention framework above as your operating model, analyze this situation and provide:

1. **DIAGNOSIS** — What is really happening here? What is the root cause vs. the symptom?

2. **RISK ASSESSMENT** — Legal, relational, organizational, and retention risks if not addressed now.

3. **HRBP POSTURE** — What is my role in this situation? What should I own vs. what belongs to the manager?

4. **CONVERSATION PLAN** — Step-by-step plan for the next HRBP conversation (who, when, what objective, what outcome).

5. **READY-TO-USE SCRIPT** — Give me exact opening lines and key phrases I can use in French. Be direct, not diplomatic.

6. **SIGNALS TO MONITOR** — What are the 3 concrete indicators that tell me the situation is improving or deteriorating?

7. **NEXT ACTIONS** — 3 prioritized actions with realistic deadlines for the next 2 weeks.

Be direct. Be challenging. Do not soften the diagnosis. I need to act, not reflect.`;
  };

  const generateCoachPrompt = (w) => {
    const sit = coachSit[w.id] || "";
    if (!sit.trim()) return;
    const prompt = buildPrompt(w, sit, coachCtx[w.id] || "", coachMgr[w.id] || "");
    setCoachPrompt(p => ({ ...p, [w.id]: prompt }));
  };

  const copyCoachPrompt = (id) => {
    const text = coachPrompt[id];
    if (!text) return;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCoachCopied(id);
    setTimeout(() => setCoachCopied(null), 2500);
  };

  const toggleCoach = (id) => {
    setCoachId(prev => prev === id ? null : id);
    setCoachPrompt(p => ({ ...p, [id]: "" }));
  };

  const categories = ["Tous", ...Array.from(new Set(WORKSHOP_DB.map(w => w.category)))];

  const filtered = WORKSHOP_DB.filter(w => {
    const matchCat = activeCategory === "Tous" || w.category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = !q || w.title.toLowerCase().includes(q)
      || w.objective.toLowerCase().includes(q)
      || w.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const toggle = (id) => {
    setOpenId(prev => prev === id ? null : id);
    setActiveSection(prev => ({ ...prev, [id]: prev[id] || "objective" }));
  };

  const SECTIONS = [
    { id:"objective", label:"Objectif" },
    { id:"whenToUse", label:"Quand l'utiliser" },
    { id:"structure", label:"Structure" },
    { id:"questions", label:"Questions clés" },
    { id:"signals",   label:"Signaux d'alerte" },
    { id:"mistakes",  label:"Erreurs fréquentes" },
    { id:"actions",   label:"Plan d'action" },
  ];

  const DELAY_COLORS = { "J0":"#2a9d8f", "J-5":"#6366f1", "J-7":"#6366f1", "J-14":"#6366f1", "Avant":"#6366f1", "Hebdo":C.blue, "Continu":C.blue };
  const delayColor = (d) => DELAY_COLORS[d] || C.amber;

  const renderSection = (w, sec) => {
    switch(sec) {
      case "objective":
        return <div style={{ fontSize:13, color:C.text, lineHeight:1.75 }}>{w.objective}</div>;
      case "whenToUse":
        return <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {w.whenToUse.map((item,i) => (
            <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
              <span style={{ color:w.color, fontSize:11, marginTop:2, flexShrink:0 }}>▸</span>
              <span style={{ fontSize:13, color:C.text, lineHeight:1.65 }}>{item}</span>
            </div>
          ))}
        </div>;
      case "structure":
        return <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {w.structure.map((s,i) => (
            <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start",
              padding:"10px 12px", background:w.color+"08", borderRadius:8,
              borderLeft:`3px solid ${w.color}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:w.color, whiteSpace:"nowrap",
                fontFamily:"'DM Mono',monospace", flexShrink:0, marginTop:1 }}>{s.step}</div>
              <div style={{ fontSize:12, color:C.textM, lineHeight:1.65 }}>{s.detail}</div>
            </div>
          ))}
        </div>;
      case "questions":
        return <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {w.questions.map((q,i) => (
            <div key={i} style={{ display:"flex", gap:10, padding:"9px 12px",
              background:C.surfLL, borderRadius:7, alignItems:"flex-start" }}>
              <span style={{ color:w.color, fontStyle:"normal", fontSize:13, flexShrink:0 }}>Q</span>
              <span style={{ fontSize:13, color:C.text, lineHeight:1.65, fontStyle:"italic" }}>"{q}"</span>
            </div>
          ))}
        </div>;
      case "signals":
        return <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {w.signals.map((s,i) => (
            <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
              <span style={{ color:C.amber, fontSize:12, flexShrink:0, marginTop:1 }}>⚠</span>
              <span style={{ fontSize:13, color:C.text, lineHeight:1.65 }}>{s}</span>
            </div>
          ))}
        </div>;
      case "mistakes":
        return <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {w.mistakes.map((m,i) => (
            <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
              <span style={{ color:C.red, fontSize:12, flexShrink:0, marginTop:1 }}>✕</span>
              <span style={{ fontSize:13, color:C.text, lineHeight:1.65 }}>{m}</span>
            </div>
          ))}
        </div>;
      case "actions":
        return <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {w.actions.map((a,i) => (
            <div key={i} style={{ display:"flex", gap:12, alignItems:"center",
              padding:"9px 12px", background:C.surfL, borderRadius:7 }}>
              <div style={{ background:delayColor(a.delay)+"20", border:`1px solid ${delayColor(a.delay)}40`,
                color:delayColor(a.delay), borderRadius:5, padding:"3px 8px",
                fontSize:10, fontWeight:700, fontFamily:"'DM Mono',monospace",
                whiteSpace:"nowrap", flexShrink:0 }}>{a.delay}</div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{a.action}</div>
            </div>
          ))}
        </div>;
      default: return null;
    }
  };

  return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Playbooks HRBP</div>
        <div style={{ fontSize:12, color:C.textM }}>{WORKSHOP_DB.length} playbooks disponibles — approches pratiques pour situations courantes</div>
      </div>

      {/* Search + filters */}
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un playbook..."
          style={{ ...css.input, flex:1, minWidth:200 }}
          onFocus={e=>e.target.style.borderColor=C.em+"60"}
          onBlur={e=>e.target.style.borderColor=C.border}
        />
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              style={{ padding:"7px 14px", borderRadius:7, fontSize:12, cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif", transition:"all .15s",
                background: activeCategory===cat ? C.em+"18" : "none",
                border:`1px solid ${activeCategory===cat ? C.em+"55" : C.border}`,
                color: activeCategory===cat ? C.em : C.textM,
                fontWeight: activeCategory===cat ? 600 : 400 }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:C.textD }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
          <div style={{ fontSize:14, marginBottom:6 }}>Aucun playbook trouvé</div>
          <div style={{ fontSize:12 }}>Essaie un autre terme ou réinitialise les filtres</div>
        </div>
      )}

      {/* Workshop cards */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.map(w => {
          const isOpen = openId === w.id;
          const sec = activeSection[w.id] || "objective";
          return (
            <div key={w.id} style={{ background:C.surfL, border:`1px solid ${isOpen ? w.color+"55" : C.border}`,
              borderLeft:`3px solid ${w.color}`, borderRadius:10, overflow:"hidden",
              transition:"border-color .2s" }}>

              {/* Card header — always visible */}
              <button onClick={() => toggle(w.id)}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:14,
                  padding:"14px 16px", background:"none", border:"none", cursor:"pointer",
                  textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}
                onMouseEnter={e=>e.currentTarget.style.background=w.color+"08"}
                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                <span style={{ fontSize:18, flexShrink:0 }}>{w.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:3 }}>{w.title}</div>
                  {!isOpen && (
                    <div style={{ fontSize:12, color:C.textM, lineHeight:1.5,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:580 }}>
                      {w.objective}
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
                  <Badge label={w.category} color={w.color} size={10}/>
                  <button onClick={e => { e.stopPropagation(); toggleCoach(w.id); if (!isOpen) toggle(w.id); }}
                    style={{ padding:"5px 12px", borderRadius:6, fontSize:11, cursor:"pointer",
                      fontFamily:"'DM Sans',sans-serif", fontWeight:600,
                      background: coachId===w.id ? C.purple+"22" : "none",
                      border:`1px solid ${coachId===w.id ? C.purple+"66" : C.border}`,
                      color: coachId===w.id ? C.purple : C.textM,
                      transition:"all .15s" }}>
                    {coachId===w.id ? "✕ Fermer" : "🤖 Coach me"}
                  </button>
                  <span style={{ color:C.textD, fontSize:12, transition:"transform .2s",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", display:"block" }}>▾</span>
                </div>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div style={{ borderTop:`1px solid ${C.border}` }}>
                  {/* Section tabs */}
                  <div style={{ display:"flex", gap:0, overflowX:"auto",
                    borderBottom:`1px solid ${C.border}`, background:C.bg }}>
                    {SECTIONS.map(s => (
                      <button key={s.id} onClick={() => setActiveSection(p => ({...p, [w.id]: s.id}))}
                        style={{ padding:"8px 14px", fontSize:11, cursor:"pointer", whiteSpace:"nowrap",
                          background:"none", border:"none", fontFamily:"'DM Sans',sans-serif",
                          fontWeight: sec===s.id ? 700 : 400,
                          color: sec===s.id ? w.color : C.textM,
                          borderBottom:`2px solid ${sec===s.id ? w.color : "transparent"}`,
                          marginBottom:-1, transition:"color .15s" }}>
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Section content */}
                  <div style={{ padding:"18px 20px" }}>
                    {renderSection(w, sec)}
                  </div>
                </div>
              )}

              {/* ── COACH ME PANEL */}
              {coachId === w.id && (
                <div style={{ borderTop:`2px solid ${C.purple}`, background:C.purple+"06",
                  padding:"20px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                    <div style={{ width:28, height:28, background:C.purple, borderRadius:6,
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>🤖</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Coach me — {w.title}</div>
                      <div style={{ fontSize:11, color:C.textM }}>Génère un prompt prêt à coller dans Claude avec ta situation réelle.</div>
                    </div>
                  </div>

                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    <div>
                      <Mono color={C.textD} size={9}>SITUATION — décris ce qui se passe concrètement *</Mono>
                      <textarea rows={4}
                        value={coachSit[w.id] || ""}
                        onChange={e => setCoachSit(p => ({...p, [w.id]: e.target.value}))}
                        placeholder={`Ex: Mon gestionnaire refuse de mettre en place un plan de performance depuis 3 mois malgré 2 discussions. Il dit que l'employé "s'améliore" mais aucune donnée ne le confirme...`}
                        style={{ ...css.textarea, marginTop:6, fontSize:12, lineHeight:1.65 }}
                        onFocus={e=>e.target.style.borderColor=C.purple+"60"}
                        onBlur={e=>e.target.style.borderColor=C.border}/>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      <div>
                        <Mono color={C.textD} size={9}>CONTEXTE ADDITIONNEL (optionnel)</Mono>
                        <textarea rows={3}
                          value={coachCtx[w.id] || ""}
                          onChange={e => setCoachCtx(p => ({...p, [w.id]: e.target.value}))}
                          placeholder="Historique, enjeux organisationnels, pression de la direction..."
                          style={{ ...css.textarea, marginTop:6, fontSize:12 }}
                          onFocus={e=>e.target.style.borderColor=C.purple+"60"}
                          onBlur={e=>e.target.style.borderColor=C.border}/>
                      </div>
                      <div>
                        <Mono color={C.textD} size={9}>PROFIL DU GESTIONNAIRE (optionnel)</Mono>
                        <textarea rows={3}
                          value={coachMgr[w.id] || ""}
                          onChange={e => setCoachMgr(p => ({...p, [w.id]: e.target.value}))}
                          placeholder="Ex: Gestionnaire tech, 3 ans d'expérience, évitant, bonne relation avec l'employé..."
                          style={{ ...css.textarea, marginTop:6, fontSize:12 }}
                          onFocus={e=>e.target.style.borderColor=C.purple+"60"}
                          onBlur={e=>e.target.style.borderColor=C.border}/>
                      </div>
                    </div>

                    <button onClick={() => generateCoachPrompt(w)}
                      disabled={!(coachSit[w.id]||"").trim()}
                      style={{ ...css.btn((coachSit[w.id]||"").trim() ? C.purple : C.textD),
                        padding:"10px", fontSize:13, opacity:(coachSit[w.id]||"").trim() ? 1 : 0.5 }}>
                      ⚡ Générer le prompt Claude
                    </button>

                    {coachPrompt[w.id] && (
                      <div style={{ marginTop:4 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <Mono color={C.purple} size={9}>PROMPT GÉNÉRÉ — PRÊT À COLLER</Mono>
                          <button onClick={() => copyCoachPrompt(w.id)}
                            style={{ ...css.btn(coachCopied===w.id ? C.em : C.purple),
                              padding:"6px 14px", fontSize:11 }}>
                            {coachCopied===w.id ? "✓ Copié !" : "📋 Copier le prompt"}
                          </button>
                        </div>
                        <div style={{ background:C.bg, border:`1px solid ${C.purple}33`,
                          borderRadius:8, padding:"14px 16px", fontSize:11, color:C.textM,
                          lineHeight:1.75, whiteSpace:"pre-wrap", fontFamily:"'DM Mono',monospace",
                          maxHeight:320, overflowY:"auto" }}>
                          {coachPrompt[w.id]}
                        </div>
                        <div style={{ marginTop:8, fontSize:11, color:C.textD, textAlign:"right" }}>
                          Colle ce prompt dans une nouvelle conversation Claude →
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
