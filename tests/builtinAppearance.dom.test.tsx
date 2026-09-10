/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { WorkbenchIcon } from '../src/client/ui/WorkbenchIcon.tsx';
import { WORKBENCH_ICON_NAMES } from '../src/client/ui/workbenchIconNames.ts';
import { mountWorkbenchAppearance } from '../src/client/appearance/index.ts';
import { registerPluginCss, releasePluginCss, remountPluginCss } from '../src/client/pluginCss.ts';

afterEach(() => { cleanup(); releasePluginCss(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

it('renders every meaning without requesting a skin and falls back on image failure', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { container, rerender } = render(<>{WORKBENCH_ICON_NAMES.map(name => <WorkbenchIcon key={name} name={name} />)}</>);
  expect(container.querySelectorAll('img')).toHaveLength(WORKBENCH_ICON_NAMES.length);
  const first = container.querySelector('img')!; fireEvent.error(first);
  expect(container.querySelector('svg')).not.toBeNull();
  rerender(<WorkbenchIcon name="search" purpose="compact" />);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('svg')).not.toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it('mounts stylesheet resources only during the client effect and releases them together', () => {
  registerPluginCss('appearance-test', '@font-face {font-family: Test; src: url(data:font/woff2;base64,AA==)}');
  expect(document.querySelector('style[data-plugin-css="appearance-test"]')).toBeNull();
  remountPluginCss(); const stop = mountWorkbenchAppearance(document);
  expect(document.querySelector('style[data-plugin-css="appearance-test"]')).not.toBeNull();
  expect(document.documentElement.hasAttribute('data-muzi-workbench-appearance')).toBe(true);
  stop(); releasePluginCss();
  expect(document.querySelector('style[data-plugin-css="appearance-test"]')).toBeNull();
  expect(document.documentElement.hasAttribute('data-muzi-workbench-appearance')).toBe(false);
  remountPluginCss(); expect(document.querySelector('style[data-plugin-css="appearance-test"]')).not.toBeNull();
});

it('adapts dynamic semantic entries while preserving identity, actions, names and external tooltips', async () => {
  document.body.innerHTML = '<div data-plugin="dsh-muzi-creator" data-surface="sidebar"></div><button id="outside" data-dsh-plugin="other" data-dsh-part="sidebar-entry" aria-label="Outside"><span><svg></svg></span><span>Outside</span></button>';
  const root = document.querySelector('div')!;
  const stop = mountWorkbenchAppearance(document);
  const entry = document.createElement('button');
  entry.setAttribute('data-dsh-plugin', 'extension'); entry.setAttribute('data-dsh-part', 'sidebar-entry'); entry.setAttribute('aria-label', 'Extension');
  entry.innerHTML = '<span><svg></svg></span><span>Extension</span>';
  const onClick = vi.fn(); entry.onclick = onClick; root.append(entry);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(entry.dataset.muziEntry).toBe('generic'); expect(entry.title).toBe('Extension');
  entry.click(); expect(onClick).toHaveBeenCalledOnce();
  expect(root.firstElementChild).toBe(entry); expect(document.querySelector('#outside')!.hasAttribute('data-muzi-entry')).toBe(false);
  entry.setAttribute('aria-label', 'Renamed'); await new Promise(resolve => setTimeout(resolve, 0)); expect(entry.title).toBe('Renamed');
  entry.setAttribute('data-dsh-plugin', 'ssh'); await new Promise(resolve => setTimeout(resolve, 0)); expect(entry.dataset.muziEntry).toBe('ssh');
  entry.title = 'Plugin tooltip'; stop();
  expect(entry.title).toBe('Plugin tooltip'); expect(entry.hasAttribute('data-muzi-entry')).toBe(false);
  expect(entry.querySelector('svg')).not.toBeNull(); entry.click(); expect(onClick).toHaveBeenCalledTimes(2);
});
