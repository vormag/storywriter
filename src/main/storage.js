import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const writeQueues = new Map()

export async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function replaceFile(temporary, target) {
  let lastError
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rename(temporary, target)
      return
    } catch (error) {
      lastError = error
      const retryable = ['EACCES', 'EEXIST', 'EPERM'].includes(error.code)
      if (!retryable || process.platform !== 'win32') throw error
      await wait(20 * (2 ** attempt))
    }
  }

  if (process.platform === 'win32' && ['EACCES', 'EEXIST', 'EPERM'].includes(lastError?.code)) {
    await fs.copyFile(temporary, target)
    return
  }
  throw lastError
}

async function performAtomicWrite(target, content) {
  await fs.mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, content, 'utf8')
    await replaceFile(temporary, target)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {})
  }
}

export async function atomicWrite(target, content) {
  const key = path.resolve(target).toLocaleLowerCase()
  const previous = writeQueues.get(key) ?? Promise.resolve()
  const operation = previous.catch(() => {}).then(() => performAtomicWrite(target, content))
  writeQueues.set(key, operation)
  try {
    await operation
  } finally {
    if (writeQueues.get(key) === operation) writeQueues.delete(key)
  }
}

export async function readJson(target, fallback) {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8'))
  } catch {
    return fallback
  }
}
