import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FaCalendarDays,
  FaCalendarPlus,
  FaCheck,
  FaChevronLeft,
  FaChevronRight,
  FaPen,
  FaPlus,
  FaRotateRight,
  FaTableList,
  FaTriangleExclamation,
  FaUsers,
  FaXmark,
} from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, titleCase } from '../lib/format';
import { EmptyState, Field, LoadingState, Modal, Notice, PageHeader, ProgressBar, StatusBadge } from '../components/ApiUi';
import { useAuth } from '../context/AuthContext';
import './InquiryDrawer.css';
import './Activities.css';

const activityTypes = ['orientation', 'product_tasting', 'training', 'other'];
// The three tracked milestones get their own progress chart in the read panel.
const trackedTypes = ['orientation', 'product_tasting', 'training'];

// Setting an end date and time was the slowest part of scheduling, so the admin
// picks a duration and the end time is derived from the start time.
const durationPresets = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1.5 hours' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: 'Full day' },
];

const monthNames = Array.from({ length: 12 }, (_, index) => (
  new Date(2000, index, 1).toLocaleDateString([], { month: 'long' })
));

const blankForm = () => ({
  applicant_id: '',
  activity_type: '',
  starts_at: '',
  duration_minutes: 60,
  venue: '',
  participants: [],
});

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDuration(minutes) {
  const value = Number(minutes || 0);
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** The label shown everywhere in the UI for an activity: its selected type. */
function activityLabel(activity) {
  return titleCase(activity?.activity_type || 'other');
}

/** Case-insensitive "is this name already in the list". */
function hasName(list, name) {
  const key = String(name).trim().toLowerCase();
  return list.some((item) => item.toLowerCase() === key);
}

function initialsOf(name = 'Applicant') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
}

/**
 * The one activity that goes in the "Activity assigned" column: the next
 * unstarted activity for the person, else the most recent one they hold.
 * Accomplished activities stop crowding the table (see the read panel for full
 * history).
 */
function currentActivity(group) {
  const activities = group.activities.filter((item) => item.status !== 'cancelled');
  const open = activities.filter((item) => !['completed', 'no_show'].includes(item.status));
  const now = Date.now();

  if (open.length) {
    // The first not-yet-started activity wins; fall back to the oldest pending one.
    const upcoming = open.find((item) => new Date(item.starts_at).getTime() >= now);
    return upcoming || open.reduce((earliest, item) => (
      new Date(item.starts_at) < new Date(earliest.starts_at) ? item : earliest
    ), open[0]);
  }

  return activities[activities.length - 1] || null;
}

/** Tracks status per milestone category, e.g. "Orientation done, Training —, Product tasting —". */
function typeProgress(activities) {
  return trackedTypes.map((type) => {
    const held = activities.filter((item) => item.activity_type === type && item.status !== 'cancelled');
    const done = held.find((item) => item.status === 'completed');
    const pending = held.find((item) => item.status !== 'completed');
    return {
      type,
      done: Boolean(done),
      label: titleCase(type),
      detail: done ? `Completed ${formatDate(done.completed_at || done.starts_at)}` : pending ? `Scheduled ${formatDate(pending.starts_at)}` : 'Not started',
    };
  });
}

/**
 * Shared month navigation used by both calendars: previous / next buttons,
 * a month picker, a year picker and a "Today" shortcut.
 * `cursor` is a Date set to the first day of the visible month.
 */
function CalendarNav({ cursor, onChange, compact = false }) {
  const today = new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const firstYear = Math.min(today.getFullYear() - 5, year);
  const lastYear = Math.max(today.getFullYear() + 5, year);
  const years = [];
  for (let value = firstYear; value <= lastYear; value += 1) years.push(value);

  const shift = (amount) => onChange(new Date(year, month + amount, 1));

  return (
    <div className={`cal-nav${compact ? ' is-compact' : ''}`}>
      <button type="button" className="cal-nav-btn" onClick={() => shift(-1)} aria-label="Previous month" title="Previous month">
        <FaChevronLeft aria-hidden="true" />
      </button>

      <div className="cal-nav-pickers">
        <select
          className="cal-nav-select"
          value={month}
          aria-label="Select month"
          onChange={(event) => onChange(new Date(year, Number(event.target.value), 1))}
        >
          {monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </select>
        <select
          className="cal-nav-select"
          value={year}
          aria-label="Select year"
          onChange={(event) => onChange(new Date(Number(event.target.value), month, 1))}
        >
          {years.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>

      <button type="button" className="cal-nav-btn" onClick={() => shift(1)} aria-label="Next month" title="Next month">
        <FaChevronRight aria-hidden="true" />
      </button>
      <button
        type="button"
        className="cal-nav-today"
        onClick={() => onChange(startOfMonth(new Date()))}
        disabled={isCurrentMonth}
        title="Back to this month"
      >
        Today
      </button>
    </div>
  );
}

function TypeCategoryChart({ groups }) {
  const counts = activityTypes.map((type) => ({
    type,
    label: titleCase(type),
    count: groups.reduce((sum, group) => sum + group.activities.filter((item) => item.activity_type === type && !['cancelled'].includes(item.status)).length, 0),
  }));
  const peak = Math.max(1, ...counts.map((item) => item.count));

  return (
    <section className="data-panel activity-category-panel">
      <div className="panel-title act-head">
        <div className="panel-heading-copy"><h2>Category chart</h2><span>Scheduled activities by category</span></div>
      </div>
      <div className="act-body">
        <div className="act-cat-list">
          {counts.map((item) => (
            <div className={`act-cat-row type-${item.type}`} key={item.type}>
              <span className="act-cat-fill" style={{ width: `${(item.count / peak) * 100}%` }} aria-hidden="true" />
              <span className="act-cat-label">{item.label}</span>
              <strong className="act-cat-count">{item.count}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MiniCalendar({ groups }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const today = new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Plain computation (no manual useMemo): the React Compiler memoizes this
  // automatically and rejects manual memoization it cannot preserve.
  const byDay = new Map();
  groups.forEach((group) => {
    group.activities.forEach((activity) => {
      if (activity.status === 'cancelled') return;
      const date = new Date(activity.starts_at);
      if (date.getFullYear() !== year || date.getMonth() !== month) return;
      const key = date.getDate();
      const entry = byDay.get(key) || { total: 0, done: 0 };
      entry.total += 1;
      if (['completed', 'no_show'].includes(activity.status)) entry.done += 1;
      byDay.set(key, entry);
    });
  });
  const events = byDay;

  const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  return (
    <section className="data-panel activity-calendar-panel">
      <div className="panel-title act-head">
        <div className="panel-heading-copy">
          <h2>{cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
          <span>Scheduled activities across the month</span>
        </div>
      </div>
      <div className="act-body">
      <CalendarNav cursor={cursor} onChange={setCursor} compact />
      <div className="activity-calendar" aria-label="Mini month calendar">
        {weekdayLabels.map((label, index) => <span className="activity-calendar-weekday" key={`${label}-${index}`}>{label}</span>)}
        {cells.map((day, index) => {
          if (day === null) return <span className="activity-calendar-day is-empty" key={`empty-${index}`} />;
          const entry = events.get(day);
          const isToday = isCurrentMonth && day === today.getDate();
          const classes = ['activity-calendar-day'];
          if (isToday) classes.push('is-today');
          if (entry) classes.push(entry.done >= entry.total ? 'is-completed-day' : 'is-scheduled');
          return (
            <span className={classes.join(' ')} key={day} title={entry ? `${entry.done}/${entry.total} completed` : undefined}>
              {day}
              {entry && <span className="activity-calendar-dot" aria-hidden="true" />}
            </span>
          );
        })}
      </div>
      </div>
    </section>
  );
}

const calendarEventClass = (activity) => {
  const done = ['completed', 'no_show'].includes(activity.status);
  const overdue = !done && new Date(activity.starts_at) < new Date();
  return [
    'big-calendar-event',
    `type-${activity.activity_type}`,
    done ? 'is-done' : overdue ? 'is-overdue' : '',
  ].filter(Boolean).join(' ');
};

/**
 * Shared month calendar where schedules are set. Every activity the signed-in
 * user may see lands on its day as an event chip (franchisees only see their
 * own activities — the API scopes that already).
 * Managers click a day (or its + button) to schedule on that date; clicking an
 * event opens it — edit for managers, the schedule drawer for everyone else.
 */
function BigCalendar({ groups, canManage, onAddEvent, onOpenEvent }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const today = new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Plain computation (no manual useMemo): the React Compiler memoizes this
  // automatically and rejects manual memoization it cannot preserve.
  const eventsByDay = new Map();
  groups.forEach((group) => {
    group.activities.forEach((activity) => {
      if (activity.status === 'cancelled') return;
      const date = new Date(activity.starts_at);
      if (date.getFullYear() !== year || date.getMonth() !== month) return;
      const key = date.getDate();
      const list = eventsByDay.get(key) || [];
      list.push({ ...activity, person: group.person });
      eventsByDay.set(key, list);
    });
  });
  eventsByDay.forEach((list) => list.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)));

  const monthTotal = [...eventsByDay.values()].reduce((sum, list) => sum + list.length, 0);
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const addOnDay = (day) => {
    if (!canManage) return;
    onAddEvent(new Date(year, month, day, 9, 0, 0));
  };

  return (
    <section className="data-panel big-calendar-panel">
      <div className="panel-title act-head big-calendar-title">
        <div className="panel-heading-copy">
          <h2>{cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
          <span>
            {monthTotal} {monthTotal === 1 ? 'event' : 'events'} this month · shared with everyone who can open this page
          </span>
        </div>
        <CalendarNav cursor={cursor} onChange={setCursor} />
      </div>
      <div className="act-body">
      <div className="big-calendar-scroll">
        <div className="big-calendar" aria-label="Month calendar of activities">
          {weekdayLabels.map((label, index) => <span className="big-calendar-weekday" key={`${label}-${index}`}>{label}</span>)}
          {cells.map((day, index) => {
            if (day === null) return <span className="big-calendar-day is-empty" key={`empty-${index}`} />;
            const dayEvents = eventsByDay.get(day) || [];
            const isToday = isCurrentMonth && day === today.getDate();
            return (
              <div
                className={`big-calendar-day${isToday ? ' is-today' : ''}${canManage ? ' is-clickable' : ''}`}
                key={day}
                onClick={() => addOnDay(day)}
                role={canManage ? 'button' : undefined}
                tabIndex={canManage ? 0 : undefined}
                onKeyDown={canManage ? (event) => { if (event.key === 'Enter') addOnDay(day); } : undefined}
                title={canManage ? `Schedule an activity on ${cursor.toLocaleDateString([], { month: 'long' })} ${day}` : undefined}
              >
                <div className="big-calendar-day-head">
                  <span className="big-calendar-daynum">{day}</span>
                  {canManage && (
                    <button
                      type="button"
                      className="big-calendar-add"
                      aria-label={`Schedule activity on day ${day}`}
                      onClick={(event) => { event.stopPropagation(); addOnDay(day); }}
                    >
                      <FaPlus aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="big-calendar-events">
                  {dayEvents.slice(0, 3).map((activity) => (
                    <button
                      type="button"
                      key={activity.id}
                      className={calendarEventClass(activity)}
                      title={`${activityLabel(activity)} · ${activity.person} · ${formatDate(activity.starts_at, true)}`}
                      onClick={(event) => { event.stopPropagation(); onOpenEvent(activity); }}
                    >
                      <small>{new Date(activity.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                      {activityLabel(activity)} · {activity.person}
                    </button>
                  ))}
                  {dayEvents.length > 3 && <span className="big-calendar-more">+{dayEvents.length - 3} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="big-calendar-hint">
        {canManage
          ? 'Click a day or its + button to schedule there. Click an event to edit or complete it.'
          : 'Click an event to see its schedule details.'}
      </p>
      </div>
    </section>
  );
}

/**
 * "People attending": selected names show as removable chips. The input
 * doubles as a dropdown (native datalist) of every applicant, and also accepts
 * any typed name — press Enter or comma to add it.
 */
function ParticipantPicker({ names, onChange, suggestions }) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const add = (raw) => {
    const value = String(raw || '').trim();
    setDraft('');
    if (!value || hasName(names, value)) return;
    onChange([...names, value]);
  };

  const remove = (name) => onChange(names.filter((item) => item !== name));

  const handleInput = (event) => {
    const value = event.target.value;
    // Choosing an option from the dropdown replaces the text in one go, so add
    // it immediately. Normal typing ("insertText") keeps waiting for Enter.
    const inputType = event.nativeEvent?.inputType;
    const picked = !inputType || inputType === 'insertReplacementText';
    if (picked && suggestions.some((item) => item.toLowerCase() === value.trim().toLowerCase())) {
      add(value);
      return;
    }
    setDraft(value);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault(); // keep Enter from submitting the form
      add(draft);
    } else if (event.key === 'Backspace' && !draft && names.length) {
      remove(names[names.length - 1]);
    }
  };

  const available = suggestions.filter((item) => !hasName(names, item));

  return (
    <div className="participant-picker">
      {names.length > 0 && (
        <ul className="participant-chips" aria-label="People attending">
          {names.map((name) => (
            <li key={name} className="participant-chip">
              <span>{name}</span>
              <button type="button" onClick={() => remove(name)} aria-label={`Remove ${name}`}>
                <FaXmark aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        list={listId}
        value={draft}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => add(draft)}
        placeholder="Select from the list or type a name"
        autoComplete="off"
      />
      <datalist id={listId}>
        {available.map((name) => <option key={name} value={name} />)}
      </datalist>
    </div>
  );
}

function ActivityFormFields({ form, setForm, applicants, highlightApplicant }) {
  const person = applicants?.find((item) => String(item.id) === String(form.applicant_id));

  // Picking an applicant also makes them the default attendee: the previous
  // applicant's name is swapped out and the new one is added first.
  const changeApplicant = (value) => {
    setForm((current) => {
      const previous = applicants?.find((item) => String(item.id) === String(current.applicant_id));
      const next = applicants?.find((item) => String(item.id) === String(value));
      let participants = current.participants.filter((name) => !(previous && name.toLowerCase() === previous.full_name.toLowerCase()));
      if (next && !hasName(participants, next.full_name)) participants = [next.full_name, ...participants];
      return { ...current, applicant_id: value, participants };
    });
  };

  // Applicant first, then everyone else.
  const suggestions = [
    ...(person ? [person.full_name] : []),
    ...(applicants || []).map((item) => item.full_name).filter((name) => name !== person?.full_name),
  ];

  return (
    <>
      <Field label="Applicant" full required hint={!applicants?.length ? 'No applicants are available for scheduling.' : undefined}>
        <select
          required
          className={highlightApplicant ? 'applicant-select-highlight' : undefined}
          value={form.applicant_id}
          onChange={(e) => changeApplicant(e.target.value)}
        >
          <option value="">Select applicant</option>
          {applicants?.map((applicant) => <option key={applicant.id} value={applicant.id}>{applicant.full_name}</option>)}
        </select>
      </Field>

      <Field label="Activity" required full hint="This is the activity shown in the schedule table.">
        <select
          required
          value={form.activity_type}
          onChange={(e) => setForm({ ...form, activity_type: e.target.value })}
        >
          <option value="">Select activity</option>
          {activityTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
        </select>
      </Field>

      <Field label="Starts" required full>
        <input
          required
          type="datetime-local"
          value={form.starts_at}
          onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
        />
      </Field>

      <Field label="Duration" required full hint="The end time is calculated from the start time and duration.">
        <div className="duration-presets">
          {durationPresets.map((preset) => (
            <button
              key={preset.minutes}
              type="button"
              className={`duration-preset${Number(form.duration_minutes) === preset.minutes ? ' active' : ''}`}
              onClick={() => setForm({ ...form, duration_minutes: preset.minutes })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Venue" full>
        <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Office, branch, or video-call link" />
      </Field>

      <Field
        label="People attending"
        full
        hint={person ? `${person.full_name} is added automatically. Pick more names from the list or type them.` : 'Select an applicant first, then add anyone else who is attending.'}
      >
        <ParticipantPicker
          names={form.participants}
          suggestions={suggestions}
          onChange={(participants) => setForm((current) => ({ ...current, participants }))}
        />
      </Field>
    </>
  );
}

export default function Activities() {
  const { role, user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [highlightApplicant, setHighlightApplicant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [completing, setCompleting] = useState(null);
  const [resultNotes, setResultNotes] = useState('');
  // 'table' (data panel) | 'calendar' (set schedules) | 'people' (mini calendar + category chart)
  const [view, setView] = useState('table');

  // Read panel (slides from the right, same style as Leads & inquiries).
  const [selectedKey, setSelectedKey] = useState(null);
  const lastSelected = useRef(null);

  const remote = useRemote(async () => {
    const [groups, applicants] = await Promise.all([
      api.get('/activities/grouped'),
      ['admin', 'sales'].includes(role) ? api.get('/applicants', { per_page: 100 }) : Promise.resolve({ data: [] }),
    ]);
    return { groups: groups.data, applicants: applicants.data };
  }, [role]);

  const groups = remote.data?.groups || [];
  const applicants = remote.data?.applicants || [];

  const currentGroups = useMemo(() => groups.map((group) => ({ ...group, current: currentActivity(group) })), [groups]);

  const selectedGroup = selectedKey ? currentGroups.find((group) => group.person === selectedKey) || null : null;
  const shownGroup = selectedGroup || lastSelected.current;
  const closeDetails = () => setSelectedKey(null);

  const shown = shownGroup;
  if (selectedGroup) lastSelected.current = selectedGroup;

  const canManage = ['admin', 'sales'].includes(role);

  /**
   * Opens the Schedule activity modal.
   * - `startDate`: pre-fills the start (calendar day click).
   * - `applicant`: { id, name } pre-selects that person ("Set Again") and
   *   makes the Applicant dropdown blink, then stay highlighted.
   */
  const openCreate = (startDate = null, applicant = null) => {
    setActionError('');
    setSuccess('');
    setEditing(null);
    setForm({
      ...blankForm(),
      applicant_id: applicant ? String(applicant.id ?? '') : '',
      participants: applicant?.name ? [applicant.name] : [],
      starts_at: startDate ? toLocalInput(startDate) : '',
    });
    setHighlightApplicant(Boolean(applicant));
    setShowCreate(true);
  };

  // "Set Again": same modal as Schedule activity, applicant already chosen.
  const setAgain = (group, activity) => {
    const applicantId = activity.applicant_id ?? activity.applicant?.id ?? '';
    const name = activity.applicant?.full_name
      || applicants.find((item) => String(item.id) === String(applicantId))?.full_name
      || group.person;
    openCreate(null, { id: applicantId, name });
  };

  const closeForm = () => {
    setShowCreate(false);
    setEditing(null);
    setHighlightApplicant(false);
  };

  const openEdit = (activity) => {
    setActionError('');
    setSuccess('');
    setHighlightApplicant(false);
    setEditing(activity);
    setForm({
      ...blankForm(),
      applicant_id: String(activity.applicant_id ?? ''),
      activity_type: activity.activity_type || '',
      starts_at: toLocalInput(activity.starts_at),
      duration_minutes: activity.duration_minutes || diffMinutes(activity),
      venue: activity.venue || '',
      participants: [...(activity.participants || [])],
    });
  };

  const submitActivity = async (event) => {
    event.preventDefault();
    if (!form.activity_type) {
      setActionError('Select an activity.');
      return;
    }
    setSaving(true);
    setActionError('');
    setSuccess('');
    const applicant = applicants.find((item) => String(item.id) === String(form.applicant_id));
    const duration = Number(form.duration_minutes) || 60;
    const startsAt = new Date(form.starts_at);

    // The title is no longer typed by hand. It is generated from the selected
    // activity (the table shows the activity type, not this string). The date
    // keeps it unique when the same activity is set again for the same person.
    const title = `${titleCase(form.activity_type)} — ${applicant?.full_name || 'Applicant'} (${form.starts_at.slice(0, 10)})`;

    const payload = {
      applicant_id: Number(form.applicant_id),
      activity_type: form.activity_type,
      title,
      starts_at: startsAt.toISOString(),
      duration_minutes: duration,
      venue: form.venue || null,
      participants: form.participants,
    };

    try {
      if (editing) {
        await api.put(`/activities/${editing.id}`, payload);
        setSuccess('Activity updated successfully.');
      } else {
        await api.post('/activities', payload);
        setSuccess('Activity scheduled successfully.');
      }
      closeForm();
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const completeActivity = async (event) => {
    event.preventDefault();
    if (!completing) return;
    setSaving(true);
    setActionError('');
    setSuccess('');
    try {
      await api.post(`/activities/${completing.id}/complete`, {
        result_notes: resultNotes.trim(),
        status: 'completed',
      });
      setCompleting(null);
      setResultNotes('');
      setSuccess('Activity marked as completed — the applicant tracker is updated automatically.');
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const totalActivities = groups.reduce((sum, group) => sum + group.total, 0);
  const currentKey = selectedGroup?.person || null;

  // Clicking a calendar event: managers jump straight to editing it; everyone
  // else (franchisees) opens the read-only schedule drawer for that person.
  const openEventFromCalendar = (activity) => {
    if (canManage) {
      openEdit(activity);
      return;
    }
    setSelectedKey(activity.person || activity.applicant?.full_name || null);
  };

  // The read panel is anchored to a table row, so close it when leaving the table view.
  const changeView = (next) => {
    if (next !== 'table' && next !== view) setSelectedKey(null);
    setView(next);
  };

  // Keeps the curved pointer level with the selected row while the panel is open.
  const drawerRef = useRef(null);
  const prevSelectedRef = useRef(null);
  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return undefined;
    if (!selectedKey) {
      prevSelectedRef.current = null;
      return undefined;
    }

    const place = () => {
      const row = document.querySelector(`tr[data-activity-person="${CSS.escape(selectedKey)}"]`);
      if (!row) {
        drawer.style.setProperty('--pointer-opacity', '0');
        return;
      }
      const rowRect = row.getBoundingClientRect();
      const drawerRect = drawer.getBoundingClientRect();
      const centerInViewport = rowRect.top + rowRect.height / 2;
      const visible = centerInViewport >= 90 && centerInViewport <= window.innerHeight - 30;
      drawer.style.setProperty('--pointer-y', `${centerInViewport - drawerRect.top}px`);
      drawer.style.setProperty('--pointer-opacity', visible ? '1' : '0');
    };

    const switching = prevSelectedRef.current !== null && prevSelectedRef.current !== selectedKey;
    prevSelectedRef.current = selectedKey;
    drawer.classList.toggle('pointer-animate', switching);
    place();
    const timer = switching ? setTimeout(() => drawer.classList.remove('pointer-animate'), 450) : 0;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (observer) observer.observe(document.body);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (observer) observer.disconnect();
    };
  }, [selectedKey, remote.data, view]);

  useEffect(() => {
    if (!selectedKey) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !showCreate && !editing && !completing) setSelectedKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey, showCreate, editing, completing]);

  const applicantName = shown?.activities?.[0]?.applicant?.full_name || shown?.person || 'Applicant';
  const progress = shown ? typeProgress(shown.activities) : [];
  const progressDone = progress.filter((item) => item.done).length;

  return (
    <div className="page-container activities-page">
      <PageHeader
        title="Activities & schedules"
        actions={(
          <>
            {canManage && (
              <button className="primary-button" onClick={() => openCreate()}>
                <FaCalendarPlus /> Schedule activity
              </button>
            )}
          </>
        )}
      />
      <Notice type="success">{success}</Notice>
      <Notice type="error">{actionError || remote.error}</Notice>

      <div className="activity-view-toggle" role="group" aria-label="Schedule view">
        <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => changeView('table')} aria-pressed={view === 'table'}>
          <FaTableList aria-hidden="true" /> Table
        </button>
        <button type="button" className={view === 'calendar' ? 'active' : ''} onClick={() => changeView('calendar')} aria-pressed={view === 'calendar'}>
          <FaCalendarDays aria-hidden="true" /> Calendar
        </button>
        <button type="button" className={view === 'people' ? 'active' : ''} onClick={() => changeView('people')} aria-pressed={view === 'people'}>
          <FaUsers aria-hidden="true" /> Per person
        </button>
      </div>

      {view === 'table' && (
        <section className="data-panel">
          <div className="panel-title">
            <div className="panel-heading-copy">
              <h2>Schedule per person</h2>
              <span>{groups.length} {groups.length === 1 ? 'person' : 'people'} · {totalActivities} scheduled {totalActivities === 1 ? 'activity' : 'activities'}</span>
            </div>
          </div>

          {remote.loading ? <LoadingState /> : !currentGroups.length ? (
            <EmptyState label="No activities are scheduled." detail="Create an activity to coordinate the next applicant touchpoint." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th><th>Activity assigned</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentGroups.map((group) => {
                    const activity = group.current;
                    const overdue = activity
                      && activity.status !== 'completed'
                      && activity.status !== 'no_show'
                      && new Date(activity.starts_at) < new Date();
                    const accomplished = activity?.status === 'completed';
                    return (
                      <tr
                        key={group.person}
                        data-activity-person={group.person}
                        className={`inquiry-row${currentKey === group.person ? ' is-selected' : ''}`}
                        tabIndex={0}
                        onClick={() => setSelectedKey((current) => (current === group.person ? null : group.person))}
                        onKeyDown={(event) => { if (event.key === 'Enter') setSelectedKey(group.person); }}
                      >
                        <td>
                          <span className="person-row-name">
                            <strong>{group.person}</strong>
                            <small>{group.total} {group.total === 1 ? 'activity' : 'activities'}</small>
                          </span>
                        </td>
                        <td>
                          {activity ? (
                            <span
                              className={`activity-chip${accomplished ? ' is-completed' : ''}${overdue ? ' is-overdue' : ''}`}
                              title={`${formatDate(activity.starts_at, true)} · ${formatDuration(activity.duration_minutes)}`}
                            >
                              {accomplished ? <FaCheck aria-hidden="true" /> : overdue ? <FaTriangleExclamation aria-hidden="true" /> : <FaCalendarDays aria-hidden="true" />}
                              {activityLabel(activity)}
                              <small>{formatDate(activity.starts_at)}</small>
                            </span>
                          ) : (
                            <span className="muted-note">Nothing scheduled</span>
                          )}
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="row-actions">
                            {canManage && activity && (
                              accomplished ? (
                                <button type="button" className="primary-button set-again-button" onClick={() => setAgain(group, activity)}>
                                  <FaRotateRight aria-hidden="true" /> Set Again
                                </button>
                              ) : (
                                <>
                                  <button onClick={() => openEdit(activity)}><FaPen /> Edit</button>
                                  {!['cancelled', 'no_show'].includes(activity.status) && (
                                    <button onClick={() => { setActionError(''); setCompleting(activity); }}>Complete</button>
                                  )}
                                </>
                              )
                            )}
                            {!canManage && activity && (
                              <span className="muted-note">{formatDate(activity.starts_at, true)}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {view === 'calendar' && (
        <BigCalendar
          groups={currentGroups}
          canManage={canManage}
          onAddEvent={(date) => openCreate(date)}
          onOpenEvent={openEventFromCalendar}
        />
      )}

      {view === 'people' && (
        <div className="content-grid two-columns activity-people-grid">
          <MiniCalendar groups={currentGroups} />
          <TypeCategoryChart groups={currentGroups} />
        </div>
      )}

      {(showCreate || editing) && createPortal(
        <div className="activities-page activities-modal-root">
        <Modal
          title={editing ? `Edit ${activityLabel(editing)}` : 'Schedule activity'}
          onClose={closeForm}
          footer={(
            <>
              <button onClick={closeForm}>Cancel</button>
              <button className="primary-button" form="activity-form" disabled={saving || !applicants.length}>
                {saving ? 'Saving…' : editing ? 'Save activity' : 'Schedule activity'}
              </button>
            </>
          )}
        >
          <Notice type="error">{actionError}</Notice>
          <form id="activity-form" className="form-grid" onSubmit={submitActivity}>
            <ActivityFormFields form={form} setForm={setForm} applicants={applicants} highlightApplicant={highlightApplicant} />
          </form>
        </Modal>
        </div>,
        document.body,
      )}

      {completing && createPortal(
        <div className="activities-page activities-modal-root">
        <Modal
          title={`Complete “${activityLabel(completing)}”`}
          onClose={() => setCompleting(null)}
          size="small"
          footer={(
            <>
              <button onClick={() => setCompleting(null)}>Cancel</button>
              <button className="primary-button" form="complete-activity-form" disabled={saving}>
                {saving ? 'Saving…' : 'Mark completed'}
              </button>
            </>
          )}
        >
          <Notice type="error">{actionError}</Notice>
          <form id="complete-activity-form" onSubmit={completeActivity}>
            <Field label="Result notes" full required hint="Record the outcome so the next team member has clear context.">
              <textarea
                required
                minLength="3"
                value={resultNotes}
                onChange={(e) => setResultNotes(e.target.value)}
                placeholder="Summarize attendance, feedback, and next steps."
              />
            </Field>
          </form>
        </Modal>
        </div>,
        document.body,
      )}

      {/* Read panel: same slide-from-right behavior as Leads & inquiries */}
      <aside
        ref={drawerRef}
        className={`inquiry-drawer${selectedGroup ? ' open' : ''}`}
        aria-label="Applicant schedule details"
        aria-hidden={!selectedGroup}
      >
        <span className="drawer-pointer" aria-hidden="true">
          <svg width="16" height="48" viewBox="0 0 16 48">
            <path className="pointer-fill" d="M15.5 0 C15.5 10 1.5 10 1.5 24 C1.5 38 15.5 38 15.5 48 L16 48 L16 0 Z" />
            <path className="pointer-line" d="M15.5 0 C15.5 10 1.5 10 1.5 24 C1.5 38 15.5 38 15.5 48" />
          </svg>
        </span>
        <button type="button" className="drawer-toggle" onClick={closeDetails} aria-label="Close details" title="Close (Esc)">
          <FaXmark />
        </button>
        {shown && (
          <>
            <header className="drawer-head">
              <span className="drawer-avatar" aria-hidden="true">{initialsOf(applicantName)}</span>
              <div>
                <h2>{applicantName}</h2>
                <p>{shown.total} scheduled {shown.total === 1 ? 'activity' : 'activities'} · {progressDone}/{trackedTypes.length} milestones done</p>
              </div>
            </header>
            <div className="drawer-body">
              <section>
                <h3>Schedule progress</h3>
                <ProgressBar percent={Math.round((progressDone / trackedTypes.length) * 100)} state={progressDone === trackedTypes.length ? 'complete' : 'in_progress'} label="Activity milestones" detail={`${progressDone}/${trackedTypes.length}`} />
                <ul className="drawer-progress-list">
                  {progress.map((item) => (
                    <li key={item.type} className={item.done ? 'is-done' : ''}>
                      <span className="drawer-progress-icon">{item.done ? <FaCheck aria-hidden="true" /> : <FaCalendarDays aria-hidden="true" />}</span>
                      <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>All activities</h3>
                <ul className="drawer-activity-list">
                  {shown.activities.map((activity) => (
                    <li key={activity.id}>
                      <div className="drawer-activity-top">
                        <strong>{activityLabel(activity)}</strong>
                        <StatusBadge value={activity.status === 'no_show' ? 'no show' : activity.status} />
                      </div>
                      <small>{formatDate(activity.starts_at, true)} · {formatDuration(activity.duration_minutes)}{activity.venue ? ` · ${activity.venue}` : ''}</small>
                      {activity.result_notes && <p>{activity.result_notes}</p>}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Attendees</h3>
                <div className="drawer-attendees">
                  <FaUsers aria-hidden="true" />
                  <span>{[...new Set(shown.activities.flatMap((activity) => {
                    const names = [...(activity.participants || [])];
                    if (activity.assigned_to?.full_name) names.push(activity.assigned_to.full_name);
                    return names;
                  }))].join(', ') || 'Applicant only'}</span>
                </div>
              </section>
            </div>
          </>
        )}
      </aside>

      {view === 'table' && (
        <p className="muted-note activities-footnote">
          <FaUsers aria-hidden="true" /> Click a person to open their schedule panel. Completing an
          activity instantly checks the matching milestone on the applicant's pipeline tracker
          ({user ? titleCase(role) : 'staff'} schedule view).
        </p>
      )}
    </div>
  );
}

function diffMinutes(activity) {
  const start = new Date(activity.starts_at).getTime();
  const end = new Date(activity.ends_at).getTime();
  const minutes = Math.round((end - start) / 60000);
  return minutes > 0 ? minutes : 60;
}

function toLocalInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
