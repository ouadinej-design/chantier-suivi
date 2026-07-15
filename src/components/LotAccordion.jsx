import { useState } from 'react'
import { supabase } from '../supabaseClient'

function statusClass(statut) {
  if (statut === 'En cours') return 'en-cours'
  if (statut === 'Terminé') return 'termine'
  return ''
}

const STATUTS = ['En attente', 'En cours', 'Terminé']

const CHIP_STYLE = {
  'En attente': { bg: '#E8E3DA', color: '#8A9490', icon: '⏸' },
  'En cours':   { bg: '#E0621B', color: '#fff',    icon: '▶' },
  'Terminé':    { bg: '#3A6B4A', color: '#fff',    icon: '✓' },
}

function EtapeIcon({ statut }) {
  if (statut === 'Terminé') {
    return <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--recette)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.8rem', flexShrink: 0 }}>✓</div>
  }
  if (statut === 'En cours') {
    return <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'conic-gradient(var(--safety) 0deg 180deg, #E8E2D2 180deg 360deg)' }} />
  }
  return <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#B9C0BB', flexShrink: 0 }} />
}

export default function LotAccordion({ lot, etapes, user, onChanged, onReset }) {
  const [open, setOpen] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [adding, setAdding] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  const table = lot.parentTable === 'appartement_lots' ? 'appartement_lots' : 'checklist'

  async function recalcParent(etapesList) {
    const total = etapesList.length
    const done = etapesList.filter((e) => e.statut === 'Terminé').length
    const pct = total === 0 ? 0 : Math.round((done / total) * 10000) / 100
    const newStatut = total > 0 && pct >= 100 ? 'Terminé' : pct > 0 ? 'En cours' : 'En attente'
    await supabase.from(table).update({ avancement: pct, statut: newStatut }).eq('id', lot.id)
    return { avancement: pct, statut: newStatut }
  }

  async function cycleEtape(etape) {
    const idx = STATUTS.indexOf(etape.statut)
    const next = STATUTS[(idx + 1) % STATUTS.length]
    await supabase.from('etapes').update({ statut: next }).eq('id', etape.id)
    const updated = etapes.map((e) => (e.id === etape.id ? { ...e, statut: next } : e))
    const patch = await recalcParent(updated)
    onChanged && onChanged(lot.id, patch, updated)
  }

  async function setLotStatut(e, next) {
    e.stopPropagation()
    if (next === lot.statut) return
    let updatedEtapes = etapes
    if (next === 'Terminé') {
      const ids = etapes.map((e) => e.id)
      if (ids.length) { await supabase.from('etapes').update({ statut: 'Terminé' }).in('id', ids) }
      updatedEtapes = etapes.map((e) => ({ ...e, statut: 'Terminé' }))
      await supabase.from(table).update({ statut: 'Terminé', avancement: 100 }).eq('id', lot.id)
      onChanged && onChanged(lot.id, { statut: 'Terminé', avancement: 100 }, updatedEtapes)
    } else if (next === 'En attente') {
      const ids = etapes.map((e) => e.id)
      if (ids.length) { await supabase.from('etapes').update({ statut: 'En attente' }).in('id', ids) }
      updatedEtapes = etapes.map((e) => ({ ...e, statut: 'En attente' }))
      await supabase.from(table).update({ statut: 'En attente', avancement: 0 }).eq('id', lot.id)
      onChanged && onChanged(lot.id, { statut: 'En attente', avancement: 0 }, updatedEtapes)
    } else {
      await supabase.from(table).update({ statut: 'En cours' }).eq('id', lot.id)
      onChanged && onChanged(lot.id, { statut: 'En cours' }, updatedEtapes)
    }
  }

  async function handleReset(scope) {
    setResetting(true)
    setShowReset(false)
    if (scope === 'lot') {
      const ids = etapes.map((e) => e.id)
      if (ids.length) await supabase.from('etapes').update({ statut: 'En attente' }).in('id', ids)
      await supabase.from(table).update({ statut: 'En attente', avancement: 0 }).eq('id', lot.id)
      const updated = etapes.map((e) => ({ ...e, statut: 'En attente' }))
      onChanged && onChanged(lot.id, { statut: 'En attente', avancement: 0 }, updated)
    } else {
      onReset && await onReset(scope)
    }
    setResetting(false)
  }

  async function addTask(e) {
    e.preventDefault()
    if (!newTask.trim()) return
    setAdding(true)
    const maxOrdre = etapes.reduce((m, e) => Math.max(m, e.ordre || 0), 0)
    const { data: created } = await supabase.from('etapes').insert({
      parent_table: lot.parentTable,
      parent_id: lot.stableKey ?? lot.id,
      titre: newTask.trim(),
      ordre: maxOrdre + 1,
      is_custom: true,
      statut: 'En attente',
    })
    const updated = [...etapes, created || { id: `temp-${Date.now()}`, titre: newTask.trim(), statut: 'En attente', is_custom: true }]
    const patch = await recalcParent(updated)
    setNewTask('')
    setAdding(false)
    onChanged && onChanged(lot.id, patch, updated)
  }

  async function removeTask(etapeId) {
    await supabase.from('etapes').delete().eq('id', etapeId)
    const updated = etapes.filter((e) => e.id !== etapeId)
    const patch = await recalcParent(updated)
    onChanged && onChanged(lot.id, patch, updated)
  }

  return (
    <div className={`lot-card ${statusClass(lot.statut)}`}>
      {/* Ligne d'en-tête */}
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: 0 }}>
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

      {/* Chips de statut (Option D) + Réinitialiser */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {STATUTS.map((s) => {
          const style = CHIP_STYLE[s]
          const active = lot.statut === s
          return (
            <button
              key={s}
              onClick={(e) => setLotStatut(e, s)}
              style={{
                padding: '7px 13px',
                borderRadius: 999,
                border: active ? 'none' : '1.5px solid #D5CFC6',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: active ? style.bg : 'transparent',
                color: active ? style.color : '#8A9490',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                opacity: active ? 1 : 0.7,
                transform: active ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.15s',
              }}
            >
              {style.icon} {s}
            </button>
          )
        })}

        {/* Bouton Réinitialiser */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowReset(!showReset) }}
          disabled={resetting}
          style={{
            marginLeft: 'auto',
            padding: '7px 10px',
            borderRadius: 999,
            border: '1.5px dashed #C5BDB0',
            background: 'transparent',
            color: '#8A9490',
            fontSize: '0.72rem',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          🔄 {resetting ? '…' : 'Réinitialiser'}
        </button>
      </div>

      {/* Panneau choix réinitialisation */}
      {showReset && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, background: '#FFF3E0', border: '1.5px solid var(--safety)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 8, color: 'var(--safety)' }}>⚠ Réinitialiser à zéro</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <button onClick={() => handleReset('lot')} style={{ padding: '9px 12px', borderRadius: 8, border: 'none', background: 'var(--safety)', color: 'white', fontSize: '0.78rem', fontWeight: 700, textAlign: 'left' }}>
              Ce lot uniquement ({lot.designation})
            </button>
            {lot.parentTable === 'appartement_lots' && (
              <button onClick={() => handleReset('appartement')} style={{ padding: '9px 12px', borderRadius: 8, border: 'none', background: 'var(--depense)', color: 'white', fontSize: '0.78rem', fontWeight: 700, textAlign: 'left' }}>
                Tous les lots de cet appartement
              </button>
            )}
            {lot.parentTable === 'checklist' && (
              <button onClick={() => handleReset('chantier')} style={{ padding: '9px 12px', borderRadius: 8, border: 'none', background: 'var(--depense)', color: 'white', fontSize: '0.78rem', fontWeight: 700, textAlign: 'left' }}>
                Tout le chantier global (19 lots)
              </button>
            )}
            <button onClick={() => setShowReset(false)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #C5BDB0', background: 'transparent', color: '#8A9490', fontSize: '0.75rem', textAlign: 'center' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Étapes */}
      {open && (
        <div style={{ marginTop: 10, borderTop: '1px dashed var(--paper-line)', paddingTop: 10 }}>
          {etapes.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: 8 }}>Aucune étape.</div>}
          {etapes.map((et) => (
            <div key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
              <button onClick={() => cycleEtape(et)} style={{ background: 'none', border: 'none', padding: 0 }} title="Toucher pour changer le statut">
                <EtapeIcon statut={et.statut} />
              </button>
              <span style={{ flex: 1, fontSize: '0.86rem', textDecoration: et.statut === 'Terminé' ? 'line-through' : 'none', color: et.statut === 'Terminé' ? 'var(--ink-soft)' : 'var(--ink)' }}>
                {et.titre}
              </span>
              {(() => {
                const s = CHIP_STYLE[et.statut]
                return (
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color, flexShrink: 0 }}>
                    {s.icon} {et.statut}
                  </span>
                )
              })()}
              {et.is_custom && (
                <button onClick={() => removeTask(et.id)} style={{ background: 'none', border: 'none', fontSize: '0.8rem' }}>🗑️</button>
              )}
            </div>
          ))}
          <form onSubmit={addTask} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input type="text" placeholder="Ajouter une tâche…" value={newTask} onChange={(e) => setNewTask(e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--paper-line)', fontSize: '0.82rem' }} />
            <button type="submit" disabled={adding} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--blueprint)', color: 'white', fontSize: '0.8rem' }}>+</button>
          </form>
        </div>
      )}
    </div>
  )
}
