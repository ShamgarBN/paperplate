/**
 * Post-process the Expo web export into a proper PWA.
 *
 * Expo SDK 56 produces a minimal `dist/index.html` and doesn't know about
 * our manifest or the iOS-specific meta tags that make "Add to Home
 * Screen" launch in standalone (chrome-less) mode. This script:
 *
 *   1. Injects <link rel="manifest"> pointing at /manifest.webmanifest
 *   2. Adds apple-touch-icon link
 *   3. Adds apple-mobile-web-app-* meta tags for standalone behaviour
 *   4. Adds an apple-touch-icon precomposed fallback for older iOS
 *
 * The manifest + icon files are copied automatically by Expo from
 * `public/` to `dist/`, so we only have to wire up the html.
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, "..", "dist");
const indexPath = resolve(distDir, "index.html");

// Base path of the deployed site. GitHub Pages serves from /paperplate/;
// Expo's `experiments.baseUrl` keeps JS/CSS asset URLs in sync but we
// inject our own manifest/icon refs here so they have to match.
const BASE = "/paperplate";

const INJECT = `
  <link rel="manifest" href="${BASE}/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="${BASE}/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Paperplate" />`;

async function main() {
  try {
    await access(indexPath);
  } catch {
    console.error(`Expected ${indexPath} to exist. Run \`expo export -p web\` first.`);
    process.exit(1);
  }

  const html = await readFile(indexPath, "utf8");
  // Inject just before </head>. If already present (re-run), no-op.
  if (html.includes('rel="manifest"')) {
    console.log("PWA tags already present, skipping.");
    return;
  }
  const updated = html.replace("</head>", `${INJECT}\n</head>`);
  await writeFile(indexPath, updated, "utf8");
  console.log("PWA manifest + iOS meta tags injected into dist/index.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
