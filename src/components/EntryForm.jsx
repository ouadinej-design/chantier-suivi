import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const ASSOCIES = ['Takiedine', 'Salah', 'Nej']

export default function EntryForm({ user, onSaved }) {
  const [type, setType] = useState('depense')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [section, setSection] = useState('logements')
  const [categories, setCategories] = useState([])
  const [categorie, setCategorie] = useState('')
  const [designation, setDesignation] = useState('')
  const [montant, setMontant] = useState('')
  const [beneficiaire, setBeneficiaire] = useState(ASSOCIES[0])
  const [commentaire, setCommentaire] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [numeroFacture, setNumeroFacture] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState('')

  useEffect(() => {
    supabase.from('budgets').select('categorie').eq('section', section).order('ordre', { ascending: true }).then(({ data }) => {
      const list = (data || []).map((b) => b.categorie)
      setCategories(list)
      setCategorie(list[0] || '')
    })
  }, [section])

  function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!montant || Number(montant) <= 0) return
    setSaving(true)

    let photo_url = null
    if (photoFile) {
      const path = `${Date.now()}_${photoFile.name}`
      const { data, error } = await supabase.storage.from('recus').upload(path, photoFile)
      if (!error && data) {
        const { data: pub } = supabase.storage.from('recus').getPublicUrl(path)
        photo_url = pub.publicUrl
      }
    }

    // Payload minimal : seulement les champs certains du schema Appwrite
    const rawPayload = { type, date, montant: Number(montant), auteur: user.nom }
    if (designation) rawPayload.designation = designation
    if (commentaire) rawPayload.commentaire = commentaire
    if (photo_url) rawPayload.photo_url = photo_url
    if (type === 'depense' && categorie) rawPayload.categorie = categorie
    if (type === 'retrait' && beneficiaire) rawPayload.beneficiaire = beneficiaire
    // Champs optionnels (peuvent ne pas exister dans le schema Appwrite selon la migration)
    try { rawPayload.lu = user.nom === 'Nej' } catch(e) {}
    try { if (type === 'depense' && section) rawPayload.section = section } catch(e) {}
    try { if (type === 'recette' && numeroFacture) rawPayload.numero_facture = numeroFacture } catch(e) {}

    const { error } = await supabase.from('entries').insert(rawPayload)
    setSaving(false)

    if (!error) {
      setConfirmMsg('Écriture enregistrée ✓')
      setDesignation('')
      setMontant('')
      setCommentaire('')
      setPhotoFile(null)
      setPhotoPreview(null)
      setNumeroFacture('')
      setTimeout(() => setConfirmMsg(''), 2000)
      onSaved && onSaved()
    } else {
      setConfirmMsg("Erreur: " + (error?.message || error?.type || JSON.stringify(error)))
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="section-title">Nouvelle écriture</div>

      <div className="type-toggle">
        <button type="button" className={`${type === 'depense' ? 'active depense' : ''}`} onClick={() => setType('depense')}>Dépense</button>
        <button type="button" className={`${type === 'recette' ? 'active recette' : ''}`} onClick={() => setType('recette')}>Recette</button>
        <button type="button" className={`${type === 'retrait' ? 'active retrait' : ''}`} onClick={() => setType('retrait')}>Retrait</button>
      </div>

      <div className="form-field">
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>

      {type === 'depense' && (
        <div className="form-field">
          <label>Section du budget</label>
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="logements">Logements</option>
            <option value="vrd">VRD</option>
            <option value="autre">Autre</option>
          </select>
        </div>
      )}

      {type === 'depense' && (
        <div className="form-field">
          <label>Poste budgétaire</label>
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {type === 'retrait' && (
        <div className="form-field">
          <label>Bénéficiaire</label>
          <select value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)}>
            {ASSOCIES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      )}

      {type === 'recette' && (
        <div className="form-field">
          <label>Numéro de facture</label>
          <input
            type="text"
            placeholder="ex : FACT-2026-014"
            value={numeroFacture}
            onChange={(e) => setNumeroFacture(e.target.value)}
          />
        </div>
      )}

      <div className="form-field">
        <label>Désignation</label>
        <input
          type="text"
          placeholder={type === 'depense' ? 'ex : Ciment, sable…' : type === 'recette' ? 'ex : Situation n°2' : 'ex : Part de bénéfice'}
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label>Montant (DA)</label>
        <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" value={montant} onChange={(e) => setMontant(e.target.value)} required />
      </div>

      <div className="form-field">
        <label>Commentaire (optionnel)</label>
        <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
      </div>

      {type === 'depense' && (
        <div className="form-field">
          <label>Justificatif photo (optionnel)</label>
          <div className="photo-input">
            {photoFile ? photoFile.name : 'Toucher pour prendre une photo'}
            <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
          </div>
          {photoPreview && <img src={photoPreview} alt="aperçu" className="photo-preview" />}
        </div>
      )}

      <button className="submit-btn" type="submit" disabled={saving}>
        {saving ? 'Enregistrement…' : 'Enregistrer l\'écriture'}
      </button>
      {confirmMsg && <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.85rem' }}>{confirmMsg}</div>}
    </form>
  )
}
