// Single source of truth for the meeting types exposed by the 1:1 Engine
// (MeetingEngine.jsx) and reused by the Meetings Hub Edit panel.
// Labels here are FR — UI layers may override via i18n keys
// `meetings.engineType.<id>` when a translator is available.
import { C } from '../theme.js';

export const ENGINE_MEETING_TYPES = [
  { id:"1on1",          label:"1:1",                        icon:"👤",  color:C.blue,   legal:false, desc:"Rencontre régulière de suivi avec un gestionnaire" },
  { id:"disciplinaire", label:"Disciplinaire",              icon:"⚖️", color:C.red,    legal:true,  desc:"Notifier formellement un manquement, documenter les faits" },
  { id:"performance",   label:"Performance",                icon:"📊",  color:C.amber,  legal:false, desc:"Discuter d'écarts de performance et convenir d'un plan" },
  { id:"coaching",      label:"Coaching / Développement",   icon:"🎯",  color:C.teal,   legal:false, desc:"Renforcer les forces, identifier les zones de croissance" },
  { id:"recadrage",     label:"Recadrage / Clarification",  icon:"🔄",  color:C.amber,  legal:false, desc:"Recadrer un comportement précis sans escalade" },
  { id:"mediation",     label:"Médiation / Conflit",        icon:"🤝",  color:C.purple, legal:false, desc:"Faciliter une conversation entre deux parties en conflit" },
  { id:"enquete",       label:"Enquête / Investigation",    icon:"🔍",  color:C.red,    legal:true,  desc:"Recueillir des faits dans le cadre d'une enquête formelle" },
  { id:"suivi",         label:"Suivi",                      icon:"📋",  color:C.blue,   legal:false, desc:"Faire le suivi d'un engagement pris lors d'une rencontre antérieure" },
  { id:"transition",    label:"Transition",                 icon:"🚀",  color:C.em,     legal:false, desc:"Annoncer ou accompagner un changement de rôle, équipe ou structure" },
];
