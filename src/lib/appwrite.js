import { Client, Databases, Storage, Query, ID, Permission, Role } from 'appwrite'
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  DB_ID,
  COL,
  BUCKET_RECUS,
} from './config'

// --- Client ---
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setDevKey(APPWRITE_API_KEY)

export const databases = new Databases(client)
export const storage = new Storage(client)

// --- Helpers ---
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
  if (!id) throw new Error(`Collection inconnue : ${name}`)
  return id
}

// --- Query builder (Supabase-like) ---
class QueryBuilder {
  constructor(collection) {
    this._collection = collection
    this._queries = []
    this._orderBy = null
    this._orderAsc = true
  }

  eq(field, value) {
    this._queries.push(Query.equal(field, [value]))
    return this
  }

  neq(field, value) {
    this._queries.push(Query.notEqual(field, [value]))
    return this
  }

  gt(field, value) {
    this._queries.push(Query.greaterThan(field, value))
    return this
  }

  lt(field, value) {
    this._queries.push(Query.lessThan(field, value))
    return this
  }

  in(field, values) {
    if (!values || values.length === 0) {
      // Appwrite ne supporte pas l'IN avec un tableau vide
      // On force un filtre qui ne matche rien
      this._queries.push(Query.equal('__never__', ['__never__']))
      return this
    }
    this._queries.push(Query.equal(field, values))
    return this
  }

  order(field, opts = {}) {
    this._orderBy = field
    this._orderAsc = opts.ascending !== false
    return this
  }

  select() {
    return this
  }

  async then(resolve) {
    const result = await this._execute()
    resolve(result)
  }

  async _execute() {
    const sort = this._orderBy
      ? [this._orderAsc ? Query.orderAsc(this._orderBy) : Query.orderDesc(this._orderBy)]
      : []

    try {
      const response = await databases.listDocuments(
        DB_ID,
        colId(this._collection),
        [...this._queries, ...sort]
      )
      return { data: response.documents, error: null }
    } catch (err) {
      console.error(`Erreur ${this._collection}:`, err)
      return { data: null, error: err }
    }
  }
}

// --- API Supabase-like ---
export const db = {
  from(table) {
    return {
      select(columns = '*') {
        return new QueryBuilder(table)
      },

      async insert(payload) {
        try {
          const data = await databases.createDocument(
            DB_ID,
            colId(table),
            ID.unique(),
            payload,
            [Permission.read(Role.any()), Permission.update(Role.any()), Permission.delete(Role.any())]
          )
          return { data, error: null }
        } catch (err) {
          console.error(`Erreur insert ${table}:`, err)
          return { data: null, error: err }
        }
      },

      async update(patch) {
        return {
          eq(field, value) {
            return db._updateByFilter(table, patch, field, value)
          },
          in(field, values) {
            return db._updateByIds(table, patch, values)
          },
        }
      },

      async delete() {
        return {
          eq(field, value) {
            return db._deleteByFilter(table, field, value)
          },
          in(field, values) {
            return db._deleteByIds(table, values)
          },
        }
      },
    }
  },

  async _updateByFilter(table, patch, field, value) {
    try {
      // Find the document(s) matching the filter
      const list = await databases.listDocuments(DB_ID, colId(table), [Query.equal(field, [value])])
      for (const doc of list.documents) {
        await databases.updateDocument(DB_ID, colId(table), doc.$id, patch)
      }
      return { data: null, error: null }
    } catch (err) {
      console.error(`Erreur update ${table}:`, err)
      return { data: null, error: err }
    }
  },

  async _updateByIds(table, patch, ids) {
    try {
      for (const id of ids) {
        await databases.updateDocument(DB_ID, colId(table), id, patch)
      }
      return { data: null, error: null }
    } catch (err) {
      console.error(`Erreur updateByIds ${table}:`, err)
      return { data: null, error: err }
    }
  },

  async _deleteByFilter(table, field, value) {
    try {
      const list = await databases.listDocuments(DB_ID, colId(table), [Query.equal(field, [value])])
      for (const doc of list.documents) {
        await databases.deleteDocument(DB_ID, colId(table), doc.$id)
      }
      return { data: null, error: null }
    } catch (err) {
      console.error(`Erreur delete ${table}:`, err)
      return { data: null, error: err }
    }
  },

  async _deleteByIds(table, ids) {
    try {
      for (const id of ids) {
        await databases.deleteDocument(DB_ID, colId(table), id)
      }
      return { data: null, error: null }
    } catch (err) {
      console.error(`Erreur deleteByIds ${table}:`, err)
      return { data: null, error: err }
    }
  },
}

// --- Storage (photos justificatives) ---
export const recus = {
  async upload(path, file) {
    try {
      const response = await storage.createFile(BUCKET_RECUS, ID.unique(), file)
      return { data: response, error: null }
    } catch (err) {
      console.error('Erreur upload:', err)
      return { data: null, error: err }
    }
  },

  getPublicUrl(fileId) {
    return storage.getFilePreview(BUCKET_RECUS, fileId).href
  },

  getDownloadUrl(fileId) {
    return storage.getFileDownload(BUCKET_RECUS, fileId).href
  },
}

// --- Realtime (abonnements Supabase-like) ---
const realtimeChannels = new Map()

export const realtime = {
  subscribe(tables, callback) {
    const channel = `channel-${Date.now()}`
    const unsubscribeFns = []

    for (const table of tables) {
      const colIdVal = COL_MAP[table]
      if (!colIdVal) continue

      // Appwrite realtime : on écoute les events sur une collection
      const unsub = client.subscribe(
        `databases.${DB_ID}.collections.${colIdVal}.documents`,
        () => {
          callback()
        }
      )
      unsubscribeFns.push(unsub)
    }

    realtimeChannels.set(channel, unsubscribeFns)

    return () => {
      const fns = realtimeChannels.get(channel)
      if (fns) {
        fns.forEach((fn) => fn())
        realtimeChannels.delete(channel)
      }
    }
  },
}
