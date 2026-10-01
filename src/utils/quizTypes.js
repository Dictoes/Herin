export const quizTypeOptions = [
  {value:'all',label:'All question types'},
  {value:'multiple',label:'Multiple choice'},
  {value:'identification',label:'Identification'},
  {value:'enumeration',label:'Enumeration'},
  {value:'true-false',label:'True or false'},
  {value:'application',label:'Understanding'}
];

export const quizTypeLabels = Object.fromEntries(
  quizTypeOptions.filter(option=>option.value!=='all').map(({value,label})=>[value,label])
);
