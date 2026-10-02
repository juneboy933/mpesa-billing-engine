import { useState, type ReactNode } from 'react'
import { ArrowRight, Check, CreditCard, LayoutDashboard, MessageSquareText, ShieldCheck } from 'lucide-react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api } from './api'
import { onboardingStepFor } from './onboardingFlow'
import { AppShell } from './layouts/AppShell'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { DashboardPage } from './pages/DashboardPage'
import { HomePage } from './pages/HomePage'
import { PlansPage } from './pages/PlansPage'
import { RecoveryPage } from './pages/RecoveryPage'
import { SettingsPage } from './pages/SettingsPage'
import { SubscriptionsPage } from './pages/SubscriptionsPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/plans" element={<Protected><PlansPage /></Protected>} />
        <Route path="/subscriptions" element={<Protected><SubscriptionsPage /></Protected>} />
        <Route path="/recovery" element={<Protected><RecoveryPage /></Protected>} />
        <Route path="/analytics" element={<Protected><AnalyticsPage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function Protected({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}

function OnboardingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const resumed = location.state as { step?: number; phone?: string } | null
  const [step, setStep] = useState(resumed?.step ?? 0)
  const [business, setBusiness] = useState('')
  const [phone, setPhone] = useState(resumed?.phone ?? '')
  const [code, setCode] = useState('')
  const [credentials, setCredentials] = useState({ consumerKey: '', consumerSecret: '', shortcode: '', passkey: '' })
  const [plan, setPlan] = useState({ name: 'Monthly membership', amount: '2500', interval: 'MONTHLY' as 'WEEKLY' | 'MONTHLY' })
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setLoading(true)
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const register = () => run(async () => {
    if (!registered) {
      await api.registerMerchant(business.trim(), phone.trim())
      setRegistered(true)
    }
    await api.requestOtp(phone.trim())
    setStep(1)
  })

  const verify = () => run(async () => {
    await api.verifyOtp(phone.trim(), code)
    const status = await api.getOnboardingStatus()
    const nextStep = onboardingStepFor(status)
    if (nextStep === null) navigate('/dashboard')
    else setStep(nextStep)
  })

  const setup = () => run(async () => {
    await api.setupMpesa(credentials)
    setStep(3)
  })

  const finish = () => run(async () => {
    await api.createFirstPlan(plan.name.trim(), Number(plan.amount), plan.interval)
    navigate('/dashboard')
  })

  const fields = [
    { key: 'shortcode', label: 'PayBill number' },
    { key: 'consumerKey', label: 'Consumer key' },
    { key: 'consumerSecret', label: 'Consumer secret' },
    { key: 'passkey', label: 'Passkey' },
  ] as const

  return (
    <main className="app-frame">
      <header className="app-header">
        <button className="brand brand-button" onClick={() => navigate('/')}>
          <span className="brand-mark"><ShieldCheck size={17} /></span>NiaFlow
        </button>
        <span className="secure-note"><ShieldCheck size={16} /> Secure setup</span>
      </header>
      <section className="onboarding-layout">
        <aside className="onboarding-rail">
          <div className="eyebrow">Merchant setup</div>
          <h1>Get your collections moving.</h1>
          <p>Complete the steps once, then run your workspace from one calm place.</p>
          <div className="step-list">
            {['Business details', 'Verify phone', 'PayBill setup', 'First membership plan'].map((label, index) => (
              <div className={`step-item ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`} key={label}>
                <span className="step-number">{index < step ? <Check size={15} /> : index + 1}</span>{label}
              </div>
            ))}
          </div>
        </aside>
        <section className="onboarding-panel">
          <div className="panel-topline"><span>Step {step + 1} of 4</span><span>Save and resume with your phone</span></div>
          {step === 0 && <FormStep icon={<LayoutDashboard size={20} />} title="Tell us about your business" copy="Start with the details your members will recognise.">
            <label htmlFor="business-name">Business name</label>
            <input id="business-name" value={business} onChange={event => setBusiness(event.target.value)} placeholder="e.g. Northstar Fitness" />
            <label htmlFor="business-phone">Phone number</label>
            <input id="business-phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="e.g. 0712 345 678" inputMode="tel" />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button wide" disabled={!business.trim() || !phone.trim() || loading} onClick={register}>{loading ? (registered ? 'Sending code...' : 'Creating account...') : registered ? <>Retry verification code <ArrowRight size={17} /></> : <>Create account <ArrowRight size={17} /></>}</button>
          </FormStep>}
          {step === 1 && <FormStep icon={<ShieldCheck size={20} />} title="Verify your phone" copy="We sent a one-time code. It expires in 5 minutes.">
            <label htmlFor="onboarding-code">Verification code</label>
            <input id="onboarding-code" value={code} onChange={event => setCode(event.target.value)} placeholder="6-digit code" inputMode="numeric" maxLength={6} autoFocus />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button wide" disabled={code.length !== 6 || loading} onClick={verify}>{loading ? 'Verifying...' : 'Verify and continue'}</button>
          </FormStep>}
          {step === 2 && <FormStep icon={<CreditCard size={20} />} tone="orange" title="Connect your PayBill" copy="Credentials are validated and encrypted before saving.">
            {fields.map(field => <label key={field.key} htmlFor={`setup-${field.key}`}>{field.label}<input id={`setup-${field.key}`} type={field.key === 'consumerSecret' || field.key === 'passkey' ? 'password' : 'text'} value={credentials[field.key]} onChange={event => setCredentials({ ...credentials, [field.key]: event.target.value })} placeholder={field.key === 'shortcode' ? 'e.g. 411234' : 'From Daraja'} /></label>)}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button wide" disabled={Object.values(credentials).some(value => !value.trim()) || loading} onClick={setup}>{loading ? 'Validating...' : 'Validate and continue'}</button>
          </FormStep>}
          {step === 3 && <FormStep icon={<MessageSquareText size={20} />} tone="green" title="Create your first membership plan" copy="You can add more plans from the dashboard later.">
            <label htmlFor="first-plan-name">Plan name</label>
            <input id="first-plan-name" value={plan.name} onChange={event => setPlan({ ...plan, name: event.target.value })} />
            <label htmlFor="first-plan-interval">Billing interval</label>
            <select id="first-plan-interval" value={plan.interval} onChange={event => setPlan({ ...plan, interval: event.target.value as 'WEEKLY' | 'MONTHLY' })}>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
            <label htmlFor="first-plan-amount">{plan.interval === 'WEEKLY' ? 'Weekly' : 'Monthly'} price (KES)</label>
            <input id="first-plan-amount" type="number" min="1" step="1" value={plan.amount} onChange={event => setPlan({ ...plan, amount: event.target.value })} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button wide" disabled={!plan.name.trim() || Number(plan.amount) <= 0 || loading} onClick={finish}>{loading ? 'Finishing setup...' : 'Finish setup'}</button>
          </FormStep>}
        </section>
      </section>
    </main>
  )
}

function SignInPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const request = async () => {
    setLoading(true)
    setError('')
    try {
      await api.requestOtp(phone.trim())
      setSent(true)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to send code')
    } finally {
      setLoading(false)
    }
  }

  const verify = async () => {
    setLoading(true)
    setError('')
    try {
      await api.verifyOtp(phone.trim(), code)
      const status = await api.getOnboardingStatus()
      const step = onboardingStepFor(status)
      if (step === null) navigate('/dashboard')
      else navigate('/onboarding', { state: { step, phone: phone.trim() } })
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to verify code')
    } finally {
      setLoading(false)
    }
  }

  return <main className="app-frame">
    <header className="app-header"><button className="brand brand-button" onClick={() => navigate('/')}><span className="brand-mark"><ShieldCheck size={17} /></span>NiaFlow</button><span className="secure-note">Passwordless sign in</span></header>
    <section className="auth-layout">
      <div className="auth-copy"><div className="eyebrow">Welcome back</div><h1>Your collections, right where you left them.</h1><p>Use the phone number linked to your NiaFlow workspace.</p></div>
      <section className="onboarding-panel auth-panel"><h2>Sign in</h2><p className="muted">{sent ? 'Enter the code sent by SMS.' : 'No password to remember.'}</p>
        <label htmlFor="signin-phone">Phone number</label><input id="signin-phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="e.g. 0712 345 678" disabled={sent} inputMode="tel" />
        {sent && <><label htmlFor="signin-code">Verification code</label><input id="signin-code" value={code} onChange={event => setCode(event.target.value)} placeholder="6-digit code" inputMode="numeric" maxLength={6} /></>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button wide" disabled={loading || !phone.trim() || (sent && code.length !== 6)} onClick={sent ? verify : request}>{loading ? 'Working...' : sent ? 'Open workspace' : 'Send verification code'}</button>
        <button className="text-button" onClick={() => navigate('/')}>Back to NiaFlow</button>
      </section>
    </section>
  </main>
}

function FormStep({ icon, tone = '', title, copy, children }: { icon: ReactNode; tone?: string; title: string; copy: string; children: ReactNode }) {
  return <div className="form-section"><div className={`section-icon ${tone}`}>{icon}</div><h2>{title}</h2><p className="muted">{copy}</p>{children}</div>
}

export default App
