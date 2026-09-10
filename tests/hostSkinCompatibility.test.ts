import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('skin compatibility inventory', () => {
  it('keeps marketplace anchors and shape rules in the bundled compatibility rules', () => {
    const manifest = JSON.parse(readFileSync('src/client/appearance/compatibility.json', 'utf8'));
    const css = readFileSync('src/client/appearance/compatibility.css', 'utf8');
    expect(manifest.desktop).toBe('2.0.5');
    for (const selector of manifest.selectors) expect(css).toContain(selector);
    expect(css).toMatch(/\.dshMarketOverlayMask\s*\{[^}]*border-radius:\s*0/);
    expect(css).not.toContain('[class*=');
    expect(css).not.toContain('data-muzi-host-skin');
  });
  it('retains sidebar layout independently of the selected skin', () => {
    const css = readFileSync('src/client/host-skin/layout.css', 'utf8');
    expect(css).toContain('[data-slot="sidebar.workspaces"]');
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).not.toContain('data-muzi-host-skin');
    expect(css).not.toContain('--muzi-host-');
  });
});
