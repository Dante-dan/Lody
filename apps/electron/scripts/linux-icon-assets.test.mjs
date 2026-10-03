import assert from 'node:assert/strict'
import { mkdtempSync, cpSync, rmSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { assertLinuxIconAssets } from './linux-icon-assets.mjs'

const assets = new URL('../build/icons/', import.meta.url)

test('accepts the shipped Linux PNG size set', () => {
  assert.doesNotThrow(() => assertLinuxIconAssets(assets))
})

test('rejects missing and incorrectly sized assets before packaging', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lody-linux-icons-'))
  try {
    cpSync(assets, directory, { recursive: true })
    const url = pathToFileURL(`${directory}/`)
    const file = join(directory, '16x16.png')
    unlinkSync(file)
    assert.throws(() => assertLinuxIconAssets(url), { code: 'ENOENT' })
    writeFileSync(file, readFileSync(new URL('32x32.png', assets)))
    assert.throws(() => assertLinuxIconAssets(url), /expected 16x16 PNG/)
    writeFileSync(file, 'not a PNG')
    assert.throws(() => assertLinuxIconAssets(url), /expected 16x16 PNG/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
