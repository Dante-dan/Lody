import { readFileSync } from 'node:fs'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512]

// Fail before electron-builder can silently fall back to the macOS icon.
export function assertLinuxIconAssets(directory) {
  for (const size of ICON_SIZES) {
    const file = new URL(`${size}x${size}.png`, directory)
    const data = readFileSync(file)
    if (
      data.length < 24 ||
      !data.subarray(0, 8).equals(PNG_SIGNATURE) ||
      data.toString('ascii', 12, 16) !== 'IHDR' ||
      data.readUInt32BE(16) !== size ||
      data.readUInt32BE(20) !== size
    ) {
      throw new Error(`Invalid Linux icon asset: ${file.pathname}; expected ${size}x${size} PNG`)
    }
  }
}
