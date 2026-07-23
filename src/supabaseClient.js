// ============================================================
// COMPAT LAYER — Interface Supabase → Appwrite
// Garde les imports existants des composants inchangés
// ============================================================

import { databases, storage as awStorage, realtime } from './lib/appwrite'
import { DB_ID, COL, BUCKET_RECUS } from './lib/config'
import { Query, ID, Permission, Role } from 'appwrite'

const COL_MAP = {
  pins: COL.pins,
  entries: COL.entries,
  checklist: COL.checklist,
  etapes: COL.etapes,
  gantt_taches: COL.gantt_taches,
  appartement_lots: COL.appartement_lots,
  budgets: COL.budgets,
}

function colId(name) {
  const id = COL_MAP[name]
  if (!id) throw new Error(`Table inconnue: ${name}`)
  return id
}

// Appwrite expose l'identifiant du document sous "$id" (attribut système),
// jamais sous "id". On traduit donc tout filtre/champ "id" vers "$id".
function mapField(field) {
  return field === 'id' ? '$id' : field
}

// Ajoute un alias `id` (= $id) sur chaque document lu, pour que le code
// applicatif (écrit à l'origine pour Postgres/Supabase) continue de
// fonctionner sans modification (row.id partout).
function withIdAlias(doc) {
  if (!doc) return doc
  return { ...doc, id: doc.$id }
}

// --- Helpers DB internes ---
async function updateByFilter(table, patch, field, value) {
  try {
    if (field === 'id') {
      const doc = await databases.updateDocument(DB_ID, colId(table), value, patch)
      return { data: withIdAlias(doc), error: null }
    }
    const list = await databases.listDocuments(DB_ID, colId(table), [Query.equal(mapField(field), [value])])
    for (const doc of list.documents) {
      await databases.updateDocument(DB_ID, colId(table), doc.$id, patch)
    }
    return { data: null, error: null }
  } catch (err) {
    console.error(`Erreur update ${table}:`, err)
    return { data: null, error: err }
  }
}

async function updateByIds(table, patch, ids) {
  try {
    for (const id of ids) {
      await databases.updateDocument(DB_ID, colId(table), id, patch)
    }
    return { data: null, error: null }
  } catch (err) {
    console.error(`Erreur updateByIds ${table}:`, err)
    return { data: null, error: err }
  }
}

async function deleteByFilter(table, field, value) {
  try {
    if (field === 'id') {
      await databases.deleteDocument(DB_ID, colId(table), value)
      return { data: null, error: null }
    }
    const list = await databases.listDocuments(DB_ID, colId(table), [Query.equal(mapField(field), [value])])
    for (const doc of list.documents) {
      await databases.deleteDocument(DB_ID, colId(table), doc.$id)
    }
    return { data: null, error: null }
  } catch (err) {
    console.error(`Erreur delete ${table}:`, err)
    return { data: null, error: err }
  }
}

async function deleteByIds(table, ids) {
  try {
    for (const id of ids) {
      await databases.deleteDocument(DB_ID, colId(table), id)
    }
    return { data: null, error: null }
  } catch (err) {
    console.error(`Erreur deleteByIds ${table}:`, err)
    return { data: null, error: err }
  }
}

// --- Query builder (Supabase-like) ---
class QueryBuilder {
  constructor(table) {
    this._table = table
    this._queries = []
    this._orderByField = null
    this._orderByAsc = true
    this._countMode = null
    this._headOnly = false
  }

  select(cols = '*', opts) {
    if (opts?.count) this._countMode = opts.count
    if (opts?.head) this._headOnly = true
    return this
  }

  eq(field, value) {
    this._queries.push(Query.equal(mapField(field), [value]))
    return this
  }

  neq(field, value) {
    this._queries.push(Query.notEqual(mapField(field), [value]))
    return this
  }

  gt(field, value) {
    this._queries.push(Query.greaterThan(mapField(field), value))
    return this
  }

  lt(field, value) {
    this._queries.push(Query.lessThan(mapField(field), value))
    return this
  }

  in(field, values) {
    if (!values || values.length === 0) {
      this._queries.push(Query.equal('__never__', ['__never__']))
      return this
    }
    this._queries.push(Query.equal(mapField(field), values))
    return this
  }

  order(field, opts = {}) {
    this._orderByField = mapField(field)
    this._orderByAsc = opts.ascending !== false
    return this
  }

  then(resolve) {
    this._execute().then(resolve)
  }

  async _execute() {
    const sort = this._orderByField
      ? [this._orderByAsc ? Query.orderAsc(this._orderByField) : Query.orderDesc(this._orderByField)]
      : []

    try {
      const response = await databases.listDocuments(
        DB_ID,
        colId(this._table),
        [...this._queries, ...sort, Query.limit(1000)]
      )

      if (this._headOnly) {
        return { data: null, error: null, count: response.total }
      }
      return { data: response.documents.map(withIdAlias), error: null, count: response.total }
    } catch (err) {
      console.error(`Erreur ${this._table}:`, err)
      return { data: null, error: err, count: null }
    }
  }
}

// --- Storage ---
const storageProxy = {
  from(bucket) {
    return {
      async upload(path, file) {
        try {
          const response = await awStorage.createFile(BUCKET_RECUS, ID.unique(), file)
          return { data: { path: response.$id }, error: null }
        } catch (err) {
          return { data: null, error: err }
        }
      },
      getPublicUrl(path) {
        try {
          const url = awStorage.getFilePreview(BUCKET_RECUS, path).href
          return { data: { publicUrl: url } }
        } catch {
          return { data: { publicUrl: '' } }
        }
      },
    }
  },
}

// --- Channel / Realtime ---
const channels = new Map()

function makeChannel(name) {
  return {
    _name: name,
    _tables: new Set(),
    _callback: null,

    on(event, opts, callback) {
      if (typeof opts === 'function') {
        callback = opts
        opts = event
        event = null
      }
      if (opts?.table) this._tables.add(opts.table)
      this._callback = callback
      return this
    },

    subscribe() {
      const tables = [...this._tables]
      const unsub = realtime.subscribe(tables, this._callback || (() => {}))
      channels.set(this._name, unsub)
      return this
    },
  }
}

// --- Interface Supabase ---
export const supabase = {
  from(table) {
    return {
      select(cols = '*', opts) {
        return new QueryBuilder(table).select(cols, opts)
      },
      insert(payload) {
        return (async () => {
          try {
            // Supprimer null/undefined : Appwrite rejette les champs non définis dans le schema
            const cleanPayload = Object.fromEntries(
              Object.entries(payload).filter(([, v]) => v !== null && v !== undefined)
            )
            const data = await databases.createDocument(
              DB_ID,
              colId(table),
              ID.unique(),
              cleanPayload,
              [Permission.read(Role.any()), Permission.update(Role.any()), Permission.delete(Role.any())]
            )
            return { data: withIdAlias(data), error: null }
          } catch (err) {
            console.error(`Erreur insert ${table}:`, err)
            return { data: null, error: err }
          }
        })()
      },
      update(patch) {
        return {
          eq(field, value) { return updateByFilter(table, patch, field, value) },
          in(field, values) { return updateByIds(table, patch, values) },
        }
      },
      delete() {
        return {
          eq(field, value) { return deleteByFilter(table, field, value) },
          in(field, values) { return deleteByIds(table, values) },
        }
      },
    }
  },

  storage: storageProxy,

  channel(name) {
    return makeChannel(name)
  },

  removeChannel(channel) {
    const unsub = channels.get(channel._name)
    if (unsub) {
      unsub()
      channels.delete(channel._name)
    }
  },
}
