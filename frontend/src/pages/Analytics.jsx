import React, { useState } from 'react';
import { FaArrowTrendUp, FaClock, FaRotate, FaTruckFast } from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, formatNumber, titleCase } from '../lib/format';
import { EmptyState, LoadingState, Notice, PageHeader, Pagination, StatusBadge } from '../components/ApiUi';
import { useAuth } from '../context/AuthContext';

function AnalyticsMetric({ label, value, suffix = '', Icon, tone = '', caption }) {
  return (
    <article className={`metric-card${tone ? ` metric-tone-${tone}` : ''}`}>
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon /></span></div>
      <div><strong>{value}{suffix}</strong><div className="metric-caption">{caption}</div></div>
    </article>
  );
}

export default function Analytics() {
  const { role } = useAuth();
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [generating, setGenerating] = useState(false);
  const remote = useRemote(async () => {
    const overview = await api.get('/analytics/overview');
    const forecasts = ['admin', 'logistics'].includes(role) ? await api.get('/forecasts', { page, per_page: 30 }) : { data: [], meta: null };
    return { overview: overview.data, forecasts: forecasts.data, meta: forecasts.meta };
  }, [role, page]);

  const generateForecasts = async () => {
    setGenerating(true);
    setActionError('');
    setSuccess('');
    try {
      await api.post('/forecasts/generate', { periods: 3 });
      setSuccess('Demand forecasts generated successfully using the latest inventory history.');
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setGenerating(false);
    }
  };

  if (remote.loading && !remote.data) return <div className="page-container"><LoadingState label="Loading analytics…" /></div>;
  const data = remote.data?.overview;

  return (
    <div className="page-container">
      <PageHeader
        title="Analytics & forecasting"
        subtitle="Turn operational history into performance visibility and forward-looking inventory decisions."
        actions={['admin', 'logistics'].includes(role) && <button className="primary-button" onClick={generateForecasts} disabled={generating}><FaRotate className={generating ? 'icon-spinning' : ''} /> {generating ? 'Generating…' : 'Generate forecasts'}</button>}
      />
      <Notice type="success">{success}</Notice>
      <Notice type="error">{actionError || remote.error}</Notice>
      {data && (
        <>
          <div className="metric-grid analytics-metrics">
            <AnalyticsMetric label="Inquiries" value={formatNumber(data.kpis.total_inquiries)} Icon={FaArrowTrendUp} caption="Recorded lead volume" />
            <AnalyticsMetric label="Conversion" value={formatNumber(data.kpis.conversion_rate_percent, 2)} suffix="%" Icon={FaArrowTrendUp} tone="success" caption="Inquiry-to-applicant rate" />
            <AnalyticsMetric label="Fulfillment" value={formatNumber(data.kpis.fulfillment_rate_percent, 2)} suffix="%" Icon={FaTruckFast} tone="success" caption="Completed supply requests" />
            <AnalyticsMetric label="Average fulfillment" value={data.kpis.average_fulfillment_hours == null ? '—' : formatNumber(data.kpis.average_fulfillment_hours, 1)} suffix={data.kpis.average_fulfillment_hours == null ? '' : ' hrs'} Icon={FaClock} tone="purple" caption="Request-to-completion time" />
          </div>

          <div className="content-grid two-columns">
            <section className="data-panel"><div className="panel-title"><div className="panel-heading-copy"><h2>Supply workflow distribution</h2><span>Requests grouped by current stage</span></div></div><div className="mini-list">{Object.entries(data.supply_statuses || {}).map(([key, value]) => <div key={key}><StatusBadge value={key} /><strong>{value}</strong></div>)}</div></section>
            <section className="data-panel"><div className="panel-title"><div className="panel-heading-copy"><h2>Recent inquiry trend</h2><span>Latest recorded lead periods</span></div></div>{!(data.inquiry_trend || []).length ? <EmptyState label="No trend data available." /> : <div className="mini-list">{data.inquiry_trend.slice(-8).map((row) => <div key={row.period}><span>{row.period}</span><strong>{row.count}</strong></div>)}</div>}</section>
          </div>
        </>
      )}

      {['admin', 'logistics'].includes(role) && (
        <section className="data-panel">
          <div className="panel-title"><div className="panel-heading-copy"><h2>Forecast history</h2><span>Product and location demand recommendations</span></div></div>
          {!remote.data?.forecasts.length ? <EmptyState label="No forecasts generated yet." detail="Generate forecasts after inventory history is available." /> : (
            <div className="table-wrap"><table><thead><tr><th>Product</th><th>Location</th><th>Method</th><th>Prediction</th><th>Recommended reorder</th><th>Generated</th></tr></thead><tbody>{remote.data.forecasts.map((forecast) => <tr key={forecast.id}><td><strong>{forecast.inventory?.product?.name || '—'}</strong></td><td>{forecast.inventory?.location?.name || '—'}</td><td>{titleCase(forecast.method)}</td><td>{formatNumber(forecast.predicted_quantity, 2)}</td><td><strong>{formatNumber(forecast.recommended_reorder_quantity, 2)}</strong></td><td>{formatDate(forecast.generated_at, true)}</td></tr>)}</tbody></table></div>
          )}
          <Pagination meta={remote.data?.meta} onPage={setPage} />
        </section>
      )}
    </div>
  );
}
