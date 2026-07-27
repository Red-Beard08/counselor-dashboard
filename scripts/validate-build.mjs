/* Validates Counselor Dashboard's compiled release files and mobile-safe manifest contract. */
import { readFile, stat } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));
const main = await readFile("main.js", "utf8");
const css = await readFile("styles.css", "utf8");
const failures = [];

if (manifest.id !== "counselor-dashboard") failures.push("Unexpected plugin id.");
if (manifest.name !== "Counselor Dashboard") failures.push("Unexpected plugin name.");
if (manifest.version !== packageJson.version) failures.push("package.json and manifest.json versions differ.");
if (versions[manifest.version] !== manifest.minAppVersion) failures.push("versions.json is inconsistent.");
if (!main.includes("Counselor Dashboard")) failures.push("main.js does not contain the plugin identity.");
if (!css.includes(".counselor-dashboard-dashboard")) failures.push("styles.css is missing dashboard styles.");
if ((await stat("main.js")).size < 5_000) failures.push("main.js appears unexpectedly small.");
if (manifest.isDesktopOnly !== false) failures.push("Manifest is not marked for mobile support.");
if (/require\(["'](?:fs|path|electron|os|child_process)["']\)/.test(main)) {
  failures.push("main.js contains a desktop-only runtime import.");
}
if (!css.includes("100dvh") || !css.includes("safe-area-inset-bottom")) {
  failures.push("styles.css is missing mobile viewport or safe-area handling.");
}
if (!main.includes("counselor-dashboard:profile:start") || !main.includes("rebuild-client-profiles")) {
  failures.push("main.js is missing automatic client-profile rollups.");
}
if (!main.includes("manage-goals") || !main.includes("counseling-goal") || !main.includes("ledger_active_goal_count")) {
  failures.push("main.js is missing centralized goal management.");
}

if (failures.length) throw new Error(failures.join("\n"));
console.log("Validated Counselor Dashboard release files.");
