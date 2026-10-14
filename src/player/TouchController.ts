export class TouchController {
  public moveX = 0;
  public moveZ = 0;
  public lookDeltaX = 0;
  public lookDeltaY = 0;
  public isJumping = false;
  public isSprinting = false;
  public sensitivity = 0.0045;

  private joyTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private lastLookX = 0;
  private lastLookY = 0;

  constructor(onAttack: () => void, onUse: () => void) {
    const joyZone = document.getElementById('joystick-zone')!;
    const joyKnob = document.getElementById('joystick-knob')!;
    const lookZone = document.getElementById('look-zone')!;

    joyZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joyTouchId = t.identifier;
      const rect = joyZone.getBoundingClientRect();
      this.joyOriginX = rect.left + rect.width / 2;
      this.joyOriginY = rect.top + rect.height / 2;
    }, { passive: false });

    joyZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joyTouchId) {
          const dx = t.clientX - this.joyOriginX, dy = t.clientY - this.joyOriginY;
          const maxR = 46, dist = Math.min(maxR, Math.hypot(dx, dy));
          const angle = Math.atan2(dy, dx);
          const nx = Math.cos(angle) * dist, ny = Math.sin(angle) * dist;
          joyKnob.style.transform = `translate(${nx}px, ${ny}px)`;
          this.moveX = nx / maxR;
          this.moveZ = ny / maxR;
          this.isSprinting = (dist / maxR) > 0.82;
        }
      }
    }, { passive: false });

    const resetJoy = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joyTouchId) {
          this.joyTouchId = null; this.moveX = 0; this.moveZ = 0; this.isSprinting = false;
          joyKnob.style.transform = `translate(0px, 0px)`;
        }
      }
    };
    joyZone.addEventListener('touchend', resetJoy);
    joyZone.addEventListener('touchcancel', resetJoy);

    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; this.lookTouchId = t.identifier;
      this.lastLookX = t.clientX; this.lastLookY = t.clientY;
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.lookTouchId) {
          this.lookDeltaX += (t.clientX - this.lastLookX) * this.sensitivity;
          this.lookDeltaY += (t.clientY - this.lastLookY) * this.sensitivity;
          this.lastLookX = t.clientX; this.lastLookY = t.clientY;
        }
      }
    }, { passive: false });

    const resetLook = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };
    lookZone.addEventListener('touchend', resetLook);
    lookZone.addEventListener('touchcancel', resetLook);

    document.getElementById('btn-attack')!.addEventListener('touchstart', (e) => { e.preventDefault(); onAttack(); });
    document.getElementById('btn-use')!.addEventListener('touchstart', (e) => { e.preventDefault(); onUse(); });

    const btnJump = document.getElementById('btn-jump')!;
    btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); this.isJumping = true; });
    btnJump.addEventListener('touchend', (e) => { e.preventDefault(); this.isJumping = false; });
  }
}
