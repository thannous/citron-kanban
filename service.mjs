import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { DemoStore, DomainError } from './store.mjs';

export function allowLocalRequest(host, origin, site) {
  return /^(127\.0\.0\.1|localhost):\d+$/.test(host || '') && (!origin || origin === `http://${host}`) && site !== 'cross-site';
}
export async function localDataDir(root) {
  if (process.env.DATA_MODE !== 'fixture') {
    try { await access(join(root, '.private/seed.json')); return join(root, '.private'); } catch {}
  }
  return join(root, 'data');
}
export class ConnectionRequiredAdapter {
  async refresh() { throw new DomainError('LINEAR_CONNECTION_REQUIRED', 503); }
  async move() { throw new DomainError('LINEAR_WRITE_DISABLED', 403); }
}
export async function createService({ root = process.cwd(), dataDir = join(root, 'data'), storePath = join(root, '.runtime/demo-state.json') } = {}) {
  const seed = JSON.parse(await readFile(join(dataDir, 'seed.json'), 'utf8'));
  const snapshot = JSON.parse(await readFile(join(dataDir, 'linear-snapshot.json'), 'utf8'));
  const store = new DemoStore(seed, storePath); await store.init();
  const linear = new ConnectionRequiredAdapter();
  let failNextSave = false;
  return {
    async dispatch({method, path, mode = 'snapshot', body = {}}) {
      if (!['snapshot','demo'].includes(mode)) throw new DomainError('INVALID_MODE',400);
      if (method === 'GET' && path === '/api/board') {
        const positions = mode === 'demo' ? store.view() : {revision:0,updatedAt:null,positions:Object.fromEntries(seed.cards.map(c=>[c.id,{col:c.col,revision:0}]))};
        return {...seed,...positions,mode,linear:snapshot,
          linearMapping:{byName:{Backlog:'todo',Todo:'todo','In Progress':'doing','In Review':'verify',Done:'done'},byType:{backlog:'todo',unstarted:'todo',started:'doing',completed:'done'},coordinationOnly:['decide','blocked']},
          orchestration:{configured:false,runningAgents:[],executionEnabled:false},
          capabilities:{persistentLinear:false,writeLinear:false,writeDemo:mode==='demo',multiProjectConnection:false,agentExecution:false}};
      }
      if (method === 'POST' && path === '/api/linear/refresh') return linear.refresh();
      if (method === 'POST' && path === '/api/move') {
        if (mode !== 'demo') return linear.move();
        if (failNextSave) {failNextSave=false;throw new DomainError('SIMULATED_FAILURE',503);}
        return store.move(body);
      }
      if (method === 'POST' && path === '/api/demo/failure' && mode === 'demo') {failNextSave=true;return {simulated:true};}
      throw new DomainError('NOT_FOUND',404);
    }
  };
}
