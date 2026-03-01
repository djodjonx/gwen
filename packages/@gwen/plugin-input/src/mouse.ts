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

  private onMouseMove = (e: MouseEvent): void => {
    this._position.screenX = e.clientX;
    this._position.screenY = e.clientY;

    if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      this._position.x = e.clientX - rect.left;
      this._position.y = e.clientY - rect.top;
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
   * Attach event listeners.
   * @param canvas Optional canvas for position offset calculation.
   */
  attach(target: EventTarget = window, canvas?: HTMLCanvasElement): void {
    this.canvas = canvas ?? null;
    target.addEventListener('mousemove', this.onMouseMove as EventListener);
    target.addEventListener('mousedown', this.onMouseDown as EventListener);
    target.addEventListener('mouseup', this.onMouseUp as EventListener);
    target.addEventListener('wheel', this.onWheel as EventListener, { passive: true });
  }

  detach(target: EventTarget = window): void {
    target.removeEventListener('mousemove', this.onMouseMove as EventListener);
    target.removeEventListener('mousedown', this.onMouseDown as EventListener);
    target.removeEventListener('mouseup', this.onMouseUp as EventListener);
    target.removeEventListener('wheel', this.onWheel as EventListener);
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

  /** Current mouse position (canvas-relative if canvas provided). */
  get position(): Readonly<MousePosition> {
    return this._position;
  }

  /** Wheel scroll delta this frame (positive = scroll down). */
  get wheel(): number {
    return this._wheel;
  }

  getButtonState(btn: MouseButton): MouseButtonState {
    return this.buttonStates.get(btn) ?? 'idle';
  }

  isButtonJustPressed(btn: MouseButton): boolean {
    return this.buttonStates.get(btn) === 'justPressed';
  }

  isButtonPressed(btn: MouseButton): boolean {
    const s = this.buttonStates.get(btn);
    return s === 'justPressed' || s === 'held';
  }

  isButtonHeld(btn: MouseButton): boolean {
    return this.buttonStates.get(btn) === 'held';
  }

  isButtonJustReleased(btn: MouseButton): boolean {
    return this.buttonStates.get(btn) === 'justReleased';
  }

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
