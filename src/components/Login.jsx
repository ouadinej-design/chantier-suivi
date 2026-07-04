import { useState } from 'react'

const ADMIN_PIN = '1981'
const TEAM_PIN = '5050'

export default function Login({ onLogin }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [awaitingIdentity, setAwaitingIdentity] = useState(false)

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
    if (value === ADMIN_PIN) {
      onLogin({ nom: 'Nej', role: 'admin' })
      return
    }
    if (value === TEAM_PIN) {
      setAwaitingIdentity(true)
      return
    }
    setError('Code incorrect')
    setTimeout(() => setPin(''), 400)
  }

  function backspace() {
    setPin(pin.slice(0, -1))
    setError('')
  }

  if (awaitingIdentity) {
    return (
      <div className="login-screen">
        <div className="stamp"><span>CHANTIER<br/>SUIVI</span></div>
        <h1>Qui êtes-vous ?</h1>
        <p>Sélectionnez votre nom pour continuer</p>
        <div className="identity-choice">
          <button onClick={() => onLogin({ nom: 'Takiedine', role: 'associe' })}>Takiedine</button>
          <button onClick={() => onLogin({ nom: 'Salah', role: 'associe' })}>Salah</button>
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
