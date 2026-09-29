import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import test from 'node:test'
import { LOCAL_LORO_DATA_PLANE_PROTOCOL_VERSION } from '@lody/shared/local-loro-data-plane'
import { LoroDataPlaneRelay } from './loro-data-plane-relay.ts'

function sender(send, isDestroyed = () => false) {
  return Object.assign(new EventEmitter(), { send, isDestroyed })
}

void test('does not probe the local data plane while local agents are disabled', async () => {
  let connectionAttempts = 0
  const relay = new LoroDataPlaneRelay('/unused/local-data-plane.sock', () => {
    connectionAttempts += 1
    const socket = new net.Socket()
    queueMicrotask(() => socket.emit('error', new Error('test socket unavailable')))
    return socket
  })
  const ping = {
    type: 'ping',
    protocolVersion: LOCAL_LORO_DATA_PLANE_PROTOCOL_VERSION
  }

  relay.setEnabled(false)
  relay.send(ping)
  assert.equal(connectionAttempts, 0)

  relay.setEnabled(true)
  relay.send(ping)
  assert.equal(connectionAttempts, 1)

  relay.destroy()
  await Promise.resolve()
})

void test('a renderer disposed after the alive check is released without interrupting another renderer', () => {
  const relay = new LoroDataPlaneRelay('/unused/local-data-plane.sock')
  relay.setEnabled(false)
  let checks = 0
  let attempted = 0
  const disposed = sender(
    () => {
      attempted += 1
      throw new Error('Object has been destroyed')
    },
    () => {
      checks += 1
      return checks > 2
    }
  )
  assert.doesNotThrow(() => relay.attachSender(disposed))
  assert.equal(relay.senders.has(disposed), false)
  const received = []
  relay.attachSender(sender((channel, payload) => received.push([channel, payload])))
  relay.setConnected(true)
  assert.equal(attempted, 1)
  assert.deepEqual(received, [
    ['loro.status', false],
    ['loro.status', true]
  ])
  relay.destroy()
})

void test('unrelated renderer send failures remain visible', () => {
  const relay = new LoroDataPlaneRelay('/unused/local-data-plane.sock')
  relay.setEnabled(false)
  assert.throws(
    () => relay.attachSender(sender(() => { throw new Error('Failed to serialize arguments') })),
    /Failed to serialize arguments/
  )
  relay.destroy()
})
