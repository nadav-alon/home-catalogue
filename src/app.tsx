import type { Firestore } from 'firebase/firestore'
import { CategoriesManager } from './catalogue/CategoriesManager.tsx'
import { ShopsManager } from './catalogue/ShopsManager.tsx'

export interface AppProps {
  db: Firestore
}

export function App({ db }: AppProps) {
  return (
    <main>
      <h1>Home Catalogue</h1>
      <ShopsManager db={db} />
      <CategoriesManager db={db} />
    </main>
  )
}
