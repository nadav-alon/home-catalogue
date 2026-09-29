import type { ComponentChildren } from 'preact'
import './ListRow.css'

export interface ListRowProps {
  headline: string
  supporting?: string
  /** Content pinned to the row's end, such as a control or a status. */
  trailing?: ComponentChildren
}

/** A native `<li>`; render inside a `<ul>` or `<ol>`. */
export function ListRow({ headline, supporting, trailing }: ListRowProps) {
  return (
    <li class="ui-list-row">
      <div class="ui-list-row__text">
        <span class="ui-list-row__headline">{headline}</span>
        {supporting ? <span class="ui-list-row__supporting">{supporting}</span> : null}
      </div>
      {trailing ? <div class="ui-list-row__trailing">{trailing}</div> : null}
    </li>
  )
}
