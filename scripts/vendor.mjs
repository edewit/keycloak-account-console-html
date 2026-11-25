#!/usr/bin/env node
/**
 * Copy lit / @lit/context / keycloak-js (and lit's transitive ESM packages)
 * into the theme so account pages load without a CDN — required for strict
 * CSP (script-src 'self') and air-gapped deployments.
 *
 * Also writes resources/js/importmap.json with bare-specifier mappings.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const themeJs = path.join(
  projectRoot,
  "src/main/resources/theme/account-console-html/account/resources/js",
);
const vendorRoot = path.join(themeJs, "vendor");

const require = createRequire(import.meta.url);

/**
 * Resolve a package's on-disk root (directory that contains package.json).
 * @param {string} specifier bare package name
 * @param {string} [fromFile] file to resolve from (defaults to this script)
 */
function packageRoot(specifier, fromFile = fileURLToPath(import.meta.url)) {
  const req = createRequire(fromFile);
  let entry;
  try {
    entry = req.resolve(specifier);
  } catch {
    // Some packages only expose subpaths; resolve package.json via Node's
    // module paths by reading the resolved entry of a known export.
    throw new Error(`Cannot resolve package "${specifier}" from ${fromFile}`);
  }
  let dir = path.dirname(entry);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error(`No package.json found for ${specifier} (from ${entry})`);
}

/**
 * Copy production ESM (.js only) from a package into vendor/<destName>/.
 * Skips development/, node/, and source maps.
 * @param {string} srcRoot
 * @param {string} destName path under vendor/
 */
function copyPackageJs(srcRoot, destName) {
  const destRoot = path.join(vendorRoot, destName);
  fs.mkdirSync(destRoot, { recursive: true });

  /** @param {string} dir */
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.relative(srcRoot, path.join(dir, ent.name));
      const parts = rel.split(path.sep);
      if (parts[0] === "development" || parts[0] === "node" || parts[0] === "src") {
        continue;
      }
      if (ent.name === "test" || ent.name === "tests") {
        continue;
      }

      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!ent.name.endsWith(".js") || ent.name.endsWith(".min.js")) {
        continue;
      }
      // Skip source maps referenced only; we never copy .map
      const out = path.join(destRoot, rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(abs, out);
    }
  }

  walk(srcRoot);
  return destRoot;
}

/**
 * Entry file path relative to vendor/ for import map (posix).
 * @param {string} destName
 * @param {string} entryRel e.g. index.js
 */
function vendorEntry(destName, entryRel) {
  return `./vendor/${destName}/${entryRel.split(path.sep).join("/")}`;
}

function main() {
  fs.rmSync(vendorRoot, { recursive: true, force: true });
  fs.mkdirSync(vendorRoot, { recursive: true });

  const litRoot = packageRoot("lit");
  const litEntryFile = require.resolve("lit");
  const fromLit = createRequire(litEntryFile);

  const litHtmlRoot = packageRoot("lit-html", litEntryFile);
  const litElementRoot = packageRoot("lit-element", litEntryFile);
  const reactiveRoot = packageRoot("@lit/reactive-element", litEntryFile);
  const contextRoot = packageRoot("@lit/context");
  const keycloakRoot = packageRoot("keycloak-js");

  // Sanity: ensure lit can see its deps (pnpm layout)
  fromLit.resolve("lit-html");
  fromLit.resolve("lit-element");
  fromLit.resolve("@lit/reactive-element");

  copyPackageJs(litRoot, "lit");
  copyPackageJs(litHtmlRoot, "lit-html");
  copyPackageJs(litElementRoot, "lit-element");
  copyPackageJs(reactiveRoot, "@lit/reactive-element");
  copyPackageJs(contextRoot, "@lit/context");
  copyPackageJs(keycloakRoot, "keycloak-js");

  const versions = {
    lit: JSON.parse(fs.readFileSync(path.join(litRoot, "package.json"), "utf8")).version,
    "lit-html": JSON.parse(fs.readFileSync(path.join(litHtmlRoot, "package.json"), "utf8")).version,
    "lit-element": JSON.parse(fs.readFileSync(path.join(litElementRoot, "package.json"), "utf8")).version,
    "@lit/reactive-element": JSON.parse(
      fs.readFileSync(path.join(reactiveRoot, "package.json"), "utf8"),
    ).version,
    "@lit/context": JSON.parse(fs.readFileSync(path.join(contextRoot, "package.json"), "utf8"))
      .version,
    "keycloak-js": JSON.parse(fs.readFileSync(path.join(keycloakRoot, "package.json"), "utf8"))
      .version,
  };

  // Trailing-slash keys cover subpath imports (lit-element/lit-element.js, etc.).
  const importMap = {
    imports: {
      lit: vendorEntry("lit", "index.js"),
      "lit/": "./vendor/lit/",
      "lit-html": vendorEntry("lit-html", "lit-html.js"),
      "lit-html/": "./vendor/lit-html/",
      "lit-element": vendorEntry("lit-element", "index.js"),
      "lit-element/": "./vendor/lit-element/",
      "@lit/reactive-element": vendorEntry("@lit/reactive-element", "reactive-element.js"),
      "@lit/reactive-element/": "./vendor/@lit/reactive-element/",
      "@lit/context": vendorEntry("@lit/context", "index.js"),
      "@lit/context/": "./vendor/@lit/context/",
      "keycloak-js": vendorEntry("keycloak-js", "lib/keycloak.js"),
      "keycloak-js/": "./vendor/keycloak-js/",
    },
  };

  const importMapPath = path.join(themeJs, "importmap.json");
  fs.writeFileSync(importMapPath, `${JSON.stringify(importMap, null, 2)}\n`, "utf8");

  const manifestPath = path.join(vendorRoot, "versions.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(versions, null, 2)}\n`, "utf8");

  console.log("Vendored packages →", path.relative(projectRoot, vendorRoot));
  for (const [name, version] of Object.entries(versions)) {
    console.log(`  ${name}@${version}`);
  }
  console.log("Import map →", path.relative(projectRoot, importMapPath));
}

main();
