import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { api, type Subscription } from '../api'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

export function RecoveryPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [counts, setCounts] = useState({ total: 0, retrying: 0, pastDue: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const load = async () => {
    setError('')
    try {
      const queue = await api.getRetryQueue()
      setSubscriptions(queue.subscriptions)
      setCounts({ total: queue.total, retrying: queue.retrying, pastDue: queue.pastDue })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load recovery queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const retry = async (subscription: Subscription) => {
    setRetryingId(subscription.id)
    setError('')
    try {
      await api.triggerRetry(subscription.id)
      await load()
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Unable to retry payment')
    } finally {
      setRetryingId(null)
    }
  }

  if (loading) return <LoadingState />

  return <div className="page-content">
    <PageHeader eyebrow="Recovery" title="Payment recovery" copy="Review failed collections and retry payments that need attention." />
    {error && <ErrorState message={error} />}
    <section className="metric-grid">
      <Metric label="In recovery" value={counts.total} />
      <Metric label="Retrying" value={counts.retrying} />
      <Metric label="Past due" value={counts.pastDue} />
    </section>
    <section className="data-panel recovery-panel">
      <div className="panel-title"><div><div className="eyebrow">Needs attention</div><h2>{subscriptions.length} members</h2></div></div>
      {subscriptions.length ? <div className="list-rows">{subscriptions.map(subscription => <div className="list-row" key={subscription.id}>
        <span className={`status-dot ${subscription.status.toLowerCase()}`} />
        <span><b>{subscription.customerPhone}</b><small>{subscription.plan?.name ?? 'Membership plan'} · {subscription.status.replace('_', ' ')}</small></span>
        <span className="row-actions"><strong>{new Date(subscription.nextBillingDate).toLocaleDateString()}</strong><button className="icon-button" aria-label={`Retry payment for ${subscription.customerPhone}`} disabled={retryingId === subscription.id} onClick={() => void retry(subscription)}><RotateCcw size={15} /></button></span>
      </div>)}</div> : <EmptyState title="Nothing to recover" copy="Failed and past-due payments will appear here." />}
    </section>
  </div>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric-card neutral"><span>{label}</span><strong>{value}</strong><small>Current queue</small></div>
}
