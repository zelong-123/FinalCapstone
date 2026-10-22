import React, { useState } from 'react';
import { FaUserPlus } from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, titleCase } from '../lib/format';
import { EmptyState, Field, LoadingState, Modal, Notice, PageHeader, Pagination, StatusBadge } from '../components/ApiUi';

const blank = { full_name: '', email: '', phone: '', password: '', role: 'marketing', account_status: 'active' };

export default function Users() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const remote = useRemote(async () => api.get('/users', { page, per_page: 20, search }), [page, search]);

  const createUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    setSuccess('');
    try {
      await api.post('/users', form);
      setForm(blank);
      setShowCreate(false);
      setSuccess('User account created successfully.');
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (user, account_status) => {
    setUpdatingId(user.id);
    setActionError('');
    setSuccess('');
    try {
      await api.put(`/users/${user.id}`, { account_status });
      setSuccess(`${user.full_name}'s account is now ${titleCase(account_status)}.`);
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="page-container">
      <PageHeader title="User management" subtitle="Provision accounts and govern role-based access across Herald." actions={<button className="primary-button" onClick={() => { setActionError(''); setShowCreate(true); }}><FaUserPlus /> New user</button>} />
      <Notice type="success">{success}</Notice>
      <Notice type="error">{actionError || remote.error}</Notice>
      <div className="toolbar"><input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search by name or email" aria-label="Search users" /></div>
      <section className="data-panel">
        {remote.loading ? <LoadingState /> : !remote.data?.data.length ? (
          <EmptyState label="No users match this search." detail="Clear the search or create a new role-based account." />
        ) : (
          <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Phone</th><th>Created</th><th>Status</th><th>Update</th></tr></thead><tbody>
            {remote.data.data.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.full_name}</strong><small>{user.email}</small></td>
                <td>{titleCase(user.role?.name || user.role)}</td>
                <td>{user.phone || '—'}</td>
                <td>{formatDate(user.created_at)}</td>
                <td><StatusBadge value={user.account_status} /></td>
                <td><select className="inline-select" value={user.account_status} disabled={updatingId === user.id} onChange={(e) => updateStatus(user, e.target.value)}>{['active', 'inactive', 'suspended'].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <Pagination meta={remote.data?.meta} onPage={setPage} />
      </section>

      {showCreate && (
        <Modal title="Create user account" onClose={() => setShowCreate(false)} footer={<><button onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" form="user-form" disabled={saving}>{saving ? 'Saving…' : 'Create user'}</button></>}>
          <Notice type="error">{actionError}</Notice>
          <form id="user-form" className="form-grid" onSubmit={createUser}>
            <Field label="Full name" required><input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Email" required><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Temporary password" required hint="Use at least 10 characters. Share it through a secure channel."><input required minLength="10" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label="Role" required><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{['marketing', 'sales', 'admin', 'logistics', 'franchisee'].map((role) => <option key={role} value={role}>{titleCase(role)}</option>)}</select></Field>
            <Field label="Status" required><select value={form.account_status} onChange={(e) => setForm({ ...form, account_status: e.target.value })}>{['active', 'inactive', 'suspended'].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
