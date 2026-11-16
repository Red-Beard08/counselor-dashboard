/* Protects legacy narrative migration and old autosaved-draft consolidation. */
import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outfile = path.join(os.tmpdir(), `counselor-dashboard-notes-${process.pid}.mjs`);
await esbuild.build({ entryPoints: ["src/interaction-notes.ts"], outfile, bundle: true, format: "esm", platform: "node" });
const helpers = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);

const frontmatter = {
  session_summary: "Summary text",
  context_entry: "Context text",
  follow_up_date: "2026-11-30",
  interaction_cause_label: "Pastoral care",
  issues: ["Stress", "Communication"]
};
const body = [
  "# 2026-11-16 — individual",
  "",
  "## Purpose and summary",
  "",
  "Summary text",
  "",
  "## Client report and counselor observations",
  "",
  "Observation text",
  "",
  "## Interventions",
  "",
  "Intervention text"
].join("\n");
const notes = helpers.consolidateInteractionNotes(frontmatter, body);
if (!notes.includes("**Summary:**\nSummary text")) throw new Error("Legacy summary was not migrated.");
if (notes.match(/Summary text/g)?.length !== 1) throw new Error("Duplicated summary was not deduplicated.");
if (!notes.includes("**Profile context:**\nContext text")) throw new Error("Context entry was not migrated.");
if (!notes.includes("**Follow-up date:**\n2026-11-30")) throw new Error("Follow-up date was not retained.");
if (!notes.includes("**Issues:**\nStress, Communication")) throw new Error("Legacy issues were not retained.");
if (!notes.includes("**Observations:**\nObservation text")) throw new Error("Observation section was not migrated.");

const markdown = ["---", "type: counseling-interaction", "session_summary: Summary text", "---", body].join("\n");
const migrated = helpers.consolidateInteractionBody(frontmatter, markdown);
if (!migrated.includes("## Notes")) throw new Error("Migration did not create the canonical Notes section.");
if (migrated.includes("## Purpose and summary")) throw new Error("Legacy narrative heading remained after consolidation.");

const draft = helpers.legacyFieldsToNotes({
  summary: "Draft summary",
  observations: "Draft observations",
  biblicalConsiderations: "Scripture context",
  commitments: "Next steps",
  notes: "Extra notes"
});
for (const expected of ["Draft summary", "Draft observations", "Scripture context", "Next steps", "Extra notes"]) {
  if (!draft.includes(expected)) throw new Error(`Legacy draft value was lost: ${expected}`);
}

fs.rmSync(outfile, { force: true });
console.log("Validated legacy interaction note and draft consolidation.");
