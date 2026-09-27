import { doc, getDoc, type Firestore } from 'firebase/firestore'
import { core } from 'data-platform'

/** The household's deployed platform version, or `undefined` if nothing has deployed `meta/platform` yet, or what's there doesn't parse. */
export async function readDeployedPlatformVersion(db: Firestore): Promise<core.Semver | undefined> {
  const snapshot = await getDoc(doc(db, core.PLATFORM_DOC_PATH))
  const result = core.platformMetaSchema.safeParse(snapshot.data())
  return result.success ? result.data.version : undefined
}
