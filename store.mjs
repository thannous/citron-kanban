import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export class DomainError extends Error {
  constructor(code, status, details = {}) { super(code); Object.assign(this, { code, status, details }); }
}

// One process owns this test store. A future Linear adapter must recheck updatedAt,
// use explicit state IDs and resolve uncertain writes before retrying.
export class DemoStore {
  constructor(seed, path) { this.seed = seed; this.path = path; this.lock = Promise.resolve(); }
  async init() {
    try {
      this.data = JSON.parse(await readFile(this.path, 'utf8'));
      if (![1,2].includes(this.data.schemaVersion) || !Number.isSafeInteger(this.data.revision) ||
          !Array.isArray(this.data.operations) || this.data.operations.length > 500 ||
          Object.keys(this.data.positions).length !== this.seed.cards.length ||
          !this.seed.cards.every(c => this.validPosition(this.data.positions[c.id]))) throw Error('Invalid store');
      if (this.data.schemaVersion === 1) {
        const migrated = structuredClone(this.data);
        migrated.schemaVersion = 2;
        migrated.legacySplitReview = Object.keys(migrated.positions).filter(id => migrated.positions[id].col === 'blocked');
        await this.persist(migrated);
        this.data = migrated;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw new DomainError('DEMO_STORE_INVALID', 503);
      this.data = { schemaVersion: 2, revision: 0, updatedAt: null, legacySplitReview: [], positions: Object.fromEntries(this.seed.cards.map(c => [c.id, { col: c.col, revision: 0 }])), operations: [] };
      await this.persist(this.data);
    }
  }
  validPosition(p) { return p && this.seed.cols.some(([c]) => c === p.col) && Number.isSafeInteger(p.revision) && p.revision >= 0; }
  async persist(data) {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    await rename(tmp, this.path);
  }
  view() { return structuredClone({ revision: this.data.revision, updatedAt: this.data.updatedAt, positions: this.data.positions, legacySplitReview: this.data.legacySplitReview || [] }); }
  move(input) {
    const result = this.lock.then(() => this.commit(input));
    this.lock = result.catch(() => {});
    return result;
  }
  async commit(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_MOVE', 400);
    const { cardId, col, baseRevision, operationId } = input;
    if (!this.seed.cards.some(c => c.id === cardId) || !this.seed.cols.some(([v]) => v === col) ||
        !Number.isSafeInteger(baseRevision) || baseRevision < 0 ||
        typeof operationId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(operationId) ||
        Object.keys(input).some(k => !['cardId','col','baseRevision','operationId'].includes(k))) throw new DomainError('INVALID_MOVE', 400);
    const prior = this.data.operations.find(o => o.operationId === operationId);
    if (prior) {
      if (prior.cardId !== cardId || prior.col !== col || prior.baseRevision !== baseRevision) throw new DomainError('OPERATION_REUSED', 409);
      return { ...this.view(), duplicate: true };
    }
    const current = this.data.positions[cardId];
    if (baseRevision !== current.revision) throw new DomainError('CONFLICT', 409, { cardId, current });
    const next = structuredClone(this.data);
    next.revision += 1;
    next.updatedAt = new Date().toISOString();
    next.positions[cardId] = { col, revision: current.revision + 1 };
    next.legacySplitReview = (next.legacySplitReview || []).filter(id => id !== cardId);
    next.operations.push({ cardId, col, baseRevision, operationId });
    next.operations = next.operations.slice(-500);
    try { await this.persist(next); } catch { throw new DomainError('SAVE_FAILED', 503); }
    this.data = next;
    return this.view();
  }
}
