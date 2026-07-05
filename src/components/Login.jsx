import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login({ onLogin }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [pins, setPins] = useState(null)
  const [candidates, setCandidates] = useState(null) // identités possibles si code partagé

  useEffect(() => {
    supabase.from('pins').select('*').then(({ data }) => {
      if (data) setPins(data)
    })
  }, [])

  function pressDigit(d) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError('')
    if (next.length === 4) {
      setTimeout(() => checkPin(next), 120)
    }
  }

  function checkPin(value) {
    if (!pins) {
      setError('Chargement en cours, réessayez')
      setTimeout(() => setPin(''), 500)
      return
    }
    const matches = pins.filter((p) => p.pin === value)
    if (matches.length === 0) {
      setError('Code incorrect')
      setTimeout(() => setPin(''), 400)
      return
    }
    if (matches.length === 1) {
      const nom = matches[0].nom
      onLogin({ nom, role: nom === 'Nej' ? 'admin' : 'associe' })
      return
    }
    // Code partagé par plusieurs identités (ex: Takiedine et Salah au même code)
    setCandidates(matches.map((m) => m.nom))
  }

  function backspace() {
    setPin(pin.slice(0, -1))
    setError('')
  }

  if (candidates) {
    return (
      <div className="login-screen">
        <div className="stamp"><span>CHANTIER<br/>SUIVI</span></div>
        <h1>Qui êtes-vous ?</h1>
        <p>Sélectionnez votre nom pour continuer</p>
        <div className="identity-choice">
          {candidates.map((nom) => (
            <button key={nom} onClick={() => onLogin({ nom, role: nom === 'Nej' ? 'admin' : 'associe' })}>
              {nom}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <div className="stamp"><span>CHANTIER<br/>SUIVI</span></div>
      <h1>Carnet de Chantier</h1>
      <p>Entrez votre code d'accès</p>
      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
        ))}
      </div>
      <div className="error-shake">{error}</div>
      <div className="keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => pressDigit(String(n))}>{n}</button>
        ))}
        <button className="wide" onClick={() => setPin('')}>Effacer</button>
        <button onClick={() => pressDigit('0')}>0</button>
        <button className="wide" onClick={backspace}>⌫</button>
      </div>
    </div>
  )
}
