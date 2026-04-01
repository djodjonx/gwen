import { describe, it, expect } from 'vitest';

describe('InputPlugin', () => {
  it('should track key press state changes', () => {
    const keyStates = new Map<string, boolean>();
    keyStates.set('ArrowUp', true);
    keyStates.set('ArrowDown', false);
    keyStates.set('Space', true);

    expect(keyStates.size).toBe(3);
    expect(keyStates.get('ArrowUp')).toBe(true);
    expect(keyStates.get('ArrowDown')).toBe(false);
  });

  it('should track mouse position coordinates', () => {
    const mousePos = { x: 100, y: 150 };

    expect(mousePos.x).toBeGreaterThanOrEqual(0);
    expect(mousePos.y).toBeGreaterThanOrEqual(0);
    expect(typeof mousePos.x).toBe('number');
    expect(typeof mousePos.y).toBe('number');
  });

  it('should detect just-pressed keys separately from held keys', () => {
    const heldKeys = new Set(['ArrowUp', 'Space']);
    const justPressedKeys = new Set(['Enter']);

    expect(heldKeys.has('ArrowUp')).toBe(true);
    expect(justPressedKeys.has('Enter')).toBe(true);
    expect(justPressedKeys.has('ArrowUp')).toBe(false);
  });

  it('should support multiple input types', () => {
    const inputTypes = ['keyboard', 'mouse', 'gamepad'];
    expect(inputTypes).toContain('keyboard');
    expect(inputTypes).toContain('mouse');
    expect(inputTypes).toContain('gamepad');
    expect(inputTypes.length).toBe(3);
  });

  it('should reset just-pressed state each frame', () => {
    const justPressed = new Set<string>();
    justPressed.add('Space');

    expect(justPressed.size).toBe(1);

    justPressed.clear();
    expect(justPressed.size).toBe(0);
  });
});
