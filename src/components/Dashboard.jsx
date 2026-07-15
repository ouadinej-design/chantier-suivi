import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { databases } from '../lib/appwrite'
import { DB_ID, COL } from '../lib/config'
import { Query } from 'appwrite'

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

function BarChart({ recette, depense, budget, benefice }) {
  const max = Math.max(recette, depense, budget, Math.abs(benefice), 1)
  const bars = [
    { label: 'Recettes', value: recette, color: 'var(--recette)' },
    { label: 'Dépenses', value: depense, color: 'var(--depense)' },
    { label: 'Bénéfice', value: benefice, color: benefice >= 0 ? 'var(--safety)' : 'var(--depense)' },
    { label: 'Budget global', value: budget, color: 'var(--blueprint)' },
  ]
  const chartHeight = 160
  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--paper-line)', padding: '16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: chartHeight }}>
        {bars.map((b) => (
          <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
            <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatDA(b.value)}</span>
            <div style={{ width: 30, height: Math.max((Math.abs(b.value) / max) * (chartHeight - 30), 3), background: b.color, borderRadius: '4px 4px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8 }}>
        {bars.map((b) => (
          <span key={b.label} style={{ flex: 1, textAlign: 'center', fontSize: '0.62rem', color: 'var(--ink-soft)' }}>{b.label}</span>
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
  const [resetProgress, setResetProgress] = useState(0)

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

  async function resetTousAppartements() {
    setResetState('running')
    setResetProgress(0)
    try {
      // Stratégie : traiter appartement par appartement (1→50)
      // Chaque appartement a 19 lots → bien dans la limite Appwrite de 25
      for (let aptNum = 1; aptNum <= 50; aptNum++) {
        setResetProgress(aptNum)
        // 1. Récupérer les 19 lots de cet appartement
        const { data: lotsData } = await supabase
          .from('appartement_lots')
          .select('id, numero_lot')
          .eq('appartement_numero', aptNum)

        for (const lot of lotsData || []) {
          // 2. Reset le lot
          await supabase
            .from('appartement_lots')
            .update({ statut: 'En attente', avancement: 0 })
            .eq('id', lot.id)

          // 3. Reset les étapes du lot via parent_id composite
          const parentId = `${aptNum}_${lot.numero_lot}`
          const { data: etapesData } = await supabase
            .from('etapes')
            .select('id')
            .eq('parent_id', parentId)

          for (const etape of etapesData || []) {
            await supabase
              .from('etapes')
              .update({ statut: 'En attente' })
              .eq('id', etape.id)
          }
        }
      }

      setResetState('done')
      setTimeout(() => setResetState('idle'), 5000)
    } catch (err) {
      console.error('Reset error:', err)
      alert('Erreur lors de la réinitialisation : ' + (err.message || err))
      setResetState('idle')
    }
  }

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
  const budgetAutre = budgets.filter((b) => b.section === 'autre')
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
      <BarChart recette={totalRecettes} depense={totalDepenses} budget={budgetGlobal} benefice={benefice} />

      <div style={{ marginTop: 22 }}>
        <BudgetSection title="Budget Logements par catégorie" section="logements" entries={entries} budgetRows={budgetLogements} onBudgetChange={handleBudgetChange} />
        <BudgetSection title="Budget VRD par catégorie" section="vrd" entries={entries} budgetRows={budgetVrd} onBudgetChange={handleBudgetChange} />
        <BudgetSection title="Budget Autre par catégorie" section="autre" entries={entries} budgetRows={budgetAutre} onBudgetChange={handleBudgetChange} />
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

      <div className="section-title" style={{ marginTop: 22 }}>🔄 Outils admin</div>

      {resetState === 'idle' && (
        <button
          onClick={() => setResetState('confirm')}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: '1.5px dashed var(--depense)', background: 'transparent', color: 'var(--depense)', fontWeight: 700, fontSize: '0.85rem' }}
        >
          🗂 Réinitialiser tous les appartements (50 × 19 lots)
        </button>
      )}

      {resetState === 'confirm' && (
        <div style={{ background: '#FDECEA', border: '1.5px solid var(--depense)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--depense)', marginBottom: 8 }}>
            ⚠ Confirmer la réinitialisation
          </div>
          <p style={{ fontSize: '0.8rem', marginBottom: 14, color: 'var(--ink)' }}>
            Cela va remettre à zéro l'avancement des <strong>50 appartements × 19 lots = 950 lots</strong> et leurs <strong>2500 étapes</strong>.
            Cette action est irréversible.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={resetTousAppartements}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--depense)', color: 'white', fontWeight: 700, fontSize: '0.85rem' }}
            >
              Oui, réinitialiser tout
            </button>
            <button
              onClick={() => setResetState('idle')}
              style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--paper-line)', background: 'transparent', color: 'var(--ink-soft)', fontWeight: 600 }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {resetState === 'running' && (
        <div style={{ background: '#FFF3E0', border: '1.5px solid var(--safety)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>⏳</div>
          <div style={{ fontWeight: 700, color: 'var(--safety)' }}>Réinitialisation en cours…</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', margin: '6px 0' }}>
            Appartement {resetProgress} / 50
          </div>
          <div style={{ height: 6, background: '#E8E3DA', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(resetProgress / 50) * 100}%`, background: 'var(--safety)', borderRadius: 999, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginTop: 8 }}>
            Ne quittez pas cette page.
          </div>
        </div>
      )}

      {resetState === 'done' && (
        <div style={{ background: 'var(--recette-bg)', border: '1.5px solid var(--recette)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>✅</div>
          <div style={{ fontWeight: 700, color: 'var(--recette)' }}>Tous les appartements ont été réinitialisés.</div>
        </div>
      )}
      {overdueTasks.length === 0 && <div className="empty-state">Aucun retard sur le planning. 👍</div>}
      {overdueTasks.map((t) => (
        <div key={t.id} style={{ background: '#FDECEA', border: '1px solid var(--depense)', borderRadius: 10, padding: '10px 14px', marginBottom: 8, fontSize: '0.85rem' }}>
          <strong>{t.designation}</strong> — fin prévue le {new Date(t.fin).toLocaleDateString('fr-FR')}
        </div>
      ))}
    </div>
  )
}
