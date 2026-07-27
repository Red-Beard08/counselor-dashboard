/* Settings tab controls storage location, terminology, defaults, and reminders. */

import { App, PluginSettingTab, Setting } from "obsidian";
import type CounselorDashboardPlugin from "./main";
import { cleanRootFolder } from "./utils";

export class CounselorDashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CounselorDashboardPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Counselor Dashboard").setHeading();

    new Setting(containerEl)
      .setName("Counseling root folder")
      .setDesc("All generated records stay beneath this folder. Changing it does not move existing files.")
      .addText(text => text
        .setPlaceholder("Counselor Dashboard")
        .setValue(this.plugin.settings.rootFolder)
        .onChange(async value => {
          this.plugin.settings.rootFolder = cleanRootFolder(value);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Client terminology")
      .setDesc("For example: Client, Counselee, Member, or Household.")
      .addText(text => text
        .setValue(this.plugin.settings.clientTerm)
        .onChange(async value => {
          this.plugin.settings.clientTerm = value.trim() || "Client";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Default interaction type")
      .addText(text => text
        .setValue(this.plugin.settings.defaultSessionType)
        .onChange(async value => {
          this.plugin.settings.defaultSessionType = value.trim() || "individual";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Show privacy reminder")
      .setDesc("Displays a reminder on the dashboard. It does not modify or encrypt records.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showPrivacyReminder)
        .onChange(async value => {
          this.plugin.settings.showPrivacyReminder = value;
          await this.plugin.saveSettings();
        }));
  }
}
