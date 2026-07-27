/* Pure helpers normalize paths, filenames, IDs, dates, and YAML values safely. */

export function cleanRootFolder(value: string): string {
  const candidate = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  const unsafe = !candidate || candidate === "." || candidate.split("/").some(part => part === "..");
  return unsafe ? "Counselor Dashboard" : candidate;
}

export function safeFilename(value: string, fallback = "Untitled"): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 100);
  return cleaned || fallback;
}

export function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function splitList(value: string): string[] {
  return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function timestampForFilename(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16).replace("T", "-").replace(":", "-");
}

export function nextClientId(existingIds: string[]): string {
  const highest = existingIds.reduce((max, id) => {
    const match = /^CL-(\d+)(?:-[A-Z0-9]+)?$/.exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const bytes = new Uint8Array(3);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  const suffix = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `CL-${String(highest + 1).padStart(4, "0")}-${suffix}`;
}

export function wikilink(path: string, alias?: string): string {
  const withoutExtension = path.replace(/\.md$/i, "");
  return `[[${withoutExtension}${alias ? `|${alias}` : ""}]]`;
}
