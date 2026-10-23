/** Extension points only: no project connection or agent execution is configured. */
export type ColumnId = 'todo' | 'doing' | 'decide' | 'blocked' | 'verify' | 'done';
export interface ProjectScope {
  id: string;
  name: string;
  allowedIssueIds: readonly string[];
  documentLinks: readonly {label: string; url: string}[];
}
export interface ProjectBoard {
  projectId: string;
  revision: string;
  cards: readonly {id: string; issueIds: readonly string[]; coordinationColumn: ColumnId}[];
}
export interface MultiProjectBoardAdapter {
  /** Each read must enforce the private user's allowed projects on the server. */
  listAllowedProjects(): Promise<readonly ProjectScope[]>;
  /** Persist/cache/queue keys must include projectId, not only cardId. */
  readProject(projectId: string): Promise<ProjectBoard>;
}
export interface AgentOrchestrationState {
  configured: false;
  runningAgents: readonly [];
  /** Plans and ticket proposals do not grant execution permission. */
  executionEnabled: false;
}
/** Optional read-only runner boundary. Default: disabled. No engine is integrated. */
export interface AgentRunner {
  readonly enabled: false;
  status(projectId: string): Promise<AgentOrchestrationState>;
}
// Intentionally no run/start/permission methods. Evaluate an orchestrator separately.
