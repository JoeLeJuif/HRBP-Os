// Legacy password gate — replaced by Supabase magic-link auth.
// Returns 410 Gone for every request. No dependency on APP_PASSWORD.
export default async function handler(req, res) {
  res.setHeader("Allow", "");
  return res.status(410).json({
    error: { code: "gone", message: "This endpoint has been removed. Sign in via Supabase magic link." },
  });
}
