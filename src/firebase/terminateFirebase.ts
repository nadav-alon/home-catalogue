import { deleteApp } from 'firebase/app'
import { terminate } from 'firebase/firestore'
import type { FirebaseClient } from 'data-platform/client'

/** Tears down a client from `initFirebase`, so the `[DEFAULT]` app can be re-initialised from a different config. */
export async function terminateFirebase(client: FirebaseClient): Promise<void> {
  await terminate(client.db)
  await deleteApp(client.app)
}
