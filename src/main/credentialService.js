import { app, safeStorage } from 'electron'
import path from 'node:path'
import { atomicWrite, readJson } from './storage.js'

const CREDENTIALS_FILE = 'credentials.json'

function credentialsPath() {
  return path.join(app.getPath('userData'), CREDENTIALS_FILE)
}

function environmentKey() {
  return process.env.STORYWRITER_OPENAI_APIKEY?.trim() || ''
}

async function readStoredKey() {
  const credentials = await readJson(credentialsPath(), null)
  if (!credentials?.openAiKey || typeof credentials.openAiKey !== 'string') return ''
  const encrypted = Buffer.from(credentials.openAiKey, 'base64')
  const decrypted = await safeStorage.decryptStringAsync(encrypted)
  const key = String(decrypted.result || '').trim()
  if (key && decrypted.shouldReEncrypt) await storeEncryptedKey(key)
  return key
}

async function storeEncryptedKey(key) {
  const encrypted = await safeStorage.encryptStringAsync(key)
  await atomicWrite(credentialsPath(), `${JSON.stringify({
    schemaVersion: 1,
    openAiKey: encrypted.toString('base64')
  }, null, 2)}\n`)
}

export async function getOpenAiKey() {
  const fromEnvironment = environmentKey()
  if (fromEnvironment) return fromEnvironment
  return readStoredKey()
}

export async function getOpenAiStatus() {
  const fromEnvironment = environmentKey()
  if (fromEnvironment) return { configured: true, source: 'environment' }
  try {
    const stored = await readStoredKey()
    return { configured: Boolean(stored), source: stored ? 'secure-storage' : null }
  } catch {
    return { configured: false, source: null }
  }
}

export async function setOpenAiKey(value) {
  const key = String(value || '').trim()
  if (key.length < 20 || key.length > 1000) throw new Error('Enter a valid OpenAI API key.')
  if (!await safeStorage.isAsyncEncryptionAvailable()) {
    throw new Error('Secure credential storage is not available on this system.')
  }
  await storeEncryptedKey(key)
  return { configured: true, source: 'secure-storage' }
}
