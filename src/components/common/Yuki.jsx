import React, {useEffect, useRef, useState} from 'react';
import {YUKI_ROWS, YUKI_ROW_BOUNDS, YUKI_IDLE_FRAMES} from '../../utils/yukiStates';

const ONCE_STATES = new Set(['welcome','notes','explaining','quizWrong','quizCorrect']);

export default function Yuki({state = 'idle', size = 'small', label, className = ''}) {
  const safeState = Object.hasOwn(YUKI_ROWS,state) ? state : 'idle';
  const [animation, setAnimation] = useState({state:safeState,frame:0});
  const element = useRef(null);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {inView=entry.isIntersecting;update();});
    if (element.current) observer?.observe(element.current);
    document.addEventListener('visibilitychange',update); update();
    return () => {observer?.disconnect();document.removeEventListener('visibilitychange',update);};
  }, []);

  useEffect(() => {setAnimation({state:safeState,frame:0});}, [safeState,reducedMotion]);
  useEffect(() => {
    if (reducedMotion || !visible) return undefined;
    const idle = animation.state === 'idle';
    const duration = idle ? YUKI_IDLE_FRAMES[animation.frame].duration : animation.state === 'quizWrong' || animation.state === 'thinking' ? 800 : 600;
    const timer = window.setTimeout(() => {
      setAnimation(current => ONCE_STATES.has(current.state) && current.frame === 3
        ? {state:'idle',frame:0}
        : {...current,frame:(current.frame + 1) % (current.state === 'idle' ? 8 : 4)});
    }, duration);
    return () => window.clearTimeout(timer);
  },[animation,visible,reducedMotion]);

  const activeState = animation.state;
  const visibleFrame = reducedMotion ? (safeState === 'quizWrong' || safeState === 'quizCorrect' ? 3 : safeState === 'explaining' ? 2 : 0) : animation.frame;
  const row = YUKI_ROWS[activeState];
  const bounds = YUKI_ROW_BOUNDS[visibleFrame % 4];
  const top = bounds[row];
  const height = bounds[row + 1] - top;
  const scale = Math.max(256, height);
  const idleFrame = YUKI_IDLE_FRAMES[visibleFrame];
  const frameStyle = activeState === 'idle' ? {
    width:'100%',height:'100%',
    backgroundImage:`url("${import.meta.env.BASE_URL}yuki-idle-sheet.png")`,
    backgroundSize:'400% 200%',
    backgroundPosition:`${idleFrame.column * 100 / 3}% ${idleFrame.row * 100}%`,
  } : {
    width:`${256 / scale * 100}%`,height:`${height / scale * 100}%`,
    backgroundImage:`url("${import.meta.env.BASE_URL}yuki-study-helper.png")`,
    backgroundSize:`400% ${1536 / height * 100}%`,
    backgroundPosition:`${visibleFrame * 100 / 3}% ${top / (1536 - height) * 100}%`,
  };

  return (
    <span
      ref={element}
      aria-label={label || `Yuki ${safeState === 'quizWrong' ? 'offering encouragement' : safeState === 'quizCorrect' ? 'celebrating' : safeState === 'thinking' ? 'thinking' : 'study companion'}`}
      role="img"
      className={`yuki yuki--${size} ${className}`.trim()}
      data-state={activeState}
      data-frame={visibleFrame}
      data-visible={visible}
    ><span className="yuki-frame" aria-hidden="true" style={frameStyle}/></span>
  );
}
