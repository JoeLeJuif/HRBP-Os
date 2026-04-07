// ── STORAGE ───────────────────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.139-172

export const SK = {
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
  sentRecaps:     "hrbp_os:sentRecaps",
  nextWeekLocks:  "hrbp_os:nextWeekLocks",
  portfolio:      "hrbp_os:portfolio",
  leaders:        "hrbp_os:leaders",
  radars:         "hrbp_os:radars",
  plans306090:    "hrbp_os:plans306090",
};

export async function sGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch { return null; }
}

export async function sSet(key, val) {
  try {
    if (val === undefined) return;
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { console.warn("sSet failed for key:", key, e); }
}
