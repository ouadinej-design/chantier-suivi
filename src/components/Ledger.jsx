import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const TYPE_LABELS = { depense: 'Dépense', recette: 'Recette', retrait: 'Retrait' }

function formatDA(n) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' DA'
}

export default function Ledger({ user }) {
  const [entries, setEntries] = useState([])
  const [filter, setFilter] = useState('tous')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})

  const isAdmin = user.role === 'admin'

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error) setEntries(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('entries-ledger')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const solde = entries.reduce((acc, e) => {
    if (e.type === 'recette') return acc + Number(e.montant)
    return acc - Number(e.montant)
  }, 0)

  const filtered = filter === 'tous' ? entries : entries.filter((e) => e.type === filter)

  function startEdit(entry) {
    setEditingId(entry.id)
    setEditDraft({
      designation: entry.designation || '',
      montant: entry.montant,
      commentaire: entry.commentaire || '',
      date: entry.date,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft({})
  }

  async function saveEdit(id) {
    const patch = {
      designation: editDraft.designation || null,
      montant: Number(editDraft.montant),
      commentaire: editDraft.commentaire || null,
      date: editDraft.date,
    }
    await supabase.from('entries').update(patch).eq('id', id)
    setEditingId(null)
    setEditDraft({})
  }

  async function deleteEntry(id) {
    if (!window.confirm('Supprimer définitivement cette écriture ?')) return
    await supabase.from('entries').delete().eq('id', id)
  }

  return (
    <div>
      <div className="balance-card">
        <div className="label">Solde de caisse</div>
        <div className="amount">{formatDA(solde)}</div>
      </div>

      <div className="filter-row">
        {['tous', 'recette', 'depense', 'retrait'].map((f) => (
          <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'tous' ? 'Tout' : TYPE_LABELS[f]}
          </button>
        ))}
      </div>

      {loading && <div className="empty-state">Chargement du registre…</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state">Aucune écriture pour le moment.<br />Ajoutez la première depuis l'onglet Saisir.</div>
      )}

      {filtered.map((e) => (
        <div key={e.id} className="ledger-entry" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {editingId === e.id ? (
            <div>
              <div className="form-field">
                <label>Date</label>
                <input type="date" value={editDraft.date} onChange={(ev) => setEditDraft({ ...editDraft, date: ev.target.value })} />
              </div>
              <div className="form-field">
                <label>Désignation</label>
                <input type="text" value={editDraft.designation} onChange={(ev) => setEditDraft({ ...editDraft, designation: ev.target.value })} />
              </div>
              <div className="form-field">
                <label>Montant (DA)</label>
                <input type="number" step="0.01" value={editDraft.montant} onChange={(ev) => setEditDraft({ ...editDraft, montant: ev.target.value })} />
              </div>
              <div className="form-field">
                <label>Commentaire</label>
                <textarea value={editDraft.commentaire} onChange={(ev) => setEditDraft({ ...editDraft, commentaire: ev.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="submit-btn" style={{ background: 'var(--recette)' }} onClick={() => saveEdit(e.id)}>Enregistrer</button>
                <button className="submit-btn" style={{ background: 'var(--ink-soft)' }} onClick={cancelEdit}>Annuler</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              <span className={`ledger-type-mark ${e.type}`}>{TYPE_LABELS[e.type]}</span>
              <div className="ledger-body">
                <div className="ledger-designation">{e.designation || e.categorie || '—'}</div>
                <div className="ledger-meta">
                  {new Date(e.date).toLocaleDateString('fr-FR')} · {e.auteur}
                  {e.beneficiaire ? ` → ${e.beneficiaire}` : ''}
                </div>
                {e.commentaire && <div className="ledger-meta">{e.commentaire}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <div className={`ledger-amount ${e.type}`}>
                  {e.type === 'recette' ? '+' : '−'}{formatDA(e.montant)}
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => startEdit(e)} style={{ background: 'none', border: 'none', fontSize: '0.9rem' }} title="Modifier">✏️</button>
                    <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 'none', fontSize: '0.9rem' }} title="Supprimer">🗑️</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
