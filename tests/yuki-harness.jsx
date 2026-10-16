import React from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter, Routes, Route} from 'react-router-dom';
import {AppProvider} from '../src/context/AppContext';
import Ask from '../src/pages/AskHerin';
import Notes from '../src/pages/Notes';
import Quiz from '../src/pages/Quiz';
import Dashboard from '../src/pages/Dashboard';
import '../src/styles/global.css';
import '../src/styles/study.css';
import '../src/styles/interface.css';
import '../src/styles/ask-herin.css';
import '../src/styles/minimalist.css';
// Only loaded by the isolated browser test, never by the application entry point.
createRoot(document.getElementById('root')).render(<AppProvider><HashRouter><Routes><Route path="/" element={<Dashboard/>}/><Route path="/ask" element={<Ask/>}/><Route path="/notes" element={<Notes/>}/><Route path="/quiz" element={<Quiz/>}/></Routes></HashRouter></AppProvider>);
