import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DemoStore } from '../store.mjs';
import { validateDraft, validateLegacy } from '../public/model.js';
const seed = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url)));
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'citron-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.json'); const store = new DemoStore(seed, path); await store.init(); return { store, path };
}
const op = (extras = {}) => ({ cardId: 'drive', col: 'doing', baseRevision: 0, operationId: 'operation-0001', ...extras });
test('save, restart and idempotent retry preserve one logical operation', async t => {
  const { store, path } = await fixture(t);
  const first = await store.move(op()); assert.equal(first.positions.drive.col, 'doing'); assert.equal(first.revision, 1);
  const restarted = new DemoStore(seed, path); await restarted.init();
  const retry = await restarted.move(op()); assert.equal(retry.revision, 1); assert.equal(retry.duplicate, true);
  assert.equal(restarted.view().positions.drive.revision, 1);
});
test('two sessions cannot silently overwrite the same card', async t => {
  const { store } = await fixture(t);
  const results = await Promise.allSettled([store.move(op()), store.move(op({ col: 'blocked', operationId: 'operation-0002' }))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const error = results.find(r => r.status === 'rejected').reason;
  assert.equal(error.code, 'CONFLICT'); assert.deepEqual(error.details.current, { col: 'doing', revision: 1 });
  assert.equal(store.view().revision, 1);
});
test('a fresh explicit proposal can resolve a conflict', async t => {
  const { store } = await fixture(t); await store.move(op());
  await store.move(op({ col: 'blocked', baseRevision: 1, operationId: 'operation-0002' }));
  assert.equal(store.view().positions.drive.col, 'blocked'); assert.equal(store.view().revision, 2);
});
test('unrelated cards do not conflict on the board revision', async t => {
  const { store } = await fixture(t); await store.move(op());
  await store.move(op({ cardId: 'listing', operationId: 'operation-0002' }));
  assert.equal(store.view().revision, 2);
});
test('operation identifier cannot be reused for different intent', async t => {
  const { store } = await fixture(t); await store.move(op());
  await assert.rejects(store.move(op({ col: 'blocked' })), { code: 'OPERATION_REUSED' });
});
test('invalid IDs, columns, revisions and extra fields never mutate the store', async t => {
  const { store } = await fixture(t);
  for (const value of [null, 'move', 123, []]) await assert.rejects(store.move(value), { code: 'INVALID_MOVE' });
  for (const patch of [{cardId:'missing'}, {col:'unknown'}, {baseRevision:-1}, {baseRevision:0.5}, {operationId:'x'}, {credential:'forbidden'}]) {
    await assert.rejects(store.move(op(patch)), { code: 'INVALID_MOVE' });
  }
  assert.equal(store.view().revision, 0);
});
test('disk failure is not reported as saved, then retry works', async t => {
  const { store } = await fixture(t); const persist = store.persist.bind(store); store.persist = async () => { throw Error('disk full'); };
  await assert.rejects(store.move(op()), {code:'SAVE_FAILED'}); assert.equal(store.view().revision, 0);
  store.persist = persist; assert.equal((await store.move(op())).revision, 1);
});
test('corrupt existing store is preserved and startup fails closed', async t => {
  const { path } = await fixture(t); await writeFile(path, '{broken');
  await assert.rejects(new DemoStore(seed, path).init(), { code: 'DEMO_STORE_INVALID' });
  assert.equal(await readFile(path, 'utf8'), '{broken');
});
test('v1 combined-column migration keeps every position, revision and operation', async t => {
  const {store,path}=await fixture(t);
  await store.move(op({col:'blocked'}));
  const old=JSON.parse(await readFile(path,'utf8'));old.schemaVersion=1;delete old.legacySplitReview;
  await writeFile(path,JSON.stringify(old));
  const migrated=new DemoStore(seed,path);await migrated.init();
  const saved=JSON.parse(await readFile(path,'utf8'));
  assert.equal(saved.schemaVersion,2);assert.deepEqual(saved.positions,old.positions);
  assert.equal(saved.revision,old.revision);assert.deepEqual(saved.operations,old.operations);
  assert.ok(migrated.view().legacySplitReview.includes('drive'));
  assert.equal((await migrated.move(op({col:'blocked'}))).duplicate,true);
  await migrated.move(op({col:'decide',baseRevision:1,operationId:'operation-0002'}));
  assert.equal(migrated.view().positions.drive.col,'decide');assert.ok(!migrated.view().legacySplitReview.includes('drive'));
});
test('browser drafts and voluntary legacy positions validate all entries before use', () => {
  assert.deepEqual(validateDraft({schemaVersion:1,pending:[op()]}, seed), [op()]);
  assert.throws(() => validateDraft({schemaVersion:1,pending:[op(),op()]}, seed));
  assert.throws(() => validateDraft({schemaVersion:1,pending:[op({baseRevision:'0'})]}, seed));
  assert.deepEqual(validateLegacy({plans:'blocked'},seed),[{cardId:'plans',col:'blocked'}]);
  assert.throws(() => validateLegacy({unknown:'todo'},seed)); assert.throws(() => validateLegacy({drive:'invalid'},seed));
});
