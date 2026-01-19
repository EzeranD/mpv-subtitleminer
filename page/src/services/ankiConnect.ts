/**
 * AnkiConnect API Service
 * Handles all communication with AnkiConnect on port 8765
 */

import type { JsonObject, JsonValue } from '../types/json'

const ANKI_CONNECT_URL = 'http://127.0.0.1:8765'
const API_VERSION = 6

interface AnkiRequest {
  action: string
  version: number
  params?: JsonValue
}

interface AnkiResponse<T = JsonValue> {
  result: T
  error: string | null
}

interface AnkiActionRequest extends JsonObject {
  action: string
  version: number
  params: Record<string, JsonValue>
}

interface AnkiActionResponse<T = JsonValue> {
  result: T
  error: string | null
}

interface NoteInfo {
  noteId: number
  modelName: string
  tags: string[]
  fields: Record<string, { value: string; order: number }>
}

class AnkiConnectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnkiConnectError'
  }
}

async function invoke<T>(action: string, params?: JsonValue): Promise<T> {
  const request: AnkiRequest = { action, version: API_VERSION }
  if (params) {
    request.params = params
  }

  let response: Response
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new AnkiConnectError(`[${action}] Network error: ${message}`)
  }

  if (!response.ok) {
    throw new AnkiConnectError(`[${action}] HTTP ${response.status}: ${response.statusText}`)
  }

  let data: AnkiResponse<T>
  try {
    data = (await response.json()) as AnkiResponse<T>
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new AnkiConnectError(`[${action}] Failed to parse response: ${message}`)
  }

  if (data.error) {
    throw new AnkiConnectError(`[${action}] ${data.error}`)
  }

  return data.result
}

async function multiInvoke<T>(actions: AnkiActionRequest[]): Promise<AnkiActionResponse<T>[]> {
  return invoke<AnkiActionResponse<T>[]>('multi', { actions })
}

/**
 * Test connection and get AnkiConnect version
 */
export async function getVersion(): Promise<number> {
  return invoke<number>('version')
}

/**
 * Get list of all note type (model) names
 */
async function getModelNames(): Promise<string[]> {
  return invoke<string[]>('modelNames')
}

/**
 * Get all models with their fields in a single batch request
 */
export async function getModelsWithFields(): Promise<Record<string, string[]>> {
  const modelNames = await getModelNames()

  const actions: AnkiActionRequest[] = modelNames.map((modelName) => ({
    action: 'modelFieldNames',
    version: API_VERSION,
    params: { modelName },
  }))

  const results = await multiInvoke<string[]>(actions)

  const modelsWithFields: Record<string, string[]> = {}
  modelNames.forEach((name, index) => {
    const item = results[index]
    if (!item) {
      modelsWithFields[name] = []
      return
    }
    if (item.error) {
      console.warn(`AnkiConnect multi: modelFieldNames failed for "${name}": ${item.error}`)
      modelsWithFields[name] = []
      return
    }
    modelsWithFields[name] = item.result ?? []
  })

  return modelsWithFields
}

/**
 * Find notes matching a query
 * @param query Anki search query (e.g., "deck:Default added:1")
 */
async function findNotes(query: string): Promise<number[]> {
  return invoke<number[]>('findNotes', { query })
}

/**
 * Get detailed info about notes
 */
async function getNotesInfo(notes: number[]): Promise<NoteInfo[]> {
  return invoke<NoteInfo[]>('notesInfo', { notes })
}

/**
 * Store a media file in Anki's collection
 * @param filename The filename to store as
 * @param data Base64 encoded file data
 */
export async function storeMediaFile(filename: string, data: string): Promise<string> {
  return invoke<string>('storeMediaFile', { filename, data })
}

/**
 * Update fields of an existing note
 */
export async function updateNoteFields(
  noteId: number,
  fields: Record<string, string>,
): Promise<null> {
  return invoke<null>('updateNoteFields', {
    note: { id: noteId, fields },
  })
}

/**
 * Get the most recently added notes
 * @param count Number of recent notes to fetch
 * @param modelName Optional filter by note type
 */
async function getRecentNotes(count: number = 10, modelName?: string): Promise<NoteInfo[]> {
  let query = 'added:1'
  if (modelName) {
    query = `"note:${modelName}" added:1`
  }

  const noteIds = await findNotes(query)
  if (noteIds.length === 0) {
    // Try last 7 days
    query = modelName ? `"note:${modelName}" added:7` : 'added:7'
    const weekNoteIds = await findNotes(query)
    if (weekNoteIds.length === 0) return []
    const recentIds = [...weekNoteIds].sort((a, b) => a - b).slice(-count)
    return getNotesInfo(recentIds)
  }

  const recentIds = [...noteIds].sort((a, b) => a - b).slice(-count)
  return getNotesInfo(recentIds)
}

/**
 * Find the last added note of a specific type
 */
export async function getLastNote(modelName?: string): Promise<NoteInfo | null> {
  const notes = await getRecentNotes(1, modelName)
  return notes[0] ?? null
}

/**
 * GUI operations
 */
export async function guiBrowse(query: string): Promise<number[]> {
  return invoke<number[]>('guiBrowse', { query })
}
