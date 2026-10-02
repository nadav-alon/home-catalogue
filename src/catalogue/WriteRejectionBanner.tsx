import { useEffect, useState } from 'preact/hooks'
import './WriteRejectionBanner.css'
import { dismissWriteRejection, watchWriteRejections, type WriteRejection } from './writeRejections.ts'

/** One dismissible notice per queued catalogue write the server rejected on sync. */
export function WriteRejectionBanner() {
  const [rejections, setRejections] = useState<WriteRejection[]>([])

  useEffect(() => watchWriteRejections(setRejections), [])

  return (
    <>
      {rejections.map(({ id, message }) => (
        <div key={id} role="alert" class="write-rejection-banner">
          <p>{message}</p>
          <button type="button" onClick={() => dismissWriteRejection(id)}>
            Dismiss
          </button>
        </div>
      ))}
    </>
  )
}
