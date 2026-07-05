import { useState } from 'react'
import ChecklistChantier from './ChecklistChantier.jsx'
import ChecklistAppartements from './ChecklistAppartements.jsx'

export default function Checklist({ user }) {
  const [subTab, setSubTab] = useState('chantier')

  return (
    <div>
      <div className="filter-row" style={{ marginBottom: 18 }}>
        <button className={`filter-chip ${subTab === 'chantier' ? 'active' : ''}`} onClick={() => setSubTab('chantier')}>
          Chantier (lots globaux)
        </button>
        <button className={`filter-chip ${subTab === 'appartements' ? 'active' : ''}`} onClick={() => setSubTab('appartements')}>
          Appartements (1-50)
        </button>
      </div>
      {subTab === 'chantier' && <ChecklistChantier user={user} />}
      {subTab === 'appartements' && <ChecklistAppartements user={user} />}
    </div>
  )
}
