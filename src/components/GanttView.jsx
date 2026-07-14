import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import LotAccordion from './LotAccordion.jsx'

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']
const MONTHS_FULL_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS_FR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000)
}
function toDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmt(d) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtLong(d) {
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FULL_FR[d.getMonth()]} ${d.getFullYear()}`
}
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

const ZOOMS = {
  jour: { pxPerDay: 26, label: 'Jour' },
  semaine: { pxPerDay: 8, label: 'Semaine' },
  mois: { pxPerDay: 2.4, label: 'Mois' },
}

export default function GanttView({ user }) {
  const [tasks, setTasks] = useState([])
  const [checklistById, setChecklistById] = useState({})
  const [etapesByChecklist, setEtapesByChecklist] = useState({})
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState('mois')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [delayDays, setDelayDays] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState(null) // { label, start, end }
  const [selectedTask, setSelectedTask] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('gantt_taches').select('*').order('ordre', { ascending: true })
    setTasks(data || [])

    const { data: cl } = await supabase.from('checklist').select('*')
    const map = {}
    ;(cl || []).forEach((c) => { map[c.id] = c })
    setChecklistById(map)

    // Les étapes sont liées via une clé stable (numéro du lot), pas l'identifiant
    // technique de la base (qui peut changer lors d'une migration).
    const stableKeys = (cl || []).map((c) => String(c.numero))
    if (stableKeys.length) {
      const { data: et } = await supabase.from('etapes').select('*').eq('parent_table', 'checklist').in('parent_id', stableKeys).order('ordre', { ascending: true })
      const groupedByNumero = {}
      ;(et || []).forEach((e) => {
        groupedByNumero[e.parent_id] = groupedByNumero[e.parent_id] || []
        groupedByNumero[e.parent_id].push(e)
      })
      // Ré-expose sous l'index habituel (id réel) pour ne pas toucher au reste du composant
      const groupedById = {}
      ;(cl || []).forEach((c) => { groupedById[c.id] = groupedByNumero[String(c.numero)] || [] })
      setEtapesByChecklist(groupedById)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('gantt-taches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gantt_taches' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etapes' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  const { rangeStart, rangeEnd, totalDays, monthBlocks } = useMemo(() => {
    const dated = tasks.filter((t) => t.debut && t.fin)
    if (dated.length === 0) {
      const now = new Date()
      return { rangeStart: now, rangeEnd: now, totalDays: 1, monthBlocks: [] }
    }
    const starts = dated.map((t) => toDate(t.debut))
    const ends = dated.map((t) => toDate(t.fin))
    const rangeStart = new Date(Math.min(...starts))
    const rangeEnd = new Date(Math.max(...ends))
    const totalDays = daysBetween(rangeStart, rangeEnd) + 1

    const blocks = []
    let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    while (cur <= rangeEnd) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      const blockStart = cur < rangeStart ? rangeStart : cur
      const blockEndExclusive = next < rangeEnd ? next : new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + 1)
      const days = daysBetween(blockStart, blockEndExclusive)
      blocks.push({ label: `${MONTHS_FR[cur.getMonth()]} ${cur.getFullYear()}`, days })
      cur = next
    }
    return { rangeStart, rangeEnd, totalDays, monthBlocks: blocks }
  }, [tasks])

  // Sous-en-tête : jours (zoom jour) ou semaines (zoom semaine)
  const subUnits = useMemo(() => {
    if (zoom === 'jour') {
      const units = []
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(rangeStart, i)
        units.push({ start: d, end: d, days: 1, label: String(d.getDate()) })
      }
      return units
    }
    if (zoom === 'semaine') {
      const units = []
      let cur = new Date(rangeStart)
      while (cur <= rangeEnd) {
        const end = addDays(cur, 6) > rangeEnd ? rangeEnd : addDays(cur, 6)
        const days = daysBetween(cur, end) + 1
        units.push({ start: new Date(cur), end, days, label: fmt(cur) })
        cur = addDays(cur, 7)
      }
      return units
    }
    return null
  }, [zoom, rangeStart, rangeEnd, totalDays])

  const pxPerDay = ZOOMS[zoom].pxPerDay
  const totalWidth = totalDays * pxPerDay

  function tasksActiveBetween(start, end) {
    return tasks.filter((t) => !t.is_section && t.debut && t.fin && toDate(t.debut) <= end && toDate(t.fin) >= start)
  }

  function startEdit(t) {
    setEditingId(t.id)
    setEditDraft({ debut: t.debut, fin: t.fin })
    setDelayDays('')
  }
  async function saveEdit(id) {
    await supabase.from('gantt_taches').update({ debut: editDraft.debut, fin: editDraft.fin, updated_by: user.nom, updated_at: new Date().toISOString() }).eq('id', id)
    setEditingId(null)
    await load()
  }

  function shiftDateStr(dateStr, days) {
    const d = toDate(dateStr)
    d.setDate(d.getDate() + days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  async function applyDelay(cascade) {
    const days = parseInt(delayDays, 10)
    if (!days) return
    const task = tasks.find((t) => t.id === editingId)
    if (!task) return
    const originalDebut = task.debut

    const newDebut = shiftDateStr(task.debut, days)
    const newFin = shiftDateStr(task.fin, days)
    await supabase.from('gantt_taches').update({ debut: newDebut, fin: newFin, updated_by: user.nom, updated_at: new Date().toISOString() }).eq('id', task.id)

    if (cascade) {
      const toShift = tasks.filter((t) => !t.is_section && t.id !== task.id && t.debut && t.debut >= originalDebut)
      for (const t of toShift) {
        await supabase.from('gantt_taches').update({
          debut: shiftDateStr(t.debut, days),
          fin: shiftDateStr(t.fin, days),
          updated_by: user.nom,
          updated_at: new Date().toISOString(),
        }).eq('id', t.id)
      }
    }
    setEditingId(null)
    setDelayDays('')
    await load()
  }

  function openPeriod(unit) {
    setSelectedTask(null)
    setSelectedPeriod(unit)
  }
  function openTaskDetail(t) {
    setSelectedPeriod(null)
    setSelectedTask(t)
  }

  if (loading) return <div className="empty-state">Chargement du planning…</div>

  const periodTasks = selectedPeriod ? tasksActiveBetween(selectedPeriod.start, selectedPeriod.end) : []
  const selectedLot = selectedTask?.checklist_id ? checklistById[selectedTask.checklist_id] : null
  const selectedEtapes = selectedTask?.checklist_id ? (etapesByChecklist[selectedTask.checklist_id] || []) : []

  return (
    <div>
      <div className="section-title">Planning des travaux</div>

      <div className="filter-row">
        {Object.entries(ZOOMS).map(([key, z]) => (
          <button key={key} className={`filter-chip ${zoom === key ? 'active' : ''}`} onClick={() => { setZoom(key); setSelectedPeriod(null); setSelectedTask(null) }}>
            {z.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: 8 }}>
        {fmt(rangeStart)} → {fmt(rangeEnd)} · tape une date pour voir le programme, une barre pour le détail
      </div>

      <div style={{ display: 'flex', border: '1px solid var(--paper-line)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, width: 132, background: 'var(--card)', borderRight: '2px solid var(--ink)' }}>
          <div style={{ height: 40, borderBottom: '2px solid var(--ink)', background: 'var(--ink)' }} />
          {subUnits && <div style={{ height: 22, borderBottom: '1px solid var(--paper-line)', background: 'var(--card)' }} />}
          {tasks.map((t) => {
            const cl = t.checklist_id ? checklistById[t.checklist_id] : null
            const done = cl && Number(cl.avancement) >= 100
            return (
              <div
                key={t.id}
                onClick={() => !t.is_section && startEdit(t)}
                style={{
                  height: t.is_section ? 26 : 34,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '0 8px',
                  fontSize: t.is_section ? '0.72rem' : '0.7rem',
                  fontWeight: t.is_section ? 700 : 500,
                  borderBottom: '1px solid var(--paper-line)',
                  background: t.is_section ? '#EDE9DD' : 'transparent',
                  lineHeight: 1.15,
                  color: done ? 'var(--ink-soft)' : 'var(--ink)',
                  textDecoration: done ? 'line-through' : 'none',
                }}
              >
                {done && <span style={{ flexShrink: 0 }}>✓</span>}
                {t.designation}
              </div>
            )
          })}
        </div>

        <div style={{ overflowX: 'auto', flex: 1 }}>
          <div style={{ width: totalWidth, minWidth: totalWidth }}>
            <div style={{ display: 'flex', height: 40, borderBottom: '2px solid var(--ink)' }}>
              {monthBlocks.map((b, i) => (
                <div
                  key={i}
                  style={{
                    width: b.days * pxPerDay,
                    background: 'var(--blueprint)',
                    color: 'white',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRight: '1px solid rgba(255,255,255,0.3)',
                    flexShrink: 0,
                  }}
                >
                  {b.label}
                </div>
              ))}
            </div>

            {subUnits && (
              <div style={{ display: 'flex', height: 22, borderBottom: '1px solid var(--paper-line)' }}>
                {subUnits.map((u, i) => {
                  const isSel = selectedPeriod && u.start.getTime() === selectedPeriod.start.getTime()
                  return (
                    <button
                      key={i}
                      onClick={() => openPeriod(u)}
                      style={{
                        width: u.days * pxPerDay,
                        flexShrink: 0,
                        border: 'none',
                        borderRight: '1px solid var(--paper-line)',
                        background: isSel ? 'var(--safety)' : 'var(--paper)',
                        color: isSel ? 'white' : 'var(--ink-soft)',
                        fontSize: '0.6rem',
                        fontWeight: isSel ? 700 : 500,
                        padding: 0,
                      }}
                    >
                      {u.label}
                    </button>
                  )
                })}
              </div>
            )}

            {tasks.map((t) => {
              if (t.is_section) {
                return <div key={t.id} style={{ height: 26, background: '#EDE9DD', borderBottom: '1px solid var(--paper-line)' }} />
              }
              if (!t.debut || !t.fin) {
                return <div key={t.id} style={{ height: 34, borderBottom: '1px solid var(--paper-line)' }} />
              }
              const offsetDays = daysBetween(rangeStart, toDate(t.debut))
              const durDays = daysBetween(toDate(t.debut), toDate(t.fin)) + 1
              const barWidth = Math.max(durDays * pxPerDay, 4)
              const cl = t.checklist_id ? checklistById[t.checklist_id] : null
              const pct = cl ? Number(cl.avancement) : null
              const done = pct >= 100
              const isSelTask = selectedTask?.id === t.id
              const todayISO = new Date().toISOString().slice(0, 10)
              const isOverdue = t.fin < todayISO && !done
              return (
                <div key={t.id} style={{ height: 34, position: 'relative', borderBottom: '1px solid var(--paper-line)' }}>
                  <div
                    onClick={() => openTaskDetail(t)}
                    style={{
                      position: 'absolute',
                      left: offsetDays * pxPerDay,
                      width: barWidth,
                      top: 5,
                      height: 24,
                      background: t.couleur,
                      borderRadius: 5,
                      boxShadow: isSelTask ? '0 0 0 2px var(--safety)' : done ? '0 0 0 2px var(--recette)' : isOverdue ? '0 0 0 2px var(--depense)' : '0 1px 2px rgba(0,0,0,0.25)',
                      opacity: done ? 0.55 : 1,
                      overflow: 'hidden',
                    }}
                  >
                    {isOverdue && (
                      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg, rgba(176,35,23,0.35), rgba(176,35,23,0.35) 4px, transparent 4px, transparent 8px)' }} />
                    )}
                    {pct != null && pct > 0 && pct < 100 && (
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'rgba(255,255,255,0.55)' }} />
                    )}
                    {done && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.7rem', fontWeight: 700 }}>
                        ✓
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Panneau : programme du jour / de la semaine */}
      {selectedPeriod && (
        <div style={{ marginTop: 14, background: 'var(--card)', borderRadius: 12, padding: 14, border: '1.5px solid var(--paper-line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
              Programme — {zoom === 'jour' ? fmtLong(selectedPeriod.start) : `semaine du ${fmt(selectedPeriod.start)} au ${fmt(selectedPeriod.end)}`}
            </div>
            <button onClick={() => setSelectedPeriod(null)} style={{ background: 'none', border: 'none', fontSize: '1rem' }}>✕</button>
          </div>
          {periodTasks.length === 0 && <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>Aucune tâche prévue sur cette période.</div>}
          {periodTasks.map((t) => {
            const cl = t.checklist_id ? checklistById[t.checklist_id] : null
            return (
              <div key={t.id} onClick={() => openTaskDetail(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--paper-line)' }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: t.couleur, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.designation}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)' }}>{fmt(toDate(t.debut))} → {fmt(toDate(t.fin))}</div>
                </div>
                {cl && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700 }}>{cl.avancement}%</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Panneau : détail d'une tâche (étapes liées à l'Avancement) */}
      {selectedTask && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{selectedTask.designation}</div>
            <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', fontSize: '1rem' }}>✕</button>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: 10 }}>
            {fmt(toDate(selectedTask.debut))} → {fmt(toDate(selectedTask.fin))}
          </div>
          {selectedLot ? (
            <LotAccordion
              lot={{ ...selectedLot, parentTable: 'checklist', stableKey: String(selectedLot.numero) }}
              etapes={selectedEtapes}
              user={user}
              onChanged={load}
            />
          ) : (
            <div className="empty-state">Aucune étape détaillée liée à cette tâche.</div>
          )}
        </div>
      )}

      {editingId && (
        <div style={{ marginTop: 14, background: 'var(--card)', borderRadius: 12, padding: 14, border: '1.5px solid var(--paper-line)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>Modifier les dates</div>
          <div className="form-field">
            <label>Début</label>
            <input type="date" value={editDraft.debut || ''} onChange={(e) => setEditDraft({ ...editDraft, debut: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Fin</label>
            <input type="date" value={editDraft.fin || ''} onChange={(e) => setEditDraft({ ...editDraft, fin: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="submit-btn" style={{ background: 'var(--recette)' }} onClick={() => saveEdit(editingId)}>Enregistrer</button>
            <button className="submit-btn" style={{ background: 'var(--ink-soft)' }} onClick={() => setEditingId(null)}>Annuler</button>
          </div>

          <div style={{ borderTop: '1px dashed var(--paper-line)', paddingTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 8, color: 'var(--safety)' }}>⏱ En cas de retard</div>
            <div className="form-field">
              <label>Nombre de jours de retard</label>
              <input type="number" min="1" placeholder="ex : 5" value={delayDays} onChange={(e) => setDelayDays(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="submit-btn"
                style={{ background: 'var(--safety)' }}
                disabled={!delayDays}
                onClick={() => applyDelay(false)}
              >
                Décaler cette tâche de {delayDays || '…'} j
              </button>
              <button
                className="submit-btn"
                style={{ background: 'var(--depense)' }}
                disabled={!delayDays}
                onClick={() => applyDelay(true)}
              >
                Décaler cette tâche + toutes les suivantes
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 8 }}>Légende</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--blueprint)', opacity: 0.55, boxShadow: '0 0 0 2px var(--recette)' }} />
          Terminé (lié à l'Avancement)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: 'repeating-linear-gradient(45deg, var(--depense), var(--depense) 3px, #fff 3px, #fff 6px)', boxShadow: '0 0 0 2px var(--depense)' }} />
          En retard (date de fin dépassée)
        </div>
        {Array.from(new Map(tasks.filter(t => !t.is_section).map(t => [t.couleur, t.designation])).entries()).map(([color, name]) => (
          <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem' }}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
