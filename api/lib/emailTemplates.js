// ── api/lib/emailTemplates.js ────────────────────────────────────────────────
// Sprint 3 — Étape 5A. Template helpers for transactional emails.
//
// Each helper returns { subject, html, text } so callers can drop the result
// directly into sendTransactionalEmail({ ...template, to, type, metadata }).
//
// Bilingual FR/EN by default — short, plain, professional. The {html,text}
// pair lets clients render either. No external assets, no inline images, no
// dependencies. Keep these helpers pure (no I/O) so they stay easy to test.
//
// NOTE: these helpers are NOT wired yet. Webhooks and other handlers will
// import them in later phases (Payment failed / Cancelled / Invoice paid /
// Welcome trial / Trial ending soon). Adding new ones: copy any helper below
// and update the strings — keep both languages and both formats.

const APP_NAME = "HRBP OS";
const APP_URL  = "https://hrbp-os.vercel.app";

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout({ heading, bodyHtml, ctaLabel, ctaHref }) {
  const ctaBlock = ctaLabel && ctaHref
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(ctaHref)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">${escapeHtml(ctaLabel)}</a></p>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;background:#f7f7f7;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;border-radius:8px;border:1px solid #e5e5e5;">
    <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(heading)}</h1>
    ${bodyHtml}
    ${ctaBlock}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
    <p style="margin:0;font-size:12px;color:#666;">${escapeHtml(APP_NAME)} · <a href="${escapeHtml(APP_URL)}" style="color:#666;">${escapeHtml(APP_URL)}</a></p>
  </div>
</body></html>`;
}

function bilingual(fr, en) {
  return { fr, en };
}

function buildBilingualHtml({ heading, fr, en, ctaLabel, ctaHref }) {
  const bodyHtml = `
    <div style="margin-bottom:20px;">${fr}</div>
    <div style="padding-top:16px;border-top:1px dashed #ddd;color:#333;">${en}</div>
  `;
  return layout({ heading, bodyHtml, ctaLabel, ctaHref });
}

function buildBilingualText({ frLines, enLines }) {
  return [
    ...frLines,
    "",
    "---",
    "",
    ...enLines,
    "",
    `${APP_NAME} — ${APP_URL}`,
  ].join("\n");
}

// ── Templates ────────────────────────────────────────────────────────────────

export function paymentFailedEmail({ organizationName, manageBillingUrl } = {}) {
  const orgFr = organizationName ? ` pour ${organizationName}` : "";
  const orgEn = organizationName ? ` for ${organizationName}` : "";
  const subject = bilingual(
    `Échec de paiement${orgFr} — action requise`,
    `Payment failed${orgEn} — action required`,
  );
  return {
    subject: `${subject.fr} / ${subject.en}`,
    html: buildBilingualHtml({
      heading: "Échec de paiement / Payment failed",
      fr: `<p>Bonjour,</p>
        <p>Le dernier paiement de votre abonnement${escapeHtml(orgFr)} a échoué. Pour éviter une interruption de service, veuillez mettre à jour votre moyen de paiement.</p>`,
      en: `<p>Hello,</p>
        <p>The most recent payment on your subscription${escapeHtml(orgEn)} could not be processed. To avoid a service interruption, please update your payment method.</p>`,
      ctaLabel: "Mettre à jour / Update billing",
      ctaHref: manageBillingUrl || APP_URL,
    }),
    text: buildBilingualText({
      frLines: [
        "Bonjour,",
        "",
        `Le dernier paiement de votre abonnement${orgFr} a échoué.`,
        "Pour éviter une interruption de service, veuillez mettre à jour votre moyen de paiement.",
        manageBillingUrl ? `Gérer la facturation : ${manageBillingUrl}` : "",
      ].filter(Boolean),
      enLines: [
        "Hello,",
        "",
        `The most recent payment on your subscription${orgEn} could not be processed.`,
        "To avoid a service interruption, please update your payment method.",
        manageBillingUrl ? `Manage billing: ${manageBillingUrl}` : "",
      ].filter(Boolean),
    }),
  };
}

export function subscriptionCancelledEmail({ organizationName, accessEndsAt } = {}) {
  const orgFr = organizationName ? ` ${organizationName}` : "";
  const orgEn = organizationName ? ` ${organizationName}` : "";
  const subject = bilingual(
    `Abonnement annulé${orgFr}`,
    `Subscription cancelled${orgEn}`,
  );
  const endsAt = accessEndsAt ? String(accessEndsAt) : null;
  return {
    subject: `${subject.fr} / ${subject.en}`,
    html: buildBilingualHtml({
      heading: "Abonnement annulé / Subscription cancelled",
      fr: `<p>Bonjour,</p>
        <p>Votre abonnement${escapeHtml(orgFr)} a été annulé.${endsAt ? ` L'accès reste actif jusqu'au ${escapeHtml(endsAt)}.` : ""}</p>
        <p>Vous pouvez réactiver à tout moment depuis le portail de facturation.</p>`,
      en: `<p>Hello,</p>
        <p>Your subscription${escapeHtml(orgEn)} has been cancelled.${endsAt ? ` Access remains active until ${escapeHtml(endsAt)}.` : ""}</p>
        <p>You can reactivate at any time from the billing portal.</p>`,
      ctaLabel: "Gérer / Manage",
      ctaHref: APP_URL,
    }),
    text: buildBilingualText({
      frLines: [
        "Bonjour,",
        "",
        `Votre abonnement${orgFr} a été annulé.`,
        endsAt ? `L'accès reste actif jusqu'au ${endsAt}.` : "",
        "Vous pouvez réactiver à tout moment depuis le portail de facturation.",
      ].filter(Boolean),
      enLines: [
        "Hello,",
        "",
        `Your subscription${orgEn} has been cancelled.`,
        endsAt ? `Access remains active until ${endsAt}.` : "",
        "You can reactivate at any time from the billing portal.",
      ].filter(Boolean),
    }),
  };
}

export function invoicePaidEmail({ organizationName, amount, currency, invoiceUrl } = {}) {
  const orgFr = organizationName ? ` ${organizationName}` : "";
  const orgEn = organizationName ? ` ${organizationName}` : "";
  const amountStr = amount && currency
    ? `${amount} ${String(currency).toUpperCase()}`
    : amount
      ? String(amount)
      : null;
  const subject = bilingual(
    `Paiement reçu${orgFr}`,
    `Payment received${orgEn}`,
  );
  return {
    subject: `${subject.fr} / ${subject.en}`,
    html: buildBilingualHtml({
      heading: "Paiement reçu / Payment received",
      fr: `<p>Bonjour,</p>
        <p>Nous confirmons la réception de votre paiement${escapeHtml(orgFr)}.${amountStr ? ` Montant : ${escapeHtml(amountStr)}.` : ""}</p>
        <p>Merci.</p>`,
      en: `<p>Hello,</p>
        <p>We confirm receipt of your payment${escapeHtml(orgEn)}.${amountStr ? ` Amount: ${escapeHtml(amountStr)}.` : ""}</p>
        <p>Thank you.</p>`,
      ctaLabel: invoiceUrl ? "Voir la facture / View invoice" : null,
      ctaHref: invoiceUrl || null,
    }),
    text: buildBilingualText({
      frLines: [
        "Bonjour,",
        "",
        `Nous confirmons la réception de votre paiement${orgFr}.`,
        amountStr ? `Montant : ${amountStr}.` : "",
        invoiceUrl ? `Facture : ${invoiceUrl}` : "",
        "Merci.",
      ].filter(Boolean),
      enLines: [
        "Hello,",
        "",
        `We confirm receipt of your payment${orgEn}.`,
        amountStr ? `Amount: ${amountStr}.` : "",
        invoiceUrl ? `Invoice: ${invoiceUrl}` : "",
        "Thank you.",
      ].filter(Boolean),
    }),
  };
}

export function welcomeTrialEmail({ firstName, trialEndsAt } = {}) {
  const nameFr = firstName ? `, ${firstName}` : "";
  const nameEn = firstName ? `, ${firstName}` : "";
  const endsAt = trialEndsAt ? String(trialEndsAt) : null;
  return {
    subject: `Bienvenue sur ${APP_NAME} / Welcome to ${APP_NAME}`,
    html: buildBilingualHtml({
      heading: `Bienvenue / Welcome`,
      fr: `<p>Bonjour${escapeHtml(nameFr)},</p>
        <p>Votre essai de ${escapeHtml(APP_NAME)} est actif.${endsAt ? ` Il se termine le ${escapeHtml(endsAt)}.` : ""}</p>
        <p>Connectez-vous pour commencer.</p>`,
      en: `<p>Hello${escapeHtml(nameEn)},</p>
        <p>Your ${escapeHtml(APP_NAME)} trial is now active.${endsAt ? ` It ends on ${escapeHtml(endsAt)}.` : ""}</p>
        <p>Sign in to get started.</p>`,
      ctaLabel: "Ouvrir / Open",
      ctaHref: APP_URL,
    }),
    text: buildBilingualText({
      frLines: [
        `Bonjour${nameFr},`,
        "",
        `Votre essai de ${APP_NAME} est actif.`,
        endsAt ? `Il se termine le ${endsAt}.` : "",
        `Connectez-vous : ${APP_URL}`,
      ].filter(Boolean),
      enLines: [
        `Hello${nameEn},`,
        "",
        `Your ${APP_NAME} trial is now active.`,
        endsAt ? `It ends on ${endsAt}.` : "",
        `Sign in: ${APP_URL}`,
      ].filter(Boolean),
    }),
  };
}

export function trialEndingSoonEmail({ firstName, trialEndsAt, daysRemaining } = {}) {
  const nameFr = firstName ? `, ${firstName}` : "";
  const nameEn = firstName ? `, ${firstName}` : "";
  const endsAt = trialEndsAt ? String(trialEndsAt) : null;
  const daysFr = daysRemaining ? ` (${daysRemaining} jour${daysRemaining > 1 ? "s" : ""})` : "";
  const daysEn = daysRemaining ? ` (${daysRemaining} day${daysRemaining > 1 ? "s" : ""})` : "";
  return {
    subject: `Votre essai se termine bientôt / Your trial ends soon`,
    html: buildBilingualHtml({
      heading: "Fin d'essai imminente / Trial ending soon",
      fr: `<p>Bonjour${escapeHtml(nameFr)},</p>
        <p>Votre essai de ${escapeHtml(APP_NAME)} se termine bientôt${escapeHtml(daysFr)}.${endsAt ? ` Date de fin : ${escapeHtml(endsAt)}.` : ""}</p>
        <p>Ajoutez un moyen de paiement pour conserver l'accès sans interruption.</p>`,
      en: `<p>Hello${escapeHtml(nameEn)},</p>
        <p>Your ${escapeHtml(APP_NAME)} trial is ending soon${escapeHtml(daysEn)}.${endsAt ? ` End date: ${escapeHtml(endsAt)}.` : ""}</p>
        <p>Add a payment method to keep access without interruption.</p>`,
      ctaLabel: "Ajouter un paiement / Add payment",
      ctaHref: APP_URL,
    }),
    text: buildBilingualText({
      frLines: [
        `Bonjour${nameFr},`,
        "",
        `Votre essai de ${APP_NAME} se termine bientôt${daysFr}.`,
        endsAt ? `Date de fin : ${endsAt}.` : "",
        "Ajoutez un moyen de paiement pour conserver l'accès sans interruption.",
      ].filter(Boolean),
      enLines: [
        `Hello${nameEn},`,
        "",
        `Your ${APP_NAME} trial is ending soon${daysEn}.`,
        endsAt ? `End date: ${endsAt}.` : "",
        "Add a payment method to keep access without interruption.",
      ].filter(Boolean),
    }),
  };
}

export function accessApprovedEmail({ firstName, organizationName, appUrl } = {}) {
  const nameFr = firstName ? `, ${firstName}` : "";
  const nameEn = firstName ? `, ${firstName}` : "";
  const orgFr = organizationName ? ` (${organizationName})` : "";
  const orgEn = organizationName ? ` (${organizationName})` : "";
  const url = appUrl || APP_URL;
  return {
    subject: `Accès approuvé / Access approved — ${APP_NAME}`,
    html: buildBilingualHtml({
      heading: "Accès approuvé / Access approved",
      fr: `<p>Bonjour${escapeHtml(nameFr)},</p>
        <p>Votre accès à ${escapeHtml(APP_NAME)}${escapeHtml(orgFr)} a été approuvé. Vous pouvez maintenant vous connecter.</p>`,
      en: `<p>Hello${escapeHtml(nameEn)},</p>
        <p>Your access to ${escapeHtml(APP_NAME)}${escapeHtml(orgEn)} has been approved. You can now sign in.</p>`,
      ctaLabel: "Ouvrir / Open",
      ctaHref: url,
    }),
    text: buildBilingualText({
      frLines: [
        `Bonjour${nameFr},`,
        "",
        `Votre accès à ${APP_NAME}${orgFr} a été approuvé.`,
        `Connectez-vous : ${url}`,
      ],
      enLines: [
        `Hello${nameEn},`,
        "",
        `Your access to ${APP_NAME}${orgEn} has been approved.`,
        `Sign in: ${url}`,
      ],
    }),
  };
}
