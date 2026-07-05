import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']

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

const ZOOMS = {
  jour: { pxPerDay: 26, label: 'Jour' },
  semaine: { pxPerDay: 8, label: 'Semaine' },
  mois: { pxPerDay: 2.4, label: 'Mois' },
}

export default function GanttView({ user }) {
  const [tasks, setTasks] = useState([])
  const [checklistById, setChecklistById] = useState({})
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState('mois')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})

  const isAdmin = user.role === 'admin'

  const load = useCallback(async () => {
    const { data } = await supabase.from('gantt_taches').select('*').order('ordre', { ascending: true })
    setTasks(data || [])
    const { data: cl } = await supabase.from('checklist').select('id, avancement, statut')
    const map = {}
    ;(cl || []).forEach((c) => { map[c.id] = c })
    setChecklistById(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('gantt-taches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gantt_taches' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist' }, load)
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

  const pxPerDay = ZOOMS[zoom].pxPerDay
  const totalWidth = totalDays * pxPerDay

  function startEdit(t) {
    setEditingId(t.id)
    setEditDraft({ debut: t.debut, fin: t.fin })
  }
  async function saveEdit(id) {
    await supabase.from('gantt_taches').update({ debut: editDraft.debut, fin: editDraft.fin, updated_by: user.nom, updated_at: new Date().toISOString() }).eq('id', id)
    setEditingId(null)
  }

  if (loading) return <div className="empty-state">Chargement du planning…</div>

  return (
    <div>
      <div className="section-title">Planning des travaux</div>

      <div className="filter-row">
        {Object.entries(ZOOMS).map(([key, z]) => (
          <button key={key} className={`filter-chip ${zoom === key ? 'active' : ''}`} onClick={() => setZoom(key)}>
            {z.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: 8 }}>
        {fmt(rangeStart)} → {fmt(rangeEnd)} · fais glisser horizontalement pour naviguer · le remplissage clair = avancement réel
      </div>

      <div style={{ display: 'flex', border: '1px solid var(--paper-line)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, width: 132, background: 'var(--card)', borderRight: '2px solid var(--ink)' }}>
          <div style={{ height: 40, borderBottom: '2px solid var(--ink)', background: 'var(--ink)' }} />
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
              return (
                <div key={t.id} style={{ height: 34, position: 'relative', borderBottom: '1px solid var(--paper-line)' }}>
                  <div
                    onClick={() => startEdit(t)}
                    style={{
                      position: 'absolute',
                      left: offsetDays * pxPerDay,
                      width: barWidth,
                      top: 5,
                      height: 24,
                      background: t.couleur,
                      borderRadius: 5,
                      boxShadow: done ? '0 0 0 2px var(--recette)' : '0 1px 2px rgba(0,0,0,0.25)',
                      opacity: done ? 0.55 : 1,
                      overflow: 'hidden',
                    }}
                  >
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="submit-btn" style={{ background: 'var(--recette)' }} onClick={() => saveEdit(editingId)}>Enregistrer</button>
            <button className="submit-btn" style={{ background: 'var(--ink-soft)' }} onClick={() => setEditingId(null)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 8 }}>Légende</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--blueprint)', opacity: 0.55, boxShadow: '0 0 0 2px var(--recette)' }} />
          Terminé (lié à l'Avancement)
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
