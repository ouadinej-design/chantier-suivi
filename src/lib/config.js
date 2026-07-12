// ========================================================
// CONFIGURATION APPWRITE
// ========================================================

export const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'
export const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID || '6a530c820025f21e84c7'
export const APPWRITE_API_KEY = import.meta.env.VITE_APPWRITE_API_KEY || ''

// Database ID
export const DB_ID = 'chantier-suivi'

// Collection IDs
export const COL = {
  pins:              'pins',
  entries:           'entries',
  checklist:         'checklist',
  etapes:            'etapes',
  gantt_taches:      'gantt_taches',
  appartement_lots:  'appartement_lots',
  budgets:           'budgets',
}

// Storage bucket ID
export const BUCKET_RECUS = 'recus'
