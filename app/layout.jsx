import '../public/style.css';
export const metadata = { title: 'Compagnon Kanban citron', description: 'Tableau privé de coordination, instantané et simulation explicites.' };
export default function RootLayout({children}) {
  return <html lang="fr"><body>{children}</body></html>;
}
