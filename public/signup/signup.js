// /signup — onboarding form submitter. Posts to /api/signup and shows a
// generic confirmation regardless of whether the email was new or already
// onboarded. Errors stay generic to avoid leaking user-existence signals.
(function () {
  var form = document.getElementById("signup-form");
  var errEl = document.getElementById("form-error");
  var success = document.getElementById("success");
  if (!form) return;

  function setError(msg) { errEl.textContent = msg || ""; }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    setError("");

    var fd = new FormData(form);
    var payload = {
      organization_name: String(fd.get("organization_name") || "").trim(),
      first_name:        String(fd.get("first_name")        || "").trim(),
      last_name:         String(fd.get("last_name")         || "").trim(),
      email:             String(fd.get("email")             || "").trim(),
    };

    if (!payload.organization_name || !payload.first_name || !payload.last_name || !payload.email) {
      setError("Tous les champs sont requis.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      setError("Adresse courriel invalide.");
      return;
    }

    var btn = form.querySelector("button[type=submit]");
    if (btn) { btn.disabled = true; btn.textContent = "Création…"; }

    fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (body) { return { res: res, body: body }; }).catch(function () { return { res: res, body: {} }; });
    }).then(function (r) {
      if (r.res.ok) {
        form.classList.add("hidden");
        success.classList.remove("hidden");
        return;
      }
      if (btn) { btn.disabled = false; btn.textContent = "Créer mon workspace"; }
      if (r.res.status === 429) {
        setError("Trop de tentatives. Réessaie dans quelques minutes.");
      } else {
        setError("Impossible de créer le workspace pour l'instant. Réessaie plus tard.");
      }
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = "Créer mon workspace"; }
      setError("Impossible de créer le workspace pour l'instant. Réessaie plus tard.");
    });
  });
})();
