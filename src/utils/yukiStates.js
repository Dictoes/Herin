export const YUKI_ROWS = Object.freeze({
  idle:0,
  welcome:1,
  notes:2,
  thinking:3,
  explaining:3,
  quizWrong:4,
  quizCorrect:5,
});

// Transparent row separators measured per column: the artwork crosses the
// nominal 256px grid. Preserve ears/paws without altering the supplied PNG.
export const YUKI_ROW_BOUNDS = [
  [0, 257, 510, 764, 1017, 1252, 1536],
  [0, 258, 509, 761, 1017, 1252, 1536],
  [0, 257, 509, 763, 1015, 1251, 1536],
  [0, 259, 508, 766, 1015, 1256, 1536],
];
