import { createContext, type ComponentChildren } from 'preact'
import { createPortal } from 'preact/compat'
import { useContext, useState } from 'preact/hooks'
import './TopAppBar.css'

const ActionsSlot = createContext<HTMLElement | null>(null)
const NavigationSlot = createContext<HTMLElement | null>(null)

export interface TopAppBarProps {
  title: string
  /** The screen; anything in it can put controls in the bar with `TopAppBarActions` and `TopAppBarNavigation`. */
  children?: ComponentChildren
}

/** The screen's title between a leading navigation slot and a trailing slot for the current screen's actions, and the screen below it. */
export function TopAppBar({ title, children }: TopAppBarProps) {
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)
  const [navigationSlot, setNavigationSlot] = useState<HTMLElement | null>(null)
  return (
    <ActionsSlot.Provider value={actionsSlot}>
      <NavigationSlot.Provider value={navigationSlot}>
        <header class="shell-top-bar">
          <div class="shell-top-bar__navigation" ref={setNavigationSlot} />
          <h1 class="shell-top-bar__title">{title}</h1>
          <div class="shell-top-bar__actions" ref={setActionsSlot} />
        </header>
        {children}
      </NavigationSlot.Provider>
    </ActionsSlot.Provider>
  )
}

/** Renders its children in the top app bar's actions slot, for as long as the calling screen is shown. */
export function TopAppBarActions({ children }: { children: ComponentChildren }) {
  const slot = useContext(ActionsSlot)
  return slot === null ? null : createPortal(children, slot)
}

/** Renders its children in the top app bar's leading slot, before the title, for as long as the calling screen is shown. */
export function TopAppBarNavigation({ children }: { children: ComponentChildren }) {
  const slot = useContext(NavigationSlot)
  return slot === null ? null : createPortal(children, slot)
}
