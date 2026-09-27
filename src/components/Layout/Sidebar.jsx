import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, FileText, NotebookPen, BookOpen, ListChecks, Settings as SettingsIcon } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/schedule', label: 'My Schedule', icon: CalendarDays },
  { to: '/pdfs', label: 'My PDFs', icon: FileText },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/flashcards', label: 'Flashcards', icon: BookOpen }, { to: '/quiz', label: 'Quiz', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function Sidebar({ open, onNavigate }) {
  return (
    <>
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}herin-logo.svg`} width="36" height="36" alt="" />
          <span className="name">Herin</span>
        </div>
        <div className="sidebar-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={19} strokeWidth={1.9} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="sidebar-foot">Your private study workspace.</div>
      </nav>
    </>
  );
}
