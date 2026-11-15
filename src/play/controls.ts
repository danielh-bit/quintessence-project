// Keyboard and mouse, as plain state. Nothing here touches the simulation: the
// main loop turns this state into one Input per tick.

export interface Controls {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Mouse buttons held. */
  swing: boolean;
  place: boolean;
  /** Mouse position (client px). */
  mouseX: number;
  mouseY: number;
}

export interface ControlHooks {
  togglePack(): void;
  toggleShip(): void;
  cycleSlot(dir: 1 | -1): void;
  /** A click on the canvas (client px) that is not a swing or a place: used to pick pack cells. */
  click(clientX: number, clientY: number): boolean;
  /** Called on any first gesture (to start audio). */
  gesture(): void;
}

export function bindControls(target: HTMLElement, hooks: ControlHooks): Controls {
  const c: Controls = { left: false, right: false, jump: false, swing: false, place: false, mouseX: 0, mouseY: 0 };
  const set = (code: string, down: boolean): boolean => {
    switch (code) {
      case "KeyA":
      case "ArrowLeft":
        c.left = down;
        return true;
      case "KeyD":
      case "ArrowRight":
        c.right = down;
        return true;
      case "KeyW":
      case "ArrowUp":
      case "Space":
        c.jump = down;
        return true;
    }
    return false;
  };
  window.addEventListener("keydown", (e) => {
    hooks.gesture();
    if (e.repeat) {
      if (set(e.code, true)) e.preventDefault();
      return;
    }
    if (set(e.code, true)) e.preventDefault();
    else if (e.code === "Tab" || e.code === "KeyI") {
      e.preventDefault();
      hooks.togglePack();
    } else if (e.code === "KeyE") hooks.toggleShip();
    else if (e.code === "KeyQ") hooks.cycleSlot(-1);
    else if (e.code === "KeyR") hooks.cycleSlot(1);
  });
  window.addEventListener("keyup", (e) => {
    if (set(e.code, false)) e.preventDefault();
  });
  window.addEventListener("blur", () => {
    c.left = c.right = c.jump = c.swing = c.place = false;
  });
  target.addEventListener("mousemove", (e) => {
    c.mouseX = e.clientX;
    c.mouseY = e.clientY;
  });
  target.addEventListener("mousedown", (e) => {
    hooks.gesture();
    c.mouseX = e.clientX;
    c.mouseY = e.clientY;
    if (e.button === 0) {
      if (!hooks.click(e.clientX, e.clientY)) c.swing = true;
    } else if (e.button === 2) c.place = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) c.swing = false;
    if (e.button === 2) c.place = false;
  });
  target.addEventListener("contextmenu", (e) => e.preventDefault());
  target.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      hooks.cycleSlot(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false },
  );
  return c;
}
