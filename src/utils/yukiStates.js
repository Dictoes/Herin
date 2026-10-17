export const YUKI_ROWS = Object.freeze({
  idle:0,
  welcome:1,
  notes:2,
  thinking:3,
  explaining:3,
  quizWrong:4,
  quizCorrect:5,
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

// Transparent row separators measured per column: the artwork crosses the
// nominal 256px grid. Preserve ears/paws without altering the supplied PNG.
export const YUKI_ROW_BOUNDS = [
  [0, 257, 510, 764, 1017, 1252, 1536],
  [0, 258, 509, 761, 1017, 1252, 1536],
  [0, 257, 509, 763, 1015, 1251, 1536],
  [0, 259, 508, 766, 1015, 1256, 1536],
];
