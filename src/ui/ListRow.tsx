import type { ComponentChildren } from 'preact'
import { useId } from 'preact/hooks'
import './ListRow.css'

interface ListRowBaseProps {
  headline: string
  supporting?: string
  /** Content pinned to the row's end, such as a status. */
  trailing?: ComponentChildren
  /** Below 600px, drops the trailing slot under the text so a wide control never squeezes the headline. */
  stackTrailing?: boolean
  /** De-emphasises the row visually. */
  muted?: boolean
}

export type ListRowProps = ListRowBaseProps &
  (
    | {
        /** Makes the whole row a native link to this href; `trailing` is then decoration inside the link, and `onFollow` handles the click. */
        href: string
        onFollow: () => void
        control?: never
        onActivate?: never
      }
    | {
        href?: never
        onFollow?: never
        /** A form control pinned to the row's end; the whole row is its label, so tapping anywhere on it operates the control. */
        control?: ComponentChildren
        /** Makes the text a native button that calls this; the trailing slot stays a separate control. */
        onActivate?: () => void
      }
  )

/** A native `<li>`; render inside a `<ul>` or `<ol>`. */
export function ListRow({ headline, supporting, trailing, control, muted = false, stackTrailing = false, onActivate, href, onFollow }: ListRowProps) {
  const id = useId()
  const headlineId = `${id}-headline`
  const supportingId = `${id}-supporting`
  const text = (
    <>
      <span class="ui-list-row__headline" id={headlineId}>
        {headline}
      </span>
      {supporting ? (
        <span class="ui-list-row__supporting" id={supportingId}>
          {supporting}
        </span>
      ) : null}
    </>
  )
  const content = (
    <>
      {onActivate ? (
        <button
          type="button"
          class="ui-list-row__text ui-list-row__activate"
          // The spans are inline, so their text would otherwise run together in the button's name.
          aria-labelledby={supporting ? `${headlineId} ${supportingId}` : undefined}
          onClick={onActivate}
        >
          {text}
        </button>
      ) : (
        <div class="ui-list-row__text">{text}</div>
      )}
      {trailing ? <div class="ui-list-row__trailing">{trailing}</div> : null}
      {control ? <div class="ui-list-row__trailing">{control}</div> : null}
    </>
  )
  const classes = ['ui-list-row', muted && 'ui-list-row--muted', (control || href !== undefined) && 'ui-list-row--labelled', stackTrailing && 'ui-list-row--stack-trailing']
  return (
    <li class={classes.filter(Boolean).join(' ')}>
      {href !== undefined ? (
        <a
          class="ui-list-row__link"
          href={href}
          onClick={(event) => {
            event.preventDefault()
            onFollow()
          }}
        >
          {content}
        </a>
      ) : control ? (
        <label class="ui-list-row__label">{content}</label>
      ) : (
        content
      )}
    </li>
  )
}
