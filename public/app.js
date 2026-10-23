import { DRAFT_KEY, validateDraft, validateLegacy, ticketReferences } from './model.js';

export async function mount() {
const $ = id => document.getElementById(id);
const date = value => value ? new Date(value).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) + ' Paris' : 'jamais';
const label = col => board.cols.find(([v]) => v === col)?.[1] || col;
let board, mode = 'snapshot', pending = [], busy = false, loading = false, offline = false, drag = null;
let lastRead = null, lastSave = null, storageError = '', notice = '', restored = false, corruptDraft = false;
let clientId = crypto.randomUUID();
try { clientId = sessionStorage.getItem('citron-review-client') || clientId; sessionStorage.setItem('citron-review-client', clientId); }
catch { storageError = 'Session locale indisponible : reprise automatique après fermeture non garantie.'; }
const draftKey = DRAFT_KEY + ':' + clientId;
const conflicts = new Map();

const messages = {
  LINEAR_CONNECTION_REQUIRED: 'Accès continu non configuré. Cet instantané ne se met pas à jour tout seul. Une autorisation spécifique est nécessaire pour une connexion serveur.',
  LINEAR_WRITE_DISABLED: 'Les écritures Linear sont désactivées dans cette version.',
  SIMULATED_FAILURE: 'Erreur de sauvegarde simulée. Le brouillon reste en attente ; réessayez.',
  SAVE_FAILED: 'Le serveur de test n’a pas pu enregistrer. Le brouillon reste en attente.',
  DEMO_STORE_INVALID: 'Le fichier de test est illisible. Il est conservé pour diagnostic, sans remise à zéro automatique.'
};
function error(text = '') { notice = text; $('error').textContent = text; $('error').hidden = !text; }
function announce(text) { $('live').textContent = text; }
function node(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
async function request(path, body) {
  if (offline) throw Error('Hors connexion simulé. Le brouillon attend la reconnexion.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(path, { signal: controller.signal, cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    let data;
    try { data = await res.json(); } catch { throw Error('Réponse serveur illisible. Aucune sauvegarde confirmée.'); }
    if (!res.ok) { const e = Error(messages[data.error] || 'Serveur indisponible. Aucune sauvegarde confirmée.'); e.code = data.error; e.data = data; throw e; }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw Error('Délai dépassé : résultat de sauvegarde incertain. Réessayez avec la même opération ; aucun doublon ne sera ajouté.');
    if (e instanceof TypeError) throw Error('Connexion au serveur interrompue. Brouillon en attente ; résultat éventuel à vérifier par une nouvelle tentative.');
    throw e;
  } finally { clearTimeout(timeout); }
}
function persist() {
  if (corruptDraft) return;
  try { localStorage.setItem(draftKey, JSON.stringify({ schemaVersion: 1, pending })); }
  catch { storageError = 'Brouillon en mémoire seulement : stockage local indisponible. Exportez-le avant de fermer.'; }
}
function restore() {
  if (restored || !board) return;
  restored = true;
  try {
    const raw = localStorage.getItem(draftKey);
    if (raw) pending = validateDraft(JSON.parse(raw), board);
  } catch {
    corruptDraft = true;
    storageError = 'Brouillon local illisible, conservé sans écrasement ; reprise suspendue. L’export conserve les positions du serveur, pas le brouillon illisible.';
  }
}
function mergeView(data) {
  if (data.revision >= board.revision) Object.assign(board, { positions: data.positions, revision: data.revision, updatedAt: data.updatedAt, legacySplitReview: data.legacySplitReview || [] });
}
async function refresh(silent = false) {
  if (loading || busy) return;
  loading = true;
  const targetMode = mode;
  try {
    const data = await request('/api/board?mode=' + targetMode);
    if (mode !== targetMode) return;
    if (!board || board.mode !== mode) board = data;
    else mergeView(data);
    restore();
    lastRead = new Date().toISOString();
    if (!silent) error();
    render();
  } catch (e) { if (mode === targetMode) { error(e.message); status(); } }
  finally { loading = false; status(); }
}
function status() {
  if (!board) { $('sync-title').textContent = 'Tableau indisponible'; $('sync-detail').textContent = 'Impossible de charger le serveur local. Aucune connexion Linear persistante.'; return; }
  const real = board.linear.mode === 'snapshot';
  $('mode-pill').textContent = mode === 'demo' ? 'SIMULATION · aucun ticket modifié' : real ? 'INSTANTANÉ RÉEL · lecture seule' : 'DONNÉES FICTIVES · lecture seule';
  $('sync-title').textContent = mode === 'snapshot' ? real ? 'Linear : instantané réel, synchronisation continue inactive' : 'Exemple fictif · aucune connexion Linear' :
    offline ? 'Simulation hors connexion · brouillon en attente' : busy ? 'Enregistrement sur le serveur de test…' :
    conflicts.size ? 'Conflit à résoudre · aucun écrasement automatique' : pending.length ? `${pending.length} déplacement(s) de test en attente` : 'Simulation à jour avec le serveur de test';
  $('sync-detail').textContent = mode === 'snapshot' ?
    real ? `Tickets lus le ${date(board.linear.capturedAt)}. Relire l’instantané ne relit pas Linear. Colonnes : point de coordination initial, sans reprise automatique des déplacements de l’original.` : 'Jeu fictif fourni avec le code. Aucune lecture de tickets réels. Les colonnes décrivent la coordination.' :
    `Dernière lecture du serveur local : ${date(lastRead)} · sauvegarde serveur de test : ${date(lastSave || board.updatedAt)} · révision ${board.revision}. Les statuts Linear affichés restent ceux de l’instantané.`;
  $('storage-status').textContent = storageError || (pending.length ? 'Brouillon de test conservé dans ce navigateur ; non enregistré dans Linear.' : 'Prototype original et son stockage local préservés.');
  $('retry').hidden = mode !== 'demo' || !pending.length;
  $('retry').disabled = busy || offline || corruptDraft;
  for (const id of ['import', 'failure', 'offline']) $(id).disabled = mode !== 'demo' || busy || corruptDraft;
  $('mode').disabled = busy || loading;
  $('offline').textContent = offline ? 'Rétablir la connexion simulée' : 'Simuler hors connexion';
}
function render() {
  status();
  if (!board) return;
  const root = $('board'); root.replaceChildren();
  if ($('mapping')) $('mapping').textContent = 'Mapping de lecture : Backlog / Todo → À faire ; In Progress → En cours ; In Review → À vérifier ; Done → Terminé. À trancher et Bloqué : coordination distincte, aucun nouvel état Linear. Les autres états restent sans projection.';
  const presentation = board.presentation;
  if (presentation) {
    $('brand').textContent = presentation.brand;
    $('title').textContent = presentation.title;
    $('description').textContent = presentation.description;
    document.title = presentation.brand;
    presentation.summary.forEach((text, index) => $('summary-' + index).textContent = text);
    $('decisions').replaceChildren(...presentation.decisions.map(text => node('li', '', text)));
  }
  if ($('project-scope')) $('project-scope').textContent = 'Projet affiché : ' + (board.project?.name || 'Démonstration') + ' · Orchestration d’agents : non configurée';
  const query = $('search').value.toLocaleLowerCase('fr');
  for (const [col, title] of board.cols) {
    const section = node('section', 'column'); section.dataset.col = col; section.setAttribute('aria-label', title);
    const head = node('div', 'colhead'); head.append(node('span', 'dot'), document.createTextNode(title));
    const cards = board.cards.filter(c => {
      const p = mode === 'demo' && pending.find(p => p.cardId === c.id);
      return (p ? p.col : board.positions[c.id].col) === col && JSON.stringify(c).toLocaleLowerCase('fr').includes(query);
    });
    head.append(node('span', 'count', String(cards.length))); section.append(head);
    const list = node('div', 'cards');
    if (!cards.length) list.append(node('p', 'empty', col === 'doing' ? 'Aucune exécution confirmée en cours dans ce point.' : 'Aucune carte à afficher.'));
    for (const c of cards) {
      const p = mode === 'demo' && pending.find(p => p.cardId === c.id);
      const conflict = mode === 'demo' && conflicts.get(c.id);
      const card = node('article', 'card' + (p ? ' changed' : ''));
      card.dataset.card = c.id; card.setAttribute('aria-label', c.title);
      card.draggable = mode === 'demo' && !p && !busy && !corruptDraft;
      card.addEventListener('dragstart', e => { drag = c.id; e.dataTransfer.setData('text/plain', c.id); });
      card.addEventListener('dragend', () => { drag = null; });
      const cardHead = node('div', 'card-head');
      const references = node('div', 'ticket-refs');
      references.setAttribute('role', 'group'); references.setAttribute('aria-label', 'Tickets associés');
      const tickets = ticketReferences(c, board.linear.issues);
      for (const ticket of tickets) {
        const badge = node(ticket.url ? 'a' : 'span', 'ticket-ref', ticket.ref);
        if (ticket.url) {
          badge.href = ticket.url; badge.target = '_blank'; badge.rel = 'noopener noreferrer'; badge.title = ticket.title;
        } else badge.title = 'Lien du ticket indisponible dans les données chargées';
        badge.draggable = false;
        references.append(badge);
      }
      if (!tickets.length) references.append(node('span', 'ticket-ref no-ticket', 'Sans ticket'));
      cardHead.append(references, node('span', 'tag ' + c.type, c.tag));
      card.append(cardHead, node('h2', '', c.title), node('p', '', c.body), node('p', 'next', c.next));
      if (c.owner) card.append(node('p', 'owner', (c.ownerLabel || 'Responsable de coordination') + ' : ' + c.owner + ' · sans échéance'));
      if (c.updatedAt) card.append(node('p', 'updated-at', 'Actualisé le ' + date(c.updatedAt)));
      if (col === 'blocked' && (board.legacySplitReview?.includes(c.id) || (c.legacyCombined && board.positions[c.id].revision === 0))) card.append(node('p', 'migration', 'Ancienne colonne « À trancher / bloqué » : position conservée dans Bloqué, à préciser.'));
      const links = c.links || (c.link ? [[c.ref, c.link]] : []);
      for (const [text, url] of links) {
        const wrap = node('p'); const a = node('a', '', text + ' ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; wrap.append(a); card.append(wrap);
      }
      for (const ref of c.issueRefs) {
        const issue = board.linear.issues.find(i => i.id === ref);
        const source = board.linear.mode === 'snapshot' ? `dans Linear · lu le ${date(board.linear.capturedAt)}` : 'dans le jeu fictif';
        const mapped = issue && (board.linearMapping?.byName[issue.status] || board.linearMapping?.byType[issue.statusType]);
        card.append(node('p', 'linear-state', issue ? `${ref} · ${issue.status} ${source} · repère : ${mapped ? label(mapped) : 'sans projection'}` : `${ref} · état Linear inconnu`));
      }
      if (!c.issueRefs.length) card.append(node('p', 'context-state', 'Contexte de coordination · sans ticket Linear associé'));
      const field = node('label', 'move'); field.append(document.createTextNode(mode === 'demo' ? 'Tester un déplacement' : 'Coordination'));
      const select = node('select'); select.setAttribute('aria-label', 'Déplacer « ' + c.title + ' »');
      for (const [value, name] of board.cols) { const o = node('option', '', name); o.value = value; o.selected = col === value; select.append(o); }
      select.disabled = mode !== 'demo' || !!p || busy || corruptDraft;
      select.onchange = () => move(c.id, select.value); field.append(select); card.append(field);
      if (p) card.append(node('p', 'pending', conflict ? `Conflit : serveur = ${label(conflict.col)}, proposition = ${label(p.col)}.` : 'Brouillon de test en attente · Linear inchangé'));
      if (conflict) {
        const actions = node('div', 'conflict-actions');
        const remote = node('button', '', 'Garder la version du serveur'); remote.onclick = () => resolve(c.id, false);
        const mine = node('button', '', 'Reproposer mon déplacement'); mine.onclick = () => resolve(c.id, true);
        actions.append(remote, mine); card.append(actions);
      }
      list.append(card);
    }
    section.append(list);
    section.ondragover = e => { if (drag && mode === 'demo') e.preventDefault(); };
    section.ondrop = e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); drag = null; if (mode === 'demo' && board.cards.some(c => c.id === id)) move(id, col); };
    root.append(section);
  }
}
function enqueue(cardId, col) {
  if (mode !== 'demo' || busy || corruptDraft || pending.some(p => p.cardId === cardId)) return false;
  if (board.positions[cardId].col === col) return false;
  pending.push({ cardId, col, baseRevision: board.positions[cardId].revision, operationId: crypto.randomUUID() });
  return true;
}
function move(cardId, col) {
  if (!enqueue(cardId, col)) return;
  persist(); error(); render(); announce('Déplacement préparé en simulation.'); flush();
}
async function flush() {
  if (mode !== 'demo' || busy || offline || corruptDraft) return;
  busy = true; render();
  try {
    for (const item of [...pending]) {
      if (conflicts.has(item.cardId)) continue;
      try {
        const result = await request('/api/move?mode=demo', item);
        mergeView(result); pending = pending.filter(p => p.operationId !== item.operationId);
        lastSave = result.updatedAt; persist(); error();
        announce('Déplacement enregistré sur le serveur de test. Linear inchangé.');
      } catch (e) {
        if (e.code === 'CONFLICT' && e.data.current) {
          conflicts.set(item.cardId, e.data.current);
          board.positions[item.cardId] = e.data.current;
          error('La carte a changé sur une autre session de test. Choisissez la version à conserver.');
        } else { error(e.message); break; }
      }
    }
  } finally { busy = false; render(); }
}
function resolve(cardId, keepMine) {
  const item = pending.find(p => p.cardId === cardId);
  const current = conflicts.get(cardId);
  if (!item || !current) return;
  pending = pending.filter(p => p.cardId !== cardId); conflicts.delete(cardId);
  if (keepMine && item.col !== current.col) pending.push({ ...item, baseRevision: current.revision, operationId: crypto.randomUUID() });
  persist(); error(); render(); if (keepMine) flush(); else refresh();
}
$('search').oninput = render;
$('refresh').onclick = () => refresh();
$('retry').onclick = () => { error(); flush(); };
$('live-refresh').onclick = async () => { try { await request('/api/linear/refresh', {}); } catch (e) { error(e.message); } };
$('mode').onchange = async () => {
  mode = $('mode').value; offline = false; error();
  board = undefined; lastRead = null; lastSave = null; $('board').replaceChildren();
  await refresh();
  if (mode === 'demo' && pending.length) error('Brouillon de test repris. Cliquez sur Réessayer pour vérifier la version du serveur avant enregistrement.');
};
$('failure').onclick = async () => { try { await request('/api/demo/failure?mode=demo', {}); error('Prochaine sauvegarde de test en erreur simulée. Déplacez une carte pour vérifier la reprise.'); } catch (e) { error(e.message); } };
$('offline').onclick = () => { offline = !offline; error(); render(); if (!offline) flush(); };
$('import').onclick = () => {
  try {
    const positions = validateLegacy(JSON.parse($('legacy').value), board);
    if (pending.length) throw Error('Résolvez les déplacements en attente avant une reprise.');
    for (const p of positions) enqueue(p.cardId, p.col);
    persist(); render(); error('Reprise préparée en simulation. Cliquez sur Réessayer pour l’enregistrer sur le serveur de test.');
  } catch { error('Reprise impossible : fournissez uniquement des identifiants de cartes et des colonnes valides, sans déplacement en attente.'); }
};
$('export').onclick = () => {
  if (!board) return;
  const data = { schemaVersion: 1, mode, exportedAt: new Date().toISOString(), linearCapturedAt: board.linear.capturedAt,
    positions: Object.fromEntries(Object.entries(board.positions).map(([id, p]) => [id, p.col])), pending,
    note: 'Coordination et brouillon uniquement. Aucun ticket Linear modifié.' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
  const a = node('a'); a.href = url; a.download = 'kanban-positions-review.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const online = () => { if (mode === 'demo' && pending.length) error('Connexion réseau revenue. Réessayez la sauvegarde pour vérifier les versions.'); };
window.addEventListener('online', online);
const poll = setInterval(() => { if (board && mode === 'demo' && !offline && !busy && !pending.length) refresh(true); }, 5000);
await refresh();
return () => { clearInterval(poll); window.removeEventListener('online',online); };
}
