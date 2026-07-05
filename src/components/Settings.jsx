import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Settings({ user }) {
  const [step, setStep] = useState('confirm') // confirm -> new -> done
  const [current, setCurrent] = useState('')
  const [next1, setNext1] = useState('')
  const [next2, setNext2] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function verifyCurrent(e) {
    e.preventDefault()
    setError('')
    const { data } = await supabase.from('pins').select('pin').eq('nom', user.nom).single()
    if (data && data.pin === current) {
      setStep('new')
    } else {
      setError('Code actuel incorrect')
    }
  }

  async function saveNew(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{4}$/.test(next1)) {
      setError('Le code doit contenir exactement 4 chiffres')
      return
    }
    if (next1 !== next2) {
      setError('Les deux codes ne correspondent pas')
      return
    }
    setSaving(true)
    const { error: err } = await supabase
      .from('pins')
      .update({ pin: next1, updated_at: new Date().toISOString() })
      .eq('nom', user.nom)
    setSaving(false)
    if (err) {
      setError("Erreur lors de l'enregistrement")
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <div>
        <div className="section-title">Réglages</div>
        <div className="empty-state">
          ✓ Votre code d'accès a été mis à jour.<br />
          Il sera utilisé dès votre prochaine connexion.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-title">Réglages</div>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', marginTop: -8, marginBottom: 18 }}>
        Session : <strong>{user.nom}</strong>
      </p>

      {step === 'confirm' && (
        <form onSubmit={verifyCurrent}>
          <div className="form-field">
            <label>Code actuel</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={current}
              onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          {error && <div className="error-shake" style={{ minHeight: 'auto' }}>{error}</div>}
          <button className="submit-btn" type="submit">Vérifier</button>
        </form>
      )}

      {step === 'new' && (
        <form onSubmit={saveNew}>
          <div className="form-field">
            <label>Nouveau code (4 chiffres)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={next1}
              onChange={(e) => setNext1(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <div className="form-field">
            <label>Confirmer le nouveau code</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={next2}
              onChange={(e) => setNext2(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          {error && <div className="error-shake" style={{ minHeight: 'auto' }}>{error}</div>}
          <button className="submit-btn" type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Changer mon code'}
          </button>
        </form>
      )}
    </div>
  )
}
