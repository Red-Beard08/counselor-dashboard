/* Exercises Counselor Dashboard's portable path, filename, list, date, and ID helpers. */
import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outfile = path.join(os.tmpdir(), `counselor-dashboard-utils-${process.pid}.mjs`);
await esbuild.build({ entryPoints: ["src/utils.ts"], outfile, bundle: true, format: "esm", platform: "node" });
const helpers = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);

if (helpers.cleanRootFolder(" /Care//Records/ ") !== "Care/Records") throw new Error("Root path normalization failed.");
if (helpers.cleanRootFolder("../Private") !== "Counselor Dashboard") throw new Error("Unsafe root path was not rejected.");
if (helpers.safeFilename(' A/B: "C" ') !== "A-B- -C-") throw new Error("Filename sanitization failed.");
if (JSON.stringify(helpers.splitList("Faith, Hope, Faith")) !== JSON.stringify(["Faith", "Hope"])) throw new Error("List normalization failed.");
if (!/^CL-0003-[A-F0-9]{6}$/.test(helpers.nextClientId(["CL-0001", "CL-0002-ABCDEF"]))) throw new Error("Client ID generation failed.");

fs.rmSync(outfile, { force: true });
console.log("Validated Counselor Dashboard utility helpers.");
