const ROOT = '[data-plugin="dsh-muzi-creator"][data-surface="sidebar"]';
const ENTRY = 'button[data-dsh-plugin][data-dsh-part="sidebar-entry"][aria-label]';
const KNOWN = new Set(['ssh', 'skill-explorer', 'task-board']);

/** Place verified entries after workbench tabs, preserving their nodes, actions and observed order. */
export function mountCommunityEntryAppearance(doc: Document): () => void {
  const owned = new Map<HTMLElement, { title: string | null; supplied: string | null; anchor: Comment | null }>();
  const release = (entry: HTMLElement) => {
    const state = owned.get(entry);
    if (!state) return;
    entry.removeAttribute('data-muzi-entry');
    if (state.supplied !== null && entry.getAttribute('title') === state.supplied) {
      if (state.title === null) entry.removeAttribute('title');
      else entry.setAttribute('title', state.title);
    }
    if (state.anchor?.isConnected && entry.parentElement?.matches('[data-sidebar-community-entries]')) {
      state.anchor.replaceWith(entry);
    } else state.anchor?.remove();
    owned.delete(entry);
  };
  const sync = () => {
    const present = new Set<HTMLElement>();
    for (const entry of doc.querySelectorAll<HTMLElement>(`${ROOT} ${ENTRY}`)) {
      const [icon, label] = entry.children;
      const name = entry.getAttribute('aria-label')?.trim();
      if (!name || entry.children.length !== 2 || icon?.tagName !== 'SPAN'
        || label?.tagName !== 'SPAN' || icon.children.length !== 1 || icon.firstElementChild?.tagName.toLowerCase() !== 'svg') continue;
      present.add(entry);
      const plugin = entry.getAttribute('data-dsh-plugin')!;
      const kind = KNOWN.has(plugin) ? plugin : 'generic';
      if (entry.getAttribute('data-muzi-entry') !== kind) entry.setAttribute('data-muzi-entry', kind);
      let state = owned.get(entry);
      if (!state) {
        state = { title: entry.getAttribute('title'), supplied: null, anchor: null };
        owned.set(entry, state);
      }
      const root = entry.closest(ROOT);
      const destination = root?.querySelector<HTMLElement>('[data-sidebar-community-entries]');
      if (destination && entry.parentElement !== destination) {
        state.anchor?.remove();
        state.anchor = doc.createComment('community navigation return position');
        entry.before(state.anchor);
        destination.append(entry);
      }
      if (state.title === null && (!entry.hasAttribute('title') || entry.getAttribute('title') === state.supplied)) {
        entry.setAttribute('title', name);
        state.supplied = name;
      }
    }
    for (const entry of owned.keys()) if (!present.has(entry)) release(entry);
  };
  const observer = new MutationObserver(sync);
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-dsh-plugin', 'data-dsh-part', 'aria-label'] });
  sync();
  return () => {
    observer.disconnect();
    for (const entry of owned.keys()) release(entry);
  };
}
