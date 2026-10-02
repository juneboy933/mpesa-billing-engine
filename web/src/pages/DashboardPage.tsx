import { useEffect, useState } from 'react';
import { ArrowRight, Check, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, type Analytics, type Dashboard } from '../api';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';

export function DashboardPage() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      setError('');
      const [nextDashboard, nextAnalytics] = await Promise.all([
        api.getDashboard(),
        api.getAnalytics(),
      ]);
      setDashboard(nextDashboard);
      setAnalytics(nextAnalytics);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load dashboard',
      );
    }
  };
  useEffect(() => {
    void load();
  }, []);
  if (error) return <ErrorState message={error} />;
  if (!dashboard || !analytics) return <LoadingState />;
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Overview"
        title="Your collection workspace"
        copy="Know what came in, what needs attention, and what is coming next."
        action={
          <button
            className="icon-button"
            onClick={() => void load()}
            title="Refresh dashboard"
          >
            <RefreshCcw size={17} />
          </button>
        }
      />
      <section className="metric-grid">
        <Metric
          label="Collected this period"
          value={`KES ${analytics.totalRevenue.toLocaleString()}`}
          tone="positive"
        />
        <Metric
          label="Active members"
          value={dashboard.metrics.activeSubscriptionsCount.toString()}
          tone="positive"
        />
        <Metric
          label="Monthly recurring revenue"
          value={`KES ${analytics.monthlyRecurringRevenue.toLocaleString()}`}
          tone="neutral"
        />
        <Metric
          label="Needs attention"
          value={analytics.retryingSubscriptions.toString()}
          tone="warning"
        />
      </section>
      <div className="content-grid">
        <section className="data-panel">
          <div className="panel-title">
            <div>
              <div className="eyebrow">Recent activity</div>
              <h2>Latest subscriptions</h2>
            </div>
            <button className="quiet-link" onClick={() => navigate('/subscriptions')}>
              View subscriptions <ArrowRight size={15} />
            </button>
          </div>
          {dashboard.recentSubscriptions.length ? (
            <div className="list-rows">
              {dashboard.recentSubscriptions.map((subscription) => (
                <div className="list-row" key={subscription.id}>
                  <span className="avatar blue">
                    {subscription.customerPhone.slice(-2)}
                  </span>
                  <span>
                    <b>{subscription.plan?.name ?? 'Membership plan'}</b>
                    <small>
                      {subscription.customerPhone} · {subscription.status}
                    </small>
                  </span>
                  <strong>
                    {subscription.nextBillingDate
                      ? new Date(
                          subscription.nextBillingDate,
                        ).toLocaleDateString()
                      : 'Not scheduled'}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-empty">
              Your first subscriptions will appear here.
            </p>
          )}
        </section>
        <section className="data-panel next-panel-light">
          <div className="eyebrow">Collection health</div>
          <h2>
            {analytics.failedPayments
              ? `${analytics.failedPayments} payments need attention`
              : 'Collections are clear'}
          </h2>
          <p>
            {analytics.failedPayments
              ? 'Review the recovery queue and reach out to members who need help.'
              : 'No failed payments have been recorded in this period.'}
          </p>
          <div className="health-bar">
            <span
              style={{
                width: `${Math.max(12, 100 - analytics.failedPayments * 8)}%`,
              }}
            />
          </div>
          <button className="quiet-link" onClick={() => navigate('/recovery')}>
            <Check size={14} /> Open recovery queue <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>
        {tone === 'warning' ? 'Review recovery queue' : 'Updated just now'}
      </small>
    </div>
  );
}
