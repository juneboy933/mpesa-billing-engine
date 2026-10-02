import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowUpRight, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react'
import { api, type MemberPortal } from '../api'
import { ErrorState, LoadingState } from '../components/States'

export function MemberPortalPage() {
  const { token = '' } = useParams()
  const [portal, setPortal] = useState<MemberPortal | null>(null)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    void api.getMemberPortal(token).then(data => {
      if (active) setPortal(data)
    }).catch(loadError => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'This member link is unavailable.')
    })
    return () => { active = false }
  }, [token])

  const payNow = async () => {
    setPaying(true)
    setError('')
    setMessage('')
    try {
      const result = await api.memberPayNow(token)
      setMessage(`${result.message}. Check your phone for the M-Pesa prompt.`)
      setPortal(await api.getMemberPortal(token))
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : 'Unable to request payment. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  if (error && !portal) return <main className="member-portal-wrap"><ErrorState message={error} /></main>
  if (!portal) return <main className="member-portal-wrap"><LoadingState /></main>

  const interval = portal.plan.interval === 'WEEKLY' ? 'week' : 'month'
  const cancelled = portal.status === 'CANCELLED'

  return <main className="member-portal-wrap">
    <header className="member-portal-brand"><span className="brand-mark"><ShieldCheck size={17} /></span><b>NiaFlow</b><span>Member account</span></header>
    <section className="member-portal-card">
      <div className="member-portal-heading"><div className="eyebrow">{portal.businessName}</div><span className={`member-status ${portal.status.toLowerCase()}`}>{portal.status.replaceAll('_', ' ')}</span></div>
      <h1>{portal.plan.name}</h1>
      <p className="member-plan-price">KES {portal.plan.amount.toLocaleString()} <span>per {interval}</span></p>

      <div className="member-next-payment">
        <div className="member-next-icon"><Clock3 size={18} /></div>
        <div><small>{cancelled ? 'Subscription ended' : 'Next scheduled payment'}</small><b>{cancelled ? 'No upcoming payment' : new Date(portal.nextPaymentAt).toLocaleDateString('en-KE', { dateStyle: 'long' })}</b></div>
      </div>

      {message && <div className="member-feedback success" role="status"><CheckCircle2 size={17} />{message}</div>}
      {error && <div className="member-feedback error" role="alert">{error}</div>}
      {portal.canPayNow && <button className="primary-button member-pay-button" disabled={paying} onClick={() => void payNow()}>{paying ? 'Requesting payment...' : <>Pay now <ArrowUpRight size={16} /></>}</button>}
      {cancelled && <p className="member-cancelled-note">This subscription is cancelled. No new payment can be requested.</p>}

      <section className="member-history">
        <div className="eyebrow">Payment history</div>
        {portal.recentAttempts.length ? portal.recentAttempts.map(attempt => <div className="member-attempt" key={attempt.id}>
          <div><b>{attempt.receiptNumber ?? attempt.status.replaceAll('_', ' ')}</b><small>{new Date(attempt.transactionDate ?? attempt.attemptedAt).toLocaleString('en-KE')}</small></div>
          <div><b>KES {attempt.amount.toLocaleString()}</b><small>{attempt.status.replaceAll('_', ' ')}</small></div>
        </div>) : <p className="muted">No payment attempts yet.</p>}
      </section>
      <p className="member-expiry">This private link expires {new Date(portal.expiresAt).toLocaleString('en-KE')}.</p>
    </section>
  </main>
}
