#!/usr/bin/env node
/**
 * Start Keycloak with the account-console-html provider JAR and a filesystem
 * theme symlink so HTML edits apply on browser refresh (no Maven rebuild).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const THEME_NAME = "account-console-html";
const THEME_DIR = path.join(
  projectRoot,
  "src/main/resources/theme",
  THEME_NAME,
);

const THEME_DEV_ARGS = [
  "--spi-theme-static-max-age=-1",
  "--spi-theme-cache-themes=false",
  "--spi-theme-cache-templates=false",
];

function resolveKeycloakRunner() {
  const local = path.join(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "keycloak-runner.cmd" : "keycloak-runner",
  );
  return fs.existsSync(local) ? local : "keycloak-runner";
}

function resolveProviderJar() {
  if (process.env.ACCOUNT_CONSOLE_HTML_JAR) {
    const jar = path.resolve(process.env.ACCOUNT_CONSOLE_HTML_JAR);
    if (!fs.existsSync(jar)) {
      throw new Error(`ACCOUNT_CONSOLE_HTML_JAR not found: ${jar}`);
    }
    return jar;
  }

  const targetDir = path.join(projectRoot, "target");
  if (!fs.existsSync(targetDir)) {
    return null;
  }

  const jar = fs
    .readdirSync(targetDir)
    .filter(
      (f) =>
        f.startsWith("keycloak-account-console-html-") &&
        f.endsWith(".jar") &&
        !f.endsWith("-sources.jar"),
    )
    .sort()
    .at(-1);

  return jar ? path.join(targetDir, jar) : null;
}

function ensureProviderJar() {
  let jar = resolveProviderJar();
  if (jar) {
    return jar;
  }

  console.log("Provider JAR not found; running mvn package…");
  const result = spawnSync("mvn", ["-q", "package", "-DskipTests"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`mvn package failed with exit code ${result.status ?? "unknown"}`);
  }

  jar = resolveProviderJar();
  if (!jar) {
    throw new Error(
      "Provider JAR still missing after mvn package. Expected target/keycloak-account-console-html-*.jar",
    );
  }
  return jar;
}

if (!fs.existsSync(THEME_DIR)) {
  throw new Error(`Theme directory not found: ${THEME_DIR}`);
}

const providerJar = ensureProviderJar();
const keycloakUrl = process.env.KEYCLOAK_URL ?? "http://127.0.0.1:8080";
const args = [
  "-p",
  providerJar,
  "-t",
  `${THEME_NAME}:${THEME_DIR}`,
  "--realm",
  "master",
  "--patch",
  JSON.stringify({ accountTheme: THEME_NAME }),
  "--keycloak-url",
  keycloakUrl,
  "--",
  ...THEME_DEV_ARGS,
];

if (process.env.KEYCLOAK_VERSION) {
  args.unshift(process.env.KEYCLOAK_VERSION, "-v");
}

console.log(`Provider: ${providerJar}`);
console.log(`Theme (live): ${THEME_DIR}`);
console.log(`Account theme: ${THEME_NAME}`);
console.log(`Keycloak URL: ${keycloakUrl}`);
console.log(`Account: ${keycloakUrl}/realms/master/account/`);
console.log(
  `Admin: ${process.env.KEYCLOAK_ADMIN_USER ?? "admin"} / ${process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin"}`,
);
console.log("");
console.log("Edit account/pages/*.html and refresh — no Maven rebuild needed.");
console.log("Rebuild (npm run build) only when Java under org.keycloak.account.html changes.");
console.log("");

const child = spawn(resolveKeycloakRunner(), args, {
  cwd: projectRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 1));
