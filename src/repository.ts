/* Vault repository creates and indexes portable Markdown counseling records. */

import { App, normalizePath, TFile, TFolder } from "obsidian";
import type {
  ClientRecord,
  ClientSummary,
  ConcernRecord,
  GoalRecord,
  InteractionInput,
  NewClientInput,
  CounselorDashboardSettings
} from "./types";
import {
  cleanRootFolder,
  nextClientId,
  safeFilename,
  timestampForFilename,
  wikilink,
  yamlString
} from "./utils";

const PROFILE_BLOCK_START = "<!-- counselor-dashboard:profile:start -->";
const PROFILE_BLOCK_END = "<!-- counselor-dashboard:profile:end -->";

export class CounselingRepository {
  private createdClients = new Map<string, ClientRecord>();
  private concernStatusOverrides = new Map<string, { status: string; resolved: string }>();
  private goalStatusOverrides = new Map<string, { status: string; completed: string }>();

  constructor(private app: App, private settings: CounselorDashboardSettings) {}

  updateSettings(settings: CounselorDashboardSettings): void {
    this.settings = settings;
  }

  get root(): string {
    return normalizePath(cleanRootFolder(this.settings.rootFolder));
  }

  async initializeStructure(): Promise<void> {
    await this.ensureFolder(this.root);
    await this.ensureFolder(`${this.root}/Clients`);
    await this.ensureFolder(`${this.root}/Topics`);
    await this.ensureFolder(`${this.root}/Interventions`);
    await this.ensureFolder(`${this.root}/Templates`);
  }

  getClients(): ClientRecord[] {
    const prefix = `${this.root}/Clients/`;
    const discovered = this.app.vault.getMarkdownFiles()
      .filter(file => file.path.startsWith(prefix) && file.name === "Client Profile.md")
      .map(file => this.clientFromFile(file))
      .filter((client): client is ClientRecord => client !== null);
    const clients = new Map(this.createdClients);
    for (const client of discovered) clients.set(client.id, client);
    return [...clients.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getClient(id: string): ClientRecord | undefined {
    return this.getClients().find(client => client.id === id);
  }

  getConcerns(clientId: string): ConcernRecord[] {
    const client = this.getClient(clientId);
    if (!client) return [];
    const prefix = `${client.folderPath}/Concerns/`;
    return this.app.vault.getMarkdownFiles()
      .filter(file => file.path.startsWith(prefix))
      .map(file => {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.type !== "counseling-concern") return null;
        const override = this.concernStatusOverrides.get(file.path);
        return {
          path: file.path,
          clientId,
          name: String(fm.concern ?? file.basename),
          status: override?.status ?? String(fm.status ?? "active"),
          opened: String(fm.opened ?? ""),
          resolved: override?.resolved ?? (fm.resolved ? String(fm.resolved) : "")
        } satisfies ConcernRecord;
      })
      .filter((concern): concern is ConcernRecord => concern !== null)
      .sort((a, b) => {
        const statusOrder = (value: string) => value === "resolved" ? 1 : 0;
        return statusOrder(a.status) - statusOrder(b.status) || a.name.localeCompare(b.name);
      });
  }

  getGoals(clientId: string): GoalRecord[] {
    const client = this.getClient(clientId);
    if (!client) return [];
    const prefix = `${client.folderPath}/Goals/`;
    return this.app.vault.getMarkdownFiles()
      .filter(file => file.path.startsWith(prefix))
      .map(file => {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.type !== "counseling-goal") return null;
        const override = this.goalStatusOverrides.get(file.path);
        return {
          path: file.path,
          clientId,
          name: String(fm.goal ?? file.basename),
          status: override?.status ?? String(fm.status ?? "active"),
          opened: String(fm.opened ?? ""),
          completed: override?.completed ?? (fm.completed ? String(fm.completed) : "")
        } satisfies GoalRecord;
      })
      .filter((goal): goal is GoalRecord => goal !== null)
      .sort((a, b) => {
        const statusOrder = (value: string) => value === "completed" ? 1 : 0;
        return statusOrder(a.status) - statusOrder(b.status) || a.name.localeCompare(b.name);
      });
  }

  async resolveConcern(path: string, resolvedDate: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Concern note not found: ${path}`);
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      frontmatter.status = "resolved";
      frontmatter.resolved = resolvedDate;
    });
    this.concernStatusOverrides.set(path, { status: "resolved", resolved: resolvedDate });
  }

  async reopenConcern(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Concern note not found: ${path}`);
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      frontmatter.status = "active";
      frontmatter.resolved = null;
    });
    this.concernStatusOverrides.set(path, { status: "active", resolved: "" });
  }

  async completeGoal(path: string, completedDate: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Goal note not found: ${path}`);
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      frontmatter.status = "completed";
      frontmatter.completed = completedDate;
    });
    this.goalStatusOverrides.set(path, { status: "completed", completed: completedDate });
  }

  async reopenGoal(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Goal note not found: ${path}`);
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      frontmatter.status = "active";
      frontmatter.completed = null;
    });
    this.goalStatusOverrides.set(path, { status: "active", completed: "" });
  }

  async createClient(input: NewClientInput): Promise<ClientRecord> {
    await this.initializeStructure();
    const id = nextClientId(this.getKnownClientIds());
    const folderPath = normalizePath(`${this.root}/Clients/${id}`);
    const profilePath = `${folderPath}/Client Profile.md`;
    await this.ensureFolder(folderPath);
    await this.ensureFolder(`${folderPath}/Sessions`);
    await this.ensureFolder(`${folderPath}/Concerns`);
    await this.ensureFolder(`${folderPath}/Goals`);
    await this.ensureFolder(`${folderPath}/Attachments`);

    const content = [
      "---",
      "type: counseling-client",
      `client_id: ${yamlString(id)}`,
      `name: ${yamlString(input.name.trim())}`,
      `preferred_name: ${yamlString(input.preferredName.trim())}`,
      `client_type: ${yamlString(input.clientType)}`,
      `status: ${yamlString(input.status)}`,
      `created: ${yamlString(new Date().toISOString())}`,
      "---",
      "",
      `# ${input.preferredName.trim() || input.name.trim()}`,
      "",
      "> [!warning] Confidential counseling record",
      "> Review your professional, organizational, legal, security, and retention obligations before storing identifying information.",
      "",
      "## Overview",
      "",
      "## Counselor notes",
      "",
      "## Important context",
      ""
    ].join("\n");

    await this.app.vault.create(profilePath, content);
    const client = {
      id,
      name: input.name.trim(),
      preferredName: input.preferredName.trim(),
      clientType: input.clientType,
      status: input.status,
      folderPath,
      profilePath
    };
    this.createdClients.set(id, client);
    return client;
  }

  async createInteraction(input: InteractionInput): Promise<TFile> {
    const client = this.getClient(input.clientId);
    if (!client) throw new Error(`Unknown client: ${input.clientId}`);

    await this.initializeStructure();
    const topicLinks: string[] = [];
    for (const topic of input.topics) {
      const topicFile = await this.ensureTopic(topic);
      topicLinks.push(wikilink(topicFile.path, topic));
    }

    const concernLinks: string[] = [];
    for (const concern of input.concerns) {
      const concernFile = await this.ensureConcern(client, concern);
      concernLinks.push(wikilink(concernFile.path, concern));
    }

    const goalLinks: string[] = [];
    for (const goal of input.goals) {
      const goalFile = await this.ensureGoal(client, goal);
      goalLinks.push(wikilink(goalFile.path, goal));
    }

    const clientLink = wikilink(client.profilePath, client.preferredName || client.name || client.id);
    const path = await this.uniquePath(
      `${client.folderPath}/Sessions/${input.date} - ${safeFilename(input.interactionType, "Interaction")}.md`
    );
    const list = (values: string[]) => values.length
      ? values.map(value => `  - ${yamlString(value)}`).join("\n")
      : "  []";

    const content = [
      "---",
      "type: counseling-interaction",
      `client_id: ${yamlString(client.id)}`,
      `client: ${yamlString(clientLink)}`,
      `date: ${yamlString(input.date)}`,
      `interaction_type: ${yamlString(input.interactionType)}`,
      "attendees:",
      list(input.attendees),
      "topics:",
      list(topicLinks),
      "concerns:",
      list(concernLinks),
      "goals:",
      list(goalLinks),
      `session_summary: ${yamlString(input.summary.trim())}`,
      `add_to_client_context: ${input.addToClientContext}`,
      `context_entry: ${yamlString(input.contextEntry.trim())}`,
      `follow_up_date: ${yamlString(input.followUpDate)}`,
      `created: ${yamlString(new Date().toISOString())}`,
      "---",
      "",
      `# ${input.date} — ${input.interactionType}`,
      "",
      "## Purpose and summary",
      "",
      input.summary,
      "",
      "## Client report and counselor observations",
      "",
      input.observations,
      "",
      "## Biblical and theological considerations",
      "",
      input.biblicalConsiderations,
      "",
      "## Interventions",
      "",
      input.interventions,
      "",
      "## Commitments and next steps",
      "",
      input.commitments,
      ""
    ].join("\n");

    return this.app.vault.create(path, content);
  }

  async rebuildAllClientProfiles(): Promise<number> {
    const clients = this.getClients();
    for (const client of clients) await this.rebuildClientProfile(client.id);
    return clients.length;
  }

  async rebuildClientProfile(clientId: string): Promise<void> {
    const client = this.getClient(clientId);
    if (!client) return;
    const profile = this.app.vault.getAbstractFileByPath(client.profilePath);
    if (!(profile instanceof TFile)) return;

    const interactions = this.app.vault.getMarkdownFiles()
      .filter(file => file.path.startsWith(`${client.folderPath}/Sessions/`))
      .map(file => ({ file, frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter }))
      .filter(entry => entry.frontmatter?.type === "counseling-interaction" && entry.frontmatter.client_id === clientId)
      .sort((a, b) => {
        const dateCompare = String(b.frontmatter?.date ?? "").localeCompare(String(a.frontmatter?.date ?? ""));
        return dateCompare || b.file.path.localeCompare(a.file.path);
      });

    const topicCounts = new Map<string, number>();
    const concernUsage = new Map<string, string[]>();
    const goalUsage = new Map<string, string[]>();
    for (const interaction of interactions) {
      const date = String(interaction.frontmatter?.date ?? "");
      const topics = Array.isArray(interaction.frontmatter?.topics) ? interaction.frontmatter.topics : [];
      for (const topic of topics) {
        const label = this.linkLabel(String(topic));
        topicCounts.set(label, (topicCounts.get(label) ?? 0) + 1);
      }
      const concerns = Array.isArray(interaction.frontmatter?.concerns) ? interaction.frontmatter.concerns : [];
      for (const concern of concerns) {
        const label = this.linkLabel(String(concern));
        concernUsage.set(label, [...(concernUsage.get(label) ?? []), date]);
      }
      const goals = Array.isArray(interaction.frontmatter?.goals) ? interaction.frontmatter.goals : [];
      for (const goal of goals) {
        const label = this.linkLabel(String(goal));
        goalUsage.set(label, [...(goalUsage.get(label) ?? []), date]);
      }
    }
    const frequentTopics = [...topicCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const allConcerns = this.getConcerns(clientId);
    const openConcerns = allConcerns.filter(concern => concern.status !== "resolved");
    const allGoals = this.getGoals(clientId);
    const activeGoals = allGoals.filter(goal => goal.status !== "completed");
    const last = interactions[0];
    const lastDate = String(last?.frontmatter?.date ?? "");
    const lastLink = last ? this.interactionLink(last.file, last.frontmatter) : "None recorded";

    const summaryLines = [
      "## Ledger summary",
      "",
      `- Last interaction: ${lastLink}`,
      `- Total interactions: ${interactions.length}`,
      `- Open concerns: ${openConcerns.length}`,
      `- Active goals: ${activeGoals.length}`,
      `- Frequent topics: ${frequentTopics.length
        ? frequentTopics.slice(0, 8).map(topic => `${topic.name} (${topic.count})`).join(", ")
        : "None recorded"}`
    ];

    const concernLines = ["## Concerns", ""];
    if (!allConcerns.length) {
      concernLines.push("No concerns recorded.");
    } else {
      for (const concern of allConcerns) {
        const dates = (concernUsage.get(concern.name) ?? []).filter(Boolean).sort();
        const detail = dates.length
          ? `addressed ${dates.length} ${dates.length === 1 ? "time" : "times"}; first ${dates[0]}; latest ${dates[dates.length - 1]}`
          : "not yet linked from a session";
        concernLines.push(`- ${wikilink(concern.path, concern.name)} — ${concern.status}; ${detail}`);
      }
    }

    const goalLines = ["## Goals", ""];
    if (!allGoals.length) {
      goalLines.push("No goals recorded.");
    } else {
      for (const goal of allGoals) {
        const dates = (goalUsage.get(goal.name) ?? []).filter(Boolean).sort();
        const detail = dates.length
          ? `addressed ${dates.length} ${dates.length === 1 ? "time" : "times"}; first ${dates[0]}; latest ${dates[dates.length - 1]}`
          : "not yet linked from a session";
        goalLines.push(`- ${wikilink(goal.path, goal.name)} — ${goal.status}; ${detail}`);
      }
    }

    const sessionLines = ["## Session history", ""];
    if (!interactions.length) {
      sessionLines.push("No sessions recorded.");
    } else {
      for (const interaction of interactions) {
        const fm = interaction.frontmatter;
        const topics = Array.isArray(fm?.topics) ? fm.topics.map((topic: unknown) => String(topic)) : [];
        const concerns = Array.isArray(fm?.concerns) ? fm.concerns.map((concern: unknown) => String(concern)) : [];
        const goals = Array.isArray(fm?.goals) ? fm.goals.map((goal: unknown) => String(goal)) : [];
        const summary = this.singleLine(String(fm?.session_summary ?? ""));
        sessionLines.push(`- ${this.interactionLink(interaction.file, fm)}`);
        if (topics.length) sessionLines.push(`  - Topics: ${topics.join(", ")}`);
        if (concerns.length) sessionLines.push(`  - Concerns: ${concerns.join(", ")}`);
        if (goals.length) sessionLines.push(`  - Goals: ${goals.join(", ")}`);
        if (summary) sessionLines.push(`  - Summary: ${summary}`);
      }
    }

    const contextLines = ["## Context timeline", ""];
    const contextInteractions = interactions.filter(interaction => interaction.frontmatter?.add_to_client_context === true);
    if (!contextInteractions.length) {
      contextLines.push("No session context has been promoted to the profile.");
    } else {
      for (const interaction of contextInteractions) {
        const fm = interaction.frontmatter;
        const entry = this.singleLine(String(fm?.context_entry ?? fm?.session_summary ?? ""));
        if (!entry) continue;
        contextLines.push(`- ${String(fm?.date ?? "Unknown date")} — ${entry}`);
        contextLines.push(`  - Source: ${this.interactionLink(interaction.file, fm)}`);
      }
    }

    const managedBlock = [
      PROFILE_BLOCK_START,
      ...summaryLines,
      "",
      ...concernLines,
      "",
      ...goalLines,
      "",
      ...sessionLines,
      "",
      ...contextLines,
      PROFILE_BLOCK_END
    ].join("\n");

    await this.updateProfileSummaryProperties(profile, {
      lastDate,
      interactionCount: interactions.length,
      openConcernCount: openConcerns.length,
      activeGoalCount: activeGoals.length,
      frequentTopics: frequentTopics.slice(0, 8).map(topic => `${topic.name} (${topic.count})`)
    });
    await this.app.vault.process(profile, current => this.replaceManagedProfileBlock(current, managedBlock));
  }

  getClientSummaries(): ClientSummary[] {
    const clients = this.getClients();
    const summaries = new Map(clients.map(client => [client.id, {
      interactionCount: 0,
      lastInteraction: "",
      openConcernCount: 0,
      activeGoalCount: 0,
      topicCounts: new Map<string, number>()
    }]));
    const prefix = `${this.root}/Clients/`;

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(prefix)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const clientId = typeof fm?.client_id === "string" ? fm.client_id : "";
      const summary = summaries.get(clientId);
      if (!summary) continue;

      if (fm?.type === "counseling-interaction") {
        summary.interactionCount += 1;
        const date = String(fm.date ?? "");
        if (date > summary.lastInteraction) summary.lastInteraction = date;
        const topics = Array.isArray(fm.topics) ? fm.topics : [];
        for (const topic of topics) {
          const label = this.linkLabel(String(topic));
          summary.topicCounts.set(label, (summary.topicCounts.get(label) ?? 0) + 1);
        }
      } else if (fm?.type === "counseling-concern") {
        const status = this.concernStatusOverrides.get(file.path)?.status ?? String(fm.status ?? "active");
        if (status !== "resolved") summary.openConcernCount += 1;
      } else if (fm?.type === "counseling-goal") {
        const status = this.goalStatusOverrides.get(file.path)?.status ?? String(fm.status ?? "active");
        if (status !== "completed") summary.activeGoalCount += 1;
      }
    }

    return clients.map(client => {
      const summary = summaries.get(client.id)!;
      return {
        ...client,
        interactionCount: summary.interactionCount,
        lastInteraction: summary.lastInteraction,
        openConcernCount: summary.openConcernCount,
        activeGoalCount: summary.activeGoalCount,
        topicCounts: [...summary.topicCounts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      };
    });
  }

  private clientFromFile(file: TFile): ClientRecord | null {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== "counseling-client" || typeof fm.client_id !== "string") return null;
    const folderPath = file.parent?.path ?? file.path.substring(0, file.path.lastIndexOf("/"));
    return {
      id: fm.client_id,
      name: String(fm.name ?? fm.client_id),
      preferredName: String(fm.preferred_name ?? ""),
      clientType: String(fm.client_type ?? "individual"),
      status: String(fm.status ?? "active"),
      folderPath,
      profilePath: file.path
    };
  }

  private getKnownClientIds(): string[] {
    const clientFolder = normalizePath(`${this.root}/Clients`);
    const profileIds = this.getClients().map(client => client.id);
    const folderIds = this.app.vault.getAllLoadedFiles()
      .filter((entry): entry is TFolder => entry instanceof TFolder && entry.parent?.path === clientFolder)
      .map(folder => folder.name)
      .filter(name => /^CL-\d+(?:-[A-Z0-9]+)?$/.test(name));
    return [...new Set([...profileIds, ...folderIds])];
  }

  private async ensureTopic(topic: string): Promise<TFile> {
    const path = normalizePath(`${this.root}/Topics/${safeFilename(topic)}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    const content = [
      "---",
      "type: counseling-topic",
      `topic: ${yamlString(topic)}`,
      `created: ${yamlString(new Date().toISOString())}`,
      "---",
      "",
      `# ${topic}`,
      "",
      "## Definition",
      "",
      "## Biblical and theological considerations",
      "",
      "## Related topics",
      "",
      "## Counseling resources",
      ""
    ].join("\n");
    return this.app.vault.create(path, content);
  }

  private async ensureConcern(client: ClientRecord, concern: string): Promise<TFile> {
    const path = normalizePath(`${client.folderPath}/Concerns/${safeFilename(concern)}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    const content = [
      "---",
      "type: counseling-concern",
      `client_id: ${yamlString(client.id)}`,
      `client: ${yamlString(wikilink(client.profilePath, client.preferredName || client.name || client.id))}`,
      `concern: ${yamlString(concern)}`,
      "status: active",
      `opened: ${yamlString(new Date().toISOString().slice(0, 10))}`,
      "resolved: null",
      "---",
      "",
      `# ${concern}`,
      "",
      "## Description",
      "",
      "## Goals",
      "",
      "## Progress notes",
      ""
    ].join("\n");
    return this.app.vault.create(path, content);
  }

  private async ensureGoal(client: ClientRecord, goal: string): Promise<TFile> {
    await this.ensureFolder(`${client.folderPath}/Goals`);
    const path = normalizePath(`${client.folderPath}/Goals/${safeFilename(goal)}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    const content = [
      "---",
      "type: counseling-goal",
      `client_id: ${yamlString(client.id)}`,
      `client: ${yamlString(wikilink(client.profilePath, client.preferredName || client.name || client.id))}`,
      `goal: ${yamlString(goal)}`,
      "status: active",
      `opened: ${yamlString(new Date().toISOString().slice(0, 10))}`,
      "completed: null",
      "---",
      "",
      `# ${goal}`,
      "",
      "## Desired outcome",
      "",
      "## Measures of progress",
      "",
      "## Progress notes",
      ""
    ].join("\n");
    return this.app.vault.create(path, content);
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFolder) return;
    if (existing) throw new Error(`A file already exists at ${normalized}`);
    const parent = normalized.substring(0, normalized.lastIndexOf("/"));
    if (parent) await this.ensureFolder(parent);
    await this.app.vault.createFolder(normalized);
  }

  private async uniquePath(preferredPath: string): Promise<string> {
    const normalized = normalizePath(preferredPath);
    if (!this.app.vault.getAbstractFileByPath(normalized)) return normalized;
    const extensionIndex = normalized.lastIndexOf(".md");
    const base = extensionIndex >= 0 ? normalized.slice(0, extensionIndex) : normalized;
    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${base} ${index}.md`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    return `${base} ${timestampForFilename()}.md`;
  }

  private linkLabel(value: string): string {
    const aliasMatch = /\|([^\]]+)\]\]$/.exec(value);
    if (aliasMatch) return aliasMatch[1];
    const pathMatch = /\[\[([^\]]+)\]\]/.exec(value);
    const path = pathMatch?.[1] ?? value;
    return path.split("/").pop()?.replace(/\.md$/i, "") ?? value;
  }

  private interactionLink(file: TFile, frontmatter: Record<string, unknown> | undefined): string {
    const date = String(frontmatter?.date ?? file.basename);
    const type = String(frontmatter?.interaction_type ?? "Interaction");
    return wikilink(file.path, `${date} — ${type}`);
  }

  private singleLine(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  private replaceManagedProfileBlock(current: string, managedBlock: string): string {
    const start = current.indexOf(PROFILE_BLOCK_START);
    const end = current.indexOf(PROFILE_BLOCK_END);
    if (start >= 0 && end >= start) {
      const after = end + PROFILE_BLOCK_END.length;
      return `${current.slice(0, start).trimEnd()}\n\n${managedBlock}${current.slice(after)}`;
    }
    return `${current.trimEnd()}\n\n${managedBlock}\n`;
  }

  private async updateProfileSummaryProperties(
    profile: TFile,
    values: {
      lastDate: string;
      interactionCount: number;
      openConcernCount: number;
      activeGoalCount: number;
      frequentTopics: string[];
    }
  ): Promise<void> {
    const current = this.app.metadataCache.getFileCache(profile)?.frontmatter;
    const unchanged = String(current?.ledger_last_interaction ?? "") === values.lastDate
      && Number(current?.ledger_interaction_count ?? 0) === values.interactionCount
      && Number(current?.ledger_open_concern_count ?? 0) === values.openConcernCount
      && Number(current?.ledger_active_goal_count ?? 0) === values.activeGoalCount
      && JSON.stringify(current?.ledger_frequent_topics ?? []) === JSON.stringify(values.frequentTopics);
    if (unchanged) return;
    await this.app.fileManager.processFrontMatter(profile, frontmatter => {
      frontmatter.ledger_last_interaction = values.lastDate || null;
      frontmatter.ledger_interaction_count = values.interactionCount;
      frontmatter.ledger_open_concern_count = values.openConcernCount;
      frontmatter.ledger_active_goal_count = values.activeGoalCount;
      frontmatter.ledger_frequent_topics = values.frequentTopics;
    });
  }
}
