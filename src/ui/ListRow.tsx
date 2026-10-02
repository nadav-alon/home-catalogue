import type { ComponentChildren } from 'preact'
import { useId } from 'preact/hooks'
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
  /** Makes the text a native button that calls this; the trailing slot stays a separate control. */
  onActivate?: () => void
  /** Makes the whole row a native link to this href; `trailing` is then decoration inside the link, and `onFollow` handles the click. */
  href?: string
  onFollow?: () => void
}

/** A native `<li>`; render inside a `<ul>` or `<ol>`. */
export function ListRow({ headline, supporting, trailing, control, muted = false, onActivate, href, onFollow }: ListRowProps) {
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
  if (href !== undefined) {
    return (
      <li class={['ui-list-row', muted && 'ui-list-row--muted'].filter(Boolean).join(' ')}>
        <a
          class="ui-list-row__link"
          href={href}
          onClick={(event) => {
            if (!onFollow) return
            event.preventDefault()
            onFollow()
          }}
        >
          <div class="ui-list-row__text">{text}</div>
          {trailing ? <div class="ui-list-row__trailing">{trailing}</div> : null}
        </a>
      </li>
    )
  }
  const classes = ['ui-list-row', muted && 'ui-list-row--muted', control && 'ui-list-row--labelled']
  return (
    <li class={classes.filter(Boolean).join(' ')}>
      {control ? <label class="ui-list-row__label">{content}</label> : content}
    </li>
  )
}
