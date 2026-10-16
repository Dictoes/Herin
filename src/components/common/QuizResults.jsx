import React, {useRef, useState} from 'react';
import {ArrowUp} from 'lucide-react';
import {Link} from 'react-router-dom';
import Yuki from './Yuki';

export default function QuizResults({questions, session, onReset}) {
  const [incorrectOnly, setIncorrectOnly] = useState(false);
  const resultsRef = useRef(null);
  function backToTop() {
    const target = resultsRef.current?.closest('.main-area')?.querySelector('h1') || resultsRef.current;
    if (!target) return;
    target.setAttribute('tabindex', '-1');
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'start', behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  const visible = questions.map((item, index) => ({item, index}))
    .filter(({item}) => !incorrectOnly || session.answers?.[item.id] === false);
  return <section ref={resultsRef} className="card quiz-card quiz-results">
    <span className="badge badge-live">Session complete</span>
    <div className="quiz-yuki-response">
      <Yuki state="quizCorrect" size="medium"/>
      <div><h2>{session.score || 0} of {questions.length} correct</h2>
        <p>{session.score === questions.length ? 'Well done! Take a moment to appreciate what you learned.' : "Every attempt helps you grow. Let's review the tricky ones together."}</p>
      </div>
    </div>
    <button className="btn btn-primary" onClick={onReset}>Practice again</button>
    <details className="quiz-review-dropdown">
    <summary>Review your answers ({questions.length})</summary>
    <div className="quiz-review-heading">
      <label><input type="checkbox" checked={incorrectOnly} onChange={e=>setIncorrectOnly(e.target.checked)}/> Incorrect only</label>
    </div>
    {!visible.length && <p>No incorrect answers to review.</p>}
    <ol className="quiz-review-list">
      {visible.map(({item,index}) => {
        const correct = session.answers?.[item.id];
        return <li key={item.id} value={index+1} className="quiz-review-item">
          <span className="badge">{correct === true ? 'Correct' : correct === false ? 'Incorrect' : 'Result not saved'}</span>
          <h4>{item.question}</h4>
          <p><strong>Your answer:</strong> {session.responses?.[item.id] ?? 'Not saved for this older session.'}</p>
          <p><strong>Correct answer:</strong> {item.correctAnswer}</p>
          {item.explanation && <p>{item.explanation}</p>}
          {item.pdfId && <Link to={`/pdfs/${item.pdfId}?page=${item.sourcePage || 1}`}>Review source{item.sourcePage ? ` (page ${item.sourcePage})` : ''}</Link>}
        </li>;
      })}
    </ol>
    <button type="button" className="btn btn-secondary quiz-back-top" onClick={backToTop}><ArrowUp size={16} aria-hidden="true"/> Back to top</button>
    </details>
  </section>;
}
