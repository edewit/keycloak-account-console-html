/**
 * Classic (non-module) page bootstrap.
 *
 * Import maps must exist before any ES module runs, so this cannot be a Lit
 * component. Pages load this script once:
 *
 *   <script src="resource/js/boot.js"
 *           data-modules="components/shell.js,personal-info.js"></script>
 *
 * Prefers vendored modules under resource/js/vendor/. If those are missing
 * (no `npm run vendor`), falls back to a jsDelivr CDN import map.
 */
(async () => {
  const script = document.currentScript;
  if (!script) {
    console.error("account boot: document.currentScript is missing");
    return;
  }

  const imports = await resolveImports();

  const importMap = document.createElement("script");
  importMap.type = "importmap";
  importMap.textContent = JSON.stringify({ imports });
  script.after(importMap);

  const modules = (script.dataset.modules ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  await Promise.all(
    modules.map((mod) => import(new URL(`resource/js/${mod}`, document.baseURI).href)),
  );
})().catch((error) => {
  console.error("account boot failed", error);
});

/** @returns {Promise<Record<string, string>>} */
async function resolveImports() {
  const vendorLit = new URL("resource/js/vendor/lit/index.js", document.baseURI);
  try {
    const probe = await fetch(vendorLit, { method: "GET", cache: "no-cache" });
    if (probe.ok) {
      return await loadVendorImportMap();
    }
  } catch {
    // fall through to CDN
  }

  console.info(
    "account boot: vendored modules not found; using CDN import map (run npm run vendor for offline/CSP-safe assets)",
  );
  return CDN_IMPORTS;
}

/** @returns {Promise<Record<string, string>>} */
async function loadVendorImportMap() {
  const mapUrl = new URL("resource/js/importmap.json", document.baseURI);
  const map = await fetch(mapUrl).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load import map: ${response.status}`);
    }
    return response.json();
  });

  const imports = { ...(map.imports ?? {}) };
  for (const [key, value] of Object.entries(imports)) {
    if (typeof value === "string" && value.startsWith("./vendor/")) {
      imports[key] = "./resource/js/" + value.slice(2);
    }
  }
  return imports;
}

/** Bare-specifier map used when vendor/ is absent (jsDelivr +esm bundles transitive deps). */
const CDN_IMPORTS = Object.freeze({
  lit: "https://cdn.jsdelivr.net/npm/lit@3/+esm",
  "@lit/context": "https://cdn.jsdelivr.net/npm/@lit/context/+esm",
  "keycloak-js": "https://cdn.jsdelivr.net/npm/keycloak-js/+esm",
});
