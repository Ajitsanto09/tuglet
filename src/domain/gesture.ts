/** Downward displacement (CSS px from pointer-down) needed to snooze on release. */
export const SNOOZE_THRESHOLD_PX = 24;
/** Downward displacement needed to complete on release. */
export const COMPLETE_THRESHOLD_PX = 120;
/** Visual stretch is clamped here; classification uses the raw displacement. */
export const MAX_STRETCH_PX = 180;

export type PullAction = 'snooze' | 'complete' | null;

export function classifyPull(dy: number): PullAction {
  if (!(dy >= SNOOZE_THRESHOLD_PX)) return null; // also rejects NaN
  return dy >= COMPLETE_THRESHOLD_PX ? 'complete' : 'snooze';
}

export const visualStretch = (dy: number) => Math.min(MAX_STRETCH_PX, Math.max(0, dy));

/** Tracks one pointer's pull. Only the final release position decides the action. */
export class PullTracker {
  private pointerId: number | null = null;
  private startY = 0;

  get active() { return this.pointerId !== null; }

  start(pointerId: number, y: number) {
    this.pointerId = pointerId;
    this.startY = y;
  }

  move(pointerId: number, y: number): { dy: number; stretch: number; armed: PullAction } | null {
    if (pointerId !== this.pointerId) return null;
    const dy = y - this.startY;
    return { dy, stretch: visualStretch(dy), armed: classifyPull(dy) };
  }

  /** Returns the action, or `undefined` when this pointer is not the tracked one. */
  end(pointerId: number, y: number): PullAction | undefined {
    if (pointerId !== this.pointerId) return undefined;
    this.pointerId = null;
    return classifyPull(y - this.startY);
  }

  cancel() { this.pointerId = null; }
}
