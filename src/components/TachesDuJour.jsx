import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import LotAccordion from './LotAccordion.jsx'

function toDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function mondayOf(d) {
  const copy = new Date(d)
  const day = (copy.getDay() + 6) % 7 // lundi=0
  copy.setDate(copy.getDate() - day)
  return copy
}
function addDays(d, n) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}
function fmtLong(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtShort(d) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export default function TachesDuJour({ user }) {
  const [mode, setMode] = useState('jour')
  const [anchor, setAnchor] = useState(new Date())
  const [tasks, setTasks] = useState([])
  const [checklistById, setChecklistById] = useState({})
  const [etapesByLot, setEtapesByLot] = useState({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: gt } = await supabase.from('gantt_taches').select('*').eq('is_section', false).order('ordre', { ascending: true })
    setTasks(gt || [])

    const ids = (gt || []).map((t) => t.checklist_id).filter(Boolean)
    if (ids.length) {
      const { data: cl } = await supabase.from('checklist').select('*').in('id', ids)
      const map = {}
      ;(cl || []).forEach((c) => { map[c.id] = c })
      setChecklistById(map)

      const { data: et } = await supabase.from('etapes').select('*').eq('parent_table', 'checklist').in('parent_id', ids).order('ordre', { ascending: true })
      const grouped = {}
      ;(et || []).forEach((e) => {
        grouped[e.parent_id] = grouped[e.parent_id] || []
        grouped[e.parent_id].push(e)
      })
      setEtapesByLot(grouped)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('taches-du-jour')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gantt_taches' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etapes' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  const rangeStart = mode === 'jour' ? anchor : mondayOf(anchor)
  const rangeEnd = mode === 'jour' ? anchor : addDays(mondayOf(anchor), 6)
  const rangeStartISO = toISO(rangeStart)
  const rangeEndISO = toISO(rangeEnd)

  const activeTasks = tasks.filter((t) => t.debut && t.fin && t.debut <= rangeEndISO && t.fin >= rangeStartISO)

  function goPrev() {
    setAnchor(mode === 'jour' ? addDays(anchor, -1) : addDays(anchor, -7))
  }
  function goNext() {
    setAnchor(mode === 'jour' ? addDays(anchor, 1) : addDays(anchor, 7))
  }
  function goToday() {
    setAnchor(new Date())
  }

  if (loading) return <div className="empty-state">Chargement…</div>

  return (
    <div>
      <div className="section-title">À faire</div>

      <div className="filter-row">
        <button className={`filter-chip ${mode === 'jour' ? 'active' : ''}`} onClick={() => setMode('jour')}>Jour</button>
        <button className={`filter-chip ${mode === 'semaine' ? 'active' : ''}`} onClick={() => setMode('semaine')}>Semaine</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={goPrev} style={{ background: 'none', border: 'none', fontSize: '1.3rem', color: 'var(--blueprint)', padding: '4px 10px' }}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'capitalize' }}>
            {mode === 'jour' ? fmtLong(anchor) : `Semaine du ${fmtShort(rangeStart)} au ${fmtShort(rangeEnd)}`}
          </div>
          <button onClick={goToday} style={{ background: 'none', border: 'none', color: 'var(--blueprint)', fontSize: '0.72rem', textDecoration: 'underline', padding: 0 }}>
            Aujourd'hui
          </button>
        </div>
        <button onClick={goNext} style={{ background: 'none', border: 'none', fontSize: '1.3rem', color: 'var(--blueprint)', padding: '4px 10px' }}>›</button>
      </div>

      {activeTasks.length === 0 && (
        <div className="empty-state">Aucune tâche programmée sur cette période.</div>
      )}

      {activeTasks.map((t) => {
        const cl = t.checklist_id ? checklistById[t.checklist_id] : null
        const etapes = cl ? (etapesByLot[cl.id] || []) : []
        const doneCount = etapes.filter((e) => e.fait).length
        return (
          <div key={t.id} style={{ marginBottom: 12 }}>
            <div
              onClick={() => cl && setExpanded(expanded === t.id ? null : t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--card)',
                borderRadius: 12,
                padding: '12px 14px',
                borderLeft: `5px solid ${t.couleur || 'var(--paper-line)'}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.designation}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)' }}>
                  {new Date(t.debut).toLocaleDateString('fr-FR')} → {new Date(t.fin).toLocaleDateString('fr-FR')}
                  {cl && ` · ${etapes.length ? `${doneCount}/${etapes.length} étapes` : ''} · ${cl.avancement}%`}
                </div>
              </div>
              {cl && <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{expanded === t.id ? '▲' : '▼'}</span>}
            </div>
            {cl && expanded === t.id && (
              <div style={{ marginTop: 6 }}>
                <LotAccordion
                  lot={{ id: cl.id, parentTable: 'checklist', numero: cl.numero, designation: cl.designation, unite: cl.unite, statut: cl.statut, avancement: cl.avancement }}
                  etapes={etapes}
                  user={user}
                  onChanged={load}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
