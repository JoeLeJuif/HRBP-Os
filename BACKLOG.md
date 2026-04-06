# HRBP OS — Product Backlog v1
_Dernière mise à jour : Avril 2026_

---

## 🎯 Vision produit

> **HRBP OS est mon système d'exploitation RH personnel** — un outil qui centralise mes cas, amplifie mon jugement avec l'IA, et me rend plus stratégique au quotidien. L'objectif n'est pas d'automatiser le RH, c'est de structurer ma pratique et d'accélérer mes décisions.

**Horizon 6 mois :** Tous les modules core sont stables et province-aware. L'OS remplace mes notes éparses pour 80% de mes dossiers actifs. Le Copilot est mon premier réflexe avant une conversation difficile.

---

## ✅ Done (déployé en production)

| Feature | Module(s) | Notes |
|---|---|---|
| Province-awareness (Step 1) | Cases, Meetings, Exits, Investigations, Prep1on1 | ProvinceSelect, ProvinceBadge, getProvince |
| Legal framework injection (Step 2) | Investigation, Exit, Meetings-disciplinaire, Decisions, Coaching, Prep1on1, Copilot | getLegalContext, LEGAL_GUARDRAIL, buildLegalPromptContext |
| Auth / Password gate | LoginScreen | hrbpos_auth localStorage |
| Déploiement Vercel + proxy serverless | api/claude.js | Clé API côté serveur |
| Module 30-60-90 | Module306090 | Plans onboarding/promotion/mobilité |
| Knowledge Base | ModuleKnowledge | Sections statiques + recherche |
| Conv Kit + Prompt Library | ModuleConvKit | CONV_SITUATIONS, PROMPT_LIBRARY |
| Auto Prompt Engine | ModuleAutoPrompt | Modes Diagnose/Act/Say |
| Org Radar | ModuleRadar | Tracking thèmes/patterns |
| Manager Portfolio | ModulePortfolio | EMPTY_MANAGER, profil + historique |

---

## 🔥 Backlog — Priorisé

### PRIORITÉ 1 — Quick wins / Stabilisation

| ID | Feature | Module | Effort | Valeur | Notes |
|---|---|---|---|---|---|
| B-01 | Province par défaut dans le profil sidebar | Profile | XS | ⭐⭐⭐ | Persist defaultProvince → pré-rempli partout |
| B-02 | Indicateur visuel "cas actifs" sur Home | ModuleHome | S | ⭐⭐⭐ | Badge count sur raccourcis |
| B-03 | Export PDF / copier un cas complet | ModuleCases | S | ⭐⭐⭐ | Pour documentation dossier employé |
| B-04 | Filtre par statut + province dans Case Log | ModuleCases | S | ⭐⭐ | Open / In Progress / Closed + province |

---

### PRIORITÉ 2 — Valeur stratégique

| ID | Feature | Module | Effort | Valeur | Notes |
|---|---|---|---|---|---|
| B-05 | Lien Case → Investigation (association dossier) | Cases + Investigation | M | ⭐⭐⭐ | Relier un cas existant à une enquête |
| B-06 | Timeline d'un dossier (historique chronologique) | ModuleCases | M | ⭐⭐⭐ | Vue chronologique des événements d'un cas |
| B-07 | Résumé IA hebdomadaire auto (Weekly Brief amélioré) | ModuleBrief | M | ⭐⭐⭐ | Tire les signaux + cas actifs pour générer le brief |
| B-08 | Alerte signal non traité > 7 jours | ModuleSignals | S | ⭐⭐ | Badge ou bannière sur Home |
| B-09 | Score de risque gestionnaire dans Portfolio | ModulePortfolio | M | ⭐⭐⭐ | Agrège signaux + cas + historique → score RH |

---

### PRIORITÉ 3 — Enrichissement modules

| ID | Feature | Module | Effort | Valeur | Notes |
|---|---|---|---|---|---|
| B-10 | Mode "Prép réunion disciplinaire" dans Meetings | ModuleMeetings | M | ⭐⭐⭐ | Génère un script structuré + points légaux |
| B-11 | Recommandations de suivi post-investigation | ModuleInvestigation | M | ⭐⭐ | IA génère plan d'action post-conclusion |
| B-12 | Comparateur de scénarios dans Decisions | ModuleDecisions | L | ⭐⭐ | Option A vs B vs C avec analyse risque |
| B-13 | Templates de plans de performance (PIP) | ModuleCoaching | M | ⭐⭐⭐ | Génère PIP structuré province-aware |
| B-14 | Ajout de notes libres sur un gestionnaire | ModulePortfolio | S | ⭐⭐ | Champ journal chronologique |

---

### PRIORITÉ 4 — Nouveaux modules (à valider)

| ID | Feature | Module (nouveau) | Effort | Valeur | Notes |
|---|---|---|---|---|---|
| B-15 | Module Immigration / Permis de travail | ModuleImmigration | L | ⭐⭐⭐ | Suivi permis, échéances, coordination Galileo |
| B-16 | Module CNESST / Retour au travail | ModuleCNESST | L | ⭐⭐⭐ | Suivi dossiers, plans RTW, obligations légales |
| B-17 | Module Succession / Talent | ModuleTalent | L | ⭐⭐ | Cartographie talent, risques départ, successeurs |
| B-18 | Dashboard Home dynamique (KPIs HRBP) | ModuleHome | L | ⭐⭐⭐ | Cas actifs, signaux, gestionnaires à risque |

---

## 🧊 Icebox (bonnes idées, pas maintenant)

- Sync bidirectionnelle avec Workday
- Notifications / rappels (nécessite backend)
- Multi-utilisateurs / partage avec autre HRBP
- Intégration calendrier pour cadences
- Version mobile native

---

## 📐 Definition of Done (par module)

Un module est "done" quand :
- [ ] Province-aware (si applicable)
- [ ] Legal injection active (si applicable)
- [ ] State persisté dans `SK` (si données à conserver)
- [ ] Testé en prod sur hrbp-os.vercel.app
- [ ] Pas de régression sur les autres modules

---

## 🔄 Rituel PO — Comment utiliser ce backlog

**Avant chaque session de dev :**
1. Uploader ce fichier dans la conversation Claude
2. Dire : _"On attaque quoi aujourd'hui ? Voici mon backlog."_
3. Claude priorise ou exécute selon ton énergie disponible

**Après chaque feature livrée :**
1. Déplacer l'item de Backlog → Done
2. Mettre à jour la date en haut du fichier
3. Sauvegarder le fichier mis à jour

**Mensuel (10 min) :**
1. Revoir les priorités
2. Ajouter les nouvelles idées en Icebox
3. Remonter ou descendre des items selon ta pratique réelle
