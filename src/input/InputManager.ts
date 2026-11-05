import { InputState } from '../types';

export class InputManager {
  private heldKeys: Set<string> = new Set();
  private pressedKeys: Set<string> = new Set();
  private currentInputs: InputState = {
    moveX: 0,
    up: false,
    down: false,
    punch: false,
    kick: false,
    grab: false,
    super: false,
  };

  public onPauseToggle: (() => void) | null = null;
  public onMusicToggle: (() => void) | null = null;
  public onMuteToggle: (() => void) | null = null;

  private listeners = new AbortController();
  public enabled = false;

  constructor() {
    this.bindKeyboardEvents();
    this.bindTouchControls();
  }

  private bindKeyboardEvents(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable=true]')) return;
      if (!this.enabled) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';

      if (!this.heldKeys.has(code)) {
        this.pressedKeys.add(code);
        if (key) this.pressedKeys.add(key);
      }
      this.heldKeys.add(code);
      if (key) this.heldKeys.add(key);

      if (e.repeat) return;
      // Handle Hotkeys
      if (e.code === 'Escape' || e.key === 'Escape') {
        this.onPauseToggle?.();
      } else if (e.code === 'KeyM' || e.key === 'm' || e.key === 'M') {
        this.onMusicToggle?.();
      } else if (e.code === 'KeyN' || e.key === 'n' || e.key === 'N') {
        this.onMuteToggle?.();
      }
    }, { signal: this.listeners.signal });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.heldKeys.delete(e.code);
      if (e.key) this.heldKeys.delete(e.key.toLowerCase());
    }, { signal: this.listeners.signal });

    // Clear keys when window loses focus
    window.addEventListener('blur', () => {
      this.clear();
    }, { signal: this.listeners.signal });
  }

  private bindTouchControls(): void {
    // Detect touch device
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) {
      document.documentElement.classList.add('touch');
      this.createVirtualTouchPad();
    }
  }

  private createVirtualTouchPad(): void {
    // Check if virtual pad already exists
    if (document.getElementById('virtual-touch-pad')) return;

    const padContainer = document.createElement('div');
    padContainer.id = 'virtual-touch-pad';
    padContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      display: flex;
      justify-content: space-between;
      pointer-events: none;
      z-index: 1000;
    `;

    // Left D-Pad / Joystick
    const dpad = document.createElement('div');
    dpad.style.cssText = `
      display: grid;
      grid-template-columns: repeat(3, 50px);
      grid-template-rows: repeat(3, 50px);
      gap: 6px;
      pointer-events: auto;
    `;

    const createDpadBtn = (label: string, row: number, col: number, key: string) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        grid-row: ${row};
        grid-column: ${col};
        background: rgba(0, 0, 0, 0.6);
        border: 2px solid #ffe3a0;
        border-radius: 8px;
        color: #ffe3a0;
        font-family: inherit;
        font-size: 20px;
        touch-action: none;
      `;
      this.bindTouchButton(btn, key);
      return btn;
    };

    dpad.appendChild(createDpadBtn('▲', 1, 2, 'KeyW'));
    dpad.appendChild(createDpadBtn('◀', 2, 1, 'KeyA'));
    dpad.appendChild(createDpadBtn('▼', 3, 2, 'KeyS'));
    dpad.appendChild(createDpadBtn('▶', 2, 3, 'KeyD'));
    padContainer.appendChild(dpad);

    // Right Action Buttons (PUNCH, KICK, GRAB, SUPER)
    const actionGroup = document.createElement('div');
    actionGroup.style.cssText = `
      display: grid;
      grid-template-columns: repeat(2, 60px);
      grid-template-rows: repeat(2, 60px);
      gap: 10px;
      pointer-events: auto;
    `;

    const createActionBtn = (label: string, color: string, key: string) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        background: ${color};
        border: 2px solid #fff;
        border-radius: 50%;
        color: #fff;
        font-family: inherit;
        font-weight: bold;
        font-size: 16px;
        touch-action: none;
      `;
      this.bindTouchButton(btn, key);
      return btn;
    };

    actionGroup.appendChild(createActionBtn('P', '#ff9933', 'KeyJ'));
    actionGroup.appendChild(createActionBtn('K', '#2e9bff', 'KeyK'));
    actionGroup.appendChild(createActionBtn('G', '#22b35e', 'KeyI'));
    actionGroup.appendChild(createActionBtn('S', '#e0262f', 'Space'));
    padContainer.appendChild(actionGroup);

    document.body.appendChild(padContainer);
  }

  private bindTouchButton(btn: HTMLButtonElement, key: string): void {
    btn.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this.heldKeys.add(key);
      this.pressedKeys.add(key);
    });
    const release = () => this.heldKeys.delete(key);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
  }

  public clear(): void {
    this.heldKeys.clear();
    this.pressedKeys.clear();
  }

  public dispose(): void {
    this.listeners.abort();
    this.clear();
    document.getElementById('virtual-touch-pad')?.remove();
  }

  public pollInputs(): InputState {
    let moveX = 0;
    if (this.heldKeys.has('KeyA') || this.heldKeys.has('a') || this.heldKeys.has('ArrowLeft')) moveX -= 1;
    if (this.heldKeys.has('KeyD') || this.heldKeys.has('d') || this.heldKeys.has('ArrowRight')) moveX += 1;

    const up = this.heldKeys.has('KeyW') || this.heldKeys.has('w') || this.heldKeys.has('ArrowUp');
    const down = this.heldKeys.has('KeyS') || this.heldKeys.has('s') || this.heldKeys.has('ArrowDown');

    let punch =
      this.pressedKeys.has('KeyJ') ||
      this.pressedKeys.has('j') ||
      this.pressedKeys.has('KeyZ') ||
      this.pressedKeys.has('z');

    let kick =
      this.pressedKeys.has('KeyK') ||
      this.pressedKeys.has('k') ||
      this.pressedKeys.has('KeyX') ||
      this.pressedKeys.has('x');

    const grab =
      this.pressedKeys.has('KeyI') ||
      this.pressedKeys.has('i') ||
      this.pressedKeys.has('KeyV') ||
      this.pressedKeys.has('v') ||
      (punch && kick);

    if (grab) {
      punch = false;
      kick = false;
    }

    const superMove =
      this.pressedKeys.has('KeyL') ||
      this.pressedKeys.has('l') ||
      this.pressedKeys.has('KeyC') ||
      this.pressedKeys.has('c') ||
      this.pressedKeys.has('Space') ||
      this.pressedKeys.has(' ');

    this.currentInputs = {
      moveX,
      up,
      down,
      punch,
      kick,
      grab,
      super: superMove,
    };

    // Edge-triggered actions: clear one-shot presses
    this.pressedKeys.clear();

    return this.currentInputs;
  }
}

