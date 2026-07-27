/* Shared settings and record shapes used by the plugin UI and vault repository. */

export interface CounselorDashboardSettings {
  rootFolder: string;
  clientTerm: string;
  defaultSessionType: string;
  showPrivacyReminder: boolean;
  interactionDraft: InteractionInput | null;
}

export const DEFAULT_SETTINGS: CounselorDashboardSettings = {
  rootFolder: "Counselor Dashboard",
  clientTerm: "Client",
  defaultSessionType: "individual",
  showPrivacyReminder: true,
  interactionDraft: null
};

export interface ClientRecord {
  id: string;
  name: string;
  preferredName: string;
  clientType: string;
  status: string;
  folderPath: string;
  profilePath: string;
}

export interface NewClientInput {
  name: string;
  preferredName: string;
  clientType: string;
  status: string;
}

export interface InteractionInput {
  clientId: string;
  date: string;
  interactionType: string;
  attendees: string[];
  topics: string[];
  concerns: string[];
  goals: string[];
  summary: string;
  addToClientContext: boolean;
  contextEntry: string;
  observations: string;
  biblicalConsiderations: string;
  interventions: string;
  commitments: string;
  followUpDate: string;
}

export interface ClientSummary extends ClientRecord {
  interactionCount: number;
  lastInteraction: string;
  topicCounts: Array<{ name: string; count: number }>;
  openConcernCount: number;
  activeGoalCount: number;
}

export interface ConcernRecord {
  path: string;
  clientId: string;
  name: string;
  status: string;
  opened: string;
  resolved: string;
}

export interface GoalRecord {
  path: string;
  clientId: string;
  name: string;
  status: string;
  opened: string;
  completed: string;
}
