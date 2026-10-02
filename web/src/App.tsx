import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, CreditCard, Eye, EyeOff, LayoutDashboard, LockKeyhole, MessageSquareText, ShieldCheck } from 'lucide-react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api } from './api'
import { ApiError } from './api'
import { safeReturnTo } from './authNavigation'
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
import { ErrorState, LoadingState } from './components/States'

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
  const location = useLocation()
  const navigate = useNavigate()
  const [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    setAuthorized(false)
    setError('')
    void api.getOnboardingStatus().then(status => {
      if (!current) return
      const step = onboardingStepFor(status)
      const returnTo = safeReturnTo(`${location.pathname}${location.search}`)
      if (step !== null) {
        navigate('/onboarding', { replace: true, state: { step, returnTo } })
      } else {
        setAuthorized(true)
      }
    }).catch(requestError => {
      if (!current) return
      if (requestError instanceof ApiError && requestError.status === 401) {
        navigate('/signin', { replace: true, state: { returnTo: safeReturnTo(`${location.pathname}${location.search}`) } })
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Unable to check your session')
      }
    })
    return () => { current = false }
  }, [location.pathname, location.search, navigate])

  if (error) return <ErrorState message={error} />
  if (!authorized) return <LoadingState />
  return <AppShell>{children}</AppShell>
}

function OnboardingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const resumed = location.state as { step?: number; phone?: string; returnTo?: string | null } | null
  const [step, setStep] = useState(resumed?.step ?? 0)
  const [business, setBusiness] = useState('')
  const [phone, setPhone] = useState(resumed?.phone ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [credentials, setCredentials] = useState({ consumerKey: '', consumerSecret: '', shortcode: '', passkey: '' })
  const [plan, setPlan] = useState({ name: 'Monthly membership', amount: '2500', interval: 'MONTHLY' as 'WEEKLY' | 'MONTHLY' })
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
    if (password !== confirmPassword) throw new Error('Passwords do not match')
    await api.registerMerchant(business.trim(), phone.trim(), password, email.trim() || undefined)
    await api.signIn(phone.trim(), password)
    setStep(1)
  })

  const setup = () => run(async () => {
    await api.setupMpesa(credentials)
    setStep(2)
  })

  const finish = () => run(async () => {
    await api.createFirstPlan(plan.name.trim(), Number(plan.amount), plan.interval)
    navigate(safeReturnTo(resumed?.returnTo) ?? '/dashboard')
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
            {['Account details', 'PayBill setup', 'First membership plan'].map((label, index) => (
              <div className={`step-item ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`} key={label}>
                <span className="step-number">{index < step ? <Check size={15} /> : index + 1}</span>{label}
              </div>
            ))}
          </div>
        </aside>
        <section className="onboarding-panel">
          <div className="panel-topline"><span>Step {step + 1} of 3</span><span>Sign in with your phone and password</span></div>
          {step === 0 && <FormStep icon={<LayoutDashboard size={20} />} title="Tell us about your business" copy="Start with the details your members will recognise.">
            <label htmlFor="business-name">Business name</label>
            <input id="business-name" value={business} onChange={event => setBusiness(event.target.value)} placeholder="e.g. Northstar Fitness" />
            <label htmlFor="business-phone">Phone number</label>
            <input id="business-phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="e.g. 0712 345 678" inputMode="tel" />
            <label htmlFor="business-email">Email <span className="muted">(optional)</span></label>
            <input id="business-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
            <label htmlFor="business-password">Password</label>
            <input id="business-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={12} maxLength={128} />
            <p className="muted">Use at least 12 characters. Forgotten passwords are recovered through support.</p>
            <label htmlFor="business-confirm-password">Confirm password</label>
            <input id="business-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button wide" disabled={!business.trim() || !phone.trim() || password.length < 12 || !confirmPassword || loading} onClick={register}>{loading ? 'Creating account...' : <>Create account <ArrowRight size={17} /></>}</button>
          </FormStep>}
          {step === 1 && <FormStep icon={<CreditCard size={20} />} tone="orange" title="Connect your PayBill" copy="Credentials are validated and encrypted before saving.">
            {fields.map(field => <label key={field.key} htmlFor={`setup-${field.key}`}>{field.label}<input id={`setup-${field.key}`} type={field.key === 'consumerSecret' || field.key === 'passkey' ? 'password' : 'text'} value={credentials[field.key]} onChange={event => setCredentials({ ...credentials, [field.key]: event.target.value })} placeholder={field.key === 'shortcode' ? 'e.g. 411234' : 'From Daraja'} /></label>)}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button wide" disabled={Object.values(credentials).some(value => !value.trim()) || loading} onClick={setup}>{loading ? 'Validating...' : 'Validate and continue'}</button>
          </FormStep>}
          {step === 2 && <FormStep icon={<MessageSquareText size={20} />} tone="green" title="Create your first membership plan" copy="You can add more plans from the dashboard later.">
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
  const location = useLocation()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const signIn = async () => {
    setLoading(true)
    setError('')
    try {
      await api.signIn(phone.trim(), password)
      const status = await api.getOnboardingStatus()
      const step = onboardingStepFor(status)
      const returnTo = safeReturnTo((location.state as { returnTo?: unknown } | null)?.returnTo)
      if (step === null) navigate(returnTo ?? '/dashboard', { replace: true })
      else navigate('/onboarding', { replace: true, state: { step, phone: phone.trim(), returnTo } })
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return <main className="app-frame">
    <header className="app-header"><button className="brand brand-button" onClick={() => navigate('/')}><span className="brand-mark"><ShieldCheck size={17} /></span>NiaFlow</button><span className="secure-note">Merchant sign in</span></header>
    <section className="auth-layout">
      <div className="auth-copy"><div className="eyebrow">Welcome back</div><h1>Your collections, right where you left them.</h1><p>Use the phone number linked to your NiaFlow workspace.</p></div>
      <form className="onboarding-panel auth-panel signin-card" onSubmit={event => { event.preventDefault(); void signIn() }}>
        <div className="signin-card-heading"><span className="signin-lock"><LockKeyhole size={19} /></span><div><div className="eyebrow">Merchant workspace</div><h2>Sign in</h2></div></div>
        <p className="muted signin-intro">Enter the phone number and password for your account.</p>
        <label htmlFor="signin-phone">Phone number</label>
        <input id="signin-phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="e.g. 0712 345 678" inputMode="tel" autoComplete="username" />
        <label htmlFor="signin-password">Password</label>
        <div className="password-field"><input id="signin-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button wide signin-submit" disabled={loading || !phone.trim() || !password}>{loading ? 'Signing in...' : 'Sign in to NiaFlow'} <ArrowRight size={17} /></button>
        <div className="signin-help"><ShieldCheck size={17} /><p><strong>Need help signing in?</strong><br />Contact NiaFlow support to recover a forgotten password. Optional email is for contact and cannot reset your password.</p></div>
        <button type="button" className="text-button" onClick={() => navigate('/')}>Back to NiaFlow</button>
      </form>
    </section>
  </main>
}

function FormStep({ icon, tone = '', title, copy, children }: { icon: ReactNode; tone?: string; title: string; copy: string; children: ReactNode }) {
  return <div className="form-section"><div className={`section-icon ${tone}`}>{icon}</div><h2>{title}</h2><p className="muted">{copy}</p>{children}</div>
}

export default App
