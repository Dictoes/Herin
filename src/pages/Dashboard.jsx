import {storage} from '../utils/storage';
import Deadlines from '../components/common/Deadlines';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, FileText, NotebookPen, CalendarDays, ArrowRight, CalendarPlus, UploadCloud } from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import EmptyState from '../components/common/EmptyState';
import { useApp } from '../context/AppContext';
import {
  todayClasses,
  nextClass,
  minutesUntil,
  classStatus,
  formatTime,
  DAYS,
} from '../utils/scheduleUtils';

function Countdown({ cls, daysAway, now }) {
  const mins = minutesUntil(cls, now, daysAway);
  if (mins > 180 || mins < 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return (
    <div className="countdown">
      <span className="num">{h > 0 ? `${h}h ${m}m` : `${m} min`}</span>
      <span>until start</span>
    </div>
  );
}

export default function Dashboard() {
  const { classes, pdfs, notes, now, settings, flashcards } = useApp();
  const quizSession = storage.getQuizSession();
  const today = todayClasses(classes, now);
  const upcoming = nextClass(classes, now);
  const todayLabel = DAYS[now.getDay()];
  const dateLabel = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

  const recentPdfs = pdfs.filter(p=>p.kind !== 'note').slice(0, 3);
  const noteEntries = Object.entries(notes)
    .filter(([, v]) => v.content && v.content.trim())
    .sort((a, b) => new Date(b[1].updatedAt) - new Date(a[1].updatedAt))
    .slice(0, 3);

  return (
    <AppLayout title="Dashboard" subtitle={`${todayLabel}, ${dateLabel}`}>
      <section className="welcome-banner"><div><div className="eyebrow">YOUR STUDY WORKSPACE</div><h2>{settings.displayName ? `Welcome back, ${settings.displayName}.` : 'Make room for your best work.'}</h2><p>Your classes, readings, and ideas. All in one place.</p></div><NotebookPen size={44} strokeWidth={1.2}/></section>
      <div className="stat-grid"><div className="stat-card"><CalendarDays size={19}/><strong>{today.length}</strong><span>Classes today</span></div><div className="stat-card"><FileText size={19}/><strong>{pdfs.filter(p=>p.kind !== 'note').length}</strong><span>Study materials</span></div><div className="stat-card"><NotebookPen size={19}/><strong>{Object.values(notes).filter(n=>n.content?.trim()).length}</strong><span>Saved notes</span></div></div>
      <div className="card study-overview"><h2>Your study progress</h2><p>{flashcards.filter(c=>c.reviews>0).length} of {flashcards.length} flashcards reviewed</p><p>Last quiz: {quizSession.score||0} correct · {(quizSession.index||0)+(quizSession.status?1:0)} answered</p><Link className="btn btn-secondary" to="/flashcards">Review flashcards</Link> <Link className="btn btn-secondary" to="/quiz">Continue saved quiz</Link></div>
      <div className="dash-grid">
        <div className="dashboard-main-column" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {upcoming ? (
            <div className="next-class-card">
              <div className="next-class-eyebrow">
                {upcoming.daysAway === 0 ? 'Next up today' : `Next up · ${DAYS[(now.getDay() + upcoming.daysAway) % 7]}`}
              </div>
              <div className="next-class-name">{upcoming.cls.name}</div>
              <div className="next-class-meta">
                <div>
                  <Clock size={15} /> {formatTime(upcoming.cls.startTime)} – {formatTime(upcoming.cls.endTime)}
                </div>
                {upcoming.cls.location && (
                  <div>
                    <MapPin size={15} /> {upcoming.cls.location}
                  </div>
                )}
              </div>
              {upcoming.daysAway === 0 && <Countdown cls={upcoming.cls} daysAway={0} now={now} />}
            </div>
          ) : (
            <EmptyState
              icon={CalendarPlus}
              title="No classes scheduled yet"
              description="Add your first class to see your day laid out here, with reminders before each one starts."
              action={
                <Link to="/schedule" className="btn btn-primary">
                  Add a class
                </Link>
              }
            />
          )}

          <div className="card">
            <div className="section-title">Today's classes</div>
            {today.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing on today's schedule"
                description="You have no classes scheduled for today. Make some time to review or plan ahead."
              />
            ) : (
              <div className="timeline">
                {today.map((cls, i) => {
                  const status = classStatus(cls, now, settings.reminderMinutes);
                  return (
                    <div className="timeline-item" key={cls.id}>
                      <div className="timeline-time">{formatTime(cls.startTime)}</div>
                      <div className="timeline-dot-col">
                        <div className={`timeline-dot ${status === 'live' ? 'live' : ''}`} />
                        {i < today.length - 1 && <div className="timeline-line" />}
                      </div>
                      <div className="timeline-content">
                        <div className="cls-name">{cls.name}</div>
                        <div className="cls-meta">
                          <span>
                            {formatTime(cls.startTime)} – {formatTime(cls.endTime)}
                          </span>
                          {cls.location && <span>{cls.location}</span>}
                          {status === 'live' && <span className="badge badge-live">In progress</span>}
                          {status === 'soon' && <span className="badge badge-soon">Starting soon</span>}
                          {status === 'done' && <span className="badge badge-done">Finished</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Deadlines/>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="card">
            <div className="section-title">Quick links</div>
            <div className="quick-links" style={{ gridTemplateColumns: '1fr' }}>
              <Link to="/pdfs" className="quick-link">
                <FileText size={18} className="qi" />
                <span className="qt">My PDFs</span>
                <span className="qs">{pdfs.filter(p=>p.kind !== 'note').length} file{pdfs.filter(p=>p.kind !== 'note').length === 1 ? '' : 's'}</span>
              </Link>
              <Link to="/notes" className="quick-link">
                <NotebookPen size={18} className="qi" />
                <span className="qt">Notes</span>
                <span className="qs">{noteEntries.length ? `${noteEntries.length} recent` : 'No notes yet'}</span>
              </Link>
              <Link to="/schedule" className="quick-link">
                <CalendarDays size={18} className="qi" />
                <span className="qt">Full schedule</span>
                <span className="qs">{classes.length} class{classes.length === 1 ? '' : 'es'} added</span>
              </Link>
            </div>
          </div>

          <div className="card"><div className="section-title">Continue studying</div>{noteEntries.length ? noteEntries.map(([id,n])=><Link key={id} className="recent-note" to={`/pdfs/${id}?notes=1`}><NotebookPen size={17}/><div><strong>{pdfs.find(p=>p.id===id)?.name || 'Note'}</strong><p>{n.content.slice(0,85)}</p></div><ArrowRight size={15}/></Link>) : <p className="field-hint">Your recent notes will appear here.</p>}</div>
          <div className="card">
            <div className="section-title">Recent PDFs</div>
            {recentPdfs.length === 0 ? (
              <EmptyState
                icon={UploadCloud}
                title="No files uploaded"
                description="Upload a PDF to turn it into readable notes you can highlight."
                action={
                  <Link to="/pdfs" className="btn btn-primary btn-sm">
                    Upload a PDF
                  </Link>
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentPdfs.map((p) => (
                  <Link
                    key={p.id}
                    to={`/pdfs/${p.id}`}
                    className="quick-link"
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <FileText size={16} className="qi" />
                    <span className="qt" style={{ flex: 1 }}>{p.name}</span>
                    <ArrowRight size={14} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
