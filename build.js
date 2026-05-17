// Cross-platform build: invokes esbuild CLI via npx and injects Supabase env
// vars at build time. Keeps the CLI flags identical to the historical build,
// so output is byte-equivalent when env vars are unset.

const { execSync } = require("child_process");

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const stripeKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
const sentryDsn = process.env.VITE_SENTRY_DSN || "";
const sentryEnv = process.env.VITE_SENTRY_ENV || "production";
const sentryRelease = process.env.VITE_SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || "";

// `import.meta.env.DEV` is forced to `false` for production builds so esbuild
// strips dev-only branches (e.g. window.login/window.logout console helpers)
// via dead-code elimination.
const defines = [
  `--define:process.env.VITE_SUPABASE_URL=${JSON.stringify(url)}`,
  `--define:process.env.VITE_SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(key)}`,
  `--define:process.env.VITE_STRIPE_PUBLISHABLE_KEY=${JSON.stringify(stripeKey)}`,
  `--define:process.env.VITE_SENTRY_DSN=${JSON.stringify(sentryDsn)}`,
  `--define:process.env.VITE_SENTRY_ENV=${JSON.stringify(sentryEnv)}`,
  `--define:process.env.VITE_SENTRY_RELEASE=${JSON.stringify(sentryRelease)}`,
  `--define:import.meta.env.DEV=false`,
];

const args = [
  "npx", "esbuild", "src/index.jsx",
  "--bundle",
  "--platform=browser",
  "--format=iife",
  "--global-name=HRBPOSApp",
  "--external:react",
  "--external:react-dom",
  "--jsx=transform",
  "--jsx-factory=React.createElement",
  "--jsx-fragment=React.Fragment",
  // Enable syntax-level minification so esbuild can eliminate dead branches
  // (e.g. `if (false)` after `import.meta.env.DEV` is defined to false above).
  // Whitespace/identifier minification stays off to keep the bundle readable.
  "--minify-syntax",
  ...defines,
  "--outfile=public/app.js",
];

execSync(args.map(a => (/\s|"/.test(a) ? JSON.stringify(a) : a)).join(" "), { stdio: "inherit" });
