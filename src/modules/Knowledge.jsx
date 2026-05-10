// Source: HRBP_OS.jsx L.9671-10654
import { useState } from "react";
import { C } from '../theme.js';

export default function ModuleKnowledge() {
  const [activeSection, setActiveSection] = useState("home");
  const [search, setSearch] = useState("");
  const [openCards, setOpenCards] = useState({});
  const [selected9, setSelected9] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [openCase, setOpenCase] = useState(null);
  const [copiedCase, setCopiedCase] = useState(null);
  const [templateSel, setTemplateSel] = useState(0);
  const [templateCopied, setTemplateCopied] = useState(false);
  const toggleCard = (id) => setOpenCards(p => ({ ...p, [id]: !p[id] }));

  // ── DATA ──────────────────────────────────────────────────────────────────

  const SECTIONS = [
    { id:"home",        icon:"🏠", label:"Vue d'ensemble",       group:"NAV" },
    { id:"rhythms",     icon:"🗓", label:"Cadences & Réunions",   group:"FONDATIONS" },
    { id:"model",       icon:"⚙️", label:"Modèle opérationnel",  group:"FONDATIONS" },
    { id:"onboarding",  icon:"🚀", label:"Accueil & Départ",      group:"CYCLE EMPLOYÉ" },
    { id:"performance", icon:"📊", label:"Performance & 9-Box",   group:"CYCLE EMPLOYÉ" },
    { id:"pip",         icon:"⚠️", label:"PIPs & Correctif",     group:"CYCLE EMPLOYÉ" },
    { id:"coaching",    icon:"🎙️", label:"Coaching Gestionnaires",group:"TALENT" },
    { id:"development", icon:"🌱", label:"Développement IT",      group:"TALENT" },
    { id:"compensation",icon:"💰", label:"Rémunération",          group:"TALENT" },
    { id:"immigration", icon:"✈️", label:"Immigration",           group:"COMPLIANCE" },
    { id:"legal",       icon:"⚖️", label:"Légal & Guardrails",   group:"COMPLIANCE" },
    { id:"analytics",   icon:"📈", label:"Analytics & KPIs",      group:"DONNÉES" },
    { id:"cases",       icon:"🗂️", label:"Cas fréquents IT",     group:"SITUATIONS" },
    { id:"templates",   icon:"📄", label:"Templates FR/EN",       group:"SITUATIONS" },
  ];

  const groups = ["FONDATIONS","CYCLE EMPLOYÉ","TALENT","COMPLIANCE","DONNÉES","SITUATIONS"];

  const SEARCH_INDEX = {
    rhythms:    "cadence réunion bihebdo directeur mensuel trimestriel annuel calibration talent",
    model:      "modèle opérationnel stratégique conseil opérationnel valeur principes",
    onboarding: "accueil départ 4c probation jour 1 buddy offboarding checklist",
    performance:"performance 9-box calibration biais smart objectifs étoile contributeur",
    pip:        "pip plan amélioration avertissement terminaison sous-performance escalade lnt 124",
    coaching:   "coaching grow sbi feedback gestionnaire archétype micromanager éviteur débordé ego",
    development:"développement pdi 70 20 10 ic manager transition succession compétences",
    compensation:"rémunération salaire compa-ratio équité bande total rewards",
    immigration:"immigration permis ferme eimt pgwp statut implicite ircc galileo j-90 j-60",
    legal:      "legal lnt cnesst harcèlement discrimination loi 25 terminaison art 124 art 81",
    analytics:  "analytique métrique kpi power bi taux roulement attrition enps span ttf absentéisme",
    cases:      "cas situations fréquentes promotion flight risk micromanager retour maladie permis conflit",
    templates:  "template modèle message courriel fr en bilingue discipline immigration coaching rétention",
  };

  const searchResults = search.trim().length > 1
    ? SECTIONS.filter(s => s.id !== "home" &&
        SEARCH_INDEX[s.id]?.toLowerCase().includes(search.toLowerCase()))
    : [];

  // ── SECTION CONTENT ────────────────────────────────────────────────────────

  function SectionCard({ id, title, children, accent, defaultOpen }) {
    const open = openCards[id] !== undefined ? openCards[id] : !!defaultOpen;
    return (
      <div style={{ border:`1px solid ${C.border}`, borderRadius:10, marginBottom:10, overflow:"hidden" }}>
        <div onClick={()=>toggleCard(id)} style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", padding:"12px 16px", cursor:"pointer",
          background: open ? (accent||C.blue)+"0a" : C.surfL,
          borderLeft:`3px solid ${accent||C.blue}` }}>
          <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{title}</span>
          <span style={{ color:C.textD, fontSize:16 }}>{open ? "−" : "+"}</span>
        </div>
        {open && <div style={{ padding:"14px 16px", borderTop:`1px solid ${C.border}` }}>{children}</div>}
      </div>
    );
  }

  function KTable({ headers, rows }) {
    return (
      <div style={{ overflowX:"auto", marginTop:8 }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>{headers.map((h,i)=><th key={i} style={{ background:C.surfL, padding:"7px 10px",
              textAlign:"left", fontWeight:700, color:C.text, borderBottom:`2px solid ${C.border}`,
              whiteSpace:"nowrap" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row,i)=><tr key={i} style={{ background: i%2===0?C.white:C.surfL }}>
              {row.map((cell,j)=><td key={j} style={{ padding:"7px 10px", color:C.textM,
                borderBottom:`1px solid ${C.border}`, verticalAlign:"top", lineHeight:1.5 }}>{cell}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    );
  }

  function KList({ items, color, icon="→" }) {
    return (
      <ul style={{ listStyle:"none", padding:0, margin:"8px 0 0" }}>
        {items.map((item,i)=>(
          <li key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.textM,
            lineHeight:1.6, marginBottom:5 }}>
            <span style={{ color: color||C.blue, flexShrink:0, fontWeight:700 }}>{icon}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  function Alert({ type="warn", text }) {
    const colors = { danger:C.red, warn:C.amber, info:C.blue, ok:C.em };
    const c = colors[type] || C.amber;
    const icons = { danger:"🚫", warn:"⚠️", info:"ℹ️", ok:"✅" };
    return (
      <div style={{ background:c+"12", border:`1px solid ${c}30`, borderLeft:`3px solid ${c}`,
        borderRadius:8, padding:"9px 13px", margin:"10px 0", display:"flex", gap:9, alignItems:"flex-start" }}>
        <span style={{ fontSize:14, flexShrink:0 }}>{icons[type]}</span>
        <span style={{ fontSize:12, color:C.textM, lineHeight:1.6 }}>{text}</span>
      </div>
    );
  }

  function Phase({ steps }) {
    return (
      <div style={{ marginTop:8 }}>
        {steps.map((s,i)=>(
          <div key={i} style={{ display:"flex", gap:12, marginBottom:12 }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:20 }}>
              <div style={{ width:20, height:20, borderRadius:"50%", background:C.blue,
                display:"flex", alignItems:"center", justifyContent:"center",
                color:"#fff", fontSize:10, fontWeight:700, flexShrink:0 }}>{i+1}</div>
              {i < steps.length-1 && <div style={{ width:2, flex:1, background:C.border, marginTop:3 }}/>}
            </div>
            <div style={{ flex:1, paddingBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:5 }}>{s.phase}</div>
              {s.tasks && <KList items={s.tasks}/>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── SECTION RENDERS ────────────────────────────────────────────────────────

  function renderHome() {
    const tiles = SECTIONS.filter(s => s.id !== "home");
    const byGroup = {};
    groups.forEach(g => { byGroup[g] = tiles.filter(s => s.group === g); });
    return (
      <div>
        <div style={{ background:`linear-gradient(135deg, ${C.blue} 0%, #1a3550 100%)`,
          borderRadius:12, padding:"22px 26px", marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:2, color:"rgba(255,255,255,.5)",
            textTransform:"uppercase", marginBottom:6 }}>HRBP OS · Groupe IT Québec</div>
          <div style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:6 }}>Base de connaissances</div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,.65)", lineHeight:1.6 }}>
            14 sections · Performance · Immigration · Légal · Analytics · Cas fréquents IT · Templates
          </div>
        </div>
        {groups.map(g => (
          <div key={g} style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, color:C.textD,
              textTransform:"uppercase", marginBottom:8 }}>{g}</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
              {byGroup[g].map(s => (
                <button key={s.id} onClick={()=>setActiveSection(s.id)} style={{
                  background:C.surfL, border:`1px solid ${C.border}`, borderRadius:9,
                  padding:"12px 14px", cursor:"pointer", textAlign:"left", fontFamily:"inherit",
                  transition:"all .15s" }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.blue}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{ fontSize:18, marginBottom:5 }}>{s.icon}</div>
                  <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{s.label}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderRhythms() {
    const rhythms = [
      { freq:"Bi-hebdomadaire", title:"Rencontre avec les directeurs IT", duration:"60 min", color:C.blue,
        items:["People : signaux de perf, risques rétention, promotions en attente","Org : clarté des rôles (IC vs. lead), structure d'équipe, span of control","Leadership : besoins de coaching des gestionnaires tech","Initiatives : calibration, cycle perf, renouvellements immigration","Compliance : permis à surveiller, dossiers CNESST, risques légaux"] },
      { freq:"Mensuel", title:"Revue des talents (par directeur)", duration:"45 min", color:C.blue+"cc",
        items:["Distribution de performance de l'équipe","Top talents : plan d'action, risque de départ, compa-ratio","Sous-performeurs : suivi PIP ou coaching en cours","Postes ouverts et priorités de recrutement tech","Succession gaps identifiés (key person risks)"] },
      { freq:"Trimestriel", title:"Calibration de performance", duration:"2-3h", color:C.em,
        items:["Pré-remplissage 9-cases avec les gestionnaires (avant la session)","Calibration collective — alignement des standards inter-équipes IT","Identification des actions par segment de talent","Recommandations rémunération / promotions avec rationnel","Plan de communication post-calibration aux gestionnaires"] },
      { freq:"Annuel", title:"Revue stratégique RH — VP/DG", duration:"90 min", color:"#7c3aed",
        items:["Bilan attrition, promotions, mouvements — narration executive avec données Power BI","Risques clés de talent identifiés pour l'année suivante","Plan de main-d'œuvre aligné aux priorités produit et roadmap","Priorités de développement organisationnel","Investissements RH recommandés avec ROI estimé"] },
    ];
    const freqColors = { "Bi-hebdomadaire":C.blue, "Mensuel":"#0f766e", "Trimestriel":C.amber, "Annuel":"#7c3aed" };
    return (
      <div>
        {rhythms.map((r,i) => (
          <SectionCard key={i} id={`rhythm-${i}`} title={`${r.title} — ${r.duration}`}
            accent={freqColors[r.freq]} defaultOpen={i===0}>
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              <span style={{ background:freqColors[r.freq]+"18", color:freqColors[r.freq],
                border:`1px solid ${freqColors[r.freq]}30`, borderRadius:20, padding:"2px 10px",
                fontSize:10, fontWeight:700 }}>{r.freq}</span>
            </div>
            <KList items={r.items} color={r.color}/>
          </SectionCard>
        ))}
      </div>
    );
  }

  function renderModel() {
    return (
      <div>
        <SectionCard id="model-modes" title="Les 3 modes du HRBP" accent={C.blue} defaultOpen>
          <KTable
            headers={["Mode","Description","Cible"]}
            rows={[
              ["Stratégique","WFP, org design, talent strategy, succession IT","30%"],
              ["Conseil","Coaching gestionnaires, RI, performance, culture","50%"],
              ["Opérationnel","Immigration, CNESST, Workday, documentation","20%"],
            ]}/>
          <Alert type="warn" text="Si l'opérationnel dépasse 40%, quelque chose doit être automatisé (Power Automate) ou délégué."/>
        </SectionCard>
        <SectionCard id="model-value" title="Valeur HRBP — Langage tech corporate" accent={C.em}>
          <KTable
            headers={["Besoin d'affaires","Réponse HRBP"]}
            rows={[
              ["Livraison ralentie par tensions d'équipe","Médiation, coaching gestionnaire, clarté des rôles"],
              ["Perte d'un senior dev ou architect","Plan de rétention, succession, contre-offre stratégique"],
              ["Tech lead promu qui struggle","Coaching accéléré, plan de transition IC → Manager"],
              ["Calibration incohérente entre équipes","Facilitation, standardisation des critères inter-équipes"],
              ["Non-conformité immigration","Intervention immédiate, cabinet externe, documentation"],
              ["KPIs RH demandés par le CFO","Power BI, narration executive, seuils d'alerte"],
            ]}/>
        </SectionCard>
      </div>
    );
  }

  function renderOnboarding() {
    return (
      <div>
        <SectionCard id="onb-4c" title="Modèle 4C — Adapté IT corporate" accent={C.blue} defaultOpen>
          <KTable
            headers={["Dimension","Contenu clé en contexte IT"]}
            rows={[
              ["Conformité","Documents légaux, accès Workday + GitHub/Jira, permis de travail, badge, politiques signées"],
              ["Clarification","Stack technique, méthodo Agile/Scrum, critères perf IC vs. lead, relation gestionnaire, plan 30/60/90"],
              ["Culture","Normes d'équipe, rituels (standups, retros, all-hands), canaux Slack/Teams, culture de feedback"],
              ["Connexion","Buddy technique, intro stakeholders clés, participation aux cérémonies d'équipe, 1:1 réguliers"],
            ]}/>
        </SectionCard>
        <SectionCard id="onb-checklist" title="Checklist d'accueil — Touchpoints HRBP" accent={C.em}>
          <Phase steps={[
            { phase:"Avant le Jour 1", tasks:["Accès systèmes IT (Workday, GitHub, Jira, Slack, VPN) — J-5","Permis de travail vérifié et consigné","Buddy technique assigné"] },
            { phase:"Jour 1", tasks:["Orientation RH : politiques, avantages, code de conduite","PAE et ressources bien-être présentés"] },
            { phase:"Semaine 1", tasks:["Plan 30/60/90 co-créé gestionnaire + employé","Critères de probation clarifiés par écrit"] },
            { phase:"Mois 1", tasks:["Bilan 30 jours (HRBP + gestionnaire, séparés)","Conformité immigration reconfirmée"] },
            { phase:"Mois 3", tasks:["Bilan 90 jours formel","Décision de probation documentée dans Workday"] },
          ]}/>
        </SectionCard>
      </div>
    );
  }

  function renderPerformance() {
    const nineBox = [
      { label:"Action requise",      c:0,r:0, color:"#991b1b", action:"Processus progressif en cours. PIP si pas encore. Documentation rigoureuse. Consultation légale si 2 ans+." },
      { label:"Contributeur fiable", c:1,r:0, color:"#64748b", action:"Stabilité et cohérence. Ne pas surinvestir en avancement. Assurer la satisfaction dans le rôle." },
      { label:"Expert / IC senior",  c:2,r:0, color:"#7c3aed", action:"Spécialiste profond. Voie IC senior (Fellow, Principal). Ne pas forcer vers la gestion." },
      { label:"Besoin de coaching",  c:0,r:1, color:"#dc2626", action:"Plan de perf requis. Vérifier cause systémique avant PIP. Ex : dev senior qui ne livre plus — burnout? manager?" },
      { label:"Joueur de base",      c:1,r:1, color:"#3b82f6", action:"Épine dorsale de l'équipe. Ne pas négliger — désengagement silencieux commence ici. Dev plan stable." },
      { label:"Haut performeur",     c:2,r:1, color:"#0d9488", action:"Leverager l'expertise. Rôle de mentor. Vérifier compa-ratio — souvent sous-payés." },
      { label:"Point d'interrogation",c:0,r:2, color:"#d97706", action:"Investiguer les barrières : mauvais rôle? manager? projet? Ex : nouvel Eng Manager venu du IC — transition mal supportée." },
      { label:"Étoile montante",     c:1,r:2, color:"#059669", action:"Accélérer le dev. Mandats transversaux. Candidate à la succession. Ex : dev intermédiaire avec fort leadership naturel." },
      { label:"Étoile",              c:2,r:2, color:"#1b6ca8", action:"Priorité absolue. Pipeline leadership. Risque de départ élevé si non reconnu. Vérifier compa-ratio." },
    ];
    const grid = [[null,null,null],[null,null,null],[null,null,null]];
    nineBox.forEach(cell => { grid[2-cell.r][cell.c] = cell; });
    const rowLabels = ["Haut","Moyen","Bas"];
    const colLabels = ["Faible","Moyen","Élevé"];
    return (
      <div>
        <SectionCard id="perf-criteria" title="Critères de performance par profil tech" accent={C.blue} defaultOpen>
          <KTable headers={["Profil","Critères principaux"]} rows={[
            ["Dev / Analyst / IC","Qualité des livrables, autonomie, documentation, impact au-delà de son squad"],
            ["Tech Lead / Senior Lead","Livrables + multiplicateur d'impact équipe, qualité du mentoring et des code reviews"],
            ["Engineering Manager","Santé d'équipe (rétention, engagement), développement des talents, décisions de priorisation"],
            ["Director","Stratégie org, pipeline de leadership, culture d'équipe, communication exécutif"],
          ]}/>
        </SectionCard>
        <SectionCard id="perf-9box" title="Grille 9-Cases — Cliquer sur une case" accent={C.em} defaultOpen>
          <div style={{ overflowX:"auto" }}>
            <div style={{ minWidth:360, marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", marginBottom:4 }}>
                <div style={{ width:70, fontSize:10, color:C.textD, textAlign:"right", paddingRight:8 }}>Perf ↓ Pot →</div>
                {colLabels.map((l,i)=><div key={i} style={{ flex:1, textAlign:"center", fontSize:10, fontWeight:700, color:C.textM }}>{l}</div>)}
              </div>
              {grid.map((row,ri)=>(
                <div key={ri} style={{ display:"flex", alignItems:"stretch", marginBottom:4 }}>
                  <div style={{ width:70, display:"flex", alignItems:"center", justifyContent:"flex-end",
                    paddingRight:8, fontSize:10, fontWeight:700, color:C.textM }}>{rowLabels[ri]}</div>
                  {row.map((cell,ci)=>(
                    <div key={ci} onClick={()=>setSelected9(selected9?.label===cell?.label?null:cell)}
                      style={{ flex:1, minHeight:60, margin:"0 2px", borderRadius:7, cursor:"pointer",
                        background: selected9?.label===cell?.label ? cell.color+"25" : cell.color+"10",
                        border:`2px solid ${selected9?.label===cell?.label ? cell.color : cell.color+"40"}`,
                        display:"flex", alignItems:"center", justifyContent:"center", textAlign:"center",
                        padding:"6px 4px", transition:"all .15s" }}>
                      <span style={{ fontSize:10, fontWeight:700, color:cell.color, lineHeight:1.3 }}>{cell?.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {selected9 && (
            <div style={{ background:selected9.color+"10", border:`1px solid ${selected9.color}30`,
              borderLeft:`3px solid ${selected9.color}`, borderRadius:8, padding:"10px 14px", marginTop:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:selected9.color, marginBottom:4 }}>{selected9.label}</div>
              <div style={{ fontSize:12, color:C.textM, lineHeight:1.6 }}>{selected9.action}</div>
            </div>
          )}
        </SectionCard>
        <SectionCard id="perf-bias" title="Biais de calibration — Fréquents en IT" accent={C.amber}>
          <KTable headers={["Biais","Manifestation en IT","Contre-mesure HRBP"]} rows={[
            ["Halo technique","Dev brillant → cote globale gonflée","Demander des exemples sur chaque dimension séparément"],
            ["Recency bias","Grand lancement en novembre → oubli du Q1-Q2","Revoir les notes de 1:1 sur toute l'année"],
            ["Affinité","Manager rate plus haut ceux qui pensent comme lui","Analyser la distribution par genre, origine, ancienneté"],
            ["Visibility bias","Contributeurs discrets sous-évalués","Demander : 'Qui est sous-visible dans l'équipe?'"],
            ["Prestige du projet","Projet stratégique = halo; maintenance = biais négatif","Évaluer l'impact, pas le prestige du projet"],
          ]}/>
        </SectionCard>
      </div>
    );
  }

  function renderPip() {
    return (
      <div>
        <Alert type="warn" text="En contexte tech, la sous-performance a souvent une cause systémique avant d'être individuelle. Avant d'escalader : vérifier le gestionnaire, le projet, la charge, et les outils."/>
        <SectionCard id="pip-scale" title="Échelle d'escalade — Processus progressif" accent={C.red} defaultOpen>
          <Phase steps={[
            { phase:"Étape 1 — Coaching informel (2-4 sem.)", tasks:["Gestionnaire nomme l'enjeu directement (SBI)","Pas de documentation formelle — noter dans tes notes HRBP avec la date"] },
            { phase:"Étape 2 — Avertissement verbal documenté", tasks:["Rencontre formelle — HRBP présent recommandé","Document interne signé — accusé de réception"] },
            { phase:"Étape 3 — Avertissement écrit", tasks:["Lettre formelle consignée dans Workday","Délai : 30-60 jours selon la nature de l'enjeu"] },
            { phase:"Étape 4 — PIP formel", tasks:["Document PIP créé et signé — HRBP facilite","Objectifs SMART avec outils de mesure IT","Rencontres hebdomadaires gestionnaire + employé"] },
            { phase:"Étape 5 — Terminaison ou sortie", tasks:["Révision légale systématique (ancienneté, LNT art. 124)","IT access revocation le jour même","Communication d'équipe préparée à l'avance"] },
          ]}/>
          <Alert type="danger" text="Ancienneté 2 ans+ = art. 124 LNT applicable. Consultation juridique obligatoire avant toute terminaison."/>
        </SectionCard>
        <SectionCard id="pip-smart" title="Objectifs SMART en contexte IT" accent={C.blue}>
          <KTable headers={["Critère","Définition","Exemple IT"]} rows={[
            ["Spécifique","Action précise et observée","Réduire les bugs en production dans les PR soumises"],
            ["Mesurable","Indicateur quantifiable","< 2 bugs critiques par sprint sur 4 sprints consécutifs"],
            ["Atteignable","Réaliste avec le support offert","Support pair programming hebdomadaire inclus"],
            ["Relevant","Lié aux attentes du rôle documentées","Aligné avec les critères IC3 documentés"],
            ["Temporel","Délai clair","Dans les 60 jours suivant la signature du PIP"],
          ]}/>
        </SectionCard>
      </div>
    );
  }

  function renderCoaching() {
    return (
      <div>
        <SectionCard id="coa-archetypes" title="Les 5 archétypes tech — Guide de coaching" accent={C.blue} defaultOpen>
          <KTable headers={["Archétype","Défi","Stratégie HRBP"]} rows={[
            ["Tech lead promu","Continue de faire le travail lui-même","Reframage du leadership comme multiplicateur. GROW régulier. Jeux de rôle de conversations de perf."],
            ["L'éviteur de conflits","Retarde la rétro négative","Quantifier le coût de l'inaction. Pratiquer SBI. Être présent lors des premières conversations difficiles."],
            ["Le micromanager","Goulot d'étranglement sur toutes les décisions","Cadre de délégation. Lier à ses objectifs personnels de capacité."],
            ["Le gestionnaire débordé","Trop de directs, trop de projets","Conversation de design org (span of control). Système minimal de 1:1s."],
            ["Le gestionnaire à fort ego","Résiste au coaching, défensif","Approche par les données (eNPS, attrition). Framing par les objectifs d'affaires."],
          ]}/>
        </SectionCard>
        <SectionCard id="coa-grow" title="Modèle GROW — Questions adaptées au contexte tech" accent={C.em} defaultOpen>
          <Phase steps={[
            { phase:"G — Goal", tasks:["Quel enjeu de management veux-tu progresser dans les 90 prochains jours?","Si ton équipe performait exactement comme tu le voudrais, qu'est-ce qui serait différent?"] },
            { phase:"R — Reality", tasks:["Qu'est-ce qui se passe concrètement avec [employé / équipe]?","Honnêtement — quelle est ta part de responsabilité dans la situation?"] },
            { phase:"O — Options", tasks:["Si tu n'avais pas peur de la réaction de l'employé, qu'est-ce que tu ferais?","Qu'est-ce qu'un gestionnaire que tu admires ferait dans cette situation?"] },
            { phase:"W — Will", tasks:["Concrètement, quelle conversation vas-tu avoir avant notre prochaine rencontre?","À quel point es-tu confiant de le faire (1-10)?"] },
          ]}/>
        </SectionCard>
        <SectionCard id="coa-sbi" title="Modèle SBI — Feedback structuré" accent={C.amber}>
          <KTable headers={["Élément","Description","Exemple IT"]} rows={[
            ["S — Situation","Le contexte observable, pas l'interprétation","Lors du sprint review de mardi dernier"],
            ["B — Behavior","Le comportement spécifique et observable","Tu as interrompu deux développeurs avant qu'ils aient terminé d'expliquer leur approche"],
            ["I — Impact","L'impact sur l'équipe ou les résultats","Ça a créé une hésitation dans l'équipe à partager des idées non finalisées"],
          ]}/>
          <Alert type="info" text="SBI fonctionne pour le feedback positif ET correctif. Pour le feedback positif : préciser pourquoi ce comportement mérite d'être répété."/>
        </SectionCard>
      </div>
    );
  }

  function renderDevelopment() {
    return (
      <div>
        <SectionCard id="dev-transition" title="Transition IC → Manager — Playbook (6 mois)" accent={C.blue} defaultOpen>
          <Phase steps={[
            { phase:"Mois 1", tasks:["Clarifier les attentes du rôle managérial par écrit + première session GROW","Distinguer : ce qu'il/elle fait vs. ce que le rôle exige"] },
            { phase:"Mois 2-3", tasks:["Coaching fondamentaux : 1:1s structurés, feedback SBI, gestion de la charge","Observer : délègue-t-il/elle ou fait-il/elle encore le travail?"] },
            { phase:"Mois 4-5", tasks:["Première conversation de performance difficile — HRBP coache avant, debrief après","Bilan mi-parcours sur les indicateurs d'efficacité managériale"] },
            { phase:"Mois 6 — Décision", tasks:["Sur la bonne trajectoire? Ajuster le plan.","Si pas de progrès : conversation sur le fit du rôle"] },
          ]}/>
          <Alert type="warn" text="Si à 6 mois la transition ne progresse pas, avoir une conversation honnête sur le fit. Créer une voie IC senior est plus sain que forcer un manager médiocre."/>
        </SectionCard>
        <SectionCard id="dev-70-20-10" title="Modèle 70/20/10 — Exemples concrets en IT" accent={C.em}>
          <KTable headers={["Proportion","Levier","Exemples IT"]} rows={[
            ["70% Expérience","Mandats avec responsabilité accrue","Lead technique d'un sous-projet, rotation transversale, rôle d'acting manager 3 mois"],
            ["20% Exposition","Apprentissage par les autres","Mentorat d'un VP Eng, présentation en all-hands, pair programming avec expert externe"],
            ["10% Éducation","Formation formelle","AWS/GCP certification, cours de leadership, conférence QCon ou LeadDev"],
          ]}/>
        </SectionCard>
        <SectionCard id="dev-ic-track" title="Voie IC vs. Management — Critères de choix" accent={C.amber}>
          <KTable headers={["Voie IC","Voie Management"]} rows={[
            ["Expertise technique profonde comme moteur principal","Leadership des personnes comme priorité naturelle"],
            ["Impact via la qualité du code / de l'architecture","Impact via la performance de l'équipe"],
            ["Faible intérêt pour la gestion de conflits","À l'aise avec les conversations difficiles"],
            ["Ne veut pas gérer des 1:1s et des cycles de perf","Trouve de l'énergie dans le développement des autres"],
          ]}/>
          <Alert type="info" text="Les voies IC senior (Staff, Principal, Fellow) sont équivalentes en rémunération et impact à la voie managériale. Ne pas forcer quelqu'un vers la gestion pour le 'récompenser'."/>
        </SectionCard>
      </div>
    );
  }

  function renderCompensation() {
    return (
      <div>
        <SectionCard id="comp-ratio" title="Compa-ratio — Guide d'interprétation" accent={C.blue} defaultOpen>
          <KTable headers={["Compa-ratio","Interprétation","Action recommandée"]} rows={[
            ["< 80%","Sous-payé","Révision prioritaire — risque de départ élevé (offres marché 15-25% supérieures)"],
            ["80-100%","En développement","Normal pour nouveaux dans le niveau"],
            ["100-120%","Pleinement compétent","Cible pour les contributeurs solides confirmés"],
            ["> 120%","Au plafond","Limiter les augmentations — préparer une progression de niveau"],
          ]}/>
          <Alert type="warn" text="En tech : les seniors devs et architects reçoivent des offres 15-25% supérieures. Un compa-ratio < 90% dans ce segment est un risque de rétention actif."/>
        </SectionCard>
        <SectionCard id="comp-levers" title="Leviers de rémunération totale" accent={C.em}>
          <KTable headers={["Levier","Usage","Contraintes"]} rows={[
            ["Augmentation base","Progressions standards dans la bande","Budget annuel, approbation VP"],
            ["Augmentation hors-cycle","Rétention urgente, correction d'équité","Nécessite justification HRBP + budget spécial"],
            ["Bonus de rétention","High performer à risque de départ","Engagement de 12 mois recommandé"],
            ["Titre intermédiaire","Sans budget — signal de progression","Ne remplace pas la progression salariale à long terme"],
            ["Enrichissement de rôle","Nouveau mandat, responsabilités transversales","Doit accompagner un plan de dev concret"],
          ]}/>
        </SectionCard>
      </div>
    );
  }

  function renderImmigration() {
    return (
      <div>
        <SectionCard id="imm-types" title="Types de permis — Référence rapide" accent={C.blue} defaultOpen>
          <KTable headers={["Type","Description","Points d'attention HRBP"]} rows={[
            ["Permis fermé (EIMT)","Lié à un employeur + poste spécifique","Tout changement de titre OU de salaire peut invalider — vérifier avant toute promo"],
            ["Permis ouvert","Travail pour tout employeur","Vérifier les conditions spécifiques; certains ont des restrictions"],
            ["PGWP","Pour diplômés d'universités canadiennes","Durée max 3 ans; planifier la RP ou EIMT avant expiration"],
            ["CSQ + RP","Résidence permanente via voie québécoise","Délais cumulés 12-24 mois; anticiper tôt"],
          ]}/>
        </SectionCard>
        <SectionCard id="imm-implicit" title="Statut implicite — Ce que tout HRBP doit maîtriser" accent={C.red}>
          <KTable headers={["Élément","Détail"]} rows={[
            ["Définition","Employé dont le permis expire MAIS qui a soumis une demande AVANT l'expiration peut continuer à travailler légalement"],
            ["Condition 1","La demande doit être soumise AVANT l'expiration"],
            ["Condition 2","L'employé doit travailler pour le même employeur (si permis fermé)"],
            ["Documentation requise","Conserver la confirmation de dépôt dans le dossier RH SharePoint"],
          ]}/>
          <Alert type="danger" text="Si la demande est soumise APRÈS l'expiration — statut implicite ne s'applique PAS. Arrêt de travail immédiat requis."/>
        </SectionCard>
        <SectionCard id="imm-timeline" title="Calendrier d'action — Jalon par jalon" accent={C.em} defaultOpen>
          <Phase steps={[
            { phase:"J-90 jours", tasks:["Initier avec le cabinet (Galileo)","Vérifier : titre et salaire ont-ils changé depuis l'émission du permis?"] },
            { phase:"J-60 jours", tasks:["Confirmer que les documents sont en collecte","Vérifier si nouvel EIMT nécessaire (3-6 mois de délai si LMIA requise)"] },
            { phase:"J-30 jours", tasks:["Statut de la demande confirmé","Si non soumise : escalader immédiatement"] },
            { phase:"J-0 (expiration)", tasks:["Si demande soumise avant : statut implicite actif — conserver la preuve","Si non soumise : arrêt de travail + contact cabinet urgence"] },
          ]}/>
        </SectionCard>
        <SectionCard id="imm-promo" title="Promotions & permis fermés — Protocole" accent={C.amber}>
          <KList items={[
            "Bloquer toute mise à jour Workday avant confirmation du cabinet",
            "Contacter Galileo dans les 24h suivant la décision de promotion",
            "Vérifier si le nouveau titre + salaire sont couverts par le permis actuel",
            "Si nouveau EIMT requis : délai 3-6 mois — planifier la communication à l'employé",
            "Ne jamais annoncer la promotion officiellement avant confirmation immigration",
          ]} color={C.amber} icon="→"/>
          <Alert type="danger" text="Une promotion annoncée avant l'approbation immigration crée une attente que tu ne peux pas toujours tenir. Gérer la communication avec soin."/>
        </SectionCard>
      </div>
    );
  }

  function renderLegal() {
    const blocks = [
      { title:"Terminaison d'emploi (Québec)", level:"danger", items:["Ancienneté 2 ans+ : protection contre congédiement sans cause juste (LNT art. 124)","Processus disciplinaire progressif doit être respecté et documenté","Calcul LNT minimum : 1 semaine par année de service","Révocation accès TI le jour même de la terminaison — coordonner avec IT","Ne jamais promettre verbalement une terminaison avant la validation légale"] },
      { title:"CNESST — Points de vigilance", level:"warn", items:["Tout accident ou lésion doit être déclaré à la CNESST — aucune exception","L'employeur a l'obligation de maintenir le lien d'emploi pendant la récupération","Plan de retour au travail progressif obligatoire — ne pas attendre le 100%","Documenter tous les accommodements offerts — c'est ta protection légale"] },
      { title:"Harcèlement psychologique — Obligation d'agir", level:"danger", items:["Obligation d'agir dès qu'une plainte est reçue — formelle ou informelle (LNT art. 81.19)","L'inaction constitue elle-même une violation légale","Enquête interne impartiale obligatoire","Délai de prescription : 2 ans à partir du dernier acte reproché","Ne jamais promettre la confidentialité totale — tu as une obligation d'agir"] },
      { title:"Loi 25 — Protection des renseignements personnels", level:"info", items:["Les données RH (salaire, évaluations, dossiers médicaux, immigration) sont protégées","Accès restreint et documenté pour chaque type de données","L'employé a le droit d'accès à son propre dossier","Tout incident de sécurité sur des données RH doit être déclaré"] },
    ];
    const lmap = { danger:C.red, warn:C.amber, info:C.blue };
    return (
      <div>
        {blocks.map((b,i) => (
          <SectionCard key={i} id={`legal-${i}`} title={b.title} accent={lmap[b.level]} defaultOpen={i<2}>
            <KList items={b.items} color={lmap[b.level]}/>
          </SectionCard>
        ))}
        <SectionCard id="legal-calc" title="Calcul du préavis LNT — Référence rapide" accent={C.blue}>
          <KTable headers={["Ancienneté","Préavis minimum LNT","Notes"]} rows={[
            ["< 3 mois","Aucun (probation)","Vérifier la politique interne — peut être plus généreuse"],
            ["3 mois – 1 an","1 semaine","LNT minimum"],
            ["1 – 5 ans","2 semaines","LNT minimum"],
            ["5 – 10 ans","4 semaines","LNT minimum"],
            ["10 – 15 ans","6 semaines","LNT minimum"],
            ["> 15 ans","8 semaines","LNT minimum"],
          ]}/>
          <Alert type="warn" text="Les indemnités négociées (package) dépassent toujours le minimum LNT. Art. 124 (2 ans+) peut donner droit à réintégration ou dommages — prévoir la consultation légale."/>
        </SectionCard>
      </div>
    );
  }

  function renderAnalytics() {
    const kpis = [
      { icon:"🔄", label:"Taux de roulement", formula:"(Départs / Effectif moyen) × 100", freq:"Mensuel",
        normal:"< 12%", alert:"> 15%", color:"#b91c1c",
        interpretations:["Taux élevé concentré dans une équipe → problème de gestionnaire ou culture locale","Taux élevé post-cycle de performance → calibration perçue comme injuste","Hausse soudaine après réorg → perte de confiance dans la direction","Départs concentrés 0-12 mois → problème d'onboarding ou d'attentes"],
        actions:["Lancer des entretiens de départ systématiques","Cibler les gestionnaires avec les taux les plus élevés","Présenter les données au CODIR avec narration causale"] },
      { icon:"⭐", label:"Attrition regrettable", formula:"(Départs regrettables / Total départs) × 100", freq:"Trimestriel",
        normal:"< 25%", alert:"> 35%", color:"#7c3aed",
        interpretations:["Ratio élevé malgré faible roulement global → on retient les mauvais profils","Départs regrettables post-calibration → hauts performeurs insatisfaits de leur évaluation","Départs vers des concurrents directs → écart de rémunération ou de proposition de valeur"],
        actions:["Analyser les 5 derniers départs regrettables — identifier le pattern commun","Réviser le process de flight risk — les signaux étaient-ils captés?","Revoir le compa-ratio moyen des profils qui partent vs. ceux qui restent"] },
      { icon:"⬆️", label:"Taux de promotion", formula:"(Promotions / Effectif total) × 100", freq:"Annuel",
        normal:"5–12%", alert:"< 4% ou > 20%", color:"#0369a1",
        interpretations:["Taux faible + attrition élevée → les employés partent pour évoluer","Promotions concentrées dans certaines équipes → biais de gestionnaire","Promotions suivies rapidement de départs → rétention à court terme inefficace"],
        actions:["Si taux faible : initier une revue du pipeline de progression avec les directeurs","Analyser la distribution par gestionnaire et groupe — identifier les biais","Standardiser et communiquer les critères de promotion pour chaque niveau IT"] },
      { icon:"🏥", label:"Taux d'absentéisme", formula:"(Jours absence / Jours disponibles) × 100", freq:"Mensuel",
        normal:"< 4%", alert:"> 5%", color:"#92400e",
        interpretations:["Élevé dans une équipe spécifique → gestionnaire, surcharge ou climat toxique","Absences courtes et fréquentes (< 3j) → désengagement, l'employé évite l'environnement","Absences longues concentrées → burnout réel ou enjeux de santé mentale"],
        actions:["Si > 6% : évaluation de la charge de travail et du climat — intervention HRBP directe","Coacher le gestionnaire sur les signaux d'épuisement","Promouvoir le PAE auprès des équipes concernées — sans désigner des individus"] },
      { icon:"🌐", label:"Span of control", formula:"Rapports directs par gestionnaire", freq:"Trimestriel",
        normal:"5–8", alert:"< 3 ou > 12", color:"#0369a1",
        interpretations:["Span > 12 avec nouvelles recrues → onboarding à risque","Span < 4 avec budget → potentiel de consolidation ou micromanagement","Span très variable → répartition inéquitable de la charge managériale"],
        actions:["Si > 12 avec nouveaux employés : proposer une restructuration ou ajout de couche managériale","Identifier si un Tech Lead peut prendre un rôle de leadership intermédiaire","Tracker le span par gestionnaire dans Workday — alerter si > 10 pendant 2 trimestres"] },
      { icon:"⏱️", label:"Time to Fill (TTF)", formula:"Jours entre ouverture du poste et acceptation", freq:"Par rôle",
        normal:"< 60j (IC)", alert:"> 90j (IC)", color:"#7c3aed",
        interpretations:["TTF long + beaucoup de candidats mais peu d'offres → processus trop long ou bar trop haut","TTF long + peu de candidats → profil trop niché, revoir les exigences","TTF court mais fort départ en 6 mois → qualité du fit sacrifiée pour la vitesse"],
        actions:["Si > 90j : cartographier le processus et identifier les 2 étapes qui créent le plus de délai","Coacher les gestionnaires sur la décision rapide (max 3-4 tours d'entrevues)","Analyser les abandons de candidats par étape — signal de problème de marque employeur"] },
      { icon:"💬", label:"eNPS / Engagement", formula:"% Promoteurs (9-10) − % Détracteurs (0-6)", freq:"Semestriel",
        normal:"eNPS > 15", alert:"eNPS < 10", color:"#0f766e",
        interpretations:["Score global correct mais une équipe très faible → problème localisé (gestionnaire)","Baisse soudaine après annonce ou réorg → réaction au changement, communication insuffisante","Score élevé mais absentéisme et turnover en hausse → désengagement silencieux"],
        actions:["Si eNPS < 0 dans une équipe : rencontres individuelles ciblées pour identifier les irritants","Présenter les résultats au gestionnaire avec données spécifiques — pas juste le score global","Co-construire un plan d'action avec le gestionnaire — 2-3 améliorations concrètes et mesurables"] },
    ];
    return (
      <div>
        <SectionCard id="analytics-summary" title="Tableau de bord — Seuils d'alerte synthèse" accent={C.blue} defaultOpen>
          <KTable
            headers={["KPI","Formule simplifiée","Normal","🔴 Alerte","Fréquence"]}
            rows={kpis.map(k=>[k.icon+" "+k.label, k.formula, k.normal, k.alert, k.freq])}/>
        </SectionCard>
        <SectionCard id="analytics-powerbi" title="Structure Power BI — 3 pages recommandées" accent={C.em}>
          <KTable headers={["Page","Contenu","Fréquence"]} rows={[
            ["Vue executive","Effectif + delta, taux de roulement vs. cible, postes ouverts, absentéisme, alerte immigration","Mensuel"],
            ["Vue gestionnaire","Headcount équipe, distribution perf, signaux rétention, plans de dev actifs","Bi-hebdomadaire"],
            ["Analytique talent","Distribution 9-cases, pipeline succession, promotions, équité de rémunération","Trimestriel/Annuel"],
          ]}/>
        </SectionCard>
        <div style={{ fontSize:13, fontWeight:700, color:C.text, margin:"16px 0 10px" }}>
          Interprétations détaillées par KPI
        </div>
        {kpis.map((kpi,i) => {
          const isOpen = openKpi === i;
          return (
            <div key={i} style={{ border:`1px solid ${C.border}`, borderRadius:10, marginBottom:8, overflow:"hidden" }}>
              <div onClick={()=>setOpenKpi(isOpen ? null : i)} style={{ display:"flex", gap:14,
                alignItems:"center", padding:"12px 16px", cursor:"pointer",
                borderLeft:`3px solid ${kpi.color}`, background:isOpen ? kpi.color+"08" : C.surfL }}>
                <span style={{ fontSize:20 }}>{kpi.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{kpi.label}</div>
                  <code style={{ fontSize:11, color:C.textM, fontFamily:"'DM Mono',monospace" }}>{kpi.formula}</code>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <span style={{ fontSize:11, background:C.em+"15", color:C.em, border:`1px solid ${C.em}30`,
                    borderRadius:20, padding:"2px 8px", fontWeight:600 }}>✓ {kpi.normal}</span>
                  <span style={{ fontSize:11, background:C.red+"12", color:C.red, border:`1px solid ${C.red}30`,
                    borderRadius:20, padding:"2px 8px", fontWeight:600 }}>⚠ {kpi.alert}</span>
                </div>
                <span style={{ color:C.textD, fontSize:16 }}>{isOpen?"−":"+"}</span>
              </div>
              {isOpen && (
                <div style={{ padding:"14px 16px", borderTop:`1px solid ${C.border}`,
                  display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.textD, textTransform:"uppercase",
                      letterSpacing:1, marginBottom:8 }}>Interprétations</div>
                    <KList items={kpi.interpretations} color={kpi.color}/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.textD, textTransform:"uppercase",
                      letterSpacing:1, marginBottom:8 }}>Actions HRBP</div>
                    <KList items={kpi.actions} color={C.em} icon="→"/>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderCases() {
    const RC = { Critique:C.red, Élevé:C.amber, Modéré:C.blue };
    const cases = [
      { title:"Dev senior attend une promotion depuis 2 ans", tags:["Rétention","Talent"], risk:"Élevé",
        situation:"Un développeur senior (IC4) performant, 3 ans dans le rôle, attend d'être promu Tech Lead ou IC5. Le gestionnaire hésite ou ne le/la prépare pas activement.",
        risks:["Flight risk élevé — raison #1 de départ en tech","Démotivation silencieuse visible dans la qualité des livrables","Perte de connaissance organisationnelle critique"],
        actions:["Conversation avec le gestionnaire : quel est le blocage réel — readiness / budget / politique interne?","Si readiness : PDI ciblé avec critères de promo clairs et timeline documentée","Si blocage structurel : conversation honnête avec l'employé sur les délais réels","Si délai inacceptable : évaluer les leviers de rétention alternatifs"],
        msg:"J'aimerais qu'on planifie du temps pour parler de [prénom] cette semaine. Il/elle est dans ce rôle depuis X ans et je veux m'assurer qu'on a un plan clair — promo à court terme ou conversation honnête sur le timing. On risque de le/la perdre si on reste dans le flou." },
      { title:"Tech lead promu qui micromanage son équipe", tags:["Coaching","Management"], risk:"Modéré",
        situation:"Un excellent dev promu manager il y a 6 mois. L'équipe se plaint qu'il/elle s'implique dans chaque décision technique, annule les choix de l'équipe, et ne fait pas confiance aux juniors.",
        risks:["Attrition dans l'équipe si non adressé rapidement","Gestionnaire épuisé dans 12 mois — fait le travail de tout le monde","Perte de confiance de l'équipe envers le leadership"],
        actions:["Entretien individuel : qu'est-ce qui le/la pousse à s'impliquer dans les détails?","Données si disponibles : feedback équipe, signaux d'engagement","Plan de coaching sur le cadre de délégation","Objectif à 90 jours : décisions déléguées documentées, feedback équipe neutre ou positif"],
        msg:"Tu as clairement des standards élevés — c'est une force. Mon rôle est de t'aider à transposer ça en un style qui scale. Qu'est-ce qui te retient de faire plus confiance à l'équipe sur les décisions techniques?" },
      { title:"Engineering manager qui évite une conversation difficile", tags:["Coaching","PIP"], risk:"Élevé",
        situation:"Un dev underperformant depuis 4 mois. Le manager en parle à chaque bi-hebdo HRBP mais n'a jamais eu de conversation directe avec l'employé.",
        risks:["Équité envers le reste de l'équipe qui observe la situation","Escalade inévitable — plus c'est long, plus le PIP est difficile à justifier","Signal que le gestionnaire a besoin de coaching structuré en urgence"],
        actions:["Nommer le pattern directement : 'On parle de ça depuis 4 mois. La situation ne s'améliore pas seule.'","Jeu de rôle de la conversation avec le gestionnaire","Fixer une date dans les 7 jours","Offrir d'être présent si le gestionnaire le souhaite"],
        msg:"[Prénom] n'a pas eu de rétro claire sur ses lacunes depuis [X mois]. Si on ne lui donne pas la chance de comprendre maintenant, on sera dans une position très délicate si on doit prendre des mesures plus formelles. Est-ce qu'on peut planifier ça cette semaine — je peux être là si ça t'aide." },
      { title:"Permis fermé et promotion — Non-conformité potentielle", tags:["Immigration","Compliance"], risk:"Critique",
        situation:"Un gestionnaire annonce une promotion dans Workday sans consulter le HRBP. L'employé a un EIMT (permis fermé). Le nouveau titre et salaire ne correspondent plus au permis.",
        risks:["Non-conformité employeur si l'employé commence le nouveau rôle sans nouveau permis","Processus EIMT : 3-6 mois de délai — la promo est bloquée","Relation employé détériorée si la promo est annoncée puis bloquée"],
        actions:["Bloquer la mise à jour Workday immédiatement","Contacter Galileo dans les 24h","Communiquer au gestionnaire la contrainte sans paniquer","Préparer une communication à l'employé qui reconnaît la promotion tout en expliquant le délai"],
        msg:"Before we update [employee]'s profile in Workday, I need to flag an important step. Because [he/she] is on a closed work permit, any change in title or salary requires confirmation from our immigration firm first. I'm reaching out to Galileo today. Please hold off on any internal announcements — I'll have a clearer picture within 24-48h." },
      { title:"High performer — Flight risk identifié", tags:["Rétention","Talent"], risk:"Critique",
        situation:"Un directeur mentionne en bi-hebdo qu'un senior dev (case Étoile) a reçu une offre externe ou a été vu sur LinkedIn avec une mise à jour récente.",
        risks:["Perte d'un actif talent critique avec impact immédiat sur la roadmap","Effet de contagion — d'autres départs dans les 60 jours","Coût de remplacement estimé : 1.5–2x le salaire annuel"],
        actions:["Identifier le moteur réel AVANT d'agir — une offre financière ne retient pas quelqu'un qui part pour le gestionnaire","Évaluer les leviers disponibles vs. ce qu'on ne peut pas offrir","Proposer une conversation de rétention dans les 48h","Préparer un plan B si la rétention échoue : succession, knowledge transfer"],
        msg:"Je veux qu'on réagisse rapidement sur [prénom] — on a une fenêtre de quelques jours. J'ai besoin de savoir : (1) Quel est son compa-ratio actuel? (2) Avons-nous un budget hors-cycle? (3) Y a-t-il une opportunité de croissance à lui offrir? Je prépare une proposition d'ici 48h." },
      { title:"Conflit entre deux membres de la même équipe tech", tags:["Conflit","Relations"], risk:"Modéré",
        situation:"Deux développeurs ont des frictions récurrentes lors des code reviews et en réunions de planification. Le gestionnaire a tenté d'en parler en réunion d'équipe — ça a aggravé la situation.",
        risks:["Dégradation du climat d'équipe si non résolu","Risque de plainte formelle si les comportements escaladent","Départ d'un des deux si le conflit n'est pas résolu équitablement"],
        actions:["Rencontres individuelles séparées — ne pas les mettre en présence avant de comprendre","Recueillir les faits des deux côtés sans prendre parti","Évaluer : conflit de style ou conflit de valeurs profond?","Médiation structurée si les deux parties sont ouvertes"],
        msg:"J'ai pris connaissance des tensions entre [A] et [B]. Mon rôle est d'aider à restaurer un environnement de travail respectueux. Je vais rencontrer chaque personne séparément et confidentiellement avant de proposer une prochaine étape." },
      { title:"Employé en arrêt maladie — Plan de retour absent", tags:["CNESST","Accommodement"], risk:"Élevé",
        situation:"Un dev senior est en arrêt maladie depuis 6 semaines. Aucun plan de retour progressif n'a été initié. Le gestionnaire attend que l'employé soit 'à 100%' avant de le réintégrer.",
        risks:["Non-conformité CNESST — obligation d'offrir un retour progressif","Prolongation possible de l'arrêt si aucune mesure d'accommodation","Plainte potentielle si l'employé perçoit que l'employeur ne facilite pas le retour"],
        actions:["Initier le processus de retour progressif avec le médecin traitant","Coacher le gestionnaire : le 100% n'est pas requis pour commencer","Proposer des accommodements raisonnables documentés","Documenter toutes les mesures offertes — protection légale critique"],
        msg:"Je veux qu'on initie le plan de retour progressif pour [prénom] cette semaine. L'obligation légale de l'employeur est d'offrir des mesures d'accommodation — attendre le 100% n'est pas conforme. Je te prépare une checklist d'accommodements et un template de plan de retour." },
    ];
    const copied = copiedCase; const setCopied = setCopiedCase;
    return (
      <div>
        <p style={{ fontSize:13, color:C.textM, marginBottom:14, lineHeight:1.6 }}>
          Les 7 situations RH les plus fréquentes en contexte IT corporate — risques, actions recommandées et message prêt à envoyer.
        </p>
        {cases.map((c,i) => {
          const rc = RC[c.risk] || C.blue;
          const isOpen = openCase === i;
          return (
            <div key={i} style={{ border:`1px solid ${C.border}`, borderLeft:`3px solid ${rc}`,
              borderRadius:10, marginBottom:8, overflow:"hidden" }}>
              <div onClick={()=>setOpenCase(isOpen ? null : i)} style={{ padding:"12px 16px",
                cursor:"pointer", background:isOpen ? rc+"08" : C.surfL }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ flex:1, marginRight:10 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:5 }}>{c.title}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {c.tags.map((t,j)=><span key={j} style={{ background:C.blue+"15", color:C.blue,
                        border:`1px solid ${C.blue}30`, borderRadius:20, padding:"1px 8px", fontSize:10, fontWeight:600 }}>{t}</span>)}
                      <span style={{ background:rc+"15", color:rc, border:`1px solid ${rc}30`,
                        borderRadius:20, padding:"1px 8px", fontSize:10, fontWeight:600 }}>Risque : {c.risk}</span>
                    </div>
                  </div>
                  <span style={{ color:C.textD, fontSize:16 }}>{isOpen?"−":"+"}</span>
                </div>
              </div>
              {isOpen && (
                <div style={{ padding:"14px 16px", borderTop:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginBottom:12,
                    background:C.surfL, borderRadius:7, padding:"10px 13px" }}>{c.situation}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:C.red, textTransform:"uppercase",
                        letterSpacing:1, marginBottom:6 }}>Risques</div>
                      <KList items={c.risks} color={C.red} icon="⚠"/>
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:C.em, textTransform:"uppercase",
                        letterSpacing:1, marginBottom:6 }}>Actions recommandées</div>
                      <KList items={c.actions} color={C.em}/>
                    </div>
                  </div>
                  <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.textD, textTransform:"uppercase", letterSpacing:1 }}>Message suggéré</div>
                      <button onClick={()=>{ navigator.clipboard.writeText(c.msg); setCopied(i); setTimeout(()=>setCopied(null),2000); }}
                        style={{ background:copied===i?C.em:C.blue+"15", color:copied===i?"#fff":C.blue,
                          border:`1px solid ${C.blue}30`, borderRadius:6, padding:"3px 10px", fontSize:11,
                          fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                        {copied===i?"✓ Copié":"Copier"}
                      </button>
                    </div>
                    <div style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
                      padding:"10px 13px", fontSize:12, color:C.textM, lineHeight:1.7, fontStyle:"italic" }}>
                      {c.msg}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderTemplates() {
    const TMPLS = [
      { title:"Post-conversation de performance (FR)", badge:"Performance FR", color:C.blue,
        body:`Bonjour [Prénom],

Merci pour notre échange d'aujourd'hui. Je voulais te faire parvenir un résumé de notre conversation pour assurer notre compréhension commune.

Ce que nous avons discuté :
[Décrire les préoccupations de performance — faits, dates, comportements observés]

Attentes convenues :
- [Attente 1 — spécifique et mesurable]
- [Attente 2]
- [Attente 3]

Soutien offert : [Coaching, formation, pair programming, ressources disponibles]

Prochaine étape : rencontre de suivi prévue le [date].

[Signature]` },
      { title:"Post-performance conversation (EN)", badge:"Performance EN", color:C.blue,
        body:`Hi [First name],

Thank you for our conversation today. I wanted to send a summary to make sure we are aligned on what was discussed.

What we covered:
[Brief description of the performance concerns — factual, specific, dated]

Agreed expectations:
- [Expectation 1 — specific and measurable]
- [Expectation 2]
- [Expectation 3]

Support available: [Coaching, training, pair programming, resources]

Next step: follow-up meeting scheduled for [date].

[Signature]` },
      { title:"Rappel permis immigration — Gestionnaire (FR)", badge:"Immigration FR", color:C.em,
        body:`Bonjour [Prénom],

Je t'écris concernant [employé], dont le permis de travail arrive à expiration le [date].

Ce que je coordonne :
- Liaison avec notre cabinet d'immigration (Galileo)
- Vérification que les conditions du permis sont toujours conformes

Ce que j'ai besoin de toi :
- Confirmer que le titre et le salaire de [prénom] n'ont pas changé depuis le dernier permis
- Signer la lettre d'emploi que le cabinet te fera parvenir d'ici [date]

Calendrier :
- D'ici le [J-60] : collecte des documents
- D'ici le [J-30] : soumission de la demande
- [Date expiration] : statut implicite si demande soumise avant cette date

[Signature]` },
      { title:"Work permit reminder — Manager (EN)", badge:"Immigration EN", color:C.em,
        body:`Hi [Manager's name],

I'm reaching out regarding [employee], whose work permit expires on [date].

On my end:
- Coordinating with our immigration firm (Galileo)
- Confirming current permit conditions remain aligned with the role

What I need from you:
- Confirm that [employee]'s job title and salary have not changed since the last permit
- Sign the employment letter the firm will send you by [date]

Timeline:
- By [J-60]: document collection
- By [J-30]: application submission
- [Expiry date]: implied status if application submitted before this date

[Signature]` },
      { title:"Coaching difficile — Gestionnaire (FR)", badge:"Coaching FR", color:"#7c3aed",
        body:`Bonjour [Prénom],

J'aimerais qu'on prenne le temps de se parler cette semaine.

J'ai quelques observations à partager avec toi concernant [enjeu / équipe / situation]. Ce n'est pas la conversation la plus facile à avoir, mais c'est précisément parce que je veux que tu réussisses dans ce rôle que je veux l'avoir avec toi.

[Description factuelle : quoi, quand, impact observé]

Ce que j'aimerais qu'on explore :
- [Question de coaching 1]
- [Question de coaching 2]

Disponible pour se rencontrer [jour / créneau]?

[Signature]` },
      { title:"Flight risk — Message au directeur (FR/EN)", badge:"Rétention Bilingue", color:C.blue,
        body:`--- PRÉPARATION HRBP (confidentiel) ---
Employé : [Nom, Rôle, case 9-box]
Signal : [LinkedIn / offre verbalisée / départ d'un pair]
Moteur probable : [compensation / croissance / gestionnaire / culture]
Leviers disponibles : [augmentation hors-cycle / nouveau projet / titre / flexibilité]

--- MESSAGE AU DIRECTEUR (FR) ---
Je veux qu'on réagisse rapidement sur [prénom] — on a une fenêtre de quelques jours.
J'ai besoin de savoir : (1) Quel est son compa-ratio actuel?
(2) Avons-nous un budget pour une révision hors-cycle?
(3) Y a-t-il un projet ou une opportunité de croissance à lui offrir?
Je prépare une proposition d'ici 48h.

--- MESSAGE TO DIRECTOR (EN) ---
I want us to move quickly on [name] — we have a short window here.
I need to know: (1) What is [his/her] current compa-ratio?
(2) Do we have budget for an off-cycle review?
(3) Is there a project or growth opportunity we can offer?
I'll have a retention proposal ready within 48 hours.` },
      { title:"Note de dossier — Discipline (FR)", badge:"Documentation FR", color:C.amber,
        body:`NOTE DE DOSSIER CONFIDENTIELLE
Date : [JJ/MM/AAAA]
Type : [Coaching informel / Avertissement verbal / Avertissement écrit]
Employé : [Nom, Titre, Département]
Gestionnaire : [Nom, Titre]
Rédigé par : Samuel Chartrand, HRBP

1. CONTEXTE
[Historique pertinent en 2-3 phrases]

2. FAITS OBSERVÉS (sans interprétation)
[Comportements ou résultats observés avec dates et exemples spécifiques]

3. CONTENU DE LA RENCONTRE
Ce qui a été communiqué : [description]
Réaction de l'employé : [description]

4. ATTENTES COMMUNIQUÉES
- [Attente 1]
- [Attente 2]
Échéance de suivi : [date]

5. PROCHAINES ÉTAPES
[ ] [Action] — Responsable : _____ — Échéance : _____

Signature HRBP : __________ Date : _____
Signature gestionnaire : _____ Date : _____` },
    ];
    const sel = templateSel; const setSel = setTemplateSel;
    const copied = templateCopied; const setCopied = setTemplateCopied;
    return (
      <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
        <div style={{ width:210, flexShrink:0 }}>
          {TMPLS.map((t,i)=>(
            <button key={i} onClick={()=>setSel(i)} style={{ width:"100%",
              background:sel===i ? C.blue+"12" : C.surfL,
              border:`1px solid ${sel===i?C.blue:C.border}`, borderRadius:8,
              padding:"10px 12px", textAlign:"left", cursor:"pointer", marginBottom:6, fontFamily:"inherit" }}>
              <div style={{ fontSize:12, fontWeight:600, color:sel===i?C.blue:C.text,
                lineHeight:1.3, marginBottom:4 }}>{t.title}</div>
              <span style={{ background:t.color+"15", color:t.color, border:`1px solid ${t.color}30`,
                borderRadius:20, padding:"1px 7px", fontSize:9, fontWeight:700 }}>{t.badge}</span>
            </button>
          ))}
        </div>
        <div style={{ flex:1, minWidth:280 }}>
          <div style={{ border:`1px solid ${C.border}`, borderLeft:`3px solid ${TMPLS[sel].color}`,
            borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", background:TMPLS[sel].color+"08",
              borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{TMPLS[sel].title}</div>
                <span style={{ background:TMPLS[sel].color+"15", color:TMPLS[sel].color,
                  border:`1px solid ${TMPLS[sel].color}30`, borderRadius:20, padding:"1px 7px",
                  fontSize:9, fontWeight:700, marginTop:4, display:"inline-block" }}>{TMPLS[sel].badge}</span>
              </div>
              <button onClick={()=>{ navigator.clipboard.writeText(TMPLS[sel].body); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
                style={{ background:copied?C.em:C.blue, color:"#fff", border:"none", borderRadius:7,
                  padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                {copied?"✓ Copié!":"Copier"}
              </button>
            </div>
            <pre style={{ background:C.surfL, padding:"14px 16px", fontSize:12, lineHeight:1.7,
              color:C.textM, whiteSpace:"pre-wrap", wordBreak:"break-word", fontFamily:"inherit",
              margin:0, maxHeight:440, overflowY:"auto" }}>{TMPLS[sel].body}</pre>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN RENDER ────────────────────────────────────────────────────────────

  const RENDERERS = {
    home:renderHome, rhythms:renderRhythms, model:renderModel, onboarding:renderOnboarding,
    performance:renderPerformance, pip:renderPip, coaching:renderCoaching,
    development:renderDevelopment, compensation:renderCompensation,
    immigration:renderImmigration, legal:renderLegal, analytics:renderAnalytics,
    cases:renderCases, templates:renderTemplates,
  };

  const current = SECTIONS.find(s => s.id === activeSection);

  return (
    <div style={{ maxWidth:980, margin:"0 auto" }}>
      {/* Search bar */}
      <div style={{ marginBottom:16, position:"relative" }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)",
          fontSize:15, pointerEvents:"none" }}>🔍</span>
        <input value={search} onChange={e=>{ setSearch(e.target.value); }}
          placeholder="Rechercher dans la Base de connaissances..."
          style={{ width:"100%", padding:"10px 14px 10px 38px", borderRadius:10, boxSizing:"border-box",
            border:`1px solid ${C.border}`, fontSize:13, fontFamily:"inherit",
            background:C.surfL, color:C.text, outline:"none" }}
          onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>
        {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:12, top:"50%",
          transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer",
          color:C.textD, fontSize:16 }}>×</button>}
      </div>

      {/* Search results */}
      {search.trim().length > 1 && (
        <div style={{ marginBottom:16 }}>
          {searchResults.length === 0
            ? <div style={{ fontSize:12, color:C.textD, padding:"8px 0" }}>Aucun résultat pour "{search}"</div>
            : <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {searchResults.map(s=>(
                  <button key={s.id} onClick={()=>{ setActiveSection(s.id); setSearch(""); }}
                    style={{ background:C.blue+"12", color:C.blue, border:`1px solid ${C.blue}30`,
                      borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600,
                      cursor:"pointer", fontFamily:"inherit" }}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
          }
        </div>
      )}

      {/* Nav breadcrumb + back */}
      {activeSection !== "home" && (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={()=>setActiveSection("home")} style={{ background:C.surfL,
            border:`1px solid ${C.border}`, borderRadius:7, padding:"5px 12px", fontSize:12,
            cursor:"pointer", color:C.textM, fontFamily:"inherit" }}>← Vue d'ensemble</button>
          <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{current?.icon} {current?.label}</span>
        </div>
      )}

      {/* Section nav pills (when on home or section) */}
      {activeSection === "home" ? null : (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
          {SECTIONS.filter(s=>s.id!=="home" && s.group===current?.group).map(s=>(
            <button key={s.id} onClick={()=>setActiveSection(s.id)} style={{
              background: s.id===activeSection ? C.blue : C.surfL,
              color: s.id===activeSection ? "#fff" : C.textM,
              border:`1px solid ${s.id===activeSection ? C.blue : C.border}`,
              borderRadius:20, padding:"5px 12px", fontSize:11, fontWeight:600,
              cursor:"pointer", fontFamily:"inherit" }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {RENDERERS[activeSection] && RENDERERS[activeSection]()}
    </div>
  );
}
