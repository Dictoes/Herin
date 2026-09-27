import React from 'react';

export default function StudyNote({ content }) {
  return <article className="study-note">{content.split(/\n\s*\n/).map((block, i) => {
    if (block.startsWith('### ')) return <h4 key={i}>{block.slice(4)}</h4>;
    if (block.startsWith('## ')) return <h3 key={i}>{block.slice(3)}</h3>;
    if (block.startsWith('# ')) return <h2 key={i}>{block.slice(2)}</h2>;
    if (block.startsWith('- ')) return <ul key={i}>{block.split('\n').map((line, j) => <li key={j}>{line.replace(/^- /, '')}</li>)}</ul>;
    return <p key={i}>{block}</p>;
  })}</article>;
}
