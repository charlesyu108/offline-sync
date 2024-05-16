import { isOnline } from './utils'
import { _Request, db } from './db'
import { SyncAPIEvents } from './events'
/**
 * This class is the main access point to the "Sync Layer"
 * which serves to synchronize the changes between local db & remote.
 *
 * --- HOW IT WORKS ---
 * It uses an IndexDB (the objects table) as the source of truth for this app
 * and keeps that source of truth in sync with the API whenever internet is available.
 * When offline, it queues outbound requests in another IndexDB (the requests table) which
 * are executed whenever `.sync` comes online.
 *
 * 
 * <------------- !TODO ----------------------->
 * --- INTERACTING WITH OPERATIONS ---
 * Object-specific reads/writes are organized by sub-API. For example, to update/read/create projects,
 * you will use SyncAPI.projects.{operation}. These APIs read/write to IndexedDB and promise
 * they eventually will sync with API.
 *
 * --- ON SYNCING ---
 * `.sync` expells pending changes and pulls in the latest from the API when online.
 * Set `.setBackgroundSync` allows for configuring `.sync` to be fired on an interval.
 * Configure any global data or necessary data for offline that needs to be refreshed
 * in `.pullLatest`
 *
 * Guiding principles:
 * - All reads and writes must use the objects db as the source of truth.
 * - Only reads can happen directly against the API and should happen after publishing changes.
 * - All writes must be queued against the outbound requests db.
 * - For reading data, flush the outbound requests before pulling in new data.
 * - If there are outbound requests, only data written by "client" will be served back (this will get replaced by an "api" view once requests are flushed)
 *
 */
class _SyncAPI {

  events = SyncAPIEvents
  bgSyncInterval: NodeJS.Timeout | null = null
  loopingInterval: NodeJS.Timeout | null = null

  // Defines how to pull in the latest data from the API
  // This is useful for refreshing data that is not being actively written to
  pullFromPersistence: (() => Promise<void>) | null = null

  // Metadata
  lastOnlineStatus: 'online' | 'offline' = 'online'

  init() {
    clearInterval(this.loopingInterval!)
    this.loopingInterval = setInterval(this._loop, 200)

    this.events.on('did-go-online', (_) => {
      this.pushChanges()
    })
  }

  sync = async () => {
    if (!this.loopingInterval) this.init()

    if (!isOnline()) {
      console.warn('Ignore sync, is offline...')
    } else {
      await this.pushChanges();
    }

    if (this.pullFromPersistence) {
      await this.pullFromPersistence()
    }

  }

  pushChanges = async () => {
    return await db.publishChanges()
  }

  setBackgroundSync = (enabled: boolean, intervalMS: number = 5000) => {
    clearInterval(this.bgSyncInterval!)
    if (enabled) {
      this.bgSyncInterval = setInterval(this.sync, intervalMS)
    }
  }

  _loop = () => {
    this._loopTaskCheckPending()
    this._loopTaskCheckOnline()
  }

  _loopTaskCheckPending = async () => {
    const status = await db.hasPendingChanges()
    this.events.emit('has-pending-changes', status)
  }

  _loopTaskCheckOnline = async () => {
    const currentStatus = isOnline() ? 'online' : 'offline'
    if (currentStatus !== this.lastOnlineStatus) {
      this.events.emit(`did-go-${currentStatus}`, Date.now())
    }
    this.lastOnlineStatus = currentStatus
  }
}

export const SyncAPI = new _SyncAPI()
