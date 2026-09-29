import { useEffect, useState } from 'preact/hooks'
import { dismissWriteRejection, watchWriteRejections, type WriteRejection } from './writeRejections.ts'

/** One dismissible alert per queued catalogue write the server rejected on sync. */
export function WriteRejectionBanner() {
  const [rejections, setRejections] = useState<WriteRejection[]>([])

  useEffect(() => watchWriteRejections(setRejections), [])

  return (
    <>
      {rejections.map(({ id, message }) => (
        <div key={id} role="alert" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
          <p>{message}</p>
          <button type="button" onClick={() => dismissWriteRejection(id)}>
            Dismiss
          </button>
        </div>
      ))}
    </>
  )
}
