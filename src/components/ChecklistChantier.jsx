import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import LotAccordion from './LotAccordion.jsx'

export default function ChecklistChantier({ user }) {
  const [lots, setLots] = useState([])
  const [etapesByLot, setEtapesByLot] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: lotsData } = await supabase.from('checklist').select('*').order('numero', { ascending: true })
    const ids = (lotsData || []).map((l) => l.id)
    const { data: etapesData } = await supabase
      .from('etapes')
      .select('*')
      .eq('parent_table', 'checklist')
      .in('parent_id', ids.length ? ids : ['__none__'])
      .order('ordre', { ascending: true })

    const grouped = {}
    ;(etapesData || []).forEach((e) => {
      grouped[e.parent_id] = grouped[e.parent_id] || []
      grouped[e.parent_id].push(e)
    })

    setLots(lotsData || [])
    setEtapesByLot(grouped)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('chantier-progress')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etapes' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  // Met à jour l'écran immédiatement à partir du patch renvoyé par LotAccordion,
  // sans attendre un rechargement réseau (plus fiable que le temps réel Appwrite)
  const handleChanged = useCallback((lotId, patch, updatedEtapes) => {
    if (!lotId) { load(); return }
    setLots((prev) => prev.map((l) => (l.id === lotId ? { ...l, ...patch } : l)))
    if (updatedEtapes) {
      setEtapesByLot((prev) => ({ ...prev, [lotId]: updatedEtapes }))
    }
  }, [load])

  if (loading) return <div className="empty-state">Chargement…</div>

  const globalPct = lots.length ? Math.round(lots.reduce((a, l) => a + Number(l.avancement), 0) / lots.length) : 0

  return (
    <div>
      <div className="balance-card" style={{ background: 'var(--ink)' }}>
        <div className="label">Avancement global du chantier</div>
        <div className="amount">{globalPct}%</div>
      </div>
      {lots.map((lot) => (
        <LotAccordion
          key={lot.id}
          lot={{ ...lot, parentTable: 'checklist' }}
          etapes={etapesByLot[lot.id] || []}
          user={user}
          onChanged={handleChanged}
        />
      ))}
    </div>
  )
}
