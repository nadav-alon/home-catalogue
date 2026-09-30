declare const millisecondsBrand: unique symbol

/** A duration in whole milliseconds, the unit `setTimeout` takes. */
export type Milliseconds = number & { readonly [millisecondsBrand]: true }

export function isMilliseconds(value: number): value is Milliseconds {
  return Number.isInteger(value) && value >= 0
}

/** Narrows, or throws naming the offending value. */
export function milliseconds(value: number): Milliseconds {
  if (!isMilliseconds(value)) throw new Error(`Not a Milliseconds: ${JSON.stringify(value)}`)
  return value
}
