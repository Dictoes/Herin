import React from 'react';
import '../../styles/share.css';
export default function SharedStudyContent({snapshot}) {
 return <div className="shared-content">
 {snapshot.text&&<section className="card"><h2>Study notes</h2><div className="shared-text">{snapshot.text}</div></section>}
 {['flashcards','quizzes'].map(kind=>snapshot[kind]?.length>0&&<section className="card" key={kind}><h2>{kind==='flashcards'?'Flashcards':'Quiz preview'} <span className="badge">{snapshot[kind].length}</span></h2>{snapshot[kind].map((item,index)=><article className="shared-question" key={index}><h3>{index+1}. {item.question}</h3>{item.options.length>0&&<ol type="A">{item.options.map((option,i)=><li key={i}>{option}</li>)}</ol>}<details><summary>{kind==='flashcards'?'Reveal answer':'View answer & explanation'}</summary><p className="shared-text">{item.answer}</p>{item.explanation&&<p className="shared-text">{item.explanation}</p>}</details></article>)}</section>)}
 </div>;
}
