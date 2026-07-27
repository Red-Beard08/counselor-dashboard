/* Modal forms collect client and interaction data without hiding the Markdown output. */

import {
  App,
  ButtonComponent,
  DropdownComponent,
  Modal,
  Notice,
  Setting,
  TextAreaComponent,
  TextComponent
} from "obsidian";
import type { ClientRecord, ConcernRecord, GoalRecord, InteractionInput, NewClientInput } from "./types";
import { splitList, todayIso } from "./utils";

export class NewClientModal extends Modal {
  private input: NewClientInput = {
    name: "",
    preferredName: "",
    clientType: "individual",
    status: "active"
  };

  constructor(app: App, private clientTerm: string, private onSubmit: (input: NewClientInput) => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("counselor-dashboard-modal");
    contentEl.createEl("h2", { text: `Create ${this.clientTerm}` });
    contentEl.createEl("p", {
      cls: "counselor-dashboard-form-help",
      text: "Creates a portable profile and folder tree. Use a pseudonym or stable identifier when appropriate."
    });

    new Setting(contentEl)
      .setName("Name or identifier")
      .setDesc("Required. Stored in the profile frontmatter.")
      .addText(text => text
        .setPlaceholder("Name, initials, or pseudonym")
        .onChange(value => { this.input.name = value; }));

    new Setting(contentEl)
      .setName("Preferred display name")
      .setDesc("Optional name used in links and dashboards.")
      .addText(text => text.onChange(value => { this.input.preferredName = value; }));

    new Setting(contentEl)
      .setName(`${this.clientTerm} type`)
      .addDropdown(dropdown => dropdown
        .addOptions({ individual: "Individual", couple: "Couple", family: "Family", group: "Group" })
        .setValue(this.input.clientType)
        .onChange(value => { this.input.clientType = value; }));

    new Setting(contentEl)
      .setName("Status")
      .addDropdown(dropdown => dropdown
        .addOptions({ active: "Active", inactive: "Inactive", completed: "Completed" })
        .setValue(this.input.status)
        .onChange(value => { this.input.status = value; }));

    this.addFooter(contentEl, "Create", async () => {
      if (!this.input.name.trim()) {
        new Notice("Enter a name or stable identifier.");
        return;
      }
      await this.onSubmit(this.input);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private addFooter(container: HTMLElement, label: string, submit: () => Promise<void>): void {
    const footer = container.createDiv({ cls: "counselor-dashboard-form-footer" });
    new ButtonComponent(footer).setButtonText("Cancel").onClick(() => this.close());
    new ButtonComponent(footer).setButtonText(label).setCta().onClick(() => void submit());
  }
}

export class NewInteractionModal extends Modal {
  private input: InteractionInput;
  private draftTimer: number | null = null;
  private submitted = false;

  constructor(
    app: App,
    private clients: ClientRecord[],
    defaultSessionType: string,
    selectedClientId: string | undefined,
    initialDraft: InteractionInput | null,
    private onDraftChange: (draft: InteractionInput | null) => Promise<void>,
    private onSubmit: (input: InteractionInput) => Promise<void>
  ) {
    super(app);
    const defaultInput: InteractionInput = {
      clientId: selectedClientId ?? clients[0]?.id ?? "",
      date: todayIso(),
      interactionType: defaultSessionType,
      attendees: [],
      topics: [],
      concerns: [],
      goals: [],
      summary: "",
      addToClientContext: false,
      contextEntry: "",
      observations: "",
      biblicalConsiderations: "",
      interventions: "",
      commitments: "",
      followUpDate: ""
    };
    const canRestoreDraft = initialDraft
      && clients.some(client => client.id === initialDraft.clientId)
      && (!selectedClientId || selectedClientId === initialDraft.clientId);
    this.input = canRestoreDraft ? { ...defaultInput, ...initialDraft } : defaultInput;
    this.input.goals = Array.isArray(this.input.goals) ? this.input.goals : [];
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("counselor-dashboard-modal", "counselor-dashboard-interaction-modal");
    contentEl.createEl("h2", { text: "Record counseling interaction" });
    contentEl.createEl("p", {
      cls: "counselor-dashboard-form-help",
      text: "Topics become reusable linked notes. Concerns become client-specific linked records."
    });

    this.addClientDropdown(contentEl);
    if (this.hasDraftContent()) {
      contentEl.createEl("p", {
        cls: "counselor-dashboard-draft-notice",
        text: "Restored an autosaved interaction draft."
      });
    }

    this.addText(contentEl, "Date", "YYYY-MM-DD", this.input.date, value => this.update({ date: value }), "date");
    this.addText(contentEl, "Interaction type", "individual, couple, phone, email…", this.input.interactionType,
      value => this.update({ interactionType: value }));
    this.addText(contentEl, "Attendees", "Comma-separated names or roles", this.input.attendees.join(", "),
      value => this.update({ attendees: splitList(value) }));
    this.addText(contentEl, "Topics", "Forgiveness, anxiety, communication", this.input.topics.join(", "),
      value => this.update({ topics: splitList(value) }));
    this.addText(contentEl, "Concerns", "Client-specific concerns, comma-separated", this.input.concerns.join(", "),
      value => this.update({ concerns: splitList(value) }));
    this.addText(contentEl, "Goals", "Client-specific goals, comma-separated", this.input.goals.join(", "),
      value => this.update({ goals: splitList(value) }));
    this.addArea(contentEl, "Purpose and summary", this.input.summary, value => this.update({ summary: value }));
    new Setting(contentEl)
      .setName("Add to client context")
      .setDesc("Adds a dated, source-linked entry to the plugin-managed context timeline on the client profile.")
      .addToggle(toggle => toggle
        .setValue(this.input.addToClientContext)
        .onChange(value => this.update({ addToClientContext: value })));
    this.addArea(contentEl, "Profile context entry", this.input.contextEntry,
      value => this.update({ contextEntry: value }));
    this.addArea(contentEl, "Client report and counselor observations", this.input.observations,
      value => this.update({ observations: value }));
    this.addArea(contentEl, "Biblical and theological considerations", this.input.biblicalConsiderations,
      value => this.update({ biblicalConsiderations: value }));
    this.addArea(contentEl, "Interventions", this.input.interventions, value => this.update({ interventions: value }));
    this.addArea(contentEl, "Commitments and next steps", this.input.commitments,
      value => this.update({ commitments: value }));
    this.addText(contentEl, "Follow-up date", "YYYY-MM-DD", this.input.followUpDate,
      value => this.update({ followUpDate: value }), "date");

    const footer = contentEl.createDiv({ cls: "counselor-dashboard-form-footer" });
    new ButtonComponent(footer).setButtonText("Cancel").onClick(() => this.close());
    new ButtonComponent(footer).setButtonText("Create interaction").setCta().onClick(() => void this.submit());
  }

  onClose(): void {
    if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);
    if (!this.submitted) void this.onDraftChange(this.cloneInput());
    this.contentEl.empty();
  }

  private addClientDropdown(container: HTMLElement): void {
    const setting = new Setting(container).setName("Client").setDesc("Required");
    setting.addDropdown((dropdown: DropdownComponent) => {
      for (const client of this.clients) {
        dropdown.addOption(client.id, `${client.preferredName || client.name} (${client.id})`);
      }
      dropdown.setValue(this.input.clientId).onChange(value => this.update({ clientId: value }));
    });
  }

  private addText(
    container: HTMLElement,
    name: string,
    placeholder: string,
    value: string,
    onChange: (value: string) => void,
    inputType?: string
  ): void {
    new Setting(container).setName(name).addText((text: TextComponent) => {
      text.setPlaceholder(placeholder).setValue(value).onChange(onChange);
      if (inputType) text.inputEl.type = inputType;
    });
  }

  private addArea(container: HTMLElement, name: string, value: string, onChange: (value: string) => void): void {
    new Setting(container).setName(name).addTextArea((area: TextAreaComponent) => area
      .setPlaceholder(name)
      .setValue(value)
      .onChange(onChange));
  }

  private async submit(): Promise<void> {
    if (!this.input.clientId) {
      new Notice("Choose a client.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.input.date)) {
      new Notice("Enter a date in YYYY-MM-DD format.");
      return;
    }
    if (!this.input.interactionType.trim()) {
      new Notice("Enter an interaction type.");
      return;
    }
    try {
      await this.onSubmit(this.input);
      this.submitted = true;
      if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);
      await this.onDraftChange(null);
      this.close();
    } catch (error) {
      await this.onDraftChange(this.cloneInput());
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not create interaction: ${message}. The draft was preserved.`);
    }
  }

  private update(patch: Partial<InteractionInput>): void {
    this.input = { ...this.input, ...patch };
    if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = null;
      void this.onDraftChange(this.cloneInput());
    }, 350);
  }

  private cloneInput(): InteractionInput {
    return {
      ...this.input,
      attendees: [...this.input.attendees],
      topics: [...this.input.topics],
      concerns: [...this.input.concerns],
      goals: [...this.input.goals]
    };
  }

  private hasDraftContent(): boolean {
    return Boolean(
      this.input.attendees.length
      || this.input.topics.length
      || this.input.concerns.length
      || this.input.goals.length
      || this.input.summary
      || this.input.addToClientContext
      || this.input.contextEntry
      || this.input.observations
      || this.input.biblicalConsiderations
      || this.input.interventions
      || this.input.commitments
      || this.input.followUpDate
    );
  }
}

export class ConcernManagerModal extends Modal {
  private selectedClientId: string;

  constructor(
    app: App,
    private clients: ClientRecord[],
    selectedClientId: string | undefined,
    private getConcerns: (clientId: string) => ConcernRecord[],
    private onResolve: (concern: ConcernRecord) => Promise<void>,
    private onReopen: (concern: ConcernRecord) => Promise<void>,
    private onOpenNote: (concern: ConcernRecord) => Promise<void>
  ) {
    super(app);
    this.selectedClientId = selectedClientId ?? clients[0]?.id ?? "";
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("counselor-dashboard-modal", "counselor-dashboard-concern-modal");
    contentEl.createEl("h2", { text: "Manage concerns" });
    contentEl.createEl("p", {
      cls: "counselor-dashboard-form-help",
      text: "Resolving a concern preserves its note and history while updating its structured status and resolution date."
    });

    new Setting(contentEl).setName("Client").addDropdown(dropdown => {
      for (const client of this.clients) {
        dropdown.addOption(client.id, `${client.preferredName || client.name} (${client.id})`);
      }
      dropdown.setValue(this.selectedClientId).onChange(value => {
        this.selectedClientId = value;
        this.render();
      });
    });

    const concerns = this.getConcerns(this.selectedClientId);
    const openConcerns = concerns.filter(concern => concern.status !== "resolved");
    const resolvedConcerns = concerns.filter(concern => concern.status === "resolved");

    this.renderSection(contentEl, "Open concerns", openConcerns, false);
    this.renderSection(contentEl, "Resolved concerns", resolvedConcerns, true);

    const footer = contentEl.createDiv({ cls: "counselor-dashboard-form-footer" });
    new ButtonComponent(footer).setButtonText("Close").onClick(() => this.close());
  }

  private renderSection(
    container: HTMLElement,
    title: string,
    concerns: ConcernRecord[],
    resolved: boolean
  ): void {
    const section = container.createDiv({ cls: "counselor-dashboard-concern-section" });
    const heading = section.createDiv({ cls: "counselor-dashboard-concern-section-heading" });
    heading.createEl("h3", { text: title });
    heading.createEl("span", { text: String(concerns.length) });

    if (!concerns.length) {
      section.createEl("p", {
        cls: "counselor-dashboard-empty-message",
        text: resolved ? "No concerns have been resolved." : "No open concerns for this client."
      });
      return;
    }

    for (const concern of concerns) {
      const row = section.createDiv({ cls: "counselor-dashboard-concern-row" });
      const details = row.createDiv({ cls: "counselor-dashboard-concern-details" });
      details.createEl("strong", { text: concern.name });
      const dates = resolved
        ? `Opened ${concern.opened || "unknown"} · Resolved ${concern.resolved || "unknown"}`
        : `Opened ${concern.opened || "unknown"}`;
      details.createEl("span", { text: dates });

      const actions = row.createDiv({ cls: "counselor-dashboard-concern-actions" });
      new ButtonComponent(actions).setButtonText("Open note")
        .onClick(() => void this.onOpenNote(concern));
      if (resolved) {
        new ButtonComponent(actions).setButtonText("Reopen")
          .onClick(() => void this.runAction(() => this.onReopen(concern)));
      } else {
        new ButtonComponent(actions).setButtonText("Resolve").setCta()
          .onClick(() => void this.runAction(() => this.onResolve(concern)));
      }
    }
  }

  private async runAction(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not update concern: ${message}`);
    }
  }
}

export class GoalManagerModal extends Modal {
  private selectedClientId: string;

  constructor(
    app: App,
    private clients: ClientRecord[],
    selectedClientId: string | undefined,
    private getGoals: (clientId: string) => GoalRecord[],
    private onComplete: (goal: GoalRecord) => Promise<void>,
    private onReopen: (goal: GoalRecord) => Promise<void>,
    private onOpenNote: (goal: GoalRecord) => Promise<void>
  ) {
    super(app);
    this.selectedClientId = selectedClientId ?? clients[0]?.id ?? "";
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("counselor-dashboard-modal", "counselor-dashboard-concern-modal");
    contentEl.createEl("h2", { text: "Manage goals" });
    contentEl.createEl("p", {
      cls: "counselor-dashboard-form-help",
      text: "Completing a goal preserves its note and session history while updating its structured status and completion date."
    });

    new Setting(contentEl).setName("Client").addDropdown(dropdown => {
      for (const client of this.clients) {
        dropdown.addOption(client.id, `${client.preferredName || client.name} (${client.id})`);
      }
      dropdown.setValue(this.selectedClientId).onChange(value => {
        this.selectedClientId = value;
        this.render();
      });
    });

    const goals = this.getGoals(this.selectedClientId);
    this.renderSection(contentEl, "Active goals", goals.filter(goal => goal.status !== "completed"), false);
    this.renderSection(contentEl, "Completed goals", goals.filter(goal => goal.status === "completed"), true);

    const footer = contentEl.createDiv({ cls: "counselor-dashboard-form-footer" });
    new ButtonComponent(footer).setButtonText("Close").onClick(() => this.close());
  }

  private renderSection(container: HTMLElement, title: string, goals: GoalRecord[], completed: boolean): void {
    const section = container.createDiv({ cls: "counselor-dashboard-concern-section" });
    const heading = section.createDiv({ cls: "counselor-dashboard-concern-section-heading" });
    heading.createEl("h3", { text: title });
    heading.createEl("span", { text: String(goals.length) });

    if (!goals.length) {
      section.createEl("p", {
        cls: "counselor-dashboard-empty-message",
        text: completed ? "No goals have been completed." : "No active goals for this client."
      });
      return;
    }

    for (const goal of goals) {
      const row = section.createDiv({ cls: "counselor-dashboard-concern-row" });
      const details = row.createDiv({ cls: "counselor-dashboard-concern-details" });
      details.createEl("strong", { text: goal.name });
      const dates = completed
        ? `Opened ${goal.opened || "unknown"} · Completed ${goal.completed || "unknown"}`
        : `Opened ${goal.opened || "unknown"}`;
      details.createEl("span", { text: dates });

      const actions = row.createDiv({ cls: "counselor-dashboard-concern-actions" });
      new ButtonComponent(actions).setButtonText("Open note").onClick(() => void this.onOpenNote(goal));
      if (completed) {
        new ButtonComponent(actions).setButtonText("Reopen")
          .onClick(() => void this.runAction(() => this.onReopen(goal)));
      } else {
        new ButtonComponent(actions).setButtonText("Complete").setCta()
          .onClick(() => void this.runAction(() => this.onComplete(goal)));
      }
    }
  }

  private async runAction(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not update goal: ${message}`);
    }
  }
}
