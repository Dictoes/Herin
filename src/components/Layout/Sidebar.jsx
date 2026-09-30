import React from 'react';
import { NavLink } from 'react-router-dom';
import {useApp} from '../../context/AppContext';
import { LayoutDashboard, CalendarDays, FileText, NotebookPen, BookOpen, ListChecks, Settings as SettingsIcon, X } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/schedule', label: 'My Schedule', icon: CalendarDays },
  { to: '/pdfs', label: 'My PDFs', icon: FileText },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/flashcards', label: 'Flashcards', icon: BookOpen }, { to: '/quiz', label: 'Quiz', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function Sidebar({ open, onNavigate }) {
  const {pdfs,classes}=useApp();
  // Presentation of existing subject/class relationships; no new stored hierarchy.
  const subjects=new Map();
  for(const pdf of pdfs){
    const subject=pdf.subject?.trim()||classes.find(c=>c.id===pdf.classId)?.name;
    if(subject){if(!subjects.has(subject))subjects.set(subject,[]);subjects.get(subject).push(pdf);}
  }
  return (
    <>
      <nav id="main-navigation" className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}herin-logo.svg`} width="36" height="36" alt="" />
          <div><span className="name">Herin</span><span className="brand-caption">Your learning space</span></div>
          <button className="btn btn-ghost btn-icon sidebar-close" aria-label="Close navigation menu" onClick={onNavigate}><X size={20}/></button>
        </div>
        <div className="sidebar-nav">
          {NAV.map((item,index) => <React.Fragment key={item.to}>
            {index===6&&subjects.size>0&&<div className="subject-navigation"><div className="nav-group-label">Your subjects</div>{[...subjects].map(([subject,documents])=><details className="nav-subject" key={subject}><summary>{subject}<span>{documents.length}</span></summary><div className="nav-documents">{documents.map(pdf=><NavLink className={({isActive})=>`nav-document ${isActive?'active':''}`} key={pdf.id} to={`/pdfs/${pdf.id}`} onClick={onNavigate}><FileText size={15} aria-hidden="true"/><span>{pdf.name}</span></NavLink>)}</div></details>)}</div>}
            {[0,2,6].includes(index)&&<div className="nav-group-label">{index===0?'Workspace':index===2?'Study library':'Preferences'}</div>}
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
          </React.Fragment>)}
        </div>
        <div className="sidebar-foot">Your private study workspace.</div>
      </nav>
    </>
  );
}
