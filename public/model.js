export const DRAFT_KEY = 'citron-kanban-review-demo-v1';
export function ticketReferences(card, issues) {
  const seen = new Set();
  return (card.issueRefs || []).flatMap(ref => {
    const issue = issues.find(i => i.id === ref || i.identifier === ref || i.uuid === ref);
    const key = issue?.uuid || issue?.id || ref;
    if (seen.has(key)) return [];
    seen.add(key);
    let url = null;
    try {
      const parsed = new URL(issue?.url);
      if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed.href;
    } catch {}
    return [{ ref: issue?.identifier || ref, url, title: issue?.title || ref }];
  });
}
export function validateDraft(value, board) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.pending) || value.pending.length > 11) throw Error('Brouillon invalide');
  const seen = new Set();
  for (const p of value.pending) {
    if (!board.cards.some(c => c.id === p.cardId) || !board.cols.some(([v]) => v === p.col) || seen.has(p.cardId) ||
        !Number.isSafeInteger(p.baseRevision) || p.baseRevision < 0 || !/^[a-zA-Z0-9-]{8,80}$/.test(p.operationId) ||
        Object.keys(p).some(k => !['cardId','col','baseRevision','operationId'].includes(k))) throw Error('Brouillon invalide');
    seen.add(p.cardId);
  }
  return value.pending;
}
export function validateLegacy(value, board) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 11) throw Error('Positions invalides');
  return Object.entries(value).map(([cardId, col]) => {
    if (!board.cards.some(c => c.id === cardId) || !board.cols.some(([v]) => v === col)) throw Error('Carte ou colonne inconnue');
    return {cardId, col};
  });
}
