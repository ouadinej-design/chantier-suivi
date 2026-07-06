import { useState } from 'react'
import { supabase } from '../supabaseClient'

function statusClass(statut) {
  if (statut === 'En cours') return 'en-cours'
  if (statut === 'Terminé') return 'termine'
  return ''
}

const STATUTS = ['En attente', 'En cours', 'Terminé']

export default function LotAccordion({ lot, etapes, user, onChanged }) {
  const [open, setOpen] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [adding, setAdding] = useState(false)

  async function toggleEtape(etape) {
    await supabase.from('etapes').update({ fait: !etape.fait }).eq('id', etape.id)
    onChanged && onChanged()
  }

  async function changeStatut(e) {
    e.stopPropagation()
    const table = lot.parentTable === 'appartement_lots' ? 'appartement_lots' : 'checklist'
    await supabase.from(table).update({ statut: e.target.value }).eq('id', lot.id)
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

      <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
        <select
          value={lot.statut}
          onChange={changeStatut}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1.5px solid var(--paper-line)',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: lot.statut === 'Terminé' ? 'var(--recette-bg)' : lot.statut === 'En cours' ? '#FFF3E0' : 'var(--card)',
            color: lot.statut === 'Terminé' ? 'var(--recette)' : lot.statut === 'En cours' ? 'var(--safety)' : 'var(--ink-soft)',
          }}
        >
          {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {open && (
        <div style={{ marginTop: 10, borderTop: '1px dashed var(--paper-line)', paddingTop: 10 }}>
          {etapes.length === 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: 8 }}>Aucune étape.</div>
          )}
          {etapes.map((et) => (
            <div key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
              <input type="checkbox" checked={et.fait} onChange={() => toggleEtape(et)} style={{ width: 18, height: 18 }} />
              <span style={{ flex: 1, fontSize: '0.86rem', textDecoration: et.fait ? 'line-through' : 'none', color: et.fait ? 'var(--ink-soft)' : 'var(--ink)' }}>
                {et.titre}
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
