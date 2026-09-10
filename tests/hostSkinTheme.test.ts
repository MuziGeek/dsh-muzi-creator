import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scopeAnimalStyles } from '../scripts/scope-animal-styles.ts';

describe('built-in appearance ownership', () => {
  it('confines library defaults and component rules to owned roots', () => {
    const scoped = scopeAnimalStyles(':root { --animal-bg-color: red; } .control { color: blue; }');
    expect(scoped).toContain('@scope ([data-plugin="dsh-muzi-creator"], [data-plugin-modal="dsh-muzi-creator"])');
    expect(scoped).not.toContain(':root');
    expect(scoped).toContain(':where(:scope)');
  });
  it('contains a complete light and dark palette without executable hooks', () => {
    const css = readFileSync('src/client/appearance/host.css', 'utf8');
    const [light, dark] = css.split('body[data-ds-dark-theme]');
    const names = (s: string) => [...s.matchAll(/(--dsw-[\w-]+):/g)].map(m => m[1]).sort();
    expect(names(dark!)).toEqual(expect.arrayContaining(names(light!)));
    expect(names(light!)).toEqual(expect.arrayContaining(['--dsw-alias-bg-base', '--dsw-alias-label-primary', '--dsw-alias-button-primary-fill', '--dsw-alias-state-error-primary']));
  });
  it('does not register library fonts outside the bundled appearance', () => {
    const scoped = scopeAnimalStyles('@font-face { font-family: Nunito; src: url(latin.woff2); } :root { --animal-font-family: Nunito !important; } .control { font-family: var(--animal-font-family); }');
    expect(scoped).not.toContain('@font-face');
    expect(scoped).not.toContain('latin.woff2');
    expect(scoped).toContain('var(--animal-font-family)');
    expect(scoped).not.toContain('Nunito');
  });
});
