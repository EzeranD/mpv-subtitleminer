import { computed, ref, watch, type Ref } from 'vue'
import type { JsonValue } from '../types/json'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface UseWebSocketOptions {
  host: Ref<string>
  ports: Ref<number[]>
  retryDelay?: number
  onMessage?: (data: JsonValue, port: number) => void
  onStatusChange?: (status: ConnectionStatus, port: number | null, message: string) => void
}

export interface UseWebSocketReturn {
  status: Readonly<Ref<ConnectionStatus>>
  connectedPorts: Readonly<Ref<number[]>>
  connect: () => void
  disconnect: () => void
  send: (data: JsonValue, port?: number) => boolean
}

type CycleMode = 'until-connected' | 'once'

type ActiveAttempt = {
  port: number
  socket: WebSocket
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const status = ref<ConnectionStatus>('disconnected')
  const connectedPorts = ref<number[]>([])

  const sockets = new Map<number, WebSocket>()
  let cycleMode: CycleMode | null = null
  let cyclePorts: number[] = []
  let cycleIndex = 0
  let cycleTimer: number | null = null
  let connectionTimer: number | null = null
  let activeAttempt: ActiveAttempt | null = null
  let isEnabled = false

  watch([options.host, options.ports], () => {
    if (!isEnabled) return
    resetConnections()
    startCycle('until-connected')
  })

  function notify(newStatus: ConnectionStatus, port: number | null, message: string): void {
    console.log('[WS]', newStatus, port, message)
    options.onStatusChange?.(newStatus, port, message)
  }

  function updateAggregateStatus(): void {
    if (sockets.size > 0) {
      status.value = 'connected'
      return
    }
    if (cycleMode) {
      status.value = 'connecting'
      return
    }
    status.value = 'disconnected'
  }

  function syncConnectedPorts(): void {
    const ports = Array.from(sockets.keys())
    ports.sort((a, b) => a - b)
    connectedPorts.value = ports
  }

  function clearTimer(timer: number | null): void {
    if (timer === null) return
    window.clearTimeout(timer)
  }

  function closeSocket(socket: WebSocket): void {
    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    socket.close()
  }

  function resetConnections(): void {
    stopCycle()
    clearTimer(connectionTimer)
    connectionTimer = null
    if (activeAttempt) {
      closeSocket(activeAttempt.socket)
      activeAttempt = null
    }
    for (const socket of sockets.values()) {
      closeSocket(socket)
    }
    sockets.clear()
    syncConnectedPorts()
    updateAggregateStatus()
  }

  function stopCycle(): void {
    clearTimer(cycleTimer)
    cycleTimer = null
    cycleMode = null
    cyclePorts = []
    cycleIndex = 0
    updateAggregateStatus()
  }

  function buildCyclePorts(): number[] {
    const seen = new Set<number>()
    const allPorts = options.ports.value.filter((port) => {
      if (seen.has(port)) return false
      seen.add(port)
      return true
    })
    const connected = new Set(sockets.keys())
    return allPorts.filter((port) => !connected.has(port))
  }

  function attemptDelay(): number {
    return options.retryDelay ?? 1000
  }

  function startCycle(mode: CycleMode): void {
    if (!isEnabled || cycleMode) return

    cycleMode = mode
    cyclePorts = buildCyclePorts()
    cycleIndex = 0
    updateAggregateStatus()

    if (cyclePorts.length === 0) {
      stopCycle()
      return
    }

    attemptNext()
  }

  function scheduleNextAttempt(delayMs?: number): void {
    clearTimer(cycleTimer)
    cycleTimer = window.setTimeout(attemptNext, delayMs ?? attemptDelay())
  }

  function attemptNext(): void {
    if (!isEnabled || !cycleMode || activeAttempt) return

    if (cyclePorts.length === 0) {
      stopCycle()
      return
    }

    if (cycleIndex >= cyclePorts.length) {
      if (cycleMode === 'once') {
        stopCycle()
        return
      }
      cycleIndex = 0
    }

    const port = cyclePorts[cycleIndex]
    cycleIndex += 1
    if (port === undefined) {
      stopCycle()
      return
    }

    if (sockets.has(port)) {
      scheduleNextAttempt(0)
      return
    }

    connectToPort(port)
  }

  function connectToPort(port: number): void {
    const host = options.host.value
    const attemptStartedAt = Date.now()
    notify('connecting', port, `Connecting to port ${port}...`)

    let socket: WebSocket
    try {
      socket = new WebSocket(`ws://${host}:${port}`)
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err)
      scheduleNextAttempt(attemptDelay())
      return
    }

    activeAttempt = { port, socket }

    let opened = false
    clearTimer(connectionTimer)
    connectionTimer = window.setTimeout(() => {
      if (!opened) socket.close()
    }, attemptDelay())

    socket.onopen = () => {
      opened = true
      clearTimer(connectionTimer)
      connectionTimer = null

      if (!isEnabled) {
        closeSocket(socket)
        return
      }

      sockets.set(port, socket)
      activeAttempt = null
      syncConnectedPorts()
      notify('connected', port, `Connected to port ${port}`)
      updateAggregateStatus()

      if (cycleMode === 'until-connected') {
        stopCycle()
        return
      }

      attemptNext()
    }

    socket.onmessage = (event) => {
      const rawText = String(event.data)
      try {
        const data = JSON.parse(rawText) as JsonValue
        options.onMessage?.(data, port)
      } catch {
        options.onMessage?.({ type: 'raw', data: rawText } as JsonValue, port)
      }
    }

    socket.onerror = (event) => {
      console.log('[WS] onerror fired:', event)
    }

    socket.onclose = () => {
      clearTimer(connectionTimer)
      connectionTimer = null

      const wasConnected = sockets.get(port) === socket
      if (wasConnected) {
        sockets.delete(port)
        syncConnectedPorts()
      }

      if (activeAttempt?.socket === socket) {
        activeAttempt = null
      }

      if (!isEnabled) return

      if (wasConnected) {
        notify('disconnected', port, `Lost connection to port ${port}`)
        updateAggregateStatus()

        if (sockets.size === 0) {
          stopCycle()
          startCycle('until-connected')
        }
        return
      }

      if (cycleMode) {
        const elapsed = Date.now() - attemptStartedAt
        const remaining = Math.max(0, attemptDelay() - elapsed)
        scheduleNextAttempt(remaining)
      } else {
        updateAggregateStatus()
      }
    }
  }

  function connect(): void {
    if (!isEnabled) {
      isEnabled = true
    }

    if (sockets.size > 0) {
      startCycle('once')
      return
    }

    startCycle('until-connected')
  }

  function disconnect(): void {
    isEnabled = false
    resetConnections()
    notify('disconnected', null, 'Disconnected')
  }

  function send(data: JsonValue, port?: number): boolean {
    if (port !== undefined) {
      const socket = sockets.get(port)
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data))
        return true
      }
      return false
    }

    const fallbackPort = connectedPorts.value[0]
    if (fallbackPort === undefined) return false
    return send(data, fallbackPort)
  }

  return {
    status: computed(() => status.value),
    connectedPorts: computed(() => connectedPorts.value),
    connect,
    disconnect,
    send,
  }
}
