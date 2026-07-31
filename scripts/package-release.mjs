#!/usr/bin/env node
// Builds the "no Docker" release artifact: dist/amule-nuxt-<version>.zip.
//
// The zip holds the Nitro build (.output), which already bundles every runtime
// dependency, plus the launch helpers and instructions someone needs to get it
// running on a plain Node host.
//
// Usage: node scripts/package-release.mjs [--version=1.2.3] [--out=dist]
// Without --version the version comes from package.json, which is what
// semantic-release has already rewritten by the time it calls this script.

import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// archiver 8 is ESM only and exports the formats as classes, with no default
import { ZipArchive } from 'archiver'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function flag(name) {
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}

async function exists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const version = flag('version') || pkg.version
const outDir = path.resolve(root, flag('out') || 'dist')
const output = path.join(outDir, `amule-nuxt-${version}.zip`)
// Everything lands under this directory inside the zip, so unzipping never
// scatters files into the current working directory.
const prefix = `amule-nuxt-${version}`

const nitro = path.join(root, '.output')
if (!(await exists(nitro))) {
  console.error('No .output directory found. Run `npm run build` first.')
  process.exit(1)
}

const deployDoc = (await readFile(path.join(root, 'scripts/release-assets/DEPLOY.md'), 'utf8'))
  .replaceAll('__VERSION__', version)

await mkdir(outDir, { recursive: true })
await rm(output, { force: true })

const archive = new ZipArchive({ zlib: { level: 9 } })
const stream = createWriteStream(output)
const done = new Promise((resolve, reject) => {
  stream.on('close', resolve)
  archive.on('warning', reject)
  archive.on('error', reject)
})

archive.pipe(stream)

archive.directory(nitro, `${prefix}/.output`)
archive.file(path.join(root, 'package.json'), { name: `${prefix}/package.json` })
archive.file(path.join(root, 'README.md'), { name: `${prefix}/README.md` })
archive.file(path.join(root, '.env.example'), { name: `${prefix}/.env.example` })
archive.file(path.join(root, 'scripts/release-assets/amule-nuxt.service'), {
  name: `${prefix}/amule-nuxt.service`
})
// Marked executable so `./start.sh` works straight out of the zip on Linux
archive.file(path.join(root, 'scripts/release-assets/start.sh'), {
  name: `${prefix}/start.sh`,
  mode: 0o755
})
archive.file(path.join(root, 'scripts/release-assets/start.ps1'), {
  name: `${prefix}/start.ps1`
})
archive.append(deployDoc, { name: `${prefix}/DEPLOY.md` })

if (await exists(path.join(root, 'CHANGELOG.md'))) {
  archive.file(path.join(root, 'CHANGELOG.md'), { name: `${prefix}/CHANGELOG.md` })
}

await archive.finalize()
await done

const { size } = await stat(output)
console.log(`Wrote ${path.relative(root, output)} (${(size / 1024 / 1024).toFixed(1)} MB)`)
