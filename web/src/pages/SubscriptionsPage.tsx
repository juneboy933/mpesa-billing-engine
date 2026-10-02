import { type FormEvent, useEffect, useState } from 'react'
import { ArrowRight, CreditCard, FileText, Link2, RotateCcw } from 'lucide-react'
import { api, type Plan, type Subscription, type SubscriptionReceipts } from '../api'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

export function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalSubscriptions, setTotalSubscriptions] = useState(0)
  const [plans, setPlans] = useState<Plan[]>([])
  const [phone, setPhone] = useState('')
  const [planId, setPlanId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [receiptsFor, setReceiptsFor] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<SubscriptionReceipts | null>(null)
  const [receiptError, setReceiptError] = useState('')
  const [loadingReceipts, setLoadingReceipts] = useState(false)

  const load = async (requestedPage = page) => {
    setError('')
    try {
      const [management, nextPlans] = await Promise.all([api.getSubscriptionManagement(requestedPage), api.getPlans()])
      setSubscriptions(management.subscriptions)
      setPage(management.page)
      setTotalPages(management.totalPages)
      setTotalSubscriptions(management.totalSubscriptions)
      setPlans(nextPlans)
      if (!planId && nextPlans[0]) setPlanId(nextPlans[0].id)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load subscriptions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.createSubscription(planId, phone)
      setPhone('')
      await load(1)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create subscription')
    } finally {
      setSaving(false)
    }
  }

  const action = async (operation: () => Promise<unknown>, successMessage?: string) => {
    setError('')
    setNotice('')
    try {
      await operation()
      if (successMessage) setNotice(successMessage)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update subscription')
    }
  }

  const toggleReceipts = async (subscription: Subscription) => {
    if (receiptsFor === subscription.id) {
      setReceiptsFor(null)
      setReceipts(null)
      setReceiptError('')
      return
    }
    setReceiptsFor(subscription.id)
    setReceipts(null)
    setReceiptError('')
    setLoadingReceipts(true)
    try {
      setReceipts(await api.getReceipts(subscription.id))
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load receipts'
      setReceiptError(message.toLowerCase().includes('no payment receipts') ? '' : message)
    } finally {
      setLoadingReceipts(false)
    }
  }

  if (loading) return <LoadingState />

  return <div className="page-content">
    <PageHeader eyebrow="Subscriptions" title="Members and billing status" copy="Create subscriptions, review receipts, and keep payment state visible." />
    {error && <ErrorState message={error} />}
    {notice && <div className="member-link-notice" role="status">{notice}</div>}
    <div className="content-grid">
      <section className="data-panel">
        <div className="panel-title"><div><div className="eyebrow">Member list · Page {page} of {totalPages}</div><h2>{totalSubscriptions} subscriptions</h2></div></div>
        {totalSubscriptions ? <>
        <div className="list-rows">
          {subscriptions.map(subscription => <div className="subscription-entry" key={subscription.id}>
            <div className="list-row">
              <span className={`status-dot ${subscription.status.toLowerCase()}`} />
              <span><b>{subscription.customerPhone}</b><small>{subscription.plan?.name ?? 'Plan'} · {subscription.status.replace('_', ' ')}</small></span>
              <span className="row-actions">
                <button className="icon-button" title="View receipts" aria-label={`View receipts for ${subscription.customerPhone}`} onClick={() => void toggleReceipts(subscription)}><FileText size={15} /></button>
                <button className="icon-button" title="Text member portal link" aria-label={`Text member portal link to ${subscription.customerPhone}`} onClick={() => void action(() => api.sendMemberPortalLink(subscription.id), 'Member link queued by SMS. It expires after 24 hours.')}><Link2 size={15} /></button>
                {subscription.status === 'RETRYING' || subscription.status === 'PAST_DUE' ? <button className="icon-button" title="Retry payment" aria-label={`Retry payment for ${subscription.customerPhone}`} onClick={() => void action(() => api.triggerRetry(subscription.id))}><RotateCcw size={15} /></button> : <button className="icon-button" title="Pay now" aria-label={`Pay now for ${subscription.customerPhone}`} onClick={() => void action(() => api.payNow(subscription.id))}><CreditCard size={15} /></button>}
                <strong>{new Date(subscription.nextBillingDate).toLocaleDateString()}</strong>
              </span>
            </div>
            {receiptsFor === subscription.id && <div className="receipt-history">
              <div className="eyebrow">Payment receipts · {subscription.customerPhone}</div>
              {loadingReceipts ? <p className="muted">Loading receipts...</p> : receiptError ? <ErrorState message={receiptError} /> : receipts ? <>
                <h3>{receipts.currentPlan} · {receipts.totalAttempts} attempts</h3>
                {receipts.receipts.map(receipt => <div className="receipt-row" key={receipt.id}><span><b>{receipt.receiptNumber ?? 'No M-Pesa receipt'}</b><small>{new Date(receipt.transactionDate ?? receipt.createdAt).toLocaleString()}</small></span><span className="receipt-amount"><b>KES {receipt.amount.toLocaleString()}</b><small>{receipt.status}</small></span></div>)}
              </> : <EmptyState title="No receipts yet" copy="Payment receipts will appear here after a collection attempt." />}
            </div>}
          </div>)}
        </div>
        <div className="pagination-controls">
          <button className="quiet-link" disabled={page <= 1} onClick={() => void load(page - 1)}>Previous</button>
          <span>Showing {subscriptions.length ? (page - 1) * 20 + 1 : 0}–{(page - 1) * 20 + subscriptions.length} of {totalSubscriptions}</span>
          <button className="quiet-link" disabled={page >= totalPages} onClick={() => void load(page + 1)}>Next</button>
        </div>
        </> : <EmptyState title="No subscriptions yet" copy="Add a member to start a recurring collection." />}
      </section>

      <form className="data-panel form-panel" onSubmit={create}>
        <div className="eyebrow">Add a member</div><h2>New subscription</h2>
        <label htmlFor="member-phone">Member phone</label><input id="member-phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="0712 345 678" inputMode="tel" required />
        <label htmlFor="member-plan">Membership plan</label>
        <select id="member-plan" value={planId} onChange={event => setPlanId(event.target.value)} required><option value="">Choose a plan</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · KES {Number(plan.amount).toLocaleString()}</option>)}</select>
        <button className="primary-button wide" disabled={saving || !plans.length}>{saving ? 'Adding...' : <>Add subscription <ArrowRight size={16} /></>}</button>
      </form>
    </div>
  </div>
}
