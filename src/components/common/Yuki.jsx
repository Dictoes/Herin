import React, {useEffect, useState} from 'react';
import {YUKI_ROWS, YUKI_ROW_BOUNDS} from '../../utils/yukiStates';

const ONCE_STATES = new Set(['welcome','notes','explaining','quizWrong','quizCorrect']);

export default function Yuki({state = 'idle', size = 'small', label, className = ''}) {
  const [frame, setFrame] = useState(0);
  const [finished, setFinished] = useState(false);
  const safeState = Object.hasOwn(YUKI_ROWS,state) ? state : 'idle';
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setFrame(0);
    setFinished(false);
    if (reducedMotion || safeState === 'idle') return undefined;
    let step = 0;
    const duration = safeState === 'quizWrong' ? 3200 : ONCE_STATES.has(safeState) ? 2400 : 3200;
    const timer = window.setInterval(() => {
      step += 1;
      if (ONCE_STATES.has(safeState) && step === 4) {
        window.clearInterval(timer);
        setFinished(true);
        setFrame(0);
      } else setFrame(step % 4);
    }, duration / 4);
    return () => window.clearInterval(timer);
  },[safeState,reducedMotion]);

  const activeState = finished ? 'idle' : safeState;
  const visibleFrame = reducedMotion ? (safeState === 'quizWrong' || safeState === 'quizCorrect' ? 3 : safeState === 'explaining' ? 2 : 0) : frame;
  const row = YUKI_ROWS[activeState];
  const bounds = YUKI_ROW_BOUNDS[visibleFrame];
  const top = bounds[row];
  const height = bounds[row + 1] - top;
  const scale = Math.max(256, height);

  return (
    <span
      aria-label={label || `Yuki ${safeState === 'quizWrong' ? 'offering encouragement' : safeState === 'quizCorrect' ? 'celebrating' : safeState === 'thinking' ? 'thinking' : 'study companion'}`}
      role="img"
      className={`yuki yuki--${size} ${className}`.trim()}
      data-state={activeState}
      data-frame={visibleFrame}
    ><span className="yuki-frame" aria-hidden="true" style={{
      width:`${256 / scale * 100}%`,height:`${height / scale * 100}%`,
      backgroundImage:`url("${import.meta.env.BASE_URL}yuki-study-helper.png")`,
      backgroundSize:`400% ${1536 / height * 100}%`,
      backgroundPosition:`${visibleFrame * 100 / 3}% ${top / (1536 - height) * 100}%`,
    }}/></span>
  );
}
