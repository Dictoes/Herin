import Deadlines from '../components/common/Deadlines';
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Clock, MapPin, User, Pencil, Trash2, CalendarPlus } from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/common/EmptyState';
import { useApp } from '../context/AppContext';
import {
  DAY_SHORT,
  DAYS,
  toMinutes,
  formatTime,
  classStatus,
  upcomingList,
} from '../utils/scheduleUtils';

const START_HOUR = 7;
const END_HOUR = 21;
const HOUR_HEIGHT = 52;

const EMPTY_FORM = {
  name: '',
  days: [],
  startTime: '09:00',
  endTime: '10:00',
  location: '',
  instructor: '',
  subject:'',
};

function ClassForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [error, setError] = useState('');

  const toggleDay = (i) => {
    setForm((f) => ({
      ...f,
      days: f.days.includes(i) ? f.days.filter((d) => d !== i) : [...f.days, i].sort(),
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) return setError('Give the class a name.');
    if (form.days.length === 0) return setError('Select at least one day.');
    if (!form.startTime || !form.endTime) return setError('Enter both a start and end time.');
    if (toMinutes(form.endTime) <= toMinutes(form.startTime)) {
      return setError('End time must be after the start time.');
    }
    setError('');
    onSave(form);
  };

  return (
    <Modal
      title={initial ? 'Edit class' : 'Add a class'}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {initial ? 'Save changes' : 'Add class'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="cls-name">Class name</label>
        <input
          id="cls-name"
          className="input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Organic Chemistry"
        />
      </div>

      <div className="field"><label htmlFor="cls-subject">Subject (optional)</label><input id="cls-subject" className="input" value={form.subject||''} onChange={e=>setForm({...form,subject:e.target.value})}/></div>
      <div className="field">
        <label>Days</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DAY_SHORT.map((d, i) => (
            <button
              type="button"
              key={d}
              className={`chip ${form.days.includes(i) ? 'active' : ''}`}
              onClick={() => toggleDay(i)}
              aria-pressed={form.days.includes(i)}
            >
              {d}
            </button>
          ))}
        </div>
        <span className="field-hint">Select every day this class repeats on.</span>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="cls-start">Start time</label>
          <input
            id="cls-start"
            type="time"
            className="input"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cls-end">End time</label>
          <input
            id="cls-end"
            type="time"
            className="input"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="cls-loc">Location</label>
        <input
          id="cls-loc"
          className="input"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          placeholder="e.g. Building 4, Room 210"
        />
      </div>

      <div className="field">
        <label htmlFor="cls-instr">Instructor (optional)</label>
        <input
          id="cls-instr"
          className="input"
          value={form.instructor}
          onChange={(e) => setForm({ ...form, instructor: e.target.value })}
          placeholder="e.g. Dr. Alvarez"
        />
      </div>

      {error && <p className="field-error">{error}</p>}
    </Modal>
  );
}

export default function Schedule() {
  const { classes, addClass, updateClass, deleteClass, now, settings, pushToast } = useApp();
  const [formOpen, setFormOpen] = useState(() => new URLSearchParams(location.hash.split('?')[1]).has('add'));
  const route = useLocation();
  const navigate = useNavigate();
  useEffect(()=>{if(new URLSearchParams(route.search).has('add')) {setFormOpen(true); navigate('/schedule',{replace:true});}},[route.search,navigate]);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const startHour = Math.min(START_HOUR, ...classes.map(c => Math.floor(toMinutes(c.startTime) / 60)));
  const endHour = Math.max(END_HOUR, ...classes.map(c => Math.ceil(toMinutes(c.endTime) / 60)));
  const hours = useMemo(() => {
    const arr = [];
    for (let h = startHour; h < endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  const gridTotalMinutes = (endHour - startHour) * 60;
  const gridHeight = hours.length * HOUR_HEIGHT;

  const blockStyle = (cls) => {
    const start = toMinutes(cls.startTime) - startHour * 60;
    const end = toMinutes(cls.endTime) - startHour * 60;
    const top = Math.max(0, (start / gridTotalMinutes) * gridHeight);
    const height = Math.max(22, ((end - start) / gridTotalMinutes) * gridHeight);
    return { top, height };
  };

  const upcoming = upcomingList(classes, now, 8);

  const handleSave = (form) => {
    if (editing) {
      if (!updateClass(editing.id, form)) return;
      pushToast('Class updated.', 'success');
    } else {
      if (!addClass(form)) return;
      pushToast('Class added to your schedule.', 'success');
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDeleteConfirmed = () => {
    if (!deleteClass(confirmDelete.id)) return;
    pushToast('Class removed.', 'success');
    setConfirmDelete(null);
  };

  return (
    <AppLayout
      title="My Schedule"
      subtitle="Your weekly classes at a glance"
      actions={
        <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={16} /> Add class
        </button>
      }
    >
      {classes.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="Your schedule is empty"
          description="Add your first recurring class  name, days, time, and location  and it will show up here and on your dashboard."
          action={
            <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
              <Plus size={16} /> Add your first class
            </button>
          }
        />
      ) : (
        <>
          <div className="week-scroll"><div className="week-grid" role="table" aria-label="Weekly class schedule" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="week-head-cell corner" />
            {DAY_SHORT.map((d, i) => (
              <div key={d} className={`week-head-cell ${i === now.getDay() ? 'today' : ''}`}>
                {d}
              </div>
            ))}

            <div style={{ gridColumn: '1 / 2', gridRow: `2 / span ${hours.length}` }}>
              {hours.map((h) => (
                <div key={h} className="week-hour-label" style={{ height: HOUR_HEIGHT }}>
                  {h % 12 === 0 ? 12 : h % 12}{h >= 12 ? 'PM' : 'AM'}
                </div>
              ))}
            </div>

            {DAY_SHORT.map((d, dayIdx) => (
              <div
                key={d}
                className={`week-col ${dayIdx === now.getDay() ? 'today-col' : ''}`}
                style={{ height: gridHeight, gridRow: `2 / span ${hours.length}` }}
              >
                {classes
                  .filter((c) => c.days.includes(dayIdx))
                  .map((cls) => {
                    const { top, height } = blockStyle(cls);
                    return (
                      <button
                        key={cls.id + dayIdx}
                        className="class-block"
                        style={{ top, height }}
                        onClick={() => { setEditing(cls); setFormOpen(true); }}
                        aria-label={`${cls.name}, ${formatTime(cls.startTime)} to ${formatTime(cls.endTime)}${cls.location ? ', ' + cls.location : ''}. Edit class.`}
                      >
                        <strong>{cls.name}</strong>
                        {formatTime(cls.startTime)}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>

          </div><div className="section-title">Upcoming classes</div>
          <div className="upcoming-list">
            {upcoming.map(({ cls, dayOffset, dayIndex }) => {
              const status = dayOffset === 0 ? classStatus(cls, now, settings.reminderMinutes) : 'upcoming';
              return (
                <div className="class-row" key={cls.id + dayOffset}>
                  <div className="stripe" />
                  <div className="info">
                    <div className="cn">{cls.name}</div>
                    <div className="cm">
                      <span><Clock size={13} style={{ verticalAlign: -2 }} /> {dayOffset === 0 ? 'Today' : DAYS[dayIndex]}, {formatTime(cls.startTime)} – {formatTime(cls.endTime)}</span>
                      {cls.location && <span><MapPin size={13} style={{ verticalAlign: -2 }} /> {cls.location}</span>}
                      {cls.instructor && <span><User size={13} style={{ verticalAlign: -2 }} /> {cls.instructor}</span>}
                      {status === 'live' && <span className="badge badge-live">In progress</span>}
                      {status === 'soon' && <span className="badge badge-soon">Starting soon</span>}
                    </div>
                  </div>
                  <div className="actions">
                    <button className="btn btn-ghost btn-icon" aria-label={`Edit ${cls.name}`} onClick={() => { setEditing(cls); setFormOpen(true); }}>
                      <Pencil size={15} />
                    </button>
                    <button className="btn btn-ghost btn-icon" aria-label={`Delete ${cls.name}`} onClick={() => setConfirmDelete(cls)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {formOpen && (
        <ClassForm
          initial={editing}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this class?"
          message={`"${confirmDelete.name}" will be removed from your schedule. This can't be undone.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
      <Deadlines/>
    </AppLayout>
  );
}
