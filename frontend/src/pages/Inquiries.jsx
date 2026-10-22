import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaPlus, FaRightLeft, FaRotateLeft, FaBoxArchive, FaChevronRight, FaTriangleExclamation, FaXmark, FaPen } from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, titleCase } from '../lib/format';
import { EmptyState, Field, LoadingState, Modal, Notice, PageHeader, StatusBadge } from '../components/ApiUi';
import { useAuth } from '../context/AuthContext';
import { brandColor } from '../lib/brandColors';
import './InquiryDrawer.css';

const initialForm = {
  first_name: '',
  last_name: '',
  source: 'facebook',
  source_other: '', // custom text kapag "Others"
  email: '',
  phone: '',
  viber_number: '',
  preferred_brand_id: '', // shown to users as "Concept"
  current_city: '',
  preferred_franchise_location: '',
  remarks: '',
};

const sourceOptions = ['facebook', 'gmail', 'viber', 'walk_in', 'referral', 'others'];

// ---- Pagination settings ----
const PAGE_SIZE = 8;   // records per page
const PAGE_WINDOW = 4; // page numbers visible at a time

const PHONE_LENGTH = 11;
// Numbers lang, hanggang 11 digits.
const digitsOnly = (value) => String(value || '').replace(/\D/g, '').slice(0, PHONE_LENGTH);

/**
 * Renders a modal straight into <body>.
 *
 * Why: when a modal lives inside the page, any ancestor with transform / filter /
 * backdrop-filter / animation (or an inner scroll container) becomes the reference for
 * `position: fixed`. The modal then scrolls away with the page and lands at the bottom
 * instead of staying centered in the viewport. Portaling it to <body> avoids all of that.
 *
 * The wrapper keeps the `page-container` class (so page-scoped CSS rules still match) and
 * uses `display: contents`, so it creates no box of its own and cannot affect the layout.
 */
function ModalPortal({ children }) {
  return createPortal(
    <div className="page-container modal-portal-root" style={{ display: 'contents' }}>
      {children}
    </div>,
    document.body,
  );
}

// Phone input: hindi makakapag-type ng letters/symbols, hindi lalampas ng 11 digits.
function PhoneInput({ value, onChange, required = false, label }) {
  const handleKeyDown = (event) => {
    // Hayaan ang shortcuts (Ctrl/Cmd+C/V/A...) at control keys (Backspace, Arrow, Tab, etc.)
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length > 1) return;
    if (!/^\d$/.test(event.key)) event.preventDefault();
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData('text');
    const el = event.target;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(digitsOnly(`${value.slice(0, start)}${pasted}${value.slice(end)}`));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      required={required}
      maxLength={PHONE_LENGTH}
      placeholder="09"
      aria-label={label}
      title="Must be exactly 11 digits (e.g. 09123456789)"
      value={value}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={(e) => onChange(digitsOnly(e.target.value))}
    />
  );
}

/**
 * Pagination for the Leads & inquiries table.
 * - Hidden completely when there are PAGE_SIZE records or fewer.
 * - Shows at most PAGE_WINDOW page numbers in a sliding window (1 2 3 4 -> 3 4 5 6 ...).
 * - Record count on the left, controls on the right.
 * Data comes from the API `meta` (total, per_page, last_page, current_page).
 */
function InquiryPagination({ meta, page, onPage }) {
  const total = Number(meta?.total ?? 0);
  const perPage = Number(meta?.per_page ?? PAGE_SIZE) || PAGE_SIZE;
  const last = Number(meta?.last_page ?? Math.ceil(total / perPage));
  if (!total || total <= PAGE_SIZE || last <= 1) return null;

  const current = Math.min(Math.max(Number(meta?.current_page ?? page), 1), last);
  const from = (current - 1) * perPage + 1;
  const to = Math.min(current * perPage, total);

  // The active page sits in the 3rd slot when possible, and the window never runs past the last page.
  const start = Math.max(1, Math.min(current - 2, last - PAGE_WINDOW + 1));
  const pages = Array.from({ length: Math.min(PAGE_WINDOW, last) }, (_, index) => start + index);

  return (
    <nav className="inquiry-pagination" aria-label="Inquiries pagination">
      <span className="page-count">Showing {from} to {to} of {total} leads</span>
      <div className="page-nav">
        <button type="button" className="page-step" onClick={() => onPage(current - 1)} disabled={current <= 1}>
          Previous
        </button>
        {pages.map((number) => (
          <button
            key={number}
            type="button"
            className={`page-number${number === current ? ' active' : ''}`}
            aria-label={`Page ${number}`}
            aria-current={number === current ? 'page' : undefined}
            onClick={() => onPage(number)}
          >
            {number}
          </button>
        ))}
        <button type="button" className="page-step" onClick={() => onPage(current + 1)} disabled={current >= last}>
          Next
        </button>
      </div>
    </nav>
  );
}

// Sort / filter control: one dropdown whose content follows the category chosen with the icon button.
const SORT_LABELS = ['Default sort', 'By branch', 'Sort by date', 'By source'];
const SORT_SOURCES = [
  { value: 'gmail', label: 'Gmail' },
  { value: 'viber', label: 'Viber' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'walk_in', label: 'Walk in' },
  { value: 'referral', label: 'Referral' },
];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const actionMessages = {
  endorse: 'Inquiry endorsed to the next team successfully.',
  convert: 'Inquiry converted into an applicant successfully.',
  unconvert: 'Conversion undone. The applicant record was removed.',
  archive: 'Inquiry archived.',
  restore: 'Inquiry restored to the pipeline.',
  delete: 'Inquiry deleted.',
};

const actionCopy = {
  convert: {
    title: 'Convert inquiry to applicant?',
    button: 'Convert inquiry',
    body: 'This creates an applicant record and moves the lead into the franchise application pipeline.',
  },
  unconvert: {
    title: 'Undo this conversion?',
    button: 'Undo conversion',
    body: 'This removes the applicant record created from this lead and returns the inquiry to the pipeline.',
  },
  archive: {
    title: 'Archive this inquiry?',
    button: 'Archive inquiry',
    body: 'The inquiry is hidden from the active pipeline and can be restored later from Admin settings.',
  },
  restore: {
    title: 'Restore this inquiry?',
    button: 'Restore inquiry',
    body: 'The inquiry returns to the active pipeline with its original details.',
  },
  delete: {
    title: 'Delete this inquiry?',
    button: 'Delete permanently',
    body: 'This removes the lead permanently. Archive instead if you may need the record later.',
  },
  endorse: {
    title: 'Endorse this inquiry?',
    button: 'Endorse inquiry',
    body: 'This advances the lead for follow-up by the responsible sales team.',
  },
};

// Works for new records (first_name / last_name) and older ones (lead_name only).
const leadDisplayName = (inquiry) => {
  const full = [inquiry.first_name, inquiry.last_name].filter(Boolean).join(' ').trim();
  return full || inquiry.lead_name || '—';
};

// Active rows show the sequential display number computed by the backend (the permanent
// database id is not shown). Archived rows show their Archive ID and the number they had.
const leadNumberLabel = (inquiry) => {
  if (inquiry.archived_at) {
    const log = inquiry.current_archive_log;
    if (!log) return 'Archived';
    return `Archive ID ${log.archive_id}${log.original_display_no ? ` · was #${log.original_display_no}` : ''}`;
  }
  return `Lead #${inquiry.display_no ?? inquiry.id}`;
};

const initialsOf = (name) => {
  const parts = String(name || '').split(/\s+/).filter(Boolean);
  if (!parts.length || parts[0] === '—') return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

// ---- Normalizers used for duplicate detection and contact suggestions ----
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeName = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const normalizePhone = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) digits = `0${digits.slice(2)}`; // +63 9xx -> 09xx
  else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  return digits;
};

const splitName = (row) => {
  if (row.first_name || row.last_name) return { first: row.first_name || '', last: row.last_name || '' };
  const parts = String(row.lead_name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
};

// Existing people whose name contains everything typed so far (one entry per person).
const buildSuggestions = (rows, query) => {
  const tokens = normalizeName(query).split(' ').filter(Boolean);
  const unique = new Map();
  rows.forEach((row) => {
    const name = normalizeName(leadDisplayName(row));
    if (!tokens.every((token) => name.includes(token))) return;
    const key = normalizeEmail(row.email) || normalizePhone(row.phone) || name;
    if (!unique.has(key)) unique.set(key, row);
  });
  return [...unique.values()].slice(0, 6);
};

// Decides whether an existing inquiry is the same person as the one being entered.
// Returns the reasons it matched, or null when it is not the same person.
const matchPerson = (row, mine) => {
  const rowEmail = normalizeEmail(row.email);
  const rowPhones = [normalizePhone(row.phone), normalizePhone(row.viber_number)].filter(Boolean);
  const reasons = [];
  if (mine.email && rowEmail && mine.email === rowEmail) reasons.push('email address');
  if (mine.phones.some((phone) => rowPhones.includes(phone))) reasons.push('contact number');
  if (reasons.length) {
    // A shared phone/email with a completely different name (e.g. family) is not the same person.
    const rowTokens = normalizeName(leadDisplayName(row)).split(' ').filter(Boolean);
    const myTokens = mine.name.split(' ').filter(Boolean);
    const namesCompatible = !rowTokens.length || !myTokens.length || myTokens.some((token) => rowTokens.includes(token));
    return namesCompatible ? reasons : null;
  }

  // Name alone is only enough when the contact details do not contradict each other.
  if (!mine.name || normalizeName(leadDisplayName(row)) !== mine.name) return null;
  if (mine.email && rowEmail) return null;
  if (mine.phones.length && rowPhones.length) return null;
  return ['name'];
};

function BrandText({ name }) {
  if (!name) return '—';
  return <span className="brand-text" style={{ color: brandColor(name) }}>{name}</span>;
}

function DetailRow({ label, children }) {
  return (
    <div className="drawer-row">
      <dt>{label}</dt>
      <dd>{children || <span className="drawer-empty">Not provided</span>}</dd>
    </div>
  );
}

export default function Inquiries() {
  const { role } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  // 0 = default, 1 = by branch, 2 = by date, 3 = by source (cycled with the sort icon button)
  const [sortMode, setSortMode] = useState(0);
  const [brandFilter, setBrandFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // ---- Edit state ----
  const [editingId, setEditingId] = useState(null);          // table edit: reuses the New inquiry modal
  const [drawerEditing, setDrawerEditing] = useState(false); // details panel: inline edit
  const [drawerForm, setDrawerForm] = useState(null);
  const [drawerError, setDrawerError] = useState('');
  const [drawerSaving, setDrawerSaving] = useState(false);

  const remote = useRemote(async () => {
    const [inquiries, brands] = await Promise.all([
      api.get('/inquiries', {
        page,
        per_page: PAGE_SIZE,
        search,
        status,
        ...(showArchived ? { archived: 1 } : {}),
        ...(sortMode === 1 && brandFilter ? { brand_id: brandFilter } : {}),
        ...(sortMode === 2 ? { sort: 'date', ...(monthFilter ? { month: monthFilter } : {}), ...(yearFilter ? { year: yearFilter } : {}) } : {}),
        ...(sortMode === 3 && sourceFilter ? { source: sourceFilter } : {}),
      }),
      api.get('/brands'),
    ]);
    return { inquiries: inquiries.data, meta: inquiries.meta, brands: brands.data };
  }, [page, search, status, showArchived, sortMode, brandFilter, monthFilter, yearFilter, sourceFilter]);

  const canEdit = ['admin', 'marketing'].includes(role);
  const canConvert = ['admin', 'sales'].includes(role);
  // The provided API routes allow the endorse endpoint only for Marketing and Admin,
  // while InquiryController rejects Admin and permits Marketing/Sales. The effective
  // role that can successfully endorse with the current backend is Marketing.
  const canEndorse = role === 'marketing';
  const rows = remote.data?.inquiries || [];
  const brandOptions = useMemo(() => remote.data?.brands || [], [remote.data?.brands]);
  const sortedBrands = useMemo(() => [...brandOptions].sort((a, b) => a.name.localeCompare(b.name)), [brandOptions]);
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, index) => current - index);
  }, []);

  // If the current page no longer exists (e.g. the only row on the last page was archived
  // or deleted), move to the last valid page instead of showing an empty table.
  useEffect(() => {
    const meta = remote.data?.meta;
    if (!meta) return;
    const last = Math.max(1, Number(meta.last_page) || 1);
    if (page > last) setPage(last);
  }, [remote.data?.meta, page]);

  // Icon button: default -> branch -> date -> source -> default. Clears the previous category's selection.
  const cycleSort = () => {
    setSortMode((mode) => (mode + 1) % SORT_LABELS.length);
    setBrandFilter('');
    setMonthFilter('');
    setYearFilter('');
    setSourceFilter('');
    setPage(1);
  };

  const isViber = form.source === 'viber';
  const isOthers = form.source === 'others';

  const handleSourceChange = (value) => {
    setForm((current) => ({
      ...current,
      source: value,
      // Clear the Viber number when the source is no longer Viber.
      viber_number: value === 'viber' ? current.viber_number : '',
      // Clear the custom text when the source is no longer Others.
      source_other: value === 'others' ? current.source_other : '',
    }));
  };

  // ---------- Table edit: open / close the form ----------
  // Opens the same modal as "New inquiry", filled with the selected inquiry's values.
  const openEdit = (inquiry) => {
    const { first, last } = splitName(inquiry);
    const known = sourceOptions.includes(inquiry.source);
    setActionError('');
    setSuccess('');
    setForm({
      first_name: first,
      last_name: last,
      source: known ? inquiry.source : 'others',
      source_other: known ? '' : (inquiry.source || ''),
      email: inquiry.email || '',
      phone: digitsOnly(inquiry.phone),
      viber_number: digitsOnly(inquiry.viber_number),
      preferred_brand_id: String(inquiry.preferred_brand_id ?? inquiry.preferred_brand?.id ?? ''),
      current_city: inquiry.current_city || '',
      preferred_franchise_location: inquiry.preferred_franchise_location || '',
      remarks: inquiry.remarks || '',
    });
    setEditingId(inquiry.id);
    setShowCreate(true);
  };

  const closeForm = () => {
    if (editingId) setForm(initialForm); // do not leak edited values into the next "New inquiry"
    setShowCreate(false);
    setEditingId(null);
  };

  // ---------- Duplicate warning ----------
  const [duplicateMatches, setDuplicateMatches] = useState(null);
  const duplicateRef = useRef(null);

  // Any edit to the form makes an earlier warning outdated.
  useEffect(() => { setDuplicateMatches(null); }, [form]);
  useEffect(() => { if (!showCreate) setDuplicateMatches(null); }, [showCreate]);
  useEffect(() => {
    if (duplicateMatches && duplicateRef.current) {
      duplicateRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [duplicateMatches]);

  // Looks for an existing inquiry for the same person AND the same brand/concept.
  // A different preferred franchise location does not matter.
  // While editing, the record being edited is ignored.
  const findDuplicates = async () => {
    const brandId = Number(form.preferred_brand_id);
    if (!brandId) return []; // "No preference" cannot be a same-brand duplicate

    const mine = {
      email: normalizeEmail(form.email),
      phones: [normalizePhone(form.phone), isViber ? normalizePhone(form.viber_number) : ''].filter(Boolean),
      name: normalizeName(`${form.first_name} ${form.last_name}`),
    };
    const terms = [...new Set([
      form.email.trim(),
      form.phone.trim(),
      isViber ? form.viber_number.trim() : '',
      form.last_name.trim(),
    ].filter(Boolean))];

    const results = await Promise.all(terms.map((term) => api.get('/inquiries', { page: 1, per_page: 50, search: term })));
    const byId = new Map();
    results.forEach((result) => (result.data || []).forEach((row) => byId.set(row.id, row)));

    return [...byId.values()]
      .filter((row) => row.id !== editingId)
      .filter((row) => Number(row.preferred_brand_id ?? row.preferred_brand?.id) === brandId)
      .map((row) => ({ row, reasons: matchPerson(row, mine) }))
      .filter((item) => item.reasons);
  };

  // Frontend-only validation (hindi umaasa sa browser pattern).
  const validateForm = () => {
    if (form.phone && form.phone.length !== PHONE_LENGTH) {
      return `Phone number must be exactly ${PHONE_LENGTH} digits (you entered ${form.phone.length}).`;
    }
    if (isViber && form.viber_number.length !== PHONE_LENGTH) {
      return `Viber number must be exactly ${PHONE_LENGTH} digits (you entered ${form.viber_number.length}).`;
    }
    if (isOthers && !form.source_other.trim()) {
      return 'Please specify the source.';
    }
    return '';
  };

  // Creates a new inquiry, or updates the existing one when editingId is set.
  // Both calls throw on failure, so the success message only shows when the request worked.
  const postInquiry = async () => {
    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const { source_other, ...rest } = form; // source_other is not sent as its own field
    const payload = {
      ...rest,
      // If "Others", send the typed text as the source.
      source: isOthers ? source_other.trim() : form.source,
      first_name: firstName,
      last_name: lastName,
      // Kept so the existing backend validation on lead_name keeps working.
      lead_name: `${firstName} ${lastName}`.trim(),
      viber_number: isViber ? form.viber_number.trim() : null,
      preferred_brand_id: form.preferred_brand_id ? Number(form.preferred_brand_id) : null,
    };

    if (editingId) {
      await api.put(`/inquiries/${editingId}`, payload);
      setSuccess('Inquiry updated successfully.');
    } else {
      await api.post('/inquiries', payload);
      setSuccess('Inquiry recorded successfully.');
    }
    setForm(initialForm);
    setDuplicateMatches(null);
    setShowCreate(false);
    setEditingId(null);
    await remote.reload();
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    if (saving) return;
    setActionError('');
    setSuccess('');

    const validationError = validateForm();
    if (validationError) {
      setActionError(validationError);
      return;
    }

    setSaving(true);
    try {
      let matches = [];
      try {
        matches = await findDuplicates();
      } catch (checkError) {
        matches = []; // if the check itself fails, do not block saving
      }
      if (matches.length) {
        setDuplicateMatches(matches);
        return;
      }
      await postInquiry();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDuplicate = async () => {
    setSaving(true);
    setActionError('');
    try {
      await postInquiry();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // ---------- Existing-contact suggestions ----------
  const [suggestions, setSuggestions] = useState([]);
  const [suggestField, setSuggestField] = useState(null); // which name input is being typed in
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestRequest = useRef(0);
  const nameQuery = `${form.first_name} ${form.last_name}`.trim();

  useEffect(() => {
    // No autofill suggestions while editing an existing inquiry.
    if (!showCreate || editingId || !suggestField || nameQuery.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const requestId = suggestRequest.current + 1;
    suggestRequest.current = requestId;
    const timer = setTimeout(async () => {
      try {
        // Search by the longest word typed, then keep only people matching every word.
        const term = nameQuery.split(/\s+/).sort((a, b) => b.length - a.length)[0];
        const result = await api.get('/inquiries', { page: 1, per_page: 50, search: term });
        if (requestId !== suggestRequest.current) return;
        setSuggestions(buildSuggestions(result.data || [], nameQuery));
        setActiveSuggestion(-1);
      } catch (searchError) {
        if (requestId === suggestRequest.current) setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [nameQuery, suggestField, showCreate, editingId]);

  // Autofill happens only here, after the user clicks a suggestion.
  // Brand/concept and preferred franchise location are intentionally NOT copied.
  const applySuggestion = (row) => {
    const { first, last } = splitName(row);
    setForm((current) => ({
      ...current,
      first_name: first,
      last_name: last,
      email: current.email.trim() ? current.email : (row.email || ''),
      phone: current.phone.trim() ? current.phone : digitsOnly(row.phone),
      viber_number: current.viber_number.trim() ? current.viber_number : digitsOnly(row.viber_number),
      current_city: current.current_city.trim() ? current.current_city : (row.current_city || ''),
    }));
    setSuggestField(null);
    setSuggestions([]);
  };

  const onNameKeyDown = (event) => {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestion((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestion((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeSuggestion >= 0) {
      event.preventDefault();
      applySuggestion(suggestions[activeSuggestion]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setSuggestField(null);
    }
  };

  const renderSuggestions = (field) => {
    if (suggestField !== field || !suggestions.length) return null;
    return (
      <ul className="suggest-list" role="listbox" aria-label="Existing contacts">
        {suggestions.map((row, index) => {
          const details = [row.phone, row.email, row.current_city].filter(Boolean).join(' · ');
          return (
            <li
              key={row.id}
              role="option"
              aria-selected={index === activeSuggestion}
              className={`suggest-item${index === activeSuggestion ? ' active' : ''}`}
              // mousedown (not click) so the input keeps focus and the list does not close first
              onMouseDown={(event) => { event.preventDefault(); applySuggestion(row); }}
              onMouseEnter={() => setActiveSuggestion(index)}
            >
              <span className="suggest-name">{leadDisplayName(row)} <em>— Existing Contact</em></span>
              {details && <small>{details}</small>}
            </li>
          );
        })}
      </ul>
    );
  };

  const runAction = async () => {
    if (!pendingAction) return;
    setSaving(true);
    setActionError('');
    setSuccess('');
    try {
      if (pendingAction.type === 'delete') {
        await api.delete(`/inquiries/${pendingAction.inquiry.id}`);
      } else {
        await api.post(`/inquiries/${pendingAction.inquiry.id}/${pendingAction.type}`, {});
      }
      setSuccess(actionMessages[pendingAction.type] || 'Inquiry updated.');
      setPendingAction(null);
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const brandMap = useMemo(() => new Map(brandOptions.map((brand) => [brand.id, brand.name])), [brandOptions]);

  // Read panel: keep only the id so the panel always shows fresh data after a reload.
  const [selectedId, setSelectedId] = useState(null);
  const selected = rows.find((row) => row.id === selectedId) || null;
  const lastSelected = useRef(null);
  if (selected) lastSelected.current = selected;
  const shown = selected || lastSelected.current; // keeps content visible while the panel slides out
  const closeDetails = () => setSelectedId(null);
  const toggleRow = (id) => setSelectedId((current) => (current === id ? null : id));

  // Keeps the curved pointer on the panel's left edge level with the selected row.
  const drawerRef = useRef(null);
  const prevSelectedRef = useRef(null);
  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return undefined;
    if (!selectedId) {
      prevSelectedRef.current = null;
      return undefined;
    }

    const place = () => {
      const row = document.querySelector(`tr[data-inquiry-id="${selectedId}"]`);
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

    // Glide between rows, but don't animate the very first placement or scrolling.
    const switching = prevSelectedRef.current !== null && prevSelectedRef.current !== selectedId;
    prevSelectedRef.current = selectedId;
    drawer.classList.toggle('pointer-animate', switching);
    place();
    const timer = switching ? setTimeout(() => drawer.classList.remove('pointer-animate'), 450) : 0;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('scroll', schedule, true); // capture: also catches inner scroll containers
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
  }, [selectedId, remote.data]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !showCreate && !pendingAction) setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, showCreate, pendingAction]);

  const shownName = shown ? leadDisplayName(shown) : '';
  const shownConcept = shown ? (shown.preferred_brand?.name || brandMap.get(shown.preferred_brand_id)) : '';

  // ---------- Details panel: inline edit ----------
  const startDrawerEdit = () => {
    if (!shown) return;
    const { first, last } = splitName(shown);
    setDrawerForm({
      first_name: first,
      last_name: last,
      phone: digitsOnly(shown.phone),
      email: shown.email || '',
      preferred_brand_id: String(shown.preferred_brand_id ?? shown.preferred_brand?.id ?? ''),
      preferred_franchise_location: shown.preferred_franchise_location || '',
      remarks: shown.remarks || '',
    });
    setDrawerError('');
    setDrawerEditing(true);
  };

  const cancelDrawerEdit = () => {
    setDrawerEditing(false);
    setDrawerError('');
  };

  // Switching rows or closing the panel discards unsaved edits.
  useEffect(() => {
    setDrawerEditing(false);
    setDrawerError('');
  }, [selectedId]);

  const saveDrawerEdit = async () => {
    if (!shown || !drawerForm || drawerSaving) return;
    const f = drawerForm;
    if (!f.first_name.trim() || !f.last_name.trim()) {
      setDrawerError('First name and last name are required.');
      return;
    }
    if (f.phone && f.phone.length !== PHONE_LENGTH) {
      setDrawerError(`Phone number must be exactly ${PHONE_LENGTH} digits (you entered ${f.phone.length}).`);
      return;
    }
    setDrawerSaving(true);
    setDrawerError('');
    setSuccess('');
    try {
      await api.put(`/inquiries/${shown.id}`, {
        // Fields not editable in the panel are sent back unchanged so backend validation sees a full record.
        source: shown.source,
        viber_number: shown.viber_number || null,
        current_city: shown.current_city || '',
        first_name: f.first_name.trim(),
        last_name: f.last_name.trim(),
        lead_name: `${f.first_name.trim()} ${f.last_name.trim()}`.trim(),
        email: f.email.trim(),
        phone: f.phone,
        preferred_brand_id: f.preferred_brand_id ? Number(f.preferred_brand_id) : null,
        preferred_franchise_location: f.preferred_franchise_location.trim(),
        remarks: f.remarks,
      });
      setDrawerEditing(false);
      setSuccess('Inquiry updated successfully.');
      await remote.reload(); // the table row and the panel both read from `rows`, so both refresh
    } catch (error) {
      setDrawerError(firstValidationMessage(error));
    } finally {
      setDrawerSaving(false);
    }
  };

  // ---------- Archive view: multi-select, bulk restore, permanent delete ----------
  const [selectedIds, setSelectedIds] = useState([]); // in click order; the first one hosts the action buttons
  const [bulkRestoreTargets, setBulkRestoreTargets] = useState(null);
  const selectedRows = selectedIds.map((id) => rows.find((row) => row.id === id)).filter(Boolean);

  // The selection belongs to the rows currently on screen.
  useEffect(() => { setSelectedIds([]); }, [page, search, status, showArchived, sortMode, brandFilter, monthFilter, yearFilter, sourceFilter]);
  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => rows.some((row) => row.id === id));
      return next.length === current.length ? current : next;
    });
  }, [remote.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedIds.length) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !bulkRestoreTargets && !pendingAction && !showCreate) setSelectedIds([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds.length, bulkRestoreTargets, pendingAction, showCreate]);

  // Plain click opens the read panel. In the archive view, Ctrl/Cmd+click toggles a row
  // in the selection and Shift+click selects the range from the first selected row.
  const handleRowClick = (event, inquiry) => {
    if (showArchived && canEdit && (event.ctrlKey || event.metaKey)) {
      setSelectedId(null);
      setSelectedIds((current) => (
        current.includes(inquiry.id) ? current.filter((id) => id !== inquiry.id) : [...current, inquiry.id]
      ));
      return;
    }
    if (showArchived && canEdit && event.shiftKey && selectedIds.length) {
      const anchor = rows.findIndex((row) => row.id === selectedIds[0]);
      const target = rows.findIndex((row) => row.id === inquiry.id);
      if (anchor >= 0 && target >= 0) {
        const [from, to] = anchor < target ? [anchor, target] : [target, anchor];
        const range = rows.slice(from, to + 1).map((row) => row.id).filter((id) => id !== selectedIds[0]);
        setSelectedId(null);
        setSelectedIds([selectedIds[0], ...range]);
        return;
      }
    }
    if (selectedIds.length) setSelectedIds([]);
    toggleRow(inquiry.id);
  };

  const confirmBulkRestore = async () => {
    if (!bulkRestoreTargets?.length) return;
    setSaving(true);
    setActionError('');
    setSuccess('');
    let restored = 0;
    try {
      for (const item of bulkRestoreTargets) {
        await api.post(`/inquiries/${item.id}/restore`, {});
        restored += 1;
      }
      setSuccess(`${restored} ${restored === 1 ? 'inquiry' : 'inquiries'} restored to the pipeline.`);
    } catch (error) {
      setActionError(`Restored ${restored} of ${bulkRestoreTargets.length}. ${firstValidationMessage(error)}`);
    }
    setBulkRestoreTargets(null);
    setSelectedIds([]);
    setSaving(false);
    await remote.reload();
  };

  // Buttons for an archived row. While rows are selected, only the first selected row
  // shows them and they act on the whole selection.
  const renderArchiveActions = (inquiry) => {
    const hasSelection = selectedIds.length > 0;
    if (hasSelection && selectedIds[0] !== inquiry.id) {
      return selectedIds.includes(inquiry.id) ? <span className="selected-tag">Selected</span> : null;
    }
    const targets = hasSelection ? selectedRows : [inquiry];
    const many = targets.length > 1;
    return (
      <>
        {canEdit && (
          <button
            type="button"
            onClick={() => (many ? setBulkRestoreTargets(targets) : setPendingAction({ type: 'restore', inquiry }))}
          >
            <FaRotateLeft /> Restore{many ? ` (${targets.length})` : ''}
          </button>
        )}
        {hasSelection && (
          <button type="button" className="icon-button" title="Clear selection" aria-label="Clear selection" onClick={() => setSelectedIds([])}>
            <FaXmark aria-hidden="true" />
          </button>
        )}
      </>
    );
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Leads & inquiries"
        subtitle="Capture, qualify, endorse, and convert franchise opportunities through one accountable pipeline."
        actions={canEdit && <button className="primary-button" onClick={() => { setActionError(''); setEditingId(null); setForm(initialForm); setShowCreate(true); }}><FaPlus /> New inquiry</button>}
      />
      <Notice type="success">{success}</Notice>
      <Notice type="error">{actionError || remote.error}</Notice>
      <div className="toolbar">
        <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search name, email, or phone" aria-label="Search inquiries" />
        <div className="sort-control">
          {sortMode === 2 ? (
            <>
              <select value={monthFilter} onChange={(e) => { setPage(1); setMonthFilter(e.target.value); }} aria-label="Filter by month">
                <option value="">Sort by date</option>
                {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </select>
              <select value={yearFilter} onChange={(e) => { setPage(1); setYearFilter(e.target.value); }} aria-label="Filter by year">
                <option value="">Year</option>
                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </>
          ) : sortMode === 1 ? (
            <select
              value={brandFilter}
              onChange={(e) => { setPage(1); setBrandFilter(e.target.value); }}
              aria-label="Filter by branch"
              style={{ color: brandColor(brandMap.get(Number(brandFilter))) }}
            >
              <option value="">By branch</option>
              {sortedBrands.map((brand) => <option key={brand.id} value={brand.id} style={{ color: brandColor(brand.name) }}>{brand.name}</option>)}
            </select>
          ) : sortMode === 3 ? (
            <select value={sourceFilter} onChange={(e) => { setPage(1); setSourceFilter(e.target.value); }} aria-label="Filter by source">
              <option value="">By source</option>
              {SORT_SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          ) : (
            <select value="" onChange={() => {}} aria-label="Sort category">
              <option value="">Default sort</option>
            </select>
          )}
          <button
            type="button"
            className="sort-cycle"
            onClick={cycleSort}
            title={`Change sort category (now: ${SORT_LABELS[sortMode]})`}
            aria-label={`Change sort category. Current: ${SORT_LABELS[sortMode]}`}
          >
            <FaRightLeft aria-hidden="true" />
          </button>
        </div>
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} aria-label="Filter inquiry status">
          <option value="">All statuses</option>
          {['new', 'contacted', 'endorsed', 'converted', 'closed'].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
        </select>
        {canEdit && (
          <button
            type="button"
            className={`tab${showArchived ? ' active' : ''}`}
            onClick={() => { setPage(1); setShowArchived(!showArchived); }}
          >
            <FaBoxArchive aria-hidden="true" /> {showArchived ? 'Viewing archive' : 'View archive'}
          </button>
        )}
      </div>

      {showArchived && canEdit && rows.length > 0 && (
        <p className="muted-note archive-hint">
          Click a row to view it. Hold Ctrl (⌘ on Mac) and click to select several records to restore together, or Shift+click for a range. Esc clears the selection.
        </p>
      )}

      <section className="data-panel">
        {remote.loading ? <LoadingState /> : rows.length === 0 ? (
          <EmptyState label="No inquiries match the current filters." detail="Adjust your search or create a new inquiry to begin the pipeline." />
        ) : (
          <div className={`table-wrap${showArchived ? ' archive-mode' : ''}`}><table><thead><tr><th>Lead</th><th>Contact</th><th>Concept</th><th>Source</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {rows.map((inquiry) => (
              <tr
                key={inquiry.id}
                data-inquiry-id={inquiry.id}
                className={`inquiry-row${inquiry.id === selectedId ? ' is-selected' : ''}${selectedIds.includes(inquiry.id) ? ' is-picked' : ''}`}
                tabIndex={0}
                aria-label={`View details for ${leadDisplayName(inquiry)}`}
                onClick={(event) => handleRowClick(event, inquiry)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleRowClick(event, inquiry);
                  }
                }}
              >
                <td><strong>{leadDisplayName(inquiry)}</strong><small>{leadNumberLabel(inquiry)}</small></td>
                <td>
                  {inquiry.email || '—'}
                  <small>{inquiry.phone || '—'}</small>
                  {inquiry.viber_number && <small>Viber: {inquiry.viber_number}</small>}
                </td>
                <td><BrandText name={inquiry.preferred_brand?.name || brandMap.get(inquiry.preferred_brand_id)} /></td>
                <td>{titleCase(inquiry.source)}</td>
                <td>{formatDate(inquiry.inquiry_date)}</td>
                <td><StatusBadge value={inquiry.status} /></td>
                <td><div className={`row-actions${showArchived ? '' : ' fixed-actions'}`} onClick={(event) => event.stopPropagation()}>
                  {showArchived ? renderArchiveActions(inquiry) : (
                    <>
                      {/* Slot 1: Endorse / Convert / Undo convert (always the same position) */}
                      <div className="action-slot">
                        {canEndorse && !['endorsed', 'converted'].includes(inquiry.status) && (
                          <button onClick={() => setPendingAction({ type: 'endorse', inquiry })}>Endorse</button>
                        )}
                        {canConvert && inquiry.status !== 'converted' && (
                          <button onClick={() => setPendingAction({ type: 'convert', inquiry })}>Convert</button>
                        )}
                        {/* Undo a conversion that has not progressed past the first stage. */}
                        {canConvert && inquiry.status === 'converted' && inquiry.applicant?.status === 'inquiry' && (
                          <button onClick={() => setPendingAction({ type: 'unconvert', inquiry })}>Undo convert</button>
                        )}
                      </div>

                      {/* Slot 2: Edit */}
                      <div className="action-slot">
                        {canEdit && (
                          <button
                            type="button"
                            className="icon-button edit-button"
                            title="Edit inquiry"
                            aria-label={`Edit ${leadDisplayName(inquiry)}`}
                            onClick={() => openEdit(inquiry)}
                          >
                            <FaPen aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {/* Slot 3: Archive icon (replaces the old text Delete button) */}
                      <div className="action-slot">
                        {canEdit && (
                          <button
                            type="button"
                            className="icon-button archive-icon-button"
                            title="Archive inquiry"
                            aria-label={`Archive ${leadDisplayName(inquiry)}`}
                            onClick={() => setPendingAction({ type: 'archive', inquiry })}
                          >
                            <FaBoxArchive aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <InquiryPagination meta={remote.data?.meta} page={page} onPage={setPage} />
      </section>

      <aside
        ref={drawerRef}
        className={`inquiry-drawer${selected ? ' open' : ''}`}
        aria-label="Inquiry details"
        aria-hidden={!selected}
      >
        <span className="drawer-pointer" aria-hidden="true">
          <svg width="16" height="48" viewBox="0 0 16 48">
            <path className="pointer-fill" d="M15.5 0 C15.5 10 1.5 10 1.5 24 C1.5 38 15.5 38 15.5 48 L16 48 L16 0 Z" />
            <path className="pointer-line" d="M15.5 0 C15.5 10 1.5 10 1.5 24 C1.5 38 15.5 38 15.5 48" />
          </svg>
        </span>
        <button type="button" className="drawer-toggle" onClick={closeDetails} aria-label="Close details" title="Close (Esc)">
          <FaChevronRight />
        </button>
        {shown && (
          <>
            <header className="drawer-head">
              <span className="drawer-avatar" aria-hidden="true">{initialsOf(shownName)}</span>
              <div>
                <h2>{shownName}</h2>
                <p>{leadNumberLabel(shown)}</p>
              </div>
              {canEdit && !shown.archived_at && !drawerEditing && (
                <button type="button" className="drawer-edit-btn" onClick={startDrawerEdit} title="Edit inquiry">
                  <FaPen aria-hidden="true" /> Edit
                </button>
              )}
            </header>
            <div className="drawer-body">
              {drawerEditing && drawerForm ? (
                <section className="drawer-edit">
                  <h3>Edit details</h3>
                  <Notice type="error">{drawerError}</Notice>
                  <label>
                    <span>First name</span>
                    <input value={drawerForm.first_name} onChange={(e) => setDrawerForm({ ...drawerForm, first_name: e.target.value })} />
                  </label>
                  <label>
                    <span>Last name</span>
                    <input value={drawerForm.last_name} onChange={(e) => setDrawerForm({ ...drawerForm, last_name: e.target.value })} />
                  </label>
                  <label>
                    <span>Contact number</span>
                    <PhoneInput
                      label="Contact number"
                      value={drawerForm.phone}
                      onChange={(next) => setDrawerForm((current) => ({ ...current, phone: next }))}
                    />
                  </label>
                  <label>
                    <span>Email</span>
                    <input type="email" value={drawerForm.email} onChange={(e) => setDrawerForm({ ...drawerForm, email: e.target.value })} />
                  </label>
                  <label>
                    <span>Concept</span>
                    <select
                      value={drawerForm.preferred_brand_id}
                      onChange={(e) => setDrawerForm({ ...drawerForm, preferred_brand_id: e.target.value })}
                      style={{ color: brandColor(brandMap.get(Number(drawerForm.preferred_brand_id))) }}
                    >
                      <option value="">No preference</option>
                      {brandOptions.map((brand) => <option key={brand.id} value={brand.id} style={{ color: brandColor(brand.name) }}>{brand.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Preferred franchise location</span>
                    <input
                      value={drawerForm.preferred_franchise_location}
                      onChange={(e) => setDrawerForm({ ...drawerForm, preferred_franchise_location: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Remarks</span>
                    <textarea rows={4} value={drawerForm.remarks} onChange={(e) => setDrawerForm({ ...drawerForm, remarks: e.target.value })} />
                  </label>
                  <div className="drawer-edit-actions">
                    <button type="button" onClick={cancelDrawerEdit} disabled={drawerSaving}>Cancel</button>
                    <button type="button" className="primary-button" onClick={saveDrawerEdit} disabled={drawerSaving}>
                      {drawerSaving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  <section>
                    <h3>About</h3>
                    <dl>
                      <DetailRow label="Contact number">
                        {shown.phone && <a href={`tel:${shown.phone}`}>{shown.phone}</a>}
                      </DetailRow>
                      {(shown.source === 'viber' || shown.viber_number) && (
                        <DetailRow label="Viber number">{shown.viber_number}</DetailRow>
                      )}
                      <DetailRow label="Email">
                        {shown.email && <a href={`mailto:${shown.email}`}>{shown.email}</a>}
                      </DetailRow>
                      <DetailRow label="Source">{titleCase(shown.source)}</DetailRow>
                      <DetailRow label="Date inquired">{formatDate(shown.inquiry_date)}</DetailRow>
                    </dl>
                  </section>
                  <section>
                    <h3>Franchise interest</h3>
                    <dl>
                      <DetailRow label="Concept">{shownConcept ? <BrandText name={shownConcept} /> : null}</DetailRow>
                      <DetailRow label="Current city of residence">{shown.current_city}</DetailRow>
                      <DetailRow label="Preferred franchise location">{shown.preferred_franchise_location}</DetailRow>
                      {shown.address && <DetailRow label="Address (previous record)">{shown.address}</DetailRow>}
                    </dl>
                  </section>
                </>
              )}
              <section>
                <h3>Status</h3>
                <div className="drawer-status"><StatusBadge value={shown.status} /></div>
              </section>
              {!drawerEditing && (
                <section>
                  <h3>Remarks</h3>
                  <p className="drawer-remarks">{shown.remarks || <span className="drawer-empty">No remarks recorded.</span>}</p>
                </section>
              )}
            </div>
          </>
        )}
      </aside>

      {showCreate && (
        <ModalPortal>
          <Modal
            title={editingId ? 'Edit inquiry' : 'Record a new inquiry'}
            onClose={closeForm}
            footer={<><button onClick={closeForm}>Cancel</button><button className="primary-button" form="inquiry-form" disabled={saving || Boolean(duplicateMatches)}>{saving ? 'Saving…' : (editingId ? 'Save changes' : 'Save inquiry')}</button></>}
          >
            <Notice type="error">{actionError}</Notice>
            <form id="inquiry-form" className="form-grid" onSubmit={submitCreate} noValidate>
              <Field label="First name" required>
                <div className="suggest-wrap">
                  <input
                    required
                    autoComplete="off"
                    value={form.first_name}
                    onChange={(e) => { setForm({ ...form, first_name: e.target.value }); setSuggestField('first_name'); }}
                    onKeyDown={onNameKeyDown}
                    onBlur={() => setSuggestField(null)}
                  />
                  {renderSuggestions('first_name')}
                </div>
              </Field>
              <Field label="Last name" required>
                <div className="suggest-wrap">
                  <input
                    required
                    autoComplete="off"
                    value={form.last_name}
                    onChange={(e) => { setForm({ ...form, last_name: e.target.value }); setSuggestField('last_name'); }}
                    onKeyDown={onNameKeyDown}
                    onBlur={() => setSuggestField(null)}
                  />
                  {renderSuggestions('last_name')}
                </div>
              </Field>

              {/* Source dropdown + "Others" text box together in one field, so the text box always appears */}
              <Field label="Source" required>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <select value={form.source} onChange={(e) => handleSourceChange(e.target.value)}>
                    {sourceOptions.map((source) => <option key={source} value={source}>{titleCase(source)}</option>)}
                  </select>
                  {isOthers && (
                    <input
                      type="text"
                      autoComplete="off"
                      maxLength={50}
                      placeholder="Type the source (e.g. Instagram, Event, TikTok)"
                      aria-label="Specify source"
                      value={form.source_other}
                      onChange={(e) => setForm((current) => ({ ...current, source_other: e.target.value }))}
                    />
                  )}
                </div>
              </Field>

              <Field label="Email">
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>

              <Field label="Phone number">
                <PhoneInput
                  label="Phone number"
                  value={form.phone}
                  onChange={(next) => setForm((current) => ({ ...current, phone: next }))}
                />
              </Field>

              {isViber && (
                <Field label="Viber number" required>
                  <PhoneInput
                    label="Viber number"
                    required
                    value={form.viber_number}
                    onChange={(next) => setForm((current) => ({ ...current, viber_number: next }))}
                  />
                </Field>
              )}

              <Field label="Concept">
                <select
                  value={form.preferred_brand_id}
                  onChange={(e) => setForm({ ...form, preferred_brand_id: e.target.value })}
                  style={{ color: brandColor(brandMap.get(Number(form.preferred_brand_id))) }}
                >
                  <option value="">No preference</option>
                  {brandOptions.map((brand) => <option key={brand.id} value={brand.id} style={{ color: brandColor(brand.name) }}>{brand.name}</option>)}
                </select>
              </Field>
              <Field label="Current city of residence">
                <input value={form.current_city} onChange={(e) => setForm({ ...form, current_city: e.target.value })} />
              </Field>
              <Field label="Preferred franchise location">
                <input value={form.preferred_franchise_location} onChange={(e) => setForm({ ...form, preferred_franchise_location: e.target.value })} />
              </Field>
              <Field label="Remarks" full>
                <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Context, needs, timing, and next step" />
              </Field>
              {duplicateMatches && (
                <div className="duplicate-warning" role="alert" ref={duplicateRef}>
                  <div className="duplicate-head">
                    <FaTriangleExclamation aria-hidden="true" />
                    <p>An inquiry for this person and brand already exists. Do you still want to save this inquiry?</p>
                  </div>
                  <ul className="duplicate-list">
                    {duplicateMatches.slice(0, 3).map(({ row, reasons }) => (
                      <li key={row.id}>
                        <strong>{leadDisplayName(row)}</strong>
                        <span> — <BrandText name={row.preferred_brand?.name || brandMap.get(row.preferred_brand_id)} /></span>
                        <small>
                          {[row.preferred_franchise_location, formatDate(row.inquiry_date), titleCase(row.status)].filter(Boolean).join(' · ')}
                          {' · '}matched by {reasons.join(' and ')}
                        </small>
                      </li>
                    ))}
                    {duplicateMatches.length > 3 && <li><small>and {duplicateMatches.length - 3} more</small></li>}
                  </ul>
                  <div className="duplicate-actions">
                    <button type="button" onClick={() => setDuplicateMatches(null)} disabled={saving}>Cancel</button>
                    <button type="button" className="primary-button" onClick={confirmDuplicate} disabled={saving}>
                      {saving ? 'Saving…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </Modal>
        </ModalPortal>
      )}

      {bulkRestoreTargets && (
        <ModalPortal>
          <Modal
            title={`Restore ${bulkRestoreTargets.length} inquiries?`}
            onClose={() => setBulkRestoreTargets(null)}
            size="small"
            footer={(
              <>
                <button onClick={() => setBulkRestoreTargets(null)} disabled={saving}>Cancel</button>
                <button className="primary-button" onClick={confirmBulkRestore} disabled={saving}>
                  {saving ? 'Restoring…' : 'Restore inquiries'}
                </button>
              </>
            )}
          >
            <div className="confirmation-copy">
              <span className="confirmation-icon confirmation-accent"><FaRotateLeft /></span>
              <div>
                <strong>{bulkRestoreTargets.length} selected inquiries</strong>
                <p>They return to the active pipeline with their original details.</p>
              </div>
            </div>
          </Modal>
        </ModalPortal>
      )}

      {pendingAction && (
        <ModalPortal>
          <Modal
            title={actionCopy[pendingAction.type]?.title || 'Update this inquiry?'}
            onClose={() => setPendingAction(null)}
            size="small"
            footer={(
              <>
                <button onClick={() => setPendingAction(null)}>Cancel</button>
                <button
                  className={pendingAction.type === 'delete' ? 'danger-button' : 'primary-button'}
                  onClick={runAction}
                  disabled={saving}
                >
                  {saving ? 'Processing…' : actionCopy[pendingAction.type]?.button}
                </button>
              </>
            )}
          >
            <Notice type="error">{actionError}</Notice>
            <div className="confirmation-copy">
              <span className="confirmation-icon confirmation-accent"><FaRightLeft /></span>
              <div>
                <strong>{leadDisplayName(pendingAction.inquiry)}</strong>
                <p>{actionCopy[pendingAction.type]?.body}</p>
              </div>
            </div>
          </Modal>
        </ModalPortal>
      )}
    </div>
  );
}
