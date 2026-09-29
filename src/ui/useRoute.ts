import { useEffect, useState } from 'preact/hooks'
import { hashOf, routeOf, type Route } from './route.ts'

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

/** Shows `value` by pushing a history entry, so back returns to the previous route. */
export function navigate(value: Route): void {
  window.location.hash = hashOf(value)
}
