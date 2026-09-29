import type { ComponentChildren } from 'preact'
import './CentredCard.css'

export interface CentredCardProps {
  /** The screen's heading, rendered as the card's `<h1>`. */
  title: string
  children: ComponentChildren
}

/**
 * The page for a screen shown before the household is reachable: the app name, then one card in a
 * single centred column at every width. There is deliberately no navigation.
 */
export function CentredCard({ title, children }: CentredCardProps) {
  return (
    <main class="ui-centred-card">
      <p class="ui-centred-card__name">Home Catalogue</p>
      <div class="ui-centred-card__surface">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  )
}
