import React, { lazy, Suspense } from 'react';
import SharedStudy from './pages/SharedStudy';
import InfoPage from './pages/InfoPage';
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

function Workspace() {
  return (
    <AuthProvider><AppProvider>
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
    </AppProvider></AuthProvider>
  );
}

export default function App() {
  return <HashRouter><Routes><Route path="/share/:shareId" element={<SharedStudy />} /><Route path="/guide" element={<InfoPage />} /><Route path="/privacy" element={<InfoPage privacy />} /><Route path="*" element={<Workspace />} /></Routes></HashRouter>;
}
