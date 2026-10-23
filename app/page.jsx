'use client';
import { useEffect } from 'react';

export default function BoardPage() {
  useEffect(() => {
    let cancelled = false, cleanup;
    import('../public/app.js').then(async ({mount}) => {
      if (cancelled) return;
      const dispose = await mount();
      if (cancelled) dispose(); else cleanup = dispose;
    });
    return () => {cancelled=true;cleanup?.();};
  }, []);
  return <>
    <header><div className="brand"><span className="mark" aria-hidden="true"/><span id="brand">Compagnon / Tableau citron</span></div><div className="headerline"><div><h1 id="title">Cap sur le prochain pas.</h1><p id="description">Un tableau de coordination privé, des tickets de référence et une synchronisation dont chaque état est visible.</p></div><span className="pill" id="mode-pill">Lecture en cours…</span></div><div className="summary"><span><strong>Priorité</strong> <span id="summary-0">Prochain petit pas</span></span><span><strong>Cas concret</strong> <span id="summary-1">Jeu fictif</span></span><span><strong>Déjà prouvé</strong> <span id="summary-2">Scénario de démonstration</span></span></div></header>
    <section className="sync-panel" aria-label="Sauvegarde et synchronisation"><div><strong id="sync-title">Chargement…</strong><p id="sync-detail" role="status" aria-live="polite"/><p id="storage-status"/></div><div className="actions"><button id="refresh">Relire l’instantané</button><button id="live-refresh">Vérifier l’accès continu</button><button id="retry" hidden>Réessayer la sauvegarde de test</button></div></section>
    <div id="error" className="error" role="alert" aria-label="Erreur de synchronisation" hidden/>
    <div className="toolbar"><label><span className="sr">Filtrer les cartes</span><input id="search" type="search" placeholder="Rechercher une carte, un ticket…"/></label><label className="mode">Source <select id="mode" defaultValue="snapshot"><option value="snapshot">Instantané Linear · lecture seule</option><option value="demo">Simulation de synchronisation</option></select></label></div>
    <p className="help">Les six colonnes décrivent la coordination. Un état « Backlog » dans Linear n’annule pas un blocage métier ; la colonne « Terminé » ne prouve aucune recette métier.</p><p className="help" id="mapping"/>
    <details className="review-tools"><summary>Reprise des positions et outils de revue</summary><p>Le prototype original et ses données locales ne sont jamais lus ni écrits par cette application. La reprise se fait volontairement dans la simulation, à partir d’un objet de positions déjà exporté. Aucun changement Linear.</p><label>Positions à reprendre<textarea id="legacy" placeholder={'{"plans":"blocked"}'}/></label><div className="actions"><button id="import">Préparer la reprise en simulation</button><button id="export">Exporter les positions et le brouillon</button><button id="failure">Simuler une erreur de sauvegarde</button><button id="offline">Simuler hors connexion</button></div><p>La simulation partage un fichier de test sur ce serveur local. Elle ne constitue pas une connexion Linear ni un accès depuis un autre appareil. Aucune connexion persistante n’est configurée.</p></details>
    <main><div className="board" id="board" aria-label="Kanban compagnon"/><section className="decisions"><div><h2>Le prochain petit pas</h2><p>Une décision à la fois, sans tout lancer en parallèle.</p></div><ol id="decisions"><li>Chargement des prochaines étapes…</li></ol></section></main>
    <footer>Version de revue privée · aucun ticket créé, modifié ou assigné. Les cartes sans ticket restent du contexte de coordination. Une authentification privée et un accès serveur Linear explicitement autorisés sont nécessaires pour le multiappareil réel.</footer><div id="live" className="sr" aria-live="polite"/>
  </>;
}
