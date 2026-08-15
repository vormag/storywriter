import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getActiveRoot } from './projectService.js'

const execFileAsync = promisify(execFile)

export async function runGit(payload = {}) {
  const root = getActiveRoot()
  const operation = payload.operation
  let args
  if (operation === 'pull') args = ['pull', '--ff-only']
  else if (operation === 'push') args = ['push']
  else if (operation === 'commit') {
    const message = String(payload.message || '').trim()
    if (!message) throw new Error('A commit message is required.')
    args = ['commit', '-m', message, '--', '.']
  } else {
    throw new Error('Unsupported Git operation.')
  }

  try {
    if (operation === 'commit') {
      await execFileAsync('git', ['add', '--all', '--', '.'], { cwd: root, windowsHide: true })
    }
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: root,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    })
    return String(stdout || stderr || `${operation} completed.`).trim()
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || '').trim()
    throw new Error(detail || `Git ${operation} failed.`, { cause: error })
  }
}
