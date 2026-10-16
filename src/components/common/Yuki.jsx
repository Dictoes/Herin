import React, {useEffect, useState} from 'react';
import {YUKI_ROWS} from '../../utils/yukiStates';

const ONCE_STATES = new Set(['welcome','quizWrong','quizCorrect']);

export default function Yuki({state = 'idle', size = 'small', label, className = ''}) {
  const [frame, setFrame] = useState(0);
  const safeState = Object.hasOwn(YUKI_ROWS,state) ? state : 'idle';
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    setFrame(0);
    if (reducedMotion || safeState === 'explaining' || safeState === 'notes' || safeState === 'idle') return undefined;
    const duration = ONCE_STATES.has(safeState) ? 1450 : 800;
    const timer = window.setInterval(() => {
      setFrame(current => {
        if (!ONCE_STATES.has(safeState)) return (current + 1) % 4;
        if (current >= 3) {
          window.clearInterval(timer);
          return 3;
        }
        return current + 1;
      });
    }, duration / 4);
    return () => window.clearInterval(timer);
  },[safeState,reducedMotion]);

  return (
    <span
      aria-label={label || `Yuki ${safeState === 'quizWrong' ? 'offering encouragement' : safeState === 'quizCorrect' ? 'celebrating' : safeState === 'thinking' ? 'thinking' : 'study companion'}`}
      role="img"
      className={`yuki yuki--${size} ${className}`.trim()}
      data-state={safeState}
      data-frame={reducedMotion ? 1 : frame}
      style={{'--yuki-row':YUKI_ROWS[safeState],'--yuki-frame':reducedMotion ? 1 : frame,'--yuki-image':`url("${import.meta.env.BASE_URL}yuki-study-helper.png")`}}
    />
  );
}
