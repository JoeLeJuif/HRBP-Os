// Cross-platform build: invokes esbuild CLI via npx and injects Supabase env
// vars at build time. Keeps the CLI flags identical to the historical build,
// so output is byte-equivalent when env vars are unset.

const { execSync } = require("child_process");

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const defines = [
  `--define:process.env.VITE_SUPABASE_URL=${JSON.stringify(url)}`,
  `--define:process.env.VITE_SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(key)}`,
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
  ...defines,
  "--outfile=public/app.js",
];

execSync(args.map(a => (/\s|"/.test(a) ? JSON.stringify(a) : a)).join(" "), { stdio: "inherit" });
