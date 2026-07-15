import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import LotAccordion from './LotAccordion.jsx'

export default function ChecklistAppartements({ user }) {
  const [overview, setOverview] = useState({})
  const [selected, setSelected] = useState(null)
  const [lots, setLots] = useState([])
  const [etapesByLot, setEtapesByLot] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  // Garder l'état ouvert/fermé de chaque lot dans le parent
  // pour qu'il survive aux re-renders des LotAccordion
  const [openLots, setOpenLots] = useState({})

  const loadOverview = useCallback(async () => {
    const { data } = await supabase.from('appartement_lots').select('appartement_numero, avancement')
    const grouped = {}
    ;(data || []).forEach((r) => {
      grouped[r.appartement_numero] = grouped[r.appartement_numero] || []
      grouped[r.appartement_numero].push(Number(r.avancement))
    })
    const avg = {}
    Object.entries(grouped).forEach(([num, vals]) => {
      avg[num] = Math.round(vals.reduce((a, v) => a + v, 0) / vals.length)
    })
    setOverview(avg)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadOverview()
    const channel = supabase
      .channel('appartements-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appartement_lots' }, loadOverview)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadOverview])

  const loadDetail = useCallback(async (numero) => {
    setLoadingDetail(true)
    const { data: lotsData } = await supabase
      .from('appartement_lots')
      .select('*')
      .eq('appartement_numero', numero)
      .order('numero_lot', { ascending: true })
    const stableKeys = (lotsData || []).map((l) => `${l.appartement_numero}_${l.numero_lot}`)
    const { data: etapesData } = await supabase
      .from('etapes')
      .select('*')
      .eq('parent_table', 'appartement_lots')
      .in('parent_id', stableKeys.length ? stableKeys : ['__none__'])
      .order('ordre', { ascending: true })
    const grouped = {}
    ;(etapesData || []).forEach((e) => {
      grouped[e.parent_id] = grouped[e.parent_id] || []
      grouped[e.parent_id].push(e)
    })
    setLots(lotsData || [])
    setEtapesByLot(grouped)
    setLoadingDetail(false)
  }, [])

  useEffect(() => {
    if (selected == null) return
    loadDetail(selected)
    setOpenLots({}) // réinitialise l'état ouvert lors du changement d'appartement
    // Pas de subscription Realtime sur appartement_lots ici :
    // les mises à jour sont gérées de façon optimiste via handleChanged.
  }, [selected, loadDetail])

  const handleReset = useCallback(async (scope) => {
    if (scope !== 'appartement' || selected == null) return
    const ids = lots.map((l) => l.id)
    if (!ids.length) return
    for (const id of ids) {
      await supabase.from('appartement_lots').update({ statut: 'En attente', avancement: 0 }).eq('id', id)
    }
    const stableKeys = lots.map((l) => `${l.appartement_numero}_${l.numero_lot}`)
    if (stableKeys.length) {
      await supabase.from('etapes').update({ statut: 'En attente' }).eq('parent_table', 'appartement_lots').in('parent_id', stableKeys)
    }
    // Recharger manuellement après reset
    await loadDetail(selected)
    setOverview((prev) => ({ ...prev, [selected]: 0 }))
  }, [lots, selected, loadDetail])

  // Mise à jour optimiste — aucun rechargement réseau, aucun re-mount
  const handleChanged = useCallback((lotId, patch, updatedEtapes) => {
    if (!lotId) return
    setLots((prev) => prev.map((l) => (l.id === lotId ? { ...l, ...patch } : l)))
    if (updatedEtapes) {
      // Trouver la clé stable du lot
      setLots((prev) => {
        const lot = prev.find((l) => l.id === lotId)
        if (lot) {
          const key = `${lot.appartement_numero}_${lot.numero_lot}`
          setEtapesByLot((ep) => ({ ...ep, [key]: updatedEtapes }))
        }
        return prev // pas de changement supplémentaire ici
      })
    }
    if (patch && typeof patch.avancement === 'number' && selected != null) {
      setOverview((prev) => {
        // Recalculer la moyenne à partir de l'état actuel
        setLots((lotsNow) => {
          const vals = lotsNow.map((l) => Number(l.id === lotId ? patch.avancement : l.avancement))
          const avg = Math.round(vals.reduce((a, v) => a + v, 0) / (vals.length || 1))
          setOverview((ov) => ({ ...ov, [selected]: avg }))
          return lotsNow
        })
        return prev
      })
    }
  }, [selected])

  function pctColor(pct) {
    if (pct >= 100) return 'var(--recette)'
    if (pct > 0) return 'var(--safety)'
    return 'var(--paper-line)'
  }

  if (selected != null) {
    const lotsSorted = [...lots].sort((a, b) => Number(a.numero_lot) - Number(b.numero_lot))
    const pct = overview[selected] || 0
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          style={{ background: 'none', border: 'none', color: 'var(--blueprint)', fontWeight: 600, marginBottom: 12, padding: 0 }}
        >
          ← Tous les appartements
        </button>
        <div className="balance-card">
          <div className="label">Appartement N°{selected}</div>
          <div className="amount">{pct}%</div>
        </div>
        {loadingDetail && <div className="empty-state">Chargement…</div>}
        {!loadingDetail && lotsSorted.map((lot) => {
          const stableKey = `${lot.appartement_numero}_${lot.numero_lot}`
          return (
            <LotAccordion
              key={stableKey}
              lot={{
                id: lot.id,
                parentTable: 'appartement_lots',
                stableKey,
                numero: lot.numero_lot,
                designation: lot.designation_lot,
                unite: lot.unite,
                statut: lot.statut,
                avancement: lot.avancement,
              }}
              etapes={etapesByLot[stableKey] || []}
              user={user}
              onChanged={handleChanged}
              onReset={handleReset}
              openState={openLots[stableKey] || false}
              onOpenChange={(val) => setOpenLots((prev) => ({ ...prev, [stableKey]: val }))}
            />
          )
        })}
      </div>
    )
  }

  if (loading) return <div className="empty-state">Chargement…</div>

  return (
    <div>
      <div className="section-title">Appartements (N°1 à N°50)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {Array.from({ length: 50 }, (_, i) => i + 1).map((n) => {
          const pct = overview[n] || 0
          return (
            <button
              key={n}
              onClick={() => setSelected(n)}
              style={{
                aspectRatio: '1',
                borderRadius: 10,
                border: `2px solid ${pctColor(pct)}`,
                background: pct >= 100 ? 'var(--recette-bg)' : 'var(--card)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{n}</span>
              <span style={{ fontSize: '0.62rem', color: 'var(--ink-soft)' }}>{pct}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
