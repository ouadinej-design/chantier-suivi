import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login.jsx'
import BottomNav from './components/BottomNav.jsx'
import Ledger from './components/Ledger.jsx'
import EntryForm from './components/EntryForm.jsx'
import Checklist from './components/Checklist.jsx'
import Dashboard from './components/Dashboard.jsx'
import Settings from './components/Settings.jsx'
import GanttView from './components/GanttView.jsx'

const STORAGE_KEY = 'chantier-suivi-session'

export default function App() {
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('livre')
  const [unreadCount, setUnreadCount] = useState(0)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try { setUser(JSON.parse(saved)) } catch {}
    }
    setBooting(false)
  }, [])

  useEffect(() => {
    if (!user || user.role !== 'admin') return

    async function loadUnread() {
      const { count } = await supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .eq('lu', false)
        .neq('auteur', 'Nej')
      setUnreadCount(count || 0)
    }

    loadUnread()
    const channel = supabase
      .channel('entries-notif')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, loadUnread)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  function handleLogin(u) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    setUser(u)
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
    setTab('livre')
  }

  if (booting) return <div className="loading-screen">Chargement…</div>
  if (!user) return <Login onLogin={handleLogin} />

  const isAdmin = user.role === 'admin'

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>Carnet de Chantier</h1>
        <span className="who" onClick={handleLogout} title="Toucher pour changer de session">{user.nom}</span>
      </div>
      <div className="content">
        {tab === 'livre' && <Ledger user={user} />}
        {tab === 'nouvelle' && <EntryForm user={user} onSaved={() => setTab('livre')} />}
        {tab === 'checklist' && <Checklist user={user} />}
        {tab === 'gantt' && <GanttView user={user} />}
        {tab === 'dashboard' && isAdmin && <Dashboard onRead={() => setUnreadCount(0)} />}
        {tab === 'reglages' && <Settings user={user} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} unreadCount={unreadCount} />
    </div>
  )
}
