/**
 * KeyboardInput — tracks key states per frame
 *
 * Key states follow a 4-state machine:
 *   Idle → JustPressed → Held → JustReleased → Idle
 *
 * Rules:
 *  - JustPressed: only for the FIRST frame the key is down
 *  - Held: all subsequent frames while key is down
 *  - JustReleased: only for the FIRST frame after key is released
 *  - Idle: key is not pressed
 */

export type KeyState = 'idle' | 'justPressed' | 'held' | 'justReleased';

export class KeyboardInput {
  private states = new Map<string, KeyState>();
  private pendingDown = new Set<string>();
  private pendingUp = new Set<string>();

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = e.code; // Use e.code for layout-independent detection
    if (
      !this.states.has(key) ||
      this.states.get(key) === 'idle' ||
      this.states.get(key) === 'justReleased'
    ) {
      this.pendingDown.add(key);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.pendingUp.add(e.code);
  };

  /**
   * Attach event listeners to a target (window or a specific element).
   * Called by InputPlugin.onInit().
   */
  attach(target: EventTarget = window): void {
    target.addEventListener('keydown', this.onKeyDown as EventListener);
    target.addEventListener('keyup', this.onKeyUp as EventListener);
  }

  /** Remove event listeners. Called by InputPlugin.onDestroy(). */
  detach(target: EventTarget = window): void {
    target.removeEventListener('keydown', this.onKeyDown as EventListener);
    target.removeEventListener('keyup', this.onKeyUp as EventListener);
  }

  /**
   * Advance key states to the next frame.
   * Must be called in onBeforeUpdate() — before game logic reads inputs.
   */
  update(): void {
    // Advance held→idle and justReleased→idle
    for (const [key, state] of this.states) {
      if (state === 'justReleased') {
        this.states.set(key, 'idle');
      } else if (state === 'held' || state === 'justPressed') {
        if (!this.pendingUp.has(key)) {
          this.states.set(key, 'held');
        }
      }
    }

    // Process pending downs
    for (const key of this.pendingDown) {
      this.states.set(key, 'justPressed');
    }
    this.pendingDown.clear();

    // Process pending ups
    for (const key of this.pendingUp) {
      const current = this.states.get(key);
      if (current === 'justPressed' || current === 'held') {
        this.states.set(key, 'justReleased');
      } else {
        this.states.set(key, 'idle');
      }
    }
    this.pendingUp.clear();
  }

  /**
   * Get the current state of a key.
   *
   * @param key Key code (e.g., 'ArrowUp', 'Space', 'KeyW')
   * @returns Current state: 'idle', 'justPressed', 'held', 'justReleased'
   */
  getState(key: string): KeyState {
    return this.states.get(key) ?? 'idle';
  }

  /**
   * Check if key was just pressed this frame.
   * Only true on the FIRST frame the key transitions from idle to pressed.
   *
   * @param key Key code
   * @returns true if justPressed, false otherwise
   *
   * @example
   * ```typescript
   * if (keyboard.isJustPressed('Space')) {
   *   player.jump();  // Executes once per press
   * }
   * ```
   */
  isJustPressed(key: string): boolean {
    return this.states.get(key) === 'justPressed';
  }

  /**
   * Check if key is currently pressed (held down).
   * True on all frames the key is down, including the first frame.
   *
   * @param key Key code
   * @returns true if justPressed or held
   *
   * @example
   * ```typescript
   * if (keyboard.isPressed('KeyW')) {
   *   player.moveForward(dt);  // Smooth movement while key is held
   * }
   * ```
   */
  isPressed(key: string): boolean {
    const s = this.states.get(key);
    return s === 'justPressed' || s === 'held';
  }

  /**
   * Check if key is being held (not on the first frame).
   * Useful for differentiating between initial press and continuous holding.
   *
   * @param key Key code
   * @returns true if held
   */
  isHeld(key: string): boolean {
    return this.states.get(key) === 'held';
  }

  /**
   * Check if key was just released this frame.
   * Only true on the FIRST frame after the key is released.
   *
   * @param key Key code
   * @returns true if justReleased
   */
  isJustReleased(key: string): boolean {
    return this.states.get(key) === 'justReleased';
  }

  /**
   * Reset all key states to idle.
   * Useful when window loses focus to prevent stuck keys.
   */
  reset(): void {
    for (const key of this.states.keys()) {
      this.states.set(key, 'idle');
    }
    this.pendingDown.clear();
    this.pendingUp.clear();
  }
}
