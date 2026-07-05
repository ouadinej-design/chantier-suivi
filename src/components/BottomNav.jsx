export default function BottomNav({ tab, setTab, isAdmin, unreadCount }) {
  const tabs = [
    { id: 'taches', icon: '📋', label: 'À faire' },
    { id: 'livre', icon: '📖', label: 'Livre' },
    { id: 'nouvelle', icon: '✏️', label: 'Saisir' },
    { id: 'checklist', icon: '📐', label: 'Avancement' },
    { id: 'gantt', icon: '📅', label: 'Planning' },
  ]
  if (isAdmin) tabs.push({ id: 'dashboard', icon: '📊', label: 'Bilan' })
  tabs.push({ id: 'reglages', icon: '⚙️', label: 'Réglages' })

  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
          <span className="icon">{t.icon}</span>
          {t.label}
          {t.id === 'dashboard' && unreadCount > 0 && (
            <span className="badge">{unreadCount}</span>
          )}
        </button>
      ))}
    </nav>
  )
}
