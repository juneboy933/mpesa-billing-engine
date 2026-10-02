import { useEffect, useState } from 'react';
import { api, type Analytics } from '../api';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';

export function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .getAnalytics()
      .then(setData)
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load analytics',
        ),
      );
  }, []);
  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;
  const max = Math.max(1, ...data.revenueTrend.map((point) => point.revenue));
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Analytics"
        title="Understand your collections"
        copy="A simple view of recurring revenue and recovery health."
      />
      <section className="metric-grid">
        <div className="metric-card positive">
          <span>Total revenue</span>
          <strong>KES {data.totalRevenue.toLocaleString()}</strong>
          <small>Successful collections</small>
        </div>
        <div className="metric-card neutral">
          <span>Recurring revenue</span>
          <strong>KES {data.monthlyRecurringRevenue.toLocaleString()}</strong>
          <small>Active plans</small>
        </div>
        <div className="metric-card warning">
          <span>Failed payments</span>
          <strong>{data.failedPayments}</strong>
          <small>Needs recovery</small>
        </div>
      </section>
      <section className="data-panel chart-panel">
        <div className="eyebrow">Last seven days</div>
        <h2>Revenue trend</h2>
        <div className="bar-chart">
          {data.revenueTrend.map((point) => (
            <div className="bar-column" key={point.date}>
              <span
                style={{
                  height: `${Math.max(6, (point.revenue / max) * 100)}%`,
                }}
              />
              <small>
                {new Date(point.date).toLocaleDateString(undefined, {
                  weekday: 'short',
                })}
              </small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
