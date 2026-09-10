/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IslandButton, IslandSelectableCard, IslandTag } from '../src/client/ui/IslandControls.tsx';

afterEach(cleanup);
describe('skin surface semantics', () => {
  it('retains selected card tone and keyboard activation without class-hash adapters', () => {
    const onSelect = vi.fn();
    render(<IslandSelectableCard selected selectedColor="app-teal" pattern="default" onSelect={onSelect}>灵感详情</IslandSelectableCard>);
    const card = screen.getByRole('button', { name: '灵感详情' });
    expect(card.getAttribute('data-island-color')).toBe('app-teal');
    expect(card.getAttribute('data-island-pattern')).toBe('default');
    expect(card.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
  });
  it('projects tag variants through the library className slot and keeps buttons operable', () => {
    const onClick = vi.fn();
    render(<><IslandTag color="brown" variant="soft">已整理</IslandTag><IslandButton size="small" onClick={onClick}>查看</IslandButton></>);
    const tag = screen.getByText('已整理').closest('.islandTag');
    expect(tag?.classList.contains('islandTagColor-brown')).toBe(true);
    expect(tag?.classList.contains('islandTagVariant-soft')).toBe(true);
    const button = screen.getByRole('button', { name: '查看' });
    expect(button.getAttribute('data-island-size')).toBe('small');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
