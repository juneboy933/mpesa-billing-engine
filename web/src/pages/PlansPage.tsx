import { type FormEvent, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, type Plan } from '../api';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/States';

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try {
      setPlans(await api.getPlans());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Unable to load plans',
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createPlan(name.trim(), Number(amount));
      setName('');
      setAmount('');
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to create plan',
      );
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <LoadingState />;
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Plans"
        title="Membership plans"
        copy="Keep pricing simple for your members and easy to manage for your team."
        action={
          <button
            className="primary-button"
            onClick={() => document.getElementById('new-plan-name')?.focus()}
          >
            <Plus size={16} /> New plan
          </button>
        }
      />
      {error && <ErrorState message={error} />}
      <div className="content-grid">
        <section className="data-panel">
          <div className="panel-title">
            <div>
              <div className="eyebrow">Active catalogue</div>
              <h2>{plans.length} plans</h2>
            </div>
          </div>
          {plans.length ? (
            <div className="list-rows">
              {plans.map((plan) => (
                <div className="list-row" key={plan.id}>
                  <span className="plan-dot" />
                  <span>
                    <b>{plan.name}</b>
                    <small>{plan.interval.toLowerCase()} billing</small>
                  </span>
                  <strong>KES {Number(plan.amount).toLocaleString()}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No plans yet"
              copy="Create your first membership plan to start collecting."
            />
          )}
        </section>
        <form className="data-panel form-panel" onSubmit={submit}>
          <div className="eyebrow">Create a plan</div>
          <h2>New membership</h2>
          <label htmlFor="new-plan-name">Plan name</label>
          <input
            id="new-plan-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Monthly membership"
            required
          />
          <label htmlFor="new-plan-amount">Monthly price</label>
          <div className="input-with-suffix">
            <input
              id="new-plan-amount"
              type="number"
              min="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="2500"
              required
            />
            <span>KES</span>
          </div>
          <button className="primary-button wide" disabled={saving}>
            {saving ? 'Creating...' : 'Create plan'}
          </button>
        </form>
      </div>
    </div>
  );
}
