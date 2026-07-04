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
        <div key={e.id} className="ledger-entry">
          <span className={`ledger-type-mark ${e.type}`}>{TYPE_LABELS[e.type]}</span>
          <div className="ledger-body">
            <div className="ledger-designation">{e.designation || e.categorie || '—'}</div>
            <div className="ledger-meta">
              {new Date(e.date).toLocaleDateString('fr-FR')} · {e.auteur}
              {e.beneficiaire ? ` → ${e.beneficiaire}` : ''}
            </div>
            {e.commentaire && <div className="ledger-meta">{e.commentaire}</div>}
          </div>
          <div className={`ledger-amount ${e.type}`}>
            {e.type === 'recette' ? '+' : '−'}{formatDA(e.montant)}
          </div>
        </div>
      ))}
    </div>
  )
}
