#!/usr/bin/env node

import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const serverUrl = new URL('http://127.0.0.1:9876/')
const cypressArgs = process.argv.slice(2)

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function probeServer(url) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'GET' }, response => {
      response.resume()

      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
        resolve()
        return
      }

      reject(new Error(`Unexpected status ${response.statusCode} from ${url.href}`))
    })

    request.on('error', reject)
    request.setTimeout(2000, () => {
      request.destroy(new Error(`Timed out requesting ${url.href}`))
    })
    request.end()
  })
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      await probeServer(url)
      return
    } catch (error) {
      if (serverExited) {
        const suffix = serverExitInfo
          ? ` (exit code ${serverExitInfo.code ?? 'unknown'}, signal ${serverExitInfo.signal ?? 'none'})`
          : ''
        throw new Error(`Dev server exited before it became ready${suffix}`)
      }

      await wait(250)
    }
  }

  throw new Error(`Timed out waiting for ${url.href}`)
}

function exitCodeFromSignal(signal) {
  if (!signal) {
    return 1
  }

  const signalNumbers = {
    SIGINT: 2,
    SIGTERM: 15,
    SIGKILL: 9,
  }

  return 128 + (signalNumbers[signal] ?? 0)
}

function terminateChild(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return
  }

  child.kill(signal)
}

let serverExited = false
let serverExitInfo = null
let cypressProcess = null
let shuttingDown = false

const server = spawn(process.execPath, [resolve(projectRoot, 'dev-server.mjs')], {
  cwd: projectRoot,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
})

server.stdout.pipe(process.stdout)
server.stderr.pipe(process.stderr)

server.once('exit', (code, signal) => {
  serverExited = true
  serverExitInfo = { code, signal }
})

function handleSignal(signal, exitCode) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  terminateChild(cypressProcess, signal)
  terminateChild(server, signal)
  process.exit(exitCode)
}

process.once('SIGINT', () => {
  handleSignal('SIGINT', 130)
})

process.once('SIGTERM', () => {
  handleSignal('SIGTERM', 143)
})

try {
  await waitForServer(serverUrl)

  cypressProcess = spawn(
    process.execPath,
    [resolve(projectRoot, 'node_modules/cypress/bin/cypress'), 'run', ...cypressArgs],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    }
  )

  const cypressResult = await new Promise(resolve => {
    cypressProcess.once('exit', (code, signal) => {
      resolve({ code, signal })
    })
  })

  terminateChild(server)

  const exitCode = cypressResult.signal ? exitCodeFromSignal(cypressResult.signal) : (cypressResult.code ?? 1)
  process.exit(exitCode)
} catch (error) {
  terminateChild(server)
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
