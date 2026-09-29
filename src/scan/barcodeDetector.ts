/** The part of the browser's `BarcodeDetector` that scanning uses; it is not in TypeScript's DOM lib. */
export interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

export interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
}

/** The browser's native `BarcodeDetector`, or `undefined` where it has none (desktop Windows/Linux). */
export function nativeBarcodeDetector(): BarcodeDetectorConstructor | undefined {
  return (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
}
