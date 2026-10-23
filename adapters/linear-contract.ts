/** Server-only contract. No implementation or credentials are configured. */
export interface IssueRecord {
  id: string;
  identifier: string;
  projectId: string;
  stateId: string;
  updatedAt: string;
  url: string;
}
export interface ScopedLinearAdapter {
  readonly mode: 'linear';
  /** Return only explicitly allowed project issues. Paginate fully and dedupe by immutable id. */
  readIssues(): Promise<{capturedAt: string; issues: IssueRecord[]}>;
  /**
   * Requires separately approved write scope and an explicit column-to-state map.
   * Re-read updatedAt immediately before any write. On a changed revision: 409.
   * Never retry an uncertain provider write without reconciling the actual issue.
   * An updatedAt re-read alone is not atomic: a production adapter must either use
   * an atomic provider precondition or serialize/reconcile writes and disclose the
   * remaining race. Do not claim the local demo proves provider-level concurrency.
   * This interface has no createIssue operation: preserve existing issue identity.
   */
  updateState(input: {id: string; stateId: string; expectedUpdatedAt: string; operationId: string}): Promise<IssueRecord>;
}
