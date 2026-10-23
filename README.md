# Compagnon Kanban citron

Prototype Next.js séparé de toute application métier. Cinq colonnes, onze cartes
fictives, palette vert citron/jaune citron et contrôles accessibles au clavier.
Le code générique et les exemples sont sous licence MIT.

## Exécuter localement

Node.js 22.22.3+ (ou 24.8+) est requis par le runner de test.

```sh
npm ci
DATA_MODE=fixture npm run dev -- --port 3000
```

Ouvrir `http://127.0.0.1:3000`. Le serveur écoute uniquement sur la boucle locale.
Pour une compilation de production locale : `npm run build`, puis
`DATA_MODE=fixture npm start -- --port 3000`.

## Ce qui fonctionne

- Instantané en lecture seule : les statuts des tickets restent distincts des
  colonnes de coordination. Le jeu livré est explicitement fictif.
- Simulation : sauvegarde côté serveur dans `.runtime/`, révisions par carte,
  partage entre sessions du même serveur, reprise de brouillon après rechargement.
- Erreurs réseau, expiration et échec de sauvegarde visibles ; une opération
  incertaine conserve son identifiant lors d’une nouvelle tentative.
- Conflit HTTP 409 : garder la version serveur ou reproposer explicitement le
  déplacement. Aucun écrasement silencieux. Les cartes indépendantes ne se bloquent pas.
- Filtrage, menus de déplacement, glisser-déposer, export des positions et reprise
  volontaire d’un objet de positions valide. Le prototype d’origine est indépendant.

## Limites explicites

Ce prototype n’est connecté à aucune session Linear persistante. Le bouton d’accès
continu rend l’erreur `LINEAR_CONNECTION_REQUIRED` ; une écriture hors simulation
renvoie `LINEAR_WRITE_DISABLED`. Aucun ticket n’est créé, modifié ou assigné.
La simulation ne valide pas le comportement des API Linear.

`service.mjs` expose le contrat commun aux routes Next.js et au harnais HTTP des
tests. `ConnectionRequiredAdapter` ferme les opérations réelles tant que l’accès
n’est pas approuvé. `adapters/linear-contract.ts` décrit les conditions du futur
adaptateur. Aucun flux OAuth ou token n’est configuré.

Le multiappareil réel reste à préparer : authentification privée des utilisateurs,
accès serveur Linear autorisé, états et champs modifiables explicitement validés,
puis hébergement privé approuvé. Ne pas ouvrir ce serveur de revue sur le réseau.
Le garde d’origine/host limite les routes à localhost ; il ne remplace pas une
authentification d’application.

Une lecture réelle ponctuelle peut être chargée localement dans `.private/seed.json`
et `.private/linear-snapshot.json`, de même structure que les exemples. Ces données
restent locales et ignorées. `DATA_MODE=fixture` force toujours les exemples.
Les documents métier restent dans leur stockage documentaire ; les tâches et leurs
états restent dans le gestionnaire de tickets. Ce projet ne télécharge aucun document.

Les colonnes de coordination ne sont pas traduites automatiquement en états Linear :
un blocage métier, une validation de preuve et un statut technique n’ont pas la même
signification. Une carte peut avoir plusieurs tickets existants ; cette relation est
conservée sans duplication. Les cartes sans ticket ne déclenchent aucune création.

Le stockage de simulation est prévu pour un seul processus local. Pour un service
réel à plusieurs instances, il faut une transaction serveur ou un mécanisme de
révision atomique validé auprès du fournisseur. Les 500 dernières opérations de test
sont mémorisées : au-delà, une ancienne tentative est refusée par sa révision, sans
écrasement, et doit être réconciliée explicitement.

## Vérification

```sh
npm test
E2E_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run test:e2e
npm run build
```

Les tests e2e utilisent uniquement les exemples, un serveur Next.js éphémère et un
navigateur dédié. Aucun modèle ni connexion de compte n’est nécessaire. Les traces,
captures, fichiers de runtime, données privées et secrets sont ignorés par Git.
Le harnais `server.mjs` sert seulement aux contrats HTTP automatisés.

Avant publication : examiner tous les fichiers suivis et l’historique complet ; ne
jamais forcer l’ajout de `.private/`, `.runtime/`, `.next/` ou `.e2e/`.
Aucun déploiement ni service web public n’est inclus.
