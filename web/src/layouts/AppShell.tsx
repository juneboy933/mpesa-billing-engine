import { useState, type ReactNode } from 'react'
import { BarChart3, CreditCard, LayoutDashboard, LogOut, Menu, RotateCcw, Settings, Users, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Brand } from '../components/Brand'

const links = [
  { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Plans', path: '/plans', icon: CreditCard },
  { label: 'Subscriptions', path: '/subscriptions', icon: Users },
  { label: 'Recovery', path: '/recovery', icon: RotateCcw },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
]

export function AppShell({ children, businessName = 'Your business' }: { children: ReactNode; businessName?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const logout = async () => {
    setLogoutError('')
    try {
      await api.logout()
      navigate('/')
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to sign out')
    }
  }
  return <div className="product-shell">
    <aside className={`product-sidebar ${open ? 'open' : ''}`}>
      <Brand />
      <div className="sidebar-label">Workspace</div>
      <nav>{links.map(({ label, path, icon: Icon }) => <button className={`side-link ${location.pathname === path ? 'active' : ''}`} key={path} onClick={() => { navigate(path); setOpen(false) }}><Icon size={17} /> {label}</button>)}</nav>
      {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
      <div className="sidebar-bottom"><button className="side-link" onClick={logout}><LogOut size={17} /> Sign out</button><div className="merchant-chip"><span className="avatar coral">{businessName.slice(0, 2).toUpperCase()}</span><span><b>{businessName}</b><small>Owner account</small></span></div></div>
    </aside>
    <button className="mobile-shell-menu" onClick={() => setOpen(!open)} aria-label="Toggle workspace navigation">{open ? <X size={22} /> : <Menu size={22} />}</button>
    <main className="product-main">{children}</main>
  </div>
}
