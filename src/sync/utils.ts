import { _Object, db } from './db'

export const isOnline = () => {
  return navigator?.onLine
}

export const synchronizedFetch = async (url: string, options?: RequestInit) => {
  await db.publishChanges()
  return fetch(url, options)
}


export const markObjectWritable = async (obj: _Object) => {
  if (obj.source === 'api' || !obj.source) {
    await db.putObject({...obj, source: 'client'});
  }
}

