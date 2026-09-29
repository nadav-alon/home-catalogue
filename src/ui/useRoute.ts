import { useEffect, useState } from 'preact/hooks'
import { routeOf, type Route } from './route.ts'

/** The current route, re-read whenever the URL hash changes. */
export function useRoute(): Route {
  const [current, setCurrent] = useState(() => routeOf(window.location.hash))
  useEffect(() => {
    const onHashChange = () => setCurrent(routeOf(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return current
}
