import React, { useEffect, useMemo, useState } from 'react';
import {
  FaArrowUpRightFromSquare,
  FaBoxesStacked,
  FaCircleExclamation,
  FaClipboardList,
  FaClockRotateLeft,
  FaRotate,
  FaStore,
  FaTriangleExclamation,
} from 'react-icons/fa6';
import { api } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, formatNumber } from '../lib/format';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge } from '../components/ApiUi';

const metrics = [
  ['active_branches', 'Active branches', FaStore, 'Connected branch portals'],
  ['total_units', 'Branch units', FaBoxesStacked, 'Combined stock on hand'],
  ['low_stock_items', 'Low-stock items', FaTriangleExclamation, 'At or below reorder level'],
  ['critical_stock_items', 'Critical items', FaCircleExclamation, 'Immediate attention needed'],
  ['open_requests', 'Open requests', FaClipboardList, 'Awaiting completion'],
];

export default function Branches() {
  const [selectedCode, setSelectedCode] = useState('');
  const remote = useRemote(() => api.get('/branches/overview'), []);
  const payload = remote.data?.data;
  const branches = useMemo(() => payload?.branches || [], [payload?.branches]);

  useEffect(() => {
    if (!branches.length) {
      setSelectedCode('');
      return;
    }
    if (!selectedCode || !branches.some((branch) => branch.branch_code === selectedCode)) {
      setSelectedCode(branches[0].branch_code);
    }
  }, [branches, selectedCode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void remote.reload({ silent: true });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [remote.reload]);

  const selected = branches.find((branch) => branch.branch_code === selectedCode) || branches[0];

  return (
    <div className="page-container branches-page">
      <PageHeader
        eyebrow="Network operations"
        title="Branches"
        subtitle="A dedicated command panel for branch stock, deductions, alerts, and requests. Warehouse inventory remains separate."
        actions={(
          <div className="branches-header-actions">
            <span className="live-sync-label">Live sync · 3 seconds</span>
            <button type="button" onClick={() => remote.reload()} disabled={remote.loading}><FaRotate aria-hidden="true" /> Refresh</button>
          </div>
        )}
      />

      <Notice type="error">{remote.error}</Notice>

      {remote.loading && !payload ? <LoadingState label="Loading branch operations…" /> : !branches.length ? (
        <EmptyState label="No active branches were found." detail="Configure active franchise locations with branch codes to display them here." />
      ) : (
        <>
          <section className="metric-grid branch-metric-grid" aria-label="Branch network summary">
            {metrics.map(([key, label, Icon, caption]) => (
              <article className="metric-card" key={key}>
                <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon aria-hidden="true" /></span></div>
                <strong>{formatNumber(payload?.summary?.[key])}</strong>
                <small className="metric-caption">{caption}</small>
              </article>
            ))}
          </section>

          <section className="branch-selector" aria-label="Choose a branch">
            {branches.map((branch) => {
              const risk = branch.critical_stock_count > 0 ? 'critical' : branch.low_stock_count > 0 ? 'low' : 'normal';
              return (
                <button
                  type="button"
                  key={branch.id}
                  className={`branch-selector-card${branch.branch_code === selected?.branch_code ? ' active' : ''}`}
                  onClick={() => setSelectedCode(branch.branch_code)}
                  aria-pressed={branch.branch_code === selected?.branch_code}
                >
                  <span className="branch-card-top"><span className="branch-code">{branch.branch_code}</span><StatusBadge value={risk} /></span>
                  <strong>{branch.name}</strong>
                  <small>{branch.address || 'Address not provided'}</small>
                  <span className="branch-card-stats">
                    <span><b>{formatNumber(branch.total_units)}</b> units</span>
                    <span><b>{formatNumber(branch.open_request_count)}</b> requests</span>
                  </span>
                </button>
              );
            })}
          </section>

          {selected && (
            <section className="branch-workspace">
              <header className="branch-workspace-head">
                <div>
                  <span className="page-eyebrow">{selected.branch_code}</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.address || 'No address provided'}{selected.operator?.full_name ? ` · Operator: ${selected.operator.full_name}` : ''}</p>
                </div>
                <a className="branch-portal-link" href={selected.portal_path} target="_blank" rel="noreferrer">Open branch portal <FaArrowUpRightFromSquare aria-hidden="true" /></a>
              </header>

              <div className="branch-detail-grid">
                <section className="data-panel branch-stock-panel">
                  <div className="panel-title">
                    <div className="panel-heading-copy"><strong>Branch stock</strong><span>Separate from warehouse inventory</span></div>
                    <span className="branch-updated">Updated {formatDate(payload?.server_time, true)}</span>
                  </div>
                  {!selected.inventory?.length ? <EmptyState label="No branch stock configured." /> : (
                    <div className="branch-stock-grid">
                      {selected.inventory.map((item) => (
                        <article className={`branch-stock-card stock-${item.stock_status}`} key={item.id}>
                          <div className="branch-stock-title">
                            <div><strong>{item.product?.name || 'Item'}</strong><small>{item.product?.sku || ''}</small></div>
                            <StatusBadge value={item.stock_status} />
                          </div>
                          <div className="branch-stock-balance"><strong>{formatNumber(item.current_stock)}</strong><span>{item.product?.unit || 'units'} on hand</span></div>
                          <div className="branch-stock-thresholds"><span>Reorder <b>{formatNumber(item.reorder_level)}</b></span><span>Critical <b>{formatNumber(item.critical_level)}</b></span></div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <aside className="data-panel branch-activity-panel">
                  <div className="panel-title">
                    <div className="panel-heading-copy"><strong>Recent deductions</strong><span>Recorded by this branch</span></div>
                    <FaClockRotateLeft aria-hidden="true" />
                  </div>
                  {!selected.recent_deductions?.length ? <EmptyState label="No deductions recorded yet." detail="New branch deductions will appear here automatically." /> : (
                    <div className="branch-activity-list">
                      {selected.recent_deductions.map((deduction) => (
                        <article className="branch-activity-item" key={deduction.id}>
                          <div className="branch-activity-top"><strong>{deduction.sale_number}</strong><span>−{formatNumber(deduction.total_quantity)}</span></div>
                          <p>{deduction.items?.map((item) => `${item.product?.name || 'Item'} × ${formatNumber(item.quantity)}`).join(', ')}</p>
                          <small>{deduction.recorded_by?.full_name || 'Branch operator'} · {formatDate(deduction.created_at, true)}</small>
                        </article>
                      ))}
                    </div>
                  )}
                </aside>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
