// Dexie (IndexedDB wrapper module declaration)
// Table definitions
import Dexie, { Table } from 'dexie'
import debounce from 'lodash/debounce'
import { isOnline } from './utils'
import { SyncAPIEvents } from './events'

export interface _Object {
  id: string
  type: string
  json: unknown
  added?: number
  source?: 'api' | 'client'
}

export interface _Request {
  id?: number
  url: string
  options?: RequestInit
  added: number
}

export class OfflineDexie extends Dexie {
  objects!: Table<_Object, string>
  requests!: Table<_Request, number>

  constructor() {
    super('OfflineDexie')
    this.version(1).stores({
      objects: 'id, type',
      requests: '++id, added',
    })
  }

  putObject = async (obj: _Object) => {
    obj.added = Date.now()
    obj.json = JSON.parse(JSON.stringify(obj.json))
    SyncAPIEvents.emit('did-modify-dbobject', obj.id, obj)
    return this.objects.put(obj, obj.id)
  }

  removeObject = async (objID: string) => {
    SyncAPIEvents.emit('did-modify-dbobject', objID, null)
    return this.objects.delete(objID)
  }

  enqueueRequest = async (url: string, options?: RequestInit) => {
    const req = {
      url,
      options,
      added: Date.now(),
    }
    return this.requests.put(req)
  }

  peekNextRequest = async () => {
    return this.requests.orderBy('added').first()
  }

  dequeueRequest = async (reqID: number) => {
    return this.requests.delete(reqID)
  }

  hasPendingChanges = async () => {
    const pending = await this.requests.count()
    return pending > 0
  }

  private collateRequests = async () => {
    const pendingRequests = await this.requests.orderBy('added').toArray()

    // Maps unique key -> Tuple (collated request, original ids related)
    const collated = new Map<string, [_Request, number[]]>()

    for (const req of pendingRequests) {
      const uniqueKey = req.options?.method + req.url
      const [col, ids] = collated.get(uniqueKey) ?? [req, []]
      Object.assign(col, req)
      ids.push(req.id!)
      collated.set(uniqueKey, [col, ids])
    }

    const collatedRequestTuples = Array.from(collated.values())
    collatedRequestTuples.sort((a, b) => (a[0].added < b[0].added ? -1 : 1))

    return collatedRequestTuples
  }

  publishChanges = debounce(async () => {
    if (!isOnline()) return false
    const publishedRequests = []

    const collated = await this.collateRequests()
    for (const [req, ids] of collated) {
      try {
        await fetch(req.url, req.options)
        await Promise.all(ids.map(db.dequeueRequest))
        publishedRequests.push(req)
        console.debug(
          '[offline]',
          'Dequeued',
          req.options?.method,
          req.url,
          req.id,
          'collated these reqs',
          ids
        )
      } catch (err) {
        console.error('REQUEST FAILED TO PUSH...', { req, err })
      }
    }

    const didChange = publishedRequests.length > 0
    if (didChange) {
      SyncAPIEvents.emit('did-push-requests', publishedRequests)
    }
    return didChange
  }, 200)
}

export const db = new OfflineDexie()
