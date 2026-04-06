import { useState, useRef, useEffect, useCallback } from "react";

// ── FONTS ─────────────────────────────────────────────────────────────────────
// Inject Google Fonts via link tag (avoids @import issues in artifact context)
if (typeof document !== "undefined" && !document.getElementById("hrbp-fonts")) {
  const link = document.createElement("link");
  link.id = "hrbp-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}
const FONTS = "";

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const C = {
  bg:"#0c0f16", surf:"#131720", surfL:"#181f2e", surfLL:"#1e2738",
  border:"#1a2840", borderL:"#243350", borderLL:"#2d3f60",
  em:"#10b981", emD:"#065f46", emL:"#34d399",
  red:"#ef4444", redD:"#991b1b",
  amber:"#f59e0b", amberD:"#92400e",
  blue:"#3b82f6", blueD:"#1e40af",
  purple:"#8b5cf6", purpleD:"#5b21b6",
  teal:"#06b6d4", pink:"#ec4899",
  text:"#e2e8f0", textM:"#8899aa", textD:"#3d5068",
};

const RISK = {
  "Critique":{ color:C.red,   bg:"#ef444412" },
  "Élevé":   { color:C.amber, bg:"#f59e0b12" },
  "Eleve":   { color:C.amber, bg:"#f59e0b12" },
  "Élevé":   { color:C.amber, bg:"#f59e0b12" },
  "Modéré":  { color:C.blue,  bg:"#3b82f612" },
  "Modere":  { color:C.blue,  bg:"#3b82f612" },
  "Faible":  { color:C.em,    bg:"#10b98112" },
};
// Normalize risk level strings from AI (unaccented → accented display key)
function normalizeRisk(r) {
  if (!r) return "Modéré";
  const map = { "Critique":"Critique","Eleve":"Élevé","Elevé":"Élevé","Élevé":"Élevé","Eleve":"Élevé",
    "Modere":"Modéré","Modéré":"Modéré","Moderé":"Modéré","Faible":"Faible","faible":"Faible" };
  return map[r] || r;
}
// Normalize delay strings
function normalizeDelay(d) {
  if (!d) return d;
  const map = { "Immediat":"Immédiat","Immédiat":"Immédiat","Immediate":"Immédiat",
    "24h":"24h","7 jours":"7 jours","30 jours":"30 jours","Continu":"Continu","Hebdo":"Continu" };
  return map[d] || d;
}
// ISO date storage helper — always store as YYYY-MM-DD
function toISO(d) {
  if (!d) return new Date().toISOString().split("T")[0];
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // Handle DD/MM/YYYY (fr-CA locale format)
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  try { return new Date(d).toISOString().split("T")[0]; } catch { return d; }
}
// Display date in fr-CA locale from ISO string
function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("fr-CA"); } catch { return iso; }
}

const PROVINCES = ["QC","ON","AB","BC","MB","SK","NS","NB","NL","PE"];

function getProvince(item, profile) {
  return item?.province || profile?.defaultProvince || "QC";
}

function getLegalContext(province) {
  const map = {
    QC: "Quebec employment standards — LNT, CNESST, Charte des droits et libertes, LSST",
    ON: "Ontario Employment Standards Act (ESA) framework",
    AB: "Alberta Employment Standards Code framework",
    BC: "British Columbia Employment Standards Act framework",
    MB: "Manitoba Employment Standards Code framework",
    SK: "Saskatchewan Employment Act framework",
    NS: "Nova Scotia Labour Standards Code framework",
    NB: "New Brunswick Employment Standards Act framework",
    NL: "Newfoundland and Labrador Labour Standards Act framework",
    PE: "Prince Edward Island Employment Standards Act framework",
  };
  return map[province] || map["QC"];
}

const LEGAL_GUARDRAIL = `
CADRE LEGAL APPLICABLE:
Applique uniquement le cadre legal et les normes d emploi de la province selectionnee.
Ne pas melanger les provinces.
Si la province est manquante ou incertaine, indiquer clairement que l analyse legale est incomplete.
Distinguer clairement entre:
1) Normes minimales legislatives
2) Politique de l entreprise
3) Recommandation HRBP
4) Enjeux necessitant une revision par un conseiller juridique
`;

function buildLegalPromptContext(province) {
  const prov = province || "QC";
  const legalCtx = getLegalContext(prov);
  return `Province: ${prov}
Cadre legal: ${legalCtx}
Juridiction: Normes d emploi provinciales — Canada

${LEGAL_GUARDRAIL}`;
}

// Legal-sensitive keyword detector
function isLegalSensitive(text) {
  if (!text) return false;
  return /disciplin|terminaison|congedier|congedie|licencier|licenciem|demission|cessation|abandon|fin d.emploi|fin de l.emploi|harcel|plainte|grief|accommod|invalidit|arret.de.travail|maladie|absences?|conge|LNT|CNESST|norme.*travail|heures.suppl|overtime|vacances|cong.annuel|remuneration|salaire|conge.paternit|conge.maternit|conge.parent|commission|represailles|denonciateur|whistleblow|discrimination|equite|salariale|clause|non.concurrence|probation|avantage|assurance|SST|LSST|ergon|enquete|investigation|legal|juridique|droit|loi |legislat/i.test(text);
}

function ProvinceSelect({ value, onChange, style={} }) {
  return (
    <select value={value||"QC"} onChange={onChange}
      style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
        padding:"9px 10px", color:C.text, fontSize:13,
        fontFamily:"'DM Sans',sans-serif", outline:"none", cursor:"pointer", ...style }}>
      {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}

function ProvinceBadge({ province }) {
  return (
    <span style={{ background:C.surfLL, border:`1px solid ${C.borderL}`,
      borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:700,
      color:C.textM, fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>
      {province||"QC"}
    </span>
  );
}

const DELAY_C = { "Immédiat":C.red, "Immediat":C.red, "24h":C.amber, "7 jours":C.blue, "30 jours":C.teal, "Continu":C.em, "Hebdo":C.em, "Cette semaine":C.amber, "J0":C.em, "Avant":C.blue };

// ── STORAGE ───────────────────────────────────────────────────────────────────
const SK = {
  cases:          "hrbp_os:cases",
  meetings:       "hrbp_os:meetings",
  signals:        "hrbp_os:signals",
  decisions:      "hrbp_os:decisions",
  coaching:       "hrbp_os:coaching",
  exits:          "hrbp_os:exits",
  investigations: "hrbp_os:investigations",
  briefs:         "hrbp_os:briefs",
  prep1on1:       "hrbp_os:prep1on1",
  profile:        "hrbp_os:profile",
  sentRecaps:       "hrbp_os:sentRecaps",
  nextWeekLocks:    "hrbp_os:nextWeekLocks",
  portfolio:      "hrbp_os:portfolio",
  radars:         "hrbp_os:radars",
  plans306090:     "hrbp_os:plans306090",
};

async function sGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch { return null; }
}
async function sSet(key, val) {
  try {
    if (val === undefined) return;
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { console.warn("sSet failed for key:", key, e); }
}

// ── SHARED UI ─────────────────────────────────────────────────────────────────
const css = {
  input: { width:"100%", background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
    padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:"none", transition:"border-color .15s" },
  textarea: { width:"100%", background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
    padding:"10px 13px", color:C.text, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:"none", resize:"vertical", lineHeight:1.7, transition:"border-color .15s" },
  select: { width:"100%", background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
    padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:"none", cursor:"pointer" },
  btn: (color=C.em, outline=false) => ({
    background: outline ? "none" : color, color: outline ? color : C.bg,
    border:`1px solid ${color}${outline?"99":""}`, borderRadius:7,
    padding:"9px 18px", fontWeight:600, fontSize:13, cursor:"pointer",
    fontFamily:"'DM Sans',sans-serif", transition:"all .15s",
  }),
  card: { background:C.surfL, border:`1px solid ${C.border}`, borderRadius:10, padding:"16px 18px" },
};

function Badge({ label, color, size=10 }) {
  return <span style={{ background:color+"22", color, border:`1px solid ${color}44`,
    borderRadius:4, padding:"2px 8px", fontSize:size, fontWeight:600,
    fontFamily:"'DM Mono',monospace", letterSpacing:.4, whiteSpace:"nowrap" }}>{label}</span>;
}
function RiskBadge({ level }) {
  const norm = normalizeRisk(level);
  const r = RISK[norm] || RISK["Modéré"];
  return <Badge label={norm} color={r.color} />;
}
function Mono({ children, size=9, color=C.textD }) {
  return <span style={{ fontFamily:"'DM Mono',monospace", fontSize:size, color, letterSpacing:1.5, textTransform:"uppercase" }}>{children}</span>;
}
function Divider({ my=12 }) { return <div style={{ height:1, background:C.border, margin:`${my}px 0` }} />; }
function Card({ children, style={} }) {
  return <div style={{ ...css.card, ...style }}>{children}</div>;
}
function SecHead({ icon, label, color=C.em }) {
  return <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${color}28` }}>
    <span style={{ fontSize:14 }}>{icon}</span>
    <Mono size={10} color={color}>{label}</Mono>
  </div>;
}
function BulletList({ items, color=C.em }) {
  if (!items?.length) return null;
  return <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
    {items.map((item,i) => <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
      <div style={{ width:5, height:5, borderRadius:"50%", background:color, flexShrink:0, marginTop:7 }} />
      <span style={{ fontSize:13, color:C.text, lineHeight:1.65 }}>
        {typeof item==="string" ? item : item.text || JSON.stringify(item)}
      </span>
    </div>)}
  </div>;
}
function SavedToast({ show }) {
  if (!show) return null;
  return <div style={{ position:"fixed", bottom:20, right:20, background:C.em, color:C.bg,
    borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, zIndex:9999,
    fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 20px #10b98140" }}>
    ✓ Sauvegardé
  </div>;
}

function AILoader({ label="Analyse en cours" }) {
  return <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"60px 20px", gap:16 }}>
    <div style={{ width:32, height:32, border:`2px solid ${C.surfLL}`, borderTop:`2px solid ${C.em}`,
      borderRadius:"50%", animation:"spin 1s linear infinite" }} />
    <Mono color={C.textD}>{label}</Mono>
  </div>;
}


// Normalize AI-returned data objects — fix accents, dates, missing fields
function normalizeAIData(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = { ...obj };
  // Normalize risk fields
  const riskFields = ["overallRisk","riskLevel","level","urgencyLevel","risque"];
  riskFields.forEach(f => { if (clone[f]) clone[f] = normalizeRisk(clone[f]); });
  // Normalize delay fields
  const delayFields = ["delay","urgency"];
  delayFields.forEach(f => { if (clone[f]) clone[f] = normalizeDelay(clone[f]); });
  // Recurse into arrays
  Object.keys(clone).forEach(k => {
    if (Array.isArray(clone[k])) clone[k] = clone[k].map(v => typeof v === "object" && v !== null ? normalizeAIData(v) : v);
    else if (clone[k] && typeof clone[k] === "object") clone[k] = normalizeAIData(clone[k]);
  });
  return clone;
}
// ── AI HELPERS ────────────────────────────────────────────────────────────────


// Core fetch — calls /api/chat (Vercel proxy with API key)
async function _apiFetch(system, userContent, maxTokens) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        system: system,
        max_tokens: maxTokens || 2000,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    clearTimeout(tid);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "Erreur API");
    const text = data.content?.map(b => b.text || "").join("").trim() || "";
    if (!text) throw new Error("Réponse vide — réessaie.");
    return text;
  } catch(e) {
    clearTimeout(tid);
    if (e.name === "AbortError") throw new Error("Délai dépassé (60s) — raccourcis le transcript.");
    throw e;
  }
}

// callAIText — free-form text (Copilot)
async function callAIText(system, userContent, maxTokens=4000) {
  return _apiFetch(system, userContent, maxTokens);
}

// callAIJson — structured JSON response
async function callAIJson(system, userContent, maxTokens=2000) {
  const raw = await _apiFetch(system, userContent, maxTokens);
  const clean = raw.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"").trim();
  const src = (clean.match(/\{[\s\S]*/) || [clean])[0];
  const repair = (s) => {
    const ob = (s.match(/\{/g)||[]).length-(s.match(/\}/g)||[]).length;
    const ab = (s.match(/\[/g)||[]).length-(s.match(/\]/g)||[]).length;
    return s.replace(/,\s*([}\]])/g,"$1")+"]".repeat(Math.max(0,ab))+"}".repeat(Math.max(0,ob));
  };
  try { return JSON.parse(src); } catch {
    try { return JSON.parse(repair(src)); }
    catch(e2) { throw new Error("Erreur JSON — réessaie. "+e2.message); }
  }
}

// callAI — legacy wrapper (ModuleMeetings + others)
async function callAI(systemPrompt, userPrompt, transcriptLen=0) {
  const maxTokens = transcriptLen > 30000 ? 4000 : transcriptLen > 10000 ? 3000 : 2000;
  const doFetch = (sp, up, tokens) => _apiFetch(sp, up, tokens);

  const repairJSON = (s) => {
    let pF="",pI=false,pE=false;
    for(let i=0;i<s.length;i++){const c=s[i];if(pE){pF+=c;pE=false;continue;}if(c==="\\"&&pI){pF+=c;pE=true;continue;}if(c==='"'){pI=!pI;pF+=c;continue;}if(pI&&(c==="\n"||c==="\r"||c==="\t")){pF+="\\n";continue;}pF+=c;}
    s=pF; s=s.replace(/,\s*([}\]])/g,"$1");
    let out="",inStr=false,esc=false,ls=0,br=0,bk=0;
    for(let i=0;i<s.length;i++){const c=s[i];if(esc){out+=c;esc=false;continue;}if(c==="\\"&&inStr){out+=c;esc=true;continue;}if(c==='"'){inStr=!inStr;out+=c;if(!inStr)ls=out.length;continue;}if(inStr){out+=(c==="'")?"\u0027":c;continue;}if(c==="{")br++;else if(c==="[")bk++;else if(c==="}"){br--;ls=out.length+1;}else if(c==="]"){bk--;ls=out.length+1;}else if(c===","||c===":")ls=out.length+1;out+=c;}
    if(inStr&&ls>0){out=out.substring(0,ls);br=0;bk=0;let iS=false,es=false;for(let i=0;i<out.length;i++){const c=out[i];if(es){es=false;continue;}if(c==="\\"&&iS){es=true;continue;}if(c==='"'){iS=!iS;continue;}if(iS)continue;if(c==="{")br++;else if(c==="}")br--;if(c==="[")bk++;else if(c==="]")bk--;}}else if(br>0||bk>0){const lB=out.lastIndexOf("},"),lK=out.lastIndexOf("],");const cut=Math.max(lB,lK);if(cut>out.length*0.4)out=out.substring(0,cut+1);}
    return out+"]".repeat(Math.max(0,bk))+"}".repeat(Math.max(0,br));
  };

  const tryParse = (raw) => {
    const clean = raw.replace(/^```json?\s*/i,"").replace(/```\s*$/,"").trim();
    try { return JSON.parse(clean); } catch {}
    try { return JSON.parse(repairJSON(clean)); } catch {}
    const m = clean.match(/\{[\s\S]*/);
    if (m) try { return JSON.parse(repairJSON(m[0])); } catch {}
    return null;
  };

  const raw = await doFetch(systemPrompt, userPrompt, maxTokens);
  const result = tryParse(raw);
  if (result) return normalizeAIData(result);
  const errMsg = (!raw||raw.length<20) ? "Réponse vide — relance." : "Erreur JSON — relance.";
  throw new Error(errMsg);
}

const MEETING_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Quebec. Analyse le transcript de reunion et reponds UNIQUEMENT en JSON valide.
Aucun texte avant ou apres. Aucun backtick. Aucune apostrophe dans les valeurs JSON.
{"meetingTitle":"titre court","director":"nom ou null","meetingDate":"date si mentionnee ou null","overallRisk":"Critique|Eleve|Modere|Faible","overallRiskRationale":"1 phrase","summary":["point cle 1","point cle 2","point cle 3"],"people":{"performance":["observation"],"leadership":["observation"],"engagement":["observation"]},"signals":[{"signal":"description","interpretation":"sens organisationnel","category":"Culture|Leadership|Retention|Performance"}],"risks":[{"risk":"description","level":"Eleve|Modere|Faible","rationale":"contexte et impact"}],"actions":[{"action":"action concrete","delay":"Immediat|7 jours|30 jours|Continu","owner":"HRBP|Gestionnaire|HRBP + Gestionnaire"}],"questions":[{"question":"question pour prochain meeting","why":"objectif strategique","target":"Directeur|Gestionnaire"}],"crossQuestions":[{"person":"nom","role":"titre","relationship":"lien avec le directeur","context":"pourquoi pertinent","questions":[{"question":"question","angle":"angle RH","objective":"ce qu on veut etablir"}]}],"caseEntry":{"title":"titre neutre","type":"Performance|Retention|Coaching|Conflit|Autre","riskLevel":"Modere","situation":"description factuelle","interventionsDone":"","hrPosition":"recommandation","nextFollowUp":"","notes":""}}`;

const DISC_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Quebec. Analyse ce transcript de rencontre disciplinaire ou pre-disciplinaire.
Reponds UNIQUEMENT en JSON valide. Aucun texte avant ou apres. Aucun backtick. Aucune apostrophe dans les valeurs JSON.
{
  "meetingTitle": "titre court neutre — type rencontre + contexte sans nom",
  "director": "gestionnaire present ou null",
  "meetingDate": "date si mentionnee ou null",
  "typeRencontre": "Avis verbal|Avis ecrit|Avis final|Suspension|Conge impose|Rencontre investigatoire|Rencontre pre-disciplinaire|Terminaison",
  "overallRisk": "Critique|Eleve|Modere|Faible",
  "overallRiskRationale": "1 phrase — nature du risque principal",
  "summary": ["point factuel 1", "point factuel 2", "point factuel 3"],
  "faits": {
    "reproches": ["reproche ou manquement identifie — factuel, sans jugement"],
    "positionEE": ["element souleve par l employe en sa defense"],
    "reconnaissances": ["element reconnu ou admis par l employe"],
    "contestations": ["element conteste par l employe"]
  },
  "cadreJuridique": {
    "politiquesVisees": ["politique ou procedure enfreinte"],
    "loisApplicables": ["reference legale applicable — LNT, Charte, Code civil, LSST"],
    "progressiviteSanction": "respectee|a justifier|non applicable",
    "progressiviteNote": "explication si a justifier ou non applicable"
  },
  "risquesLegaux": [
    {"risque": "description du risque", "niveau": "Eleve|Modere|Faible", "mitigation": "action recommandee"}
  ],
  "sanctionImposee": {
    "type": "type de sanction ou null si pre-disciplinaire",
    "duree": "duree si applicable ou null",
    "conditionsRetour": ["condition imposee — ex: atteindre X objectif, suivre formation"],
    "periodesuivi": "periode de suivi imposee ou null"
  },
  "documentationRequise": [
    {"document": "nom du document a produire", "delai": "delai de production", "responsable": "HRBP|Gestionnaire|Les deux"}
  ],
  "actions": [
    {"action": "action concrete", "delay": "Immediat|24h|7 jours|30 jours", "owner": "HRBP|Gestionnaire|HRBP + Gestionnaire"}
  ],
  "pointsVigilance": ["element a surveiller — comportement, indicateur, risque de recidive"],
  "prochaineSanction": "si recidive — quelle serait la prochaine etape logique selon progressivite",
  "notes": "observations internes HRBP — 1-2 phrases — ce que tu retiens strategiquement"
}`;

const MEETING_SP_MINIMAL = `Tu es un assistant RH. Reponds UNIQUEMENT en JSON valide. Aucun texte avant ou apres. Aucun backtick. Aucune apostrophe dans les valeurs.
{"meetingTitle":"titre","director":"nom ou null","overallRisk":"Critique|Eleve|Modere|Faible","overallRiskRationale":"1 phrase","summary":["point 1","point 2","point 3"],"people":{"performance":["obs"],"leadership":["obs"],"engagement":["obs"]},"signals":[{"signal":"desc","interpretation":"sens","category":"Culture|Leadership|Retention|Performance"}],"risks":[{"risk":"desc","level":"Eleve|Modere|Faible","rationale":"contexte"}],"actions":[{"action":"action","delay":"Immediat|7 jours|Continu","owner":"HRBP|Gestionnaire"}],"questions":[{"question":"question","why":"pourquoi","target":"Directeur|Gestionnaire"}],"crossQuestions":[],"caseEntry":{"title":"titre","type":"Performance|Retention|Coaching|Autre","riskLevel":"Modere","situation":"situation","interventionsDone":"","hrPosition":"recommandation","nextFollowUp":"","notes":""}}`;

const TA_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Quebec. Analyse ce transcript de reunion Talent Acquisition.
Reponds UNIQUEMENT en JSON valide. Aucun texte avant ou apres. Aucun backtick. Aucune apostrophe dans les valeurs JSON.
Extrais chaque poste mentionne et son etat d avancement. Sois precis sur les etapes TA (Sourcing, Entrevues RH, Entrevues techniques, Offre, Acceptee, Fermee, En attente).
{
  "meetingTitle": "titre court incluant semaine ou date si mentionnee",
  "director": "nom du partenaire TA ou recruteur principal ou null",
  "meetingDate": "date si mentionnee ou null",
  "overallRisk": "Critique|Eleve|Modere|Faible",
  "overallRiskRationale": "1 phrase sur l etat global du pipeline",
  "summary": ["point 1", "point 2", "point 3"],
  "postes": [
    {
      "titre": "titre exact du poste",
      "equipe": "equipe ou departement IT",
      "responsable": "recruteur ou nom si mentionne ou null",
      "etape": "Sourcing|Entrevues RH|Entrevues techniques|Debrief|Offre|Acceptee|En attente|Fermee|Annulee",
      "statutDetail": "description courte de ou on en est — 1 phrase",
      "candidats": "nombre si mentionne ou null",
      "priorite": "Critique|Elevee|Normale|Basse",
      "risque": "Eleve|Modere|Faible",
      "risqueDetail": "enjeu principal si present ou null",
      "dateOuverture": "date si mentionnee ou null",
      "dateCible": "date cible de comblement si mentionnee ou null",
      "changementSemaine": "ce qui a change depuis la derniere fois — 1 phrase ou null",
      "prochainePriorite": "prochaine action concrete sur ce poste"
    }
  ],
  "blocages": [
    {"blocage": "description", "postesConcernes": ["titre poste"], "actionRequise": "action recommandee", "owner": "TA|HRBP|Gestionnaire|Externe"}
  ],
  "actions": [
    {"action": "action concrete", "delay": "Immediat|7 jours|30 jours|Continu", "owner": "HRBP|TA|Gestionnaire", "poste": "titre poste concerne ou null"}
  ],
  "metriques": {
    "postesActifs": 0,
    "enOffre": 0,
    "fermes": 0,
    "joursOuvertureMoyen": "nombre ou null",
    "risquesPipeline": ["risque global 1", "risque global 2"]
  },
  "questions": [
    {"question": "question pour prochain meeting TA", "why": "objectif", "poste": "poste concerne ou null"}
  ]
}`;

const INIT_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Quebec. Analyse ce transcript de meeting de suivi d initiatives RH ou organisationnelles.
Reponds UNIQUEMENT en JSON valide. Aucun texte avant ou apres. Aucun backtick. Aucune apostrophe dans les valeurs JSON.
Extrais chaque initiative mentionnee avec son etat d avancement, blocages et prochaines etapes.
{"meetingTitle":"titre incluant semaine ou date","director":"facilitateur ou null","meetingDate":"date ou null","overallRisk":"Critique|Eleve|Modere|Faible","overallRiskRationale":"1 phrase sur l etat global du portefeuille","summary":["point 1","point 2","point 3"],"initiatives":[{"nom":"nom exact","categorie":"Performance|Talent|Culture|Processus RH|Leadership|Engagement|Technologie|Conformite|Autre","responsable":"nom ou role ou null","statut":"Planifiee|En cours|En attente|Bloquee|Completee|Annulee","avancement":"0-25%|25-50%|50-75%|75-100%|Complete","statutDetail":"ou on en est — 1 phrase","dateDebut":"date ou null","dateCible":"date cible ou null","changementSemaine":"ce qui a avance cette semaine ou null","blocages":["blocage identifie"],"risque":"Eleve|Modere|Faible","risqueDetail":"enjeu principal ou null","prochainePriorite":"prochaine action avec owner","impactOrg":"impact attendu en 1 phrase"}],"blocagesGlobaux":[{"blocage":"description","initiativesConcernees":["nom"],"actionRequise":"action","owner":"HRBP|Direction|Gestionnaire|Externe"}],"decisions":[{"decision":"decision prise ou a prendre","initiative":"nom","echeance":"delai ou null"}],"actions":[{"action":"action concrete","delay":"Immediat|7 jours|30 jours|Continu","owner":"HRBP|Direction|Gestionnaire","initiative":"nom ou null"}],"metriques":{"total":0,"enCours":0,"bloquees":0,"completees":0,"aRisque":0},"questions":[{"question":"question pour prochain meeting","why":"objectif strategique","initiative":"nom ou null"}]}`;

// ════════════════════════════════════════════════════════════════════════════
// MODULE: HOME
// ════════════════════════════════════════════════════════════════════════════
function ModuleHome({ data, onNavigate }) {
  const cases = data.cases || [];
  const meetings = data.meetings || [];
  const signals = data.signals || [];

  const activeCases = cases.filter(c => c.status !== "closed" && c.status !== "resolved");
  const criticalCases = activeCases.filter(c => c.riskLevel === "Critique" || c.riskLevel === "Élevé");
  const recentMeetings = [...meetings].sort((a,b) => b.id - a.id).slice(0, 3);
  const recentSignals = [...signals].sort((a,b) => b.id - a.id).slice(0, 4);
  const unreadSignals = signals.filter(s => !s.actioned);

  const quickLinks = [
    { id:"meetings", icon:"⚡", label:"Analyser réunion", color:C.blue, desc:"Nouveau transcript" },
    { id:"prep1on1", icon:"🗂️", label:"Préparer 1:1", color:C.blue, desc:`${(data["prep1on1"]||[]).length} sessions` },
    { id:"cases", icon:"📂", label:"Case Log", color:C.amber, desc:`${activeCases.length} actifs` },
    { id:"signals", icon:"📡", label:"Signaux", color:C.red, desc:`${unreadSignals.length} non traités` },
    { id:"brief", icon:"📊", label:"Weekly Brief", color:C.em, desc:"Générer le bilan" },
    { id:"decisions", icon:"⚖️", label:"Décisions", color:C.blue, desc:"Analyse stratégique" },
    { id:"coaching", icon:"🤝", label:"Coaching", color:C.em, desc:"Playbook gestionnaire" },
    { id:"exit", icon:"🚪", label:"Exit Interview", color:C.amber, desc:"Analyser départ" },
    { id:"investigation", icon:"🔍", label:"Enquêtes", color:C.red, desc:"Investigation RH" },
    { id:"knowledge", icon:"🧠", label:"Knowledge Base", color:C.textM, desc:"Référence & outils" },
  ];

  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:24, padding:"20px 0 16px" }}>
        <div style={{ fontSize:24, fontWeight:800, color:C.text, letterSpacing:-0.5 }}>HRBP OS</div>
        <div style={{ fontSize:13, color:C.textD, marginTop:4 }}>Tableau de bord · {new Date().toLocaleDateString("fr-CA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        {[
          { label:"Dossiers actifs", value:activeCases.length, color:C.amber, sub:`${criticalCases.length} critiques` },
          { label:"Réunions analysées", value:meetings.length, color:C.blue, sub:"total" },
          { label:"Signaux détectés", value:signals.length, color:C.red, sub:`${unreadSignals.length} non traités` },
          { label:"Décisions archivées", value:(data.decisions||[]).length, color:C.em, sub:"stratégiques" },
        ].map((s,i) => (
          <div key={i} style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 16px" }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, fontWeight:600, color:C.text, marginTop:2 }}>{s.label}</div>
            <div style={{ fontSize:10, color:C.textD, marginTop:2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Quick access */}
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:C.textD, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>Accès rapide</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {quickLinks.map(q => (
              <button key={q.id} onClick={() => onNavigate(q.id)}
                style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 10px",
                  cursor:"pointer", textAlign:"left", transition:"border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor=q.color}
                onMouseLeave={e => e.currentTarget.style.borderColor=C.border}>
                <div style={{ fontSize:18, marginBottom:4 }}>{q.icon}</div>
                <div style={{ fontSize:11, fontWeight:600, color:C.text }}>{q.label}</div>
                <div style={{ fontSize:10, color:C.textD, marginTop:2 }}>{q.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* Critical cases */}
          {criticalCases.length > 0 && (
            <div style={{ background:C.surf, border:`1px solid ${C.red}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.red, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>⚠ Dossiers critiques</div>
              {criticalCases.slice(0,3).map(c => (
                <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:12, color:C.text, fontWeight:500 }}>{c.title}</div>
                  <Badge label={c.riskLevel} color={C.red} size={9} />
                </div>
              ))}
            </div>
          )}

          {/* Recent signals */}
          {recentSignals.length > 0 && (
            <div style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.textD, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>📡 Signaux récents</div>
              {recentSignals.map(s => (
                <div key={s.id} style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                  <Badge label={s.level} color={s.level==="Élevé"?C.red:s.level==="Modéré"?C.amber:C.em} size={9} />
                  <div style={{ fontSize:11, color:C.textM, lineHeight:1.4 }}>{s.signal?.substring(0,70)}{s.signal?.length>70?"…":""}</div>
                </div>
              ))}
            </div>
          )}

          {/* Recent meetings */}
          {recentMeetings.length > 0 && (
            <div style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.textD, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>⚡ Réunions récentes</div>
              {recentMeetings.map(m => (
                <div key={m.id} style={{ padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:11, color:C.text, fontWeight:500 }}>{m.result?.meetingTitle||"Réunion"}</div>
                  <div style={{ fontSize:10, color:C.textD }}>{fmtDate(m.savedAt)} · {m.meetingType}</div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {criticalCases.length === 0 && recentSignals.length === 0 && recentMeetings.length === 0 && (
            <div style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:10, padding:24, textAlign:"center" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🚀</div>
              <div style={{ fontSize:13, color:C.text, fontWeight:600 }}>Bienvenue dans HRBP OS</div>
              <div style={{ fontSize:11, color:C.textD, marginTop:6 }}>Commence par analyser une réunion ou créer un dossier.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODULE: MEETINGS
// Meeting-specific loader with elapsed time + progress hint
function MeetingLoader({ chars=0 }) {
  const [secs, setSecs] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setSecs(s => s+1), 1000);
    return () => clearInterval(t);
  }, []);
  const est = chars > 40000 ? 55 : chars > 20000 ? 35 : chars > 10000 ? 22 : 12;
  const pct = Math.min(95, Math.round((secs / est) * 100));
  const msg = secs < 5  ? "Envoi du transcript…"
            : secs < 12 ? "Lecture en cours…"
            : secs < 25 ? "Analyse des signaux et risques…"
            : secs < 40 ? "Génération du JSON…"
            : secs < 85 ? "Finalisation — encore quelques secondes…"
            :              "⚠ Délai long — si ça ne répond pas, relance.";
  return (
    <div style={{ padding:"24px 20px", background:C.surfL, borderRadius:10,
      border:`1px solid ${C.border}`, textAlign:"center" }}>
      <div style={{ width:36, height:36, border:`2px solid ${C.surfLL}`,
        borderTop:`2px solid ${C.em}`, borderRadius:"50%",
        animation:"spin 1s linear infinite", margin:"0 auto 14px" }}/>
      <div style={{ fontSize:13, color:C.text, fontWeight:600, marginBottom:6 }}>{msg}</div>
      <div style={{ height:4, background:C.surfLL, borderRadius:2, margin:"10px 0 8px",
        overflow:"hidden" }}>
        <div style={{ height:"100%", background:C.em, borderRadius:2,
          width:pct+"%", transition:"width .8s ease" }}/>
      </div>
      <div style={{ fontSize:11, color:C.textD }}>
        {secs}s écoulées{chars > 10000 ? ` · Transcript ${Math.round(chars/1000)}k car.` : ""}
        {secs > est ? " · Presque terminé…" : ` · ~${Math.max(1, est-secs)}s restantes`}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
function ModuleMeetings({ data, onSaveSession, onUpdateMeeting, onNavigate }) {
  const [view, setView] = useState("list"); // list | new | result | director
  const [transcript, setTranscript] = useState("");
  const [meetingType, setMeetingType] = useState("director");
  const [meetingProvince, setMeetingProvince] = useState("QC");
  const [dirName, setDirName] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [briefPrompt, setBriefPrompt] = useState("");
  const [meetingPrompt, setMeetingPrompt] = useState("");
  const [activeDir, setActiveDir] = useState(null);
  const [activeSession, setActiveSession] = useState(null);

  const meetings = data.meetings || [];
  const directors = [...new Set(meetings.map(m => m.director).filter(Boolean))];

  // Compress transcript: remove filler words, timestamps, repeated whitespace
  const compressTranscript = (t) => {
    return t
      // Remove common timestamp formats: [00:00], (00:00:00), 00:00:00
      .replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g, "")
      // Remove speaker labels repetition padding: "SPEAKER_01:", "[Intervenant]:"
      .replace(/^(SPEAKER_\d+|Intervenant\s*\d*|Participant\s*\d*)\s*:/gim, "")
      // Remove filler words (fr + en)
      .replace(/\b(euh|heu|umm|uhh|uh|hmm|genre|tu sais|you know|like|ok ok|right right|yeah yeah)\b/gi, "")
      // Collapse 3+ newlines to 2
      .replace(/\n{3,}/g, "\n\n")
      // Collapse multiple spaces
      .replace(/ {2,}/g, " ")
      // Remove lines that are only whitespace or dashes
      .replace(/^[-\s]*$/gm, "")
      .trim();
  };

  const analyze = async () => {
    if (transcript.trim().length < 80) return;
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const raw = transcript.trim();
      // Auto-compress if over 20k chars
      const t = raw.length > 20000 ? compressTranscript(raw) : raw;
      const _mProv = meetingProvince || data.profile?.defaultProvince || "QC";
      const _legalInject = meetingType === "disciplinaire"
        ? `\n${buildLegalPromptContext(_mProv)}\n` : "";
      const sp = meetingType === "ta" ? TA_SP
               : meetingType === "disciplinaire" ? DISC_SP
               : meetingType === "initiatives"   ? INIT_SP
               : MEETING_SP;
      // For very long transcripts: use a focused summary-first approach
      const isVeryLong = t.length > 25000;
      const focusNote = isVeryLong
        ? "\n\nNOTE: Transcript très long. Priorise les signaux RH, risques et actions. Max 3 items par liste. Sois concis."
        : "";
      const prompt = `TYPE: ${meetingType}\nDIRECTEUR: ${dirName||"Non spécifié"}\n${context?`CONTEXTE: ${context}\n`:""}${_legalInject}${focusNote}\nTRANSCRIPT:\n${t}`;
      const parsed = await callAI(sp, prompt, t.length);
      if (dirName) parsed.director = dirName;
      setResult(parsed);
      setView("result");
    } catch(e) {
      setError("Erreur: " + e.message);
    }
    finally { setLoading(false); }
  };

  // Manual compress button handler
  const handleCompress = () => {
    const compressed = compressTranscript(transcript);
    setTranscript(compressed);
  };

  const saveResult = () => {
    if (!result || saved) return;
    const session = { id:Date.now().toString(), director:result.director||dirName||"Non assigné",
      savedAt:new Date().toISOString().split("T")[0], meetingType, province:meetingProvince, analysis:result };
    onSaveSession(session, result.caseEntry);
    setSaved(true);
  };

  const isTAMeeting   = meetingType === "ta"            || activeSession?.meetingType === "ta";
  const isDiscMeeting = meetingType === "disciplinaire" || activeSession?.meetingType === "disciplinaire";
  const isInitMeeting = meetingType === "initiatives"   || activeSession?.meetingType === "initiatives";
  const TABS = isDiscMeeting ? [
    {id:"summary",   icon:"📋", label:"Résumé"},
    {id:"faits",     icon:"📄", label:"Faits"},
    {id:"juridique", icon:"⚖",  label:"Cadre juridique"},
    {id:"sanction",  icon:"🔴", label:"Sanction"},
    {id:"actions",   icon:"✅", label:"Actions & Docs"},
  ] : isInitMeeting ? [
    {id:"summary",    icon:"📋", label:"Résumé"},
    {id:"initiatives",icon:"🚀", label:"Initiatives", badge: result?.initiatives?.length > 0 ? result.initiatives.length : null},
    {id:"blocages",   icon:"🚧", label:"Blocages",    badge: result?.blocagesGlobaux?.length > 0 ? result.blocagesGlobaux.length : null},
    {id:"decisions",  icon:"✅", label:"Décisions"},
    {id:"actions",    icon:"🎯", label:"Actions"},
    {id:"questions",  icon:"💬", label:"Prochain meeting"},
  ] : isTAMeeting ? [
    {id:"summary",   icon:"📋", label:"Résumé"},
    {id:"postes",    icon:"🎯", label:"Postes", badge: result?.postes?.length > 0 ? result.postes.length : null},
    {id:"blocages",  icon:"🚧", label:"Blocages", badge: result?.blocages?.length > 0 ? result.blocages.length : null},
    {id:"actions",   icon:"✅", label:"Actions"},
    {id:"questions", icon:"💬", label:"Prochain meeting"},
  ] : [
    {id:"summary",icon:"📋",label:"Résumé"},
    {id:"people",icon:"👥",label:"People"},
    {id:"signals",icon:"📡",label:"Signaux"},
    {id:"risks",icon:"⚠",label:"Risques"},
    {id:"actions",icon:"🎯",label:"Actions"},
    {id:"questions",icon:"💬",label:"Questions", badge: result?.crossQuestions?.length > 0 ? `+${result.crossQuestions.length}` : null},
    {id:"case",icon:"📂",label:"Case Log"},
  ];
  const [tab, setTab] = useState("summary");
  const [qsub, setQsub] = useState("meeting");
  const [groupBy, setGroupBy] = useState("director");
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState({});

  if (view === "list") {
    const TYPE_META = {
      executif:      { label:"Exécutif",            icon:"🏛", color:C.purple },
      vp:            { label:"VP",                  icon:"📊", color:C.blue },
      director:      { label:"Directeur",          icon:"🏢", color:C.blue },
      manager:       { label:"Manager",             icon:"👤", color:C.blue },
      talent:        { label:"Talent / Perf",       icon:"⭐", color:C.amber },
      org:           { label:"Org & Changement",    icon:"🔄", color:C.purple },
      ta:            { label:"Talent Acquisition",  icon:"🎯", color:C.teal },
      hrbpteam:      { label:"HRBP Team",           icon:"🤝", color:C.em },
      disciplinaire: { label:"Disciplinaire",       icon:"⚖",  color:C.red },
      initiatives:   { label:"Initiatives",         icon:"🚀", color:C.em },
    };
    return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Meetings & Transcripts</div>
          <div style={{ fontSize:12, color:C.textM }}>{meetings.length} meeting(s) enregistré(s)</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => onNavigate("prep1on1")} style={{ ...css.btn(C.blue,true), padding:"8px 14px", fontSize:12 }}>🗂️ Préparer 1:1</button>
          <button onClick={() => setView("new")} style={{ ...css.btn(C.em) }}>⚡ Analyser un transcript</button>
        </div>
      </div>

      {/* Group by toggle */}
      <div style={{ display:"flex", gap:2, marginBottom:20, background:C.surfL, borderRadius:8, padding:4, width:"fit-content" }}>
        {[{id:"director",label:"Par directeur"},{id:"type",label:"Par type"}].map(g => (
          <button key={g.id} onClick={() => setGroupBy(g.id)}
            style={{ padding:"6px 16px", borderRadius:6, fontSize:12, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", border:"none",
              background: groupBy===g.id ? C.em : "none",
              color: groupBy===g.id ? "#fff" : C.textM,
              fontWeight: groupBy===g.id ? 600 : 400 }}>
            {g.label}
          </button>
        ))}
      </div>

      {/* ── BY DIRECTOR ── */}
      {groupBy === "director" && (() => {
        const LEVEL_MAP = {
          executif:  { label:"Exécutif",    icon:"🏛", color:C.purple, order:0 },
          vp:        { label:"VP",          icon:"📊", color:C.blue,   order:1 },
          director:  { label:"Directeur",   icon:"🏢", color:C.blue,   order:2 },
          manager:   { label:"Gestionnaire",icon:"👤", color:C.teal,   order:3 },
        };
        const OTHER_LVL = { label:"Autre", icon:"📋", color:C.textD, order:4 };
        // Determine dominant level per director name (lowest order wins)
        const dirLevel = {};
        meetings.forEach(m => {
          if (!m.director) return;
          const lvl = LEVEL_MAP[m.meetingType];
          if (!lvl) return;
          const prev = dirLevel[m.director];
          if (!prev || lvl.order < prev.order) dirLevel[m.director] = lvl;
        });
        // Group directors by level
        const groups = {};
        directors.forEach(d => {
          const lvl = dirLevel[d] || OTHER_LVL;
          if (!groups[lvl.label]) groups[lvl.label] = { ...lvl, dirs: [] };
          groups[lvl.label].dirs.push(d);
        });
        const orderedGroups = Object.values(groups).sort((a,b) => a.order - b.order);
        return <>
          {orderedGroups.map(group => (
            <div key={group.label} style={{ marginBottom:22 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10,
                paddingBottom:6, borderBottom:`2px solid ${group.color}33` }}>
                <span style={{ fontSize:14 }}>{group.icon}</span>
                <Mono color={group.color} size={9}>{group.label}</Mono>
                <span style={{ fontSize:10, color:C.textD, fontFamily:"'DM Mono',monospace", letterSpacing:1 }}>
                  — {group.dirs.length} personne{group.dirs.length > 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:10 }}>
                {group.dirs.map(d => {
                  const dm = meetings.filter(m => m.director===d);
                  const last = dm[dm.length-1];
                  const r = RISK[last?.analysis?.overallRisk]||RISK["Faible"];
                  return <button key={d} onClick={() => { setActiveDir(d); setView("director"); }}
                    style={{ background:C.surfL, border:`1px solid ${r.color}28`,
                      borderLeft:`3px solid ${group.color}`,
                      borderRadius:10, padding:"13px 14px", cursor:"pointer",
                      textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{group.icon}</span>
                      <RiskBadge level={last?.analysis?.overallRisk||"Faible"} />
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:3 }}>{d}</div>
                    <div style={{ fontSize:11, color:C.textM }}>{dm.length} meeting(s)</div>
                    {last?.savedAt && <Mono color={C.textD} size={8}>Dernier: {fmtDate(last.savedAt)}</Mono>}
                  </button>;
                })}
              </div>
            </div>
          ))}
          {directors.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
              Aucun meeting enregistré. Analyse ton premier transcript ↑
            </div>
          )}
          <Mono color={C.textD} size={9}>Sessions récentes</Mono>
          <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>
            {meetings.slice().reverse().slice(0,10).map((m,i) => {
              const r = RISK[m.analysis?.overallRisk]||RISK["Faible"];
              const tm = TYPE_META[m.meetingType] || { icon:"📋", color:C.textD };
              return <button key={i} onClick={() => { setActiveSession(m); setResult(m.analysis); setTab("summary"); setView("session"); }}
                style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:8,
                  padding:"12px 14px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                  display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:r.color, flexShrink:0 }} />
                <span style={{ fontSize:13, flexShrink:0 }}>{tm.icon}</span>
                <div style={{ flex:1, fontSize:13, color:C.text }}>{m.analysis?.meetingTitle}</div>
                {m.director && <Badge label={m.director} color={C.blue} size={10} />}
                <ProvinceBadge province={getProvince(m, data.profile)}/>
                <Mono color={C.textD} size={8}>{fmtDate(m.savedAt)}</Mono>
              </button>;
            })}
          </div>
        </>;
      })()}

      {/* ── BY TYPE ── */}
      {groupBy === "type" && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {meetings.length === 0 && <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
            Aucun meeting enregistré. Analyse ton premier transcript ↑
          </div>}
          {Object.entries(TYPE_META).map(([typeId, meta]) => {
            const group = meetings.filter(m => m.meetingType === typeId).slice().reverse();
            if (group.length === 0) return null;
            return (
              <div key={typeId}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10,
                  paddingBottom:8, borderBottom:`2px solid ${meta.color}33` }}>
                  <span style={{ fontSize:16 }}>{meta.icon}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:meta.color }}>{meta.label}</span>
                  <Badge label={`${group.length}`} color={meta.color} size={10}/>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {group.map((m,i) => {
                    const r = RISK[m.analysis?.overallRisk]||RISK["Faible"];
                    return <button key={i} onClick={() => { setActiveSession(m); setResult(m.analysis); setTab("summary"); setView("session"); }}
                      style={{ background:C.surfL, border:`1px solid ${meta.color}18`,
                        borderLeft:`3px solid ${meta.color}`, borderRadius:8,
                        padding:"11px 14px", cursor:"pointer", textAlign:"left",
                        fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:r.color, flexShrink:0 }} />
                      <div style={{ flex:1, fontSize:13, color:C.text }}>{m.analysis?.meetingTitle}</div>
                      {m.director && <Badge label={m.director} color={C.blue} size={10} />}
                      <ProvinceBadge province={getProvince(m, data.profile)}/>
                      <Mono color={C.textD} size={8}>{m.savedAt}</Mono>
                      <RiskBadge level={m.analysis?.overallRisk||"Faible"}/>
                    </button>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );}

  if (view === "new") return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={() => setView("list")} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ fontSize:17, fontWeight:700, color:C.text }}>Analyser un transcript</div>
      </div>

      {/* Type */}
      <div style={{ marginBottom:14 }}>
        <Mono color={C.textD}>Type de meeting</Mono>
        <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
          {[{id:"executif",label:"🏛 Exécutif"},{id:"vp",label:"📊 VP"},{id:"director",label:"🏢 Directeur"},{id:"manager",label:"👤 Manager"},{id:"talent",label:"⭐ Talent/Perf"},{id:"org",label:"🔄 Org & Changement"},{id:"ta",label:"🎯 Talent Acquisition"},{id:"hrbpteam",label:"🤝 HRBP Team"},{id:"disciplinaire",label:"⚖ Disciplinaire"},{id:"initiatives",label:"🚀 Initiatives"}].map(t => (
            <button key={t.id} onClick={() => setMeetingType(t.id)}
              style={{ background:meetingType===t.id ? C.em+"22":"none", color:meetingType===t.id ? C.em:C.textM,
                border:`1px solid ${meetingType===t.id ? C.em+"55":C.border}`, borderRadius:7,
                padding:"8px 14px", fontSize:12, fontWeight:meetingType===t.id?600:400,
                cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 80px", gap:12, marginBottom:14 }}>
        <div>
          <Mono color={C.textD}>Nom</Mono>
          <input value={dirName} onChange={e=>setDirName(e.target.value)}
            placeholder="Ex: Benoît, Caroline, Tech Lead..." style={{ ...css.input, marginTop:6 }}
            onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border} />
        </div>
        <div>
          <Mono color={C.textD}>Contexte additionnel</Mono>
          <input value={context} onChange={e=>setContext(e.target.value)}
            placeholder="Ex: post-annonce, 2e bi-weekly tendu..." style={{ ...css.input, marginTop:6 }}
            onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border} />
        </div>
        <div>
          <Mono color={C.textD}>Prov.</Mono>
          <ProvinceSelect value={meetingProvince}
            onChange={e=>setMeetingProvince(e.target.value)}
            style={{ marginTop:6, width:"100%", padding:"9px 6px" }}/>
        </div>
      </div>

      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, alignItems:"center" }}>
          <Mono color={C.textD}>Transcript</Mono>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {transcript.length > 20000 && (
              <button onClick={handleCompress}
                style={{ fontSize:10, fontWeight:700, color:C.amber, cursor:"pointer",
                  background:C.amber+"18", border:`1px solid ${C.amber}40`,
                  borderRadius:5, padding:"2px 9px", fontFamily:"'DM Sans',sans-serif" }}>
                ✂ Compresser ({Math.round(transcript.length/1000)}k)
              </button>
            )}
            <Mono color={C.textD} size={9}>{transcript.length.toLocaleString()} car.</Mono>
          </div>
        </div>
        <textarea rows={10} value={transcript} onChange={e=>setTranscript(e.target.value)}
          placeholder="Colle ton transcript ici..." style={{ ...css.textarea }}
          onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border} />
      </div>

      {error && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
        padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red, whiteSpace:"pre-wrap" }}>⚠ {error}</div>}

      {loading ? (
        <MeetingLoader chars={transcript.length}/>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={analyze} disabled={transcript.trim().length < 80}
            style={{ ...css.btn(C.em), width:"100%", padding:"13px", fontSize:14,
              opacity:transcript.trim().length < 80 ? .4:1,
              boxShadow:transcript.trim().length>=80?`0 4px 20px ${C.em}30`:"none" }}>
            ⚡ Analyser le meeting
          </button>
          {transcript.length > 20000 && (
            <div style={{ fontSize:11, color:C.textD, textAlign:"center", lineHeight:1.6 }}>
              Transcript long détecté — la compression automatique sera appliquée avant l'analyse.
              Ou clique <span style={{ color:C.amber, cursor:"pointer", fontWeight:600 }}
                onClick={handleCompress}>✂ Compresser</span> d'abord pour voir le résultat.
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Session / result view
  const MEETING_TYPES = [
    {id:"executif",    label:"🏛 Exécutif"},
    {id:"vp",          label:"📊 VP"},
    {id:"director",    label:"🏢 Directeur"},
    {id:"manager",     label:"👤 Manager"},
    {id:"talent",      label:"⭐ Talent/Perf"},
    {id:"org",         label:"🔄 Org & Changement"},
    {id:"ta",          label:"🎯 Talent Acquisition"},
    {id:"hrbpteam",    label:"🤝 HRBP Team"},
    {id:"disciplinaire",label:"⚖ Disciplinaire"},
    {id:"initiatives", label:"🚀 Initiatives"},
  ];

  const saveMeta = () => {
    if (!activeSession) return;
    const updated = {
      ...activeSession,
      meetingType: metaDraft.meetingType || activeSession.meetingType,
      director:    metaDraft.director !== undefined ? metaDraft.director : activeSession.director,
      analysis: {
        ...activeSession.analysis,
        meetingTitle: metaDraft.meetingTitle || activeSession.analysis?.meetingTitle,
        director:     metaDraft.director !== undefined ? metaDraft.director : activeSession.analysis?.director,
      },
    };
    onUpdateMeeting(updated);
    setActiveSession(updated);
    setResult(updated.analysis);
    setEditingMeta(false);
  };

  if ((view === "result" || view === "session") && result) return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={() => { setView("list"); setResult(null); setTranscript(""); setContext(""); setEditingMeta(false); }}
          style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.meetingTitle}</div>
        {view === "session" && (
          <button onClick={() => {
            setEditingMeta(v => !v);
            setMetaDraft({
              meetingType: activeSession?.meetingType || meetingType,
              director:    activeSession?.director || result.director || dirName,
              meetingTitle: result.meetingTitle || "",
            });
          }}
            style={{ ...css.btn(editingMeta ? C.amber : C.textM, true), padding:"6px 12px", fontSize:11 }}>
            {editingMeta ? "✕ Annuler" : "✏ Modifier"}
          </button>
        )}
        {view === "result" && <button onClick={saveResult} disabled={saved}
          style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>
          {saved ? "✓ Sauvegardé" : "💾 Sauvegarder"}
        </button>}
      </div>

      {/* Inline meta editor */}
      {editingMeta && view === "session" && (
        <div style={{ background:C.amber+"10", border:`1px solid ${C.amber}40`,
          borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
          <Mono color={C.amber} size={9}>MODIFIER LES MÉTADONNÉES</Mono>
          <div style={{ display:"flex", gap:12, marginTop:12, flexWrap:"wrap", alignItems:"flex-end" }}>
            <div style={{ flex:"1 1 160px" }}>
              <Mono color={C.textD} size={9}>Titre du meeting</Mono>
              <input value={metaDraft.meetingTitle || ""}
                onChange={e => setMetaDraft(p => ({...p, meetingTitle: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}
                onFocus={e=>e.target.style.borderColor=C.amber+"60"}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div style={{ flex:"1 1 140px" }}>
              <Mono color={C.textD} size={9}>Nom</Mono>
              <input value={metaDraft.director || ""}
                onChange={e => setMetaDraft(p => ({...p, director: e.target.value}))}
                placeholder="Nom ou rôle"
                style={{ ...css.input, marginTop:5, fontSize:12 }}
                onFocus={e=>e.target.style.borderColor=C.amber+"60"}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div style={{ flex:"1 1 160px" }}>
              <Mono color={C.textD} size={9}>Type de meeting</Mono>
              <select value={metaDraft.meetingType || ""}
                onChange={e => setMetaDraft(p => ({...p, meetingType: e.target.value}))}
                style={{ ...css.select, marginTop:5, fontSize:12 }}>
                {MEETING_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <button onClick={saveMeta}
              style={{ ...css.btn(C.amber), padding:"9px 18px", fontSize:12, flexShrink:0 }}>
              ✓ Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Risk header */}
      <div style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:10,
        padding:"14px 18px", marginBottom:14, display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <RiskBadge level={result.overallRisk} />
        {result.director && <Badge label={result.director} color={C.blue} />}
        {result.meetingDate && <Badge label={result.meetingDate} color={C.textD} />}
        <ProvinceBadge province={getProvince(activeSession, data.profile)}/>
        <span style={{ fontSize:12, color:C.textM, flex:1 }}>{result.overallRiskRationale}</span>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14, overflowX:"auto" }}>
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)}
          style={{ background:"none", border:"none", cursor:"pointer", padding:"7px 12px",
            fontSize:11, fontWeight:tab===t.id?600:400, color:tab===t.id?C.em:C.textM,
            borderBottom:`2px solid ${tab===t.id?C.em:"transparent"}`, marginBottom:-1,
            whiteSpace:"nowrap", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:5 }}>
          {t.icon} {t.label}
          {t.badge && <span style={{ background:C.purple+"33", color:C.purple,
            borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{t.badge}</span>}
        </button>)}
      </div>

      {/* ── INITIATIVES TABS ── */}
      {isInitMeeting && tab==="summary" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card style={{ borderLeft:`3px solid ${C.em}` }}>
            <SecHead icon="📋" label="Résumé portefeuille" color={C.em}/>
            <BulletList items={result.summary} color={C.em}/>
            {result.overallRiskRationale && <div style={{ marginTop:10, fontSize:12, color:C.textM }}><span style={{ color:C.em }}>→ </span>{result.overallRiskRationale}</div>}
          </Card>
          {result.metriques && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
              {[
                {label:"Total",     val:result.metriques.total,      color:C.blue},
                {label:"En cours",  val:result.metriques.enCours,    color:C.em},
                {label:"Bloquées",  val:result.metriques.bloquees,   color:C.red},
                {label:"À risque",  val:result.metriques.aRisque,    color:C.amber},
                {label:"Complètes", val:result.metriques.completees, color:C.teal},
              ].map((m,i) => (
                <div key={i} style={{ background:m.color+"12", border:`1px solid ${m.color}25`, borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:m.color }}>{m.val ?? "—"}</div>
                  <div style={{ fontSize:9, color:C.textD, marginTop:3, fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>{m.label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isInitMeeting && tab==="initiatives" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.initiatives || result.initiatives.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucune initiative identifiée.</div></Card>
          )}
          {(result.initiatives||[]).map((p, i) => {
            const STATUT_C = {
              "En cours":C.em, "Planifiee":C.blue, "Planifiée":C.blue,
              "En attente":C.amber, "Bloquee":C.red, "Bloquée":C.red,
              "Completee":C.teal, "Complétée":C.teal, "Annulee":C.textD, "Annulée":C.textD,
            };
            const AVANC_STEPS = ["0-25%","25-50%","50-75%","75-100%","Complete","Complète"];
            const riskBorder = (p.risque==="Eleve"||p.risque==="Élevé") ? C.red : (p.risque==="Modere"||p.risque==="Modéré") ? C.amber : C.border;
            const statutColor = STATUT_C[p.statut] || C.blue;
            const avancIdx = AVANC_STEPS.indexOf(p.avancement);
            const isBlocked = p.statut==="Bloquee"||p.statut==="Bloquée";
            return (
              <Card key={i} style={{ borderLeft:`3px solid ${statutColor}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10, gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>{p.nom}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {p.categorie && <Badge label={p.categorie} color={C.blue} size={10}/>}
                      {p.responsable && <Badge label={p.responsable} color={C.purple} size={10}/>}
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end", flexShrink:0 }}>
                    <div style={{ background:statutColor+"22", border:`1px solid ${statutColor}55`, borderRadius:6, padding:"4px 10px", fontSize:11, color:statutColor, fontWeight:700 }}>{p.statut}</div>
                    {p.risque && <Badge label={`⚠ ${p.risque}`} color={riskBorder} size={10}/>}
                  </div>
                </div>

                {/* Progress bar */}
                {!isBlocked && avancIdx >= 0 && (
                  <div style={{ display:"flex", gap:3, marginBottom:10 }}>
                    {AVANC_STEPS.slice(0,4).map((e,j) => (
                      <div key={j} style={{ flex:1, height:4, borderRadius:2,
                        background: j <= avancIdx ? statutColor : C.surfLL }}/>
                    ))}
                  </div>
                )}
                {isBlocked && (
                  <div style={{ height:4, borderRadius:2, background:C.red+"40", marginBottom:10,
                    backgroundImage:`repeating-linear-gradient(45deg,${C.red}40 0,${C.red}40 4px,transparent 4px,transparent 8px)` }}/>
                )}

                <div style={{ fontSize:12, color:C.textM, lineHeight:1.6, marginBottom:p.changementSemaine||p.risqueDetail||p.blocages?.length ? 10 : 0 }}>
                  {p.statutDetail}
                </div>

                {p.changementSemaine && (
                  <div style={{ display:"flex", gap:8, padding:"7px 10px", background:C.em+"10", borderRadius:7, marginBottom:8 }}>
                    <span style={{ color:C.em, fontSize:11, flexShrink:0 }}>↺</span>
                    <span style={{ fontSize:11, color:C.em }}><strong>Cette semaine :</strong> {p.changementSemaine}</span>
                  </div>
                )}

                {p.blocages?.length > 0 && (
                  <div style={{ marginBottom:8 }}>
                    {p.blocages.map((b,bi) => (
                      <div key={bi} style={{ display:"flex", gap:8, padding:"6px 10px", background:C.red+"10", border:`1px solid ${C.red}25`, borderRadius:7, marginBottom:4 }}>
                        <span style={{ color:C.red, fontSize:11, flexShrink:0 }}>🚧</span>
                        <span style={{ fontSize:11, color:C.textM }}>{b}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                  {p.dateCible && <Mono color={C.textD} size={9}>Cible: {p.dateCible}</Mono>}
                  {p.dateDebut && <Mono color={C.textD} size={9}>Début: {p.dateDebut}</Mono>}
                  {p.avancement && <Mono color={statutColor} size={9}>{p.avancement}</Mono>}
                </div>

                {p.prochainePriorite && (
                  <div style={{ marginTop:10, padding:"6px 10px", background:C.surfLL, borderRadius:7, display:"flex", gap:8 }}>
                    <span style={{ fontSize:10, color:C.em, flexShrink:0 }}>→</span>
                    <span style={{ fontSize:12, color:C.textM }}>{p.prochainePriorite}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {isInitMeeting && tab==="blocages" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.blocagesGlobaux || result.blocagesGlobaux.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucun blocage global identifié.</div></Card>
          )}
          {(result.blocagesGlobaux||[]).map((b,i) => (
            <Card key={i} style={{ borderLeft:`3px solid ${C.red}` }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{b.blocage}</div>
                <Badge label={b.owner} color={C.blue} size={10}/>
              </div>
              {b.initiativesConcernees?.length > 0 && (
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                  {b.initiativesConcernees.map((n,j) => <Badge key={j} label={n} color={C.purple} size={9}/>)}
                </div>
              )}
              {b.actionRequise && <div style={{ fontSize:12, color:C.em }}>→ {b.actionRequise}</div>}
            </Card>
          ))}
        </div>
      )}

      {isInitMeeting && tab==="decisions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.decisions || result.decisions.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucune décision enregistrée.</div></Card>
          )}
          {(result.decisions||[]).map((d,i) => (
            <Card key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
              <span style={{ color:C.em, fontSize:16, flexShrink:0 }}>✓</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginBottom:4 }}>{d.decision}</div>
                <div style={{ display:"flex", gap:8 }}>
                  {d.initiative && <Mono color={C.purple} size={9}>INITIATIVE · {d.initiative}</Mono>}
                  {d.echeance && <Mono color={C.amber} size={9}>ÉCHÉANCE · {d.echeance}</Mono>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {isInitMeeting && tab==="actions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(result.actions||[]).map((a,i) => {
            const dc = DELAY_C[a.delay] || C.blue;
            return (
              <Card key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <Badge label={a.delay} color={dc} size={10}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginBottom:4 }}>{a.action}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <Mono color={C.textD} size={9}>OWNER · {a.owner}</Mono>
                    {a.initiative && <Mono color={C.purple} size={9}>INITIATIVE · {a.initiative}</Mono>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {isInitMeeting && tab==="questions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(result.questions||[]).map((q,i) => (
            <Card key={i}>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.7, marginBottom:8, fontStyle:"italic" }}>"{q.question}"</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ fontSize:12, color:C.textM }}><span style={{ color:C.em }}>💡 </span>{q.why}</div>
                {q.initiative && <Badge label={q.initiative} color={C.purple} size={9}/>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── DISCIPLINAIRE TABS ── */}

      {isDiscMeeting && tab==="summary" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card style={{ borderLeft:`3px solid ${C.red}` }}>
            <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12 }}>
              {result.typeRencontre && <div style={{ background:C.red+"22", border:`1px solid ${C.red}55`, borderRadius:6, padding:"4px 12px", fontSize:12, color:C.red, fontWeight:700 }}>{result.typeRencontre}</div>}
              <RiskBadge level={result.overallRisk}/>
            </div>
            <SecHead icon="📋" label="Résumé" color={C.blue}/>
            <BulletList items={result.summary} color={C.blue}/>
            {result.overallRiskRationale && <div style={{ marginTop:10, fontSize:12, color:C.textM }}><span style={{ color:C.red }}>Risque → </span>{result.overallRiskRationale}</div>}
          </Card>
          {result.pointsVigilance?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.amber}` }}>
              <SecHead icon="👁" label="Points de vigilance" color={C.amber}/>
              <BulletList items={result.pointsVigilance} color={C.amber}/>
            </Card>
          )}
          {result.prochaineSanction && (
            <Card style={{ background:C.red+"08" }}>
              <Mono color={C.red} size={9}>SI RÉCIDIVE — PROCHAINE ÉTAPE</Mono>
              <div style={{ fontSize:13, color:C.text, marginTop:8, lineHeight:1.65 }}>{result.prochaineSanction}</div>
            </Card>
          )}
          {result.notes && (
            <Card>
              <Mono color={C.textD} size={9}>NOTES HRBP</Mono>
              <div style={{ fontSize:13, color:C.textM, marginTop:8, fontStyle:"italic", lineHeight:1.65 }}>{result.notes}</div>
            </Card>
          )}
        </div>
      )}

      {isDiscMeeting && tab==="faits" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            {key:"reproches",       label:"Reproches / Manquements",  color:C.red,    icon:"🔴"},
            {key:"positionEE",      label:"Position de l'employé(e)", color:C.blue,   icon:"💬"},
            {key:"reconnaissances", label:"Éléments reconnus",        color:C.em,     icon:"✓"},
            {key:"contestations",   label:"Éléments contestés",       color:C.amber,  icon:"⚠"},
          ].map(({key,label,color,icon}) => result.faits?.[key]?.length > 0 && (
            <Card key={key} style={{ borderLeft:`3px solid ${color}` }}>
              <SecHead icon={icon} label={label} color={color}/>
              <BulletList items={result.faits[key]} color={color}/>
            </Card>
          ))}
        </div>
      )}

      {isDiscMeeting && tab==="juridique" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card>
            <SecHead icon="📜" label="Politiques visées" color={C.blue}/>
            <BulletList items={result.cadreJuridique?.politiquesVisees} color={C.blue}/>
          </Card>
          <Card>
            <SecHead icon="⚖" label="Lois applicables" color={C.purple}/>
            <BulletList items={result.cadreJuridique?.loisApplicables} color={C.purple}/>
          </Card>
          {result.cadreJuridique?.progressiviteSanction && (
            <Card style={{ borderLeft:`3px solid ${result.cadreJuridique.progressiviteSanction === "respectee" ? C.em : C.amber}` }}>
              <Mono color={C.textD} size={9}>PROGRESSIVITÉ DES SANCTIONS</Mono>
              <div style={{ marginTop:8, display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ background:(result.cadreJuridique.progressiviteSanction === "respectee" ? C.em : C.amber)+"22", border:`1px solid ${(result.cadreJuridique.progressiviteSanction === "respectee" ? C.em : C.amber)}55`, borderRadius:6, padding:"3px 10px", fontSize:11, color:(result.cadreJuridique.progressiviteSanction === "respectee" ? C.em : C.amber), fontWeight:700, textTransform:"uppercase" }}>
                  {result.cadreJuridique.progressiviteSanction}
                </div>
              </div>
              {result.cadreJuridique.progressiviteNote && <div style={{ fontSize:12, color:C.textM, marginTop:8 }}>{result.cadreJuridique.progressiviteNote}</div>}
            </Card>
          )}
          {result.risquesLegaux?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.red}` }}>
              <SecHead icon="🚨" label="Risques légaux" color={C.red}/>
              {result.risquesLegaux.map((r,i) => (
                <div key={i} style={{ marginBottom:10, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", gap:8, marginBottom:6 }}><RiskBadge level={r.niveau}/></div>
                  <div style={{ fontSize:13, color:C.text, marginBottom:4 }}>{r.risque}</div>
                  {r.mitigation && <div style={{ fontSize:12, color:C.em }}>→ {r.mitigation}</div>}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {isDiscMeeting && tab==="sanction" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {result.sanctionImposee?.type ? (
            <Card style={{ borderLeft:`3px solid ${C.red}` }}>
              <SecHead icon="🔴" label="Sanction imposée" color={C.red}/>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
                <div style={{ background:C.red+"18", border:`1px solid ${C.red}40`, borderRadius:7, padding:"6px 14px", fontSize:13, color:C.red, fontWeight:700 }}>{result.sanctionImposee.type}</div>
                {result.sanctionImposee.duree && <Badge label={result.sanctionImposee.duree} color={C.amber}/>}
                {result.sanctionImposee.periodeSuivi && <Badge label={`Suivi : ${result.sanctionImposee.periodeSuivi}`} color={C.purple}/>}
              </div>
              {result.sanctionImposee.conditionsRetour?.length > 0 && (
                <div>
                  <Mono color={C.textD} size={9}>CONDITIONS / ATTENTES</Mono>
                  <BulletList items={result.sanctionImposee.conditionsRetour} color={C.amber}/>
                </div>
              )}
            </Card>
          ) : (
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucune sanction formelle — rencontre préliminaire ou investigatoire.</div></Card>
          )}
        </div>
      )}

      {isDiscMeeting && tab==="actions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {result.documentationRequise?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.blue}` }}>
              <SecHead icon="📄" label="Documents à produire" color={C.blue}/>
              {result.documentationRequise.map((d,i) => (
                <div key={i} style={{ display:"flex", gap:12, marginBottom:8, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
                  <Badge label={d.delai} color={C.amber} size={10}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:C.text }}>{d.document}</div>
                    <Mono color={C.textD} size={9}>RESPONSABLE · {d.responsable}</Mono>
                  </div>
                </div>
              ))}
            </Card>
          )}
          {result.actions?.length > 0 && (
            <Card>
              <SecHead icon="✅" label="Actions" color={C.em}/>
              {result.actions.map((a,i) => {
                const dc = DELAY_C[a.delay] || C.blue;
                return (
                  <div key={i} style={{ display:"flex", gap:12, marginBottom:8 }}>
                    <Badge label={a.delay} color={dc} size={10}/>
                    <div>
                      <div style={{ fontSize:13, color:C.text }}>{a.action}</div>
                      <Mono color={C.textD} size={9}>OWNER · {a.owner}</Mono>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* ── TA-SPECIFIC TABS ── */}
      {isTAMeeting && tab==="summary" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card><SecHead icon="📋" label="Résumé pipeline" color={C.blue}/><BulletList items={result.summary} color={C.blue}/></Card>
          {result.metriques && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {[
                {label:"Postes actifs",    val:result.metriques.postesActifs,   color:C.em},
                {label:"En offre",         val:result.metriques.enOffre,        color:C.amber},
                {label:"Fermés / Comblés", val:result.metriques.fermes,         color:C.teal},
                {label:"Délai moyen",      val:result.metriques.joursOuvertureMoyen ? result.metriques.joursOuvertureMoyen+"j" : "N/D", color:C.blue},
              ].map((m,i) => (
                <div key={i} style={{ background:m.color+"12", border:`1px solid ${m.color}30`, borderRadius:9, padding:"12px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:m.color }}>{m.val ?? "—"}</div>
                  <div style={{ fontSize:10, color:C.textD, marginTop:4, fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>{m.label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
          {result.metriques?.risquesPipeline?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.red}` }}>
              <SecHead icon="⚠" label="Risques pipeline globaux" color={C.red}/>
              <BulletList items={result.metriques.risquesPipeline} color={C.red}/>
            </Card>
          )}
        </div>
      )}

      {isTAMeeting && tab==="postes" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.postes || result.postes.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucun poste identifié dans le transcript.</div></Card>
          )}
          {(result.postes||[]).map((p, i) => {
            const ETAPE_C = {
              "Sourcing":C.textD,"Entrevues RH":C.blue,"Entrevues techniques":C.purple,
              "Debrief":C.amber,"Offre":C.teal,"Acceptee":C.em,"Acceptée":C.em,
              "En attente":C.amber,"Fermee":C.textD,"Fermée":C.textD,"Annulee":C.textD,"Annulée":C.textD,
            };
            const ETAPE_STEPS = ["Sourcing","Entrevues RH","Entrevues techniques","Debrief","Offre","Acceptée"];
            const etapeColor = ETAPE_C[p.etape] || C.blue;
            const riskBorder = (p.risque==="Eleve"||p.risque==="Élevé") ? C.red : (p.risque==="Modere"||p.risque==="Modéré") ? C.amber : C.border;
            const currentStep = ETAPE_STEPS.indexOf(p.etape) >= 0 ? ETAPE_STEPS.indexOf(p.etape) : -1;
            const isClosed = ["Fermee","Fermée","Annulee","Annulée"].includes(p.etape);
            return (
              <Card key={i} style={{ borderLeft:`3px solid ${etapeColor}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10, gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>{p.titre}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {p.equipe && <Badge label={p.equipe} color={C.blue} size={10}/>}
                      {p.responsable && <Badge label={p.responsable} color={C.purple} size={10}/>}
                      {p.candidats && <Badge label={`${p.candidats} candidat(s)`} color={C.textD} size={10}/>}
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end", flexShrink:0 }}>
                    <div style={{ background:etapeColor+"22", border:`1px solid ${etapeColor}55`, borderRadius:6, padding:"4px 10px", fontSize:11, color:etapeColor, fontWeight:700 }}>{p.etape}</div>
                    {p.priorite && <Badge label={"⚑ "+p.priorite} color={p.priorite==="Critique"?C.red:(p.priorite==="Elevee"||p.priorite==="Élevée")?C.amber:C.textD} size={10}/>}
                  </div>
                </div>
                {!isClosed && (
                  <div style={{ display:"flex", gap:3, marginBottom:10 }}>
                    {ETAPE_STEPS.map((e,j) => (
                      <div key={j} style={{ flex:1, height:4, borderRadius:2,
                        background: j < currentStep ? etapeColor+"55" : j === currentStep ? etapeColor : C.surfLL }}/>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:12, color:C.textM, lineHeight:1.6, marginBottom:(p.changementSemaine||p.risqueDetail)?10:0 }}>
                  {p.statutDetail}
                </div>
                {p.changementSemaine && (
                  <div style={{ display:"flex", gap:8, padding:"7px 10px", background:C.em+"10", borderRadius:7, marginBottom:8 }}>
                    <span style={{ color:C.em, fontSize:11, flexShrink:0 }}>↺</span>
                    <span style={{ fontSize:11, color:C.em }}><strong>Cette semaine :</strong> {p.changementSemaine}</span>
                  </div>
                )}
                {p.risqueDetail && (
                  <div style={{ display:"flex", gap:8, padding:"7px 10px", background:riskBorder+"10", border:`1px solid ${riskBorder}25`, borderRadius:7, marginBottom:8 }}>
                    <span style={{ color:riskBorder, fontSize:11, flexShrink:0 }}>⚠</span>
                    <span style={{ fontSize:11, color:C.textM }}>{p.risqueDetail}</span>
                  </div>
                )}
                <div style={{ display:"flex", gap:12, marginTop:4, flexWrap:"wrap" }}>
                  {p.dateCible && <Mono color={C.textD} size={9}>Cible: {p.dateCible}</Mono>}
                  {p.dateOuverture && <Mono color={C.textD} size={9}>Ouvert: {p.dateOuverture}</Mono>}
                </div>
                {p.prochainePriorite && (
                  <div style={{ marginTop:10, padding:"6px 10px", background:C.surfLL, borderRadius:7, display:"flex", gap:8 }}>
                    <span style={{ fontSize:10, color:C.em, flexShrink:0 }}>→</span>
                    <span style={{ fontSize:12, color:C.textM }}>{p.prochainePriorite}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {isTAMeeting && tab==="blocages" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.blocages || result.blocages.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucun blocage identifié.</div></Card>
          )}
          {(result.blocages||[]).map((b,i) => (
            <Card key={i} style={{ borderLeft:`3px solid ${C.red}` }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{b.blocage}</div>
                <Badge label={b.owner} color={C.blue} size={10}/>
              </div>
              {b.postesConcernes?.length > 0 && (
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                  {b.postesConcernes.map((pc,j) => <Badge key={j} label={pc} color={C.purple} size={9}/>)}
                </div>
              )}
              {b.actionRequise && <div style={{ fontSize:12, color:C.em }}>→ {b.actionRequise}</div>}
            </Card>
          ))}
        </div>
      )}

      {isTAMeeting && tab==="actions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(result.actions||[]).map((a,i) => {
            const dc = DELAY_C[a.delay] || C.blue;
            return (
              <Card key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <Badge label={a.delay} color={dc} size={10}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginBottom:4 }}>{a.action}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <Mono color={C.textD} size={9}>OWNER · {a.owner}</Mono>
                    {a.poste && <Mono color={C.purple} size={9}>POSTE · {a.poste}</Mono>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {isTAMeeting && tab==="questions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(result.questions||[]).map((q,i) => (
            <Card key={i}>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.7, marginBottom:8, fontStyle:"italic" }}>"{q.question}"</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ fontSize:12, color:C.textM }}><span style={{ color:C.em }}>💡 </span>{q.why}</div>
                {q.poste && <Badge label={q.poste} color={C.purple} size={9}/>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── STANDARD TABS (non-TA) ── */}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="summary" && <Card><SecHead icon="📋" label="Résumé exécutif" color={C.blue}/><BulletList items={result.summary} color={C.blue}/></Card>}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="people" && <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <Card><SecHead icon="📈" label="Performance" color={C.amber}/><BulletList items={result.people?.performance} color={C.amber}/></Card>
        <Card><SecHead icon="🎙️" label="Leadership" color={C.purple}/><BulletList items={result.people?.leadership} color={C.purple}/></Card>
        <Card><SecHead icon="💡" label="Engagement" color={C.em}/><BulletList items={result.people?.engagement} color={C.em}/></Card>
      </div>}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="signals" && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {result.signals?.map((s,i) => <Card key={i}>
          <Badge label={s.category} color={C.purple} size={10}/>
          <div style={{ fontSize:13, color:C.text, lineHeight:1.65, margin:"8px 0 6px" }}>{s.signal}</div>
          <div style={{ fontSize:12, color:C.textM }}><span style={{ color:C.em }}>→ </span>{s.interpretation}</div>
        </Card>)}
      </div>}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="risks" && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {result.risks?.map((r,i) => { const rm=RISK[r.level]||RISK["Modéré"]; return <Card key={i} style={{ borderLeft:`3px solid ${rm.color}` }}>
          <RiskBadge level={r.level}/>
          <div style={{ fontSize:13, color:C.text, fontWeight:500, margin:"8px 0 6px" }}>{r.risk}</div>
          <div style={{ fontSize:12, color:C.textM }}><span style={{ color:rm.color }}>→ </span>{r.rationale}</div>
        </Card>;})}
      </div>}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="actions" && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {result.actions?.map((a,i) => { const dc=DELAY_C[a.delay]||C.blue; return <Card key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
          <Badge label={a.delay} color={dc} size={10}/>
          <div><div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginBottom:4 }}>{a.action}</div>
          <Mono color={C.textD} size={9}>OWNER · {a.owner}</Mono></div>
        </Card>;})}
      </div>}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="questions" && (() => {
        const hasCross = result.crossQuestions?.length > 0;
        return <div>
          {hasCross && <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            {[["meeting","💬 Ce meeting","Questions pour le prochain meeting avec ce directeur"],
              ["cross","🔀 Cross-questions",`Questions pour ${result.crossQuestions?.length} autre(s) personne(s) mentionnée(s)`]
            ].map(([id,label,hint]) => (
              <button key={id} onClick={()=>setQsub(id)} style={{
                padding:"7px 14px", borderRadius:7, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                background: qsub===id ? C.purple+"22" : "none",
                border:`1px solid ${qsub===id ? C.purple+"66" : C.border}`,
                color: qsub===id ? C.purple : C.textM, fontWeight: qsub===id ? 600 : 400,
              }}>
                {label}
                {id==="cross" && hasCross && <span style={{ marginLeft:6, background:C.purple+"33",
                  color:C.purple, borderRadius:10, padding:"1px 6px", fontSize:10 }}>
                  {result.crossQuestions.reduce((n,p)=>n+(p.questions?.length||0),0)}
                </span>}
              </button>
            ))}
          </div>}

          {(!hasCross || qsub==="meeting") && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {result.questions?.map((q,i) => <Card key={i}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <Badge label={`→ ${q.target}`} color={C.purple} size={10}/>
              </div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.7, marginBottom:8, fontStyle:"italic" }}>"{q.question}"</div>
              <div style={{ fontSize:12, color:C.textM }}><span style={{ color:C.em }}>💡 </span>{q.why}</div>
            </Card>)}
          </div>}

          {qsub==="cross" && hasCross && <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {result.crossQuestions.map((person, pi) => (
              <Card key={pi} style={{ borderLeft:`3px solid ${C.purple}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{person.person}</div>
                    <div style={{ fontSize:11, color:C.purple, marginTop:2 }}>{person.role}</div>
                  </div>
                  <Badge label={person.relationship} color={C.blue} size={9}/>
                </div>
                <div style={{ fontSize:11, color:C.textM, background:C.surfLL, borderRadius:6,
                  padding:"7px 10px", marginBottom:10, lineHeight:1.6 }}>
                  <span style={{ color:C.amber }}>Contexte → </span>{person.context}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {person.questions?.map((q,qi) => (
                    <div key={qi} style={{ paddingLeft:10, borderLeft:`2px solid ${C.purple}33` }}>
                      <div style={{ fontSize:13, color:C.text, fontStyle:"italic", lineHeight:1.65, marginBottom:4 }}>
                        "{q.question}"
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <Badge label={q.angle} color={C.purple} size={9}/>
                        <span style={{ fontSize:11, color:C.textM }}>{q.objective}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>}
        </div>;
      })()}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="case" && result.caseEntry && <Card style={{ borderLeft:`3px solid ${C.em}` }}>
        <SecHead icon="📂" label="Entrée Case Log" color={C.em}/>
        {[["Titre",result.caseEntry.title],["Type",result.caseEntry.type],["Risque",result.caseEntry.riskLevel],
          ["Situation",result.caseEntry.situation],["Interventions",result.caseEntry.interventionsDone],
          ["Position RH",result.caseEntry.hrPosition],["Prochain suivi",result.caseEntry.nextFollowUp],
          ["Notes",result.caseEntry.notes]].map(([l,v],i) => v ? <div key={i} style={{ marginBottom:12 }}>
          <Mono color={C.textD} size={9}>{l}</Mono>
          <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginTop:4 }}>{v}</div>
          {i<7 && <Divider my={8}/>}
        </div> : null)}
        {view==="result" && <button onClick={saveResult} disabled={saved}
          style={{ ...css.btn(C.em), width:"100%", marginTop:8 }}>
          {saved ? "✓ Sauvegardé" : "💾 Sauvegarder au Case Log"}
        </button>}
      </Card>}

      {view==="result" && !saved && <div style={{ textAlign:"center", marginTop:16 }}>
        <button onClick={() => { setView("new"); setResult(null); setTranscript(""); setContext(""); }}
          style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7,
            padding:"8px 20px", fontSize:12, color:C.textD, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
          ↺ Nouvelle analyse
        </button>
      </div>}
    </div>
  );

  if (view === "director") {
    const dm = meetings.filter(m => m.director===activeDir).reverse();
    return <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={() => setView("list")} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{activeDir}</div>
        <Badge label={`${dm.length} meetings`} color={C.blue}/>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {dm.map((m,i) => { const r=RISK[m.analysis?.overallRisk]||RISK["Faible"]; return (
          <button key={i} onClick={() => { setActiveSession(m); setResult(m.analysis); setTab("summary"); setView("session"); }}
            style={{ ...css.card, cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{m.analysis?.meetingTitle}</span>
              <RiskBadge level={m.analysis?.overallRisk}/>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <Mono color={C.textD} size={8}>{m.savedAt}</Mono>
              <span style={{ fontSize:11, color:C.textM }}>· {m.analysis?.actions?.length||0} actions · {m.analysis?.questions?.length||0} questions</span>
            </div>
          </button>
        );})}
      </div>
    </div>;
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: CASE LOG
// ══════════════════════════════════════════════════════════════════════════════
const CASE_TYPES = [
  {id:"performance",label:"Performance",icon:"📉",color:C.amber},
  {id:"pip",label:"PIP / Correctif",icon:"📋",color:C.red},
  {id:"conflict_ee",label:"Conflit EE/EE",icon:"⚡",color:C.amber},
  {id:"conflict_em",label:"Conflit EE/Mgr",icon:"🔥",color:C.red},
  {id:"complaint",label:"Plainte",icon:"🚨",color:C.pink},
  {id:"immigration",label:"Immigration",icon:"✈",color:C.teal},
  {id:"retention",label:"Rétention / Flight Risk",icon:"🎯",color:C.purple},
  {id:"promotion",label:"Promotion",icon:"⬆",color:C.purple},
  {id:"return",label:"Retour d'absence",icon:"🌱",color:C.em},
  {id:"reorg",label:"Restructuration",icon:"🔄",color:C.blue},
  {id:"exit",label:"Départ",icon:"🚪",color:C.textM},
  {id:"investigation",label:"Enquête",icon:"⚖",color:"#7a1e2e"},
];
const STATUSES = [
  {id:"open",label:"Ouvert",color:C.blue},
  {id:"active",label:"Actif",color:C.amber},
  {id:"pending",label:"En attente",color:C.purple},
  {id:"resolved",label:"Résolu",color:C.em},
  {id:"closed",label:"Fermé",color:C.textD},
  {id:"escalated",label:"Escaladé",color:C.red},
];
const EMPTY_FORM = { title:"", type:"conflict_ee", riskLevel:"Modéré", status:"active",
  director:"", employee:"", department:"", openDate:new Date().toISOString().split("T")[0],
  province:"QC",
  situation:"", interventionsDone:"", hrPosition:"", decision:"", nextFollowUp:"",
  notes:"", actions:[] };

function ModuleCases({ data, onSave }) {
  const [view, setView] = useState("list"); // list | form | detail
  const [form, setForm] = useState({...EMPTY_FORM});
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const cases = data.cases || [];
  const filtered = cases.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.title?.toLowerCase().includes(q) || c.director?.toLowerCase().includes(q) || c.employee?.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  }).reverse();

  const save = () => {
    const newCase = { ...form, id: editId || Date.now().toString(), updatedAt: new Date().toISOString().split("T")[0] };
    const updated = editId ? cases.map(c => c.id===editId ? newCase : c) : [...cases, newCase];
    onSave("cases", updated);
    setView("list"); setForm({...EMPTY_FORM}); setEditId(null);
  };

  const deleteCase = (id) => {
    onSave("cases", cases.filter(c => c.id !== id));
    setView("list");
  };

  const openEdit = (c) => { setForm({...EMPTY_FORM, ...c}); setEditId(c.id); setView("form"); };

  const F = ({label, children}) => <div style={{ marginBottom:14 }}>
    <Mono color={C.textD} size={9}>{label}</Mono>
    <div style={{ marginTop:6 }}>{children}</div>
  </div>;

  if (view === "form") return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={() => { setView("list"); setForm({...EMPTY_FORM}); setEditId(null); }}
          style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{editId ? "Modifier le dossier" : "Nouveau dossier"}</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <F label="Titre du dossier *">
          <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
            placeholder="Ex: Conflit infra Nolan-Laroche" style={css.input}
            onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        </F>
        <F label="Date d'ouverture">
          <input value={form.openDate} onChange={e=>setForm(f=>({...f,openDate:e.target.value}))}
            style={css.input}
            onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        </F>
        <F label="Type de dossier">
          <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={css.select}>
            {CASE_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
        </F>
        <F label="Statut">
          <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={css.select}>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </F>
        <F label="Niveau de risque">
          <select value={form.riskLevel} onChange={e=>setForm(f=>({...f,riskLevel:e.target.value}))} style={css.select}>
            {["Critique","Élevé","Modéré","Faible"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </F>
        <F label="Directeur concerné">
          <input value={form.director} onChange={e=>setForm(f=>({...f,director:e.target.value}))}
            placeholder="Nom du directeur" style={css.input}
            onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        </F>
        <F label="Employé / Groupe concerné">
          <input value={form.employee} onChange={e=>setForm(f=>({...f,employee:e.target.value}))}
            placeholder="Prénom, rôle ou groupe" style={css.input}
            onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        </F>
        <F label="Département / Équipe">
          <input value={form.department} onChange={e=>setForm(f=>({...f,department:e.target.value}))}
            placeholder="Ex: IT Infrastructure" style={css.input}
            onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        </F>
        <F label="Province">
          <ProvinceSelect
            value={form.province||data.profile?.defaultProvince||"QC"}
            onChange={e=>setForm(f=>({...f,province:e.target.value}))}/>
        </F>
      </div>

      <F label="Description de la situation">
        <textarea rows={3} value={form.situation} onChange={e=>setForm(f=>({...f,situation:e.target.value}))}
          placeholder="Description factuelle et concise de la situation…" style={css.textarea}
          onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
      </F>
      <F label="Interventions / Actions faites">
        <textarea rows={2} value={form.interventionsDone} onChange={e=>setForm(f=>({...f,interventionsDone:e.target.value}))}
          placeholder="Interventions, conversations, documents produits…" style={css.textarea}
          onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
      </F>
      <F label="Position RH recommandée">
        <textarea rows={2} value={form.hrPosition} onChange={e=>setForm(f=>({...f,hrPosition:e.target.value}))}
          placeholder="Recommandation formelle ou en cours…" style={css.textarea}
          onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
      </F>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <F label="Prochain suivi">
          <input value={form.nextFollowUp} onChange={e=>setForm(f=>({...f,nextFollowUp:e.target.value}))}
            placeholder="Ex: 16 mars 2026" style={css.input}
            onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        </F>
      </div>
      <F label="Notes HRBP">
        <textarea rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
          placeholder="Patterns organisationnels, liens avec d'autres dossiers…" style={css.textarea}
          onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
      </F>

      <div style={{ display:"flex", gap:10, marginTop:8 }}>
        <button onClick={save} disabled={!form.title}
          style={{ ...css.btn(C.em), flex:1, opacity:form.title?1:.4 }}>
          {editId ? "💾 Mettre à jour" : "💾 Créer le dossier"}
        </button>
        <button onClick={() => { setView("list"); setForm({...EMPTY_FORM}); setEditId(null); }}
          style={{ ...css.btn(C.textM, true) }}>Annuler</button>
      </div>
    </div>
  );

  if (view === "detail" && detail) {
    const c = detail;
    const typeObj = CASE_TYPES.find(t=>t.id===c.type);
    const statusObj = STATUSES.find(s=>s.id===c.status);
    const r = RISK[c.riskLevel]||RISK["Modéré"];
    return <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <button onClick={() => setView("list")} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{c.title}</div>
        <button onClick={() => openEdit(c)} style={{ ...css.btn(C.blue, true), padding:"6px 14px", fontSize:12 }}>✏ Modifier</button>
        <button onClick={() => { if(window.confirm("Supprimer ce dossier?")) deleteCase(c.id); }}
          style={{ ...css.btn(C.red, true), padding:"6px 14px", fontSize:12 }}>🗑 Supprimer</button>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
        <RiskBadge level={c.riskLevel}/>
        {statusObj && <Badge label={statusObj.label} color={statusObj.color}/>}
        {typeObj && <Badge label={`${typeObj.icon} ${typeObj.label}`} color={typeObj.color}/>}
        {c.director && <Badge label={c.director} color={C.blue}/>}
        <ProvinceBadge province={getProvince(c, data.profile)}/>
        {c.openDate && <Mono color={C.textD}>Ouvert: {c.openDate}</Mono>}
      </div>
      <Card>
        {[["Employé / Groupe",c.employee],["Département",c.department],["Situation",c.situation],
          ["Interventions",c.interventionsDone],["Position RH",c.hrPosition],
          ["Prochain suivi",c.nextFollowUp],["Notes HRBP",c.notes]].map(([l,v],i) => v ? (
          <div key={i} style={{ marginBottom:14 }}>
            <Mono color={C.textD} size={9}>{l}</Mono>
            <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginTop:4 }}>{v}</div>
            <Divider my={8}/>
          </div>) : null)}
      </Card>
    </div>;
  }

  return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Case Log</div>
          <div style={{ fontSize:12, color:C.textM }}>{cases.length} dossier(s) · {cases.filter(c=>c.status==="active"||c.status==="open").length} actifs</div>
        </div>
        <button onClick={() => { setForm({...EMPTY_FORM}); setEditId(null); setView("form"); }} style={css.btn(C.em)}>
          + Nouveau dossier
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Rechercher..." style={{ ...css.input, maxWidth:240 }}
          onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        <div style={{ display:"flex", gap:4 }}>
          {["all",...STATUSES.map(s=>s.id)].map(s => {
            const so = STATUSES.find(x=>x.id===s);
            return <button key={s} onClick={() => setFilterStatus(s)}
              style={{ background:filterStatus===s?(so?.color||C.em)+"22":"none",
                color:filterStatus===s?(so?.color||C.em):C.textM,
                border:`1px solid ${filterStatus===s?(so?.color||C.em)+"44":C.border}`,
                borderRadius:6, padding:"6px 12px", fontSize:11, cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif" }}>
              {s==="all" ? "Tous" : so?.label}
            </button>;
          })}
        </div>
      </div>

      {/* Cases list */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.map((c,i) => {
          const r = RISK[c.riskLevel]||RISK["Modéré"];
          const typeObj = CASE_TYPES.find(t=>t.id===c.type);
          const statusObj = STATUSES.find(s=>s.id===c.status);
          return <button key={c.id||i} onClick={() => { setDetail(c); setView("detail"); }}
            style={{ background:C.surfL, border:`1px solid ${r.color}28`, borderLeft:`3px solid ${r.color}`,
              borderRadius:8, padding:"13px 15px", cursor:"pointer", textAlign:"left",
              fontFamily:"'DM Sans',sans-serif", transition:"border-color .15s" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{c.title}</span>
              <div style={{ display:"flex", gap:6, flexShrink:0, marginLeft:8 }}>
                <RiskBadge level={c.riskLevel}/>
                {statusObj && <Badge label={statusObj.label} color={statusObj.color}/>}
              </div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              {typeObj && <span style={{ fontSize:11, color:typeObj.color }}>{typeObj.icon} {typeObj.label}</span>}
              {c.director && <span style={{ fontSize:11, color:C.textM }}>· {c.director}</span>}
              {c.employee && <span style={{ fontSize:11, color:C.textM }}>· {c.employee}</span>}
              <ProvinceBadge province={getProvince(c, data.profile)}/>
              {c.nextFollowUp && <span style={{ fontSize:10, color:C.purple, marginLeft:"auto" }}>📅 {c.nextFollowUp}</span>}
            </div>
          </button>;
        })}
        {filtered.length === 0 && <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
          {search ? "Aucun résultat" : "Aucun dossier. Créez le premier ↑"}
        </div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: SIGNALS
// ══════════════════════════════════════════════════════════════════════════════
const SIGNAL_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Québec. Analyse le signal organisationnel fourni.
Réponds UNIQUEMENT en JSON strict. Structure :
{"title":"Titre court du signal (max 6 mots)","category":"Culture|Structure|Communication|Leadership|Rétention|Performance|Légal","severity":"Critique|Élevé|Modéré|Faible","interpretation":"Ce que ce signal révèle sur l'organisation (2-3 phrases)","rootCause":"Cause racine probable","patterns":["pattern organisationnel 1","pattern 2"],"risks":[{"risk":"risque RH identifié","level":"Critique|Élevé|Modéré|Faible"}],"actions":[{"action":"action recommandée","delay":"Immédiat|24h|7 jours|Continu"}],"relatedSignals":["signal connexe potentiel 1","signal connexe 2"],"verdict":"1 phrase — ce que tu ferais concrètement comme HRBP"}`;

function ModuleSignals({ data, onSave }) {
  const [view, setView] = useState("list");
  const [signalText, setSignalText] = useState("");
  const [source, setSource] = useState("meeting");
  const [director, setDirector] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [signalPrompt, setSignalPrompt] = useState("");

  const signals = data.signals || [];

  const analyze = async () => {
    if (signalText.trim().length < 20) return;
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const prompt = `SOURCE: ${source}\nDIRECTEUR/CONTEXTE: ${director||"Non spécifié"}\n\nSIGNAL:\n${signalText}`;
      const parsed = await callAI(SIGNAL_SP, prompt);
      setResult(parsed);
      setView("result");
    } catch(e) { setError("Erreur: " + e.message); }
    finally { setLoading(false); }
  };

  const saveSignal = () => {
    if (!result || saved) return;
    const s = { id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0],
      source, director, signal:signalText, analysis:result };
    onSave("signals", [...signals, s]);
    setSaved(true);
  };

  if (view === "result" && result) return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={() => { setView("list"); setResult(null); setSignalText(""); }}
          style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.title}</div>
        <button onClick={saveSignal} disabled={saved} style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>
          {saved ? "✓ Sauvegardé" : "💾 Sauvegarder"}
        </button>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <RiskBadge level={result.severity}/>
        <Badge label={result.category} color={C.purple}/>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <Card>
          <SecHead icon="🔍" label="Interprétation" color={C.purple}/>
          <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{result.interpretation}</div>
          {result.rootCause && <div style={{ marginTop:10, fontSize:12, color:C.textM }}>
            <span style={{ color:C.amber }}>Cause racine : </span>{result.rootCause}
          </div>}
        </Card>
        <Card>
          <SecHead icon="⚡" label="Verdict HRBP" color={C.em}/>
          <div style={{ fontSize:13, color:C.text, lineHeight:1.7, fontStyle:"italic" }}>{result.verdict}</div>
        </Card>
        {result.actions?.length > 0 && <Card>
          <SecHead icon="🎯" label="Actions recommandées" color={C.em}/>
          {result.actions.map((a,i) => <div key={i} style={{ display:"flex", gap:8, marginBottom:8 }}>
            <Badge label={a.delay} color={DELAY_C[a.delay]||C.blue} size={10}/>
            <span style={{ fontSize:13, color:C.text }}>{a.action}</span>
          </div>)}
        </Card>}
        {result.risks?.length > 0 && <Card>
          <SecHead icon="⚠" label="Risques identifiés" color={C.red}/>
          {result.risks.map((r,i) => <div key={i} style={{ display:"flex", gap:8, marginBottom:6 }}>
            <RiskBadge level={r.level}/>
            <span style={{ fontSize:13, color:C.text }}>{r.risk}</span>
          </div>)}
        </Card>}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Signal Detector</div>
          <div style={{ fontSize:12, color:C.textM }}>{signals.length} signal(s) enregistré(s)</div>
        </div>
      </div>

      {/* New signal */}
      <Card style={{ marginBottom:20 }}>
        <SecHead icon="📡" label="Nouveau signal" color={C.purple}/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div>
            <Mono color={C.textD}>Source</Mono>
            <select value={source} onChange={e=>setSource(e.target.value)} style={{ ...css.select, marginTop:6 }}>
              {[{v:"meeting",l:"Meeting"},{ v:"corridor",l:"Corridor/Informel"},{v:"slack",l:"Slack/Teams"},
                {v:"hr_report",l:"Rapport RH"},{v:"manager",l:"Gestionnaire"},{v:"other",l:"Autre"}].map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <div>
            <Mono color={C.textD}>Directeur / Contexte</Mono>
            <input value={director} onChange={e=>setDirector(e.target.value)}
              placeholder="Nom ou contexte" style={{ ...css.input, marginTop:6 }}
              onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
        </div>
        <Mono color={C.textD}>Description du signal</Mono>
        <textarea rows={4} value={signalText} onChange={e=>setSignalText(e.target.value)}
          placeholder="Décris ce que tu as observé, entendu ou ressenti…"
          style={{ ...css.textarea, marginTop:6 }}
          onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        {error && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
          padding:"8px 12px", margin:"10px 0", fontSize:12, color:C.red }}>⚠ {error}</div>}
        {loading ? <AILoader label="Analyse du signal" /> : (
          <button onClick={analyze} disabled={signalText.trim().length<20}
            style={{ ...css.btn(C.purple), width:"100%", marginTop:12, opacity:signalText.trim().length>=20?1:.4 }}>
            📡 Analyser le signal
          </button>
        )}
      </Card>

      {/* Signal history */}
      {signals.length > 0 && <>
        <Mono color={C.textD} size={9}>Signaux enregistrés</Mono>
        <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>
          {signals.slice().reverse().map((s,i) => {
            const r = RISK[s.analysis?.severity]||RISK["Modéré"];
            return <div key={i} style={{ background:C.surfL, border:`1px solid ${r.color}28`,
              borderLeft:`3px solid ${r.color}`, borderRadius:8, padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{s.analysis?.title||s.signal?.substring(0,50)}</span>
                <RiskBadge level={s.analysis?.severity||"Modéré"}/>
              </div>
              <div style={{ fontSize:11, color:C.textM }}>{s.director && `${s.director} · `}{s.savedAt}</div>
            </div>;
          })}
        </div>
      </>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: WEEKLY BRIEF
// ══════════════════════════════════════════════════════════════════════════════
const BRIEF_SP = `Tu es un HRBP senior expert, groupe IT corporatif, Quebec. Tu produis des briefings strategiques RH hebdomadaires pour Samuel Chartrand.
Reponds UNIQUEMENT en JSON valide strict. Aucun texte avant ou apres. Aucun backtick. Aucune apostrophe dans les valeurs JSON. Max 1 phrase par valeur de champ texte. Max 4 items par tableau.
{"weekOf":"semaine du [date]","executiveSummary":"Resume en 2 phrases max — priorite absolue de la semaine","riskLevel":"Critique|Eleve|Modere|Faible","riskRationale":"1 phrase","orgPulse":{"overall":"Sain|Fragile|Sous tension|En crise","signals":["signal org 1","signal org 2","signal org 3"]},"topPriorities":[{"priority":"action prioritaire","urgency":"Immediat|Cette semaine|Semaine prochaine","why":"justification courte"}],"keyRisks":[{"risk":"risque RH","level":"Critique|Eleve|Modere|Faible","owner":"HRBP|Direction|RH+Dir"}],"leadershipWatch":[{"person":"role ou nom","signal":"observation","action":"prochaine etape"}],"retentionWatch":[{"profile":"profil a risque","risk":"Critique|Eleve|Modere","window":"30j|60j|90j","lever":"levier de retention"}],"weeklyActions":[{"action":"action concrete","deadline":"delai","owner":"HRBP|Gestionnaire|Direction"}],"lookAhead":"Ce a quoi s attendre la semaine prochaine en 2 phrases max"}`;

const NEXT_WEEK_LOCK_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Quebec.
A partir d un recap RH hebdomadaire final deja envoye a la directrice, transforme ce recap en angle de pilotage pour la semaine suivante.
Ne fais PAS un resume du recap. Force la priorisation. Un seul theme. Deux priorites maximum. Deux managers focus maximum. Une seule action structurante. Un seul message leadership.
Tout doit etre executable dans les 7 prochains jours. Sois specifique et direct. Aucune generalite RH.
Reponds UNIQUEMENT en JSON valide. Aucun texte avant ou apres. Aucun backtick. Aucune apostrophe dans les valeurs JSON.
{"theme":"3-5 mots max — angle qui guide toute la semaine","why":"1-2 phrases max — impact business concret, pas jargon RH","priorities":[{"priority":"priorite concrete et nommee","whyNow":"declencheur precis tire du recap"},{"priority":"priorite concrete et nommee","whyNow":"declencheur precis tire du recap"}],"managerFocus":[{"name":"nom ou role specifique","reason":"pourquoi focus cette semaine"},{"name":"nom ou role specifique","reason":"pourquoi focus cette semaine"}],"structuralAction":{"action":"action structurelle concrete — process, gouvernance, systeme — pas du coaching","impact":"impact observable cette semaine si je le fais"},"leadershipMessage":"message court en francais — pret a envoyer — concis — 2-3 phrases max"}`;


const RECAP_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Quebec. A partir de notes brutes hebdomadaires, redige un recap RH structure pour ta directrice.
Classe automatiquement chaque element dans la bonne categorie. Redige des phrases completes claires — qui, quoi, statut, prochaine etape. Sans noms propres pour les dossiers sensibles (performance/enquetes). Si une categorie est vide, retourne [].
Reponds UNIQUEMENT en JSON valide. Aucun backtick. Aucune apostrophe dans les valeurs JSON.
{"weekLabel":"Semaine du [date]","recrutement":{"embauches":[{"item":"phrase complete"}],"processus":[{"item":"phrase complete"}],"ouvertures":[{"item":"phrase complete"}]},"promotions":[{"item":"phrase complete"}],"fins_emploi":[{"item":"phrase complete"}],"performance":[{"item":"phrase complete — sans nom"}],"projets_rh":[{"item":"phrase complete"}],"divers":[{"item":"phrase complete"}]}`;

function ModuleBrief({ data, onSave }) {
  const [view, setView] = useState("new");
  const [briefTab, setBriefTab] = useState("brief"); // brief | recap
  const [inputs, setInputs] = useState({ meetings:"", signals:"", cases:"", kpi:"", other:"", weekOf:"" });

  // Recap — auto-generated from week history
  const [recapSubTab, setRecapSubTab] = useState("generate"); // generate | sent | history
  const [sentRecapText, setSentRecapText] = useState("");
  const [sentRecapSaved, setSentRecapSaved] = useState(false);
  const [recapResult, setRecapResult] = useState(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState("");
  const [copied, setCopied] = useState(false);
  const [recapPrompt, setRecapPrompt] = useState("");

  // ── Next Week Lock state ──────────────────────────────────────────────────
  const [nwlSourceIdx, setNwlSourceIdx] = useState(0);   // index into sentRecaps (0 = latest)
  const [nwlResult, setNwlResult]       = useState(null);
  const [nwlLoading, setNwlLoading]     = useState(false);
  const [nwlError, setNwlError]         = useState("");
  const [nwlSaved, setNwlSaved]         = useState(false);
  const [nwlCopied, setNwlCopied]       = useState(false);
  const [nwlPrompt, setNwlPrompt]       = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);

  const getWeekBounds = () => {
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today); monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1)); monday.setHours(0,0,0,0);
    const friday = new Date(monday); friday.setDate(monday.getDate() + 4); friday.setHours(23,59,59,999);
    const toISO = d => d.toISOString().split("T")[0];
    return { start: toISO(monday), end: toISO(friday) };
  };
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const briefs = data.briefs || [];

  const parseDate = (str) => {
    if (!str) return null;
    // ISO format YYYY-MM-DD (canonical after our standardization)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + "T00:00:00");
    // fr-CA legacy DD/MM/YYYY
    const fr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (fr) return new Date(`${fr[3]}-${fr[2]}-${fr[1]}T00:00:00`);
    // Fallback
    try { const d = new Date(str); return isNaN(d) ? null : d; } catch { return null; }
  };

  const inPeriod = (dateStr) => {
    if (!periodStart || !periodEnd) return true;
    const d = parseDate(dateStr);
    if (!d) return false;
    const start = new Date(periodStart); start.setHours(0,0,0,0);
    const end = new Date(periodEnd); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  };

  const autoFill = () => {
    const allMeetings = data.meetings || [];
    const allSignals = data.signals || [];
    const allCases = data.cases || [];

    const filteredMeetings = allMeetings.filter(m => inPeriod(m.savedAt));
    const filteredSignals = allSignals.filter(s => inPeriod(s.savedAt));

    const meetingsTxt = filteredMeetings.length > 0
      ? filteredMeetings.map(m =>
          `Meeting ${m.director} (${m.savedAt}): ${m.analysis?.meetingTitle} — Risque ${m.analysis?.overallRisk}. Actions: ${m.analysis?.actions?.map(a=>a.action).join("; ")}`
        ).join("\n")
      : "(Aucun meeting enregistré dans cette période)";

    const signalsTxt = filteredSignals.length > 0
      ? filteredSignals.map(s =>
          `Signal ${s.analysis?.category} (${s.savedAt}): ${s.analysis?.title} — ${s.analysis?.severity}`
        ).join("\n")
      : "(Aucun signal enregistré dans cette période)";

    const casesTxt = allCases.filter(c => c.status==="active"||c.status==="open").map(c =>
      `Dossier actif: ${c.title} — Risque ${c.riskLevel} — Suivi: ${c.nextFollowUp||"N/A"}`
    ).join("\n") || "(Aucun dossier actif)";

    const weekLabel = periodStart && periodEnd
      ? `Semaine du ${new Date(periodStart).toLocaleDateString("fr-CA")} au ${new Date(periodEnd).toLocaleDateString("fr-CA")}`
      : `Semaine du ${new Date().toLocaleDateString("fr-CA")}`;

    setInputs(f => ({ ...f, meetings: meetingsTxt, signals: signalsTxt, cases: casesTxt,
      weekOf: weekLabel, other: f.other || `Données: ${filteredMeetings.length} meeting(s), ${filteredSignals.length} signal(s) dans la période.` }));

    // Also pre-fill recap from cases
    const caseTAFill = allCases.filter(c => c.type==="performance"||c.type==="pip"||c.type==="complaint"||c.type==="investigation")
      .map(c => `${c.title} (${c.employee||c.director||""}) — ${c.status}`).join("\n");
    if (caseTAFill) setRecapInputs(f => ({ ...f, performance: f.performance || caseTAFill }));

    const retentionFill = allCases.filter(c => c.type==="exit"||c.type==="reorg")
      .map(c => `${c.title} — ${c.status}`).join("\n");
    if (retentionFill) setRecapInputs(f => ({ ...f, fins_emploi: f.fins_emploi || retentionFill }));
  };

  const generate = async () => {
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const prompt = `SEMAINE DU: ${inputs.weekOf||new Date().toLocaleDateString("fr-CA")}
MEETINGS DE LA SEMAINE:\n${inputs.meetings||"Aucun meeting documenté"}
SIGNAUX DÉTECTÉS:\n${inputs.signals||"Aucun signal documenté"}
DOSSIERS ACTIFS:\n${inputs.cases||"Aucun dossier actif"}
KPI / DONNÉES RH:\n${inputs.kpi||"Non disponible"}
CONTEXTE ADDITIONNEL:\n${inputs.other||""}`;
      const parsed = await callAI(BRIEF_SP, prompt, prompt.length);
      setResult(parsed); setSaved(false); setView("new"); setBriefTab("brief");
    } catch(e) { setError("Erreur: " + e.message); }
    finally { setLoading(false); }
  };

  const generateRecap = async () => {
    setRecapLoading(true); setRecapError(""); setRecapResult(null); setCopied(false);
    try {
      const allMeetings   = data.meetings       || [];
      const allSignals    = data.signals         || [];
      const allCases      = data.cases           || [];
      const allPreps      = data.prep1on1        || [];
      const allBriefs     = data.briefs          || [];

      const weekMeetings  = allMeetings.filter(m => inPeriod(m.savedAt));
      const weekSignals   = allSignals.filter(s  => inPeriod(s.savedAt));
      const weekPreps     = allPreps.filter(p    => inPeriod(p.savedAt));
      const activeCases   = allCases.filter(c    => c.status === "active" || c.status === "open");

      const weekLabel = periodStart && periodEnd
        ? `Semaine du ${new Date(periodStart).toLocaleDateString("fr-CA")} au ${new Date(periodEnd).toLocaleDateString("fr-CA")}`
        : `Semaine du ${new Date().toLocaleDateString("fr-CA")}`;

      // Build rich meeting summaries — full actions, risks, people observations
      const meetingsTxt = weekMeetings.length > 0
        ? weekMeetings.map(m => {
            const a = m.analysis || {};
            const actions   = a.actions?.map(x => x.action).join(" | ") || "";
            const risks     = a.risks?.map(x => `${x.level}: ${x.risk}`).join(" | ") || "";
            const people    = [...(a.people?.performance||[]), ...(a.people?.leadership||[]), ...(a.people?.engagement||[])].join(" | ");
            const taPostes  = a.postes?.map(p => `${p.titre} (${p.etape}) — ${p.statutDetail}`).join(" | ") || "";
            return [
              `MEETING [${m.savedAt}] ${m.meetingType?.toUpperCase()||""} — ${m.director||""}`,
              `  Titre: ${a.meetingTitle||""}`,
              `  Risque global: ${a.overallRisk||""} — ${a.overallRiskRationale||""}`,
              `  Résumé: ${(a.summary||[]).join(" | ")}`,
              actions   ? `  Actions: ${actions}`   : "",
              risks     ? `  Risques: ${risks}`     : "",
              people    ? `  People: ${people}`     : "",
              taPostes  ? `  Postes TA: ${taPostes}` : "",
            ].filter(Boolean).join("\n");
          }).join("\n\n")
        : "(Aucun meeting dans la période)";

      // Signals
      const signalsTxt = weekSignals.length > 0
        ? weekSignals.map(s => {
            const a = s.analysis || {};
            return `SIGNAL [${s.savedAt}] ${a.category||""} — ${a.title||""} (${a.severity||""})
  Interprétation: ${a.interpretation||""}
  Actions: ${a.actions?.map(x=>x.action).join(" | ")||""}`;
          }).join("\n\n")
        : "(Aucun signal dans la période)";

      // Active cases — full detail
      const casesTxt = activeCases.length > 0
        ? activeCases.map(c =>
            `DOSSIER ACTIF [${c.type||""}] ${c.title||""} — Risque: ${c.riskLevel||""} — Statut: ${c.status||""}
  Situation: ${c.situation||""}
  Interventions: ${c.interventionsDone||""}
  Position RH: ${c.hrPosition||""}
  Prochain suivi: ${c.nextFollowUp||""}`
          ).join("\n\n")
        : "(Aucun dossier actif)";

      // 1:1 prep sessions this week
      const prepsTxt = weekPreps.length > 0
        ? weekPreps.map(p => {
            const o = p.output || {};
            return `PREP 1:1 [${p.savedAt}] ${p.managerName||""}
  Résumé: ${o.executiveSummary||""}
  Risques: ${o.mainRisks?.join(" | ")||""}
  Suivis HRBP: ${o.hrbpFollowups?.join(" | ")||""}`;
          }).join("\n\n")
        : "";

      const prompt = `SEMAINE: ${weekLabel}
Génère un récap structuré pour ma directrice à partir de tout ce qui s'est passé cette semaine.

=== MEETINGS (${weekMeetings.length}) ===
${meetingsTxt}

=== SIGNAUX ORGANISATIONNELS (${weekSignals.length}) ===
${signalsTxt}

=== DOSSIERS ACTIFS (${activeCases.length}) ===
${casesTxt}
${prepsTxt ? `\n=== PRÉPARATIONS 1:1 (${weekPreps.length}) ===\n${prepsTxt}` : ""}`;

      const parsed = await callAI(RECAP_SP, prompt, prompt.length);
      setRecapResult(parsed);
    } catch(e) { setRecapError("Erreur: " + e.message); }
    finally { setRecapLoading(false); }
  };

  const stripEmoji = (str) =>
    str.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u2190-\u21FF]/gu, "")
       .replace(/\s{2,}/g, " ").trim();

  const buildCopyText = (r) => {
    if (!r) return "";
    const lines = [];
    lines.push(`Récap RH — ${r.weekLabel || inputs.weekOf || ""}`);
    lines.push("");

    const section = (title, items) => {
      if (!items || items.length === 0) return;
      lines.push(title);
      items.forEach(i => lines.push(`  - ${stripEmoji(i.item)}`));
      lines.push("");
    };

    if (r.recrutement?.embauches?.length || r.recrutement?.processus?.length || r.recrutement?.ouvertures?.length) {
      lines.push("Recrutement");
      if (r.recrutement?.embauches?.length) { lines.push("  Embauches confirmées :"); r.recrutement.embauches.forEach(i => lines.push(`    - ${stripEmoji(i.item)}`)); }
      if (r.recrutement?.processus?.length) { lines.push("  Processus en cours :"); r.recrutement.processus.forEach(i => lines.push(`    - ${stripEmoji(i.item)}`)); }
      if (r.recrutement?.ouvertures?.length) { lines.push("  Ouvertures de poste :"); r.recrutement.ouvertures.forEach(i => lines.push(`    - ${stripEmoji(i.item)}`)); }
      lines.push("");
    }
    section("Promotions", r.promotions);
    section("Fins d'emploi", r.fins_emploi);
    section("Gestion de la performance / Plaintes / Enquêtes", r.performance);
    section("Processus et Projets RH", r.projets_rh);
    section("Divers", r.divers);
    return lines.join("\n");
  };

  const copyRecap = () => {
    const text = buildCopyText(recapResult);
    // execCommand works in iframes where clipboard API is blocked
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.top = "0"; ta.style.left = "0";
    ta.style.width = "1px"; ta.style.height = "1px"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) {
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } else {
      // Last resort: show in prompt so user can Ctrl+C manually
      window.prompt("Copie ce texte (Ctrl+C) :", text);
    }
  };

  const saveBrief = () => {
    if (!result || saved) return;
    const b = { id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], brief:result };
    onSave("briefs", [...briefs, b]);
    setSaved(true);
  };

  const saveSentRecap = () => {
    if (!sentRecapText.trim() || sentRecapSaved) return;
    const weekLabel = inputs.weekOf || new Date().toLocaleDateString("fr-CA");
    const entry = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString().split("T")[0],
      weekLabel,
      sentText: sentRecapText.trim(),
    };
    // Store sent recaps as a separate list in briefs storage under a sentRecaps key
    const existing = data.sentRecaps || [];
    onSave("sentRecaps", [...existing, entry]);
    setSentRecapSaved(true);
    setTimeout(() => setSentRecapSaved(false), 3000);
  };

  // ── BRIEF TABS (shown when result exists)
  const BRIEF_RESULT_TABS = [
    { id:"brief", label:"📊 Intelligence Brief" },
    { id:"recap", label:"📋 Récap directrice" },
  ];

  // ── Next Week Lock ─────────────────────────────────────────────────────────
  const generateNWL = async () => {
    const sentList = [...(data.sentRecaps||[])].reverse();
    const recap = sentList[nwlSourceIdx];
    if (!recap?.sentText?.trim()) return;
    setNwlLoading(true); setNwlError(""); setNwlResult(null); setNwlSaved(false);
    try {
      const parsed = await callAIJson(
        NEXT_WEEK_LOCK_SP,
        `RECAP ENVOYÉ (semaine ${recap.weekLabel}):\n\n${recap.sentText}`,
        1200
      );
      setNwlResult(parsed);
    } catch(e) { setNwlError("Erreur: " + e.message); }
    finally { setNwlLoading(false); }
  };

  const importNWLResponse = (parsed) => {
    setNwlResult(parsed);
  };

  const saveNWL = () => {
    if (!nwlResult || nwlSaved) return;
    const sentList = [...(data.sentRecaps||[])].reverse();
    const recap = sentList[nwlSourceIdx];
    const entry = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString().split("T")[0],
      sourceRecapId: recap?.id||"",
      sourceWeekLabel: recap?.weekLabel||"",
      lock: nwlResult,
    };
    onSave("nextWeekLocks", [...(data.nextWeekLocks||[]), entry]);
    setNwlSaved(true);
  };

  const copyNWL = () => {
    if (!nwlResult) return;
    const r = nwlResult;
    const sentList = [...(data.sentRecaps||[])].reverse();
    const recap = sentList[nwlSourceIdx];
    const txt = [
      `Next Week Lock — ${recap?.weekLabel||""}`,
      ``,
      `THÈME: ${r.theme}`,
      ``,
      `POURQUOI: ${r.why}`,
      ``,
      `TOP 2 PRIORITÉS:`,
      ...(r.priorities||[]).map((p,i)=>`${i+1}. ${p.priority}\n   → Pourquoi maintenant: ${p.whyNow}`),
      ``,
      `MANAGER FOCUS:`,
      ...(r.managerFocus||[]).map(m=>`- ${m.name} → ${m.reason}`),
      ``,
      `ACTION STRUCTURANTE:`,
      `${r.structuralAction?.action}`,
      `Impact: ${r.structuralAction?.impact}`,
      ``,
      `MESSAGE LEADERSHIP:`,
      `${r.leadershipMessage}`,
    ].join("\n");
    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    setNwlCopied(true); setTimeout(()=>setNwlCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Weekly Intelligence Brief</div>
          <div style={{ fontSize:12, color:C.textM }}>{briefs.length} brief(s) archivé(s)</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {briefs.length > 0 && <button onClick={() => setView(view==="archive"?"new":"archive")}
            style={{ ...css.btn(C.blue, true), padding:"8px 14px", fontSize:12 }}>
            {view==="archive"?"← Nouveau brief":"📚 Archive"}
          </button>}
          {view==="new" && <button onClick={autoFill}
            style={{ ...css.btn(C.purple, true), padding:"8px 14px", fontSize:12 }}>
            ⚡ Remplir depuis mes données
          </button>}
        </div>
      </div>

      {/* ARCHIVE VIEW */}
      {view === "archive" && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {briefs.slice().reverse().map((b,i) => {
          const r = RISK[b.brief?.riskLevel]||RISK["Modéré"];
          return <button key={i} onClick={() => { setResult(b.brief); setSaved(true); setView("new"); setBriefTab("brief"); }}
            style={{ background:C.surfL, border:`1px solid ${r.color}28`, borderLeft:`3px solid ${r.color}`,
              borderRadius:8, padding:"13px 15px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
              <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{b.brief?.weekOf}</span>
              <RiskBadge level={b.brief?.riskLevel}/>
            </div>
            <div style={{ fontSize:12, color:C.textM }}>{b.brief?.executiveSummary?.substring(0,100)}…</div>
          </button>;
        })}
      </div>}

      {/* NEW / FORM VIEW */}
      {view === "new" && !result && (
        <div>
          {/* Period */}
          <Card style={{ marginBottom:14 }}>
            <SecHead icon="📅" label="Période couverte" color={C.blue}/>
            <div style={{ display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" }}>
              <div>
                <Mono color={C.textD} size={9}>Du</Mono>
                <input type="date" value={periodStart} onChange={e=>{
                  setPeriodStart(e.target.value);
                  const end = new Date(e.target.value); end.setDate(end.getDate()+6);
                  setPeriodEnd(end.toISOString().split("T")[0]);
                }} style={{ display:"block", marginTop:4, padding:"7px 10px", borderRadius:7,
                  border:`1px solid ${C.border}`, fontSize:12, fontFamily:"inherit",
                  background:C.surfL, color:C.text, outline:"none" }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>Au</Mono>
                <input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)}
                  style={{ display:"block", marginTop:4, padding:"7px 10px", borderRadius:7,
                    border:`1px solid ${C.border}`, fontSize:12, fontFamily:"inherit",
                    background:C.surfL, color:C.text, outline:"none" }}/>
              </div>
              {periodStart && periodEnd && (
                <div style={{ fontSize:11, color:C.textM, paddingBottom:8 }}>
                  {`${new Date(periodStart).toLocaleDateString("fr-CA",{weekday:"short",month:"short",day:"numeric"})} → ${new Date(periodEnd).toLocaleDateString("fr-CA",{weekday:"short",month:"short",day:"numeric"})}`}
                </div>
              )}
            </div>
          </Card>

          {/* Tab switcher for input sections */}
          <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14 }}>
            {[{id:"brief",label:"📊 Intelligence Brief"},{id:"recap",label:"📋 Récap directrice"},{id:"nwl",label:"🔒 Next Week Lock"}].map(t => (
              <button key={t.id} onClick={() => setBriefTab(t.id)}
                style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 16px",
                  fontSize:12, fontWeight:briefTab===t.id?700:400,
                  color:briefTab===t.id?(t.id==="nwl"?C.purple:C.em):C.textM,
                  borderBottom:`2px solid ${briefTab===t.id?(t.id==="nwl"?C.purple:C.em):"transparent"}`,
                  marginBottom:-1, fontFamily:"'DM Sans',sans-serif" }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Brief inputs */}
          {briefTab === "brief" && (
            <div>
              <Card style={{ marginBottom:14 }}>
                <SecHead icon="📊" label="Inputs de la semaine" color={C.amber}/>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  {[
                    ["meetings","⚡ Meetings de la semaine","Résumé ou points clés de chaque meeting..."],
                    ["signals","📡 Signaux détectés","Observations, conversations informelles..."],
                    ["cases","📂 Dossiers actifs","Statut des cas en cours, escalades, résolutions..."],
                    ["kpi","📊 KPI / Données RH","Taux roulement, absentéisme, recrutement, headcount..."],
                  ].map(([key,label,ph]) => <div key={key}>
                    <Mono color={C.textD} size={9}>{label}</Mono>
                    <textarea rows={4} value={inputs[key]} onChange={e=>setInputs(f=>({...f,[key]:e.target.value}))}
                      placeholder={ph} style={{ ...css.textarea, marginTop:6 }}
                      onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                  </div>)}
                </div>
                <div style={{ marginTop:12 }}>
                  <Mono color={C.textD} size={9}>Contexte additionnel</Mono>
                  <input value={inputs.other} onChange={e=>setInputs(f=>({...f,other:e.target.value}))}
                    placeholder="Ex: annonce RH, réorg prévue, contexte corporatif..." style={{ ...css.input, marginTop:6 }}
                    onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                </div>
              </Card>

              {error && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
                padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {error}</div>}

              {loading ? <AILoader label="Génération du brief"/> : (
                <button onClick={generate} style={{ ...css.btn(C.amber), width:"100%", padding:"13px", fontSize:14,
                  boxShadow:`0 4px 20px ${C.amber}30` }}>
                  📊 Générer le Weekly Brief
                </button>
              )}
            </div>
          )}

          {briefTab === "recap" && (() => {
            const sentRecaps = data.sentRecaps || [];
            const lastSent = sentRecaps.length > 0 ? sentRecaps[sentRecaps.length - 1] : null;
            const subTabs = [
              { id:"generate", label:"⚡ Générer" },
              { id:"sent",     label:"📤 Récap envoyé" },
              { id:"history",  label:`📚 Historique${sentRecaps.length > 0 ? ` (${sentRecaps.length})` : ""}` },
            ];
            return (
              <div>
                {/* Sub-tabs */}
                <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14 }}>
                  {subTabs.map(t => (
                    <button key={t.id} onClick={() => setRecapSubTab(t.id)}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:"7px 14px",
                        fontSize:11, fontWeight:recapSubTab===t.id?700:400,
                        color:recapSubTab===t.id?C.blue:C.textM,
                        borderBottom:`2px solid ${recapSubTab===t.id?C.blue:"transparent"}`,
                        marginBottom:-1, fontFamily:"'DM Sans',sans-serif" }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* ── GENERATE sub-tab */}
                {recapSubTab === "generate" && (
                  <div>
                    <div style={{ background:C.blue+"10", border:`1px solid ${C.blue}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      📅 Généré automatiquement depuis tous tes meetings, signaux, dossiers et preps 1:1 de la période sélectionnée.
                    </div>
                    {recapError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
                      padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {recapError}</div>}
                    {recapLoading ? <AILoader label="Génération du récap depuis l'historique"/> : (
                      !recapResult && <button onClick={generateRecap} style={{ ...css.btn(C.blue), width:"100%", padding:"13px", fontSize:14,
                        boxShadow:`0 4px 20px ${C.blue}30` }}>
                        📋 Générer le récap directrice
                      </button>
                    )}
                  {recapResult && (
                    <div style={{ marginTop:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>📋 {recapResult.weekLabel}</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={() => setRecapResult(null)} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>↺ Regénérer</button>
                          <button onClick={copyRecap} style={{ ...css.btn(copied?C.em:C.blue), padding:"8px 14px", fontSize:12 }}>
                            {copied ? "✓ Copié !" : "📋 Copier"}
                          </button>
                        </div>
                      </div>
                      {(recapResult.recrutement?.embauches?.length>0||recapResult.recrutement?.processus?.length>0||recapResult.recrutement?.ouvertures?.length>0) && (
                        <Card style={{ marginBottom:10 }}>
                          <SecHead icon="🎯" label="Recrutement" color={C.blue}/>
                          {recapResult.recrutement?.embauches?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.em} size={9}>EMBAUCHES CONFIRMÉES</Mono>
                            {recapResult.recrutement.embauches.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.em, fontSize:12, flexShrink:0 }}>✓</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.processus?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.blue} size={9}>PROCESSUS EN COURS</Mono>
                            {recapResult.recrutement.processus.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.blue, fontSize:12, flexShrink:0 }}>→</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.ouvertures?.length>0 && <div>
                            <Mono color={C.textD} size={9}>OUVERTURES DE POSTE</Mono>
                            {recapResult.recrutement.ouvertures.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.textD, fontSize:12, flexShrink:0 }}>+</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                        </Card>
                      )}
                      {[
                        {key:"promotions", icon:"⬆", label:"Promotions",                        color:C.purple},
                        {key:"fins_emploi",icon:"🚪", label:"Fins d'emploi",                    color:C.textM},
                        {key:"performance",icon:"⚖",  label:"Performance / Plaintes / Enquêtes",color:C.red},
                        {key:"projets_rh", icon:"🔧", label:"Processus et Projets RH",          color:C.teal},
                        {key:"divers",     icon:"📎", label:"Divers",                           color:C.textD},
                      ].map(({key,icon,label,color}) => recapResult[key]?.length>0 && (
                        <Card key={key} style={{ marginBottom:10, borderLeft:`3px solid ${color}` }}>
                          <SecHead icon={icon} label={label} color={color}/>
                          {recapResult[key].map((i,idx) => (
                            <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                              <span style={{ color, fontSize:12, flexShrink:0 }}>•</span>
                              <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                            </div>
                          ))}
                        </Card>
                      ))}
                    </div>
                  )}
                  </div>
                )}

                {/* ── SENT RECAP sub-tab */}
                {recapSubTab === "sent" && (
                  <div>
                    <div style={{ background:C.em+"10", border:`1px solid ${C.em}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      📤 Colle ici le récap final que tu as envoyé à ta directrice. Il sera archivé avec la date et consultable les semaines suivantes.
                    </div>
                    <Mono color={C.textD} size={9}>RÉCAP FINAL ENVOYÉ</Mono>
                    <textarea rows={14} value={sentRecapText}
                      onChange={e => { setSentRecapText(e.target.value); setSentRecapSaved(false); }}
                      placeholder={"Colle ton récap final ici — tel qu'envoyé à ta directrice..."}
                      style={{ ...css.textarea, marginTop:6, fontFamily:"monospace", fontSize:12, lineHeight:1.7 }}
                      onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <div style={{ display:"flex", gap:10, marginTop:10 }}>
                      <div style={{ fontSize:11, color:C.textD, flex:1, alignSelf:"center" }}>
                        {inputs.weekOf || new Date().toLocaleDateString("fr-CA")}
                      </div>
                      <button onClick={saveSentRecap} disabled={!sentRecapText.trim() || sentRecapSaved}
                        style={{ ...css.btn(sentRecapSaved ? C.textD : C.em), padding:"9px 20px", fontSize:13 }}>
                        {sentRecapSaved ? "✓ Archivé" : "💾 Archiver ce récap"}
                      </button>
                    </div>
                    {sentRecapSaved && (
                      <div style={{ marginTop:12, padding:"10px 14px", background:C.em+"12", border:`1px solid ${C.em}30`,
                        borderRadius:7, fontSize:12, color:C.em }}>
                        ✓ Récap archivé — consultable dans Historique la semaine prochaine.
                      </div>
                    )}
                  </div>
                )}

                {/* ── HISTORY sub-tab */}
                {recapSubTab === "history" && (
                  <div>
                    {sentRecaps.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
                        Aucun récap archivé. Archive ton premier récap dans l'onglet Récap envoyé.
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {[...sentRecaps].reverse().map((r, i) => (
                          <Card key={r.id||i}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                              <div>
                                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{r.weekLabel}</div>
                                <Mono color={C.textD} size={9}>Archivé le {r.savedAt}</Mono>
                              </div>
                              <button onClick={() => {
                                setSentRecapText(r.sentText);
                                setRecapSubTab("sent");
                              }} style={{ ...css.btn(C.textM, true), padding:"5px 10px", fontSize:11 }}>
                                Consulter
                              </button>
                            </div>
                            <div style={{ fontSize:12, color:C.textM, background:C.surfLL, borderRadius:7,
                              padding:"10px 12px", whiteSpace:"pre-wrap", lineHeight:1.7,
                              maxHeight:200, overflowY:"auto", fontFamily:"monospace" }}>
                              {r.sentText}
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── NEXT WEEK LOCK TAB */}
          {briefTab === "nwl" && (() => {
            const sentList = [...(data.sentRecaps||[])].reverse();
            const recap = sentList[nwlSourceIdx];
            return (
              <div>
                {sentList.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"50px 20px" }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
                    <div style={{ fontSize:13, color:C.textM, marginBottom:6 }}>Aucun récap archivé</div>
                    <div style={{ fontSize:12, color:C.textD, maxWidth:340, margin:"0 auto" }}>
                      Archive un récap dans Récap directrice → Récap envoyé. Ce module le transforme en plan d'exécution pour la semaine suivante.
                    </div>
                    <button onClick={() => { setBriefTab("recap"); setRecapSubTab("sent"); }}
                      style={{ ...css.btn(C.purple, true), marginTop:16, padding:"8px 18px", fontSize:12 }}>
                      → Archiver un récap
                    </button>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {/* Source selector */}
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      <Mono color={C.textD} size={8}>SOURCE</Mono>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {sentList.slice(0,5).map((r,i) => (
                          <button key={r.id||i} onClick={() => { setNwlSourceIdx(i); setNwlResult(null); setNwlSaved(false); }}
                            style={{ padding:"4px 11px", borderRadius:5, fontSize:11, cursor:"pointer",
                              fontFamily:"'DM Sans',sans-serif", border:"none",
                              background: nwlSourceIdx===i ? C.purple+"22" : C.surfLL,
                              color: nwlSourceIdx===i ? C.purple : C.textD,
                              fontWeight: nwlSourceIdx===i ? 700 : 400,
                              outline: nwlSourceIdx===i ? `1px solid ${C.purple}55` : "none" }}>
                            {r.weekLabel || fmtDate(r.savedAt)}
                          </button>
                        ))}
                      </div>
                      {!nwlLoading ? (
                        <button onClick={generateNWL}
                          style={{ ...css.btn(C.purple), padding:"7px 18px", fontSize:12, marginLeft:"auto",
                            boxShadow:`0 4px 16px ${C.purple}30` }}>
                          ⚡ {nwlResult ? "Régénérer" : "Générer la semaine suivante"}
                        </button>
                      ) : <AILoader label="Analyse du récap…"/>}
                    </div>

                    {nwlError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`,
                      borderRadius:7, padding:"9px 14px", fontSize:12, color:C.red }}>⚠ {nwlError}</div>}

                    {!nwlResult && !nwlLoading && (
                      <div style={{ textAlign:"center", padding:"32px 20px",
                        background:C.surfL, borderRadius:10, border:`1px solid ${C.border}` }}>
                        <div style={{ fontSize:13, color:C.textM, marginBottom:4 }}>
                          Récap sélectionné: <span style={{ color:C.purple, fontWeight:700 }}>{recap?.weekLabel}</span>
                        </div>
                        <div style={{ fontSize:11, color:C.textD }}>Clique sur Générer pour transformer ce récap en plan d'exécution pour la semaine prochaine.</div>
                      </div>
                    )}

                    {nwlResult && (() => {
                      const r = nwlResult;
                      return (
                        <div style={{ border:`1.5px solid ${C.purple}40`, borderRadius:12, overflow:"hidden" }}>
                          {/* Theme */}
                          <div style={{ padding:"18px 20px",
                            background:`linear-gradient(135deg,${C.purple}15,${C.blue}08)`,
                            borderBottom:`1px solid ${C.purple}25` }}>
                            <Mono color={C.purple} size={8} style={{ display:"block", marginBottom:8 }}>THÈME DE LA SEMAINE</Mono>
                            <div style={{ fontSize:22, fontWeight:800, color:C.text, lineHeight:1.2, marginBottom:8 }}>{r.theme}</div>
                            <div style={{ fontSize:13, color:C.textM, lineHeight:1.65 }}>{r.why}</div>
                          </div>
                          {/* Priorities */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                            <Mono color={C.em} size={8} style={{ display:"block", marginBottom:10 }}>TOP 2 PRIORITÉS</Mono>
                            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                              {(r.priorities||[]).map((p,i) => (
                                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                                  <div style={{ width:22, height:22, background:C.em, borderRadius:"50%",
                                    flexShrink:0, display:"flex", alignItems:"center",
                                    justifyContent:"center", fontSize:11, fontWeight:800, color:C.bg }}>{i+1}</div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:3 }}>{p.priority}</div>
                                    <div style={{ fontSize:11, color:C.amber }}>⏱ {p.whyNow}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Manager focus */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                            <Mono color={C.blue} size={8} style={{ display:"block", marginBottom:8 }}>MANAGER FOCUS</Mono>
                            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                              {(r.managerFocus||[]).map((m,i) => (
                                <div key={i} style={{ display:"flex", gap:8, alignItems:"baseline", flexWrap:"wrap" }}>
                                  <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{m.name}</span>
                                  <span style={{ fontSize:12, color:C.textM }}>→ {m.reason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Structural action */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`, background:C.em+"06" }}>
                            <Mono color={C.em} size={8} style={{ display:"block", marginBottom:8 }}>ACTION STRUCTURANTE</Mono>
                            <div style={{ fontSize:13, color:C.text, fontWeight:600, marginBottom:4 }}>{r.structuralAction?.action}</div>
                            <div style={{ fontSize:12, color:C.em }}>Impact: {r.structuralAction?.impact}</div>
                          </div>
                          {/* Leadership message */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                            <Mono color={C.textD} size={8} style={{ display:"block", marginBottom:8 }}>MESSAGE LEADERSHIP</Mono>
                            <div style={{ fontSize:13, color:C.text, lineHeight:1.75, fontStyle:"italic",
                              padding:"10px 14px", background:C.surfLL, borderRadius:8,
                              borderLeft:`3px solid ${C.purple}` }}>
                              {r.leadershipMessage}
                            </div>
                          </div>
                          {/* Actions bar */}
                          <div style={{ padding:"10px 20px", background:C.surfL,
                            display:"flex", gap:8, justifyContent:"flex-end", alignItems:"center" }}>
                            <span style={{ fontSize:11, color:C.textD, flex:1 }}>
                              Basé sur: <span style={{ color:C.purple }}>{recap?.weekLabel}</span>
                            </span>
                            <button onClick={copyNWL}
                              style={{ ...css.btn(nwlCopied?C.em:C.textM, true), padding:"6px 14px", fontSize:11 }}>
                              {nwlCopied ? "✓ Copié" : "📋 Copier"}
                            </button>
                            <button onClick={saveNWL} disabled={nwlSaved}
                              style={{ ...css.btn(nwlSaved?C.textD:C.purple), padding:"6px 14px", fontSize:11,
                                opacity:nwlSaved?0.5:1 }}>
                              {nwlSaved ? "✓ Archivé" : "💾 Archiver"}
                            </button>
                            <button onClick={() => { setNwlResult(null); setNwlSaved(false); generateNWL(); }}
                              style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>↺</button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}

      {/* RESULT VIEW — Brief generated */}}
      {result && view==="new" && (
        <div>
          {/* Tab switcher */}
          <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14 }}>
            {BRIEF_RESULT_TABS.map(t => (
              <button key={t.id} onClick={() => setBriefTab(t.id)}
                style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 16px",
                  fontSize:12, fontWeight:briefTab===t.id?700:400,
                  color:briefTab===t.id?C.em:C.textM,
                  borderBottom:`2px solid ${briefTab===t.id?C.em:"transparent"}`,
                  marginBottom:-1, fontFamily:"'DM Sans',sans-serif" }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── INTELLIGENCE BRIEF TAB */}
          {briefTab === "brief" && (
            <div>
              <div style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:10,
                padding:"16px 20px", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:C.text }}>{result.weekOf}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <RiskBadge level={result.riskLevel}/>
                    {result.orgPulse?.overall && <Badge label={result.orgPulse.overall} color={C.blue}/>}
                    <button onClick={saveBrief} disabled={saved}
                      style={{ ...css.btn(saved?C.textD:C.em), padding:"6px 14px", fontSize:11 }}>
                      {saved?"✓ Archivé":"💾 Archiver"}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.7, fontStyle:"italic" }}>{result.executiveSummary}</div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Card>
                  <SecHead icon="🎯" label="Top priorités" color={C.red}/>
                  {result.topPriorities?.map((p,i) => <div key={i} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", gap:8, marginBottom:4 }}>
                      <Badge label={p.urgency} color={DELAY_C[p.urgency]||C.blue} size={10}/>
                    </div>
                    <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{p.priority}</div>
                    <div style={{ fontSize:11, color:C.textM, marginTop:3 }}>{p.why}</div>
                  </div>)}
                </Card>
                <Card>
                  <SecHead icon="⚠" label="Risques clés" color={C.amber}/>
                  {result.keyRisks?.map((r,i) => <div key={i} style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", gap:8, marginBottom:4 }}><RiskBadge level={r.level}/></div>
                    <div style={{ fontSize:13, color:C.text }}>{r.risk}</div>
                  </div>)}
                </Card>
                <Card>
                  <SecHead icon="👁" label="Leadership Watch" color={C.purple}/>
                  {result.leadershipWatch?.map((l,i) => <div key={i} style={{ marginBottom:10, borderBottom:`1px solid ${C.border}`, paddingBottom:8 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:C.text, marginBottom:3 }}>{l.person}</div>
                    <div style={{ fontSize:12, color:C.textM, marginBottom:3 }}>{l.signal}</div>
                    <div style={{ fontSize:11, color:C.em }}>→ {l.action}</div>
                  </div>)}
                </Card>
                <Card>
                  <SecHead icon="✈" label="Retention Watch" color={C.red}/>
                  {result.retentionWatch?.map((r,i) => <div key={i} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", gap:6, marginBottom:4 }}>
                      <RiskBadge level={r.risk}/><Badge label={r.window} color={C.purple} size={10}/>
                    </div>
                    <div style={{ fontSize:12, color:C.text }}>{r.profile}</div>
                    <div style={{ fontSize:11, color:C.em, marginTop:3 }}>Levier: {r.lever}</div>
                  </div>)}
                </Card>
              </div>

              <Card style={{ marginTop:12 }}>
                <SecHead icon="📅" label="Actions de la semaine" color={C.em}/>
                {result.weeklyActions?.map((a,i) => <div key={i} style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <Badge label={a.deadline} color={C.amber} size={10}/>
                  <div>
                    <div style={{ fontSize:13, color:C.text }}>{a.action}</div>
                    <Mono color={C.textD} size={9}>OWNER: {a.owner}</Mono>
                  </div>
                </div>)}
              </Card>

              {result.lookAhead && <Card style={{ marginTop:10 }}>
                <SecHead icon="🔭" label="Semaine prochaine" color={C.teal}/>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{result.lookAhead}</div>
              </Card>}

              <div style={{ textAlign:"center", marginTop:16 }}>
                <button onClick={() => { setResult(null); setInputs({meetings:"",signals:"",cases:"",kpi:"",other:"",weekOf:""}); setSaved(false); setBriefTab("brief"); }}
                  style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7,
                    padding:"8px 20px", fontSize:12, color:C.textD, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  ↺ Nouveau brief
                </button>
              </div>
            </div>
          )}

          {/* ── RECAP DIRECTRICE TAB (in result view) */}
          {briefTab === "recap" && (() => {
            const sentRecaps = data.sentRecaps || [];
            const lastSent = sentRecaps.length > 0 ? sentRecaps[sentRecaps.length - 1] : null;
            const subTabs = [
              { id:"generate", label:"⚡ Générer" },
              { id:"sent",     label:"📤 Récap envoyé" },
              { id:"history",  label:`📚 Historique${sentRecaps.length > 0 ? ` (${sentRecaps.length})` : ""}` },
            ];
            return (
              <div>
                {/* Sub-tabs */}
                <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14 }}>
                  {subTabs.map(t => (
                    <button key={t.id} onClick={() => setRecapSubTab(t.id)}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:"7px 14px",
                        fontSize:11, fontWeight:recapSubTab===t.id?700:400,
                        color:recapSubTab===t.id?C.blue:C.textM,
                        borderBottom:`2px solid ${recapSubTab===t.id?C.blue:"transparent"}`,
                        marginBottom:-1, fontFamily:"'DM Sans',sans-serif" }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* ── GENERATE sub-tab */}
                {recapSubTab === "generate" && (
                  <div>
                    <div style={{ background:C.blue+"10", border:`1px solid ${C.blue}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      📅 Généré automatiquement depuis tous tes meetings, signaux, dossiers et preps 1:1 de la période sélectionnée.
                    </div>
                    {recapError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
                      padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {recapError}</div>}
                    {recapLoading ? <AILoader label="Génération du récap depuis l'historique"/> : (
                      !recapResult && <button onClick={generateRecap} style={{ ...css.btn(C.blue), width:"100%", padding:"13px", fontSize:14,
                        boxShadow:`0 4px 20px ${C.blue}30` }}>
                        📋 Générer le récap directrice
                      </button>
                    )}
                  {recapResult && (
                    <div style={{ marginTop:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>📋 {recapResult.weekLabel}</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={() => setRecapResult(null)} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>↺ Regénérer</button>
                          <button onClick={copyRecap} style={{ ...css.btn(copied?C.em:C.blue), padding:"8px 14px", fontSize:12 }}>
                            {copied ? "✓ Copié !" : "📋 Copier"}
                          </button>
                        </div>
                      </div>
                      {(recapResult.recrutement?.embauches?.length>0||recapResult.recrutement?.processus?.length>0||recapResult.recrutement?.ouvertures?.length>0) && (
                        <Card style={{ marginBottom:10 }}>
                          <SecHead icon="🎯" label="Recrutement" color={C.blue}/>
                          {recapResult.recrutement?.embauches?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.em} size={9}>EMBAUCHES CONFIRMÉES</Mono>
                            {recapResult.recrutement.embauches.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.em, fontSize:12, flexShrink:0 }}>✓</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.processus?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.blue} size={9}>PROCESSUS EN COURS</Mono>
                            {recapResult.recrutement.processus.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.blue, fontSize:12, flexShrink:0 }}>→</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.ouvertures?.length>0 && <div>
                            <Mono color={C.textD} size={9}>OUVERTURES DE POSTE</Mono>
                            {recapResult.recrutement.ouvertures.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.textD, fontSize:12, flexShrink:0 }}>+</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                        </Card>
                      )}
                      {[
                        {key:"promotions", icon:"⬆", label:"Promotions",                        color:C.purple},
                        {key:"fins_emploi",icon:"🚪", label:"Fins d'emploi",                    color:C.textM},
                        {key:"performance",icon:"⚖",  label:"Performance / Plaintes / Enquêtes",color:C.red},
                        {key:"projets_rh", icon:"🔧", label:"Processus et Projets RH",          color:C.teal},
                        {key:"divers",     icon:"📎", label:"Divers",                           color:C.textD},
                      ].map(({key,icon,label,color}) => recapResult[key]?.length>0 && (
                        <Card key={key} style={{ marginBottom:10, borderLeft:`3px solid ${color}` }}>
                          <SecHead icon={icon} label={label} color={color}/>
                          {recapResult[key].map((i,idx) => (
                            <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                              <span style={{ color, fontSize:12, flexShrink:0 }}>•</span>
                              <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                            </div>
                          ))}
                        </Card>
                      ))}
                    </div>
                  )}
                  </div>
                )}

                {/* ── SENT RECAP sub-tab */}
                {recapSubTab === "sent" && (
                  <div>
                    <div style={{ background:C.em+"10", border:`1px solid ${C.em}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      📤 Colle ici le récap final que tu as envoyé à ta directrice. Il sera archivé avec la date et consultable les semaines suivantes.
                    </div>
                    <Mono color={C.textD} size={9}>RÉCAP FINAL ENVOYÉ</Mono>
                    <textarea rows={14} value={sentRecapText}
                      onChange={e => { setSentRecapText(e.target.value); setSentRecapSaved(false); }}
                      placeholder={"Colle ton récap final ici — tel qu'envoyé à ta directrice..."}
                      style={{ ...css.textarea, marginTop:6, fontFamily:"monospace", fontSize:12, lineHeight:1.7 }}
                      onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <div style={{ display:"flex", gap:10, marginTop:10 }}>
                      <div style={{ fontSize:11, color:C.textD, flex:1, alignSelf:"center" }}>
                        {inputs.weekOf || new Date().toLocaleDateString("fr-CA")}
                      </div>
                      <button onClick={saveSentRecap} disabled={!sentRecapText.trim() || sentRecapSaved}
                        style={{ ...css.btn(sentRecapSaved ? C.textD : C.em), padding:"9px 20px", fontSize:13 }}>
                        {sentRecapSaved ? "✓ Archivé" : "💾 Archiver ce récap"}
                      </button>
                    </div>
                    {sentRecapSaved && (
                      <div style={{ marginTop:12, padding:"10px 14px", background:C.em+"12", border:`1px solid ${C.em}30`,
                        borderRadius:7, fontSize:12, color:C.em }}>
                        ✓ Récap archivé — consultable dans Historique la semaine prochaine.
                      </div>
                    )}
                  </div>
                )}

                {/* ── HISTORY sub-tab */}
                {recapSubTab === "history" && (
                  <div>
                    {sentRecaps.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
                        Aucun récap archivé. Archive ton premier récap dans l'onglet Récap envoyé.
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {[...sentRecaps].reverse().map((r, i) => (
                          <Card key={r.id||i}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                              <div>
                                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{r.weekLabel}</div>
                                <Mono color={C.textD} size={9}>Archivé le {r.savedAt}</Mono>
                              </div>
                              <button onClick={() => {
                                setSentRecapText(r.sentText);
                                setRecapSubTab("sent");
                              }} style={{ ...css.btn(C.textM, true), padding:"5px 10px", fontSize:11 }}>
                                Consulter
                              </button>
                            </div>
                            <div style={{ fontSize:12, color:C.textM, background:C.surfLL, borderRadius:7,
                              padding:"10px 12px", whiteSpace:"pre-wrap", lineHeight:1.7,
                              maxHeight:200, overflowY:"auto", fontFamily:"monospace" }}>
                              {r.sentText}
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}






// ══════════════════════════════════════════════════════════════════════════════
// MODULE: ENQUÊTES & INVESTIGATIONS (Standards Rubin Thomlinson)
// ══════════════════════════════════════════════════════════════════════════════
// ── Investigation: Part 1 — Résumé, Plan, Guide entrevue
const INV_SP_1 = `Tu es un expert en enquetes en milieu de travail au Canada et au Quebec, forme selon les standards Rubin Thomlinson. Tu travailles avec Samuel Chartrand, HRBP senior.
Reponds UNIQUEMENT en JSON valide. Aucun backtick. Aucune apostrophe dans les valeurs JSON. Max 3 items par tableau sauf interviewGuide.
{"caseId":"ENQ-[ANNEE]-[3 lettres]","caseTitle":"Titre neutre 6-10 mots sans noms","caseType":"Harcelement psychologique|Harcelement sexuel|Violence au travail|Discrimination|Conflit interpersonnel|Inconduite professionnelle|Autre","urgencyLevel":"Critique|Elevee|Moderee|Planifiee","legalFramework":["ref legale 1","ref legale 2"],"caseSummary":{"situation":"Resume factuel neutre 3-4 phrases","triggerEvent":"evenement declencheur","reportedDate":"date ou periode","parties":[{"role":"Plaignant|Mise en cause|Temoin|Gestionnaire","description":"titre, dept, relation — sans noms"}],"policyImplicated":["politique visee"],"thresholdAnalysis":"analyse du seuil — violation ou non — 2 phrases"},"investigationPlan":{"mandate":"mandat precis","investigatorType":"Interne|Externe","investigatorRationale":"justification","interimMeasures":[{"measure":"mesure","rationale":"pourquoi","neutralityNote":"neutralite apparente"}],"objectives":["objectif"],"interviewOrder":[{"order":1,"party":"role","rationale":"pourquoi a ce moment"}],"documentsToReview":[{"document":"document","purpose":"ce quon espere etablir"}],"timeline":"delai estime","confidentialityProtocol":"qui sait quoi"},"interviewGuide":{"preambleScript":"Texte du preambule a lire — role enqueteur, mandat, confidentialite, represailles, droit a soutien","complainant":{"openingQuestion":"question ouverte","drillDownQuestions":["drill 1","drill 2","drill 3","drill 4","drill 5"],"closingQuestion":"question finale","keyObjectives":["objectif"]},"respondent":{"disclosureNote":"comment divulguer les allegations","openingQuestion":"question ouverte","allegationResponses":["formulation allegation 1","formulation allegation 2"],"mitigatingFactors":["facteur attenuant 1"],"closingQuestion":"question finale","keyObjectives":["objectif"]},"witnesses":{"approachNote":"comment contacter sans divulguer","openingQuestion":"question standard","bullseyeApproach":"application bull-eye a ce dossier","eliminationQuestions":["elim 1","elim 2","elim 3"],"memoryTriggerQuestions":["declencheur 1","declencheur 2"],"closingQuestion":"question finale","keyObjectives":["objectif"]}}}`;

// ── Investigation: Part 2 — Preuve, Conclusions, Mesures, Rapport
const INV_SP_2 = `Tu es un expert en enquetes en milieu de travail au Canada et au Quebec, forme selon les standards Rubin Thomlinson.
Reponds UNIQUEMENT en JSON valide. Aucun backtick. Aucune apostrophe dans les valeurs JSON. Max 3 items par tableau.
{"evidenceAnalysis":{"establishedFacts":[{"fact":"fait etabli","source":"source","weight":"Fort|Modere|Faible"}],"contestedElements":[{"element":"element conteste","complainantVersion":"version plaignant","respondentVersion":"version probable mis en cause","resolution":"comment resoudre"}],"credibilityFactors":[{"party":"role","factorsFor":["renforce credibilite"],"factorsAgainst":["fragilise credibilite"],"overallAssessment":"evaluation neutre"}],"evidenceGaps":["information manquante"],"hearsayFlags":["oui-dire a verifier"],"standardOfProof":"preponderance des probabilites — application au dossier"},"findings":{"allegationByAllegation":[{"allegation":"allegation precise","finding":"Fondee|Partiellement fondee|Non fondee|Preuve insuffisante","basis":"base factuelle","policyAnalysis":"politique ou loi visee si fondee"}],"overallFinding":"Fondee|Partiellement fondee|Non fondee|Preuve insuffisante","overallRationale":"synthese 3-4 phrases","brownvDunnCompliance":"confirmation elements contradictoires soumis aux parties"},"recommendedActions":{"forRespondent":[{"action":"action recommandee","type":"Disciplinaire|Coaching|Formation|Reorganisation|Aucune","rationale":"justification — proportionnalite","timeline":"delai"}],"forOrganization":[{"action":"mesure org","type":"Politique|Formation|Structure|Suivi","rationale":"pourquoi necessaire","owner":"responsable"}],"forComplainant":[{"action":"soutien ou mesure","rationale":"justification"}],"followUp":"plan de suivi","reprisalProtection":"mesures protection represailles"},"reportStructure":{"sections":[{"section":"nom section","content":"contenu specifique","tips":"conseil redaction"}],"privilegeConsiderations":"considerations privilege legal","distributionList":"a qui remettre","retentionNote":"delai conservation"}}`;

// Keep INV_SYSTEM as alias for backward compat with any saved references
const INV_SYSTEM = INV_SP_1;

const INV_TABS = [
  {id:"summary",  num:"01", label:"Résumé"},
  {id:"plan",     num:"02", label:"Plan d'enquête"},
  {id:"guide",    num:"03", label:"Guide entrevue"},
  {id:"evidence", num:"04", label:"Preuve"},
  {id:"findings", num:"05", label:"Conclusions"},
  {id:"actions",  num:"06", label:"Mesures"},
  {id:"report",   num:"07", label:"Rapport"},
];

const INV_FINDING = {
  "Fondée":               { color:"#7a1e2e", icon:"●" },
  "Partiellement fondée": { color:C.amber,   icon:"◑" },
  "Non fondée":           { color:C.em,      icon:"○" },
  "Preuve insuffisante":  { color:C.textM,   icon:"◌" },
};

// Reuse OS card/badge but use bordeaux accent for this module
const INV_RED = "#7a1e2e";

function InvTag({ label, color=INV_RED }) {
  return <span style={{ background:color+"15", border:`1px solid ${color}30`, color, borderRadius:4,
    padding:"2px 8px", fontSize:9, fontWeight:600, fontFamily:"'DM Mono',monospace",
    letterSpacing:1, textTransform:"uppercase", whiteSpace:"nowrap" }}>{label}</span>;
}

function InvSection({ num, title }) {
  return <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18,
    paddingBottom:12, borderBottom:`2px solid ${INV_RED}` }}>
    <div style={{ background:INV_RED, color:"#fff", width:26, height:26, display:"flex",
      alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace",
      fontSize:10, fontWeight:500, flexShrink:0, borderRadius:3 }}>{num}</div>
    <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{title}</span>
  </div>;
}

function ModuleInvestigation({ data, onSave }) {
  const [view, setView] = useState("list"); // list | input | loading | case
  const [complaint, setComplaint] = useState("");
  const [context, setContext] = useState("");
  const [parties, setParties] = useState("");
  const [policy, setPolicy] = useState("");
  const [evidence, setEvidence] = useState("");
  const [invProvince, setInvProvince] = useState("QC");
  const [invPrompt, setInvPrompt] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  const [caseData, setCaseData] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [gtab, setGtab] = useState("complainant");

  const investigations = data.investigations || [];

  const generate = async () => {
    if (!complaint.trim()) return;
    setError("");
    const _invProvince = invProvince || data.profile?.defaultProvince || "QC";
    const _invLegal = buildLegalPromptContext(_invProvince);
    const userMsg = [
      "Génère un dossier d'enquête complet pour la situation suivante.",
      `
${_invLegal}`,
      `
PLAINTE / SIGNALEMENT:
${complaint}`,
      context  ? `
CONTEXTE ORGANISATIONNEL:
${context}` : "",
      parties  ? `
PARTIES IMPLIQUÉES (rôles génériques):
${parties}` : "",
      policy   ? `
POLITIQUES ET LOIS APPLICABLES:
${policy}` : "",
      evidence ? `
PREUVES INITIALES DISPONIBLES:
${evidence}` : "",
    ].join("");
    setView("loading"); setError("");
    try {
      const part1 = await callAIJson(INV_SP_1, userMsg, 8000);
      const part2 = await callAIJson(INV_SP_2, userMsg, 8000);
      setCaseData({...part1,...part2}); setActiveTab("summary"); setSaved(false); setView("case");
    } catch(e) { setError("Erreur: "+e.message); setView("input"); }
  };

  const saveDossier = () => {
    if (!caseData || saved) return;
    const inv = { id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0],
      caseId:caseData.caseId, caseTitle:caseData.caseTitle, caseType:caseData.caseType,
      urgencyLevel:caseData.urgencyLevel, province:invProvince, caseData };
    onSave("investigations", [...investigations, inv]);
    setSaved(true);
  };

  // ── SECTION RENDERERS ──────────────────────────────────────────────────────
  function renderSummary() {
    const s = caseData.caseSummary;
    return <div>
      <InvSection num="01" title="Résumé du dossier"/>
      <div style={{ background:INV_RED+"18", border:`1px solid ${INV_RED}30`,
        borderLeft:`4px solid ${INV_RED}`, padding:"14px 18px", borderRadius:8, marginBottom:12 }}>
        <Mono color={INV_RED} size={9}>{caseData.caseId}</Mono>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, margin:"6px 0 10px" }}>{caseData.caseTitle}</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}><InvTag label={caseData.caseType}/><InvTag label={`Urgence: ${caseData.urgencyLevel}`} color={RISK[caseData.urgencyLevel]?.color||C.amber}/></div>
      </div>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Cadre légal</Mono><div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>{caseData.legalFramework?.map((l,i)=><InvTag key={i} label={l} color={C.blue}/>)}</div></Card>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${INV_RED}` }}><Mono color={C.textD} size={9}>Situation — Résumé factuel et neutre</Mono><div style={{ fontSize:13, color:C.text, lineHeight:1.8, marginTop:8, fontStyle:"italic" }}>{s?.situation}</div></Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <Card><Mono color={C.textD} size={9}>Événement déclencheur</Mono><div style={{ fontSize:12, color:C.textM, marginTop:6, lineHeight:1.7 }}>{s?.triggerEvent}</div></Card>
        <Card><Mono color={C.textD} size={9}>Date / Période du signalement</Mono><div style={{ fontSize:12, color:C.textM, marginTop:6, lineHeight:1.7 }}>{s?.reportedDate}</div></Card>
      </div>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Parties impliquées</Mono>
        {s?.parties?.map((p,i)=><div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", marginTop:10, paddingBottom:8, borderBottom:i<s.parties.length-1?`1px solid ${C.border}`:"none" }}><InvTag label={p.role}/><span style={{ fontSize:12, color:C.textM, lineHeight:1.6, flex:1 }}>{p.description}</span></div>)}
      </Card>
      <Card style={{ borderLeft:`3px solid ${C.textM}` }}><Mono color={C.textD} size={9}>Analyse de la question seuil</Mono><div style={{ fontSize:12, color:C.textM, marginTop:6, lineHeight:1.7 }}>{s?.thresholdAnalysis}</div></Card>
    </div>;
  }

  function renderPlan() {
    const p = caseData.investigationPlan;
    return <div>
      <InvSection num="02" title="Plan d'enquête"/>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${INV_RED}` }}><Mono color={C.textD} size={9}>Mandat de l'enquêteur</Mono><div style={{ fontSize:13, color:C.text, lineHeight:1.75, marginTop:6 }}>{p?.mandate}</div></Card>
      <Card style={{ marginBottom:10 }}>
        <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:8 }}><Mono color={C.textD} size={9}>Type d'enquêteur</Mono><InvTag label={p?.investigatorType} color={p?.investigatorType==="Externe"?INV_RED:C.em}/></div>
        <div style={{ fontSize:12, color:C.textM, lineHeight:1.7 }}>{p?.investigatorRationale}</div>
      </Card>
      {p?.interimMeasures?.length>0&&<Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Mesures intérimaires</Mono>
        {p.interimMeasures.map((m,i)=><div key={i} style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7, padding:"10px 13px", marginTop:10 }}>
          <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:5 }}>{m.measure}</div>
          <div style={{ fontSize:11.5, color:C.textM, marginBottom:5, lineHeight:1.6 }}>↳ {m.rationale}</div>
          <div style={{ fontSize:11, color:C.textM, fontStyle:"italic" }}>⚖ {m.neutralityNote}</div>
        </div>)}
      </Card>}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <Card><Mono color={C.textD} size={9}>Objectifs de l'enquête</Mono>{p?.objectives?.map((o,i)=><div key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.textM, marginTop:6, lineHeight:1.6 }}><span style={{ color:INV_RED }}>→</span>{o}</div>)}</Card>
        <Card><Mono color={C.textD} size={9}>Ordre des entrevues</Mono>{p?.interviewOrder?.map((item,i)=><div key={i} style={{ display:"flex", gap:9, alignItems:"flex-start", marginTop:8 }}>
          <div style={{ background:INV_RED, color:"#fff", width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", fontSize:9, flexShrink:0, borderRadius:3 }}>{item.order}</div>
          <div><div style={{ fontSize:12, fontWeight:500, color:C.text }}>{item.party}</div><div style={{ fontSize:11, color:C.textM, lineHeight:1.5 }}>{item.rationale}</div></div>
        </div>)}</Card>
      </div>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Documents à examiner</Mono>{p?.documentsToReview?.map((d,i)=><div key={i} style={{ display:"flex", gap:12, marginTop:8, paddingBottom:8, borderBottom:i<p.documentsToReview.length-1?`1px solid ${C.border}`:"none" }}>
        <Mono color={C.textD} size={8}>{String(i+1).padStart(2,"0")}</Mono>
        <div><div style={{ fontSize:12, fontWeight:500, color:C.text }}>{d.document}</div><div style={{ fontSize:11, color:C.textM }}>{d.purpose}</div></div>
      </div>)}</Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Card><Mono color={C.textD} size={9}>Délai estimé</Mono><div style={{ fontSize:13, fontWeight:500, color:C.text, marginTop:6 }}>{p?.timeline}</div></Card>
        <Card style={{ borderLeft:`3px solid ${C.textM}` }}><Mono color={C.textD} size={9}>Protocole de confidentialité</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{p?.confidentialityProtocol}</div></Card>
      </div>
    </div>;
  }

  function renderGuide() {
    const g = caseData.interviewGuide;
    const gtabs = [{id:"complainant",label:"Plaignant(e)"},{id:"respondent",label:"Mise en cause"},{id:"witnesses",label:"Témoins"}];
    const InvQ = ({q,pfx,color}) => <div style={{ display:"flex", gap:10, alignItems:"flex-start", paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
      <Mono color={color||INV_RED} size={9}>{pfx}</Mono>
      <div style={{ flex:1, fontSize:13, color:C.text, lineHeight:1.65, fontStyle:"italic" }}>{q}</div>
    </div>;
    return <div>
      <InvSection num="03" title="Guide d'entrevue"/>
      <Card style={{ marginBottom:12, borderLeft:`3px solid ${C.amber}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <Mono color={C.textD} size={9}>Préambule standard — À lire en début de toute entrevue</Mono>
        </div>
        <div style={{ background:C.amber+"15", border:`1px solid ${C.amber}30`, borderRadius:7, padding:"10px 13px", fontSize:12, color:C.text, lineHeight:1.8, fontStyle:"italic" }}>{g?.preambleScript}</div>
      </Card>
      <div style={{ display:"flex", gap:0, marginBottom:14, borderBottom:`2px solid ${C.border}` }}>
        {gtabs.map(t=><button key={t.id} onClick={()=>setGtab(t.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:"9px 16px", fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:500, letterSpacing:1.5, color:gtab===t.id?INV_RED:C.textD, borderBottom:`2px solid ${gtab===t.id?INV_RED:"transparent"}`, marginBottom:-2, textTransform:"uppercase" }}>{t.label}</button>)}
      </div>
      {gtab==="complainant"&&<div>
        <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Question d'ouverture</Mono><div style={{ fontSize:13, color:C.text, fontStyle:"italic", lineHeight:1.7, marginTop:8 }}>"{g?.complainant?.openingQuestion}"</div></Card>
        <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Questions de drill-down</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{g?.complainant?.drillDownQuestions?.map((q,i)=><InvQ key={i} q={q} pfx={`Q${i+1}`}/>)}</div></Card>
        <Card><Mono color={C.textD} size={9}>Question finale de conclusion</Mono><div style={{ fontSize:13, color:C.text, fontStyle:"italic", marginTop:8 }}>"{g?.complainant?.closingQuestion}"</div></Card>
      </div>}
      {gtab==="respondent"&&<div>
        <Card style={{ marginBottom:10, background:C.amber+"0a", borderLeft:`3px solid ${C.amber}` }}><Mono color={C.textD} size={9}>Note sur la divulgation des allégations</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{g?.respondent?.disclosureNote}</div></Card>
        <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Question d'ouverture</Mono><div style={{ fontSize:13, color:C.text, fontStyle:"italic", lineHeight:1.7, marginTop:8 }}>"{g?.respondent?.openingQuestion}"</div></Card>
        <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Réponses aux allégations</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{g?.respondent?.allegationResponses?.map((q,i)=><InvQ key={i} q={q} pfx={`A${i+1}`} color={C.amber}/>)}</div></Card>
        <Card><Mono color={C.textD} size={9}>Facteurs atténuants</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{g?.respondent?.mitigatingFactors?.map((q,i)=><InvQ key={i} q={q} pfx={`M${i+1}`} color={C.textM}/>)}</div></Card>
      </div>}
      {gtab==="witnesses"&&<div>
        <Card style={{ marginBottom:10, borderLeft:`3px solid ${C.textM}` }}><Mono color={C.textD} size={9}>Approche — contacter sans divulguer le contexte</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{g?.witnesses?.approachNote}</div></Card>
        <Card style={{ marginBottom:10, background:C.blue+"08", borderLeft:`3px solid ${C.blue}` }}><Mono color={C.textD} size={9}>Technique Bull's-Eye — application au présent dossier</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{g?.witnesses?.bullseyeApproach}</div></Card>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Card><Mono color={C.textD} size={9}>Questions d'élimination</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{g?.witnesses?.eliminationQuestions?.map((q,i)=><InvQ key={i} q={q} pfx={`E${i+1}`} color={C.textM}/>)}</div></Card>
          <Card><Mono color={C.textD} size={9}>Déclencheurs de mémoire</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{g?.witnesses?.memoryTriggerQuestions?.map((q,i)=><InvQ key={i} q={q} pfx={`M${i+1}`} color={C.em}/>)}</div></Card>
        </div>
      </div>}
    </div>;
  }

  function renderEvidence() {
    const ev = caseData.evidenceAnalysis;
    const WC = {"Fort":C.red,"Modéré":C.amber,"Faible":C.textM};
    return <div>
      <InvSection num="04" title="Analyse de la preuve"/>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${INV_RED}` }}><Mono color={C.textD} size={9}>Norme de preuve applicable</Mono><div style={{ fontSize:13, color:C.text, lineHeight:1.75, marginTop:6 }}>{ev?.standardOfProof}</div></Card>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Faits établis ou non contestés</Mono>{ev?.establishedFacts?.map((f,i)=><div key={i} style={{ display:"flex", gap:10, marginTop:10, paddingBottom:8, borderBottom:i<ev.establishedFacts.length-1?`1px solid ${C.border}`:"none" }}>
        <div style={{ width:3, alignSelf:"stretch", background:WC[f.weight]||C.textM, flexShrink:0, borderRadius:1 }}/>
        <div style={{ flex:1 }}><div style={{ fontSize:13, color:C.text, lineHeight:1.6, marginBottom:3 }}>{f.fact}</div><Mono color={C.textD} size={8}>Source: {f.source} · Poids: {f.weight}</Mono></div>
      </div>)}</Card>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Éléments contestés</Mono>{ev?.contestedElements?.map((e,i)=><div key={i} style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7, padding:"11px 13px", marginTop:10 }}>
        <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:9 }}>{e.element}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
          <div><Mono color={INV_RED} size={8}>Version plaignant(e)</Mono><p style={{ fontSize:11, color:C.textM, lineHeight:1.6, marginTop:4 }}>{e.complainantVersion}</p></div>
          <div><Mono color={C.amber} size={8}>Version probable mise en cause</Mono><p style={{ fontSize:11, color:C.textM, lineHeight:1.6, marginTop:4 }}>{e.respondentVersion}</p></div>
        </div>
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:8, fontSize:11, color:C.textM, lineHeight:1.6 }}><span style={{ color:C.em }}>Résolution → </span>{e.resolution}</div>
      </div>)}</Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Card><Mono color={C.textD} size={9}>Lacunes dans la preuve</Mono>{ev?.evidenceGaps?.map((g,i)=><div key={i} style={{ fontSize:12, color:C.textM, display:"flex", gap:7, marginTop:6 }}><span style={{ color:C.amber }}>!</span>{g}</div>)}</Card>
        <Card><Mono color={C.textD} size={9}>Alertes ouï-dire</Mono>{ev?.hearsayFlags?.length>0?ev.hearsayFlags.map((h,i)=><div key={i} style={{ fontSize:12, color:C.textM, display:"flex", gap:7, marginTop:6 }}><span style={{ color:C.red }}>⚠</span>{h}</div>):<div style={{ fontSize:12, color:C.textD, fontStyle:"italic", marginTop:6 }}>Aucun ouï-dire identifié</div>}</Card>
      </div>
    </div>;
  }

  function renderFindings() {
    const f = caseData.findings;
    const overall = INV_FINDING[f?.overallFinding]||INV_FINDING["Preuve insuffisante"];
    return <div>
      <InvSection num="05" title="Conclusions"/>
      <div style={{ background:overall.color+"18", border:`2px solid ${overall.color}40`, borderRadius:10, padding:"18px 22px", marginBottom:14 }}>
        <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:10 }}>
          <span style={{ fontSize:24, color:overall.color }}>{overall.icon}</span>
          <div><Mono color={overall.color} size={8}>CONCLUSION GLOBALE</Mono><div style={{ fontSize:18, fontWeight:700, color:overall.color, marginTop:3 }}>Plainte {f?.overallFinding}</div></div>
        </div>
        <div style={{ fontSize:13, lineHeight:1.8, color:C.text }}>{f?.overallRationale}</div>
      </div>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Analyse par allégation</Mono>{f?.allegationByAllegation?.map((a,i)=>{
        const am = INV_FINDING[a.finding]||INV_FINDING["Preuve insuffisante"];
        return <div key={i} style={{ background:am.color+"10", border:`1px solid ${am.color}30`, borderRadius:7, padding:"12px 14px", borderLeft:`3px solid ${am.color}`, marginTop:10 }}>
          <div style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:8 }}>
            <span style={{ fontSize:16, color:am.color }}>{am.icon}</span>
            <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:5 }}>{a.allegation}</div><InvTag label={a.finding} color={am.color}/></div>
          </div>
          <div style={{ fontSize:11.5, color:C.textM, lineHeight:1.65, borderTop:`1px solid ${am.color}20`, paddingTop:8 }}><strong>Base: </strong>{a.basis}</div>
          {a.policyAnalysis&&<div style={{ fontSize:11.5, color:C.textM, marginTop:5 }}><strong>Politique: </strong>{a.policyAnalysis}</div>}
        </div>;
      })}</Card>
      <Card style={{ borderLeft:`3px solid ${C.textM}` }}><Mono color={C.textD} size={9}>Conformité — Règle de Browne v. Dunn</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{f?.brownvDunnCompliance}</div></Card>
    </div>;
  }

  function renderActions() {
    const r = caseData.recommendedActions;
    const TC = {"Disciplinaire":C.red,"Coaching":C.purple,"Formation":C.em,"Réorganisation":C.textM,"Politique":C.textM,"Structure":C.amber,"Suivi":C.em,"Aucune":C.textD};
    const ActionBlock = ({items, label}) => items?.length>0 ? <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>{label}</Mono>{items.map((item,i)=><div key={i} style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7, padding:"11px 13px", marginTop:10, borderLeft:`3px solid ${TC[item.type]||C.textM}` }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}><InvTag label={item.type} color={TC[item.type]||C.textM}/>{item.timeline&&<Mono color={C.textD} size={8}>{item.timeline}</Mono>}{item.owner&&<Mono color={C.textD} size={8}>Owner: {item.owner}</Mono>}</div>
      <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:4 }}>{item.action}</div>
      <div style={{ fontSize:11.5, color:C.textM, lineHeight:1.6 }}>{item.rationale}</div>
    </div>)}</Card> : null;
    return <div>
      <InvSection num="06" title="Mesures recommandées"/>
      <ActionBlock items={r?.forRespondent} label="Pour la personne mise en cause"/>
      <ActionBlock items={r?.forOrganization} label="Mesures organisationnelles"/>
      <ActionBlock items={r?.forComplainant} label="Soutien au/à la plaignant(e)"/>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Card style={{ borderLeft:`3px solid ${C.em}` }}><Mono color={C.textD} size={9}>Plan de suivi</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{r?.followUp}</div></Card>
        <Card style={{ borderLeft:`3px solid ${C.amber}` }}><Mono color={C.textD} size={9}>Protection contre les représailles</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{r?.reprisalProtection}</div></Card>
      </div>
    </div>;
  }

  function renderReport() {
    const rs = caseData.reportStructure;
    return <div>
      <InvSection num="07" title="Structure du rapport"/>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Sections du rapport</Mono>{rs?.sections?.map((s,i)=><div key={i} style={{ display:"flex", gap:0, borderBottom:i<rs.sections.length-1?`1px solid ${C.border}`:"none" }}>
        <div style={{ width:32, padding:"12px 0", display:"flex", justifyContent:"center", flexShrink:0 }}>
          <div style={{ background:INV_RED, color:"#fff", width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", fontSize:9, borderRadius:3 }}>{i+1}</div>
        </div>
        <div style={{ flex:1, padding:"12px 14px" }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>{s.section}</div>
          <div style={{ fontSize:12, color:C.textM, lineHeight:1.65, marginBottom:4 }}>{s.content}</div>
          <div style={{ fontSize:11, color:C.textM, fontStyle:"italic", lineHeight:1.5 }}><span style={{ color:C.em }}>Conseil → </span>{s.tips}</div>
        </div>
      </div>)}</Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Card style={{ borderLeft:`3px solid ${INV_RED}` }}><Mono color={C.textD} size={9}>Considérations de privilège légal</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{rs?.privilegeConsiderations}</div></Card>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card><Mono color={C.textD} size={9}>Liste de distribution</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{rs?.distributionList}</div></Card>
          <Card style={{ borderLeft:`3px solid ${C.amber}` }}><Mono color={C.textD} size={9}>Conservation du dossier</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{rs?.retentionNote}</div></Card>
        </div>
      </div>
    </div>;
  }

  const RENDERERS = { summary:renderSummary, plan:renderPlan, guide:renderGuide,
    evidence:renderEvidence, findings:renderFindings, actions:renderActions, report:renderReport };

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  if (view === "list") return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Enquêtes & Investigations</div>
          <div style={{ fontSize:12, color:C.textM }}>{investigations.length} dossier(s) archivé(s) · Standards Rubin Thomlinson</div>
        </div>
        <button onClick={()=>{ setComplaint(""); setContext(""); setParties(""); setPolicy(""); setEvidence(""); setCaseData(null); setView("input"); }} style={{ ...css.btn(INV_RED) }}>🔍 Ouvrir un dossier d'enquête</button>
      </div>
      {investigations.length === 0 && <Card style={{ textAlign:"center", padding:"40px 20px" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
        <div style={{ fontSize:14, color:C.textM }}>Aucun dossier d'enquête archivé</div>
        <div style={{ fontSize:12, color:C.textD, marginTop:4 }}>Clique sur "Ouvrir un dossier" pour démarrer une enquête structurée</div>
      </Card>}
      {investigations.length > 0 && <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {investigations.slice().reverse().map((inv,i) => {
          const fc = INV_FINDING[inv.caseData?.findings?.overallFinding];
          const uc = RISK[inv.urgencyLevel]||RISK["Modéré"];
          return <button key={i} onClick={()=>{ setCaseData(inv.caseData); setActiveTab("summary"); setSaved(true); setView("case"); }}
            style={{ background:C.surfL, border:`1px solid ${INV_RED}28`, borderLeft:`3px solid ${INV_RED}`,
              borderRadius:8, padding:"12px 14px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
              <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{inv.caseTitle}</span>
              <div style={{ display:"flex", gap:6 }}>
                {fc&&<InvTag label={inv.caseData?.findings?.overallFinding} color={fc.color}/>}
                <InvTag label={`Urgence: ${inv.urgencyLevel}`} color={uc.color}/>
              </div>
            </div>
            <div style={{ fontSize:11, color:C.textM, display:"flex", gap:6, alignItems:"center" }}>{inv.caseId} · {inv.caseType} · {inv.savedAt}<ProvinceBadge province={getProvince(inv, data.profile)}/></div>
          </button>;
        })}
      </div>}
    </div>
  );

  // ── INPUT VIEW ───────────────────────────────────────────────────────────────
  if (view === "input") return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={()=>setView("list")} style={{ ...css.btn(C.textM,true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ fontSize:18, fontWeight:700, color:C.text }}>Nouveau dossier d'enquête</div>
      </div>
      <Card style={{ marginBottom:14 }}>
        <SecHead icon="🔍" label="Plainte ou signalement reçu *" color={INV_RED}/>
        <textarea rows={5} value={complaint} onChange={e=>setComplaint(e.target.value)}
          placeholder="Décrire la plainte — nature des comportements allégués, période, contexte. Ne pas inclure de noms propres."
          style={{ ...css.textarea, marginTop:6 }}
          onFocus={e=>e.target.style.borderColor=INV_RED+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
      </Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
        {[["Contexte organisationnel",context,setContext,"Département, type de relation, ancienneté, historique..."],
          ["Parties impliquées (rôles génériques)",parties,setParties,"Ex: Gestionnaire senior, 15 ans / Employé subordonné, 2 ans. Éviter les noms."],
          ["Politiques ou lois applicables",policy,setPolicy,"LNT art. 81.18-81.20, Charte des droits, LSST..."],
          ["Preuves initiales disponibles",evidence,setEvidence,"Courriels, témoignages initiaux, documents, dates..."]
        ].map(([l,v,s,ph],i)=><Card key={i}>
          <Mono color={C.textD} size={9}>{l}</Mono>
          <textarea rows={4} value={v} onChange={e=>s(e.target.value)} placeholder={ph}
            style={{ ...css.textarea, marginTop:6 }}
            onFocus={e=>e.target.style.borderColor=INV_RED+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        </Card>)}
      </div>
      {error&&<div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7, padding:"8px 12px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {error}</div>}
      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
        <div style={{ flex:"0 0 auto" }}>
          <Mono color={C.textD} size={9}>Province</Mono>
          <ProvinceSelect value={invProvince} onChange={e=>setInvProvince(e.target.value)}
            style={{ marginTop:6, minWidth:80 }}/>
        </div>
        <button onClick={generate} disabled={!complaint.trim()}
          style={{ ...css.btn(INV_RED), flex:1, marginTop:20, opacity:complaint.trim()?1:.4 }}>
          🔍 Ouvrir le dossier d'enquête
        </button>
      </div>
    </div>
  );

  // ── LOADING view kept as stub ─────────────────────────────────────────────
  if (view === "loading") return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"100px 32px", gap:24 }}>
      <AILoader label="Ouverture du dossier d'enquête..."/>
      <Mono color={C.textD} size={8}>ANALYSE · PLAN · GUIDE D'ENTREVUE · PREUVE · CONCLUSIONS</Mono>
    </div>
  );

  // ── CASE VIEW ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth:980, margin:"0 auto" }}>
      <div style={{ background:INV_RED, borderRadius:10, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <Mono color="rgba(255,255,255,.6)" size={8}>Enquêtes & Investigations · Groupe IT Québec</Mono>
            <div style={{ fontSize:16, fontWeight:700, color:"#fff", marginTop:4 }}>{caseData?.caseId} — {caseData?.caseTitle}</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setView("list")} style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", borderRadius:6, padding:"6px 12px", fontSize:11, color:"#fff", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>← Retour</button>
            <button onClick={saveDossier} disabled={saved} style={{ background:saved?"rgba(255,255,255,.15)":"rgba(255,255,255,.25)", border:"1px solid rgba(255,255,255,.4)", borderRadius:6, padding:"6px 14px", fontSize:11, color:"#fff", cursor:saved?"default":"pointer", fontFamily:"'DM Sans',sans-serif" }}>{saved?"✓ Archivé":"💾 Archiver"}</button>
          </div>
        </div>
        <div style={{ display:"flex", gap:0, marginTop:12, overflowX:"auto" }}>
          {[{id:"input",label:"← Nouvelle saisie"},...INV_TABS].map(t=><button key={t.id}
            onClick={()=>{if(t.id==="input"){setView("input");}else{setActiveTab(t.id);}}}
            style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 14px",
              fontFamily:"'DM Mono',monospace", fontSize:8, fontWeight:500, letterSpacing:1.5,
              color:activeTab===t.id&&t.id!=="input"?"#fff":"rgba(255,255,255,.45)",
              borderBottom:`2px solid ${activeTab===t.id&&t.id!=="input"?"#fff":"transparent"}`,
              whiteSpace:"nowrap", transition:"all .15s", textTransform:"uppercase" }}>{t.num?`${t.num} · `:""}{t.label}</button>)}
        </div>
      </div>
      <div>{RENDERERS[activeTab]&&RENDERERS[activeTab]()}</div>
    </div>
  );
}

// ── MODULE STUB (fallback for modules not yet integrated) ─────────────────────
function ModuleStub({ title, icon, description }) {
  return (
    <div style={{ maxWidth:600, margin:"60px auto", textAlign:"center" }}>
      <div style={{ fontSize:40, marginBottom:16 }}>{icon}</div>
      <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:10 }}>{title}</div>
      <div style={{ fontSize:13, color:C.textM, lineHeight:1.7 }}>{description}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: DECISION LOG RH
// ══════════════════════════════════════════════════════════════════════════════

const DECISION_TYPES = [
  { value:"discipline", label:"Discipline" },
  { value:"performance", label:"Performance" },
  { value:"organizational", label:"Organisationnel" },
  { value:"talent", label:"Talent" },
  { value:"legal", label:"Légal" },
  { value:"other", label:"Autre" },
];
const DECISION_STATUSES = [
  { value:"draft", label:"Brouillon", color:C.textM },
  { value:"decided", label:"Décidé", color:C.em },
  { value:"reviewed", label:"Révisé", color:C.blue },
  { value:"archived", label:"Archivé", color:C.textD },
];
const DECISION_RISK = [
  { value:"low", label:"Faible", color:C.em },
  { value:"medium", label:"Modéré", color:C.amber },
  { value:"high", label:"Élevé", color:C.red },
];

const EMPTY_DECISION = {
  id:"", title:"", decisionDate:new Date().toISOString().split("T")[0],
  managerName:"", employeeName:"", linkedCaseId:"", linkedInvestigationId:"",
  decisionType:"discipline", riskLevel:"medium", province:"QC",
  status:"draft", facts:"", background:"", keyInputs:"",
  options:[], selectedOption:"", decisionRationale:"", decisionFactors:"",
  anticipatedRisks:{ legalRisk:"", employeeRelationsRisk:"", managerCapabilityRisk:"", organizationalRisk:"", precedentRisk:"", mitigationPlan:"" },
  legalNotes:{ legalNotes:"", applicableFramework:"", consultedSources:"", legalCautions:"" },
  outcome:"", followUpActions:"", reviewDate:"", retrospective:"",
  whatWorked:"", whatWasMissed:"", wouldDoSameAgain:"", createdAt:"", updatedAt:"",
};

function migrateDecision(d) {
  const base = { ...EMPTY_DECISION };
  Object.keys(d).forEach(k => { if (d[k] !== undefined && d[k] !== null) base[k] = d[k]; });
  if (!base.anticipatedRisks || typeof base.anticipatedRisks !== "object") base.anticipatedRisks = { ...EMPTY_DECISION.anticipatedRisks };
  if (!base.legalNotes || typeof base.legalNotes !== "object") base.legalNotes = { ...EMPTY_DECISION.legalNotes };
  if (!Array.isArray(base.options)) base.options = [];
  return base;
}

// ── AI prompt helpers ────────────────────────────────────────────────────────

function buildDecisionPromptContext(decision, legalContext) {
  return `TITRE: ${decision.title||"Non specifie"}
TYPE: ${decision.decisionType||"Non specifie"}
RISQUE: ${decision.riskLevel||"medium"}
GESTIONNAIRE: ${decision.managerName||"Non specifie"}
${decision.employeeName ? `EMPLOYE: ${decision.employeeName}` : ""}

FAITS:
${decision.facts||"Aucun fait fourni"}

CONTEXTE:
${decision.background||"Aucun contexte"}

ELEMENTS CLES:
${decision.keyInputs||"Aucun"}

OPTIONS CONSIDEREES:
${(decision.options||[]).map((o,i) => `Option ${i+1}: ${o.title||o.label||"Sans titre"} — ${o.description||""}`).join("\n")||"Aucune option"}

OPTION RETENUE: ${decision.selectedOption||"Aucune"}
JUSTIFICATION: ${decision.decisionRationale||"Aucune"}

${legalContext}`;
}

function buildGenerateOptionsPrompt(decision, legalContext) {
  const ctx = buildDecisionPromptContext(decision, legalContext);
  return { system: `Tu es HRBP senior, groupe IT, Canada. Ton role est de generer des options de decision realistes et equilibrees.
${LEGAL_GUARDRAIL}
Reponds UNIQUEMENT en JSON strict. Structure:
{"options":[{"title":"Titre court","description":"2-3 phrases","pros":["avantage"],"cons":["inconvenient"],"risks":"risques principaux"}]}
Genere exactement 3 options distinctes : une conservatrice, une moderee, une audacieuse.
Pas de guillemets simples dans les valeurs. Pas de retours a la ligne dans les valeurs.`, user: ctx };
}

function buildChallengeDecisionPrompt(decision, legalContext) {
  const ctx = buildDecisionPromptContext(decision, legalContext);
  return { system: `Tu es HRBP senior jouant le role d avocat du diable. Ton role est de challenger une decision RH en identifiant les angles morts, objections possibles et risques sous-estimes.
${LEGAL_GUARDRAIL}
Reponds UNIQUEMENT en JSON strict. Structure:
{"blindSpots":["angle mort"],"objections":[{"from":"partie prenante","objection":"objection probable","response":"reponse suggeree"}],"underestimatedRisks":["risque"],"worstCaseScenario":"scenario pire cas","recommendation":"recommandation finale 2-3 phrases"}
Pas de guillemets simples dans les valeurs. Pas de retours a la ligne dans les valeurs.`, user: ctx };
}

function buildDecisionRationalePrompt(decision, legalContext) {
  const ctx = buildDecisionPromptContext(decision, legalContext);
  return { system: `Tu es HRBP senior. Redige une justification formelle de decision RH. Ton sobre, rigoureux, factuel — pas de chatbot generique.
${LEGAL_GUARDRAIL}
Reponds UNIQUEMENT en JSON strict. Structure:
{"rationale":"justification formelle 4-6 phrases","keyFactors":["facteur decisif"],"alternativesConsidered":"resume des alternatives ecartees et pourquoi","legalBasis":"base legale si applicable","precedentNote":"note sur les precedents ou impacts futurs"}
Pas de guillemets simples dans les valeurs. Pas de retours a la ligne dans les valeurs.`, user: ctx };
}

function buildDecisionRetrospectivePrompt(decision, legalContext) {
  const ctx = buildDecisionPromptContext(decision, legalContext);
  const retro = `\nOUTCOME: ${decision.outcome||"Non documente"}\nACTIONS DE SUIVI: ${decision.followUpActions||"Aucune"}`;
  return { system: `Tu es HRBP senior. Analyse critique post-decision. Identifie ce qui a fonctionne, ce qui a ete manque, et les lecons pour l avenir.
${LEGAL_GUARDRAIL}
Reponds UNIQUEMENT en JSON strict. Structure:
{"whatWorkedWell":["element positif"],"whatWasMissed":["element manque"],"lessonsLearned":["lecon"],"wouldDoSameAgain":"oui/non et pourquoi en 2-3 phrases","improvementSuggestions":["suggestion"]}
Pas de guillemets simples dans les valeurs. Pas de retours a la ligne dans les valeurs.`, user: ctx + retro };
}

// ── Decision Log component ───────────────────────────────────────────────────

function ModuleDecisions({ data, onSave }) {
  const [view, setView] = useState("list");
  const [form, setForm] = useState({ ...EMPTY_DECISION });
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterProvince, setFilterProvince] = useState("all");

  // AI states
  const [aiLoading, setAiLoading] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");

  const decisions = (data.decisions || []).map(migrateDecision);
  const profile = data.profile || { defaultProvince:"QC" };
  const todayISO = new Date().toISOString().split("T")[0];

  const SF = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const setRisk = (field) => (e) => setForm(f => ({ ...f, anticipatedRisks:{ ...f.anticipatedRisks, [field]:e.target.value } }));
  const setLegal = (field) => (e) => setForm(f => ({ ...f, legalNotes:{ ...f.legalNotes, [field]:e.target.value } }));

  const focusStyle = { onFocus:e=>e.target.style.borderColor=C.em+"60", onBlur:e=>e.target.style.borderColor=C.border };

  const save = () => {
    if (!form.title.trim()) return;
    const now = todayISO;
    const record = { ...form, id: editId || Date.now().toString(), updatedAt: now, createdAt: form.createdAt || now };
    const updated = editId ? decisions.map(d => d.id === editId ? record : d) : [...decisions, record];
    onSave("decisions", updated);
    setView("list"); setForm({ ...EMPTY_DECISION }); setEditId(null);
  };

  const deleteDecision = (id) => {
    if (!confirm("Supprimer cette décision ?")) return;
    onSave("decisions", decisions.filter(d => d.id !== id));
    setView("list"); setForm({ ...EMPTY_DECISION }); setEditId(null);
  };

  const duplicate = (d) => {
    const dup = { ...migrateDecision(d), id:Date.now().toString(), title:d.title+" (copie)", status:"draft", createdAt:todayISO, updatedAt:todayISO };
    onSave("decisions", [...decisions, dup]);
  };

  const openEdit = (d) => { setForm(migrateDecision(d)); setEditId(d.id); setView("form"); };
  const openNew = () => { setForm({ ...EMPTY_DECISION, province: profile.defaultProvince || "QC" }); setEditId(null); setView("form"); };

  // Option CRUD
  const addOption = () => setForm(f => ({ ...f, options:[...f.options, { id:Date.now().toString(), title:"", description:"", pros:"", cons:"", risks:"" }] }));
  const removeOption = (id) => setForm(f => ({ ...f, options:f.options.filter(o=>o.id!==id) }));
  const setOpt = (id, field) => (e) => setForm(f => ({ ...f, options:f.options.map(o=>o.id===id?{...o,[field]:e.target.value}:o) }));

  // AI helpers
  const runAI = async (key, promptBuilder) => {
    setAiLoading(key); setAiError(""); setAiResult(null);
    try {
      const prov = form.province || profile.defaultProvince || "QC";
      const legalCtx = buildLegalPromptContext(prov);
      const { system, user } = promptBuilder(form, legalCtx);
      const parsed = await callAI(system, user);
      setAiResult({ key, data: parsed });
    } catch(e) { setAiError("Erreur IA: " + e.message); }
    finally { setAiLoading(""); }
  };

  const applyGeneratedOptions = (opts) => {
    const newOpts = (opts||[]).map(o => ({ id:Date.now().toString()+Math.random(), title:o.title||"", description:o.description||"", pros:o.pros?.join?o.pros.join(", "):o.pros||"", cons:o.cons?.join?o.cons.join(", "):o.cons||"", risks:o.risks||"" }));
    setForm(f => ({ ...f, options:[...f.options, ...newOpts] }));
    setAiResult(null);
  };

  const applyRationale = (r) => {
    setForm(f => ({ ...f, decisionRationale:r.rationale||"", decisionFactors:(r.keyFactors||[]).join("\n") }));
    setAiResult(null);
  };

  const applyRetrospective = (r) => {
    setForm(f => ({ ...f, whatWorked:(r.whatWorkedWell||[]).join("\n"), whatWasMissed:(r.whatWasMissed||[]).join("\n"), wouldDoSameAgain:r.wouldDoSameAgain||"", retrospective:(r.lessonsLearned||[]).join("\n") }));
    setAiResult(null);
  };

  // Completeness
  const completeness = (d) => {
    const keys = ["title","facts","background","decisionRationale","outcome"];
    const filled = keys.filter(k => d[k] && d[k].trim()).length;
    return Math.round((filled / keys.length) * 100);
  };

  // Review due
  const isReviewDue = (d) => {
    if (!d.reviewDate) return false;
    const diff = Math.floor((new Date(d.reviewDate+"T00:00:00") - new Date(todayISO+"T00:00:00")) / 86400000);
    return diff <= 7;
  };

  // ── DETAIL / EDIT VIEW ─────────────────────────────────────────────────────
  if (view === "form") {
    const prov = form.province || "QC";
    const riskC = DECISION_RISK.find(r=>r.value===form.riskLevel) || DECISION_RISK[1];
    const statusC = DECISION_STATUSES.find(s=>s.value===form.status) || DECISION_STATUSES[0];

    return (
      <div style={{ maxWidth:860, margin:"0 auto" }}>
        {/* Header bar */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          <button onClick={()=>{ setView("list"); setForm({...EMPTY_DECISION}); setEditId(null); }} style={{ ...css.btn(C.textM,true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
          <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{editId ? "Modifier la décision" : "Nouvelle décision"}</div>
          {editId && <button onClick={()=>deleteDecision(editId)} style={{ ...css.btn(C.red,true), padding:"6px 14px", fontSize:11 }}>🗑 Supprimer</button>}
        </div>

        {/* Section 1: Metadata */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="📋" label="Métadonnées" color={C.blue}/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:10 }}>
            <div><Mono color={C.textD} size={9}>Titre de la décision *</Mono>
              <input value={form.title} onChange={SF("title")} placeholder="Ex: Avis disciplinaire — retard chronique" style={{ ...css.input, marginTop:5 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={9}>Date de décision</Mono>
              <input type="date" value={form.decisionDate} onChange={SF("decisionDate")} style={{ ...css.input, marginTop:5 }}/></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:10 }}>
            <div><Mono color={C.textD} size={9}>Type</Mono>
              <select value={form.decisionType} onChange={SF("decisionType")} style={{ ...css.select, marginTop:5 }}>
                {DECISION_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div><Mono color={C.textD} size={9}>Niveau de risque</Mono>
              <select value={form.riskLevel} onChange={SF("riskLevel")} style={{ ...css.select, marginTop:5 }}>
                {DECISION_RISK.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div><Mono color={C.textD} size={9}>Province</Mono>
              <ProvinceSelect value={form.province} onChange={SF("province")} style={{ marginTop:5, width:"100%" }}/></div>
            <div><Mono color={C.textD} size={9}>Statut</Mono>
              <select value={form.status} onChange={SF("status")} style={{ ...css.select, marginTop:5 }}>
                {DECISION_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12 }}>
            <div><Mono color={C.textD} size={9}>Gestionnaire</Mono>
              <input value={form.managerName} onChange={SF("managerName")} placeholder="Nom" style={{ ...css.input, marginTop:5 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={9}>Employé (optionnel)</Mono>
              <input value={form.employeeName} onChange={SF("employeeName")} placeholder="Nom" style={{ ...css.input, marginTop:5 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={9}>Dossier lié (ID)</Mono>
              <input value={form.linkedCaseId} onChange={SF("linkedCaseId")} placeholder="ID case" style={{ ...css.input, marginTop:5 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={9}>Enquête liée (ID)</Mono>
              <input value={form.linkedInvestigationId} onChange={SF("linkedInvestigationId")} placeholder="ID investigation" style={{ ...css.input, marginTop:5 }} {...focusStyle}/></div>
          </div>
        </Card>

        {/* Section 2: Context & Facts */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="📝" label="Contexte et faits" color={C.purple}/>
          <Mono color={C.textD} size={9}>Faits établis</Mono>
          <textarea rows={3} value={form.facts} onChange={SF("facts")} placeholder="Faits objectifs, documentés, vérifiables..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Contexte / historique</Mono></div>
          <textarea rows={3} value={form.background} onChange={SF("background")} placeholder="Historique, contexte organisationnel, événements antérieurs..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Éléments clés considérés</Mono></div>
          <textarea rows={2} value={form.keyInputs} onChange={SF("keyInputs")} placeholder="Politiques, précédents, avis juridiques, données..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
        </Card>

        {/* Section 3: Options considérées */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="🔀" label="Options considérées" color={C.amber}/>
          {form.options.map((opt,i) => (
            <div key={opt.id} style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <Mono color={C.amber} size={9}>Option {i+1}</Mono>
                <button onClick={()=>removeOption(opt.id)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:14 }}>✕</button>
              </div>
              <input value={opt.title} onChange={setOpt(opt.id,"title")} placeholder="Titre de l'option" style={{ ...css.input, marginBottom:6 }} {...focusStyle}/>
              <textarea rows={2} value={opt.description} onChange={setOpt(opt.id,"description")} placeholder="Description détaillée" style={{ ...css.textarea, marginBottom:6 }} {...focusStyle}/>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                <div><Mono color={C.em} size={8}>Avantages</Mono><textarea rows={2} value={opt.pros} onChange={setOpt(opt.id,"pros")} style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
                <div><Mono color={C.red} size={8}>Inconvénients</Mono><textarea rows={2} value={opt.cons} onChange={setOpt(opt.id,"cons")} style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
                <div><Mono color={C.amber} size={8}>Risques</Mono><textarea rows={2} value={opt.risks} onChange={setOpt(opt.id,"risks")} style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
              </div>
            </div>
          ))}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={addOption} style={{ ...css.btn(C.amber,true), padding:"7px 14px", fontSize:11 }}>+ Ajouter une option</button>
            <button onClick={()=>runAI("options",buildGenerateOptionsPrompt)} disabled={!!aiLoading} style={{ ...css.btn(C.purple,true), padding:"7px 14px", fontSize:11, opacity:aiLoading?.5:1 }}>
              {aiLoading==="options"?"⏳ Génération...":"🤖 Générer 3 options avec l'IA"}</button>
          </div>
          {aiResult?.key==="options" && (
            <div style={{ background:C.surf, border:`1px solid ${C.purple}44`, borderRadius:8, padding:12, marginTop:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <Mono color={C.purple} size={9}>Options générées par l'IA</Mono>
                <button onClick={()=>applyGeneratedOptions(aiResult.data.options)} style={{ ...css.btn(C.em), padding:"5px 12px", fontSize:11 }}>✓ Appliquer</button>
              </div>
              {(aiResult.data.options||[]).map((o,i)=><div key={i} style={{ marginBottom:8 }}><div style={{ fontSize:13, fontWeight:600, color:C.text }}>{o.title}</div><div style={{ fontSize:12, color:C.textM, marginTop:2 }}>{o.description}</div></div>)}
            </div>
          )}
        </Card>

        {/* Section 4: Décision retenue */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="✅" label="Décision retenue" color={C.em}/>
          <Mono color={C.textD} size={9}>Option sélectionnée</Mono>
          {form.options.length > 0 ? (
            <select value={form.selectedOption} onChange={SF("selectedOption")} style={{ ...css.select, marginTop:5 }}>
              <option value="">— Sélectionner —</option>
              {form.options.map(o=><option key={o.id} value={o.title}>{o.title||"(sans titre)"}</option>)}
            </select>
          ) : (
            <input value={form.selectedOption} onChange={SF("selectedOption")} placeholder="Décision retenue" style={{ ...css.input, marginTop:5 }} {...focusStyle}/>
          )}
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Justification</Mono></div>
          <textarea rows={3} value={form.decisionRationale} onChange={SF("decisionRationale")} placeholder="Pourquoi cette option a été retenue..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Facteurs décisifs</Mono></div>
          <textarea rows={2} value={form.decisionFactors} onChange={SF("decisionFactors")} placeholder="Un facteur par ligne..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <button onClick={()=>runAI("challenge",buildChallengeDecisionPrompt)} disabled={!!aiLoading} style={{ ...css.btn(C.red,true), padding:"7px 14px", fontSize:11, opacity:aiLoading?.5:1 }}>
              {aiLoading==="challenge"?"⏳ Analyse...":"🔴 Challenger cette décision"}</button>
            <button onClick={()=>runAI("rationale",buildDecisionRationalePrompt)} disabled={!!aiLoading} style={{ ...css.btn(C.blue,true), padding:"7px 14px", fontSize:11, opacity:aiLoading?.5:1 }}>
              {aiLoading==="rationale"?"⏳ Rédaction...":"📝 Rédiger la justification"}</button>
          </div>
          {aiResult?.key==="challenge" && (
            <div style={{ background:C.red+"08", border:`1px solid ${C.red}33`, borderRadius:8, padding:14, marginTop:10 }}>
              <Mono color={C.red} size={9}>Challenge IA</Mono>
              {aiResult.data.blindSpots?.length>0 && <div style={{ marginTop:8 }}><Mono color={C.amber} size={8}>Angles morts</Mono>{aiResult.data.blindSpots.map((b,i)=><div key={i} style={{ fontSize:12, color:C.text, marginTop:4 }}>• {b}</div>)}</div>}
              {aiResult.data.objections?.length>0 && <div style={{ marginTop:8 }}><Mono color={C.purple} size={8}>Objections probables</Mono>{aiResult.data.objections.map((o,i)=><div key={i} style={{ marginTop:6 }}><div style={{ fontSize:12, color:C.amber, fontWeight:600 }}>{o.from}: {o.objection}</div><div style={{ fontSize:12, color:C.em, marginTop:2 }}>→ {o.response}</div></div>)}</div>}
              {aiResult.data.worstCaseScenario && <div style={{ marginTop:8 }}><Mono color={C.red} size={8}>Pire scénario</Mono><div style={{ fontSize:12, color:C.text, marginTop:4 }}>{aiResult.data.worstCaseScenario}</div></div>}
              {aiResult.data.recommendation && <div style={{ marginTop:8, fontSize:12, color:C.em, fontStyle:"italic" }}>{aiResult.data.recommendation}</div>}
              <button onClick={()=>setAiResult(null)} style={{ ...css.btn(C.textM,true), padding:"4px 10px", fontSize:10, marginTop:8 }}>Fermer</button>
            </div>
          )}
          {aiResult?.key==="rationale" && (
            <div style={{ background:C.blue+"08", border:`1px solid ${C.blue}33`, borderRadius:8, padding:14, marginTop:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <Mono color={C.blue} size={9}>Justification IA</Mono>
                <button onClick={()=>applyRationale(aiResult.data)} style={{ ...css.btn(C.em), padding:"5px 12px", fontSize:11 }}>✓ Appliquer</button>
              </div>
              <div style={{ fontSize:12, color:C.text, lineHeight:1.7 }}>{aiResult.data.rationale}</div>
              {aiResult.data.legalBasis && <div style={{ marginTop:6, fontSize:11, color:C.blue }}>📋 {aiResult.data.legalBasis}</div>}
              {aiResult.data.precedentNote && <div style={{ marginTop:4, fontSize:11, color:C.amber }}>⚠ {aiResult.data.precedentNote}</div>}
            </div>
          )}
        </Card>

        {/* Section 5: Risques anticipés */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="⚠️" label="Risques anticipés" color={C.red}/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["legalRisk","Risque légal"],["employeeRelationsRisk","Relations employés"],["managerCapabilityRisk","Capacité gestionnaire"],["organizationalRisk","Risque organisationnel"],["precedentRisk","Risque de précédent"]].map(([k,label])=>(
              <div key={k}><Mono color={C.textD} size={8}>{label}</Mono>
                <textarea rows={2} value={form.anticipatedRisks[k]||""} onChange={setRisk(k)} placeholder={label+"..."} style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            ))}
            <div style={{ gridColumn:"1 / -1" }}><Mono color={C.em} size={8}>Plan de mitigation</Mono>
              <textarea rows={2} value={form.anticipatedRisks.mitigationPlan||""} onChange={setRisk("mitigationPlan")} placeholder="Mesures de mitigation prévues..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
          </div>
        </Card>

        {/* Section 6: Legal Notes */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="⚖️" label={`Notes légales — ${prov}`} color={C.blue}/>
          <div style={{ fontSize:11, color:C.textM, marginBottom:10, padding:"6px 10px", background:C.surf, borderRadius:6 }}>
            {getLegalContext(prov)}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div><Mono color={C.textD} size={8}>Notes légales</Mono>
              <textarea rows={2} value={form.legalNotes.legalNotes||""} onChange={setLegal("legalNotes")} placeholder="Points légaux pertinents..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={8}>Cadre applicable</Mono>
              <textarea rows={2} value={form.legalNotes.applicableFramework||""} onChange={setLegal("applicableFramework")} placeholder="Lois, normes, politiques..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={8}>Sources consultées</Mono>
              <textarea rows={2} value={form.legalNotes.consultedSources||""} onChange={setLegal("consultedSources")} placeholder="Juriste, CNESST, politique interne..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={8}>Précautions légales</Mono>
              <textarea rows={2} value={form.legalNotes.legalCautions||""} onChange={setLegal("legalCautions")} placeholder="Points d'attention, risques juridiques..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
          </div>
        </Card>

        {/* Section 7: Outcome & Follow-up */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="📊" label="Résultat et suivi" color={C.teal}/>
          <Mono color={C.textD} size={9}>Résultat observé</Mono>
          <textarea rows={2} value={form.outcome} onChange={SF("outcome")} placeholder="Résultat concret après la décision..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Actions de suivi</Mono></div>
          <textarea rows={2} value={form.followUpActions} onChange={SF("followUpActions")} placeholder="Prochaines étapes, échéances..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Date de révision</Mono></div>
          <input type="date" value={form.reviewDate} onChange={SF("reviewDate")} style={{ ...css.input, marginTop:5, maxWidth:200 }}/>
        </Card>

        {/* Section 8: Rétrospective */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="🔄" label="Rétrospective" color={C.purple}/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div><Mono color={C.em} size={8}>Ce qui a fonctionné</Mono>
              <textarea rows={2} value={form.whatWorked} onChange={SF("whatWorked")} placeholder="Points positifs..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            <div><Mono color={C.red} size={8}>Ce qui a été manqué</Mono>
              <textarea rows={2} value={form.whatWasMissed} onChange={SF("whatWasMissed")} placeholder="Angles morts, erreurs..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
          </div>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Referais-tu la même chose ?</Mono></div>
          <textarea rows={2} value={form.wouldDoSameAgain} onChange={SF("wouldDoSameAgain")} placeholder="Oui/Non et pourquoi..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Leçons et notes rétrospectives</Mono></div>
          <textarea rows={2} value={form.retrospective} onChange={SF("retrospective")} placeholder="Leçons apprises pour les prochaines décisions..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <button onClick={()=>runAI("retro",buildDecisionRetrospectivePrompt)} disabled={!!aiLoading} style={{ ...css.btn(C.purple,true), padding:"7px 14px", fontSize:11, marginTop:10, opacity:aiLoading?.5:1 }}>
            {aiLoading==="retro"?"⏳ Analyse...":"🔄 Analyser le résultat avec l'IA"}</button>
          {aiResult?.key==="retro" && (
            <div style={{ background:C.purple+"08", border:`1px solid ${C.purple}33`, borderRadius:8, padding:14, marginTop:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <Mono color={C.purple} size={9}>Rétrospective IA</Mono>
                <button onClick={()=>applyRetrospective(aiResult.data)} style={{ ...css.btn(C.em), padding:"5px 12px", fontSize:11 }}>✓ Appliquer</button>
              </div>
              {aiResult.data.whatWorkedWell?.length>0 && <div style={{ marginBottom:6 }}><Mono color={C.em} size={8}>Positif</Mono>{aiResult.data.whatWorkedWell.map((w,i)=><div key={i} style={{ fontSize:12, color:C.text, marginTop:2 }}>✓ {w}</div>)}</div>}
              {aiResult.data.whatWasMissed?.length>0 && <div style={{ marginBottom:6 }}><Mono color={C.red} size={8}>Manqué</Mono>{aiResult.data.whatWasMissed.map((w,i)=><div key={i} style={{ fontSize:12, color:C.text, marginTop:2 }}>✗ {w}</div>)}</div>}
              {aiResult.data.wouldDoSameAgain && <div style={{ fontSize:12, color:C.amber, fontStyle:"italic" }}>{aiResult.data.wouldDoSameAgain}</div>}
            </div>
          )}
        </Card>

        {/* Error display */}
        {aiError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7, padding:"8px 12px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {aiError}</div>}

        {/* Sticky save bar */}
        <div style={{ position:"sticky", bottom:0, background:C.bg, borderTop:`1px solid ${C.border}`, padding:"12px 0", display:"flex", gap:10, zIndex:10 }}>
          <button onClick={save} disabled={!form.title.trim()} style={{ ...css.btn(C.em), flex:1, opacity:form.title.trim()?1:.4 }}>
            💾 {editId ? "Enregistrer" : "Créer la décision"}</button>
          <button onClick={()=>{ setView("list"); setForm({...EMPTY_DECISION}); setEditId(null); }} style={{ ...css.btn(C.textM,true) }}>Annuler</button>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  const filtered = decisions.filter(d => {
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (filterType !== "all" && d.decisionType !== filterType) return false;
    if (filterProvince !== "all" && d.province !== filterProvince) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(d.title||"").toLowerCase().includes(q) && !(d.managerName||"").toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a,b) => (b.updatedAt||b.createdAt||"").localeCompare(a.updatedAt||a.createdAt||""));

  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Decision Log RH</div>
          <div style={{ fontSize:12, color:C.textM }}>{decisions.length} décision(s) documentée(s)</div>
        </div>
        <button onClick={openNew} style={css.btn(C.em)}>+ Nouvelle décision</button>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher..." style={{ ...css.input, maxWidth:220, fontSize:12 }} {...focusStyle}/>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ ...css.select, maxWidth:140, fontSize:12 }}>
          <option value="all">Tous statuts</option>
          {DECISION_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{ ...css.select, maxWidth:150, fontSize:12 }}>
          <option value="all">Tous types</option>
          {DECISION_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterProvince} onChange={e=>setFilterProvince(e.target.value)} style={{ ...css.select, maxWidth:100, fontSize:12 }}>
          <option value="all">Prov.</option>
          {PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Decision list */}
      {filtered.length === 0 && <div style={{ textAlign:"center", padding:40, color:C.textD, fontSize:13 }}>
        {decisions.length === 0 ? "Aucune décision documentée. Clique sur \"+ Nouvelle décision\" pour commencer." : "Aucun résultat pour ces filtres."}
      </div>}

      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {filtered.map(d => {
          const riskDef = DECISION_RISK.find(r=>r.value===d.riskLevel) || DECISION_RISK[1];
          const statusDef = DECISION_STATUSES.find(s=>s.value===d.status) || DECISION_STATUSES[0];
          const typeDef = DECISION_TYPES.find(t=>t.value===d.decisionType) || DECISION_TYPES[5];
          const comp = completeness(d);
          const reviewDue = isReviewDue(d);

          return (
            <div key={d.id} style={{ background:C.surfL, border:`1px solid ${riskDef.color}28`, borderLeft:`3px solid ${riskDef.color}`, borderRadius:8, padding:"12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                <button onClick={()=>openEdit(d)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", textAlign:"left", padding:0, fontFamily:"'DM Sans',sans-serif" }}>
                  <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{d.title||"(sans titre)"}</span>
                </button>
                <Badge label={riskDef.label} color={riskDef.color}/>
                <Badge label={typeDef.label} color={C.blue} size={9}/>
                <Badge label={statusDef.label} color={statusDef.color} size={9}/>
                {d.province && <ProvinceBadge province={d.province}/>}
                {reviewDue && <Badge label="Review due" color={C.red} size={9}/>}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12, fontSize:11, color:C.textM }}>
                {d.managerName && <span>{d.managerName}</span>}
                {d.decisionDate && <span>{fmtDate(d.decisionDate)}</span>}
                <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4 }}>
                  <div style={{ width:40, height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
                    <div style={{ width:`${comp}%`, height:"100%", background:comp>=80?C.em:comp>=50?C.amber:C.textD, borderRadius:2 }}/>
                  </div>
                  <span style={{ fontSize:10 }}>{comp}%</span>
                </span>
                <button onClick={(e)=>{e.stopPropagation();duplicate(d);}} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:5, padding:"2px 8px", fontSize:10, color:C.textM, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>⧉ Dupliquer</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: COACHING
// ══════════════════════════════════════════════════════════════════════════════
const COACHING_SP = `Tu es expert en coaching managérial, gestionnaires IT québécois. Samuel Chartrand, HRBP senior.
Réponds UNIQUEMENT en JSON strict.
{"managerProfile":{"diagnosis":"diagnostic 2-3 phrases","archetype":"Gestionnaire technique|Évitant|Surengagé|Microgestionnaire|En développement|En difficulté|Fort potentiel","maturité":"Débutant (0-1 an)|Intermédiaire (1-3 ans)|Expérimenté (3+ ans)"},"coachingFocus":"enjeu central 1 phrase","recommendedFramework":"GROW|SBI|DESC|Radical Candor|CLEAR","frameworkRationale":"pourquoi ce framework","coachingQuestions":[{"question":"question de coaching","intent":"ce qu'elle vise","order":1}],"conversationScript":{"opening":"ouverture — sécurité psychologique","mainQuestion":"question pivot","checkIn":"valider compréhension","closing":"clôture avec engagement"},"watchouts":["risque RH/légal à surveiller"],"followUpPlan":{"nextCheckIn":"délai recommandé","successCriteria":["critère de progrès"],"escalationTrigger":"si pas d'amélioration dans X jours"},"hrbpNotes":"notes internes 2-3 phrases"}`;

const COACHING_SCENARIOS = [
  {id:"perf",icon:"📉",label:"Évite conversations perf",color:C.amber},
  {id:"conflict",icon:"⚡",label:"Conflit dans son équipe",color:C.red},
  {id:"newmgr",icon:"🌱",label:"Nouveau gestionnaire FTM",color:C.em},
  {id:"delegation",icon:"🔄",label:"Difficulté à déléguer",color:C.blue},
  {id:"micro",icon:"🔬",label:"Microgestionnaire",color:C.purple},
  {id:"feedback",icon:"💬",label:"Feedback difficile à donner",color:C.teal},
  {id:"retention",icon:"✈",label:"Perd des talents",color:C.red},
  {id:"credibility",icon:"🎯",label:"Crédibilité managériale",color:C.amber},
];

function ModuleCoaching({ data, onSave }) {
  const [view, setView] = useState("list");
  const [scenario, setScenario] = useState("perf");
  const [managerDesc, setManagerDesc] = useState("");
  const [situation, setSituation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const plans = data.coaching || [];

  const generate = async () => {
    if (situation.trim().length < 30) return;
    const sc = COACHING_SCENARIOS.find(s=>s.id===scenario);
    const _coachProv = data.profile?.defaultProvince || "QC";
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const _coachLegal = isLegalSensitive(situation + " " + (sc?.label||""))
        ? `\n${buildLegalPromptContext(_coachProv)}\n` : "";
      const parsed = await callAI(COACHING_SP, `SCÉNARIO: ${sc?.label}\nPROFIL: ${managerDesc||"Non spécifié"}${_coachLegal}\nSITUATION:\n${situation}`);
      setResult(parsed); setView("result");
    } catch(e) { setError("Erreur: " + e.message); } finally { setLoading(false); }
  };

  const savePlan = () => {
    if (!result || saved) return;
    onSave("coaching", [...plans, { id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], scenario, managerDesc, situation, result }]);
    setSaved(true);
  };

  if (view === "result" && result) return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={() => { setView("list"); setResult(null); setSituation(""); }} style={{ ...css.btn(C.textM,true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.coachingFocus}</div>
        <button onClick={savePlan} disabled={saved} style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>{saved?"✓ Archivé":"💾 Archiver"}</button>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}><Badge label={result.managerProfile?.archetype||""} color={C.blue}/><Badge label={result.managerProfile?.maturité||""} color={C.textM}/><Badge label={result.recommendedFramework} color={C.em}/></div>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${C.purple}` }}><SecHead icon="🧠" label="Diagnostic HRBP" color={C.purple}/><div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{result.managerProfile?.diagnosis}</div><div style={{ marginTop:8, fontSize:12, color:C.textM }}>Framework: <span style={{ color:C.em, fontWeight:600 }}>{result.recommendedFramework}</span> — {result.frameworkRationale}</div></Card>
      <Card style={{ marginBottom:10 }}><SecHead icon="💬" label="Script de conversation" color={C.teal}/>
        {[["Ouverture",result.conversationScript?.opening,C.em],["Question pivot",result.conversationScript?.mainQuestion,C.blue],["Check-in",result.conversationScript?.checkIn,C.textM],["Clôture & engagement",result.conversationScript?.closing,C.amber]].map(([l,v,col],i) => v?<div key={i} style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>{l}</Mono><div style={{ fontSize:13, color:col, lineHeight:1.7, marginTop:4, fontStyle:"italic" }}>"{v}"</div></div>:null)}
      </Card>
      <Card style={{ marginBottom:10 }}><SecHead icon="❓" label="Questions de coaching" color={C.blue}/>
        {result.coachingQuestions?.map((q,i) => <div key={i} style={{ marginBottom:10, paddingBottom:8, borderBottom:i<result.coachingQuestions.length-1?`1px solid ${C.border}`:"none" }}><div style={{ fontSize:13, color:C.text, fontStyle:"italic", marginBottom:4 }}>"{q.question}"</div><div style={{ fontSize:11, color:C.textM }}><span style={{ color:C.em }}>💡 </span>{q.intent}</div></div>)}
      </Card>
      <Card style={{ marginBottom:10 }}><SecHead icon="📅" label="Plan de suivi" color={C.amber}/>
        <div style={{ marginBottom:8 }}><Mono color={C.textD} size={9}>Prochain check-in</Mono><div style={{ fontSize:13, color:C.text, marginTop:4 }}>{result.followUpPlan?.nextCheckIn}</div></div>
        <div style={{ marginBottom:8 }}><Mono color={C.textD} size={9}>Critères de succès</Mono>{result.followUpPlan?.successCriteria?.map((s,i)=><div key={i} style={{ display:"flex", gap:8, marginTop:4 }}><div style={{ width:5,height:5,borderRadius:"50%",background:C.em,flexShrink:0,marginTop:6 }}/><span style={{ fontSize:12,color:C.text }}>{s}</span></div>)}</div>
        <div><Mono color={C.textD} size={9}>Trigger d'escalade</Mono><div style={{ fontSize:12, color:C.red, marginTop:4 }}>{result.followUpPlan?.escalationTrigger}</div></div>
      </Card>
      {result.watchouts?.length>0&&<Card style={{ marginBottom:10, borderLeft:`3px solid ${C.red}` }}><SecHead icon="⚠" label="Watchouts RH/Légaux" color={C.red}/>{result.watchouts.map((w,i)=><div key={i} style={{ display:"flex", gap:8, marginBottom:6 }}><div style={{ width:5,height:5,borderRadius:"50%",background:C.red,flexShrink:0,marginTop:6 }}/><span style={{ fontSize:12,color:C.text }}>{w}</span></div>)}</Card>}
      {result.hrbpNotes&&<Card style={{ borderLeft:`3px solid ${C.textD}` }}><Mono color={C.textD} size={9}>Notes internes HRBP</Mono><div style={{ fontSize:12, color:C.textM, fontStyle:"italic", lineHeight:1.65, marginTop:6 }}>{result.hrbpNotes}</div></Card>}
    </div>
  );

  return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ marginBottom:20 }}><div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Manager Coaching Playbook</div><div style={{ fontSize:12, color:C.textM }}>{plans.length} plan(s) archivé(s)</div></div>
      <Card style={{ marginBottom:20 }}>
        <SecHead icon="🤝" label="Nouveau plan de coaching" color={C.teal}/>
        <Mono color={C.textD} size={9}>Scénario</Mono>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:8, marginBottom:12 }}>
          {COACHING_SCENARIOS.map(s=><button key={s.id} onClick={()=>setScenario(s.id)} style={{ background:scenario===s.id?s.color+"22":"none", color:scenario===s.id?s.color:C.textM, border:`1px solid ${scenario===s.id?s.color+"55":C.border}`, borderRadius:7, padding:"8px 6px", fontSize:11, fontWeight:scenario===s.id?600:400, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"center" }}><div style={{ fontSize:16, marginBottom:3 }}>{s.icon}</div>{s.label}</button>)}
        </div>
        <div style={{ marginBottom:12 }}><Mono color={C.textD} size={9}>Profil gestionnaire</Mono><input value={managerDesc} onChange={e=>setManagerDesc(e.target.value)} placeholder="Ex: Tech lead promu il y a 8 mois, 5 directs..." style={{ ...css.input, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/></div>
        <Mono color={C.textD} size={9}>Décris la situation</Mono>
        <textarea rows={4} value={situation} onChange={e=>setSituation(e.target.value)} placeholder="Comportements observés, contexte, faits concrets..." style={{ ...css.textarea, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        {error&&<div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7, padding:"8px 12px", margin:"10px 0", fontSize:12, color:C.red }}>⚠ {error}</div>}
        {loading?<AILoader label="Préparation du plan de coaching"/>:<button onClick={generate} disabled={situation.trim().length<30} style={{ ...css.btn(C.teal), width:"100%", marginTop:12, opacity:situation.trim().length>=30?1:.4 }}>🤝 Générer le plan de coaching</button>}
      </Card>
      {plans.length>0&&<><Mono color={C.textD} size={9}>Plans archivés</Mono><div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>{plans.slice().reverse().map((p,i)=>{ const sc=COACHING_SCENARIOS.find(s=>s.id===p.scenario); return <button key={i} onClick={()=>{ setResult(p.result); setSaved(true); setView("result"); }} style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:12 }}><span style={{ fontSize:18 }}>{sc?.icon||"🤝"}</span><div style={{ flex:1 }}><div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{p.result?.coachingFocus}</div><div style={{ fontSize:11, color:C.textM }}>{sc?.label} · {p.savedAt}</div></div><Badge label={p.result?.recommendedFramework||""} color={C.em}/></button>; })}</div></>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: EXIT INTERVIEW
// ══════════════════════════════════════════════════════════════════════════════
const EXIT_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Québec. LNT, CNESST, Loi 25, Charte QC.
Réponds UNIQUEMENT en JSON strict.
{"employeeProfile":{"role":"rôle","tenure":"ancienneté","seniority":"niveau","team":"équipe"},"summary":{"headline":"1 phrase essentiel < 20 mots","departure_type":"Volontaire regrettable|Volontaire non regrettable|Inconnu","regrettable":"Oui|Non|Partiel","regrettableRationale":"pourquoi","primaryTheme":"thème dominant","executiveSummary":["contexte","cause principale","facteur déclencheur","implication org","recommandation HRBP"],"confidentialityNote":"ce qui peut être partagé vs confidentiel"},"reasons":{"primary":[{"reason":"raison principale","confidence":"Élevée|Modérée|Hypothèse"}],"secondary":[{"reason":"raison secondaire","confidence":"Élevée|Modérée|Hypothèse"}],"statedVsReal":"raison déclarée vs vraie raison","themes":["leadership","career","compensation","workload","culture","collab","role"]},"management":{"overallSentiment":"Positif|Neutre|Mitigé|Négatif|Critique","feedbackItems":[{"observation":"observation","severity":"Élevée|Modérée|Faible"}],"managerImpact":"part du départ attribuable au gestionnaire","coachingImplication":"implication dev gestionnaire"},"signals":[{"signal":"signal faible","category":"Culture|Rétention|Performance|Leadership|Bien-être","breadth":"Isolé|Potentiellement récurrent|Probablement systémique","ifUnaddressed":"conséquence"}],"improvements":[{"opportunity":"opportunité","area":"Leadership|Culture|Processus|Rémunération|Développement","priority":"Élevée|Modérée|Faible"}],"hrbpActions":[{"action":"action recommandée","delay":"Immédiat|7 jours|30 jours","owner":"HRBP|Gestionnaire|Direction"}]}`;

function ModuleExit({ data, onSave }) {
  const [view, setView] = useState("list");
  const [notes, setNotes] = useState(""); const [role, setRole] = useState(""); const [tenure, setTenure] = useState(""); const [seniority, setSeniority] = useState(""); const [team, setTeam] = useState(""); const [exitProvince, setExitProvince] = useState("QC");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null); const [saved, setSaved] = useState(false);
  const exits = data.exits || [];
  const DC = {"Volontaire regrettable":C.red,"Volontaire non regrettable":C.em,"Inconnu":C.textM};
  const SC = {"Positif":C.em,"Neutre":C.blue,"Mitigé":C.amber,"Négatif":C.red,"Critique":C.red};

  const analyze = async () => {
    if (notes.trim().length < 60) return;
    const _exitProv = exitProvince || data.profile?.defaultProvince || "QC";
    const _exitLegal = buildLegalPromptContext(_exitProv);
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const parsed = await callAI(EXIT_SP, `${_exitLegal}\n\nPROFIL:\n- Rôle: ${role||"non spécifié"}\n- Ancienneté: ${tenure||"non spécifiée"}\n- Niveau: ${seniority||"non spécifié"}\n- Équipe: ${team||"non spécifiée"}\n\nDONNÉES:\n${notes}`);
      setResult(parsed); setView("result");
    } catch(e) { setError("Erreur: " + e.message); } finally { setLoading(false); }
  };

  const saveExit = () => {
    if (!result || saved) return;
    onSave("exits", [...exits, { id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], role, tenure, team, province:exitProvince, result }]);
    setSaved(true);
  };

  if (view === "result" && result) return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={()=>{ setView("list"); setResult(null); setNotes(""); }} style={{ ...css.btn(C.textM,true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.summary?.headline}</div>
        <button onClick={saveExit} disabled={saved} style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>{saved?"✓ Archivé":"💾 Archiver"}</button>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <Badge label={result.summary?.departure_type||""} color={DC[result.summary?.departure_type]||C.textM}/>
        <Badge label={`Regrettable: ${result.summary?.regrettable||"?"}`} color={result.summary?.regrettable==="Oui"?C.red:C.em}/>
        <Badge label={result.summary?.primaryTheme||""} color={C.purple}/>
        {result.employeeProfile?.role&&<Badge label={result.employeeProfile.role} color={C.blue}/>}
      </div>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${C.em}` }}><SecHead icon="📋" label="Résumé exécutif" color={C.em}/><BulletList items={result.summary?.executiveSummary} color={C.em}/>{result.summary?.confidentialityNote&&<div style={{ marginTop:10, fontSize:11, color:C.amber, fontStyle:"italic" }}>🔒 {result.summary.confidentialityNote}</div>}</Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <Card><SecHead icon="🔍" label="Raisons du départ" color={C.purple}/>{result.reasons?.primary?.map((r,i)=><div key={i} style={{ marginBottom:6 }}><Badge label={r.confidence} color={r.confidence==="Élevée"?C.red:C.amber} size={10}/><div style={{ fontSize:13, color:C.text, marginTop:4 }}>{r.reason}</div></div>)}{result.reasons?.statedVsReal&&<div style={{ marginTop:8, fontSize:12, color:C.textM, fontStyle:"italic" }}><span style={{ color:C.amber }}>Déclaré vs réel: </span>{result.reasons.statedVsReal}</div>}</Card>
        <Card><SecHead icon="🎙️" label="Feedback management" color={C.red}/><div style={{ marginBottom:8 }}><Badge label={result.management?.overallSentiment||""} color={SC[result.management?.overallSentiment]||C.textM}/></div><div style={{ fontSize:12, color:C.textM, marginBottom:6 }}>{result.management?.managerImpact}</div><div style={{ fontSize:11, color:C.em }}>Coaching: {result.management?.coachingImplication}</div></Card>
      </div>
      {result.signals?.length>0&&<Card style={{ marginBottom:10 }}><SecHead icon="📡" label="Signaux faibles" color={C.purple}/>{result.signals.map((s,i)=><div key={i} style={{ marginBottom:10, paddingBottom:8, borderBottom:i<result.signals.length-1?`1px solid ${C.border}`:"none" }}><div style={{ display:"flex", gap:6, marginBottom:4 }}><Badge label={s.category} color={C.purple} size={10}/><Badge label={s.breadth} color={s.breadth==="Probablement systémique"?C.red:s.breadth==="Potentiellement récurrent"?C.amber:C.em} size={10}/></div><div style={{ fontSize:13, color:C.text }}>{s.signal}</div><div style={{ fontSize:11, color:C.red, marginTop:3 }}>Si non adressé: {s.ifUnaddressed}</div></div>)}</Card>}
      {result.hrbpActions?.length>0&&<Card><SecHead icon="🎯" label="Actions HRBP" color={C.em}/>{result.hrbpActions.map((a,i)=><div key={i} style={{ display:"flex", gap:8, marginBottom:7 }}><Badge label={a.delay} color={DELAY_C[a.delay]||C.blue} size={10}/><span style={{ fontSize:13, color:C.text }}>{a.action}</span></div>)}</Card>}
    </div>
  );

  return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ marginBottom:20 }}><div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Exit Interview Analyzer</div><div style={{ fontSize:12, color:C.textM }}>{exits.length} entrevue(s) archivée(s)</div></div>
      <Card style={{ marginBottom:20 }}>
        <SecHead icon="🚪" label="Analyser une entrevue de départ" color={C.textM}/>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
          {[["Rôle",role,setRole,"Ex: Tech Lead"],["Ancienneté",tenure,setTenure,"Ex: 2 ans"],["Niveau",seniority,setSeniority,"Ex: Senior"],["Équipe",team,setTeam,"Ex: IT Infra"]].map(([l,v,s,ph],i)=><div key={i}><Mono color={C.textD} size={9}>{l}</Mono><input value={v} onChange={e=>s(e.target.value)} placeholder={ph} style={{ ...css.input, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/></div>)}
          <div><Mono color={C.textD} size={9}>Province</Mono><ProvinceSelect value={exitProvince} onChange={e=>setExitProvince(e.target.value)} style={{ marginTop:6, width:"100%" }}/></div>
        </div>
        <Mono color={C.textD} size={9}>Notes / verbatims de l'entrevue</Mono>
        <textarea rows={8} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes, réponses, verbatims importants, contexte..." style={{ ...css.textarea, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        {error&&<div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7, padding:"8px 12px", margin:"10px 0", fontSize:12, color:C.red }}>⚠ {error}</div>}
        {loading?<AILoader label="Analyse de l'entrevue de départ"/>:<button onClick={analyze} disabled={notes.trim().length<60} style={{ ...css.btn(C.purple), width:"100%", marginTop:12, opacity:notes.trim().length>=60?1:.4 }}>🚪 Analyser l'entrevue de départ</button>}
      </Card>
      {exits.length>0&&<><Mono color={C.textD} size={9}>Entrevues archivées</Mono><div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>{exits.slice().reverse().map((e,i)=>{ const dc=DC[e.result?.summary?.departure_type]||C.textM; return <button key={i} onClick={()=>{ setResult(e.result); setSaved(true); setView("result"); }} style={{ background:C.surfL, border:`1px solid ${dc}28`, borderLeft:`3px solid ${dc}`, borderRadius:8, padding:"12px 14px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}><div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}><span style={{ fontSize:13, fontWeight:500, color:C.text }}>{e.result?.summary?.headline}</span><Badge label={e.result?.summary?.departure_type||""} color={dc} size={10}/></div><div style={{ fontSize:11, color:C.textM }}>{e.role} · {e.team} · {e.savedAt}</div></button>; })}</div></>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: 1:1 PREPARATION
// ══════════════════════════════════════════════════════════════════════════════

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

function Module1on1Prep({ data, onSave, onNavigate }) {

  // ── State ────────────────────────────────────────────────────────────────
  const [pTab, setPTab]           = useState("context");
  const [ctx, setCtx]             = useState({
    managerName:"", team:"", date:"", meetingType:"regular",
    purpose:"", background:"", activeCases:"", recentData:"", alerts:"",
  });
  const [prep, setPrep]           = useState(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepAI, setPrepAI]       = useState(false);
  const [notes, setNotes]         = useState({ people:"", performance:"", risks:"", org:"", leadership:"", actions:"", followups:"" });
  const [output, setOutput]       = useState(null);
  const [outputLoading, setOutputLoading] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [saved1on1, setSaved1on1] = useState(false);
  const [prepPrompt, setPrepPrompt] = useState("");
  const [outputPrompt, setOutputPrompt] = useState("");
  const [sigExp, setSigExp]       = useState({});
  const [histExp, setHistExp]     = useState({});

  // ── History: all meetings for this manager ────────────────────────────────
  const managerHistory = (data.meetings || [])
    .filter(m => {
      if (!m.director || !ctx.managerName) return false;
      const needle = ctx.managerName.trim().toLowerCase().split(/\s+/)[0];
      return m.director.toLowerCase().includes(needle);
    })
    .sort((a, b) => Number(b.id) - Number(a.id));

  const lastMeeting  = managerHistory[0] || null;
  const lastAnalysis = lastMeeting?.analysis || null;
  const histCount    = managerHistory.length;

  // ── Build history string for AI prompt ───────────────────────────────────
  const buildHistCtx = () => managerHistory.slice(0, 3).map((m, i) => {
    const a = m.analysis || {};
    const risks    = (a.risks    || []).slice(0,2).map(r => r.risk    || r).join("; ");
    const actions  = (a.actions  || []).slice(0,3).map(ac => ac.action || ac).join("; ");
    const questions= (a.questions|| []).slice(0,3).map(q  => q.question|| q).join("; ");
    return `[Meeting ${i+1} — ${m.savedAt}]
Titre: ${a.meetingTitle||"N/D"} | Risque: ${a.overallRisk||"N/D"}
Résumé: ${(a.summary||[]).slice(0,2).join(" / ")}
Risques: ${risks}
Actions: ${actions}
Questions posées: ${questions}`;
  }).join("\n\n");

  // ── AI: generate prep questions ───────────────────────────────────────────
  const generatePrep = async () => {
    if (!ctx.managerName) return;
    setPrepLoading(true);
    const histCtx = buildHistCtx();
    const sp = `Tu es un HRBP senior expert. Genere une preparation strategique pour une rencontre 1:1 avec un gestionnaire.
${histCtx ? "Tu as l'historique des reunions precedentes — personalise les questions et fais des liens avec les enjeux non resolus." : ""}
Reponds UNIQUEMENT en JSON strict. Structure exacte:
{"objectives":["obj1","obj2","obj3"],"strategic":["q1","q2","q3"],"people":["q1","q2","q3"],"org":["q1","q2"],"leadership":["q1","q2"],"performance":["q1","q2"],"capacity":["q1","q2"],"followUp":["suivi1 lie a l historique","suivi2"]}
Aucun texte avant ou apres. Aucun backtick. Aucune apostrophe dans les valeurs JSON. Francais professionnel.`;
    const up = [
      `Gestionnaire: ${ctx.managerName}`,
      `Equipe: ${ctx.team}`,
      `Type: ${ctx.meetingType}`,
      `Objectif: ${ctx.purpose}`,
      `Contexte: ${ctx.background}`,
      `Alertes: ${ctx.alerts}`,
      histCtx ? `\nHISTORIQUE:\n${histCtx}` : "",
    ].filter(Boolean).join("\n");
    try { const p = await callAI(sp, up); setPrep(p); setPrepAI(true); }
    catch { setPrep(PREP_QUESTIONS_DB); setPrepAI(false); }
    finally { setPrepLoading(false); }
  };

  // ── AI: generate post-meeting output ─────────────────────────────────────
  const generateOutput = async () => {
    setOutputLoading(true);
    const sp = `Tu es un HRBP senior. Genere un compte-rendu post-rencontre ET une strategie HRBP.
Reponds UNIQUEMENT en JSON strict. Aucun texte avant ou apres. Aucune apostrophe dans les valeurs. Francais professionnel. Max 3 items par liste. Sois direct et specifique, pas generique.
{"executiveSummary":"2-3 phrases","overallRisk":"Critique|Eleve|Modere|Faible","keySignals":["signal1","signal2"],"mainRisks":["risque1","risque2"],"hrbpFollowups":["action1","action2","action3"],"nextMeetingContext":"phrase de contexte pour le prochain 1:1","nextMeetingQuestions":["q1","q2","q3"],"actionPlan":[{"action":"action","owner":"HRBP|Gestionnaire|HRBP + Gestionnaire","delay":"Immediat|7 jours|30 jours|Continu","priority":"Critique|Elevee|Normale"}],"strategieHRBP":{"lectureGestionnaire":{"style":"style de gestion observe parmi: evitant / directif / deborde / fort mais desaligne / en developpement / reactif","forces":["force observee"],"angles":"angle principal a utiliser avec ce gestionnaire en 1 phrase"},"santeEquipe":{"performance":"Forte|Correcte|A risque|Critique","engagement":"Eleve|Modere|Fragile|Critique","dynamique":"1 phrase sur la dynamique d equipe observee"},"risqueCle":{"nature":"nature du risque principal — attrition / performance / conflit / legal / leadership / engagement","niveau":"Critique|Eleve|Modere|Faible","rationale":"1 phrase — pourquoi ce risque maintenant"},"postureHRBP":{"mode":"Coach|Challenge|Directif|Escalader","justification":"1 phrase — pourquoi ce mode avec ce gestionnaire"},"strategieInfluence":"angle et levier pour cette conversation — comment cadrer pour maximiser l impact","objectifRencontre":"ce que tu veux obtenir concretement a la fin de ce meeting en 1 phrase"}}`;
    const _prepProv = ctx.province || data.profile?.defaultProvince || "QC";
    const _prepLegalText = isLegalSensitive(
      [ctx.purpose,ctx.background,notes.risks,notes.performance,notes.actions].join(" ")
    ) ? `\n${buildLegalPromptContext(_prepProv)}\n` : "";
    const up = `Gestionnaire: ${ctx.managerName||"N/A"}\nEquipe: ${ctx.team||"N/A"}\nObjectif: ${ctx.purpose||"N/A"}\nContexte: ${ctx.background||"N/A"}${_prepLegalText}\nNotes — Personnes: ${notes.people||"Aucune"}\nNotes — Performance: ${notes.performance||"Aucune"}\nNotes — Risques: ${notes.risks||"Aucune"}\nNotes — Org: ${notes.org||"Aucune"}\nNotes — Leadership: ${notes.leadership||"Aucune"}\nNotes — Actions: ${notes.actions||"Aucune"}\nNotes — Suivis: ${notes.followups||"Aucune"}`;
    try { const p = await callAI(sp, up); setOutput(p); }
    catch { setOutput({ executiveSummary:"Rencontre completee. Voir les notes.", overallRisk:"Modere", keySignals:["A completer"], mainRisks:["A identifier"], hrbpFollowups:["Reviser les notes"], nextMeetingContext:"", nextMeetingQuestions:["A definir"], actionPlan:[{action:"Faire le suivi",owner:"HRBP",delay:"7 jours",priority:"Normale"}] }); }
    finally { setOutputLoading(false); }
  };

  // ── Save current session ──────────────────────────────────────────────────
  const save1on1 = () => {
    if (!output || saved1on1) return;
    const session = {
      id: Date.now().toString(), savedAt: new Date().toISOString().split("T")[0],
      managerName: ctx.managerName, team: ctx.team, meetingType: ctx.meetingType,
      date: ctx.date, purpose: ctx.purpose, notes, output,
      province: ctx.province || data.profile?.defaultProvince || "QC",
    };
    onSave("prep1on1", [...(data["prep1on1"]||[]), session]);
    setSaved1on1(true);
  };

  // ── Start next cycle — keep manager, reset everything else ────────────────
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
    setOutput(null); setSaved1on1(false);
    setPTab("context");
  };

  // ── Copy output as text ───────────────────────────────────────────────────
  const copyOutput = () => {
    if (!output) return;
    const lines = [
      `COMPTE-RENDU 1:1 — ${ctx.managerName||"Gestionnaire"} (${ctx.date||new Date().toLocaleDateString("fr-CA")})`,
      "", `RESUME\n${output.executiveSummary}`,
      "", `RISQUE: ${output.overallRisk}`,
      "", `SIGNAUX\n${(output.keySignals||[]).map((s,i)=>`${i+1}. ${s}`).join("\n")}`,
      "", `RISQUES\n${(output.mainRisks||[]).map((s,i)=>`${i+1}. ${s}`).join("\n")}`,
      "", `SUIVIS HRBP\n${(output.hrbpFollowups||[]).map((s,i)=>`${i+1}. ${s}`).join("\n")}`,
      "", `PROCHAINE RENCONTRE\n${(output.nextMeetingQuestions||[]).map((s,i)=>`${i+1}. ${s}`).join("\n")}`,
      "", `PLAN D ACTION\n${(output.actionPlan||[]).map(a=>`- ${a.action} [${a.owner} / ${a.delay} / ${a.priority}]`).join("\n")}`,
    ];
    navigator.clipboard.writeText(lines.join("\n"))
      .then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  // ── Static data ───────────────────────────────────────────────────────────
  const PTABS = [
    {id:"context",  icon:"📋", label:"Contexte",      color:C.blue},
    {id:"history",  icon:"🕐", label:"Historique",    color:C.purple, badge:histCount||null},
    {id:"prep",     icon:"🎯", label:"Préparation",   color:C.em,     badge:prep?"✓":null},
    {id:"signals",  icon:"📡", label:"Signaux",       color:C.amber},
    {id:"guidance", icon:"🧭", label:"Guidance",      color:C.teal},
    {id:"notes",    icon:"📝", label:"Notes",         color:C.blue},
    {id:"output",   icon:"📊", label:"Output",        color:C.red,    badge:output?"✓":null},
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
  const RISK_C = {Critique:C.red,Eleve:C.amber,Élevé:C.amber,Elevé:C.amber,Modere:C.blue,Modéré:C.blue,Moderé:C.blue,Faible:C.em};
  const activePTab = PTABS.find(t => t.id === pTab);
  const questions  = prep || PREP_QUESTIONS_DB;

  // ── FLOW STEPS ────────────────────────────────────────────────────────────
  const flowSteps = [
    { n:"1", label:"Contexte",         done:!!ctx.managerName,       tab:"context"  },
    { n:"2", label:"Historique",       done:histCount>0,             tab:"history"  },
    { n:"3", label:"Génère questions", done:!!prep,                  tab:"prep"     },
    { n:"4", label:"Fais le meeting",  done:false,                   nav:"meetings" },
    { n:"5", label:"Analyse transcript",done:false,                  nav:"meetings" },
    { n:"6", label:"Output + Archiver",done:!!output && saved1on1,   tab:"output"   },
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
                        letterSpacing:2, marginBottom:3 }}>MEETINGS</div>
          <div style={{ fontSize:13, fontWeight:800, color:C.text }}>Préparation 1:1</div>
          {ctx.managerName && (
            <div style={{ marginTop:8, padding:"6px 9px", background:C.emD+"30",
                          borderRadius:6, border:`1px solid ${C.emD}` }}>
              <div style={{ fontSize:12, color:C.em, fontWeight:700 }}>{ctx.managerName}</div>
              <div style={{ fontSize:10, color:C.textD }}>
                {histCount > 0 ? `${histCount} meeting(s) archivé(s)` : "Nouveau gestionnaire"}
              </div>
            </div>
          )}
        </div>

        {/* Flow tracker */}
        <div style={{ padding:"12px 13px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:9, color:C.textD, fontFamily:"'DM Mono',monospace",
                        letterSpacing:1, marginBottom:8 }}>CYCLE EN COURS</div>
          {flowSteps.map((s, i) => (
            <div key={i}
              onClick={() => s.tab ? setPTab(s.tab) : s.nav ? onNavigate(s.nav) : null}
              style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6,
                       cursor:s.tab||s.nav?"pointer":"default" }}>
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

        <div style={{ padding:"10px 12px", borderTop:`1px solid ${C.border}` }}>
          <button onClick={()=>onNavigate("meetings")}
            style={{ ...css.btn(C.textM,true), width:"100%", padding:"7px", fontSize:11 }}>
            ← Meetings
          </button>
        </div>
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
            {/* Prep tab actions */}
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
                {prep && (
                  <button onClick={()=>onNavigate("meetings")}
                    style={{ ...css.btn(C.blue), padding:"6px 14px", fontSize:12 }}>
                    ⚡ Aller analyser →
                  </button>
                )}
              </>
            )}
            {/* Output tab actions */}
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
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                <div style={{...css.card}}>
                  <Mono color={C.blue} size={9}>IDENTIFICATION</Mono>
                  <div style={{marginTop:10}}>
                    {[["Nom du gestionnaire","managerName","ex. Marie Tremblay"],
                      ["Date de la rencontre","date",new Date().toLocaleDateString("fr-CA")]
                    ].map(([label,key,ph]) => (
                      <div key={key} style={{marginBottom:12}}>
                        <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                          {label}
                        </div>
                        <input value={ctx[key]}
                          onChange={e=>setCtx(p=>({...p,[key]:e.target.value}))}
                          placeholder={ph} style={{...css.input}}
                          onFocus={e=>e.target.style.borderColor=C.em}
                          onBlur={e=>e.target.style.borderColor=C.border}/>
                      </div>
                    ))}
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
                  {[["Dossiers actifs","activeCases",
                      "ex. PIP en cours, plainte déposée…",3],
                    ["Données récentes","recentData",
                      "ex. 2 départs Q4, taux abs en hausse…",3],
                    ["Tensions / alertes","alerts",
                      "ex. Tensions avec l équipe de Morgan…",3]
                  ].map(([label,key,ph,rows]) => (
                    <div key={key}>
                      <div style={{fontSize:11,color:C.textM,marginBottom:5,fontWeight:500}}>
                        {label}
                      </div>
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

              {/* History auto-detect banner */}
              {ctx.managerName && histCount > 0 && (
                <div style={{marginTop:12,padding:"11px 14px",
                              background:C.purple+"18",
                              border:`1px solid ${C.purple}40`,borderRadius:8,
                              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:C.purple}}>
                    🕐 <strong>{histCount} meeting(s)</strong> trouvé(s) pour{" "}
                    <strong>{ctx.managerName}</strong> —
                    l'historique sera injecté dans la génération des questions.
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
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:8}}>
                    Aucun historique
                  </div>
                  <div style={{fontSize:12,color:C.textD,maxWidth:360,margin:"0 auto",
                                marginBottom:16}}>
                    {ctx.managerName
                      ? `Aucun transcript analysé pour "${ctx.managerName}". Chaque meeting analysé dans le module Meetings alimentera automatiquement cet historique.`
                      : "Remplis le nom du gestionnaire dans Contexte pour voir son historique."}
                  </div>
                  <button onClick={()=>onNavigate("meetings")}
                    style={{...css.btn(C.em)}}>
                    ⚡ Aller analyser un transcript
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4}}>
                      Historique — {ctx.managerName}
                    </div>
                    <div style={{fontSize:12,color:C.textD}}>
                      {histCount} transcript(s) analysé(s) · Les 3 plus récents alimentent la génération des questions.
                    </div>
                  </div>

                  {/* Last meeting — expanded detail */}
                  {lastAnalysis && (
                    <div style={{...css.card,borderLeft:`3px solid ${C.em}`,marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",
                                    justifyContent:"space-between",marginBottom:10}}>
                        <Mono color={C.em} size={9}>
                          DERNIER MEETING — {lastMeeting.savedAt}
                        </Mono>
                        <RiskBadge level={lastAnalysis.overallRisk||"Faible"}/>
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>
                        {lastAnalysis.meetingTitle}
                      </div>

                      {/* Key signals from last meeting */}
                      {(lastAnalysis.risks||[]).length > 0 && (
                        <div style={{marginBottom:12}}>
                          <Mono color={C.red} size={8}>RISQUES IDENTIFIÉS</Mono>
                          {lastAnalysis.risks.slice(0,3).map((r,i) => (
                            <div key={i} style={{display:"flex",gap:8,marginTop:7,
                                                  padding:"7px 10px",
                                                  background:C.red+"10",borderRadius:7}}>
                              <span style={{color:C.red,fontFamily:"'DM Mono',monospace",
                                             fontSize:10,flexShrink:0,marginTop:2}}>
                                {String(i+1).padStart(2,"0")}
                              </span>
                              <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>
                                {r.risk||r}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions from last meeting — to follow up on */}
                      {(lastAnalysis.actions||[]).length > 0 && (
                        <div style={{marginBottom:12}}>
                          <Mono color={C.amber} size={8}>ACTIONS — À VÉRIFIER CE MEETING</Mono>
                          {lastAnalysis.actions.slice(0,4).map((a,i) => (
                            <div key={i} style={{display:"flex",alignItems:"center",
                                                  gap:8,marginTop:6,padding:"7px 10px",
                                                  background:C.amber+"10",borderRadius:7}}>
                              <span style={{fontSize:12,color:C.textM,flex:1}}>
                                {a.action||a}
                              </span>
                              {a.delay && <Badge label={a.delay} color={C.amber} size={9}/>}
                              {a.owner && <Badge label={a.owner} color={C.blue} size={9}/>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Suggested questions from last analysis */}
                      {(lastAnalysis.questions||[]).length > 0 && (
                        <div>
                          <Mono color={C.blue} size={8}>QUESTIONS DU DERNIER MEETING — À FAIRE ÉVOLUER</Mono>
                          {lastAnalysis.questions.slice(0,3).map((q,i) => (
                            <div key={i} style={{display:"flex",gap:8,marginTop:6}}>
                              <span style={{color:C.blue,fontFamily:"'DM Mono',monospace",
                                             fontSize:10,flexShrink:0,marginTop:2}}>
                                Q{i+1}
                              </span>
                              <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>
                                {q.question||q}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* All past meetings — collapsible timeline */}
                  <Mono color={C.textD} size={9}>TOUS LES MEETINGS ({histCount})</Mono>
                  <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:7}}>
                    {managerHistory.map((m,i) => {
                      const a = m.analysis || {};
                      const r = RISK[a.overallRisk] || RISK["Faible"];
                      const open = histExp[i];
                      return (
                        <div key={i} style={{background:C.surfL,
                                              border:`1px solid ${open?r.color+"50":C.border}`,
                                              borderRadius:9,overflow:"hidden",
                                              transition:"border-color .15s"}}>
                          <button onClick={()=>setHistExp(p=>({...p,[i]:!p[i]}))}
                            style={{width:"100%",background:"none",border:"none",
                                    padding:"11px 13px",display:"flex",
                                    alignItems:"center",gap:10,cursor:"pointer",
                                    fontFamily:"'DM Sans',sans-serif"}}>
                            <div style={{width:7,height:7,borderRadius:"50%",
                                          background:r.color,flexShrink:0}}/>
                            <span style={{fontSize:13,color:C.text,flex:1,textAlign:"left",
                                           fontWeight:500}}>
                              {a.meetingTitle||"Meeting"}
                            </span>
                            <RiskBadge level={a.overallRisk||"Faible"}/>
                            <Mono color={C.textD} size={8}>{m.savedAt}</Mono>
                            <span style={{color:C.textD,fontSize:12,marginLeft:4}}>
                              {open?"▲":"▼"}
                            </span>
                          </button>
                          {open && (
                            <div style={{padding:"0 13px 12px",
                                          borderTop:`1px solid ${C.border}`}}>
                              {(a.summary||[]).map((s,j) => (
                                <div key={j} style={{display:"flex",gap:8,marginTop:8}}>
                                  <div style={{width:4,height:4,borderRadius:"50%",
                                                background:C.em,marginTop:7,flexShrink:0}}/>
                                  <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>
                                    {s}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{marginTop:14,display:"flex",gap:10}}>
                    <button onClick={()=>setPTab("prep")}
                      style={{...css.btn(C.em),flex:1}}>
                      🎯 Générer les questions avec cet historique →
                    </button>
                    <button onClick={()=>onNavigate("meetings")}
                      style={{...css.btn(C.blue,true),padding:"9px 16px",fontSize:13}}>
                      ⚡ Analyser nouveau transcript
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ PREP ════════════════ */}
          {pTab==="prep" && (
            <div>
              {/* Empty state */}
              {!prep && !prepLoading && (
                <div style={{background:C.surfL,border:`2px dashed ${C.border}`,
                              borderRadius:12,padding:"32px 24px",textAlign:"center",
                              marginBottom:16}}>
                  <div style={{fontSize:32,marginBottom:10}}>🎯</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>
                    Questions non générées
                  </div>
                  <div style={{fontSize:12,color:C.textD,marginBottom:16,maxWidth:420,margin:"0 auto 16px"}}>
                    {histCount > 0
                      ? `L'IA va s'appuyer sur les ${histCount} meeting(s) avec ${ctx.managerName||"ce gestionnaire"} pour personnaliser les questions et faire des liens avec les enjeux non résolus.`
                      : "Remplis le contexte puis génère des questions stratégiques pour ce 1:1."}
                  </div>
                  <button onClick={generatePrep} disabled={!ctx.managerName}
                    style={{...css.btn(!ctx.managerName?C.textD:C.em),
                              opacity:!ctx.managerName?.5:1}}>
                    {histCount > 0
                      ? `✦ Générer avec l'historique (${histCount} meetings)`
                      : "✦ Générer les questions"}
                  </button>
                </div>
              )}

              {prepLoading && <AILoader label="Génération des questions…"/>}

              {/* Follow-up from last meeting — highest priority */}
              {prep?.followUp?.length > 0 && (
                <div style={{...css.card,borderLeft:`3px solid ${C.purple}`,marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <span style={{fontSize:14}}>🔁</span>
                    <Mono color={C.purple} size={9}>
                      SUIVI DU DERNIER MEETING — PRIORITÉ HAUTE
                    </Mono>
                    <Badge label="Basé sur l'historique" color={C.purple}/>
                  </div>
                  {prep.followUp.map((q,i) => (
                    <div key={i} style={{display:"flex",gap:10,marginBottom:10,
                                          padding:"10px 12px",
                                          background:C.purple+"12",borderRadius:8}}>
                      <span style={{color:C.purple,fontFamily:"'DM Mono',monospace",
                                     fontSize:10,marginTop:2,flexShrink:0}}>
                        {String(i+1).padStart(2,"0")}
                      </span>
                      <span style={{fontSize:13,color:C.text,lineHeight:1.5,fontWeight:500}}>
                        {q}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* All question categories */}
              {(prep || !prepLoading) && prep && (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {PREP_CATS.map(cat => (
                    <div key={cat.key}
                      style={{...css.card,borderLeft:`3px solid ${cat.color}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                        <span style={{fontSize:14}}>{cat.icon}</span>
                        <Mono color={cat.color} size={9}>{cat.label}</Mono>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {(questions[cat.key]||[]).map((item,i) => (
                          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                            <span style={{color:cat.color,
                                           fontFamily:"'DM Mono',monospace",
                                           fontSize:10,marginTop:3,flexShrink:0}}>
                              {String(i+1).padStart(2,"0")}
                            </span>
                            <span style={{fontSize:13,color:C.text,lineHeight:1.5}}>
                              {item}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {prep && (
                <div style={{marginTop:14,padding:"11px 14px",
                              background:C.em+"10",
                              border:`1px solid ${C.em}33`,borderRadius:8,
                              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:C.em}}>
                    ✅ Questions prêtes. Fais ton meeting, puis reviens analyser le transcript.
                  </span>
                  <button onClick={()=>onNavigate("meetings")}
                    style={{...css.btn(C.em),padding:"7px 14px",fontSize:12}}>
                    ⚡ Aller analyser →
                  </button>
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
                    style={{background:C.surfL,
                              border:`1px solid ${sigExp[cat.key]?cat.color+"60":C.border}`,
                              borderLeft:`3px solid ${cat.color}`,
                              borderRadius:10,overflow:"hidden",transition:"border-color .2s"}}>
                    <button onClick={()=>setSigExp(p=>({...p,[cat.key]:!p[cat.key]}))}
                      style={{width:"100%",background:"none",border:"none",
                               padding:"12px 14px",display:"flex",alignItems:"center",
                               justifyContent:"space-between",cursor:"pointer",
                               fontFamily:"'DM Sans',sans-serif"}}>
                      <div style={{display:"flex",alignItems:"center",gap:9}}>
                        <span style={{fontSize:15}}>{cat.icon}</span>
                        <span style={{fontSize:13,fontWeight:600,color:C.text}}>
                          {cat.label}
                        </span>
                      </div>
                      <span style={{color:cat.color,fontSize:14,fontWeight:700}}>
                        {sigExp[cat.key]?"−":"+"}
                      </span>
                    </button>
                    {sigExp[cat.key] && (
                      <div style={{padding:"0 13px 12px"}}>
                        {SIGNALS_DB[cat.key].map((sig,i) => (
                          <div key={i} style={{display:"flex",gap:8,marginBottom:7}}>
                            <div style={{width:5,height:5,borderRadius:"50%",
                                          background:cat.color,marginTop:7,flexShrink:0}}/>
                            <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{sig}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Observation grid */}
              <div style={{...css.card,borderLeft:`3px solid ${C.em}`}}>
                <Mono color={C.em} size={9}>GRILLE D'OBSERVATION — PENDANT LA RENCONTRE</Mono>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",
                              gap:12,marginTop:12}}>
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
                <div key={cat.key}
                  style={{...css.card,borderLeft:`3px solid ${cat.color}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <span style={{fontSize:15}}>{cat.icon}</span>
                    <div style={{fontSize:14,fontWeight:700,color:C.text}}>{cat.label}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {GUIDANCE_DB[cat.key].map((tip,i) => (
                      <div key={i}
                        style={{background:cat.color+"08",
                                  border:`1px solid ${cat.color}25`,
                                  borderRadius:8,padding:"11px 12px",
                                  display:"flex",gap:9}}>
                        <span style={{color:cat.color,
                                       fontFamily:"'DM Mono',monospace",
                                       fontSize:10,marginTop:2,flexShrink:0}}>
                          {String(i+1).padStart(2,"0")}
                        </span>
                        <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ════════════════ NOTES ════════════════ */}
          {pTab==="notes" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {NOTE_CATS.map(cat => (
                  <div key={cat.key}
                    style={{...css.card,borderLeft:`3px solid ${cat.color}`}}>
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
              <div style={{marginTop:12,padding:"10px 14px",
                            background:C.teal+"10",
                            border:`1px solid ${C.teal}33`,borderRadius:8}}>
                <span style={{fontSize:11,color:C.teal}}>
                  💾 Ces notes sont indépendantes du transcript. Génère l'output pour les consolider.
                  Si tu as analysé le transcript dans Meetings, les deux analyses se complètent.
                </span>
              </div>
            </div>
          )}

          {/* ════════════════ OUTPUT ════════════════ */}
          {pTab==="output" && (
            <div>
              {outputLoading && <AILoader label="Génération du compte-rendu…"/>}

              {!output && !outputLoading && (
                <div style={{background:C.surfL,border:`2px dashed ${C.border}`,
                              borderRadius:12,padding:"48px 24px",textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:12}}>📊</div>
                  <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>
                    Aucun output généré
                  </div>
                  <div style={{fontSize:12,color:C.textD,maxWidth:400,margin:"0 auto 16px"}}>
                    Complète les notes pendant ou après le meeting, puis génère le compte-rendu.
                    Cet output deviendra le contexte de ton prochain 1:1 avec ce gestionnaire.
                  </div>
                  <button onClick={generateOutput}
                    style={{...css.btn(C.em)}}>
                    ✦ Générer le compte-rendu
                  </button>
                </div>
              )}

              {output && (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {/* Summary + risk */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12}}>
                    <div style={{...css.card,
                                  borderLeft:`3px solid ${RISK_C[output.overallRisk]||C.em}`}}>
                      <Mono color={C.em} size={9}>RÉSUMÉ EXÉCUTIF</Mono>
                      <p style={{fontSize:13,color:C.text,margin:"10px 0 0",lineHeight:1.7}}>
                        {output.executiveSummary}
                      </p>
                    </div>
                    <div style={{background:(RISK_C[output.overallRisk]||C.em)+"18",
                                  border:`2px solid ${RISK_C[output.overallRisk]||C.em}`,
                                  borderRadius:10,padding:"16px 20px",
                                  textAlign:"center",minWidth:110,flexShrink:0}}>
                      <Mono color={RISK_C[output.overallRisk]||C.em} size={9}>RISQUE</Mono>
                      <div style={{fontSize:18,fontWeight:800,
                                    color:RISK_C[output.overallRisk]||C.em,marginTop:8}}>
                        {output.overallRisk}
                      </div>
                    </div>
                  </div>

                  {/* 4-quadrant cards */}
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
                              <div style={{width:5,height:5,borderRadius:"50%",
                                            background:color,marginTop:6,flexShrink:0}}/>
                              <span style={{fontSize:12,color:C.textM,lineHeight:1.5}}>
                                {item}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action plan */}
                  <div style={{...css.card,borderLeft:`3px solid ${C.em}`}}>
                    <Mono color={C.em} size={9}>PLAN D'ACTION</Mono>
                    <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:7}}>
                      {(output.actionPlan||[]).map((a,i) => (
                        <div key={i}
                          style={{display:"flex",alignItems:"center",gap:10,
                                   padding:"9px 11px",background:C.surfLL,
                                   borderRadius:8,border:`1px solid ${C.border}`}}>
                          <span style={{color:C.em,fontFamily:"'DM Mono',monospace",
                                         fontSize:10,flexShrink:0}}>
                            {String(i+1).padStart(2,"0")}
                          </span>
                          <span style={{fontSize:13,color:C.text,flex:1}}>{a.action}</span>
                          <Badge label={a.owner} color={C.blue} size={10}/>
                          <Badge label={a.delay} color={C.teal} size={10}/>
                          <Badge label={a.priority}
                            color={a.priority==="Critique"||a.priority==="Elevee"
                              ?C.red:a.priority==="Élevée"?C.red
                              :C.textD}
                            size={10}/>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── STRATÉGIE HRBP ── */}
                  {output.strategieHRBP && (() => {
                    const s = output.strategieHRBP;
                    const postureColor = {
                      "Coach": C.em, "Challenge": C.amber,
                      "Directif": C.red, "Escalader": "#7a1e2e"
                    }[s.postureHRBP?.mode] || C.purple;
                    const perfColor = { "Forte":C.em, "Correcte":C.blue, "A risque":C.amber, "Critique":C.red }[s.santeEquipe?.performance] || C.textD;
                    const engColor  = { "Eleve":C.em, "Modere":C.blue, "Fragile":C.amber, "Critique":C.red }[s.santeEquipe?.engagement] || C.textD;
                    const riskColor = { "Critique":C.red, "Eleve":C.amber, "Modere":C.blue, "Faible":C.textD }[s.risqueCle?.niveau] || C.textD;
                    return (
                    <div style={{ border:`2px solid ${C.purple}40`, borderRadius:11,
                      background:C.purple+"06", overflow:"hidden" }}>
                      {/* Header */}
                      <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.purple}25`,
                        display:"flex", alignItems:"center", gap:10,
                        background:C.purple+"10" }}>
                        <div style={{ width:28, height:28, background:C.purple, borderRadius:6,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:14, flexShrink:0 }}>🧠</div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:C.purple }}>Stratégie HRBP</div>
                          <div style={{ fontSize:10, color:C.textD, fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>ANALYSE STRATÉGIQUE — AVANT LE MEETING</div>
                        </div>
                      </div>

                      <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>

                        {/* Lecture gestionnaire */}
                        {s.lectureGestionnaire && (
                          <div>
                            <Mono color={C.purple} size={9}>LECTURE DU GESTIONNAIRE</Mono>
                            <div style={{ marginTop:8, display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-start" }}>
                              <div style={{ background:C.purple+"18", border:`1px solid ${C.purple}40`,
                                borderRadius:7, padding:"5px 12px", fontSize:12,
                                color:C.purple, fontWeight:600 }}>
                                {s.lectureGestionnaire.style}
                              </div>
                            </div>
                            {s.lectureGestionnaire.forces?.length > 0 && (
                              <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:5 }}>
                                {s.lectureGestionnaire.forces.map((f,i) => (
                                  <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                                    <span style={{ color:C.em, fontSize:11, flexShrink:0, marginTop:2 }}>+</span>
                                    <span style={{ fontSize:12, color:C.textM, lineHeight:1.6 }}>{f}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {s.lectureGestionnaire.angles && (
                              <div style={{ marginTop:8, padding:"7px 10px", background:C.purple+"10",
                                borderRadius:7, fontSize:12, color:C.text, lineHeight:1.6 }}>
                                <span style={{ color:C.purple, fontWeight:600 }}>Angle → </span>
                                {s.lectureGestionnaire.angles}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Santé équipe */}
                        {s.santeEquipe && (
                          <div>
                            <Mono color={C.purple} size={9}>SANTÉ DE L'ÉQUIPE</Mono>
                            <div style={{ marginTop:8, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                              <div style={{ display:"flex", gap:6, alignItems:"center",
                                padding:"5px 11px", borderRadius:7, background:perfColor+"15",
                                border:`1px solid ${perfColor}35` }}>
                                <span style={{ fontSize:10, color:C.textD, fontFamily:"'DM Mono',monospace" }}>PERF</span>
                                <span style={{ fontSize:12, fontWeight:700, color:perfColor }}>{s.santeEquipe.performance}</span>
                              </div>
                              <div style={{ display:"flex", gap:6, alignItems:"center",
                                padding:"5px 11px", borderRadius:7, background:engColor+"15",
                                border:`1px solid ${engColor}35` }}>
                                <span style={{ fontSize:10, color:C.textD, fontFamily:"'DM Mono',monospace" }}>ENG</span>
                                <span style={{ fontSize:12, fontWeight:700, color:engColor }}>{s.santeEquipe.engagement}</span>
                              </div>
                            </div>
                            {s.santeEquipe.dynamique && (
                              <div style={{ marginTop:8, fontSize:12, color:C.textM, lineHeight:1.6 }}>
                                {s.santeEquipe.dynamique}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Risque clé */}
                        {s.risqueCle && (
                          <div style={{ padding:"10px 12px", background:riskColor+"10",
                            border:`1px solid ${riskColor}30`, borderRadius:8 }}>
                            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
                              <Mono color={riskColor} size={9}>RISQUE CLÉ</Mono>
                              <div style={{ background:riskColor+"20", border:`1px solid ${riskColor}50`,
                                borderRadius:5, padding:"2px 8px", fontSize:10,
                                fontWeight:700, color:riskColor }}>
                                {s.risqueCle.niveau}
                              </div>
                              <div style={{ fontSize:12, fontWeight:600, color:riskColor }}>
                                {s.risqueCle.nature}
                              </div>
                            </div>
                            {s.risqueCle.rationale && (
                              <div style={{ fontSize:12, color:C.textM }}>{s.risqueCle.rationale}</div>
                            )}
                          </div>
                        )}

                        {/* Posture + Stratégie côte à côte */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          {s.postureHRBP && (
                            <div>
                              <Mono color={C.purple} size={9}>POSTURE HRBP</Mono>
                              <div style={{ marginTop:8, display:"flex", gap:8, alignItems:"center",
                                padding:"8px 12px", background:postureColor+"15",
                                border:`2px solid ${postureColor}50`, borderRadius:8 }}>
                                <span style={{ fontSize:18, flexShrink:0 }}>
                                  {{"Coach":"🎯","Challenge":"⚡","Directif":"🔴","Escalader":"🚨"}[s.postureHRBP.mode]||"🧠"}
                                </span>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:700, color:postureColor }}>{s.postureHRBP.mode}</div>
                                  {s.postureHRBP.justification && (
                                    <div style={{ fontSize:11, color:C.textM, lineHeight:1.5, marginTop:2 }}>
                                      {s.postureHRBP.justification}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                          {s.objectifRencontre && (
                            <div>
                              <Mono color={C.purple} size={9}>OBJECTIF MEETING</Mono>
                              <div style={{ marginTop:8, padding:"8px 12px",
                                background:C.em+"10", border:`1px solid ${C.em}30`,
                                borderRadius:8, fontSize:12, color:C.text,
                                lineHeight:1.65 }}>
                                {s.objectifRencontre}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Stratégie d'influence */}
                        {s.strategieInfluence && (
                          <div>
                            <Mono color={C.purple} size={9}>STRATÉGIE D'INFLUENCE</Mono>
                            <div style={{ marginTop:8, padding:"9px 12px",
                              background:C.purple+"10", border:`1px solid ${C.purple}25`,
                              borderRadius:8, fontSize:12, color:C.text, lineHeight:1.7,
                              fontStyle:"italic" }}>
                              "{s.strategieInfluence}"
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                    );
                  })()}

                  {/* ── CYCLE CLOSER ── */}
                  <div style={{padding:"16px 18px",
                                background:C.purple+"18",
                                border:`2px solid ${C.purple}40`,
                                borderRadius:11}}>
                    <div style={{display:"flex",alignItems:"flex-start",
                                  justifyContent:"space-between",gap:16}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,
                                      color:C.purple,marginBottom:5}}>
                          🔄 Préparer le prochain 1:1 avec cet output
                        </div>
                        <div style={{fontSize:12,color:C.textD,marginBottom:10}}>
                          {output.nextMeetingContext
                            ? output.nextMeetingContext
                            : "Les risques, signaux et questions de suivi seront injectés comme contexte dans le prochain cycle."}
                        </div>
                        {output.nextMeetingQuestions?.length > 0 && (
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {output.nextMeetingQuestions.map((q,i) => (
                              <div key={i}
                                style={{background:C.purple+"20",
                                          border:`1px solid ${C.purple}40`,
                                          borderRadius:6,padding:"4px 10px",
                                          fontSize:11,color:C.purple}}>
                                {q.length > 55 ? q.substring(0,55)+"…" : q}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={startNextCycle}
                        style={{...css.btn(C.purple),padding:"10px 18px",
                                  fontSize:13,whiteSpace:"nowrap",flexShrink:0}}>
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



// ══════════════════════════════════════════════════════════════════════════════
// MODULE: HRBP COPILOT
// ══════════════════════════════════════════════════════════════════════════════

const COPILOT_SP = `You are the embedded strategic intelligence layer of my HRBP OS.

You are not a generic HR assistant.

You operate as a Senior HR Business Partner in a fast-paced IT / corporate environment (Quebec / Canada context), with full visibility on ongoing cases, signals, history, and internal playbooks.

Your role is to think, diagnose, and act using ALL available context — not just the current input.

---

# CORE PRINCIPLE

Never analyze a situation in isolation.

Always integrate:

* active cases
* past patterns
* signals
* manager behavior over time
* existing actions and follow-ups
* internal HRBP playbooks and knowledge

You must behave like a HRBP who has been following these situations for months.

---

# INPUT CONTEXT

You will receive structured context in this format:

## ACTIVE CASES

[List of ongoing HR cases]

## SIGNALS

[Weak signals, employee feedback, manager behavior indicators]

## RECENT HISTORY

[Recent meetings, decisions, coaching interactions]

## OPEN ACTIONS / FOLLOW-UPS

[Actions that were supposed to be done, deadlines, status]

## INTERNAL PLAYBOOKS

[Relevant HRBP playbooks / workshop frameworks]

## KNOWLEDGE BASE (IF RELEVANT)

[Legal, performance, compensation, immigration, etc.]

## USER SITUATION

[The current situation to analyze]

---

# YOUR MISSION

You must:

1. Analyze the situation
2. Cross-reference ALL available context
3. Detect patterns, inconsistencies, or escalation
4. Match the situation to the most relevant internal playbook(s)
5. Apply those frameworks
6. Produce a clear, high-judgment HRBP recommendation

---

# REQUIRED THINKING PROCESS

You MUST think through:

* Is this an isolated issue or part of a pattern?
* Is the real problem the employee, the manager, or the system?
* What has already been tried?
* What has NOT been done that should have been done?
* Is there avoidance, delay, or denial happening?
* What risk is increasing over time?

---

# PLAYBOOK MATCHING (MANDATORY)

You must explicitly identify:

* Primary playbook
* Secondary playbook (if applicable)
* Supporting knowledge area

If the situation matches a known pattern, you MUST say it clearly.

Example:
"This is not a new issue — this matches a 'manager avoiding difficult conversations' pattern already visible in previous cases."

---

# PATTERN DETECTION (CRITICAL)

You must actively look for:

* Repeated manager behavior
* Multiple similar cases
* Signals that confirm escalation
* Lack of follow-through on actions
* Misalignment between what was said and what was done

If a pattern exists, you must say it clearly and directly.

---

# ACCOUNTABILITY LOGIC

You must clearly distinguish:

* What is HRBP responsibility
* What is manager responsibility
* What should NOT be owned by HR

If a manager is avoiding, minimizing, or delaying:
→ call it out directly

---

# RESPONSE FORMAT (MANDATORY)

## 1. Diagnostic

* What is really happening
* Root cause vs symptom
* Pattern vs isolated issue

## 2. Context insight

* What in the cases, signals, or history changes the interpretation
* What is new vs what is repeating

## 3. Best internal match

* Primary playbook
* Secondary playbook / knowledge
* Why these apply

## 4. Risk assessment

* People risk
* Managerial risk
* Organizational risk
* Legal / compliance risk (if relevant)
* Time sensitivity (is this getting worse?)

## 5. HRBP posture

* What I must own
* What the manager must own
* Where I need to push or challenge

## 6. Recommended intervention

* What to do now (immediate)
* What to do this week
* What to do next
* What must stop immediately

## 7. Suggested wording (French)

Give concrete, realistic HRBP language for the next conversation.

Be direct, not overly diplomatic.

## 8. Watchouts

* Signals to monitor
* Mistakes to avoid
* Escalation triggers

---

# BEHAVIOR RULES

* Do NOT give generic HR advice
* Do NOT ignore past context
* Do NOT stay neutral if the situation requires escalation
* Do NOT over-coach when discipline is needed
* Do NOT over-focus on policy when the issue is managerial behavior
* Do NOT soften reality unnecessarily

You are allowed to challenge assumptions.

---

# PRIORITY ORDER

When in doubt, prioritize:

1. Legal / compliance reality
2. Pattern detection
3. Manager accountability
4. Organizational risk
5. Employee experience
6. Communication style

---

# FINAL MINDSET

You are not here to provide options.

You are here to help me take the right decision, at the right time, with the full context of my HRBP OS.

Be sharp, structured, and decisive.`;

function ModuleCopilot({ data }) {
  const [situation, setSituation]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [response, setResponse]     = useState(null);
  const [error, setError]           = useState("");
  const [history, setHistory]       = useState([]);
  const [copied, setCopied]         = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const responseRef = useRef(null);

  // Build rich context from all OS data
  const buildContext = () => {
    const cases      = data.cases      || [];
    const meetings   = data.meetings   || [];
    const signals    = data.signals    || [];
    const decisions  = data.decisions  || [];
    const coaching   = data.coaching   || [];
    const prep1on1   = data.prep1on1   || [];

    const activeCases = cases.filter(c => c.status === "active" || c.status === "open");
    const recentMeetings = meetings.slice().reverse().slice(0, 8);
    const recentSignals  = signals.slice().reverse().slice(0, 6);

    // Active cases
    const casesCtx = activeCases.length > 0
      ? activeCases.map(c =>
          `- [${c.type?.toUpperCase()||"CASE"}] ${c.title} | Risk: ${c.riskLevel} | Status: ${c.status}\n  Situation: ${c.situation||""}\n  Interventions: ${c.interventionsDone||"none"}\n  HR Position: ${c.hrPosition||""}\n  Next follow-up: ${c.nextFollowUp||"not set"}`
        ).join("\n")
      : "No active cases.";

    // Signals
    const signalsCtx = recentSignals.length > 0
      ? recentSignals.map(s =>
          `- [${s.analysis?.category||"SIGNAL"}] ${s.analysis?.title||""} (${s.analysis?.severity||""}) — ${fmtDate(s.savedAt)}\n  ${s.analysis?.interpretation||""}`
        ).join("\n")
      : "No recent signals.";

    // Recent meetings — include analysis summary
    const meetingsCtx = recentMeetings.length > 0
      ? recentMeetings.map(m => {
          const a = m.analysis || {};
          const actions = (a.actions||[]).map(x => `${x.action} [${x.owner}/${x.delay}]`).join("; ");
          return `- [${m.meetingType?.toUpperCase()||"MEETING"}] ${a.meetingTitle||""} — ${m.director||""} (${fmtDate(m.savedAt)})\n  Risk: ${a.overallRisk||""} — ${a.overallRiskRationale||""}\n  Summary: ${(a.summary||[]).join(" | ")}\n  Actions: ${actions||"none"}`;
        }).join("\n")
      : "No recent meetings.";

    // Open actions from meetings
    const openActions = recentMeetings.flatMap(m =>
      (m.analysis?.actions||[]).map(a => `- ${a.action} [${a.owner} / ${a.delay}] — from meeting: ${m.analysis?.meetingTitle||""} (${fmtDate(m.savedAt)})`)
    );
    const actionsCtx = openActions.length > 0 ? openActions.slice(0, 12).join("\n") : "No tracked open actions.";

    // Coaching
    const coachingCtx = (coaching||[]).slice(-3).map(c =>
      `- ${c.scenario||""} — ${fmtDate(c.savedAt)}`
    ).join("\n") || "None.";

    // 1:1 prep recent outputs
    const prepCtx = (prep1on1||[]).slice(-3).map(p => {
      const o = p.output || {};
      return `- 1:1 with ${p.managerName||""} (${fmtDate(p.savedAt)}): Risk ${o.overallRisk||""} — ${o.executiveSummary||""}`;
    }).join("\n") || "None.";

    // Workshop playbooks — list available
    const playbooksCtx = WORKSHOP_DB.map(w => `- ${w.title} [${w.category}]`).join("\n");

    return `## ACTIVE CASES (${activeCases.length})
${casesCtx}

## SIGNALS (last ${recentSignals.length})
${signalsCtx}

## RECENT HISTORY — MEETINGS (last ${recentMeetings.length})
${meetingsCtx}

## OPEN ACTIONS / FOLLOW-UPS
${actionsCtx}

## RECENT COACHING
${coachingCtx}

## RECENT 1:1 PREP OUTPUTS
${prepCtx}

## INTERNAL PLAYBOOKS AVAILABLE
${playbooksCtx}`;
  };

  const analyze = async () => {
    if (!situation.trim()) return;
    const ctx = buildContext();
    const _copProv = data.profile?.defaultProvince || "QC";
    const _copLegal = isLegalSensitive(situation)
      ? `\n\n## CADRE LEGAL\n\n${buildLegalPromptContext(_copProv)}` : "";
    const userMsg = `${ctx}${_copLegal}\n\n---\n\n## USER SITUATION\n\n${situation.trim()}`;
    setLoading(true); setError(""); setResponse(null);
    try {
      const text = await callAIText(COPILOT_SP, userMsg, 4000);
      setResponse(text);
      setHistory(h => [{ situation: situation.trim(), response: text, ts: new Date().toISOString() }, ...h.slice(0, 9)]);
      setTimeout(() => responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch(e) { setError("Erreur: " + e.message); }
    finally { setLoading(false); }
  };

  const importCopilotResponse = (text) => {
    setResponse(text);
    setHistory(h => [{ situation: situation.trim(), response: text, ts: new Date().toISOString() }, ...h.slice(0, 9)]);
    setTimeout(() => responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const copyResponse = () => {
    if (!response) return;
    const ta = document.createElement("textarea");
    ta.value = response;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  // Parse markdown-style sections from response
  const renderResponse = (text) => {
    if (!text) return null;
    const sections = [];
    const lines = text.split("\n");
    let current = null;
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (current) sections.push(current);
        current = { heading: line.replace(/^##\s*/, ""), lines: [] };
      } else if (current) {
        current.lines.push(line);
      } else {
        if (!current) current = { heading: null, lines: [] };
        current.lines.push(line);
      }
    }
    if (current) sections.push(current);

    const SECTION_COLORS = {
      "1.": C.blue, "2.": C.purple, "3.": C.teal,
      "4.": C.red, "5.": C.amber, "6.": C.em,
      "7.": C.purple, "8.": C.amber,
    };
    const getColor = (heading) => {
      if (!heading) return C.em;
      const key = Object.keys(SECTION_COLORS).find(k => heading.startsWith(k));
      return key ? SECTION_COLORS[key] : C.em;
    };

    return sections.map((sec, i) => {
      const color = getColor(sec.heading);
      const body = sec.lines.join("\n").trim();
      if (!body && !sec.heading) return null;
      return (
        <div key={i} style={{ marginBottom: sec.heading ? 12 : 0 }}>
          {sec.heading && (
            <div style={{ display:"flex", alignItems:"center", gap:8,
              marginBottom:8, paddingBottom:6, borderBottom:`1px solid ${color}30` }}>
              <Mono color={color} size={10}>{sec.heading}</Mono>
            </div>
          )}
          {body && (
            <div style={{ fontSize:13, color:C.text, lineHeight:1.8, whiteSpace:"pre-wrap" }}>
              {body.split("\n").map((line, j) => {
                if (line.startsWith("* ") || line.startsWith("- ")) {
                  return (
                    <div key={j} style={{ display:"flex", gap:10, marginBottom:5, alignItems:"flex-start" }}>
                      <span style={{ color, flexShrink:0, marginTop:3, fontSize:10 }}>▸</span>
                      <span style={{ lineHeight:1.7 }}>{line.replace(/^[*-]\s*/, "")}</span>
                    </div>
                  );
                }
                if (line.startsWith("→ ")) {
                  return (
                    <div key={j} style={{ padding:"6px 10px", background:color+"10",
                      borderLeft:`2px solid ${color}`, borderRadius:"0 6px 6px 0",
                      marginBottom:5, fontSize:12, color:C.text }}>
                      {line}
                    </div>
                  );
                }
                if (/^\*\*.*\*\*/.test(line)) {
                  return <div key={j} style={{ fontWeight:700, color:C.text, marginBottom:3 }}>
                    {line.replace(/\*\*(.*?)\*\*/g, "$1")}
                  </div>;
                }
                if (line.trim() === "") return <div key={j} style={{ height:6 }}/>;
                return <div key={j} style={{ marginBottom:3 }}>{line}</div>;
              })}
            </div>
          )}
        </div>
      );
    }).filter(Boolean);
  };

  // Counts for context summary
  const activeCasesCount  = (data.cases||[]).filter(c => c.status==="active"||c.status==="open").length;
  const meetingsCount     = (data.meetings||[]).length;
  const signalsCount      = (data.signals||[]).length;
  const total             = activeCasesCount + meetingsCount + signalsCount;

  return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
          <div style={{ width:34, height:34, background:C.em, borderRadius:8,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>⚡</div>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:C.text }}>HRBP Copilot</div>
            <div style={{ fontSize:12, color:C.textM }}>Intelligence stratégique avec accès complet au contexte du OS</div>
          </div>
        </div>

        {/* Context summary bar */}
        <button onClick={() => setContextExpanded(v => !v)}
          style={{ width:"100%", display:"flex", alignItems:"center", gap:12,
            padding:"10px 14px", background:C.surfL, border:`1px solid ${C.border}`,
            borderRadius:8, cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
            marginTop:10, textAlign:"left" }}>
          <span style={{ fontSize:11, color:C.textD, fontFamily:"'DM Mono',monospace", letterSpacing:1, textTransform:"uppercase" }}>
            Contexte injecté
          </span>
          <div style={{ display:"flex", gap:8, flex:1 }}>
            {[
              { label:`${activeCasesCount} cas actifs`,  color:C.em },
              { label:`${meetingsCount} meetings`,        color:C.blue },
              { label:`${signalsCount} signaux`,          color:C.purple },
              { label:`${(data.prep1on1||[]).length} preps 1:1`, color:C.teal },
            ].map((item,i) => (
              <span key={i} style={{ background:item.color+"18", border:`1px solid ${item.color}30`,
                color:item.color, borderRadius:5, padding:"2px 8px",
                fontSize:10, fontWeight:600, fontFamily:"'DM Mono',monospace" }}>
                {item.label}
              </span>
            ))}
          </div>
          <span style={{ fontSize:11, color:C.textD, flexShrink:0 }}>
            {contextExpanded ? "▲ Masquer" : "▼ Voir le contexte"}
          </span>
        </button>

        {contextExpanded && (
          <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8,
            padding:"14px 16px", marginTop:4, fontSize:11, color:C.textD,
            fontFamily:"'DM Mono',monospace", lineHeight:1.8, maxHeight:280,
            overflowY:"auto", whiteSpace:"pre-wrap" }}>
            {buildContext()}
          </div>
        )}
      </div>

      {/* Input */}
      <Card style={{ marginBottom:14, borderLeft:`3px solid ${C.em}` }}>
        <Mono color={C.em} size={9}>SITUATION — Décris ce qui se passe</Mono>
        <textarea
          rows={5}
          value={situation}
          onChange={e => setSituation(e.target.value)}
          placeholder={"Ex: Mon gestionnaire TI refuse depuis 3 mois de documenter les problèmes de performance de son analyste senior. À chaque discussion, il dit que ça s'améliore, mais l'équipe me remonte que la situation empire. J'ai un signal reçu la semaine passée d'un pair qui dit vouloir quitter à cause de lui..."}
          style={{ ...css.textarea, marginTop:10, fontSize:13, lineHeight:1.7 }}
          onFocus={e=>e.target.style.borderColor=C.em+"60"}
          onBlur={e=>e.target.style.borderColor=C.border}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) analyze(); }}
        />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
          <span style={{ fontSize:11, color:C.textD }}>Cmd/Ctrl + Enter pour analyser</span>
          {loading ? (
            <AILoader label="Analyse en cours…"/>
          ) : (
            <button onClick={analyze} disabled={!situation.trim()}
              style={{ ...css.btn(situation.trim() ? C.em : C.textD),
                padding:"10px 24px", fontSize:13,
                opacity: situation.trim() ? 1 : 0.5,
                boxShadow: situation.trim() ? `0 4px 20px ${C.em}30` : "none" }}>
              ⚡ Analyser
            </button>
          )}
        </div>
      </Card>

      {error && (
        <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
          padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {error}</div>
      )}

      {/* Response */}
      {response && (
        <div ref={responseRef}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <Mono color={C.em} size={9}>Analyse HRBP</Mono>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={copyResponse}
                style={{ ...css.btn(copied ? C.em : C.textM, true), padding:"6px 12px", fontSize:11 }}>
                {copied ? "✓ Copié" : "📋 Copier"}
              </button>
              <button onClick={() => { setResponse(null); setSituation(""); }}
                style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>
                ↺ Nouvelle analyse
              </button>
            </div>
          </div>
          <Card style={{ borderLeft:`3px solid ${C.em}` }}>
            {renderResponse(response)}
          </Card>
        </div>
      )}

      {/* History */}
      {history.length > 1 && !response && (
        <div style={{ marginTop:24 }}>
          <Mono color={C.textD} size={9}>Analyses précédentes — cette session</Mono>
          <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>
            {history.slice(1).map((h,i) => (
              <button key={i}
                onClick={() => { setResponse(h.response); setSituation(h.situation); }}
                style={{ ...css.card, cursor:"pointer", textAlign:"left",
                  fontFamily:"'DM Sans',sans-serif", border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:12, color:C.text, lineHeight:1.5,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {h.situation.substring(0, 120)}{h.situation.length > 120 ? "…" : ""}
                </div>
                <Mono color={C.textD} size={8} style={{ marginTop:4, display:"block" }}>
                  {new Date(h.ts).toLocaleTimeString("fr-CA", { hour:"2-digit", minute:"2-digit" })}
                </Mono>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!response && !loading && history.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD }}>
          <div style={{ fontSize:40, marginBottom:16 }}>⚡</div>
          <div style={{ fontSize:14, color:C.textM, marginBottom:8 }}>
            Décris une situation — le Copilot analyse avec tout le contexte de ton OS.
          </div>
          <div style={{ fontSize:12, color:C.textD, maxWidth:480, margin:"0 auto", lineHeight:1.7 }}>
            Cas actifs · Meetings récents · Signaux · Preps 1:1 · Playbooks · Historique de décisions
          </div>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MODULE: ORG RADAR
// ══════════════════════════════════════════════════════════════════════════════

const RADAR_SP = `Tu es un HRBP senior, groupe IT, Quebec. Tu analyses un portefeuille RH complet pour produire un radar organisationnel strategique.
Reponds UNIQUEMENT en JSON valide. Aucun backtick. Aucune apostrophe dans les valeurs JSON.

Structure exacte:
{
  "weekOf": "Semaine du [date]",
  "executivePulse": "1-2 phrases — etat general de l organisation cette semaine",
  "overallRisk": "Critique|Eleve|Modere|Faible",
  "topRisks": [
    {
      "id": "risk_1",
      "title": "titre court 5-8 mots",
      "level": "Critique|Eleve|Modere|Faible",
      "category": "Performance|Retention|Leadership|Culture|Legal|Structure|Engagement",
      "description": "description concrete — 1-2 phrases",
      "source": "cases|meetings|signals|pattern",
      "evidence": "fait concret qui justifie ce risque",
      "trend": "Hausse|Stable|Baisse",
      "urgency": "Cette semaine|Sous 30 jours|A surveiller"
    }
  ],
  "managersAtRisk": [
    {
      "identifier": "role ou prenom si disponible — jamais de nom complet",
      "team": "equipe ou departement",
      "riskLevel": "Critique|Eleve|Modere",
      "mainSignal": "signal principal observe — 1 phrase",
      "pattern": "pattern identifie — avoidant|toxic_performer|overloaded|misaligned|political",
      "urgentAction": "action HRBP immediate concrete"
    }
  ],
  "orgPatterns": [
    {
      "pattern": "nom du pattern",
      "description": "ce qui se repete ou emerge — 1-2 phrases",
      "affectedTeams": ["equipe 1", "equipe 2"],
      "severity": "Critique|Eleve|Modere|Faible"
    }
  ],
  "hrbpActions": [
    {
      "action": "action concrete et precise",
      "priority": "Critique|Elevee|Normale",
      "delay": "Aujourd hui|Cette semaine|Sous 30 jours",
      "category": "Conversation|Documentation|Escalation|Monitoring|Coaching",
      "linkedTo": "ref cas ou manager ou pattern"
    }
  ],
  "themeOfWeek": {
    "theme": "theme dominant — DOIT nommer une population concrete ex: Surcharge gestionnaires mid-level IT | Evitement perf equipe Data | Retention profils seniors Backend",
    "why": "1-2 phrases — pourquoi CE theme cette semaine, impact business concret",
    "focus": ["action 1 — concrete et specifique", "action 2", "action 3"],
    "businessImpact": "consequence si non adresse cette semaine — 1 phrase"
  },
  "positiveSignals": ["signal positif 1", "signal positif 2"],
  "patternTracking": [
    {
      "pattern": "nom du pattern HRBP — ex: Manager evitant|Manager surcharge|Conflit equipe|Performance|Retention|Leadership gap|Culture toxique",
      "count": 3,
      "unit": "gestionnaires|equipes|cas|employes",
      "trend": "Hausse|Stable|Baisse",
      "trendDetail": "1 phrase — ce qui a change cette semaine vs precedemment, ou pourquoi ce trend",
      "severity": "Critique|Eleve|Modere|Faible"
    }
  ]
}

Analyse rigoureuse. Patterns detectes. Pas de generalites. Max 5 topRisks, 3 managersAtRisk, 3 orgPatterns, 6 hrbpActions, 6 patternTracking.
Pour patternTracking: compte les occurrences reelles dans les donnees. Si donnees precedentes fournies, compare pour determiner le trend. Sois precis sur les counts.
Pour themeOfWeek: identifie UN SEUL theme dominant qui concentre la majorite des risques et patterns cette semaine. Pas deux. Pas "et aussi". Un seul. Celui qui doit guider toute la semaine HRBP.
REGLES DE SPECIFICITE ABSOLUE pour themeOfWeek:
- Le theme DOIT nommer une population concrete: un gestionnaire specifique, un type de gestionnaire, une equipe, ou un segment identifiable. Jamais un concept abstrait.
- INTERDIT: "engagement", "communication", "culture", "dynamique d equipe", "bien-etre", "collaboration"
- OBLIGATOIRE: nommer QUI est concerne. Exemples acceptables: "Surcharge des gestionnaires IT mid-level", "Evitement des conversations de performance — equipe Data", "Risque de depart — profils seniors Backend", "Gestionnaires nouvellement nommes sans support"
- Si le theme ne repond pas a la question "qui specifiquement?", il est invalide. Le reformuler.
- businessImpact doit nommer la consequence operationnelle concrete (depart, arret, sous-performance, escalade), pas un risque vague.`;

function ModuleRadar({ data, onSave }) {
  const [radar, setRadar]     = useState(() => (data.radars||[])[0]?.radar || null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [done, setDone]       = useState({});
  const [week, setWeek]       = useState(0);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [actionFeedback, setActionFeedback] = useState({}); // { idx: "portfolio"|"case" }

  const rC = (r) => ({"Critique":C.red,"Élevé":C.amber,"Eleve":C.amber,"Modéré":C.blue,"Modere":C.blue,"Faible":C.em}[r]||C.textD);
  const dC = (d) => ({"Aujourd hui":C.red,"Aujourd'hui":C.red,"Cette semaine":C.amber,"Sous 30 jours":C.blue}[d]||C.blue);
  const savedRadars = data.radars || [];

  const buildContext = () => {
    const cases    = (data.cases||[]).filter(c=>c.status==="active"||c.status==="open");
    const meetings = (data.meetings||[]).slice().reverse().slice(0,15);
    const signals  = (data.signals||[]).slice().reverse().slice(0,10);
    // Include previous radar pattern counts for trend comparison
    const prevRadar = savedRadars[0]?.radar;
    const prevPatterns = prevRadar?.patternTracking;
    const prevPatternsCtx = prevPatterns?.length
      ? `\nPATTERN TRACKING PRECEDENT (${fmtDate(savedRadars[0]?.savedAt)||"semaine precedente"}):\n${prevPatterns.map(p=>`- ${p.pattern}: ${p.count} ${p.unit} (${p.trend})`).join("\n")}`
      : "";

    return `DATE: ${new Date().toLocaleDateString("fr-CA")}
CAS ACTIFS (${cases.length}):
${cases.map(c=>`- ${c.title} | ${c.type} | ${c.riskLevel} | ${c.situation||""}`).join("\n")||"Aucun."}
MEETINGS (${meetings.length}):
${meetings.map(m=>`- ${m.meetingType} ${m.director||""} (${fmtDate(m.savedAt)}) Risk:${m.analysis?.overallRisk} ${m.analysis?.overallRiskRationale||""}`).join("\n")||"Aucun."}
SIGNAUX (${signals.length}):
${signals.map(s=>`- ${s.analysis?.category} ${s.analysis?.title} (${s.analysis?.severity})`).join("\n")||"Aucun."}${prevPatternsCtx}`;
  };

  const generate = async () => {
    setLoading(true); setError(""); setDone({}); setActionFeedback({});
    try {
      const parsed = await callAIJson(RADAR_SP, `Genere le radar:\n\n${buildContext()}`, 3500);
      const r = normalizeAIData(parsed);
      setRadar(r); setWeek(0);
      const entry = {id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], radar:r};
      if (onSave) onSave("radars", [entry,...savedRadars.slice(0,4)]);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const importRadarResponse = (parsed) => {
    const r = normalizeAIData(parsed);
    setRadar(r); setWeek(0);
    const entry = {id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], radar:r};
    if (onSave) onSave("radars", [entry,...savedRadars.slice(0,4)]);
  };

  // Push a risk's associated manager to portfolio
  const pushToPortfolio = (r, idx) => {
    const portfolio = data.portfolio || [];
    const identifier = r.identifier || r.source || "";
    // Try to find existing manager entry
    const existing = portfolio.find(m =>
      identifier && m.name?.toLowerCase().includes(identifier.toLowerCase())
    );
    if (existing) {
      // Update risk level
      const updated = portfolio.map(m => m.id===existing.id
        ? {...m, risk: normalizeRisk(r.level)||m.risk, topIssue: r.title||m.topIssue, lastInteraction: new Date().toISOString().split("T")[0]}
        : m
      );
      onSave("portfolio", updated);
      setActionFeedback(f=>({...f, [idx]:"updated"}));
    } else {
      // Create new portfolio entry from risk
      const newMgr = {
        id: Date.now().toString(),
        name: identifier || r.title?.substring(0,20) || "À identifier",
        team: "",
        risk: normalizeRisk(r.level) || "Élevé",
        pressure: "Moderee",
        type: "Solide",
        topIssue: r.title || "",
        hrbpAction: r.urgency ? `Adresser avant: ${r.urgency}` : "",
        lastInteraction: new Date().toISOString().split("T")[0],
        notes: r.description || "",
      };
      onSave("portfolio", [...portfolio, newMgr]);
      setActionFeedback(f=>({...f, [idx]:"added"}));
    }
    setTimeout(() => setActionFeedback(f=>{const n={...f};delete n[idx];return n;}), 3000);
  };

  // Convert risk to case
  const convertToCase = (r, idx) => {
    const cases = data.cases || [];
    const newCase = {
      id: Date.now().toString(),
      title: r.title || "Risque identifié — Org Radar",
      type: r.category==="Performance"?"performance":r.category==="Retention"||r.category==="Rétention"?"retention":"conflict_ee",
      riskLevel: normalizeRisk(r.level) || "Élevé",
      status: "open",
      director: r.identifier || "",
      employee: "",
      department: "",
      openDate: new Date().toISOString().split("T")[0],
      situation: `${r.description || ""}${r.evidence ? "\nPreuve: " + r.evidence : ""}`,
      interventionsDone: "",
      hrPosition: r.urgentAction || "",
      nextFollowUp: "",
      notes: `Créé depuis Org Radar — ${new Date().toLocaleDateString("fr-CA")}`,
      actions: [],
      updatedAt: new Date().toISOString().split("T")[0],
    };
    onSave("cases", [...cases, newCase]);
    setActionFeedback(f=>({...f, [idx]:"case"}));
    setTimeout(() => setActionFeedback(f=>{const n={...f};delete n[idx];return n;}), 3000);
  };

  const displayRadar = week===0 ? radar : savedRadars[week-1]?.radar;
  const riskCount = {Critique:0,Eleve:0,Modere:0};
  (displayRadar?.topRisks||[]).forEach(r=>{
    const k=r.level==="Élevé"||r.level==="Eleve"?"Eleve":r.level==="Modéré"||r.level==="Modere"?"Modere":r.level==="Critique"?"Critique":"Modere";
    if(riskCount[k]!==undefined) riskCount[k]++;
  });

  return (
    <div style={{maxWidth:860,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{flex:1}}>
          <span style={{fontSize:16,fontWeight:700,color:C.text}}>Org Radar</span>
          {displayRadar&&<span style={{fontSize:12,color:C.textM,marginLeft:10}}>{displayRadar.weekOf}</span>}
        </div>
        {savedRadars.length>1&&(
          <div style={{display:"flex",gap:4}}>
            {[0,...savedRadars.map((_,i)=>i+1)].slice(0,5).map(i=>(
              <button key={i} onClick={()=>setWeek(i)}
                style={{padding:"4px 10px",borderRadius:5,fontSize:11,cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif",border:"none",
                  background:week===i?C.em+"22":C.surfL,
                  color:week===i?C.em:C.textD,fontWeight:week===i?700:400}}>
                {i===0?"Actuel":fmtDate(savedRadars[i-1]?.savedAt)||`S-${i}`}
              </button>
            ))}
          </div>
        )}
        {loading?<AILoader label="Analyse…"/>:(
          <button onClick={generate} style={{...css.btn(C.em),padding:"8px 18px",fontSize:12}}>
            🔭 {radar?"Régénérer":"Générer"}
          </button>
        )}
      </div>

      {error&&<div style={{background:C.red+"15",border:`1px solid ${C.red}33`,borderRadius:7,
        padding:"9px 14px",marginBottom:12,fontSize:12,color:C.red}}>⚠ {error}</div>}

      {!displayRadar&&!loading&&(
        <div style={{textAlign:"center",padding:"50px 20px"}}>
          <div style={{fontSize:13,color:C.textM,marginBottom:16}}>
            Génère ton radar hebdomadaire · {(data.cases||[]).filter(c=>c.status==="active"||c.status==="open").length} cas · {(data.meetings||[]).length} meetings · {(data.signals||[]).length} signaux
          </div>
          <button onClick={generate} style={{...css.btn(C.em),padding:"10px 24px",fontSize:13}}>🔭 Générer le Radar</button>
        </div>
      )}

      {displayRadar&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Pulse strip */}
          <div style={{padding:"12px 16px",background:C.surfL,borderRadius:9,
            borderLeft:`4px solid ${rC(displayRadar.overallRisk)}`,
            display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{background:rC(displayRadar.overallRisk)+"22",border:`1px solid ${rC(displayRadar.overallRisk)}44`,
              borderRadius:6,padding:"4px 11px",fontSize:12,fontWeight:700,color:rC(displayRadar.overallRisk),flexShrink:0}}>
              {displayRadar.overallRisk}
            </div>
            <div style={{fontSize:13,color:C.text,flex:1,lineHeight:1.6}}>{displayRadar.executivePulse}</div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              {[["Critique",C.red],["Eleve",C.amber],["Modere",C.blue]].map(([k,col])=>
                riskCount[k]>0&&(
                  <div key={k} style={{background:col+"18",border:`1px solid ${col}30`,
                    borderRadius:5,padding:"2px 8px",fontSize:10,color:col,fontWeight:700}}>
                    {riskCount[k]} {k==="Eleve"?"Élevé":k==="Modere"?"Modéré":k}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Theme of the Week */}
          {displayRadar.themeOfWeek && (() => {
            const t = displayRadar.themeOfWeek;
            return (
              <div style={{
                background:`linear-gradient(135deg, ${C.em}0d, ${C.blue}08)`,
                border:`1.5px solid ${C.em}50`,
                borderRadius:10, padding:"16px 18px",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:16}}>🎯</span>
                  <Mono color={C.em} size={10}>Thème de la semaine</Mono>
                  {t.businessImpact && (
                    <div style={{marginLeft:"auto",fontSize:10,color:C.amber,
                      background:C.amber+"15",border:`1px solid ${C.amber}35`,
                      borderRadius:4,padding:"2px 8px",fontWeight:600,flexShrink:0}}>
                      ⚠ {t.businessImpact}
                    </div>
                  )}
                </div>

                <div style={{fontSize:18,fontWeight:800,color:C.text,marginBottom:8,lineHeight:1.2}}>
                  {t.theme}
                </div>

                <div style={{fontSize:13,color:C.textM,lineHeight:1.65,marginBottom:12,
                  paddingLeft:10,borderLeft:`3px solid ${C.em}40`}}>
                  {t.why}
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {(t.focus||[]).map((f,i) => (
                    <div key={i} style={{display:"flex",gap:9,alignItems:"flex-start"}}>
                      <div style={{width:18,height:18,background:C.em,borderRadius:"50%",
                        flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:10,fontWeight:800,color:C.bg,marginTop:1}}>{i+1}</div>
                      <span style={{fontSize:13,color:C.text,lineHeight:1.6}}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Risks */}
          <Card>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <Mono color={C.red} size={9}>Risques prioritaires</Mono>
              <span style={{fontSize:11,color:C.textD}}>
                {Object.values(done).filter(Boolean).length}/{displayRadar.topRisks?.length||0} traités
              </span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(displayRadar.topRisks||[]).map((r,i)=>{
                const rc=rC(r.level); const isDone=done[i];
                const fb=actionFeedback[i];
                const TREND={"Hausse":"↑","Stable":"→","Baisse":"↓"};
                const TC={"Hausse":C.red,"Stable":C.textD,"Baisse":C.em};
                // Determine action: if has manager identifier -> portfolio, else -> case
                const hasManager = !!(r.identifier||r.source);
                return (
                  <div key={i} style={{display:"flex",gap:10,padding:"9px 11px",
                    background:isDone?C.surfLL+"80":C.surfLL,
                    borderRadius:8,borderLeft:`3px solid ${isDone?C.textD:rc}`,
                    opacity:isDone?0.5:1,alignItems:"flex-start"}}>
                    <button onClick={()=>setDone(d=>({...d,[i]:!d[i]}))}
                      style={{width:18,height:18,borderRadius:"50%",flexShrink:0,
                        border:`2px solid ${isDone?C.em:rc}`,background:isDone?C.em:"none",
                        cursor:"pointer",marginTop:2,display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:10,color:"#fff"}}>
                      {isDone?"✓":""}
                    </button>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
                        <div style={{background:rc+"20",border:`1px solid ${rc}35`,
                          borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700,color:rc}}>{r.level}</div>
                        <Badge label={r.category} color={C.textD} size={9}/>
                        {r.trend&&<span style={{fontSize:11,color:TC[r.trend],fontWeight:700}}>{TREND[r.trend]} {r.trend}</span>}
                        {r.urgency&&(
                          <div style={{background:dC(r.urgency)+"18",border:`1px solid ${dC(r.urgency)}35`,
                            borderRadius:4,padding:"1px 6px",fontSize:9,color:dC(r.urgency),fontWeight:700}}>
                            {r.urgency}
                          </div>
                        )}
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:3}}>{r.title}</div>
                      <div style={{fontSize:12,color:C.textM,lineHeight:1.55}}>{r.description}</div>
                      {r.evidence&&<div style={{fontSize:11,color:C.textD,marginTop:3}}>→ {r.evidence}</div>}
                    </div>
                    {/* Single action button */}
                    {!isDone&&(
                      <div style={{flexShrink:0}}>
                        {fb?(
                          <div style={{fontSize:10,color:C.em,padding:"4px 8px",fontWeight:600,whiteSpace:"nowrap"}}>
                            {fb==="case"?"✓ Cas créé":fb==="added"?"✓ Ajouté":"✓ Mis à jour"}
                          </div>
                        ):(
                          <button
                            onClick={()=>hasManager?pushToPortfolio(r,i):convertToCase(r,i)}
                            title={hasManager?"Pousser vers Portfolio":"Convertir en cas"}
                            style={{padding:"4px 10px",borderRadius:5,fontSize:10,cursor:"pointer",
                              fontFamily:"'DM Sans',sans-serif",fontWeight:600,
                              background:hasManager?C.teal+"18":C.amber+"18",
                              border:`1px solid ${hasManager?C.teal+"44":C.amber+"44"}`,
                              color:hasManager?C.teal:C.amber,whiteSpace:"nowrap"}}>
                            {hasManager?"→ Portfolio":"→ Cas"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Managers + Patterns — 2 col */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Card>
              <Mono color={C.amber} size={9} style={{display:"block",marginBottom:10}}>Managers à risque</Mono>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(displayRadar.managersAtRisk||[]).map((m,i)=>{
                  const rc=rC(m.riskLevel);
                  const PTYPES={avoidant:"🫥",toxic_performer:"⚡",overloaded:"🔥",misaligned:"🔀",political:"🎭"};
                  const portfolio=data.portfolio||[];
                  const inPortfolio=portfolio.some(p=>m.identifier&&p.name?.toLowerCase().includes(m.identifier.toLowerCase()));
                  return (
                    <div key={i} style={{padding:"9px 11px",background:C.surfLL,borderRadius:8,borderLeft:`3px solid ${rc}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                        <span style={{fontSize:13,fontWeight:600,color:C.text}}>
                          {PTYPES[m.pattern]||""} {m.identifier}
                          {m.team&&<span style={{fontSize:11,color:C.textM,fontWeight:400,marginLeft:6}}>{m.team}</span>}
                        </span>
                        <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                          <div style={{background:rc+"20",border:`1px solid ${rc}40`,
                            borderRadius:5,padding:"2px 7px",fontSize:10,fontWeight:700,color:rc}}>{m.riskLevel}</div>
                          <button onClick={()=>{
                            const radarRisk={...m,title:m.mainSignal,description:m.urgentAction,level:m.riskLevel};
                            pushToPortfolio(radarRisk,-1000-i);
                          }}
                            style={{padding:"3px 8px",borderRadius:5,fontSize:10,cursor:"pointer",
                              fontFamily:"'DM Sans',sans-serif",
                              background:inPortfolio?C.em+"18":C.teal+"18",
                              border:`1px solid ${inPortfolio?C.em+"44":C.teal+"44"}`,
                              color:inPortfolio?C.em:C.teal,fontWeight:600}}>
                            {actionFeedback[-1000-i]?"✓":(inPortfolio?"↑ Portf.":"→ Portf.")}
                          </button>
                        </div>
                      </div>
                      <div style={{fontSize:12,color:C.textM,lineHeight:1.55,marginBottom:4}}>{m.mainSignal}</div>
                      {m.urgentAction&&<div style={{fontSize:11,color:C.em}}>→ {m.urgentAction}</div>}
                    </div>
                  );
                })}
              </div>
            </Card>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Card>
                <Mono color={C.purple} size={9} style={{display:"block",marginBottom:10}}>Patterns</Mono>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {(displayRadar.orgPatterns||[]).map((p,i)=>{
                    const rc=rC(p.severity);
                    return (
                      <div key={i} style={{paddingLeft:10,borderLeft:`3px solid ${C.purple}`}}>
                        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3}}>
                          <span style={{fontSize:12,fontWeight:600,color:C.text}}>{p.pattern}</span>
                          <div style={{background:rc+"18",borderRadius:4,padding:"1px 6px",fontSize:9,color:rc,fontWeight:700}}>{p.severity}</div>
                        </div>
                        <div style={{fontSize:12,color:C.textM,lineHeight:1.55}}>{p.description}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              {displayRadar.positiveSignals?.length>0&&(
                <Card>
                  <Mono color={C.em} size={9} style={{display:"block",marginBottom:8}}>Positifs</Mono>
                  {displayRadar.positiveSignals.map((s,i)=>(
                    <div key={i} style={{fontSize:12,color:C.textM,display:"flex",gap:7,marginBottom:5}}>
                      <span style={{color:C.em,flexShrink:0}}>✓</span>{s}
                    </div>
                  ))}
                </Card>
              )}
            </div>
          </div>

          {/* Pattern Tracking */}
          {displayRadar.patternTracking?.length > 0 && (() => {
            const TREND_META = {
              "Hausse": { icon:"↑", color:C.red },
              "Stable": { icon:"→", color:C.textD },
              "Baisse": { icon:"↓", color:C.em },
            };
            const sev_c = (s) => ({"Critique":C.red,"Eleve":C.amber,"Élevé":C.amber,"Modere":C.blue,"Modéré":C.blue,"Faible":C.em}[s]||C.textD);
            const hasPrev = savedRadars.length > (week===0?1:week+1);
            return (
              <div style={{background:C.surfL,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 18px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Mono color={C.purple} size={9}>📊 Pattern Tracking</Mono>
                    {hasPrev && (
                      <div style={{background:C.purple+"15",border:`1px solid ${C.purple}30`,
                        borderRadius:4,padding:"1px 7px",fontSize:9,color:C.purple,fontWeight:600}}>
                        vs semaine précédente
                      </div>
                    )}
                  </div>
                  <span style={{fontSize:11,color:C.textD}}>{displayRadar.patternTracking.length} patterns</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:0}}>
                  {displayRadar.patternTracking
                    .sort((a,b)=>({"Critique":0,"Eleve":1,"Modere":2,"Faible":3}[a.severity]||9)-({"Critique":0,"Eleve":1,"Modere":2,"Faible":3}[b.severity]||9))
                    .map((p,i)=>{
                      const tm = TREND_META[p.trend] || {icon:"→",color:C.textD};
                      const sc = sev_c(p.severity);
                      const isLast = i===displayRadar.patternTracking.length-1;
                      return (
                        <div key={i} style={{
                          display:"flex",gap:10,alignItems:"flex-start",
                          padding:"8px 0",
                          borderBottom: isLast ? "none" : `1px solid ${C.border}`,
                        }}>
                          {/* Trend indicator */}
                          <div style={{
                            width:28,flexShrink:0,display:"flex",alignItems:"center",
                            justifyContent:"center",paddingTop:1
                          }}>
                            <span style={{fontSize:15,fontWeight:800,color:tm.color,lineHeight:1}}>{tm.icon}</span>
                          </div>
                          {/* Pattern name + count */}
                          <div style={{flex:"0 0 auto",minWidth:0}}>
                            <span style={{fontSize:13,fontWeight:600,color:C.text}}>{p.pattern}</span>
                            <span style={{
                              fontSize:12,color:sc,fontWeight:700,
                              marginLeft:8,
                              background:sc+"15",border:`1px solid ${sc}30`,
                              borderRadius:4,padding:"0px 6px"
                            }}>{p.count} {p.unit}</span>
                          </div>
                          {/* Trend detail */}
                          <div style={{flex:1,fontSize:12,color:C.textM,lineHeight:1.55,paddingTop:1}}>
                            {p.trendDetail}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <Card style={{borderLeft:`3px solid ${C.em}`}}>
            <Mono color={C.em} size={9} style={{display:"block",marginBottom:10}}>Actions HRBP — 7 jours</Mono>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {(displayRadar.hrbpActions||[])
                .sort((a,b)=>({"Critique":0,"Elevee":1,"Élevée":1,"Normale":2}[a.priority]||9)-({"Critique":0,"Elevee":1,"Élevée":1,"Normale":2}[b.priority]||9))
                .map((a,i)=>{
                  const dc=dC(a.delay);
                  const pc=a.priority==="Critique"?C.red:a.priority==="Elevee"||a.priority==="Élevée"?C.amber:C.textD;
                  return (
                    <div key={i} style={{display:"flex",gap:8,alignItems:"baseline",
                      padding:"7px 10px",background:C.surfLL,borderRadius:7}}>
                      <div style={{background:dc+"18",border:`1px solid ${dc}35`,
                        color:dc,borderRadius:5,padding:"2px 7px",fontSize:9,
                        fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>{a.delay}</div>
                      <div style={{fontSize:13,color:C.text,flex:1,lineHeight:1.55}}>{a.action}</div>
                      <Badge label={a.category} color={pc} size={9}/>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MODULE: MANAGER PORTFOLIO
// ══════════════════════════════════════════════════════════════════════════════

const EMPTY_MANAGER = {
  id:"", name:"", team:"", level:3,
  risk:"Modéré", pressure:"Moderee", type:"Solide",
  topIssue:"", hrbpAction:"", lastInteraction:"", notes:""
};

const PORTFOLIO_ASSESS_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Quebec.
A partir des donnees historiques d un gestionnaire (meetings analyses, dossiers actifs), evalue son profil de risque RH actuel.
Reponds UNIQUEMENT en JSON valide. Aucun backtick. Aucune apostrophe dans les valeurs JSON.
{"riskAssessment":"Critique|Eleve|Modere|Faible","pressureLevel":"Elevee|Moderee|Faible","managerType":"Solide|En developpement|A risque|Critique","topIssue":"enjeu principal identifie en 1 phrase courte","recommendedAction":"action HRBP recommandee en 1 phrase courte"}`;

function ModulePortfolio({ data, onSave }) {
  const managers = data.portfolio || [];
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm]             = useState({});
  const [riskFilter, setRiskFilter] = useState("Tous");
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [search, setSearch]         = useState("");
  const [assessing, setAssessing]   = useState(null);
  const [assessPrompt, setAssessPrompt] = useState(null);
  const [adding, setAdding]         = useState(false);
  const [newForm, setNewForm]       = useState({...EMPTY_MANAGER});
  const [deletedQueue, setDeletedQueue] = useState([]); // [{m, timer}] for undo

  const RISK_ORDER_P = {"Critique":0,"Élevé":1,"Eleve":1,"Modéré":2,"Modere":2,"Faible":3};
  const riskC = (r) => ({"Critique":C.red,"Élevé":C.amber,"Eleve":C.amber,"Modéré":C.blue,"Modere":C.blue,"Faible":C.em}[r]||C.textD);
  const TYPE_ICON = {"Solide":"✅","Evitant":"🫥","Évitant":"🫥","Surcharge":"🔥","Surchargé":"🔥","Micromanager":"🔬","Politique":"🎭","En developpement":"🌱","En développement":"🌱"};
  const pressLabel = {"Elevee":"🔴","Élevée":"🔴","Moderee":"🟡","Modérée":"🟡","Faible":"🟢"};

  const saveEdit = (id) => {
    onSave("portfolio", managers.map(m=>m.id===id?{...m,...form}:m));
    setExpandedId(null); setForm({});
  };

  const saveNew = () => {
    if (!newForm.name?.trim()) return;
    onSave("portfolio", [...managers, {...newForm, id:Date.now().toString(), lastInteraction:new Date().toISOString().split("T")[0]}]);
    setAdding(false); setNewForm({...EMPTY_MANAGER});
  };

  // Undo-based delete
  const del = (m) => {
    onSave("portfolio", managers.filter(x=>x.id!==m.id));
    const timer = setTimeout(() => {
      setDeletedQueue(q=>q.filter(x=>x.m.id!==m.id));
    }, 4000);
    setDeletedQueue(q=>[...q, {m, timer}]);
  };

  const undoDel = (m) => {
    setDeletedQueue(q=>{
      const item = q.find(x=>x.m.id===m.id);
      if (item) clearTimeout(item.timer);
      return q.filter(x=>x.m.id!==m.id);
    });
    onSave("portfolio", [...managers, m].sort((a,b)=>(RISK_ORDER_P[a.risk]||9)-(RISK_ORDER_P[b.risk]||9)));
  };

  const openEdit = (m) => {
    if (expandedId===m.id){setExpandedId(null);setForm({});return;}
    setExpandedId(m.id);
    setForm({name:m.name,team:m.team||"",risk:m.risk||"Modéré",pressure:m.pressure||"Moderee",
      type:m.type||"Solide",topIssue:m.topIssue||"",hrbpAction:m.hrbpAction||"",
      lastInteraction:m.lastInteraction||"",notes:m.notes||""});
  };

  const assessFromData = async (m) => {
    const mData=(data.meetings||[]).filter(x=>x.director?.toLowerCase().includes(m.name.toLowerCase())).slice(-5);
    const cData=(data.cases||[]).filter(x=>(x.director||"").toLowerCase().includes(m.name.toLowerCase())).slice(-5);
    if (!mData.length&&!cData.length){alert("Aucune donnée trouvée pour ce gestionnaire.");return;}
    const ctx=[
      mData.length&&`MEETINGS:\n${mData.map(x=>`- ${fmtDate(x.savedAt)} Risk:${x.analysis?.overallRisk} ${x.analysis?.overallRiskRationale||""}`).join("\n")}`,
      cData.length&&`CASES:\n${cData.map(x=>`- ${x.title} | ${x.riskLevel} | ${x.situation||""}`).join("\n")}`,
    ].filter(Boolean).join("\n\n");
    setAssessing(m.id);
    try {
      const p = await callAIJson(PORTFOLIO_ASSESS_SP, `Gestionnaire: ${m.name}\n\n${ctx}`, 500);
      onSave("portfolio", managers.map(x=>x.id===m.id?{...x,
        risk:normalizeRisk(p.riskAssessment)||x.risk, pressure:p.pressureLevel||x.pressure,
        type:p.managerType||x.type, topIssue:p.topIssue||x.topIssue,
        hrbpAction:p.recommendedAction||x.hrbpAction,
        lastInteraction:new Date().toISOString().split("T")[0]}:x));
    } catch(e){ alert("Erreur: "+e.message); }
    finally{ setAssessing(null); }
  };

  const importAssessResponse = (parsed, managerId) => {
    const p = parsed;
    onSave("portfolio", managers.map(x=>x.id===managerId?{...x,
      risk:normalizeRisk(p.riskAssessment)||x.risk, pressure:p.pressureLevel||x.pressure,
      type:p.managerType||x.type, topIssue:p.topIssue||x.topIssue,
      hrbpAction:p.recommendedAction||x.hrbpAction,
      lastInteraction:new Date().toISOString().split("T")[0]}:x));
    setAssessPrompt(null);
  };

  // "Where do I spend my next 5 HRBP hours?" — top 3
  const topFocus = [...managers]
    .map(m => {
      let score = 0;
      const ro = RISK_ORDER_P[m.risk]||3;
      score += (3-ro)*30; // risk weight
      const days = m.lastInteraction ? Math.floor((Date.now()-new Date(m.lastInteraction).getTime())/86400000) : 99;
      if (days>21) score += 20;
      else if (days>14) score += 10;
      if (m.pressure==="Elevee"||m.pressure==="Élevée") score += 15;
      if (m.type==="Évitant"||m.type==="Evitant") score += 10;
      if (m.type==="Surchargé"||m.type==="Surcharge") score += 8;
      return {...m, _score:score, _days:days};
    })
    .filter(m=>m._score>10)
    .sort((a,b)=>b._score-a._score)
    .slice(0,3);

  const focusReason = (m) => {
    const parts = [];
    if (m.risk==="Critique") parts.push("risque critique");
    else if (m.risk==="Élevé"||m.risk==="Eleve") parts.push("risque élevé");
    if (m._days>21) parts.push(`${m._days}j sans contact`);
    else if (m._days>14) parts.push(`${m._days}j sans contact`);
    if (m.pressure==="Elevee"||m.pressure==="Élevée") parts.push("pression élevée");
    if (m.type==="Évitant"||m.type==="Evitant") parts.push("pattern évitant");
    if (m.type==="Surchargé"||m.type==="Surcharge") parts.push("débordé");
    return parts.slice(0,2).join(" · ")||"Priorité";
  };

  const RISK_FILTERS = ["Tous","Critique","Élevé","Modéré","Faible"];
  const TYPE_FILTERS = [
    {val:"Tous",label:"Tous"},
    {val:"Évitant",label:"Évitant"},
    {val:"Surchargé",label:"Débordé"},
    {val:"Micromanager",label:"Micro"},
    {val:"Politique",label:"Politique"},
  ];

  const filtered = managers
    .filter(m=>{
      if(riskFilter!=="Tous"&&normalizeRisk(m.risk)!==riskFilter&&m.risk!==riskFilter) return false;
      if(typeFilter!=="Tous"&&m.type!==typeFilter&&!(typeFilter==="Évitant"&&m.type==="Evitant")&&!(typeFilter==="Surchargé"&&m.type==="Surcharge")) return false;
      if(search&&!m.name.toLowerCase().includes(search.toLowerCase())&&!(m.team||"").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a,b)=>(RISK_ORDER_P[a.risk]||9)-(RISK_ORDER_P[b.risk]||9));

  const InlineEdit = ({id}) => {
    const f=form;
    const FF=(k,v)=>setForm(p=>({...p,[k]:v}));
    return (
      <div style={{padding:"12px 14px",background:C.surfLL,borderTop:`1px solid ${C.border}`,
        display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <div>
          <Mono color={C.textD} size={8}>Risque</Mono>
          <select value={f.risk||"Modéré"} onChange={e=>FF("risk",e.target.value)} style={{...css.select,marginTop:4,fontSize:12,padding:"5px 8px"}}>
            {["Critique","Élevé","Modéré","Faible"].map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <Mono color={C.textD} size={8}>Type</Mono>
          <select value={f.type||"Solide"} onChange={e=>FF("type",e.target.value)} style={{...css.select,marginTop:4,fontSize:12,padding:"5px 8px"}}>
            {["Solide","Évitant","Surchargé","Micromanager","Politique","En développement"].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <Mono color={C.textD} size={8}>Pression</Mono>
          <select value={f.pressure||"Moderee"} onChange={e=>FF("pressure",e.target.value)} style={{...css.select,marginTop:4,fontSize:12,padding:"5px 8px"}}>
            <option value="Elevee">Élevée</option>
            <option value="Moderee">Modérée</option>
            <option value="Faible">Faible</option>
          </select>
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <Mono color={C.textD} size={8}>Enjeu</Mono>
          <input value={f.topIssue||""} onChange={e=>FF("topIssue",e.target.value)}
            placeholder="Ex: Évite les feedbacks difficiles"
            style={{...css.input,marginTop:4,fontSize:12,padding:"5px 8px"}}/>
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <Mono color={C.textD} size={8}>Action HRBP</Mono>
          <input value={f.hrbpAction||""} onChange={e=>FF("hrbpAction",e.target.value)}
            placeholder="Ex: Coaching conversation difficile"
            style={{...css.input,marginTop:4,fontSize:12,padding:"5px 8px"}}/>
        </div>
        <div style={{display:"flex",gap:8,gridColumn:"1/-1",marginTop:4}}>
          <button onClick={()=>saveEdit(id)} style={{...css.btn(C.em),padding:"7px 16px",fontSize:12}}>✓ Enregistrer</button>
          <button onClick={()=>{setExpandedId(null);setForm({});}} style={{...css.btn(C.textM,true),padding:"7px 12px",fontSize:12}}>Annuler</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{maxWidth:900,margin:"0 auto"}}>
      {/* Undo toast */}
      {deletedQueue.map(({m})=>(
        <div key={m.id} style={{position:"fixed",bottom:20,right:20,zIndex:9999,
          background:C.surfL,border:`1px solid ${C.border}`,borderRadius:8,
          padding:"10px 16px",display:"flex",gap:12,alignItems:"center",
          boxShadow:"0 4px 20px #0004",fontFamily:"'DM Sans',sans-serif"}}>
          <span style={{fontSize:12,color:C.textM}}>{m.name} supprimé</span>
          <button onClick={()=>undoDel(m)}
            style={{...css.btn(C.em),padding:"4px 12px",fontSize:11}}>Annuler</button>
        </div>
      ))}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{flex:1}}>
          <span style={{fontSize:16,fontWeight:700,color:C.text}}>Portfolio</span>
          <span style={{fontSize:12,color:C.textM,marginLeft:10}}>
            {managers.length} gestionnaires · {managers.filter(m=>m.risk==="Critique"||m.risk==="Élevé"||m.risk==="Eleve").length} à risque élevé+
          </span>
        </div>
        <button onClick={()=>{setAdding(v=>!v);setNewForm({...EMPTY_MANAGER});}}
          style={{...css.btn(adding?C.textM:C.em,adding),padding:"7px 16px",fontSize:12}}>
          {adding?"✕ Annuler":"➕ Ajouter"}
        </button>
      </div>

      {/* Quick add */}
      {adding&&(
        <div style={{background:C.em+"08",border:`1px solid ${C.em}30`,borderRadius:9,
          padding:"12px 14px",marginBottom:12,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div style={{gridColumn:"span 2"}}>
            <Mono color={C.textD} size={8}>Nom *</Mono>
            <input value={newForm.name||""} onChange={e=>setNewForm(f=>({...f,name:e.target.value}))}
              placeholder="Prénom ou identifier" autoFocus
              style={{...css.input,marginTop:4,fontSize:12,padding:"6px 9px"}}/>
          </div>
          <div>
            <Mono color={C.textD} size={8}>Équipe</Mono>
            <input value={newForm.team||""} onChange={e=>setNewForm(f=>({...f,team:e.target.value}))}
              placeholder="Ex: Data, Infra..."
              style={{...css.input,marginTop:4,fontSize:12,padding:"6px 9px"}}/>
          </div>
          <div>
            <Mono color={C.textD} size={8}>Risque</Mono>
            <select value={newForm.risk||"Modéré"} onChange={e=>setNewForm(f=>({...f,risk:e.target.value}))}
              style={{...css.select,marginTop:4,fontSize:12,padding:"5px 8px"}}>
              {["Critique","Élevé","Modéré","Faible"].map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <Mono color={C.textD} size={8}>Type</Mono>
            <select value={newForm.type||"Solide"} onChange={e=>setNewForm(f=>({...f,type:e.target.value}))}
              style={{...css.select,marginTop:4,fontSize:12,padding:"5px 8px"}}>
              {["Solide","Évitant","Surchargé","Micromanager","Politique","En développement"].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:8,gridColumn:"1/-1",alignItems:"flex-end"}}>
            <input value={newForm.topIssue||""} onChange={e=>setNewForm(f=>({...f,topIssue:e.target.value}))}
              placeholder="Enjeu principal (optionnel)"
              style={{...css.input,fontSize:12,padding:"6px 9px",flex:1}}/>
            <button onClick={saveNew} disabled={!newForm.name?.trim()}
              style={{...css.btn(!newForm.name?.trim()?C.textD:C.em),padding:"7px 16px",fontSize:12,
                flexShrink:0,opacity:newForm.name?.trim()?1:0.5}}>
              Ajouter ✓
            </button>
          </div>
        </div>
      )}

      {/* ── WHERE TO SPEND MY NEXT 5 HRBP HOURS ── */}
      {topFocus.length>0&&(
        <div style={{background:"linear-gradient(135deg,#ef444412,#f59e0b08)",
          border:`1px solid ${C.red}25`,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:14}}>🎯</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>Où passer mes 5 prochaines heures HRBP ?</div>
              <div style={{fontSize:11,color:C.textD}}>Score basé sur le risque, l'inactivité et le pattern</div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {topFocus.map((m,i)=>{
              const rc=riskC(m.risk);
              return (
                <div key={m.id} style={{display:"flex",gap:10,alignItems:"center",
                  padding:"9px 12px",background:C.surfL,borderRadius:8,
                  borderLeft:`3px solid ${rc}`}}>
                  <div style={{width:22,height:22,background:rc+"22",border:`1px solid ${rc}44`,
                    borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:800,color:rc,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text}}>
                      {TYPE_ICON[m.type]||""} {m.name}
                      {m.team&&<span style={{fontSize:11,color:C.textM,fontWeight:400,marginLeft:6}}>{m.team}</span>}
                    </div>
                    <div style={{fontSize:11,color:C.textD,marginTop:2}}>{focusReason(m)}</div>
                    {m.hrbpAction&&<div style={{fontSize:11,color:C.em,marginTop:2}}>→ {m.hrbpAction}</div>}
                  </div>
                  <button onClick={()=>openEdit(m)}
                    style={{...css.btn(C.textM,true),padding:"4px 10px",fontSize:11,flexShrink:0}}>✏</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters — risk + type pills */}
      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",gap:4}}>
          {RISK_FILTERS.map(r=>(
            <button key={r} onClick={()=>setRiskFilter(r)}
              style={{padding:"3px 10px",borderRadius:5,fontSize:11,cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",border:"none",
                background:riskFilter===r?C.em+"22":C.surfL,
                color:riskFilter===r?C.em:C.textM,
                fontWeight:riskFilter===r?600:400,
                outline:riskFilter===r?`1px solid ${C.em}55`:"none"}}>{r}</button>
          ))}
        </div>
        <div style={{width:1,height:16,background:C.border,margin:"0 2px"}}/>
        <div style={{display:"flex",gap:4}}>
          {TYPE_FILTERS.map(({val,label})=>(
            <button key={val} onClick={()=>setTypeFilter(val)}
              style={{padding:"3px 10px",borderRadius:5,fontSize:11,cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",border:"none",
                background:typeFilter===val?C.purple+"22":C.surfL,
                color:typeFilter===val?C.purple:C.textM,
                fontWeight:typeFilter===val?600:400,
                outline:typeFilter===val?`1px solid ${C.purple}55`:"none"}}>{label}</button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Nom ou équipe..."
          style={{...css.input,marginLeft:"auto",maxWidth:150,fontSize:12,padding:"4px 9px"}}/>
        <Mono color={C.textD} size={8}>{filtered.length}/{managers.length}</Mono>
      </div>

      {managers.length===0&&(
        <div style={{textAlign:"center",padding:"50px 20px",color:C.textD}}>
          <div style={{fontSize:14,color:C.textM,marginBottom:8}}>Portfolio vide</div>
          <button onClick={()=>setAdding(true)} style={{...css.btn(C.em),padding:"9px 20px"}}>➕ Ajouter</button>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {filtered.map(m=>{
          const rc=riskC(m.risk); const isExpanded=expandedId===m.id;
          const isAssessing=assessing===m.id;
          const days=m.lastInteraction?Math.floor((Date.now()-new Date(m.lastInteraction).getTime())/86400000):null;
          return (
            <div key={m.id} style={{background:C.surfL,border:`1px solid ${isExpanded?C.em+"55":C.border}`,
              borderLeft:`3px solid ${rc}`,borderRadius:8,overflow:"hidden"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",padding:"10px 12px"}}>
                <div style={{flex:"0 0 175px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{TYPE_ICON[m.type]||"👤"} {m.name}</div>
                  {m.team&&<div style={{fontSize:11,color:C.textM}}>{m.team}</div>}
                </div>
                <div style={{display:"flex",gap:4,flex:"0 0 auto"}}>
                  <div style={{background:rc+"20",border:`1px solid ${rc}40`,borderRadius:5,
                    padding:"2px 8px",fontSize:10,fontWeight:700,color:rc}}>{m.risk||"—"}</div>
                  {m.pressure&&<span style={{fontSize:13}}>{pressLabel[m.pressure]||""}</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  {m.topIssue&&<div style={{fontSize:12,color:C.textM,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    <span style={{color:C.amber}}>⚑ </span>{m.topIssue}
                  </div>}
                  {m.hrbpAction&&<div style={{fontSize:11,color:C.em,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    → {m.hrbpAction}
                  </div>}
                </div>
                <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                  {days!==null&&<Mono color={days>21?C.amber:C.textD} size={8}>{days}j</Mono>}
                  <button onClick={()=>assessFromData(m)} disabled={!!assessing}
                    title="Réévaluer depuis le OS"
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:5,
                      padding:"3px 7px",cursor:"pointer",fontSize:11,color:C.textD,
                      opacity:assessing&&assessing!==m.id?0.4:1}}>{isAssessing?"…":"🔄"}</button>
                  <button onClick={()=>openEdit(m)}
                    style={{...css.btn(isExpanded?C.em:C.textM,!isExpanded),padding:"4px 10px",fontSize:11}}>
                    {isExpanded?"✕":"✏"}
                  </button>
                  <button onClick={()=>del(m)}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:C.textD,padding:"2px"}}>✕</button>
                </div>
              </div>
              {isExpanded&&<InlineEdit id={m.id}/>}
            </div>
          );
        })}
        {filtered.length===0&&managers.length>0&&(
          <div style={{textAlign:"center",padding:"30px",color:C.textD,fontSize:13}}>Aucun résultat.</div>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MODULE: 30-60-90 PLANS
// ══════════════════════════════════════════════════════════════════════════════

const PLAN_306090_SP = `Tu es Samuel Chartrand, HRBP senior, groupe IT, Quebec. Genere un plan 30-60-90 jours structure et pratique pour une transition de role.
Reponds UNIQUEMENT en JSON valide. Aucun texte avant ou apres. Aucun backtick. Aucune apostrophe dans les valeurs JSON.
Le plan doit etre realiste pour un environnement corporatif IT. Adapte le contenu au type de transition. Sois concret et actionnable.
{
  "summary": {
    "headline": "phrase courte 8-12 mots qui capture l essentiel de la transition",
    "transitionRisk": "Faible|Modere|Eleve|Critique",
    "hrbpNote": "1-2 phrases — enjeu principal HRBP et angle de soutien"
  },
  "days30": {
    "theme": "Apprendre et Observer",
    "goals": [
      {
        "goal": "objectif concret",
        "actions": ["action 1", "action 2", "action 3"],
        "success": "indicateur de succes observable"
      }
    ],
    "watchouts": ["signal d alerte 1", "signal d alerte 2"],
    "managerQuestions": ["question pour le gestionnaire 1", "question 2"]
  },
  "days60": {
    "theme": "Contribuer et Connecter",
    "goals": [
      {
        "goal": "objectif concret",
        "actions": ["action 1", "action 2"],
        "success": "indicateur de succes observable"
      }
    ],
    "watchouts": ["signal d alerte 1", "signal d alerte 2"],
    "managerQuestions": ["question 1", "question 2"]
  },
  "days90": {
    "theme": "Diriger et Livrer",
    "goals": [
      {
        "goal": "objectif concret",
        "actions": ["action 1", "action 2"],
        "success": "indicateur de succes observable"
      }
    ],
    "watchouts": ["signal d alerte 1", "signal d alerte 2"],
    "managerQuestions": ["question 1", "question 2"]
  },
  "checkpoints": [
    {
      "timing": "30 jours",
      "focus": "focus du checkpoint",
      "questions": ["question HRBP 1", "question 2"]
    },
    {
      "timing": "60 jours",
      "focus": "focus du checkpoint",
      "questions": ["question HRBP 1", "question 2"]
    },
    {
      "timing": "90 jours",
      "focus": "focus du checkpoint",
      "questions": ["question HRBP 1", "question 2"]
    }
  ],
  "copySummary": "Texte propre et complet du plan — format lisible pour un gestionnaire — inclure les 3 phases avec leurs objectifs et actions cles"
}
Max 3 goals par phase. Max 3 actions par goal. Max 2 watchouts par phase. Max 2 questions gestionnaire par phase.`;

const PLAN_TYPES = [
  { id:"new_hire",           label:"🆕 Nouvel employé" },
  { id:"promotion",          label:"⬆ Promotion" },
  { id:"internal_move",      label:"🔄 Mobilité interne" },
  { id:"first_time_manager", label:"👤 Gestionnaire première fois" },
  { id:"critical_role",      label:"⚡ Transition rôle critique" },
];

const RISK_C_306 = (r) => ({"Critique":C.red,"Eleve":C.amber,"Élevé":C.amber,"Modere":C.blue,"Modéré":C.blue,"Faible":C.em}[r]||C.blue);

const PHASE_META = [
  { key:"days30", label:"30 jours", theme:"Apprendre + Observer", color:"#06b6d4", icon:"🔍" },
  { key:"days60", label:"60 jours", theme:"Contribuer + Connecter", color:"#8b5cf6", icon:"🤝" },
  { key:"days90", label:"90 jours", theme:"Diriger + Livrer", color:"#10b981", icon:"🚀" },
];

function Module306090({ data, onSave }) {
  const plans = data.plans306090 || [];
  const [view, setView]         = useState("list");   // list | form | result
  const [tab, setTab]           = useState("summary");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [result, setResult]     = useState(null);
  const [saved, setSaved]       = useState(false);
  const [copied, setCopied]     = useState(false);
  const [activePlan, setActivePlan] = useState(null);
  const [generatedPrompt, setGeneratedPrompt] = useState("");

  const [form, setForm] = useState({
    employeeName:"", role:"", team:"", manager:"",
    province:"", startDate:"", planType:"new_hire", context:""
  });

  const FF = (k,v) => setForm(f=>({...f,[k]:v}));

  const generate = async () => {
    if (!form.employeeName.trim() || !form.role.trim()) return;
    const prov = form.province || data.profile?.defaultProvince || "QC";
    const typeLabel = PLAN_TYPES.find(t=>t.id===form.planType)?.label || form.planType;
    const up = `TYPE DE TRANSITION: ${typeLabel}
EMPLOYE: ${form.employeeName}
ROLE: ${form.role}
EQUIPE: ${form.team||"Non specifie"}
GESTIONNAIRE: ${form.manager||"Non specifie"}
PROVINCE: ${prov}
DATE DE DEBUT: ${form.startDate||"Non specifiee"}
CONTEXTE: ${form.context||"Aucun contexte additionnel"}`;
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const parsed = await callAIJson(PLAN_306090_SP, up, 3500);
      setResult(parsed); setTab("summary"); setView("result");
    } catch(e) { setError("Erreur: "+e.message); }
    finally { setLoading(false); }
  };

  const importPlanResponse = (parsed) => {
    setResult(parsed);
    setTab("summary");
    setView("result");
  };

  const savePlan = () => {
    if (!result || saved) return;
    const entry = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString().split("T")[0],
      ...form,
      province: form.province || data.profile?.defaultProvince || "QC",
      output: result,
    };
    onSave("plans306090", [...plans, entry]);
    setSaved(true);
  };

  const copyPlan = () => {
    if (!result) return;
    const r = result;
    const phaseTxt = PHASE_META.map(p => {
      const ph = r[p.key];
      if (!ph) return "";
      const goalsTxt = (ph.goals||[]).map(g =>
        `  • ${g.goal}\n${(g.actions||[]).map(a=>`    - ${a}`).join("\n")}\n    → Succès: ${g.success}`
      ).join("\n");
      return `${p.label} — ${p.theme}\n${goalsTxt}`;
    }).join("\n\n");

    const checkTxt = (r.checkpoints||[]).map(c =>
      `Checkpoint ${c.timing} — ${c.focus}\n${(c.questions||[]).map(q=>`  • ${q}`).join("\n")}`
    ).join("\n\n");

    const txt = `Plan 30-60-90 — ${form.employeeName}
Rôle: ${form.role}${form.team?` | ${form.team}`:""}
Gestionnaire: ${form.manager||"N/A"}
Début: ${form.startDate||"N/A"}
Type: ${PLAN_TYPES.find(t=>t.id===form.planType)?.label||form.planType}

${r.summary?.headline||""}

${phaseTxt}

Checkpoints HRBP
${checkTxt}`;

    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  const openArchived = (plan) => {
    setForm({
      employeeName:plan.employeeName, role:plan.role, team:plan.team||"",
      manager:plan.manager||"", province:plan.province||"QC",
      startDate:plan.startDate||"", planType:plan.planType||"new_hire",
      context:plan.context||""
    });
    setResult(plan.output);
    setActivePlan(plan);
    setSaved(true);
    setTab("summary");
    setView("result");
  };

  // ── TABS for result ──────────────────────────────────────────────────────
  const TABS = [
    {id:"summary",    label:"📋 Résumé"},
    {id:"days30",     label:"🔍 30 jours"},
    {id:"days60",     label:"🤝 60 jours"},
    {id:"days90",     label:"🚀 90 jours"},
    {id:"checkpoints",label:"✅ Checkpoints"},
    {id:"copy",       label:"📄 Copier"},
  ];

  const PhaseTab = ({phaseKey}) => {
    const meta = PHASE_META.find(p=>p.key===phaseKey);
    const ph = result?.[phaseKey];
    if (!ph) return null;
    return (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Phase header */}
        <div style={{padding:"12px 16px",background:meta.color+"15",
          border:`1px solid ${meta.color}30`,borderRadius:9,
          borderLeft:`4px solid ${meta.color}`}}>
          <div style={{fontSize:11,color:meta.color,fontFamily:"'DM Mono',monospace",
            letterSpacing:1,marginBottom:4}}>{meta.label.toUpperCase()}</div>
          <div style={{fontSize:15,fontWeight:700,color:C.text}}>{ph.theme||meta.theme}</div>
        </div>

        {/* Goals */}
        {(ph.goals||[]).map((g,i)=>(
          <Card key={i} style={{borderLeft:`3px solid ${meta.color}`}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>
              <span style={{color:meta.color,marginRight:8,fontFamily:"'DM Mono',monospace",
                fontSize:10}}>G{i+1}</span>{g.goal}
            </div>
            {(g.actions||[]).length>0&&(
              <div style={{marginBottom:10}}>
                <Mono color={C.textD} size={8}>ACTIONS</Mono>
                <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                  {g.actions.map((a,j)=>(
                    <div key={j} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <span style={{color:meta.color,flexShrink:0,fontSize:10,marginTop:2}}>→</span>
                      <span style={{fontSize:12,color:C.textM,lineHeight:1.6}}>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{padding:"6px 10px",background:meta.color+"10",
              border:`1px solid ${meta.color}25`,borderRadius:6}}>
              <span style={{fontSize:10,color:meta.color,fontWeight:700}}>✓ Succès: </span>
              <span style={{fontSize:12,color:C.text}}>{g.success}</span>
            </div>
          </Card>
        ))}

        {/* Watchouts + Manager questions */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {(ph.watchouts||[]).length>0&&(
            <Card style={{borderLeft:`3px solid ${C.amber}`}}>
              <Mono color={C.amber} size={9}>SIGNAUX D'ALERTE HRBP</Mono>
              <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>
                {ph.watchouts.map((w,i)=>(
                  <div key={i} style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                    <span style={{color:C.amber,flexShrink:0,fontSize:11}}>⚠</span>
                    <span style={{fontSize:12,color:C.textM,lineHeight:1.55}}>{w}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {(ph.managerQuestions||[]).length>0&&(
            <Card style={{borderLeft:`3px solid ${C.purple}`}}>
              <Mono color={C.purple} size={9}>QUESTIONS GESTIONNAIRE</Mono>
              <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>
                {ph.managerQuestions.map((q,i)=>(
                  <div key={i} style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                    <span style={{color:C.purple,flexShrink:0,fontSize:11}}>Q</span>
                    <span style={{fontSize:12,color:C.textM,lineHeight:1.55,fontStyle:"italic"}}>"{q}"</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  };

  // ── LIST VIEW ───────────────────────────────────────────────────────────
  if (view==="list") return (
    <div style={{maxWidth:860,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:4}}>Plans 30-60-90</div>
          <div style={{fontSize:12,color:C.textM}}>Transitions de rôle · {plans.length} plan{plans.length!==1?"s":""} archivé{plans.length!==1?"s":""}</div>
        </div>
        <button onClick={()=>{setForm({employeeName:"",role:"",team:"",manager:"",province:data.profile?.defaultProvince||"QC",startDate:"",planType:"new_hire",context:""});setResult(null);setSaved(false);setError("");setView("form");}}
          style={{...css.btn(C.em),padding:"9px 20px",fontSize:13}}>
          + Nouveau plan
        </button>
      </div>

      {plans.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{fontSize:40,marginBottom:14}}>📅</div>
          <div style={{fontSize:14,color:C.textM,marginBottom:6}}>Aucun plan archivé</div>
          <div style={{fontSize:12,color:C.textD,maxWidth:380,margin:"0 auto 20px",lineHeight:1.7}}>
            Crée un plan 30-60-90 pour accompagner une transition — embauche, promotion, mobilité ou premier rôle de gestionnaire.
          </div>
          <button onClick={()=>setView("form")} style={{...css.btn(C.em),padding:"10px 24px"}}>+ Nouveau plan</button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {[...plans].reverse().map((plan,i)=>{
            const rc = RISK_C_306(plan.output?.summary?.transitionRisk);
            const typeLabel = PLAN_TYPES.find(t=>t.id===plan.planType)?.label||plan.planType;
            return (
              <button key={plan.id||i} onClick={()=>openArchived(plan)}
                style={{background:C.surfL,border:`1px solid ${rc}28`,
                  borderLeft:`3px solid ${rc}`,borderRadius:8,
                  padding:"12px 14px",cursor:"pointer",textAlign:"left",
                  fontFamily:"'DM Sans',sans-serif"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{plan.employeeName}</div>
                  <div style={{display:"flex",gap:6}}>
                    <div style={{background:rc+"20",border:`1px solid ${rc}40`,
                      borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700,color:rc}}>
                      {plan.output?.summary?.transitionRisk||"—"}
                    </div>
                    <ProvinceBadge province={plan.province}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.textM}}>{plan.role}</span>
                  {plan.team&&<span style={{fontSize:11,color:C.textD}}>· {plan.team}</span>}
                  <Badge label={typeLabel} color={C.blue} size={9}/>
                  <Mono color={C.textD} size={8} style={{marginLeft:"auto"}}>{fmtDate(plan.savedAt)}</Mono>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── FORM VIEW ───────────────────────────────────────────────────────────
  if (view==="form") return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>setView("list")} style={{...css.btn(C.textM,true),padding:"6px 12px",fontSize:11}}>← Retour</button>
        <div style={{fontSize:16,fontWeight:700,color:C.text}}>Nouveau plan 30-60-90</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        {[["Nom de l'employé *","employeeName","Ex: Marie Tremblay"],
          ["Rôle / Titre *","role","Ex: Team Lead – Développement"],
          ["Équipe / Fonction","team","Ex: IT Infrastructure"],
          ["Gestionnaire","manager","Ex: Jean Dupont"],
        ].map(([label,key,ph])=>(
          <div key={key}>
            <Mono color={C.textD} size={9}>{label}</Mono>
            <input value={form[key]} onChange={e=>FF(key,e.target.value)}
              placeholder={ph} style={{...css.input,marginTop:5}}
              onFocus={e=>e.target.style.borderColor=C.em+"60"}
              onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
        ))}
        <div>
          <Mono color={C.textD} size={9}>Date de début</Mono>
          <input type="date" value={form.startDate} onChange={e=>FF("startDate",e.target.value)}
            style={{...css.input,marginTop:5}}/>
        </div>
        <div>
          <Mono color={C.textD} size={9}>Province</Mono>
          <ProvinceSelect value={form.province||data.profile?.defaultProvince||"QC"}
            onChange={e=>FF("province",e.target.value)}
            style={{marginTop:5,width:"100%"}}/>
        </div>
      </div>

      <div style={{marginBottom:12}}>
        <Mono color={C.textD} size={9}>Type de transition</Mono>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
          {PLAN_TYPES.map(t=>(
            <button key={t.id} onClick={()=>FF("planType",t.id)}
              style={{padding:"6px 12px",borderRadius:6,fontSize:12,cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",border:"none",
                background:form.planType===t.id?C.em+"22":C.surfL,
                color:form.planType===t.id?C.em:C.textM,
                fontWeight:form.planType===t.id?700:400,
                outline:form.planType===t.id?`1px solid ${C.em}55`:"none"}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{marginBottom:16}}>
        <Mono color={C.textD} size={9}>Contexte / Notes</Mono>
        <textarea rows={4} value={form.context} onChange={e=>FF("context",e.target.value)}
          placeholder="Ex: Employé senior promu au rôle de gestionnaire d'équipe. Forte crédibilité technique mais peu d'expérience en gestion de personnes. Équipe sous pression de livraison."
          style={{...css.textarea,marginTop:5,fontSize:13}}
          onFocus={e=>e.target.style.borderColor=C.em+"60"}
          onBlur={e=>e.target.style.borderColor=C.border}/>
      </div>

      {error&&<div style={{background:C.red+"15",border:`1px solid ${C.red}33`,borderRadius:7,
        padding:"9px 14px",marginBottom:12,fontSize:12,color:C.red}}>⚠ {error}</div>}

      {loading?<AILoader label="Génération du plan 30-60-90…"/>:(
        <button onClick={generate}
          disabled={!form.employeeName.trim()||!form.role.trim()}
          style={{...css.btn(C.em),width:"100%",padding:"13px",fontSize:14,
            opacity:form.employeeName.trim()&&form.role.trim()?1:.4,
            boxShadow:form.employeeName.trim()?`0 4px 20px ${C.em}30`:"none"}}>
          📅 Générer le plan 30-60-90
        </button>
      )}
    </div>
  );

  // ── RESULT VIEW ─────────────────────────────────────────────────────────
  return (
    <div style={{maxWidth:860,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button onClick={()=>setView("list")} style={{...css.btn(C.textM,true),padding:"6px 12px",fontSize:11}}>← Retour</button>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text}}>{form.employeeName}</div>
          <div style={{fontSize:11,color:C.textM}}>{form.role}{form.team?` · ${form.team}`:""}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={copyPlan}
            style={{...css.btn(copied?C.em:C.textM,true),padding:"7px 14px",fontSize:12}}>
            {copied?"✓ Copié":"📋 Copier"}
          </button>
          <button onClick={savePlan} disabled={saved}
            style={{...css.btn(saved?C.textD:C.em),padding:"7px 16px",fontSize:12,opacity:saved?.5:1}}>
            {saved?"✓ Archivé":"💾 Archiver"}
          </button>
        </div>
      </div>

      {/* 3-phase strip */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {PHASE_META.map(p=>(
          <div key={p.key} style={{padding:"10px 14px",background:p.color+"12",
            border:`1px solid ${p.color}25`,borderRadius:8,textAlign:"center",cursor:"pointer"}}
            onClick={()=>setTab(p.key)}>
            <div style={{fontSize:18,marginBottom:4}}>{p.icon}</div>
            <div style={{fontSize:11,fontWeight:700,color:p.color}}>{p.label}</div>
            <div style={{fontSize:10,color:C.textD,marginTop:2}}>{p.theme}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:2,borderBottom:`1px solid ${C.border}`,marginBottom:14,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:"none",border:"none",cursor:"pointer",padding:"7px 13px",
              fontSize:11,fontWeight:tab===t.id?700:400,
              color:tab===t.id?C.em:C.textM,whiteSpace:"nowrap",
              borderBottom:`2px solid ${tab===t.id?C.em:"transparent"}`,
              marginBottom:-1,fontFamily:"'DM Sans',sans-serif"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary tab */}
      {tab==="summary"&&result?.summary&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Card style={{borderLeft:`4px solid ${RISK_C_306(result.summary.transitionRisk)}`}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <div style={{background:RISK_C_306(result.summary.transitionRisk)+"22",
                border:`1px solid ${RISK_C_306(result.summary.transitionRisk)}44`,
                borderRadius:6,padding:"4px 12px",fontSize:12,fontWeight:700,
                color:RISK_C_306(result.summary.transitionRisk)}}>
                Risque: {result.summary.transitionRisk}
              </div>
              <Badge label={PLAN_TYPES.find(t=>t.id===form.planType)?.label||form.planType} color={C.blue}/>
              <ProvinceBadge province={form.province||data.profile?.defaultProvince||"QC"}/>
            </div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>{result.summary.headline}</div>
            <div style={{fontSize:13,color:C.textM,lineHeight:1.7,fontStyle:"italic"}}>{result.summary.hrbpNote}</div>
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Employé",form.employeeName],["Rôle",form.role],
              ["Équipe",form.team],["Gestionnaire",form.manager],
              ["Début",form.startDate?fmtDate(form.startDate):"N/A"],
            ].filter(([,v])=>v).map(([l,v])=>(
              <div key={l} style={{padding:"8px 12px",background:C.surfLL,borderRadius:7}}>
                <Mono color={C.textD} size={8}>{l}</Mono>
                <div style={{fontSize:13,color:C.text,marginTop:3}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase tabs */}
      {(tab==="days30"||tab==="days60"||tab==="days90")&&<PhaseTab phaseKey={tab}/>}

      {/* Checkpoints tab */}
      {tab==="checkpoints"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {(result?.checkpoints||[]).map((c,i)=>{
            const meta = PHASE_META[i]||PHASE_META[0];
            return (
              <Card key={i} style={{borderLeft:`3px solid ${meta.color}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{background:meta.color+"22",border:`1px solid ${meta.color}44`,
                    borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700,color:meta.color}}>
                    {c.timing}
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{c.focus}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {(c.questions||[]).map((q,j)=>(
                    <div key={j} style={{display:"flex",gap:8,padding:"6px 10px",
                      background:C.surfLL,borderRadius:6}}>
                      <span style={{color:meta.color,flexShrink:0,fontSize:11}}>Q</span>
                      <span style={{fontSize:12,color:C.textM,fontStyle:"italic"}}>"{q}"</span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Copy tab */}
      {tab==="copy"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
            <button onClick={copyPlan}
              style={{...css.btn(copied?C.em:C.blue),padding:"7px 18px",fontSize:12}}>
              {copied?"✓ Copié !":"📋 Copier le plan complet"}
            </button>
          </div>
          <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,
            padding:"14px 16px",fontSize:12,color:C.textM,lineHeight:1.85,
            whiteSpace:"pre-wrap",fontFamily:"'DM Mono',monospace",
            maxHeight:480,overflowY:"auto"}}>
{`Plan 30-60-90 — ${form.employeeName}
Rôle: ${form.role}${form.team?` | ${form.team}`:""}
Gestionnaire: ${form.manager||"N/A"} | Début: ${form.startDate?fmtDate(form.startDate):"N/A"}
Type: ${PLAN_TYPES.find(t=>t.id===form.planType)?.label||form.planType}
Risque de transition: ${result?.summary?.transitionRisk||"—"}

${result?.summary?.headline||""}
${result?.summary?.hrbpNote||""}

${PHASE_META.map(p=>{
  const ph = result?.[p.key];
  if(!ph) return "";
  const goalsTxt = (ph.goals||[]).map((g,i)=>
    `  ${i+1}. ${g.goal}\n${(g.actions||[]).map(a=>`     → ${a}`).join("\n")}\n     ✓ ${g.success}`
  ).join("\n");
  return `━━━ ${p.label} — ${ph.theme||p.theme} ━━━\n${goalsTxt}\n\nAlertes HRBP:\n${(ph.watchouts||[]).map(w=>`  ⚠ ${w}`).join("\n")}\n\nQuestions gestionnaire:\n${(ph.managerQuestions||[]).map(q=>`  • "${q}"`).join("\n")}`;
}).join("\n\n")}

━━━ CHECKPOINTS ━━━
${(result?.checkpoints||[]).map(c=>`${c.timing} — ${c.focus}\n${(c.questions||[]).map(q=>`  • ${q}`).join("\n")}`).join("\n\n")}`}
          </div>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MODULE: KNOWLEDGE BASE (from HRBP Interactive Guide v3)
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// MODULE: PLAYBOOKS WORKSHOP
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: WORKSHOP — Playbooks HRBP
// ══════════════════════════════════════════════════════════════════════════════

const WORKSHOP_DB = [
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


function ModuleWorkshop() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [openId, setOpenId] = useState(null);
  const [activeSection, setActiveSection] = useState({});

  // ── Coach Me state
  const [coachId, setCoachId] = useState(null);      // which workshop has panel open
  const [coachSit, setCoachSit] = useState({});      // situation per workshop
  const [coachCtx, setCoachCtx] = useState({});      // optional context per workshop
  const [coachMgr, setCoachMgr] = useState({});      // manager profile per workshop
  const [coachPrompt, setCoachPrompt] = useState({}); // generated prompt per workshop
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

// ══════════════════════════════════════════════════════════════════════════════
// MODULE: CONVERSATION KIT + PROMPT LIBRARY
// ══════════════════════════════════════════════════════════════════════════════

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


// ══════════════════════════════════════════════════════════════════════════════
// MODULE: AUTO PROMPT ENGINE
// ══════════════════════════════════════════════════════════════════════════════

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
Historique: ${ctx.history || "Aucun"}

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
Dernier feedback connu: ${ctx.history || "aucun"}

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
  const cases    = (data.cases||[]).filter(c=>c.status==="active"||c.status==="open");
  const meetings = (data.meetings||[]).slice().reverse().slice(0,10);
  const signals  = (data.signals||[]).slice().reverse().slice(0,8);
  const radar    = (data.radars||[])[0]?.radar;
  const prevRadar= (data.radars||[])[1]?.radar;
  const portfolio= data.portfolio||[];

  const RS = {"Critique":4,"Élevé":3,"Eleve":3,"Modéré":2,"Modere":2,"Faible":1};

  // Helper: days since a date string
  const daysSince = (d) => d ? Math.floor((Date.now()-new Date(d).getTime())/86400000) : 999;

  // ── Flight risk ──
  const flightCases   = cases.filter(c=>/retent|départ|flight|quitt/i.test(c.type+c.title+c.situation));
  const flightSignals = signals.filter(s=>/retent|départ|quitt|flight|démission/i.test((s.analysis?.title||"")+(s.analysis?.interpretation||"")));
  const flightMgrs    = portfolio.filter(m=>/flight|retent/i.test(m.topIssue||""));
  if (flightCases.length||flightSignals.length||flightMgrs.length) {
    const evidenceCount = flightCases.length + flightSignals.length + flightMgrs.length;
    const conf = evidenceCount>=3?"Élevée":evidenceCount>=2?"Moyenne":"Faible";
    const newestCase = flightCases.sort((a,b)=>daysSince(a.openDate)-daysSince(b.openDate))[0];
    const prevFlightCount = (prevRadar?.patternTracking||[]).find(p=>/retent|flight/i.test(p.pattern))?.count||0;
    situations.push({
      id:"flight_risk", urgency:"Élevé", template:"flight_risk",
      title:"Flight risk détecté",
      reason:`${flightCases.length} cas rétention · ${flightSignals.length} signaux départ · ${flightMgrs.length} profil(s) portfolio`,
      confidence: conf,
      evidence: [
        flightCases.length && `${flightCases.length} cas actif(s) rétention (${flightCases.map(c=>c.riskLevel).join(", ")})`,
        flightSignals.length && `${flightSignals.length} signal(s) récent(s) de départ potentiel`,
        flightMgrs.length && `${flightMgrs.map(m=>m.name).join(", ")} marqué(s) flight risk dans Portfolio`,
        newestCase?.openDate && `Cas le plus récent ouvert il y a ${daysSince(newestCase.openDate)} jours`,
      ].filter(Boolean).slice(0,4),
      whyNow: prevFlightCount && flightCases.length > prevFlightCount
        ? `+${flightCases.length-prevFlightCount} nouveau(x) cas depuis le dernier radar — le signal s'amplifie.`
        : newestCase && daysSince(newestCase.openDate) < 7
          ? `Cas ouvert il y a ${daysSince(newestCase.openDate)} jours — fenêtre d'intervention encore ouverte.`
          : `Départs silencieux: les décisions se prennent avant la démission. La fenêtre se ferme.`,
      bestNextMove: flightCases[0]?.director
        ? `Conversation directe avec ${flightCases[0].director} — poser la question sans détour: est-ce qu'il envisage de partir?`
        : `Identifier le profil à plus haut impact et poser la question directement cette semaine.`,
      context:{
        signals:[...flightCases.map(c=>`Cas: ${c.title} (${c.riskLevel})`), ...flightSignals.map(s=>s.analysis?.title||"Signal rétention")].join("; ")||"Signaux rétention détectés",
        managerName:flightMgrs[0]?.name||flightCases[0]?.director||"",
        team:flightMgrs[0]?.team||"",
        history:flightCases[0]?.interventionsDone||"",
      },
      source:"Cases + Signaux", icon:"✈️", color:C.teal,
    });
  }

  // ── Manager avoidance ──
  const avoidMgrs  = portfolio.filter(m=>m.type==="Évitant"||m.type==="Evitant");
  const avoidMeets = meetings.filter(m=>/évit|avoid|report|delay|n.a pas eu/i.test((m.analysis?.overallRiskRationale||"")+(m.analysis?.summary||[]).join(" ")));
  if (avoidMgrs.length||avoidMeets.length) {
    const highRisk = avoidMgrs.filter(m=>m.risk==="Critique"||m.risk==="Élevé"||m.risk==="Eleve");
    const conf = highRisk.length>=2?"Élevée":avoidMgrs.length>=2||avoidMeets.length?"Moyenne":"Faible";
    const mostOverdue = avoidMgrs.sort((a,b)=>daysSince(b.lastInteraction)-daysSince(a.lastInteraction))[0];
    situations.push({
      id:"manager_avoidance",
      urgency:highRisk.length?"Élevé":"Modéré",
      template:"manager_challenge",
      title:"Évitement gestionnaire",
      reason:`${avoidMgrs.length} gestionnaire(s) évitant(s) — ${highRisk.length} à risque élevé+`,
      confidence: conf,
      evidence:[
        avoidMgrs.length && `${avoidMgrs.length} gestionnaire(s) classifié(s) Évitant dans Portfolio`,
        highRisk.length && `${highRisk.map(m=>m.name).join(", ")} — risque Élevé ou Critique`,
        avoidMeets.length && `${avoidMeets.length} meeting(s) avec signaux d'évitement dans les transcripts`,
        mostOverdue?.lastInteraction && `${mostOverdue.name}: dernière interaction il y a ${daysSince(mostOverdue.lastInteraction)} jours`,
      ].filter(Boolean).slice(0,4),
      whyNow: mostOverdue && daysSince(mostOverdue.lastInteraction)>21
        ? `${mostOverdue.name} sans contact depuis ${daysSince(mostOverdue.lastInteraction)} jours — le problème s'installe sans intervention.`
        : highRisk.length
          ? `${highRisk.length} profil(s) à risque élevé sans action HRBP documentée — chaque semaine d'inaction valide le pattern.`
          : `Pattern d'évitement visible dans les transcripts — il s'amplifie sans signal clair de changement.`,
      bestNextMove:`Nommer le pattern directement à ${avoidMgrs[0]?.name||"ce gestionnaire"} — pas une suggestion, un constat. Fixer une date d'action cette semaine.`,
      context:{
        signals:avoidMgrs.map(m=>`${m.name}: ${m.topIssue||"évitement"}`).join("; ")||"Pattern évitement",
        managerName:avoidMgrs[0]?.name||"",
        managerType:"Évitant",
        history:avoidMgrs[0]?.hrbpAction||"",
      },
      source:"Portfolio", icon:"🫥", color:C.amber,
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
  const perfCases = cases.filter(c=>/perf|pip|plan|correct/i.test(c.type+c.title));
  const perfMeets = meetings.filter(m=>/performance|pip|correct/i.test((m.analysis?.summary||[]).join(" ")+(m.analysis?.overallRiskRationale||"")));
  if (perfCases.length||perfMeets.length) {
    const critPerf = perfCases.filter(c=>c.riskLevel==="Critique"||c.riskLevel==="Élevé"||c.riskLevel==="Eleve");
    const stalePerf = perfCases.filter(c=>!c.interventionsDone&&daysSince(c.openDate)>30);
    const conf = critPerf.length?"Élevée":perfCases.length>=2?"Moyenne":"Faible";
    situations.push({
      id:"performance", urgency:critPerf.length?"Critique":"Élevé",
      template:"performance_escalation",
      title:"Enjeu de performance actif",
      reason:`${perfCases.length} cas performance · ${perfMeets.length} meeting(s) avec signaux`,
      confidence: conf,
      evidence:[
        perfCases.length && `${perfCases.length} cas actif(s): ${perfCases.map(c=>c.title).join(", ")}`,
        critPerf.length && `${critPerf.length} cas à risque Critique ou Élevé`,
        stalePerf.length && `${stalePerf.length} cas sans intervention documentée depuis +30 jours`,
        perfMeets.length && `${perfMeets.length} meeting(s) avec signaux performance dans les transcripts`,
      ].filter(Boolean).slice(0,4),
      whyNow: stalePerf.length
        ? `${stalePerf.length} cas ouvert(s) depuis +30 jours sans intervention — chaque semaine sans action fragilise la position légale.`
        : critPerf.length
          ? `Cas à risque Critique en cours — fenêtre d'action disciplinaire ou PIP à sécuriser rapidement.`
          : `Signaux performance dans les meetings récents — documenter maintenant avant que ça devienne un dossier.`,
      bestNextMove: stalePerf[0]
        ? `Revoir le cas "${stalePerf[0].title}" avec ${stalePerf[0].director||"le gestionnaire"} — soit on documente un plan, soit on le ferme. Pas de zone grise.`
        : `Confirmer avec ${perfCases[0]?.director||"le gestionnaire"} que la documentation du cas est à jour cette semaine.`,
      context:{
        signals:perfCases.map(c=>`${c.title}: ${c.situation?.substring(0,80)||""}`).join("; ")||perfMeets.map(m=>m.analysis?.overallRiskRationale||"").join("; "),
        history:perfCases[0]?.interventionsDone||"",
        managerName:perfCases[0]?.director||"",
        duration:perfCases[0]?.openDate?`Depuis ${fmtDate(perfCases[0].openDate)}`:"N/A",
      },
      source:"Cases + Meetings", icon:"📉", color:C.red,
    });
  }

  // ── Conflict ──
  const conflictCases   = cases.filter(c=>/conflit|conflict|tension|harc/i.test(c.type+c.title+c.situation));
  const conflictSignals = signals.filter(s=>/conflit|tension|conflict/i.test((s.analysis?.title||"")+(s.analysis?.category||"")));
  if (conflictCases.length||conflictSignals.length) {
    const oldConflicts = conflictCases.filter(c=>daysSince(c.openDate)>14&&!c.interventionsDone);
    const conf = conflictCases.length>=2||conflictSignals.length>=2?"Élevée":conflictCases.length+conflictSignals.length>=2?"Moyenne":"Faible";
    situations.push({
      id:"conflict", urgency:"Élevé",
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
      context:{
        signals:conflictCases.map(c=>c.title).join("; ")||conflictSignals.map(s=>s.analysis?.title||"").join("; "),
        managers:conflictCases.map(c=>c.director||c.employee||"").filter(Boolean).join(" vs ")||"",
        history:conflictCases[0]?.interventionsDone||"",
        duration:conflictCases[0]?.openDate?`Depuis ${fmtDate(conflictCases[0].openDate)}`:"N/A",
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
        cases:cases.map(c=>`${c.title} (${c.riskLevel})`).join("; ")||"Aucun",
        patterns:rising.map(p=>`${p.pattern}: ${p.count} ${p.unit} ↑`).join("; "),
      },
      source:"Org Radar — Pattern Tracking", icon:"📊", color:C.purple,
    });
  }

  // ── Leadership misalignment ──
  const misalignPort  = portfolio.filter(m=>m.type==="Politique");
  const execMeetings  = meetings.filter(m=>(m.meetingType==="executif"||m.meetingType==="vp")&&m.analysis?.overallRisk&&(RS[m.analysis.overallRisk]||0)>=2);
  if (misalignPort.length||execMeetings.length) {
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
      context:{
        signals:misalignPort.map(m=>`${m.name}: ${m.topIssue||""}`).join("; ")||execMeetings.map(m=>m.analysis?.overallRiskRationale||"").join("; "),
        managerName:misalignPort[0]?.name||"",
        cases:cases.map(c=>c.title).join("; ")||"",
        history:misalignPort[0]?.notes||"",
      },
      source:"Portfolio + Meetings", icon:"🔀", color:C.purple,
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
    return score;
  };

  return situations.sort((a,b)=>pScore(b)-pScore(a));
}

// ── Module ────────────────────────────────────────────────────────────────────
function ModuleAutoPrompt({ data }) {
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

const CONV_CATEGORIES = ["Tous", "Performance", "Leadership", "Rétention", "Relations de travail", "Stratégie RH", "Développement", "Gestion des absences"];
const PROMPT_CATEGORIES = ["Tous", "Stratégie hebdomadaire", "Coaching gestionnaires", "Situations difficiles", "Rétention", "Gestion de la performance", "Communication exécutive", "Diagnostic organisationnel"];

function ModuleConvKit() {
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



// ══════════════════════════════════════════════════════════════════════════════
// MODULE: KNOWLEDGE BASE
// ══════════════════════════════════════════════════════════════════════════════
function ModuleKnowledge() {
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

  // search index
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
          <div style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:6 }}>Knowledge Base</div>
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
          placeholder="Rechercher dans la Knowledge Base..."
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



// ══════════════════════════════════════════════════════════════════════════════
// MAIN HRBP OS
// ══════════════════════════════════════════════════════════════════════════════
const NAV_MAIN = [
  { id:"home",     icon:"🏠", label:"Home",      color:C.em },
  { id:"copilot",  icon:"⚡", label:"Copilot",   color:C.em },
  { id:"autoprompt",icon:"🧩", label:"Prompt AI",  color:C.purple },
  { id:"meetings", icon:"🎙️", label:"Meetings",   color:C.blue },
  { id:"prep1on1", icon:"🗂️", label:"Prép. 1:1",  color:C.blue },
  { id:"cases",    icon:"📂", label:"Case Log",   color:C.blue },
  { id:"signals",  icon:"📡", label:"Signaux",    color:C.purple },
  { id:"brief",    icon:"📊", label:"Weekly",     color:C.amber },
];
const NAV_MORE = [
  { id:"radar",       icon:"🔭", label:"Org Radar",   color:C.red },
  { id:"portfolio",   icon:"👥", label:"Portfolio",   color:C.teal },
  { id:"decisions",  icon:"⚖️", label:"Décisions",  color:C.red },
  { id:"coaching",   icon:"🤝", label:"Coaching",   color:C.teal },
  { id:"investigation",icon:"🔍",label:"Enquêtes",  color:"#7a1e2e"},
  { id:"exit",       icon:"🚪", label:"Départs",    color:C.textM },
  { id:"workshop",   icon:"🛠️", label:"Workshop",  color:C.blue },
  { id:"convkit",    icon:"💬", label:"Conv Kit",    color:C.em },
  { id:"plans306090",icon:"📅", label:"30-60-90",   color:C.em },
  { id:"knowledge",  icon:"🧠", label:"Knowledge",  color:C.blue },
];

const APP_PASSWORD = "7ech$avy$ammy";
const AUTH_KEY = "hrbpos_auth";

function LoginScreen({ onAuth }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const attempt = () => {
    if (pw === APP_PASSWORD) {
      localStorage.setItem(AUTH_KEY, "1");
      onAuth();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPw("");
    }
  };

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
      <div style={{ width:340, animation:shake?"shake .4s ease":undefined }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:44, height:44, background:C.em, borderRadius:10,
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            fontSize:20, marginBottom:12 }}>⚡</div>
          <div style={{ fontWeight:700, fontSize:18, color:C.text }}>HRBP OS</div>
          <div style={{ fontSize:12, color:C.textM, marginTop:4 }}>Samuel Chartrand</div>
        </div>
        <div style={{ background:C.surf, border:`1px solid ${error?C.red+"66":C.border}`,
          borderRadius:12, padding:"24px 24px 20px", transition:"border-color .2s" }}>
          <label style={{ fontSize:11, fontWeight:600, color:C.textM,
            letterSpacing:.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>
            Mot de passe
          </label>
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setError(false);}}
            onKeyDown={e=>e.key==="Enter"&&attempt()}
            autoFocus
            placeholder="••••••••••••"
            style={{ ...css.input, marginBottom: error?8:16,
              borderColor: error ? C.red+"66" : C.border }} />
          {error && (
            <div style={{ fontSize:11, color:C.red, marginBottom:12 }}>
              Mot de passe incorrect.
            </div>
          )}
          <button onClick={attempt}
            style={{ ...css.btn(C.em), width:"100%", padding:"11px", fontSize:13 }}>
            Entrer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HRBPOS() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(AUTH_KEY) === "1");
  const [module, setModule] = useState("home");
  const [showMore, setShowMore] = useState(false);
  const [data, setData] = useState({ cases:[], meetings:[], signals:[], decisions:[], coaching:[], exits:[], investigations:[], briefs:[], prep1on1:[], sentRecaps:[], portfolio:[], radars:[], nextWeekLocks:[], plans306090:[], profile:{ defaultProvince:"QC" } });
  const [toast, setToast] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load all data on mount — always resolves even if storage fails
  useEffect(() => {
    const defaults = { cases:[], meetings:[], signals:[], decisions:[], coaching:[], exits:[], investigations:[], briefs:[], prep1on1:[], sentRecaps:[], portfolio:[], radars:[], nextWeekLocks:[], plans306090:[], profile:{ defaultProvince:"QC" } };
    const timeout = setTimeout(() => setLoaded(true), 1500);
    Promise.allSettled(
      Object.entries(SK).map(async ([k, sk]) => {
        try { const v = await sGet(sk); return [k, v ?? defaults[k]]; }
        catch { return [k, defaults[k]]; }
      })
    ).then(results => {
      clearTimeout(timeout);
      const entries = results.map(r => r.status === "fulfilled" ? r.value : null).filter(Boolean);
      if (entries.length > 0) setData(d => ({ ...d, ...Object.fromEntries(entries) }));
      setLoaded(true);
    }).catch(() => { clearTimeout(timeout); setLoaded(true); });
  }, []);

  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 2000); };

  const handleBackup = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-CA");
    const backup = {
      backup_date: dateStr,
      backup_time: now.toLocaleTimeString("fr-CA"),
      version: "HRBP_OS",
      counts: {
        cases:         (data.cases||[]).length,
        meetings:      (data.meetings||[]).length,
        signals:       (data.signals||[]).length,
        decisions:     (data.decisions||[]).length,
        coaching:      (data.coaching||[]).length,
        exits:         (data.exits||[]).length,
        investigations:(data.investigations||[]).length,
        briefs:        (data.briefs||[]).length,
        prep1on1:      (data.prep1on1||[]).length,
        sentRecaps:    (data.sentRecaps||[]).length,
      },
      data,
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `HRBP_OS_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [restoreStatus, setRestoreStatus] = useState(null); // null | "loading" | "success" | "error"
  const [restoreMsg, setRestoreMsg]       = useState("");
  const fileInputRef = useRef(null);

  const handleRestoreClick = () => fileInputRef.current?.click();

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be reloaded
    setRestoreStatus("loading");
    setRestoreMsg("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // Support both formats: { data: {...} } or direct data object
      const restored = parsed.data || parsed;
      const keys = ["cases","meetings","signals","decisions","coaching","exits","investigations","briefs","prep1on1","sentRecaps","plans306090","profile"];
      // Write to storage and update state
      const updates = {};
      for (const k of keys) {
        if (restored[k] !== undefined) {
          const skKey = SK[k];
          if (skKey) await sSet(skKey, restored[k]);
          updates[k] = restored[k];
        }
      }
      setData(d => ({ ...d, ...updates }));
      const total = Object.values(updates).reduce((acc, v) => acc + (Array.isArray(v) ? v.length : 0), 0);
      setRestoreStatus("success");
      setRestoreMsg(`${total} entrées restaurées${parsed.backup_date ? ` (backup du ${parsed.backup_date})` : ""}`);
      setTimeout(() => setRestoreStatus(null), 4000);
    } catch(err) {
      setRestoreStatus("error");
      setRestoreMsg("Fichier invalide — vérifie que c'est un backup HRBP OS.");
      setTimeout(() => setRestoreStatus(null), 4000);
    }
  };

  const handleSave = useCallback(async (key, value) => {
    const skKey = SK[key];
    if (!skKey) return;
    await sSet(skKey, value);
    setData(d => ({ ...d, [key]: value }));
    showToast();
  }, []);

  // Meeting save also creates case entry
  const handleSaveMeeting = useCallback(async (session, caseEntry) => {
    // Dedup: skip if this id already saved
    if ((data.meetings||[]).some(m => m.id === session.id)) return;
    const newMeetings = [...(data.meetings||[]), session];
    await sSet(SK.meetings, newMeetings);
    setData(d => ({ ...d, meetings: newMeetings }));

    if (caseEntry) {
      const newCase = {
        id: Date.now().toString(),
        title: caseEntry.title || session.analysis?.meetingTitle,
        type: "conflict_ee",
        riskLevel: caseEntry.riskLevel || session.analysis?.overallRisk,
        status: "active",
        director: session.director,
        employee: "",
        department: "",
        openDate: session.savedAt,
        situation: caseEntry.situation,
        interventionsDone: caseEntry.interventionsDone,
        hrPosition: caseEntry.hrPosition,
        nextFollowUp: caseEntry.nextFollowUp,
        notes: caseEntry.notes,
        actions: (session.analysis?.actions||[]).map(a => ({ ...a, done:false })),
        updatedAt: session.savedAt,
      };
      const newCases = [...(data.cases||[]), newCase];
      await sSet(SK.cases, newCases);
      setData(d => ({ ...d, cases: newCases }));
    }
    showToast();
  }, [data]);

  const handleUpdateMeeting = useCallback(async (updatedSession) => {
    const newMeetings = (data.meetings||[]).map(m =>
      m.id === updatedSession.id ? updatedSession : m
    );
    await sSet(SK.meetings, newMeetings);
    setData(d => ({ ...d, meetings: newMeetings }));
    showToast();
  }, [data]);

  const allNav = [...NAV_MAIN, ...NAV_MORE];
  const activeNav = allNav.find(n => n.id === module);

  if (!authed) return <LoginScreen onAuth={() => setAuthed(true)} />;

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif", color:C.text, overflow:"hidden" }}>
      <style>{FONTS}</style>
      <style>{`*{box-sizing:border-box}textarea,input,select{outline:none}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}.fadein{animation:fadeIn .2s ease both}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.borderL};border-radius:4px}`}</style>

      {/* ── SIDEBAR ── */}
      <div style={{ width:200, background:C.surf, borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column", flexShrink:0, padding:"16px 10px" }}>

        {/* Logo */}
        <div style={{ padding:"8px 10px", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ width:26, height:26, background:C.em, borderRadius:6,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>⚡</div>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:C.text, lineHeight:1.1 }}>HRBP OS</div>
              <Mono color={C.textD} size={8}>Samuel Chartrand</Mono>
            </div>
          </div>
        </div>

        {/* Main nav */}
        <div style={{ display:"flex", flexDirection:"column", gap:2, flex:1 }}>
          {NAV_MAIN.map(n => (
            <button key={n.id} onClick={() => { setModule(n.id); setShowMore(false); }}
              style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 12px",
                background:module===n.id ? n.color+"18" : "none",
                border:`1px solid ${module===n.id ? n.color+"44" : "transparent"}`,
                borderRadius:8, cursor:"pointer", textAlign:"left", width:"100%",
                fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>
              <span style={{ fontSize:14, lineHeight:1 }}>{n.icon}</span>
              <span style={{ fontSize:13, fontWeight:module===n.id?600:400,
                color:module===n.id ? n.color : C.textM }}>{n.label}</span>
            </button>
          ))}

          <Divider my={8}/>

          {/* More toggle */}
          <button onClick={() => setShowMore(s=>!s)}
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px",
              background:"none", border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", width:"100%", marginBottom:4 }}>
            <span style={{ fontSize:12, color:C.textM }}>Plus</span>
            <span style={{ fontSize:10, color:C.textD }}>{showMore?"▲":"▼"}</span>
          </button>

          {showMore && NAV_MORE.map(n => (
            <button key={n.id} onClick={() => setModule(n.id)}
              style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 12px",
                background:module===n.id ? n.color+"18":"none",
                border:`1px solid ${module===n.id ? n.color+"44" : "transparent"}`,
                borderRadius:8, cursor:"pointer", textAlign:"left", width:"100%",
                fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>
              <span style={{ fontSize:13 }}>{n.icon}</span>
              <span style={{ fontSize:12, fontWeight:module===n.id?600:400,
                color:module===n.id ? n.color : C.textM }}>{n.label}</span>
            </button>
          ))}
        </div>

        {/* Province par défaut */}
        <div style={{ display:"flex", alignItems:"center", gap:8,
          padding:"7px 12px", marginBottom:8,
          background:C.surfL, borderRadius:8, border:`1px solid ${C.border}` }}>
          <span style={{ fontSize:11, color:C.textM, flex:1, fontWeight:500 }}>Province</span>
          <ProvinceSelect
            value={data.profile?.defaultProvince||"QC"}
            onChange={e => {
              const updated = { ...(data.profile||{}), defaultProvince: e.target.value };
              handleSave("profile", updated);
            }}
            style={{ padding:"4px 6px", fontSize:11, borderRadius:5 }}/>
        </div>

        {/* Footer stats */}
        <button onClick={handleBackup}
          style={{ width:"100%", display:"flex", alignItems:"center", gap:8,
            padding:"8px 12px", background:"none",
            border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif", marginBottom:6, transition:"all .15s" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.em+"66"}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <span style={{ fontSize:13 }}>💾</span>
          <span style={{ fontSize:12, color:C.textM, fontWeight:500 }}>Backup JSON</span>
        </button>

        <input ref={fileInputRef} type="file" accept=".json" onChange={handleRestoreFile}
          style={{ display:"none" }}/>
        <button onClick={handleRestoreClick}
          style={{ width:"100%", display:"flex", alignItems:"center", gap:8,
            padding:"8px 12px", background:"none",
            border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif", marginBottom:8, transition:"all .15s" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.blue+"66"}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <span style={{ fontSize:13 }}>📂</span>
          <span style={{ fontSize:12, color:C.textM, fontWeight:500 }}>
            {restoreStatus === "loading" ? "Chargement…" : "Charger backup"}
          </span>
        </button>

        {restoreStatus && restoreStatus !== "loading" && (
          <div style={{ margin:"0 0 8px", padding:"7px 10px", borderRadius:7, fontSize:11,
            background: restoreStatus === "success" ? C.em+"15" : C.red+"15",
            border:`1px solid ${restoreStatus === "success" ? C.em+"40" : C.red+"40"}`,
            color: restoreStatus === "success" ? C.em : C.red,
            lineHeight:1.5 }}>
            {restoreStatus === "success" ? "✓ " : "⚠ "}{restoreMsg}
          </div>
        )}

        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, marginTop:8 }}>
          {[
            ["Cas actifs", (data.cases||[]).filter(c=>c.status==="active"||c.status==="open").length, C.em],
            ["Meetings",   (data.meetings||[]).length,  C.blue],
            ["Signaux",    (data.signals||[]).length,   C.purple],
            ["Stratégies", (data.decisions||[]).length, C.red],
            ["Coaching",   (data.coaching||[]).length,  C.teal],
            ["Départs",    (data.exits||[]).length,     C.textM],
            ["Enquêtes",   (data.investigations||[]).length, INV_RED||"#7a1e2e"],
            ["Briefs",     (data.briefs||[]).length,    C.amber],
          ].map(([l,v,col],i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <Mono color={C.textD} size={8}>{l}</Mono>
              <Mono color={col} size={8}>{v}</Mono>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{ background:C.surf, borderBottom:`1px solid ${C.border}`,
          padding:"12px 24px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <span style={{ fontSize:16 }}>{activeNav?.icon}</span>
          <span style={{ fontSize:15, fontWeight:600, color:C.text }}>{activeNav?.label}</span>
          <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
            {(data.cases||[]).filter(c=>(c.riskLevel==="Critique"||c.riskLevel==="Élevé")&&(c.status==="active"||c.status==="open")).slice(0,3).map((c,i) => (
              <button key={i} onClick={()=>setModule("cases")}
                style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:5,
                  padding:"3px 10px", fontSize:10, color:C.red, cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif" }}>
                ⚠ {c.title?.substring(0,20)}{c.title?.length>20?"…":""}
              </button>
            ))}
          </div>
        </div>

        {/* Module area */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px" }} className="fadein">
          {!loaded ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%" }}>
              <AILoader label="Chargement du système"/>
            </div>
          ) : module === "home" ? (
            <ModuleHome data={data} onNavigate={setModule}/>
          ) : module === "radar" ? (
            <ModuleRadar data={data} onSave={handleSave}/>
          ) : module === "portfolio" ? (
            <ModulePortfolio data={data} onSave={handleSave}/>
          ) : module === "copilot" ? (
            <ModuleCopilot data={data}/>
          ) : module === "meetings" ? (
            <ModuleMeetings data={data} onSaveSession={handleSaveMeeting} onUpdateMeeting={handleUpdateMeeting} onNavigate={setModule}/>
          ) : module === "prep1on1" ? (
            <Module1on1Prep data={data} onSave={handleSave} onNavigate={setModule}/>
          ) : module === "cases" ? (
            <ModuleCases data={data} onSave={handleSave}/>
          ) : module === "signals" ? (
            <ModuleSignals data={data} onSave={handleSave}/>
          ) : module === "brief" ? (
            <ModuleBrief data={data} onSave={handleSave}/>
          ) : module === "decisions" ? (
            <ModuleDecisions data={data} onSave={handleSave}/>
          ) : module === "coaching" ? (
            <ModuleCoaching data={data} onSave={handleSave}/>
          ) : module === "investigation" ? (
            <ModuleInvestigation data={data} onSave={handleSave}/>
          ) : module === "exit" ? (
            <ModuleExit data={data} onSave={handleSave}/>
          ) : module === "workshop" ? (
            <ModuleWorkshop/>
          ) : module === "autoprompt" ? (
            <ModuleAutoPrompt data={data}/>
          ) : module === "convkit" ? (
            <ModuleConvKit/>
          ) : module === "plans306090" ? (
            <Module306090 data={data} onSave={handleSave}/>
          ) : module === "knowledge" ? (
            <ModuleKnowledge/>
          ) : null}
        </div>
      </div>

      <SavedToast show={toast}/>
    </div>
  );
}
