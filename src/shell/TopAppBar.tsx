import { createContext, type ComponentChildren } from 'preact'
import { createPortal } from 'preact/compat'
import { useContext, useState } from 'preact/hooks'
import './TopAppBar.css'

const ActionsSlot = createContext<HTMLElement | null>(null)

export interface TopAppBarProps {
  title: string
  /** The screen; anything in it can put actions in the bar with `TopAppBarActions`. */
  children?: ComponentChildren
}

/** The page's title with a slot for the current screen's actions, and the screen below it. */
export function TopAppBar({ title, children }: TopAppBarProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <ActionsSlot.Provider value={slot}>
      <header class="shell-top-bar">
        <h1 class="shell-top-bar__title">{title}</h1>
        <div class="shell-top-bar__actions" ref={setSlot} />
      </header>
      {children}
    </ActionsSlot.Provider>
  )
}

/** Renders its children in the top app bar's actions slot, for as long as the calling screen is shown. */
export function TopAppBarActions({ children }: { children: ComponentChildren }) {
  const slot = useContext(ActionsSlot)
  return slot === null ? null : createPortal(children, slot)
}
