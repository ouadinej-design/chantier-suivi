export default function BottomNav({ tab, setTab, isAdmin, unreadCount }) {
  const tabs = [
    { id: 'livre', icon: '📖', label: 'Livre' },
    { id: 'nouvelle', icon: '✏️', label: 'Saisir' },
    { id: 'checklist', icon: '📐', label: 'Avancement' },
  ]
  if (isAdmin) tabs.push({ id: 'dashboard', icon: '📊', label: 'Bilan' })

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
