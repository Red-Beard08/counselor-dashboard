/* Dashboard view summarizes clients, interactions, topics, and active concerns. */

import { ButtonComponent, ItemView, WorkspaceLeaf } from "obsidian";
import type CounselorDashboardPlugin from "./main";

export const DASHBOARD_VIEW_TYPE = "counselor-dashboard-dashboard";

export class CounselingDashboardView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: CounselorDashboardPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Counselor Dashboard";
  }

  getIcon(): string {
    return "notebook-tabs";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("counselor-dashboard-dashboard");

    const header = container.createDiv({ cls: "counselor-dashboard-dashboard-header" });
    const heading = header.createDiv();
    heading.createEl("p", { cls: "counselor-dashboard-eyebrow", text: "CHRISTIAN COUNSELING WORKSPACE" });
    heading.createEl("h1", { text: "Counselor Dashboard" });
    heading.createEl("p", {
      cls: "counselor-dashboard-subtitle",
      text: "Portable Markdown records with linked clients, concerns, topics, and interactions."
    });

    const actions = header.createDiv({ cls: "counselor-dashboard-dashboard-actions" });
    new ButtonComponent(actions).setButtonText(`New ${this.plugin.settings.clientTerm}`).setCta()
      .onClick(() => this.plugin.openNewClientModal());
    new ButtonComponent(actions).setButtonText("Record interaction")
      .onClick(() => this.plugin.openInteractionModal());

    if (this.plugin.settings.showPrivacyReminder) {
      const warning = container.createDiv({ cls: "counselor-dashboard-privacy" });
      warning.createEl("strong", { text: "Privacy reminder: " });
      warning.appendText("records are ordinary files and are not encrypted by this plugin. Review storage, sync, access, consent, and retention requirements.");
    }

    const summaries = this.plugin.repository.getClientSummaries();
    const metrics = container.createDiv({ cls: "counselor-dashboard-metrics" });
    const interactionTotal = summaries.reduce((sum, client) => sum + client.interactionCount, 0);
    const concernTotal = summaries.reduce((sum, client) => sum + client.openConcernCount, 0);
    const goalTotal = summaries.reduce((sum, client) => sum + client.activeGoalCount, 0);
    this.metric(metrics, summaries.length, `${this.plugin.settings.clientTerm}s`);
    this.metric(metrics, interactionTotal, "Interactions");
    this.metric(metrics, concernTotal, "Open concerns");
    this.metric(metrics, goalTotal, "Active goals");

    const sectionHeader = container.createDiv({ cls: "counselor-dashboard-section-header" });
    sectionHeader.createEl("h2", { text: `${this.plugin.settings.clientTerm}s` });
    sectionHeader.createEl("span", { text: `${summaries.length} total` });

    if (!summaries.length) {
      const empty = container.createDiv({ cls: "counselor-dashboard-empty" });
      empty.createEl("h3", { text: `No ${this.plugin.settings.clientTerm.toLowerCase()} records yet` });
      empty.createEl("p", { text: "Create the first record to generate the portable folder structure." });
      new ButtonComponent(empty).setButtonText(`Create ${this.plugin.settings.clientTerm}`).setCta()
        .onClick(() => this.plugin.openNewClientModal());
      return;
    }

    const grid = container.createDiv({ cls: "counselor-dashboard-client-grid" });
    for (const client of summaries) {
      const card = grid.createDiv({ cls: "counselor-dashboard-client-card" });
      const cardHeader = card.createDiv({ cls: "counselor-dashboard-client-card-header" });
      const title = cardHeader.createEl("button", {
        cls: "counselor-dashboard-link-button",
        text: client.preferredName || client.name || client.id
      });
      title.addEventListener("click", () => void this.plugin.openFile(client.profilePath));
      cardHeader.createEl("span", { cls: `counselor-dashboard-status is-${client.status}`, text: client.status });
      card.createEl("p", { cls: "counselor-dashboard-client-id", text: `${client.id} · ${client.clientType}` });

      const stats = card.createDiv({ cls: "counselor-dashboard-card-stats" });
      this.cardStat(stats, String(client.interactionCount), "Interactions");
      this.cardStat(stats, String(client.openConcernCount), "Open concerns");
      this.cardStat(stats, String(client.activeGoalCount), "Active goals");
      this.cardStat(stats, client.lastInteraction || "—", "Last contact");

      if (client.topicCounts.length) {
        const topics = card.createDiv({ cls: "counselor-dashboard-topic-list" });
        topics.createEl("strong", { text: "Frequent topics" });
        for (const topic of client.topicCounts.slice(0, 4)) {
          topics.createEl("span", { text: `${topic.name} · ${topic.count}` });
        }
      }

      const cardActions = card.createDiv({ cls: "counselor-dashboard-card-actions" });
      new ButtonComponent(cardActions).setButtonText("Open profile")
        .onClick(() => void this.plugin.openFile(client.profilePath));
      new ButtonComponent(cardActions).setButtonText("New interaction").setCta()
        .onClick(() => this.plugin.openInteractionModal(client.id));
      new ButtonComponent(cardActions).setButtonText("Manage concerns")
        .onClick(() => this.plugin.openConcernManager(client.id));
      new ButtonComponent(cardActions).setButtonText("Manage goals")
        .onClick(() => this.plugin.openGoalManager(client.id));
    }
  }

  private metric(container: HTMLElement, value: number, label: string): void {
    const metric = container.createDiv({ cls: "counselor-dashboard-metric" });
    metric.createEl("strong", { text: String(value) });
    metric.createEl("span", { text: label });
  }

  private cardStat(container: HTMLElement, value: string, label: string): void {
    const stat = container.createDiv();
    stat.createEl("strong", { text: value });
    stat.createEl("span", { text: label });
  }
}
