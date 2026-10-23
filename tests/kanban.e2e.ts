import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { beforeAll } from 'e2e';

beforeAll(async () => { await rm('.runtime/e2e-demo.json', {force:true}); });

test('read-only snapshot, truthful fixture label and search', async ({app, screen, browser}) => {
  await app.open();
  await expect(screen.getByRole('article')).toHaveCount(11);
  const card = screen.getByRole('article', 'Préparer le dossier de démonstration');
  const references = card.getByRole('group', 'Tickets associés');
  await expect(references.getByRole('link', 'DEMO-101')).toHaveAttribute('href', 'https://example.org/issues/DEMO-101');
  await expect(screen.getByText('Sans ticket', {exact:true})).toHaveCount(10);
  await expect(screen.getByText('DONNÉES FICTIVES · lecture seule')).toBeVisible();
  await expect(screen.getByRole('combobox', 'Déplacer « Préparer le dossier de démonstration »')).toBeDisabled();
  await screen.getByRole('searchbox', 'Filtrer les cartes').fill('DEMO-101');
  await expect(screen.getByRole('article')).toHaveCount(1);
  await screen.getByRole('searchbox', 'Filtrer les cartes').clear();
  await screen.getByRole('button', 'Vérifier l’accès continu').tap();
  await expect(screen.getByRole('alert', 'Erreur de synchronisation')).toContainText('Accès continu non configuré');
  await screen.getByRole('button', 'Relire l’instantané').tap();
  await expect(screen.getByRole('alert', 'Erreur de synchronisation')).toBeHidden();
  await app.screenshot('desktop-fixture');
});

test('ticket headers use runtime identifiers, dedupe linked issues and never invent missing links', async ({app,screen,browser}) => {
  const board = await (await fetch(new URL('/api/board',app.baseUrl))).json();
  const before = structuredClone(board.positions);
  board.linear.issues.push({id:'demo-id-202',identifier:'DEMO-202',uuid:'demo-uuid-202',title:'Autre ticket fictif',url:'https://example.org/issues/DEMO-202'});
  board.cards.find(c=>c.id==='drive').issueRefs=['DEMO-101','demo-id-202','DEMO-202'];
  board.cards.find(c=>c.id==='listing').issueRefs=['DEMO-303'];
  await browser.route('**/api/board*', async route => { await route.fulfill({json:board}); });
  await app.open();
  const card = screen.getByRole('article', 'Préparer le dossier de démonstration');
  const references = card.getByRole('group', 'Tickets associés');
  await expect(references.getByRole('link')).toHaveCount(2);
  await expect(references.getByRole('link', 'DEMO-202')).toHaveAttribute('href','https://example.org/issues/DEMO-202');
  const missing = screen.getByRole('article', 'Lister les éléments à traiter').getByRole('group','Tickets associés');
  await expect(missing.getByText('DEMO-303',{exact:true})).toBeVisible();
  await expect(missing.getByRole('link')).toHaveCount(0);
  const order = await browser.evaluate(() => {
    const card=document.querySelector('[data-card="drive"]');
    return {firstClass:card?.firstElementChild?.className,headerTop:card?.querySelector('.card-head')?.getBoundingClientRect().top,titleTop:card?.querySelector('h2')?.getBoundingClientRect().top};
  });
  assert.equal(order.firstClass,'card-head');assert.ok(order.headerTop! < order.titleTop!);
  assert.deepEqual((await (await fetch(new URL('/api/board',app.baseUrl))).json()).positions,before);
});

test('demo save, offline queue, reload recovery, conflict choices and retry after failure', async ({app,screen,browser}) => {
  await app.open();
  await screen.getByRole('combobox', 'Source').selectOption({value:'demo'});
  const move = screen.getByRole('combobox', 'Déplacer « Préparer le dossier de démonstration »');
  await expect(move).toBeEnabled();
  const base = (await (await fetch(new URL('/api/board?mode=demo',app.baseUrl))).json()).positions.drive;
  const firstCol = base.col === 'doing' ? 'todo' : 'doing';
  await move.selectOption({value:firstCol});
  await expect(screen.getByText('Simulation à jour avec le serveur de test')).toBeVisible();
  await expect(move).toHaveValue(firstCol);
  await screen.getByText('Reprise des positions et outils de revue',{exact:true}).tap();
  await screen.getByRole('button', 'Simuler hors connexion').tap();
  await move.selectOption({value:'blocked'});
  await expect(screen.getByText('Simulation hors connexion · brouillon en attente')).toBeVisible();
  // A second client writes the shared server while this UI holds its own draft.
  const remote = await (await fetch(new URL('/api/board?mode=demo',app.baseUrl))).json();
  const changed = await fetch(new URL('/api/move?mode=demo',app.baseUrl), {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({cardId:'drive',col:'verify',baseRevision:remote.positions.drive.revision,operationId:crypto.randomUUID()})});
  assert.equal(changed.status,200);
  await browser.reload();
  await screen.getByRole('combobox', 'Source').selectOption({value:'demo'});
  await expect(screen.getByRole('button', 'Réessayer la sauvegarde de test')).toBeVisible();
  await screen.getByRole('button', 'Réessayer la sauvegarde de test').tap();
  await expect(screen.getByText('Conflit à résoudre · aucun écrasement automatique')).toBeVisible();
  await app.screenshot('conflict');
  await screen.getByRole('button', 'Reproposer mon déplacement').tap();
  await expect(screen.getByText('Simulation à jour avec le serveur de test')).toBeVisible();
  await expect(move).toHaveValue('blocked');
  await screen.getByText('Reprise des positions et outils de revue',{exact:true}).tap();
  await screen.getByRole('button', 'Simuler une erreur de sauvegarde').tap();
  await move.selectOption({value:'doing'});
  await expect(screen.getByRole('alert', 'Erreur de synchronisation')).toContainText('Erreur de sauvegarde simulée');
  await screen.getByRole('button', 'Réessayer la sauvegarde de test').tap();
  await expect(screen.getByText('Simulation à jour avec le serveur de test')).toBeVisible();
  await expect(move).toHaveValue('doing');
  await screen.getByRole('combobox', 'Source').selectOption({value:'snapshot'});
  await expect(move).toHaveValue('todo');
  await expect(move).toBeDisabled();
});

test('mobile preserves six columns, scroll and accessible move control', async ({app,screen,browser}) => {
  await browser.setViewport({width:390,height:844});
  await app.open();
  await expect(screen.getByRole('article')).toHaveCount(11);
  const dimensions = await browser.evaluate(() => ({viewport:innerWidth, page:document.documentElement.scrollWidth,
    columns:document.querySelectorAll('.column').length, board:document.querySelector('.board')!.scrollWidth}));
  assert.equal(dimensions.columns,6); assert.equal(dimensions.page,dimensions.viewport); assert.ok(dimensions.board > dimensions.viewport);
  await screen.getByRole('combobox', 'Source').selectOption({value:'demo'});
  const move = screen.getByRole('combobox', 'Déplacer « Lister les éléments à traiter »');
  await expect(move).toBeEnabled();
  await move.selectOption({value:'doing'});
  await expect(screen.getByText('Simulation à jour avec le serveur de test')).toBeVisible();
  await expect(move).toHaveValue('doing');
  await app.screenshot('mobile-fixture');
});
