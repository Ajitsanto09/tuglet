import { useEffect, useRef, useState } from 'react';
import { buildCharacter } from '../shared/pip';
import { COMPLETE_THRESHOLD_PX, PullTracker, SNOOZE_THRESHOLD_PX, type PullAction } from '../domain/gesture';

const describe = (a: PullAction) => (a === 'complete' ? 'Complete' : a === 'snooze' ? 'Snooze' : 'Nothing (cancel)');

/** Practice area: uses the real pull rules but never changes reminders. */
export function PullPreview() {
  const pipRef = useRef<HTMLDivElement>(null);
  const tracker = useRef(new PullTracker());
  const [stretch, setStretch] = useState(0);
  const [armed, setArmed] = useState<PullAction>(null);
  const [result, setResult] = useState('Drag the star down and let go.');

  useEffect(() => {
    const node = pipRef.current;
    if (node && !node.firstChild) node.append(buildCharacter());
  }, []);

  return (
    <div className="preview">
      <div className="preview-stage">
        <div className="preview-rope" style={{ height: 14 + stretch * 0.5 }} />
        <div
          ref={pipRef}
          className="preview-pip"
          aria-hidden="true"
          onPointerDown={(e) => { tracker.current.start(e.pointerId, e.clientY); e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { const m = tracker.current.move(e.pointerId, e.clientY); if (m) { setStretch(m.stretch); setArmed(m.armed); } }}
          onPointerUp={(e) => {
            const a = tracker.current.end(e.pointerId, e.clientY);
            if (a === undefined) return;
            setStretch(0); setArmed(null);
            setResult(`That pull would: ${describe(a)}. (Practice only.)`);
          }}
          onPointerCancel={() => { tracker.current.cancel(); setStretch(0); setArmed(null); setResult('Cancelled.'); }}
        />
      </div>
      <p className="muted" aria-live="polite">{armed !== null || stretch ? `Release now to: ${describe(armed)}` : result}</p>
      <ul className="muted small">
        <li>Under {SNOOZE_THRESHOLD_PX} px: nothing happens.</li>
        <li>{SNOOZE_THRESHOLD_PX}–{COMPLETE_THRESHOLD_PX - 1} px: snooze.</li>
        <li>{COMPLETE_THRESHOLD_PX} px or more: complete (Undo for 10 s).</li>
        <li>Prefer buttons? Snooze and Complete buttons always sit next to the character.</li>
      </ul>
    </div>
  );
}
