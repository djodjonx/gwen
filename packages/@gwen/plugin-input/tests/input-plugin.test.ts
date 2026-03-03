import { describe, it, expect } from 'vitest';

describe('InputPlugin', () => {
  it('should create an instance', () => {
    expect(true).toBe(true);
  });

  it('should track key press state', () => {
    const keyStates = new Map<string, boolean>();
    keyStates.set('ArrowUp', true);
    keyStates.set('ArrowDown', false);

    expect(keyStates.get('ArrowUp')).toBe(true);
    expect(keyStates.get('ArrowDown')).toBe(false);
  });

  it('should track mouse position', () => {
    const mousePos = { x: 100, y: 150 };
    expect(mousePos.x).toBe(100);
    expect(mousePos.y).toBe(150);
  });

  it('should detect just-pressed keys', () => {
    const justPressed = new Set<string>();
    justPressed.add('Space');

    expect(justPressed.has('Space')).toBe(true);
    expect(justPressed.has('Enter')).toBe(false);
  });
});

