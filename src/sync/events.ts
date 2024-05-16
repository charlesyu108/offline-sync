import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { _Object, _Request } from "./db";

type SyncAPIEventTypes = {
    'did-go-online': (at: number) => void,
    'did-go-offline': (at: number) => void,
    'did-modify-dbobject': (objectID: string, value: _Object | null) => void,
    'did-push-requests': (requests: _Request[]) => void,
    'has-pending-changes': (status: boolean) => void,
}

export const SyncAPIEvents = new EventEmitter() as TypedEmitter<SyncAPIEventTypes>