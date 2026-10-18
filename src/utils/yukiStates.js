export const YUKI_ROWS = Object.freeze({
  idle:0,
  welcome:1,
  notes:2,
  thinking:3,
  explaining:3,
  quizWrong:4,
  quizCorrect:5,
});

// Reuse the original six illustrated rows; additional meanings use gentle body motion.
export const YUKI_REACTIONS = Object.freeze({
  idle:{row:0,motion:'idle',still:0,label:'resting beside your study material'},
  welcome:{row:1,motion:'greeting',still:0,label:'waving hello'},
  notes:{row:2,motion:'encouraging',still:3,label:'helping with your notes'},
  encouraging:{row:2,motion:'encouraging',still:3,label:'offering encouragement',frames:[3,2,3,3]},
  thinking:{row:3,motion:'thinking',still:0,label:'thinking',loop:true,frames:[0,1,0,1]},
  explaining:{row:3,motion:'speaking',still:2,label:'explaining your study material',frames:[2,3,2,3]},
  speaking:{row:3,motion:'speaking',still:2,label:'sharing a study tip',frames:[2,3,2,3]},
  quizWrong:{row:4,motion:'reassuring',still:3,label:'offering encouragement after an incorrect answer'},
  quizCorrect:{row:5,motion:'happy',still:3,label:'happy about your progress'},
  celebrating:{row:5,motion:'celebrating',still:2,label:'celebrating your completed quiz'},
  error:{row:4,motion:'reassuring',still:3,label:'reassuring you after a problem',frames:[0,3,3,3]},
  empty:{row:2,motion:'encouraging',still:3,label:'ready to help you get started',frames:[0,2,3,3]},
});

// Original 1774 x 887 PNG: exact 4 x 2 cells (443.5px), in reading order.
// The closed-eye frame is a quick blink, not an extended sleeping pose.
export const YUKI_IDLE_FRAMES = Object.freeze([
  {column:0,row:0,duration:1800},
  {column:1,row:0,duration:650},
  {column:2,row:0,duration:650},
  {column:3,row:0,duration:800},
  {column:0,row:1,duration:140},
  {column:1,row:1,duration:1000},
  {column:2,row:1,duration:650},
  {column:3,row:1,duration:1800},
]);

// Only the idle atlas has a compatible neutral closed-eye pose (frame 4).
// Do not substitute smiling, waving, or chin-resting reaction poses to fake a blink.
export function yukiFrameDuration(state, frame, random = Math.random) {
  if (state !== 'idle') return state === 'quizWrong' || state === 'thinking' ? 800 : 600;
  if (frame === 3) return 2500 + Math.floor(random() * 4000);
  if (frame === 4) return 110 + Math.floor(random() * 50);
  return YUKI_IDLE_FRAMES[frame].duration;
}

// Transparent row separators measured per column: the artwork crosses the
// nominal 256px grid. Preserve ears/paws without altering the supplied PNG.
export const YUKI_ROW_BOUNDS = [
  [0, 257, 510, 764, 1017, 1252, 1536],
  [0, 258, 509, 761, 1017, 1252, 1536],
  [0, 257, 509, 763, 1015, 1251, 1536],
  [0, 259, 508, 766, 1015, 1256, 1536],
];
