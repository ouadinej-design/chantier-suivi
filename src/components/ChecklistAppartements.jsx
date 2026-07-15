import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import LotAccordion from './LotAccordion.jsx'

export default function ChecklistAppartements({ user }) {
  const [overview, setOverview] = useState({}) // { numero: { avg, statutCount } }
  const [selected, setSelected] = useState(null)
  const [lots, setLots] = useState([])
  const [etapesByLot, setEtapesByLot] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

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
    // Clé stable = "N°appartement_N°lot" (indépendante de l'identifiant technique)
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
    // On ne souscrit qu'aux changements de appartement_lots (pas etapes)
    // pour éviter que chaque coche d'étape ne recharge tout et ferme les accordéons ouverts.
    // Les étapes sont gérées de façon optimiste via handleChanged.
    const channel = supabase
      .channel(`appartement-${selected}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appartement_lots' }, () => loadDetail(selected))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [selected, loadDetail])

  const handleReset = useCallback(async (scope) => {
    if (scope !== 'appartement' || selected == null) return
    const ids = lots.map((l) => l.id)
    if (!ids.length) return
    for (const id of ids) {
      await supabase.from('appartement_lots').update({ statut: 'En attente', avancement: 0 }).eq('id', id)
    }
    await supabase.from('etapes').update({ statut: 'En attente' }).eq('parent_table', 'appartement_lots').in('parent_id', ids)
    await loadDetail(selected)
    setOverview((prev) => ({ ...prev, [selected]: 0 }))
  }, [lots, selected, loadDetail])

  // Met à jour l'écran immédiatement à partir du patch renvoyé par LotAccordion
  const handleChanged = useCallback((lotId, patch, updatedEtapes) => {
    if (!lotId) { if (selected != null) loadDetail(selected); return }
    setLots((prev) => prev.map((l) => (l.id === lotId ? { ...l, ...patch } : l)))
    if (updatedEtapes) {
      const lot = lots.find((l) => l.id === lotId)
      const key = lot ? `${lot.appartement_numero}_${lot.numero_lot}` : null
      if (key) setEtapesByLot((prev) => ({ ...prev, [key]: updatedEtapes }))
    }
    // Met aussi à jour la vignette d'aperçu (moyenne %) sans recharger tout le réseau
    if (patch && typeof patch.avancement === 'number' && selected != null) {
      setOverview((prev) => {
        const lotsForApt = lots.map((l) => (l.id === lotId ? { ...l, avancement: patch.avancement } : l))
        const vals = lotsForApt.map((l) => Number(l.avancement))
        const avg = Math.round(vals.reduce((a, v) => a + v, 0) / (vals.length || 1))
        return { ...prev, [selected]: avg }
      })
    }
  }, [lots, selected, loadDetail])

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
        {!loadingDetail && lotsSorted.map((lot) => (
          <LotAccordion
            key={lot.id}
            lot={{
              id: lot.id,
              parentTable: 'appartement_lots',
              stableKey: `${lot.appartement_numero}_${lot.numero_lot}`,
              numero: lot.numero_lot,
              designation: lot.designation_lot,
              unite: lot.unite,
              statut: lot.statut,
              avancement: lot.avancement,
            }}
            etapes={etapesByLot[`${lot.appartement_numero}_${lot.numero_lot}`] || []}
            user={user}
            onChanged={handleChanged}
            onReset={handleReset}
          />
        ))}
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
