/**
 * MouseInput — tracks mouse position and button states
 *
 * Button states use the same 4-state machine as KeyboardInput.
 * Position is tracked relative to the canvas (or window if no canvas provided).
 */

export type MouseButton = 0 | 1 | 2; // left | middle | right
export type MouseButtonState = 'idle' | 'justPressed' | 'held' | 'justReleased';

export interface MousePosition {
  /** Position in canvas space */
  x: number;
  y: number;
  /** Raw screen-space position */
  screenX: number;
  screenY: number;
}

export class MouseInput {
  private buttonStates = new Map<MouseButton, MouseButtonState>();
  private pendingDown = new Set<MouseButton>();
  private pendingUp = new Set<MouseButton>();
  private _position: MousePosition = { x: 0, y: 0, screenX: 0, screenY: 0 };
  private _wheel = 0;
  private _wheelAccumulator = 0;
  private canvas: HTMLCanvasElement | null = null;
  private cachedRect: DOMRect | null = null;
  private onResize = (): void => {
    this.cachedRect = null;
  };

  private onMouseMove = (e: MouseEvent): void => {
    this._position.screenX = e.clientX;
    this._position.screenY = e.clientY;

    if (this.canvas) {
      if (!this.cachedRect) this.cachedRect = this.canvas.getBoundingClientRect();
      this._position.x = e.clientX - this.cachedRect.left;
      this._position.y = e.clientY - this.cachedRect.top;
    } else {
      this._position.x = e.clientX;
      this._position.y = e.clientY;
    }
  };

  private onMouseDown = (e: MouseEvent): void => {
    const btn = e.button as MouseButton;
    const current = this.buttonStates.get(btn);
    if (!current || current === 'idle' || current === 'justReleased') {
      this.pendingDown.add(btn);
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.pendingUp.add(e.button as MouseButton);
  };

  private onWheel = (e: WheelEvent): void => {
    this._wheelAccumulator += Math.sign(e.deltaY);
  };

  /**
   * Attach event listeners for mouse tracking.
   *
   * @param target Event target (default: window)
   * @param canvas Optional canvas element for coordinate offset calculation
   *
   * @example
   * ```typescript
   * const mouse = new MouseInput();
   * const canvas = document.getElementById('game') as HTMLCanvasElement;
   * mouse.attach(window, canvas);
   * ```
   */
  attach(target: EventTarget = window, canvas?: HTMLCanvasElement): void {
    this.canvas = canvas ?? null;
    target.addEventListener('mousemove', this.onMouseMove as EventListener);
    target.addEventListener('mousedown', this.onMouseDown as EventListener);
    target.addEventListener('mouseup', this.onMouseUp as EventListener);
    target.addEventListener('wheel', this.onWheel as EventListener, { passive: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }
  }

  detach(target: EventTarget = window): void {
    target.removeEventListener('mousemove', this.onMouseMove as EventListener);
    target.removeEventListener('mousedown', this.onMouseDown as EventListener);
    target.removeEventListener('mouseup', this.onMouseUp as EventListener);
    target.removeEventListener('wheel', this.onWheel as EventListener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
    }
  }

  /** Advance button states. Call in onBeforeUpdate(). */
  update(): void {
    // Advance states
    for (const [btn, state] of this.buttonStates) {
      if (state === 'justReleased') {
        this.buttonStates.set(btn, 'idle');
      } else if (state === 'justPressed' || state === 'held') {
        if (!this.pendingUp.has(btn)) {
          this.buttonStates.set(btn, 'held');
        }
      }
    }

    for (const btn of this.pendingDown) {
      this.buttonStates.set(btn, 'justPressed');
    }
    this.pendingDown.clear();

    for (const btn of this.pendingUp) {
      const current = this.buttonStates.get(btn);
      if (current === 'justPressed' || current === 'held') {
        this.buttonStates.set(btn, 'justReleased');
      } else {
        this.buttonStates.set(btn, 'idle');
      }
    }
    this.pendingUp.clear();

    // Snapshot wheel delta then clear accumulator
    this._wheel = this._wheelAccumulator;
    this._wheelAccumulator = 0;
  }

  /**
   * Current mouse position in canvas-relative or screen-relative coordinates.
   *
   * If a canvas was provided to attach(), x/y are relative to canvas.
   * Otherwise, x/y are screen-relative (same as screenX/screenY).
   *
   * @returns MousePosition with x/y (canvas or screen space) and screenX/screenY (always screen space)
   */
  get position(): Readonly<MousePosition> {
    return this._position;
  }

  /**
   * Mouse wheel scroll delta for this frame.
   * Positive values = scroll down, negative = scroll up.
   *
   * @returns Accumulated wheel ticks this frame (cleared each update)
   */
  get wheel(): number {
    return this._wheel;
  }

  /**
   * Get the current state of a mouse button.
   *
   * @param btn Mouse button (0=left, 1=middle, 2=right)
   * @returns Button state: 'idle', 'justPressed', 'held', 'justReleased'
   */
  getButtonState(btn: MouseButton): MouseButtonState {
    return this.buttonStates.get(btn) ?? 'idle';
  }

  /**
   * Check if mouse button was just pressed this frame.
   * Only true on the FIRST frame the button transitions to pressed.
   *
   * @param btn Mouse button (0=left, 1=middle, 2=right)
   * @returns true if justPressed
   *
   * @example
   * ```typescript
   * if (mouse.isButtonJustPressed(0)) {
   *   console.log('Click detected this frame');
   * }
   * ```
   */
  isButtonJustPressed(btn: MouseButton): boolean {
    return this.buttonStates.get(btn) === 'justPressed';
  }

  /**
   * Check if mouse button is currently pressed (held down).
   * True on all frames the button is down, including the first frame.
   *
   * @param btn Mouse button (0=left, 1=middle, 2=right)
   * @returns true if justPressed or held
   *
   * @example
   * ```typescript
   * if (mouse.isButtonPressed(0)) {
   *   player.drag(mouse.position);  // Smooth dragging while held
   * }
   * ```
   */
  isButtonPressed(btn: MouseButton): boolean {
    const s = this.buttonStates.get(btn);
    return s === 'justPressed' || s === 'held';
  }

  /**
   * Check if mouse button is being held (not on the first frame).
   * Useful for distinguishing initial click from continuous drag.
   *
   * @param btn Mouse button (0=left, 1=middle, 2=right)
   * @returns true if held
   */
  isButtonHeld(btn: MouseButton): boolean {
    return this.buttonStates.get(btn) === 'held';
  }

  /**
   * Check if mouse button was just released this frame.
   * Only true on the FIRST frame after the button is released.
   *
   * @param btn Mouse button (0=left, 1=middle, 2=right)
   * @returns true if justReleased
   *
   * @example
   * ```typescript
   * if (mouse.isButtonJustReleased(0)) {
   *   player.dropItem();  // Execute once on release
   * }
   * ```
   */
  isButtonJustReleased(btn: MouseButton): boolean {
    return this.buttonStates.get(btn) === 'justReleased';
  }

  /**
   * Reset all mouse button states and wheel accumulator to idle.
   * Useful when window loses focus to prevent stuck buttons.
   */
  reset(): void {
    for (const btn of this.buttonStates.keys()) {
      this.buttonStates.set(btn, 'idle');
    }
    this.pendingDown.clear();
    this.pendingUp.clear();
    this._wheel = 0;
    this._wheelAccumulator = 0;
  }
}
