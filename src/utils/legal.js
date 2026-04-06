// ── LEGAL UTILS ───────────────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.65-113

export const PROVINCES = ["QC","ON","AB","BC","MB","SK","NS","NB","NL","PE"];

export function getLegalContext(province) {
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

export const LEGAL_GUARDRAIL = `
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

export function buildLegalPromptContext(province) {
  const prov = province || "QC";
  const legalCtx = getLegalContext(prov);
  return `Province: ${prov}
Cadre legal: ${legalCtx}
Juridiction: Normes d emploi provinciales — Canada

${LEGAL_GUARDRAIL}`;
}

// Legal-sensitive keyword detector
export function isLegalSensitive(text) {
  if (!text) return false;
  return /disciplin|terminaison|congedier|congedie|licencier|licenciem|demission|cessation|abandon|fin d.emploi|fin de l.emploi|harcel|plainte|grief|accommod|invalidit|arret.de.travail|maladie|absences?|conge|LNT|CNESST|norme.*travail|heures.suppl|overtime|vacances|cong.annuel|remuneration|salaire|conge.paternit|conge.maternit|conge.parent|commission|represailles|denonciateur|whistleblow|discrimination|equite|salariale|clause|non.concurrence|probation|avantage|assurance|SST|LSST|ergon|enquete|investigation|legal|juridique|droit|loi |legislat/i.test(text);
}
