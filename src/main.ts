/* Plugin entry point registers commands, dashboard, forms, settings, and vault events. */

import { Notice, Plugin, TFile } from "obsidian";
import { CounselingDashboardView, DASHBOARD_VIEW_TYPE } from "./dashboard";
import { ConcernManagerModal, GoalManagerModal, NewClientModal, NewInteractionModal } from "./modals";
import { CounselingRepository } from "./repository";
import { CounselorDashboardSettingTab } from "./settings";
import { DEFAULT_SETTINGS, type CounselorDashboardSettings } from "./types";
import { todayIso } from "./utils";

export default class CounselorDashboardPlugin extends Plugin {
  settings: CounselorDashboardSettings = DEFAULT_SETTINGS;
  repository!: CounselingRepository;
  private refreshTimer: number | null = null;
  private profileRefreshTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.repository = new CounselingRepository(this.app, this.settings);
    this.registerView(DASHBOARD_VIEW_TYPE, leaf => new CounselingDashboardView(leaf, this));
    this.addSettingTab(new CounselorDashboardSettingTab(this.app, this));

    this.addRibbonIcon("notebook-tabs", "Open Counselor Dashboard", () => void this.openDashboard());
    this.addCommand({
      id: "open-dashboard",
      name: "Open dashboard",
      callback: () => void this.openDashboard()
    });
    this.addCommand({
      id: "create-client",
      name: `Create ${this.settings.clientTerm.toLowerCase()}`,
      callback: () => this.openNewClientModal()
    });
    this.addCommand({
      id: "record-interaction",
      name: "Record counseling interaction",
      callback: () => this.openInteractionModal()
    });
    this.addCommand({
      id: "manage-concerns",
      name: "Manage concerns",
      callback: () => this.openConcernManager()
    });
    this.addCommand({
      id: "manage-goals",
      name: "Manage goals",
      callback: () => this.openGoalManager()
    });
    this.addCommand({
      id: "initialize-folders",
      name: "Initialize counseling folders",
      callback: async () => {
        await this.repository.initializeStructure();
        new Notice(`Created or verified ${this.settings.rootFolder}.`);
      }
    });
    this.addCommand({
      id: "rebuild-client-profiles",
      name: "Rebuild client profiles",
      callback: async () => {
        const count = await this.repository.rebuildAllClientProfiles();
        new Notice(`Rebuilt ${count} client ${count === 1 ? "profile" : "profiles"}.`);
        await this.refreshDashboard();
      }
    });

    this.registerEvent(this.app.metadataCache.on("changed", file => {
      if (file.path.startsWith(`${this.repository.root}/`)) this.scheduleDashboardRefresh();
      if (this.isProfileSourcePath(file.path) && this.app.workspace.layoutReady) this.scheduleProfileRebuild();
    }));
    this.registerEvent(this.app.vault.on("delete", file => {
      if (file.path.startsWith(`${this.repository.root}/`)) this.scheduleDashboardRefresh();
      if (this.isProfileSourcePath(file.path)) this.scheduleProfileRebuild();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file.path.startsWith(`${this.repository.root}/`) || oldPath.startsWith(`${this.repository.root}/`)) {
        this.scheduleDashboardRefresh();
      }
      if (this.isProfileSourcePath(file.path) || this.isProfileSourcePath(oldPath)) this.scheduleProfileRebuild();
    }));
  }

  async onunload(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    if (this.profileRefreshTimer !== null) window.clearTimeout(this.profileRefreshTimer);
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CounselorDashboardSettings> | null);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.repository.updateSettings(this.settings);
    await this.refreshDashboard();
  }

  async openDashboard(): Promise<void> {
    await this.repository.initializeStructure();
    await this.repository.rebuildAllClientProfiles();
    let leaf = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  openNewClientModal(): void {
    new NewClientModal(this.app, this.settings.clientTerm, async input => {
      try {
        const client = await this.repository.createClient(input);
        new Notice(`${this.settings.clientTerm} ${client.id} created.`);
        await this.openFile(client.profilePath);
        await this.refreshDashboard();
      } catch (error) {
        this.reportError("Could not create client", error);
      }
    }).open();
  }

  openInteractionModal(selectedClientId?: string): void {
    const clients = this.repository.getClients();
    if (!clients.length) {
      new Notice(`Create a ${this.settings.clientTerm.toLowerCase()} before recording an interaction.`);
      this.openNewClientModal();
      return;
    }
    new NewInteractionModal(
      this.app,
      clients,
      this.settings.defaultSessionType,
      selectedClientId,
      this.settings.interactionDraft,
      draft => this.saveInteractionDraft(draft),
      async input => {
        const file = await this.repository.createInteraction(input);
        new Notice("Counseling interaction created.");
        await this.app.workspace.getLeaf("tab").openFile(file);
        this.scheduleProfileRebuild();
        await this.refreshDashboard();
      }
    ).open();
  }

  openConcernManager(selectedClientId?: string): void {
    const clients = this.repository.getClients();
    if (!clients.length) {
      new Notice(`Create a ${this.settings.clientTerm.toLowerCase()} before managing concerns.`);
      return;
    }
    new ConcernManagerModal(
      this.app,
      clients,
      selectedClientId,
      clientId => this.repository.getConcerns(clientId),
      async concern => {
        await this.repository.resolveConcern(concern.path, todayIso());
        new Notice(`Resolved: ${concern.name}`);
        await this.repository.rebuildClientProfile(concern.clientId);
        await this.refreshDashboard();
      },
      async concern => {
        await this.repository.reopenConcern(concern.path);
        new Notice(`Reopened: ${concern.name}`);
        await this.repository.rebuildClientProfile(concern.clientId);
        await this.refreshDashboard();
      },
      concern => this.openFile(concern.path)
    ).open();
  }

  openGoalManager(selectedClientId?: string): void {
    const clients = this.repository.getClients();
    if (!clients.length) {
      new Notice(`Create a ${this.settings.clientTerm.toLowerCase()} before managing goals.`);
      return;
    }
    new GoalManagerModal(
      this.app,
      clients,
      selectedClientId,
      clientId => this.repository.getGoals(clientId),
      async goal => {
        await this.repository.completeGoal(goal.path, todayIso());
        new Notice(`Completed: ${goal.name}`);
        await this.repository.rebuildClientProfile(goal.clientId);
        await this.refreshDashboard();
      },
      async goal => {
        await this.repository.reopenGoal(goal.path);
        new Notice(`Reopened: ${goal.name}`);
        await this.repository.rebuildClientProfile(goal.clientId);
        await this.refreshDashboard();
      },
      goal => this.openFile(goal.path)
    ).open();
  }

  async openFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`File not found: ${path}`);
      return;
    }
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private async refreshDashboard(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CounselingDashboardView) await view.render();
    }
  }

  private scheduleDashboardRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshDashboard();
    }, 250);
  }

  private scheduleProfileRebuild(): void {
    if (this.profileRefreshTimer !== null) window.clearTimeout(this.profileRefreshTimer);
    this.profileRefreshTimer = window.setTimeout(() => {
      this.profileRefreshTimer = null;
      void this.repository.rebuildAllClientProfiles()
        .then(() => this.refreshDashboard())
        .catch(error => this.reportError("Could not rebuild client profiles", error));
    }, 500);
  }

  private isProfileSourcePath(path: string): boolean {
    const prefix = `${this.repository.root}/Clients/`;
    return path.startsWith(prefix)
      && (path.includes("/Sessions/") || path.includes("/Concerns/") || path.includes("/Goals/"));
  }

  private async saveInteractionDraft(draft: CounselorDashboardSettings["interactionDraft"]): Promise<void> {
    this.settings.interactionDraft = draft;
    await this.saveData(this.settings);
  }

  private reportError(prefix: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Counselor Dashboard] ${prefix}`, error);
    new Notice(`${prefix}: ${message}`);
  }
}
