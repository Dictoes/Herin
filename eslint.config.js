import globals from 'globals';
export default [
  {ignores:['dist/**','node_modules/**','tests/historical/**','src/utils/flashcardUtils.backup.js']},
  {files:['src/**/*.{js,jsx}','supabase/functions/**/*.js','tests/ai-study.test.js'],languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},rules:{'no-undef':'error','no-unreachable':'error','no-dupe-args':'error','no-dupe-keys':'error','valid-typeof':'error','no-constant-condition':['error',{checkLoops:false}]}},
];
