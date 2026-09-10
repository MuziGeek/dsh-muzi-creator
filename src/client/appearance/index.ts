import './host.css';
import './components.css';
import './compatibility.css';
import './entries.css';
import { mountCommunityEntryAppearance } from './entries.ts';

/** Fixed appearance lives only for the workbench's active client effect. */
export function mountWorkbenchAppearance(doc: Document): () => void {
  doc.documentElement.setAttribute('data-muzi-workbench-appearance', '');
  const stopEntries = mountCommunityEntryAppearance(doc);
  return () => {
    stopEntries();
    doc.documentElement.removeAttribute('data-muzi-workbench-appearance');
  };
}
