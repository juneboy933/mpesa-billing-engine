import {
  ArrowRight,
  Check,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function HomePage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <main className="site-shell">
      <nav className="public-nav">
        <span className="brand">
          <span className="brand-mark">
            <Sparkles size={17} />
          </span>
          NiaFlow
        </span>
        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#built-for" onClick={() => setMenuOpen(false)}>For memberships</a>
          <button className="nav-login" onClick={() => { setMenuOpen(false); navigate('/signin'); }}>
            Sign in
          </button>
          <button
            className="primary-button nav-cta"
            onClick={() => { setMenuOpen(false); navigate('/onboarding'); }}
          >
            Start free setup <ArrowRight size={16} />
          </button>
        </div>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </nav>
      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" /> Built for Kenyan membership businesses
          </div>
          <h1>
            Recurring payments, <em>without the chase.</em>
          </h1>
          <p>
            NiaFlow helps gyms and membership teams collect monthly M-Pesa
            payments, recover failed charges, and give every customer a clear
            way to stay paid.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => navigate('/onboarding')}
            >
              Start your setup <ArrowRight size={17} />
            </button>
            <a className="quiet-link" href="#how-it-works">
              See how it works <ChevronRight size={16} />
            </a>
          </div>
          <div className="trust-row">
            <span>
              <ShieldCheck size={15} /> Encrypted credentials
            </span>
            <span>
              <Check size={15} /> PayBill ready
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-glow" />
          <div className="phone-card">
            <div className="phone-top">
              <span>NiaFlow</span>
              <span className="phone-dot" />
            </div>
            <div className="phone-balance">
              <span>Collected this month</span>
              <strong>One clear view</strong>
              <small>Plans, members, recovery</small>
            </div>
            <div className="mini-chart">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="phone-list">
              <div>
                <span className="avatar coral">NM</span>
                <span>
                  <b>Membership payment</b>
                  <small>Payment confirmed</small>
                </span>
                <strong>
                  <Check size={14} />
                </strong>
              </div>
              <div>
                <span className="avatar blue">AK</span>
                <span>
                  <b>Recovery queue</b>
                  <small>Needs attention</small>
                </span>
                <strong>
                  <ArrowRight size={14} />
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="proof-strip">
        <span>Designed for the everyday rhythm of</span>
        <b>GYMS</b>
        <b>STUDIOS</b>
        <b>CLUBS</b>
        <b>MEMBERSHIP TEAMS</b>
      </section>
      <section className="how-section" id="how-it-works">
        <div className="section-heading">
          <div>
            <div className="eyebrow">A quieter way to collect</div>
            <h2>
              Less chasing.
              <br />
              <span>More showing up.</span>
            </h2>
          </div>
          <p>
            From the first STK Push to the final receipt, keep your customers
            informed and your team in control.
          </p>
        </div>
        <div className="feature-grid" id="built-for">
          <Feature
            icon={<CreditCard size={21} />}
            title="Automatic collections"
            copy="Set a billing date once. NiaFlow sends the M-Pesa request and records every outcome."
            tone="cream"
          />
          <Feature
            icon={<MessageSquareText size={21} />}
            title="Helpful recovery"
            copy="When a payment fails, retries and clear prompts keep the relationship moving."
            tone="orange"
          />
          <Feature
            icon={<LayoutDashboard size={21} />}
            title="One clear view"
            copy="See what is collected, what needs attention, and what is coming next."
            tone="green"
          />
        </div>
      </section>
      <footer>
        <span className="brand">
          <span className="brand-mark">
            <Sparkles size={15} />
          </span>
          NiaFlow
        </span>
        <span>Recurring M-Pesa collections for Kenya</span>
        <span>© 2026 NiaFlow</span>
      </footer>
    </main>
  );
}

function Feature({
  icon,
  title,
  copy,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  tone: string;
}) {
  return (
    <article className={`feature-card ${tone}`}>
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  );
}
