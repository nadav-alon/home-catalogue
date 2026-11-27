import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildManifest, iconBytes, iconFileOf, isVersionedIconSrc, manifest, versionedIconSrc, workboxOptions, type VersionedIconSrc } from './pwa-manifest'
import { themeColor } from './theme'
import { appIcons } from './ui/appIcons'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fromRepo = (path: string) => resolve(repoRoot, path)
const pngHeaderWidthOffset = 16
const pngHeaderHeightOffset = 20

const purposesOf = (purpose?: string | string[]) => (Array.isArray(purpose) ? purpose : purpose?.split(' ') ?? [])

describe('manifest', () => {
  it('is installable as a standalone app', () => {
    expect(manifest.name).toBe('Home Catalogue')
    expect(manifest.display).toBe('standalone')
  })

  it('takes theme_color from the seed colour', () => {
    expect(themeColor).toBe('#e8590c')
    expect(manifest.theme_color).toBe(themeColor)
  })

  it("takes background_color from the light scheme's background role", () => {
    expect(manifest.background_color).toBe('#fff8f6')
    expect(readFileSync(fromRepo('src/theme.css'), 'utf8')).toContain(
      `--md-sys-color-background: ${manifest.background_color};`,
    )
  })

  it('carries the icon sizes Chrome requires for installability', () => {
    const sizes = manifest.icons
      ?.filter((icon) => purposesOf(icon.purpose).length === 0 || purposesOf(icon.purpose).includes('any'))
      .map((icon) => icon.sizes)

    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('declares a maskable icon at an installable size', () => {
    const maskableSizes = manifest.icons
      ?.filter((icon) => purposesOf(icon.purpose).includes('maskable'))
      .map((icon) => icon.sizes)
    const hasMaskable = maskableSizes?.some((size) => size === '192x192' || size === '512x512')

    expect(hasMaskable).toBe(true)
  })

  it('points every icon at a PNG that exists at its declared size', () => {
    for (const icon of manifest.icons ?? []) {
      const png = readFileSync(fromRepo(`public/${iconFileOf(icon.src as VersionedIconSrc)}`))
      const [width, height] = [png.readUInt32BE(pngHeaderWidthOffset), png.readUInt32BE(pngHeaderHeightOffset)]
      expect(icon.sizes, icon.src).toBe(`${width}x${height}`)
    }
  })

  it('keeps maskable icons on assets separate from the purpose any ones', () => {
    const srcs = (wanted: boolean) =>
      manifest.icons?.filter((icon) => purposesOf(icon.purpose).includes('maskable') === wanted).map((icon) => icon.src) ?? []

    expect(srcs(true)).toContain(versionedIconSrc('pwa-maskable-512x512.png', iconBytes('pwa-maskable-512x512.png')))
    for (const src of srcs(true)) expect(srcs(false)).not.toContain(src)
  })

  it('commits the icon source SVGs the PNGs are generated from', () => {
    for (const { source } of appIcons) expect(existsSync(fromRepo(`src/ui/icons/${source}`)), source).toBe(true)
  })

  it('fills every icon background with the seed colour', () => {
    for (const { source } of appIcons) {
      const svg = readFileSync(fromRepo(`src/ui/icons/${source}`), 'utf8')
      expect(/<rect[^>]*fill="([^"]+)"/.exec(svg)?.[1], source).toBe(themeColor)
    }
  })
})

describe('icon versioning', () => {
  it('gives the same URL for the same bytes and a different one for changed bytes', () => {
    const bytes = new Uint8Array([1, 2, 3])
    expect(versionedIconSrc('a.png', bytes)).toBe(versionedIconSrc('a.png', new Uint8Array([1, 2, 3])))
    expect(versionedIconSrc('a.png', bytes)).not.toBe(versionedIconSrc('a.png', new Uint8Array([1, 2, 4])))
    expect(versionedIconSrc('a.png', bytes)).toMatch(/^a\.png\?v=[0-9a-f]{8}$/)
  })

  it('reads the icon file back out of a versioned URL', () => {
    const src = versionedIconSrc('pwa-192x192.png', new Uint8Array([1]))
    expect(isVersionedIconSrc(src)).toBe(true)
    expect(isVersionedIconSrc('pwa-192x192.png')).toBe(false)
    expect(iconFileOf(src)).toBe('pwa-192x192.png')
  })

  it('versions every manifest icon as <file>?v=<8 hex>', () => {
    for (const icon of manifest.icons ?? []) expect(icon.src).toMatch(/^pwa-.+\.png\?v=[0-9a-f]{8}$/)
  })

  it('changes only the manifest URL of the icon whose bytes changed', () => {
    const read = (changed?: string) => (file: string) =>
      file === changed ? new Uint8Array([...iconBytes(file), 0]) : iconBytes(file)
    const before = Object.fromEntries((buildManifest(read()).icons ?? []).map((icon) => [`${icon.sizes}${icon.purpose}`, icon.src]))
    const changedFile = 'pwa-maskable-512x512.png'
    const after = buildManifest(read(changedFile)).icons ?? []

    for (const icon of after) {
      const was = before[`${icon.sizes}${icon.purpose}`]
      if (iconFileOf(icon.src as VersionedIconSrc) === changedFile) expect(icon.src).not.toBe(was)
      else expect(icon.src).toBe(was)
    }
  })
})

describe('offline precache', () => {
  it('precaches the icon files and matches them when requested with ?v=', () => {
    expect(workboxOptions.globPatterns?.some((glob) => glob.includes('png'))).toBe(true)
    expect(workboxOptions.ignoreURLParametersMatching?.some((pattern) => pattern.test('v'))).toBe(true)
  })
})

describe('browser tab icon', () => {
  const serverTimeout = 60_000
  let server: ViteDevServer

  beforeAll(async () => {
    server = await createServer({ configLoader: 'runner', configFile: fromRepo('vite.config.ts'), server: { middlewareMode: true }, appType: 'custom' })
  }, serverTimeout)
  afterAll(() => server.close())

  it('links the 192px app icon from public/ under the base', async () => {
    const html = await server.transformIndexHtml('/index.html', readFileSync(fromRepo('index.html'), 'utf8'))
    const href = new DOMParser().parseFromString(html, 'text/html').querySelector('link[rel="icon"]')?.getAttribute('href')
    const file = appIcons.find((icon) => icon.purpose === 'any')!.output(192)

    expect(href).toBe(`${server.config.base}${versionedIconSrc(file, iconBytes(file))}`)
    expect(existsSync(fromRepo(`public/${file}`))).toBe(true)
  })

  it('fails loudly when the favicon is not one of the app icons', async () => {
    await expect(server.transformIndexHtml('/index.html', '<head><link href="/other.png" rel="icon" /></head>')).rejects.toThrow(/version-favicon/)
  })
})
