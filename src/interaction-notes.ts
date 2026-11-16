/** Pure helpers for upgrading legacy interaction narratives into one readable Notes field. */

export interface LegacyInteractionNarrative {
  notes?: unknown;
  session_summary?: unknown;
  context_entry?: unknown;
  follow_up_date?: unknown;
  interaction_cause?: unknown;
  interaction_cause_label?: unknown;
  issues?: unknown;
  [key: string]: unknown;
}

const LEGACY_FRONTMATTER_FIELDS = [
  "session_summary",
  "context_entry",
  "follow_up_date",
  "interaction_cause",
  "interaction_cause_label",
  "issues"
];

const LEGACY_HEADINGS = new Set([
  "purpose and summary",
  "profile context entry",
  "client report and counselor observations",
  "biblical and theological considerations",
  "interventions",
  "commitments and next steps",
  "follow-up date",
  "meeting notes",
  "notes"
]);

const LABELS: Record<string, string> = {
  "purpose and summary": "Summary",
  "profile context entry": "Profile context",
  "client report and counselor observations": "Observations",
  "biblical and theological considerations": "Biblical and theological considerations",
  "interventions": "Interventions",
  "commitments and next steps": "Commitments and next steps",
  "follow-up date": "Follow-up date",
  "meeting notes": "Meeting notes",
  "notes": "Notes"
};

function clean(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => String(item ?? "").trim()).filter(Boolean).join(", ");
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function appendUnique(target: Array<{ label: string; text: string }>, label: string, text: string): void {
  const value = text.trim();
  if (!value) return;
  if (target.some(item => item.label === label && item.text === value)) return;
  target.push({ label, text: value });
}

function parseBodySections(body: string): { title: string; sections: Array<{ heading: string; text: string }> } {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index++;
  if (lines[index]?.startsWith("# ")) title = lines[index++].trim();

  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current = { heading: "", lines: [] as string[] };
  for (; index < lines.length; index++) {
    const line = lines[index];
    const heading = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (heading) {
      if (current.lines.some(item => item.trim())) sections.push(current);
      current = { heading: heading[1].trim(), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.some(item => item.trim())) sections.push(current);
  return {
    title,
    sections: sections.map(section => ({ heading: section.heading, text: section.lines.join("\n").trim() }))
  };
}

export function consolidateInteractionNotes(frontmatter: LegacyInteractionNarrative, body: string): string {
  const pieces: Array<{ label: string; text: string }> = [];
  appendUnique(pieces, "Notes", clean(frontmatter.notes));
  appendUnique(pieces, "Summary", clean(frontmatter.session_summary));
  appendUnique(pieces, "Profile context", clean(frontmatter.context_entry));
  appendUnique(pieces, "Follow-up date", clean(frontmatter.follow_up_date));
  appendUnique(pieces, "Interaction cause", clean(frontmatter.interaction_cause_label) || clean(frontmatter.interaction_cause));
  appendUnique(pieces, "Issues", clean(frontmatter.issues));

  const parsed = parseBodySections(body);
  for (const section of parsed.sections) {
    const key = normalizedKey(section.heading);
    const label = LABELS[key] ?? (key ? section.heading : "Notes");
    appendUnique(pieces, label, section.text);
  }

  return pieces.map(piece => `**${piece.label}:**\n${piece.text}`).join("\n\n");
}

export function consolidateInteractionBody(frontmatter: LegacyInteractionNarrative, markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    const notes = consolidateInteractionNotes(frontmatter, normalized);
    return notes ? `## Notes\n\n${notes}\n` : "## Notes\n\n";
  }

  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) throw new Error("Interaction frontmatter is malformed; skipped migration.");
  const frontmatterBlock = normalized.slice(0, closing + 5);
  const body = normalized.slice(closing + 5).trim();
  const parsed = parseBodySections(body);
  const notes = consolidateInteractionNotes(frontmatter, body);
  const nextBody = [parsed.title, "", "## Notes", "", notes, ""].filter((value, index) => !(index === 0 && !value)).join("\n");
  return `${frontmatterBlock}${nextBody}`;
}

export function legacyFieldsToNotes(input: Record<string, unknown>): string {
  const pieces: Array<{ label: string; text: string }> = [];
  appendUnique(pieces, "Summary", clean(input.summary));
  appendUnique(pieces, "Profile context", clean(input.contextEntry));
  appendUnique(pieces, "Observations", clean(input.observations));
  appendUnique(pieces, "Biblical and theological considerations", clean(input.biblicalConsiderations));
  appendUnique(pieces, "Interventions", clean(input.interventions));
  appendUnique(pieces, "Commitments and next steps", clean(input.commitments));
  appendUnique(pieces, "Follow-up date", clean(input.followUpDate));
  appendUnique(pieces, "Interaction cause", clean(input.interactionCauseLabel) || clean(input.interactionCause));
  appendUnique(pieces, "Issues", clean(input.issues));
  appendUnique(pieces, "Notes", clean(input.notes));
  return pieces.map(piece => `**${piece.label}:**\n${piece.text}`).join("\n\n");
}

export function legacyFrontmatterFieldNames(): string[] {
  return [...LEGACY_FRONTMATTER_FIELDS];
}

export function isLegacyNotesHeading(heading: string): boolean {
  return LEGACY_HEADINGS.has(normalizedKey(heading));
}
