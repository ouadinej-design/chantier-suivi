import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Checklist({ user }) {
  const [lots, setLots] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data, error } = await supabase.from('checklist').select('*').order('numero', { ascending: true })
    if (!error) setLots(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updateLot(id, patch) {
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    await supabase.from('checklist').update({ ...patch, updated_by: user.nom, updated_at: new Date().toISOString() }).eq('id', id)
  }

  function statusClass(statut) {
    if (statut === 'En Cours') return 'en-cours'
    if (statut === 'Terminé') return 'termine'
    return ''
  }

  if (loading) return <div className="empty-state">Chargement…</div>

  return (
    <div>
      <div className="section-title">Avancement du chantier</div>
      {lots.map((lot) => (
        <div key={lot.id} className={`lot-card ${statusClass(lot.statut)}`}>
          <div className="lot-header">
            <span className="numero">Lot {lot.numero} · {lot.unite}</span>
          </div>
          <div className="lot-title">{lot.designation}</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${lot.avancement}%` }} />
          </div>
          <div className="lot-controls">
            <select value={lot.statut} onChange={(e) => updateLot(lot.id, { statut: e.target.value })}>
              <option>Non Commencé</option>
              <option>En Cours</option>
              <option>Terminé</option>
            </select>
            <input
              type="range"
              min="0"
              max="100"
              value={lot.avancement}
              onChange={(e) => updateLot(lot.id, { avancement: Number(e.target.value) })}
            />
            <span className="lot-pct">{lot.avancement}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}
