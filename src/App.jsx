import React, { lazy, Suspense } from 'react';
import AuthProvider from './context/AuthContext';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
const PDFLibrary = lazy(() => import('./pages/PDFLibrary'));
const PDFViewer = lazy(() => import('./pages/PDFViewer'));
import Notes from './pages/Notes';
import Settings from './pages/Settings';
import Flashcards from './pages/Flashcards'; import Quiz from './pages/Quiz';

export default function App() {
  return (
    <AuthProvider><AppProvider>
      <HashRouter>
        <Suspense fallback={<div className="page-content" role="status">Loading your workspace…</div>}><Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/pdfs" element={<PDFLibrary />} />
          <Route path="/pdfs/:id" element={<PDFViewer />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/flashcards" element={<Flashcards />} /><Route path="/quiz" element={<Quiz />} />
          <Route path="*" element={<Dashboard />} />
        </Routes></Suspense>
      </HashRouter>
    </AppProvider></AuthProvider>
  );
}
