import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaAngleLeft,
  FaAngleRight,
  FaArrowUpRightFromSquare,
  FaBoxesStacked,
  FaCircleExclamation,
  FaClipboardList,
  FaCommentDots,
  FaRotate,
  FaStore,
  FaTriangleExclamation,
} from 'react-icons/fa6';
import { api } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, formatNumber } from '../lib/format';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge } from '../components/ApiUi';
import './Branches.css';

import dailyDashLogo from '../assets/dailydash.png';
import goDoLogo from '../assets/Godo.png';
import kkopiLogo from '../assets/kkopi.png';
import laPastaLogo from '../assets/lapasta.png';

const metrics = [
  ['active_branches', 'Active branches', FaStore, 'Connected branch portals'],
  ['total_units', 'Branch units', FaBoxesStacked, 'Combined stock on hand'],
  ['low_stock_items', 'Low-stock items', FaTriangleExclamation, 'At or below reorder level'],
  ['critical_stock_items', 'Critical items', FaCircleExclamation, 'Immediate attention needed'],
  ['open_requests', 'Open requests', FaClipboardList, 'Awaiting completion'],
];

// Keys are normalized brand codes/names (lowercase, letters only)
const BRANDS = {
  dailydash: { label: 'Daily Dash', color: '#0565D6', logo: dailyDashLogo },
  kkopi: { label: 'K-Kopi', color: '#F97D1B', logo: kkopiLogo },
  lapasta: { label: 'La Pasta', color: '#AF2525', logo: laPastaLogo },
  godo: { label: 'Go Do', color: '#769D32', logo: goDoLogo },
};
const FALLBACK_BRAND = { label: '', color: '#475569', logo: null };

const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z]/g, '');

function getBrand(branch) {
  return BRANDS[normalize(branch.brand?.code)] || BRANDS[normalize(branch.brand?.name)] || FALLBACK_BRAND;
}

/*
  Every size inside the card is written in `cqw` (1% of the card's own width),
  so the banner, notch, logo and text scale together at any zoom level or column count.
*/
function BranchCard({ branch, active, onSelect }) {
  const brand = getBrand(branch);
  const brandName = branch.brand?.name || brand.label;
  const risk = branch.critical_stock_count > 0 ? 'critical' : branch.low_stock_count > 0 ? 'low' : 'normal';

  return (
    <div className="branch-card-cell">
      <button
        type="button"
        className={`branch-card${active ? ' is-active' : ''}`}
        onClick={onSelect}
        aria-pressed={active}
      >
        <span className="branch-card__banner" style={{ '--brand-color': brand.color }}>
          <span className="branch-card__bar" />
          <span className="branch-card__notch" />
          <span className="branch-card__code">{branch.branch_code}</span>
          <span className="branch-card__logo-block">
            {brand.logo ? (
              <img className="branch-card__logo" src={brand.logo} alt={`${brandName} logo`} draggable="false" />
            ) : (
              <span className="branch-card__logo-fallback">{brandName || '—'}</span>
            )}
          </span>
          <span className="branch-card__status"><StatusBadge value={risk} /></span>
        </span>

        <span className="branch-card__body">
          <strong className="branch-card__name">{branch.name}</strong>
          <small className="branch-card__address">{branch.address || 'Address not provided'}</small>
          <span className="branch-card__stats">
            <span><b>{formatNumber(branch.total_units)}</b><small>units</small></span>
            <span><b>{formatNumber(branch.open_request_count)}</b><small>requests</small></span>
          </span>
        </span>
      </button>
    </div>
  );
}

export default function Branches() {
  const [selectedCode, setSelectedCode] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [sortByBrand, setSortByBrand] = useState(false);
  const detailScrollRef = useRef(null);
  const remote = useRemote(() => api.get('/branches/overview'), []);
  const payload = remote.data?.data;
  const branches = useMemo(() => payload?.branches || [], [payload?.branches]);

  useEffect(() => {
    if (!branches.length) {
      setSelectedCode('');
      return;
    }
    if (!selectedCode || !branches.some((b) => b.branch_code === selectedCode)) {
      setSelectedCode(branches[0].branch_code);
    }
  }, [branches, selectedCode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void remote.reload({ silent: true });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [remote.reload]);

  // Start at the top of the info panel whenever another branch is picked
  useEffect(() => {
    detailScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedCode]);

  const selected = branches.find((b) => b.branch_code === selectedCode) || branches[0];

  const visibleBranches = useMemo(() => {
    if (!sortByBrand) return branches;
    return [...branches].sort((a, b) => (a.brand?.name || '').localeCompare(b.brand?.name || ''));
  }, [branches, sortByBrand]);

  const selectBranch = (code) => {
    setSelectedCode(code);
    setPanelOpen(true);
  };

  return (
    <div className="page-container branches-page">
      <PageHeader
        eyebrow="Network operations"
        title="Branches"
        subtitle="A dedicated command panel for branch stock, deductions, alerts, and requests. Warehouse inventory remains separate."
        actions={(
          <div className="branches-header-actions">
            <span className="live-sync-label">Live sync · 3 seconds</span>
            <button type="button" onClick={() => remote.reload()} disabled={remote.loading}>
              <FaRotate aria-hidden="true" /> Refresh
            </button>
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

          <section className={`branches-layout${panelOpen ? ' has-panel' : ''}`}>
            {/* LEFT: branch list */}
            <div className="branches-list-panel">
              <header className="branches-list-head">
                <h2>BRANCHES</h2>
                <div className="branches-list-actions">
                  {!panelOpen && (
                    <button type="button" className="branches-pill-btn" onClick={() => setPanelOpen(true)}>
                      <FaAngleLeft aria-hidden="true" /> DETAILS
                    </button>
                  )}
                  <button
                    type="button"
                    className={`branches-pill-btn${sortByBrand ? ' is-on' : ''}`}
                    onClick={() => setSortByBrand((v) => !v)}
                    aria-pressed={sortByBrand}
                  >
                    SORT
                  </button>
                </div>
              </header>
              <div className="branches-grid" aria-label="Choose a branch">
                {visibleBranches.map((branch) => (
                  <BranchCard
                    key={branch.id}
                    branch={branch}
                    active={panelOpen && branch.branch_code === selected?.branch_code}
                    onSelect={() => selectBranch(branch.branch_code)}
                  />
                ))}
              </div>
            </div>

            {/* RIGHT: selected branch info (always mounted so it can slide) */}
            <aside
              className={`branch-detail-panel${panelOpen ? ' is-open' : ''}`}
              aria-label="Selected branch information"
              aria-hidden={!panelOpen}
            >
              <div className="branch-detail-inner">
                <button
                  type="button"
                  className="branch-detail-close"
                  onClick={() => setPanelOpen(false)}
                  aria-label="Close branch details"
                  title="Close section"
                  tabIndex={panelOpen ? 0 : -1}
                >
                  <FaAngleRight aria-hidden="true" />
                </button>

                <div className="branch-detail-scroll" ref={detailScrollRef}>
                  {selected && (
                    <>
                      <header className="branch-workspace-head">
                        <div>
                          <span className="page-eyebrow">{selected.branch_code}</span>
                          <h2>{selected.name}</h2>
                          <p>{selected.address || 'No address provided'}{selected.operator?.full_name ? ` · Operator: ${selected.operator.full_name}` : ''}</p>
                        </div>
                        <div className="branch-quick-actions">
                        {/* <button type="button" className="primary-button small"><FaClipboardList aria-hidden="true" /> Create supply request</button>*/}
                          <a className="branch-portal-link" href={selected.portal_path} target="_blank" rel="noreferrer">Open branch portal <FaArrowUpRightFromSquare aria-hidden="true" /></a>
                        {/* <button type="button" className="ghost-button small"><FaCommentDots aria-hidden="true" /> Message operator</button> */}
                        </div>
                      </header>

                      <div className="branch-workspace-detail-grid">
                        <section className="data-panel branch-stock-panel">
                          <div className="panel-title">
                            <div className="panel-heading-copy"><strong>Brand Stock</strong><span>Separate from warehouse inventory</span></div>
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
                                  {item.estimated_days_left != null && (
                                    <small className="branch-stock-days">{item.estimated_days_left} day(s) left at current usage</small>
                                  )}
                                </article>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="data-panel branch-deduction-panel">
                          <div className="panel-title"><strong>Recent Deduction</strong><span>Latest stock usage</span></div>
                          {/* Change `recent_deductions` to whatever field your API returns */}
                          {!selected.recent_deductions?.length ? <EmptyState label="No recent deductions." /> : (
                            <div className="branch-activity-list">
                              {selected.recent_deductions.map((d, idx) => (
                                <article className="branch-activity-item" key={d.id ?? idx}>
                                  <div className="branch-activity-top">
                                    <strong>{d.product?.name || d.label || 'Item'}</strong>
                                    <span>− {formatNumber(d.quantity)}</span>
                                  </div>
                                  <small>{formatDate(d.created_at, true)}</small>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="data-panel branch-supply-panel">
                          <div className="panel-title"><strong>Active supply requests</strong><span>This branch</span></div>
                          {!selected.open_supply_requests?.length ? <EmptyState label="No active supply requests." /> : (
                            <div className="branch-activity-list">
                              {selected.open_supply_requests.map((request) => (
                                <article className="branch-activity-item" key={request.id}>
                                  <div className="branch-activity-top"><strong>{request.request_number}</strong><span className={request.status === 'dispatched' || request.status === 'delivered' ? 'status-future' : ''}>{request.status}</span></div>
                                  <p>{request.items?.map((item) => `${item.product?.name || 'Item'} × ${formatNumber(item.quantity_requested)}`).join(', ') || '—'}</p>
                                  <small>{formatDate(request.target_delivery_date)}</small>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="data-panel branch-attention-panel">
                          <div className="panel-title"><strong>Needs attention</strong><span>Alerts for this branch</span></div>
                          {!selected.needs_attention?.length ? <EmptyState label="No items need attention right now." /> : (
                            <div className="branch-activity-list">
                              {selected.needs_attention.map((item, idx) => (
                                <article className="branch-activity-item" key={idx}>
                                  <div className="branch-activity-top"><strong>{item.label}</strong><span className="status-future">{item.alert}</span></div>
                                  <small>{item.detail}</small>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="data-panel branch-delivery-panel">
                          <div className="panel-title"><strong>Delivery status</strong><span>Last received &amp; next target</span></div>
                          <div className="delivery-status-row">
                            <div><span className="delivery-label">Last received</span><span className="delivery-value">{selected.last_delivery ? formatDate(selected.last_delivery.delivered_at) : 'No delivery recorded'}</span></div>
                            <div><span className="delivery-label">Next incoming target</span><span className="delivery-value">{selected.next_delivery_target || 'No pending delivery'}</span></div>
                          </div>
                        </section>

                        <section className="data-panel branch-consumption-panel">
                          <div className="panel-title"><strong>Consumption metrics</strong><span>Average daily usage</span></div>
                          {!selected.inventory?.length ? <EmptyState label="No inventory configured." /> : (
                            <div className="branch-activity-list">
                              {selected.inventory.filter((item) => item.estimated_days_left != null).slice(0, 6).map((item, idx) => (
                                <article className="branch-activity-item" key={idx}>
                                  <div className="branch-activity-top"><strong>{item.product?.name || 'Item'}</strong><span>{item.estimated_days_left} day average</span></div>
                                  <small>{formatNumber(item.current_stock)} units remaining</small>
                                </article>
                              ))}
                            </div>
                          )}
                        </section>

                        <details className="branch-info-collapsible">
                          <summary>Branch info</summary>
                          <div className="branch-info-body">
                            <div className="branch-info-row"><span>Operator</span><span>{selected.operator?.full_name || '—'}</span></div>
                            <div className="branch-info-row"><span>Contact</span><span>{selected.operator?.phone || selected.contact_number || '—'}</span></div>
                            <div className="branch-info-row"><span>Address</span><span>{selected.address || '—'}</span></div>
                            <div className="branch-info-row"><span>Last sync</span><span>{formatDate(payload?.server_time, true)}</span></div>
                          </div>
                        </details>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
