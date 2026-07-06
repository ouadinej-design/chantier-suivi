import { useState } from 'react'
import { supabase } from '../supabaseClient'

function statusClass(statut) {
  if (statut === 'En cours') return 'en-cours'
  if (statut === 'Terminé') return 'termine'
  return ''
}

const STATUTS = ['En attente', 'En cours', 'Terminé']
const NEXT_STATUT = { 'En attente': 'En cours', 'En cours': 'Terminé', 'Terminé': 'En attente' }

function EtapeIcon({ statut }) {
  if (statut === 'Terminé') {
    return (
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--recette)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.8rem', flexShrink: 0 }}>
        ✓
      </div>
    )
  }
  if (statut === 'En cours') {
    return (
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: 'conic-gradient(var(--safety) 0deg 180deg, #E8E2D2 180deg 360deg)',
      }} />
    )
  }
  return <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#B9C0BB', flexShrink: 0 }} />
}

function statutColor(statut) {
  if (statut === 'Terminé') return 'var(--recette)'
  if (statut === 'En cours') return 'var(--safety)'
  return 'var(--ink-soft)'
}

export default function LotAccordion({ lot, etapes, user, onChanged }) {
  const [open, setOpen] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [adding, setAdding] = useState(false)

  async function cycleEtape(etape) {
    const next = NEXT_STATUT[etape.statut] || 'En cours'
    await supabase.from('etapes').update({ statut: next }).eq('id', etape.id)
    onChanged && onChanged()
  }

  async function cycleLotStatut(e) {
    e.stopPropagation()
    const next = NEXT_STATUT[lot.statut] || 'En cours'
    const table = lot.parentTable === 'appartement_lots' ? 'appartement_lots' : 'checklist'

    if (next === 'Terminé') {
      // Marquer toutes les étapes comme terminées → % passe à 100 automatiquement
      const ids = etapes.map((e) => e.id)
      if (ids.length) {
        await supabase.from('etapes').update({ statut: 'Terminé' }).in('id', ids)
      } else {
        // Pas d'étape : on force directement le lot à 100%
        await supabase.from(table).update({ statut: 'Terminé', avancement: 100 }).eq('id', lot.id)
      }
    } else if (next === 'En attente') {
      // Remettre toutes les étapes à zéro → % repasse à 0 automatiquement
      const ids = etapes.map((e) => e.id)
      if (ids.length) {
        await supabase.from('etapes').update({ statut: 'En attente' }).in('id', ids)
      } else {
        await supabase.from(table).update({ statut: 'En attente', avancement: 0 }).eq('id', lot.id)
      }
    } else {
      // "En cours" : statut manuel, le % reste piloté par les étapes existantes
      await supabase.from(table).update({ statut: 'En cours' }).eq('id', lot.id)
    }
    onChanged && onChanged()
  }

  async function addTask(e) {
    e.preventDefault()
    if (!newTask.trim()) return
    setAdding(true)
    const maxOrdre = etapes.reduce((m, e) => Math.max(m, e.ordre || 0), 0)
    await supabase.from('etapes').insert({
      parent_table: lot.parentTable,
      parent_id: lot.id,
      titre: newTask.trim(),
      ordre: maxOrdre + 1,
      is_custom: true,
      statut: 'En attente',
    })
    setNewTask('')
    setAdding(false)
    onChanged && onChanged()
  }

  async function removeTask(etapeId) {
    await supabase.from('etapes').delete().eq('id', etapeId)
    onChanged && onChanged()
  }

  return (
    <div className={`lot-card ${statusClass(lot.statut)}`}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: 0 }}
      >
        <div className="lot-header">
          <span className="numero">Lot {lot.numero} · {lot.unite}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700 }}>
            {lot.avancement}% {open ? '▲' : '▼'}
          </span>
        </div>
        <div className="lot-title">{lot.designation}</div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${lot.avancement}%` }} />
        </div>
      </button>

      <button
        onClick={cycleLotStatut}
        style={{
          marginTop: 8,
          padding: '8px 14px',
          borderRadius: 999,
          border: `1.5px solid ${statutColor(lot.statut)}`,
          fontSize: '0.75rem',
          fontWeight: 700,
          background: lot.statut === 'Terminé' ? 'var(--recette-bg)' : lot.statut === 'En cours' ? '#FFF3E0' : 'var(--card)',
          color: statutColor(lot.statut),
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <EtapeIcon statut={lot.statut} />
        <span>{lot.statut}</span>
        <span style={{ opacity: 0.55, fontWeight: 400, fontSize: '0.68rem' }}>· toucher pour changer</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, borderTop: '1px dashed var(--paper-line)', paddingTop: 10 }}>
          {etapes.length === 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: 8 }}>Aucune étape.</div>
          )}
          {etapes.map((et) => (
            <div key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
              <button onClick={() => cycleEtape(et)} style={{ background: 'none', border: 'none', padding: 0 }} title="Toucher pour changer le statut">
                <EtapeIcon statut={et.statut} />
              </button>
              <span style={{ flex: 1, fontSize: '0.86rem', textDecoration: et.statut === 'Terminé' ? 'line-through' : 'none', color: et.statut === 'Terminé' ? 'var(--ink-soft)' : 'var(--ink)' }}>
                {et.titre}
              </span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: statutColor(et.statut), flexShrink: 0 }}>
                {et.statut}
              </span>
              {et.is_custom && (
                <button onClick={() => removeTask(et.id)} style={{ background: 'none', border: 'none', fontSize: '0.8rem' }}>🗑️</button>
              )}
            </div>
          ))}
          <form onSubmit={addTask} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              type="text"
              placeholder="Ajouter une tâche…"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--paper-line)', fontSize: '0.82rem' }}
            />
            <button type="submit" disabled={adding} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--blueprint)', color: 'white', fontSize: '0.8rem' }}>
              +
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
