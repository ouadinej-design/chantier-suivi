import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function formatDA(n) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' DA'
}

export default function Dashboard({ onRead }) {
  const [entries, setEntries] = useState([])
  const [overdueTasks, setOverdueTasks] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data, error } = await supabase.from('entries').select('*')
    if (!error) setEntries(data || [])

    const todayISO = new Date().toISOString().slice(0, 10)
    const { data: gt } = await supabase.from('gantt_taches').select('*').eq('is_section', false).lt('fin', todayISO)
    const ids = (gt || []).map((t) => t.checklist_id).filter(Boolean)
    let clMap = {}
    if (ids.length) {
      const { data: cl } = await supabase.from('checklist').select('id, avancement').in('id', ids)
      ;(cl || []).forEach((c) => { clMap[c.id] = c })
    }
    const overdue = (gt || []).filter((t) => {
      const cl = t.checklist_id ? clMap[t.checklist_id] : null
      return cl ? Number(cl.avancement) < 100 : true
    })
    setOverdueTasks(overdue)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('entries-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gantt_taches' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    // Marquer comme lues les écritures des autres, à la consultation du tableau de bord
    const unread = entries.filter((e) => !e.lu && e.auteur !== 'Nej')
    if (unread.length > 0) {
      const ids = unread.map((e) => e.id)
      supabase.from('entries').update({ lu: true }).in('id', ids).then(() => {
        onRead && onRead()
      })
    }
  }, [entries])

  const totalRecettes = entries.filter((e) => e.type === 'recette').reduce((a, e) => a + Number(e.montant), 0)
  const totalDepenses = entries.filter((e) => e.type === 'depense').reduce((a, e) => a + Number(e.montant), 0)
  const totalRetraits = entries.filter((e) => e.type === 'retrait').reduce((a, e) => a + Number(e.montant), 0)
  const benefice = totalRecettes - totalDepenses
  const caisse = benefice - totalRetraits

  const parAssocie = ['Takiedine', 'Salah', 'Nej'].map((nom) => ({
    nom,
    total: entries.filter((e) => e.type === 'retrait' && e.beneficiaire === nom).reduce((a, e) => a + Number(e.montant), 0),
  }))

  const recentActivity = [...entries]
    .filter((e) => e.auteur !== 'Nej')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8)

  if (loading) return <div className="empty-state">Chargement…</div>

  return (
    <div>
      <div className="section-title">Bilan financier</div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Recettes</div>
          <div className="value">{formatDA(totalRecettes)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Dépenses</div>
          <div className="value">{formatDA(totalDepenses)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Bénéfice</div>
          <div className="value">{formatDA(benefice)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Caisse restante</div>
          <div className="value">{formatDA(caisse)}</div>
        </div>
      </div>

      <div className="section-title">Retraits par associé</div>
      {parAssocie.map((a) => (
        <div className="associe-row" key={a.nom}>
          <span>{a.nom}</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{formatDA(a.total)}</span>
        </div>
      ))}

      <div className="section-title" style={{ marginTop: 22 }}>Activité récente de l'équipe</div>
      {recentActivity.length === 0 && <div className="empty-state">Aucune saisie de Takiedine ou Salah pour le moment.</div>}
      {recentActivity.map((e) => (
        <div className="notif-item" key={e.id}>
          <span className="who">{e.auteur}</span> a saisi une {e.type} de {formatDA(e.montant)}
          {e.designation ? ` — ${e.designation}` : ''} ({new Date(e.date).toLocaleDateString('fr-FR')})
        </div>
      ))}

      <div className="section-title" style={{ marginTop: 22 }}>⚠ Tâches en retard</div>
      {overdueTasks.length === 0 && <div className="empty-state">Aucun retard sur le planning. 👍</div>}
      {overdueTasks.map((t) => (
        <div key={t.id} style={{ background: '#FDECEA', border: '1px solid var(--depense)', borderRadius: 10, padding: '10px 14px', marginBottom: 8, fontSize: '0.85rem' }}>
          <strong>{t.designation}</strong> — fin prévue le {new Date(t.fin).toLocaleDateString('fr-FR')}
        </div>
      ))}
    </div>
  )
}
