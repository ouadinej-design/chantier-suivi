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
    // On ne souscrit qu'aux changements de checklist (pas etapes)
    // pour éviter que chaque coche d'étape ne recharge tout et ferme les accordéons.
    const channel = supabase
      .channel('chantier-progress')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  const handleReset = useCallback(async (scope) => {
    if (scope !== 'chantier') return
    const ids = lots.map((l) => l.id)
    if (!ids.length) return
    for (const id of ids) {
      await supabase.from('checklist').update({ statut: 'En attente', avancement: 0 }).eq('id', id)
    }
    await supabase.from('etapes').update({ statut: 'En attente' }).eq('parent_table', 'checklist').in('parent_id', ids)
    await load()
  }, [lots, load])

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
          onReset={handleReset}
        />
      ))}
    </div>
  )
}
