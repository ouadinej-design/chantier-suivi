import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function formatDA(n) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' DA'
}

function BudgetSection({ title, section, entries, budgetRows, onBudgetChange }) {
  const depensesBySection = entries.filter((e) => e.type === 'depense' && e.section === section)
  const totalBudget = budgetRows.reduce((a, b) => a + Number(b.montant || 0), 0)
  const totalDepense = depensesBySection.reduce((a, e) => a + Number(e.montant), 0)

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="section-title">{title}</div>
      <div style={{ background: 'var(--card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--paper-line)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 0, padding: '8px 10px', background: 'var(--ink)', color: 'white', fontSize: '0.66rem', fontWeight: 700 }}>
          <span>Poste</span>
          <span style={{ textAlign: 'right' }}>Budget</span>
          <span style={{ textAlign: 'right' }}>Dépensé</span>
          <span style={{ textAlign: 'right' }}>Écart</span>
        </div>
        {budgetRows.map((b) => {
          const depense = depensesBySection.filter((e) => e.categorie === b.categorie).reduce((a, e) => a + Number(e.montant), 0)
          const ecart = Number(b.montant) - depense
          return (
            <div key={b.categorie} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 0, padding: '8px 10px', borderTop: '1px solid var(--paper-line)', alignItems: 'center', fontSize: '0.72rem' }}>
              <span>{b.categorie}{Number(b.montant) === 0 && <span style={{ color: 'var(--safety)' }}> ⚠</span>}</span>
              <input
                type="number"
                value={b.montant}
                onChange={(e) => onBudgetChange(section, b.categorie, e.target.value)}
                style={{ textAlign: 'right', border: '1px solid var(--paper-line)', borderRadius: 6, padding: '4px 6px', fontSize: '0.7rem', width: '100%' }}
              />
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDA(depense)}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: ecart < 0 ? 'var(--depense)' : 'var(--recette)' }}>{formatDA(ecart)}</span>
            </div>
          )
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 0, padding: '8px 10px', borderTop: '2px solid var(--ink)', fontWeight: 700, fontSize: '0.75rem', background: '#F5F3EC' }}>
          <span>Total</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDA(totalBudget)}</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDA(totalDepense)}</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: totalBudget - totalDepense < 0 ? 'var(--depense)' : 'var(--recette)' }}>
            {formatDA(totalBudget - totalDepense)}
          </span>
        </div>
      </div>
    </div>
  )
}

function BarChart({ recette, depense, budget }) {
  const max = Math.max(recette, depense, budget, 1)
  const bars = [
    { label: 'Recettes', value: recette, color: 'var(--recette)' },
    { label: 'Dépenses', value: depense, color: 'var(--depense)' },
    { label: 'Budget global', value: budget, color: 'var(--blueprint)' },
  ]
  const chartHeight = 160
  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--paper-line)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: chartHeight }}>
        {bars.map((b) => (
          <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
            <span style={{ fontSize: '0.64rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatDA(b.value)}</span>
            <div style={{ width: 36, height: Math.max((b.value / max) * (chartHeight - 30), 3), background: b.color, borderRadius: '4px 4px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8 }}>
        {bars.map((b) => (
          <span key={b.label} style={{ flex: 1, textAlign: 'center', fontSize: '0.68rem', color: 'var(--ink-soft)' }}>{b.label}</span>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard({ onRead }) {
  const [entries, setEntries] = useState([])
  const [overdueTasks, setOverdueTasks] = useState([])
  const [budgets, setBudgets] = useState([])
  const [checklist, setChecklist] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data, error } = await supabase.from('entries').select('*')
    if (!error) setEntries(data || [])

    const { data: bg } = await supabase.from('budgets').select('*').order('ordre', { ascending: true })
    setBudgets(bg || [])

    const { data: cl } = await supabase.from('checklist').select('id, avancement')
    setChecklist(cl || [])

    const todayISO = new Date().toISOString().slice(0, 10)
    const { data: gt } = await supabase.from('gantt_taches').select('*').eq('is_section', false).lt('fin', todayISO)
    const ids = (gt || []).map((t) => t.checklist_id).filter(Boolean)
    let clMap = {}
    if (ids.length) {
      const { data: cl2 } = await supabase.from('checklist').select('id, avancement').in('id', ids)
      ;(cl2 || []).forEach((c) => { clMap[c.id] = c })
    }
    const overdue = (gt || []).filter((t) => {
      const c = t.checklist_id ? clMap[t.checklist_id] : null
      return c ? Number(c.avancement) < 100 : true
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    const unread = entries.filter((e) => !e.lu && e.auteur !== 'Nej')
    if (unread.length > 0) {
      const ids = unread.map((e) => e.id)
      supabase.from('entries').update({ lu: true }).in('id', ids).then(() => {
        onRead && onRead()
      })
    }
  }, [entries])

  async function handleBudgetChange(section, categorie, value) {
    const montant = Number(value) || 0
    setBudgets((prev) => prev.map((b) => (b.section === section && b.categorie === categorie ? { ...b, montant } : b)))
    await supabase.from('budgets').update({ montant, updated_at: new Date().toISOString() }).eq('section', section).eq('categorie', categorie)
  }

  const totalRecettes = entries.filter((e) => e.type === 'recette').reduce((a, e) => a + Number(e.montant), 0)
  const totalDepenses = entries.filter((e) => e.type === 'depense').reduce((a, e) => a + Number(e.montant), 0)
  const totalRetraits = entries.filter((e) => e.type === 'retrait').reduce((a, e) => a + Number(e.montant), 0)
  const benefice = totalRecettes - totalDepenses
  const caisse = benefice - totalRetraits
  const budgetLogements = budgets.filter((b) => b.section === 'logements')
  const budgetVrd = budgets.filter((b) => b.section === 'vrd')
  const budgetGlobal = budgets.reduce((a, b) => a + Number(b.montant || 0), 0)

  const avancementGlobal = checklist.length ? Math.round(checklist.reduce((a, c) => a + Number(c.avancement), 0) / checklist.length) : 0

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

      <div className="section-title">Budget global du projet</div>
      <div className="balance-card">
        <div className="label">Total Logements + VRD</div>
        <div className="amount">{formatDA(budgetGlobal)}</div>
      </div>

      <div className="section-title">Avancement Global des Travaux</div>
      <div className="balance-card" style={{ background: 'var(--ink)' }}>
        <div className="label">Moyenne des 19 lots du chantier</div>
        <div className="amount">{avancementGlobal}%</div>
      </div>

      <div className="section-title">Recettes / Dépenses / Budget</div>
      <BarChart recette={totalRecettes} depense={totalDepenses} budget={budgetGlobal} />

      <div style={{ marginTop: 22 }}>
        <BudgetSection title="Budget Logements par catégorie" section="logements" entries={entries} budgetRows={budgetLogements} onBudgetChange={handleBudgetChange} />
        <BudgetSection title="Budget VRD par catégorie" section="vrd" entries={entries} budgetRows={budgetVrd} onBudgetChange={handleBudgetChange} />
        <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginTop: -12 }}>⚠ = montant à renseigner (pas encore chiffré)</div>
      </div>

      <div className="section-title" style={{ marginTop: 22 }}>Retraits par associé</div>
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
