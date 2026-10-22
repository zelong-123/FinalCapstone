import React, { useState } from 'react';
import {
  FaArrowTrendUp,
  FaBoxesStacked,
  FaChartPie,
  FaCircleCheck,
  FaClipboardCheck,
  FaClipboardList,
  FaHandshake,
  FaLightbulb,
  FaTriangleExclamation,
  FaTruckFast,
  FaUserGroup,
} from 'react-icons/fa6';
import { api } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, formatNumber, titleCase } from '../lib/format';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge } from '../components/ApiUi';
import { useAuth } from '../context/AuthContext';

function Metric({ label, value, suffix = '', Icon = FaChartPie, tone = '', caption }) {
  return (
    <article className={`metric-card${tone ? ` metric-tone-${tone}` : ''}`}>
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon /></span></div>
      <div><strong>{value}{suffix}</strong>{caption && <div className="metric-caption">{caption}</div>}</div>
    </article>
  );
}

function SalesTrendChart({ rows, period, onPeriodChange }) {
  const trend = rows || [];
  const peak = Math.max(1, ...trend.map((row) => Number(row.quantity || 0)));
  const peakIndex = trend.reduce(
    (best, row, index) => (Number(row.quantity || 0) > Number(trend[best]?.quantity || 0) ? index : best),
    0,
  );

  return (
    <section className="data-panel">
      <div className="panel-title">
        <div className="panel-heading-copy">
          <h2>Sales trend</h2>
          <span>Branches are not trading yet, so the trend reads zero.</span>
        </div>
        <div className="tabs" style={{ margin: 0 }}>
          {['month', 'year'].map((option) => (
            <button
              key={option}
              type="button"
              className={`tab${period === option ? ' active' : ''}`}
              onClick={() => onPeriodChange(option)}
            >
              {option === 'month' ? 'By month' : 'By year'}
            </button>
          ))}
        </div>
      </div>
      {!trend.length ? (
        <EmptyState label="No sales recorded yet." detail="Sales trend appears once a branch records a sale." />
      ) : (
        <>
          <div className="bar-graph">
            {trend.map((row, index) => (
              <div className="bar-graph-col" key={row.period}>
                <span className="bar-graph-value">{formatNumber(row.quantity, 1)}</span>
                <div
                  className={`bar-graph-bar${index === peakIndex ? ' is-peak' : ''}`}
                  style={{ height: `${Math.max(2, (Number(row.quantity || 0) / peak) * 100)}%` }}
                  title={`${row.label}: ${row.quantity} units across ${row.sales} sales`}
                />
                <span className="bar-graph-label">{row.label}</span>
              </div>
            ))}
          </div>
          <p className="muted-note" style={{ padding: '0 18px 16px' }}>
            Quantity sold per {period === 'year' ? 'year' : 'month'} across all branches.
          </p>
        </>
      )}
    </section>
  );
}

function FranchisingInsights({ data }) {
  const insights = data?.insights || [];
  const alerts = data?.alerts || [];
  return (
    <section className="data-panel">
      <div className="panel-title">
        <div className="panel-heading-copy">
          <h2>Insights</h2>
          <span>What the network is telling you right now</span>
        </div>
      </div>
      <div className="insight-list">
        {!insights.length ? (
          <span className="muted-note">No insights available yet.</span>
        ) : insights.map((insight) => (
          <div className="insight-item" key={`${insight.type}-${insight.message}`}>
            <FaLightbulb aria-hidden="true" />
            <span>{insight.message}</span>
          </div>
        ))}
      </div>
      <div className="panel-title compact">
        <div className="panel-heading-copy">
          <h2>Alerts &amp; warnings</h2>
          <span>Items that need attention</span>
        </div>
      </div>
      <div className="alert-list">
        {!alerts.length ? (
          <div className="alert-item severity-clear">
            <FaCircleCheck aria-hidden="true" />
            <span>No warnings. Every branch, applicant, and supply request is on track.</span>
          </div>
        ) : alerts.map((alert) => (
          <div className={`alert-item severity-${alert.severity}`} key={alert.message}>
            <FaTriangleExclamation aria-hidden="true" />
            <span>{alert.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopBranches({ branches }) {
  const rows = branches || [];
  const max = Math.max(1, ...rows.map((row) => Number(row.quantity || 0)));
  return (
    <section className="data-panel">
      <div className="panel-title">
        <div className="panel-heading-copy">
          <h2>Top performing branches</h2>
          <span>Ranked by quantity sold</span>
        </div>
      </div>
      {!rows.length ? (
        <EmptyState label="No branch sales recorded yet." detail="Rankings appear once branches start recording sales." />
      ) : rows.map((branch) => (
        <div className="bar-row" key={branch.location_id}>
          <span>{branch.name}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(Number(branch.quantity || 0) / max) * 100}%` }} />
          </div>
          <strong>{formatNumber(branch.quantity, 1)}</strong>
        </div>
      ))}
    </section>
  );
}

function RecentApplications({ applications }) {
  const rows = applications || [];
  return (
    <section className="data-panel">
      <div className="panel-title">
        <div className="panel-heading-copy">
          <h2>Recent franchise applications</h2>
          <span>Newest candidates in the pipeline</span>
        </div>
      </div>
      {!rows.length ? (
        <EmptyState label="No franchise applications yet." detail="Applications appear here as soon as a candidate is added." />
      ) : (
        <div className="mini-list">
          {rows.map((applicant) => (
            <div key={applicant.id}>
              <span>
                {applicant.full_name}
                <small className="muted-note"> · {applicant.brand || 'No brand'} · {formatDate(applicant.application_date)}</small>
              </span>
              <StatusBadge value={applicant.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Transaction legend: the same transaction types the PDF asked to see.
const transactionTypeLabels = {
  opening: 'Receipt · opening stock',
  adjustment_in: 'Adjustment · stock in',
  adjustment_out: 'Adjustment · stock out',
  consumption: 'Branch deduction',
  fulfillment: 'Issue / dispatched to branch',
  replenishment: 'Delivery confirmation · branch received',
};

function TransactionBadge({ type }) {
  return <StatusBadge value={transactionTypeLabels[type] || type} />;
}

function TransactionsPanel({ compact = false }) {
  const { data, loading, error } = useRemote(
    async () => (await api.get('/inventory-transactions', { per_page: compact ? 8 : 15 })).data,
    [],
  );
  if (loading) return <LoadingState label="Loading transaction records…" />;
  if (error) return <Notice type="error">{error}</Notice>;

  return (
    <section className="data-panel">
      <div className="panel-title">
        <div className="panel-heading-copy">
          <h2>Transaction records</h2>
          <span>Receipts, dispatches, delivery confirmations, branch deductions, and adjustments</span>
        </div>
      </div>
      {!data?.data?.length ? (
        <EmptyState label="No transactions recorded yet." detail="Stock movements appear here as they happen." />
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>Type</th><th>Product</th><th>Location</th><th>Change</th><th>Balance after</th><th>Recorded by</th></tr></thead>
          <tbody>
            {data.data.map((row) => {
              const change = Number(row.quantity || 0);
              return (
                <tr key={row.id}>
                  <td>{formatDate(row.transaction_date, true)}</td>
                  <td><TransactionBadge type={row.type} /></td>
                  <td><strong>{row.inventory?.product?.name || '—'}</strong></td>
                  <td>{row.inventory?.location?.name || '—'}</td>
                  <td style={{ color: change >= 0 ? 'var(--success-text, #16a34a)' : 'var(--danger-text, #dc2626)', fontWeight: 700 }}>
                    {change >= 0 ? `+${formatNumber(change)}` : `−${formatNumber(Math.abs(change))}`}
                  </td>
                  <td>{formatNumber(row.balance_after)}</td>
                  <td>{row.recorded_by?.full_name || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

function LogisticsDashboard() {
  const { data, loading, error } = useRemote(async () => {
    const [stats, inventory] = await Promise.all([
      api.get('/supply-requests/stats'),
      api.get('/inventories', { per_page: 100, location_type: 'warehouse' }),
    ]);
    return { stats: stats.data, inventory: inventory.data };
  }, []);

  if (loading) return <LoadingState label="Loading logistics command center…" />;
  if (error) return <Notice type="error">{error}</Notice>;

  const byStatus = data?.stats?.by_status || {};
  const items = data?.inventory || [];
  const lowCount = items.filter((item) => item.stock_status === 'low').length;
  const criticalCount = items.filter((item) => item.stock_status === 'critical').length;
  const dispatchQueue = (byStatus.endorsed || 0) + (byStatus.preparing || 0);

  return (
    <>
      <div className="metric-grid">
        <Metric label="Open supply requests" value={formatNumber(data?.stats?.active)} Icon={FaClipboardList} tone="purple" caption="Awaiting dispatch across branches" />
        <Metric label="Dispatch queue" value={formatNumber(dispatchQueue)} Icon={FaTruckFast} caption="Endorsed or preparing right now" />
        <Metric label="Overdue shipments" value={formatNumber(data?.stats?.overdue)} Icon={FaTriangleExclamation} tone={Number(data?.stats?.overdue) > 0 ? 'danger' : 'success'} caption="Past the target delivery date" />
        <Metric label="Completed this month" value={formatNumber(data?.stats?.completed_this_month)} Icon={FaCircleCheck} tone="success" caption={`Avg ${formatNumber(data?.stats?.avg_fulfillment_days, 1)} days to fulfill`} />
        <Metric label="Warehouse items" value={items.length} Icon={FaBoxesStacked} caption="Central stock records monitored" />
        <Metric label="Low / critical stock" value={`${lowCount} / ${criticalCount}`} Icon={FaTriangleExclamation} tone={criticalCount ? 'danger' : lowCount ? 'warning' : 'success'} caption="Warehouse items needing restock" />
      </div>

      <section className="data-panel">
        <div className="panel-title"><div className="panel-heading-copy"><h2>Supply pipeline</h2><span>Orders by workflow stage</span></div></div>
        <div className="mini-list">
          {[
            ['submitted', 'Submitted'],
            ['under_review', 'Under review'],
            ['endorsed', 'Endorsed'],
            ['preparing', 'Preparing'],
            ['dispatched', 'Dispatched'],
            ['delivered', 'Delivered — awaiting completion'],
            ['completed', 'Completed'],
            ['rejected', 'Rejected'],
            ['cancelled', 'Cancelled'],
          ].map(([key, label]) => (
            <div key={key}><span>{label}</span><strong>{formatNumber(byStatus[key] || 0)}</strong></div>
          ))}
        </div>
      </section>

      <section className="data-panel">
        <div className="panel-title"><div className="panel-heading-copy"><h2>Warehouse inventory health</h2><span>Threshold distribution for central stock</span></div></div>
        <div className="inventory-health">
          <div><StatusBadge value="normal" /><strong>{items.filter((item) => item.stock_status === 'normal').length}</strong></div>
          <div><StatusBadge value="low" /><strong>{lowCount}</strong></div>
          <div><StatusBadge value="critical" /><strong>{criticalCount}</strong></div>
        </div>
        {!items.length ? <EmptyState label="No warehouse inventory configured yet." /> : (
          <div className="mini-list">
            {items.filter((item) => item.stock_status !== 'normal').slice(0, 8).map((item) => (
              <div key={item.id}><span>{item.product?.name || 'Item'}<small className="muted-note"> · {item.location?.name || ''}</small></span><strong>{formatNumber(item.current_stock)} {item.product?.unit || ''}</strong></div>
            ))}
          </div>
        )}
      </section>

      <TransactionsPanel />
    </>
  );
}

function FranchisingPanel() {
  const [period, setPeriod] = useState('month');
  const remote = useRemote(
    async () => (await api.get('/analytics/franchising-dashboard', { period })).data,
    [period],
  );
  if (remote.loading) return <LoadingState label="Loading franchising analytics…" />;
  if (remote.error) return <Notice type="error">{remote.error}</Notice>;
  const data = remote.data;

  return (
    <>
      <div className="content-grid two-columns">
        <TopBranches branches={data?.top_branches} />
        <FranchisingInsights data={data} />
      </div>
      <SalesTrendChart rows={data?.sales_trend} period={period} onPeriodChange={setPeriod} />
      <div className="content-grid two-columns">
        <RecentApplications applications={data?.recent_applications} />
        <section className="data-panel">
          <div className="panel-title">
            <div className="panel-heading-copy">
              <h2>Franchising summary</h2>
              <span>Network position at a glance</span>
            </div>
          </div>
          <div className="mini-list">
            <div><span>Active applicants</span><strong>{formatNumber(data?.summary?.active_applicants)}</strong></div>
            <div><span>Active franchisees</span><strong>{formatNumber(data?.summary?.active_franchisees)}</strong></div>
            <div><span>Branches reporting sales</span><strong>{formatNumber(data?.summary?.branches_with_sales)}</strong></div>
          </div>
        </section>
      </div>
    </>
  );
}

function AnalyticsDashboard() {
  const { data, loading, error } = useRemote(async () => (await api.get('/analytics/overview')).data, []);
  const { role } = useAuth();
  if (loading) return <LoadingState label="Loading live dashboard…" />;
  if (error) return <Notice type="error">{error}</Notice>;
  const kpis = data?.kpis || {};
  const sources = Object.entries(data?.inquiries_by_source || {});
  const maxSource = Math.max(1, ...sources.map(([, count]) => Number(count)));
  const conversion = Number(kpis.conversion_rate_percent || 0);
  const fulfillment = Number(kpis.fulfillment_rate_percent || 0);
  const showFranchising = ['admin', 'sales'].includes(role);

  return (
    <>
      <section className="insight-banner">
        <div className="insight-copy">
          <span className="page-eyebrow">Network pulse</span>
          <h2>{conversion >= 20 && fulfillment >= 80 ? 'Operations are performing from a position of strength.' : 'Your network has clear opportunities for focused improvement.'}</h2>
          <p>Herald is combining live pipeline, applicant, inventory, and fulfillment data into this executive view.</p>
        </div>
        <div className="insight-signal"><span className="signal-rings"><FaArrowTrendUp /></span><div><strong>{formatNumber(conversion, 1)}%</strong><small>lead conversion</small></div></div>
      </section>

      <div className="metric-grid">
        <Metric label="Total inquiries" value={formatNumber(kpis.total_inquiries)} Icon={FaHandshake} caption="All recorded franchise leads" />
        <Metric label="Active applicants" value={formatNumber(kpis.active_applicants)} Icon={FaUserGroup} tone="purple" caption="Candidates currently progressing" />
        <Metric label="Conversion rate" value={formatNumber(conversion, 2)} suffix="%" Icon={FaArrowTrendUp} tone="success" caption="Inquiry-to-applicant performance" />
        <Metric label="Supply requests" value={formatNumber(kpis.supply_requests)} Icon={FaClipboardCheck} caption="Orders across the network" />
        <Metric label="Fulfillment rate" value={formatNumber(fulfillment, 2)} suffix="%" Icon={FaTruckFast} tone={fulfillment >= 80 ? 'success' : 'warning'} caption="Completed supply workflow" />
        <Metric label="Critical stock" value={formatNumber(kpis.critical_inventory_items)} Icon={FaTriangleExclamation} tone={Number(kpis.critical_inventory_items) > 0 ? 'danger' : 'success'} caption="Items requiring attention" />
      </div>

      <div className="content-grid two-columns">
        <section className="data-panel">
          <div className="panel-title"><div className="panel-heading-copy"><h2>Inquiry acquisition</h2><span>Lead volume by source</span></div></div>
          {sources.length === 0 ? <EmptyState /> : sources.map(([source, count]) => (
            <div className="bar-row" key={source}>
              <span>{titleCase(source)}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(Number(count) / maxSource) * 100}%` }} /></div>
              <strong>{count}</strong>
            </div>
          ))}
        </section>

        <section className="data-panel">
          <div className="panel-title"><div className="panel-heading-copy"><h2>Inventory health</h2><span>Current threshold distribution</span></div></div>
          <div className="inventory-health">
            {Object.entries(data?.inventory_status || {}).map(([status, count]) => (
              <div key={status}><StatusBadge value={status} /><strong>{count}</strong></div>
            ))}
          </div>
          <div className="panel-title compact"><div className="panel-heading-copy"><h2>Applicant funnel</h2><span>Candidate stages across the pipeline</span></div></div>
          <div className="mini-list">
            {Object.entries(data?.applicant_funnel || {}).map(([status, count]) => (
              <div key={status}><span>{titleCase(status)}</span><strong>{count}</strong></div>
            ))}
          </div>
        </section>
      </div>

      {showFranchising && <FranchisingPanel />}
    </>
  );
}

function FranchiseeDashboard() {
  const { data, loading, error } = useRemote(async () => {
    const [applicants, inventories, requests] = await Promise.all([
      api.get('/applicants', { per_page: 10 }),
      api.get('/inventories', { per_page: 100 }),
      api.get('/supply-requests', { per_page: 20 }),
    ]);
    return { applicants: applicants.data, inventories: inventories.data, requests: requests.data };
  }, []);
  if (loading) return <LoadingState label="Loading franchise overview…" />;
  if (error) return <Notice type="error">{error}</Notice>;
  const critical = data.inventories.filter((item) => item.stock_status === 'critical').length;
  const openRequests = data.requests.filter((item) => !['completed', 'cancelled', 'rejected'].includes(item.status)).length;

  return (
    <>
      <section className="insight-banner">
        <div className="insight-copy"><span className="page-eyebrow">Your franchise pulse</span><h2>Everything important to your application and operation in one place.</h2><p>Use this overview to prioritize application milestones, stock risks, and open supply requests.</p></div>
        <div className="insight-signal"><span className="signal-rings"><FaBoxesStacked /></span><div><strong>{data.inventories.length}</strong><small>tracked stock items</small></div></div>
      </section>
      <div className="metric-grid franchise-metrics">
        <Metric label="Application status" value={titleCase(data.applicants[0]?.status || 'Not available')} Icon={FaUserGroup} tone="purple" caption="Current franchise journey stage" />
        <Metric label="Inventory items" value={data.inventories.length} Icon={FaBoxesStacked} caption="Products currently monitored" />
        <Metric label="Critical stock" value={critical} Icon={FaTriangleExclamation} tone={critical ? 'danger' : 'success'} caption="Items needing replenishment" />
        <Metric label="Open requests" value={openRequests} Icon={FaTruckFast} tone={openRequests ? 'warning' : 'success'} caption="Supply orders still in progress" />
      </div>
      <section className="data-panel">
        <div className="panel-title"><div className="panel-heading-copy"><h2>Latest supply requests</h2><span>Your most recent fulfillment activity</span></div></div>
        {data.requests.length === 0 ? <EmptyState /> : (
          <div className="table-wrap"><table><thead><tr><th>Request</th><th>Location</th><th>Status</th><th>Delivery date</th></tr></thead><tbody>
            {data.requests.slice(0, 8).map((request) => <tr key={request.id}><td><strong>{request.request_number}</strong></td><td>{request.location?.name || '—'}</td><td><StatusBadge value={request.status} /></td><td>{request.target_delivery_date || '—'}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}

export default function Dashboard() {
  const { user, role } = useAuth();
  const firstName = user?.full_name?.split(' ')[0] || 'there';

  // Logistics sees supply records and inventory status only — no inquiry KPIs —
  // plus the transaction record backup panel.
  if (role === 'logistics') {
    return (
      <div className="page-container">
        <PageHeader title={`Good to see you, ${firstName}.`} subtitle="Live supply records, warehouse inventory status, and stock movement transactions." eyebrow="Logistics command center" />
        <LogisticsDashboard />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader title={`Good to see you, ${firstName}.`} subtitle={`Your live ${titleCase(role)} command center is connected to the Herald API.`} eyebrow="Operational command center" />
      <AnalyticsDashboard />
      {role === 'admin' && <TransactionsPanel />}
    </div>
  );
}
