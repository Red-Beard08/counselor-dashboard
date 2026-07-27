# Counselor Dashboard

Counselor Dashboard is a Markdown-first Obsidian plugin for Christian counselors and pastoral-care workers. It centralizes clients, counseling interactions, concerns, goals, and recurring topics while preserving normal Obsidian navigation.

Version `1.0.0` is the first public beta. Test with fictional or non-sensitive sample data before deciding whether it fits an actual counseling workflow.

## Features

- Stable, collision-resistant client IDs and one portable folder per client
- Structured interaction form with date picker, attendees, topics, concerns, goals, narrative sections, and follow-up date
- Reusable shared topic notes
- Client-specific concern and goal records with resolve, complete, and reopen workflows
- Automatically managed client summaries, session history, topic counts, and optional context timeline
- Autosaved interaction draft for mobile interruptions
- Responsive desktop, iPhone, and iPad dashboard and forms
- Ordinary Markdown files that remain readable without the plugin

## Installation

### GitHub release

1. Open the repository's **Releases** page.
2. Download `manifest.json`, `main.js`, and `styles.css` from the same release.
3. Create `<vault>/.obsidian/plugins/counselor-dashboard/`.
4. Copy the three files into that folder.
5. Reload Obsidian and enable **Counselor Dashboard** under **Community plugins**.

### Development build

```bash
npm ci
npm run build
```

Copy `manifest.json`, `main.js`, and `styles.css` into the plugin folder shown above.

## How to use

### Open the dashboard

Use the notebook-tabs ribbon icon or run **Counselor Dashboard: Open dashboard**. The dashboard shows clients, interaction totals, open concerns, active goals, latest contact dates, and frequent topics.

### Create a client

Choose **New Client**, enter a name, initials, pseudonym, or stable identifier, and select the client type and status. The plugin generates a collision-resistant ID such as `CL-0001-A1B2C3` and creates the client's profile and working folders.

Display names may change, but stable IDs and required frontmatter should remain intact.

### Record an interaction

Choose **Record interaction** globally or **New interaction** from a client card:

1. Select the client, date, and interaction type.
2. Add attendees, shared topics, client-specific concerns, and client-specific goals.
3. Complete the relevant summary and narrative sections.
4. Optionally promote a concise, durable context entry to the client profile.
5. Add a follow-up date if needed.
6. Create the interaction.

The form autosaves one draft. A successful creation clears it. The generated session is linked back into the client profile automatically.

### Manage concerns and goals

Use **Manage concerns** to open, resolve, or reopen concern records. Resolution preserves the note and stamps its structured status and date.

Use **Manage goals** to open, complete, or reopen goal records. Profiles show how often each concern or goal was linked from interactions, along with its first and latest use.

### Work with topics and profiles

Topics are shared concepts. New topics create reusable notes under the root `Topics/` folder. Client profiles contain counselor-authored sections plus one managed block with:

- Latest interaction and total count
- Open-concern and active-goal counts
- Frequent topics
- Linked session history
- Concern and goal histories
- Explicitly promoted context entries

Keep permanent notes outside the `counselor-dashboard:profile` markers.

## Generated files

The default root folder is `Counselor Dashboard/` and can be changed in settings:

```text
Counselor Dashboard/
|-- Clients/
|   `-- CL-0001-A1B2C3/
|       |-- Client Profile.md
|       |-- Sessions/
|       |-- Concerns/
|       |-- Goals/
|       `-- Attachments/
|-- Topics/
|-- Interventions/
`-- Templates/
```

Changing the configured root does not move existing records. Dashboards depend on the structured `type` and ID properties, even though the files remain ordinary Markdown.

## Mobile support

Counselor Dashboard uses Obsidian's cross-platform Vault and FileManager APIs and has no Node.js or Electron runtime dependency. Allow plugin and vault synchronization to settle before editing the same client from another device. Simultaneous offline edits remain subject to the sync provider's conflict behavior.

## Limitations

- No encryption, passwords, accounts, roles, or access controls
- No compliance, consent, retention, deletion, or professional-policy automation
- No calendar synchronization, reminders, billing, redacted exports, or formal reports
- No automatic migration of existing counseling notes
- No automatic movement of records after changing the root folder
- No client archive, merge, or delete interface
- No topic synonym or duplicate-topic management
- No full-text analytics of narrative sections

## Privacy and professional responsibility

Counselor Dashboard stores ordinary files. It does not encrypt records, secure the device, control vault sharing, guarantee safe synchronization, or make a workflow compliant with any law, regulation, professional code, church policy, or organizational requirement.

Before storing identifying or sensitive information, evaluate device encryption, access, vault location, synchronization, backups, retention, deletion, exports, consent, and applicable professional obligations. Consider stable identifiers or pseudonyms and minimize personally identifying information.

## Development and release

```bash
npm ci
npm test
```

`npm test` type-checks, builds, tests utility behavior, validates release assets, checks mobile constraints, and scans for private or machine-specific references.

The **Release** GitHub workflow validates the requested version, creates its numeric tag, and publishes `main.js`, `manifest.json`, and `styles.css`.

## License

MIT
