// ── AI API HELPERS ────────────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.266-344
import { normalizeAIData } from '../utils/normalize.js';
import { getLang } from '../lib/i18n.js';

// Centralized: appended to every system prompt so every AI call respects the user's UI language.
function buildLanguageDirective() {
  const lang = getLang();
  const langName = lang === "fr" ? "French" : "English";
  return `\n\n---\n\n## RESPONSE LANGUAGE\n\nAlways respond in the user's selected language.\nCurrent language: ${langName}.\nDo not translate employee names, case notes, job titles, or user-entered content unless explicitly asked.`;
}

// Core fetch — calls /api/chat (Vercel proxy with API key)
export async function _apiFetch(system, userContent, maxTokens) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        system: (system || "") + buildLanguageDirective(),
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
export async function callAIText(system, userContent, maxTokens=4000) {
  return _apiFetch(system, userContent, maxTokens);
}

// callAIJson — structured JSON response
export async function callAIJson(system, userContent, maxTokens=2000) {
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
// Depends on normalizeAIData from utils/normalize.js
export async function callAI(systemPrompt, userPrompt, transcriptLen=0) {
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
