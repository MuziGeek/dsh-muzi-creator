/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { mountCommunityEntryAppearance } from '../src/client/appearance/entries.ts';

const stops: Array<() => void> = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); document.body.innerHTML = ''; });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function shell() {
  document.body.innerHTML = '<div data-plugin="dsh-muzi-creator" data-surface="sidebar"><div class="logoRow"></div><div data-sidebar-menu><div role="tablist">会话 热点 灵感 内容 知识 项目</div><div data-sidebar-community-entries></div></div><div class="regionArea"></div></div>';
  return { root: document.body.firstElementChild!, host: document.querySelector('[data-sidebar-community-entries]')! };
}

function entry(name: string) {
  const button = document.createElement('button');
  button.dataset.dshPlugin = name;
  button.dataset.dshPart = 'sidebar-entry';
  button.setAttribute('aria-label', name);
  button.innerHTML = `<span><svg></svg></span><span>${name}</span>`;
  return button;
}

it('moves original buttons after all workbench tabs and keeps actions, ordering and active state', async () => {
  const { root, host } = shell();
  const first = entry('task-board'); const second = entry('ssh');
  root.insertBefore(first, root.children[1]!); first.after(second);
  const click = vi.fn(() => { first.dataset.active = 'true'; }); first.onclick = click;
  const stop = mountCommunityEntryAppearance(document); stops.push(stop);
  expect([...host.children]).toEqual([first, second]);
  expect(host.previousElementSibling!.getAttribute('role')).toBe('tablist');
  expect(root.contains(first)).toBe(true);
  first.click(); expect(click).toHaveBeenCalledOnce(); expect(first.dataset.active).toBe('true');
  // Community self-healing observers require containment in the original sidebar root.
  const repair = vi.fn(() => { if (!root.contains(first)) root.append(first); });
  const observer = new MutationObserver(repair); observer.observe(root, { childList: true, subtree: true });
  stops.push(() => observer.disconnect());
  second.setAttribute('aria-label', 'SSH 管理');
  await settle(); expect(second.title).toBe('SSH 管理');
  const count = repair.mock.calls.length; await settle(); expect(repair).toHaveBeenCalledTimes(count);
  stop(); expect(first.parentElement).toBe(root); expect(first.nextElementSibling).toBe(second);
  expect(first.dataset.active).toBe('true'); first.click(); expect(click).toHaveBeenCalledTimes(2);
});

it('appends late entries without reshuffling existing ones, handles reinsertion and never resurrects removed entries', async () => {
  const { root, host } = shell();
  stops.push(mountCommunityEntryAppearance(document));
  const first = entry('ssh'); root.prepend(first); await settle();
  const late = entry('skill-explorer'); root.prepend(late); await settle();
  expect([...host.children]).toEqual([first, late]);
  root.prepend(late); await settle(); expect([...host.children]).toEqual([first, late]);
  first.remove(); await settle(); expect(host.children).toHaveLength(1);
  const replacement = entry('ssh'); root.prepend(replacement); await settle();
  expect([...host.children]).toEqual([late, replacement]); expect(first.isConnected).toBe(false);
});

it('waits for the navigation host and adapts a remounted sidebar without touching other plugin locations', async () => {
  const { root } = shell();
  const menu = root.querySelector('[data-sidebar-menu]')!; menu.remove();
  const button = entry('ssh'); root.append(button);
  const outside = entry('outside'); document.body.append(outside);
  stops.push(mountCommunityEntryAppearance(document));
  expect(button.parentElement).toBe(root);
  root.append(menu); await settle(); expect(button.parentElement).toBe(menu.lastElementChild);
  expect(outside.parentElement).toBe(document.body); expect(outside.hasAttribute('data-muzi-entry')).toBe(false);
  const replacement = root.cloneNode(true) as HTMLElement; root.replaceWith(replacement); await settle();
  const next = entry('task-board'); replacement.prepend(next); await settle();
  expect(next.parentElement).toBe(replacement.querySelector('[data-sidebar-community-entries]'));
  expect(root.isConnected).toBe(false);
});
