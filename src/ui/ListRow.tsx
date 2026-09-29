import type { ComponentChildren } from 'preact'
import './ListRow.css'

export interface ListRowProps {
  headline: string
  supporting?: string
  /** Content pinned to the row's end, such as a status. */
  trailing?: ComponentChildren
  /** A form control pinned to the row's end; the whole row is its label, so tapping anywhere on it operates the control. */
  control?: ComponentChildren
  /** De-emphasises the row visually. */
  muted?: boolean
}

/** A native `<li>`; render inside a `<ul>` or `<ol>`. */
export function ListRow({ headline, supporting, trailing, control, muted = false }: ListRowProps) {
  const content = (
    <>
      <div class="ui-list-row__text">
        <span class="ui-list-row__headline">{headline}</span>
        {supporting ? <span class="ui-list-row__supporting">{supporting}</span> : null}
      </div>
      {trailing ? <div class="ui-list-row__trailing">{trailing}</div> : null}
      {control ? <div class="ui-list-row__trailing">{control}</div> : null}
    </>
  )
  const classes = ['ui-list-row', muted && 'ui-list-row--muted', control && 'ui-list-row--labelled']
  return (
    <li class={classes.filter(Boolean).join(' ')}>
      {control ? <label class="ui-list-row__label">{content}</label> : content}
    </li>
  )
}
