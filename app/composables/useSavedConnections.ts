import { ref, computed } from 'vue'
import type { SavedConnection, SavedConnectionsStorage, ConnectionSource } from '~/types/connection'

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = 'nebula_saved_connections'
const OLD_STORAGE_KEY = 'nebula_connection' // For migration

// =============================================================================
// STATE (module-level for singleton pattern)
// =============================================================================

const connections = ref<SavedConnection[]>([])
const lastConnectionId = ref<string | null>(null)
const lastConnectionSource = ref<ConnectionSource | null>(null)
const initialized = ref(false)

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Generates a UUID v4 for uniquely identifying saved connections.
 * @return { string } A random UUID
 */
function generateId(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Reads saved connections from localStorage.
 * @return { SavedConnectionsStorage | null } Parsed storage or null if unavailable
 */
function loadFromStorage(): SavedConnectionsStorage | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    return JSON.parse(stored) as SavedConnectionsStorage
  } catch {
    return null
  }
}

/**
 * Persists current connections state to localStorage.
 */
function saveToStorage(): void {
  if (typeof window === 'undefined') return

  const data: SavedConnectionsStorage = {
    connections: connections.value,
    lastConnectionId: lastConnectionId.value,
    lastConnectionSource: lastConnectionSource.value,
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error('Failed to save connections to localStorage:', error)
  }
}

/**
 * Migrates data from legacy single-connection format to multi-connection storage.
 * @return { boolean } True if migration was performed
 */
function migrateOldStorage(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const oldData = localStorage.getItem(OLD_STORAGE_KEY)
    if (!oldData) return false

    const old = JSON.parse(oldData) as {
      endpoint: string
      accessKey: string
      secretKey: string
      region: string
      pathStyle: boolean
      lastConnected: string | null
    }

    // Create a name from the endpoint
    let name = 'Migrated Connection'
    try {
      const url = new URL(old.endpoint)
      name = url.host
    } catch {
      // Use default name
    }

    const migrated: SavedConnection = {
      id: generateId(),
      name,
      endpoint: old.endpoint,
      accessKey: old.accessKey,
      secretKey: old.secretKey,
      region: old.region,
      pathStyle: old.pathStyle,
      createdAt: old.lastConnected || new Date().toISOString(),
      lastConnectedAt: old.lastConnected,
    }

    // Add to connections
    connections.value = [migrated]
    lastConnectionId.value = migrated.id
    lastConnectionSource.value = 'local'

    // Save new format and remove old
    saveToStorage()
    localStorage.removeItem(OLD_STORAGE_KEY)

    return true
  } catch (error) {
    console.error('Failed to migrate old connection storage:', error)
    return false
  }
}

// =============================================================================
// COMPOSABLE
// =============================================================================

/**
 * Composable for managing user-saved S3 connections in localStorage.
 * Supports multiple saved connections with automatic migration from legacy format.
 */
export function useSavedConnections() {
  /**
   * Loads saved connections from localStorage. Called automatically on first use.
   * Migrates from legacy single-connection format if needed.
   */
  function initialize(): void {
    if (initialized.value) return
    if (typeof window === 'undefined') return

    // Try to load existing storage
    const stored = loadFromStorage()

    if (stored) {
      connections.value = stored.connections || []
      lastConnectionId.value = stored.lastConnectionId
      lastConnectionSource.value = stored.lastConnectionSource
    } else {
      // Try to migrate from old format
      migrateOldStorage()
    }

    initialized.value = true
  }

  /**
   * Returns all saved connections from localStorage.
   * @return { SavedConnection[] } Array of saved connection configurations
   */
  function loadAll(): SavedConnection[] {
    if (!initialized.value) initialize()
    return connections.value
  }

  /**
   * Saves a new connection with auto-generated ID and timestamp.
   * @param { Omit<SavedConnection, 'id' | 'createdAt'> } connection - Connection details to save
   * @return { SavedConnection } The saved connection with generated ID
   */
  function save(connection: Omit<SavedConnection, 'id' | 'createdAt'>): SavedConnection {
    if (!initialized.value) initialize()

    const newConnection: SavedConnection = {
      ...connection,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }

    connections.value = [...connections.value, newConnection]
    saveToStorage()

    return newConnection
  }

  /**
   * Updates an existing saved connection with new values.
   * @param { string } id - Connection ID to update
   * @param { Partial<Omit<SavedConnection, 'id' | 'createdAt'>> } updates - Fields to update
   * @return { SavedConnection | null } Updated connection or null if not found
   */
  function update(id: string, updates: Partial<Omit<SavedConnection, 'id' | 'createdAt'>>): SavedConnection | null {
    if (!initialized.value) initialize()

    const index = connections.value.findIndex((c) => c.id === id)
    if (index === -1) return null

    const existing = connections.value[index]!
    const updated: SavedConnection = {
      // Start with all required fields from existing
      id: existing.id,
      name: existing.name,
      endpoint: existing.endpoint,
      accessKey: existing.accessKey,
      secretKey: existing.secretKey,
      region: existing.region,
      pathStyle: existing.pathStyle,
      createdAt: existing.createdAt,
      lastConnectedAt: existing.lastConnectedAt,
      // Optional fields
      useProxy: existing.useProxy,
      backendType: existing.backendType,
      // Apply updates (will override any matching fields)
      ...updates,
    }
    connections.value = [
      ...connections.value.slice(0, index),
      updated,
      ...connections.value.slice(index + 1),
    ]
    saveToStorage()

    return updated
  }

  /**
   * Updates lastConnectedAt timestamp to current time.
   * @param { string } id - Connection ID to update
   */
  function updateLastConnected(id: string): void {
    update(id, { lastConnectedAt: new Date().toISOString() })
  }

  /**
   * Deletes a saved connection from storage.
   * @param { string } id - Connection ID to remove
   * @return { boolean } True if connection was found and removed
   */
  function remove(id: string): boolean {
    if (!initialized.value) initialize()

    const index = connections.value.findIndex((c) => c.id === id)
    if (index === -1) return false

    connections.value = [
      ...connections.value.slice(0, index),
      ...connections.value.slice(index + 1),
    ]

    // Clear last connection if it was this one
    if (lastConnectionId.value === id && lastConnectionSource.value === 'local') {
      lastConnectionId.value = null
      lastConnectionSource.value = null
    }

    saveToStorage()
    return true
  }

  /**
   * Finds a saved connection by its ID.
   * @param { string } id - Connection ID to look up
   * @return { SavedConnection | undefined } Matching connection or undefined
   */
  function getById(id: string): SavedConnection | undefined {
    if (!initialized.value) initialize()
    return connections.value.find((c) => c.id === id)
  }

  /**
   * Returns the most recently used connection's ID and source type.
   * @return { { id: string; source: ConnectionSource } | null } Last connection info or null
   */
  function getLastConnection(): { id: string; source: ConnectionSource } | null {
    if (!initialized.value) initialize()

    if (lastConnectionId.value && lastConnectionSource.value) {
      return {
        id: lastConnectionId.value,
        source: lastConnectionSource.value,
      }
    }
    return null
  }

  /**
   * Records which connection was most recently used for auto-reconnect.
   * @param { string } id - Connection or preset ID
   * @param { ConnectionSource } source - Source type ('local', 'preset', or 'manual')
   */
  function setLastConnection(id: string, source: ConnectionSource): void {
    if (!initialized.value) initialize()

    lastConnectionId.value = id
    lastConnectionSource.value = source
    saveToStorage()
  }

  /**
   * Clears the last connection reference (disables auto-reconnect).
   */
  function clearLastConnection(): void {
    lastConnectionId.value = null
    lastConnectionSource.value = null
    saveToStorage()
  }

  /**
   * Removes all saved connections from storage.
   */
  function clearAll(): void {
    connections.value = []
    lastConnectionId.value = null
    lastConnectionSource.value = null
    saveToStorage()
  }

  /** Computed: True if at least one connection is saved locally */
  const hasSavedConnections = computed(() => connections.value.length > 0)

  /** Computed: Connections sorted by lastConnectedAt, most recent first */
  const sortedConnections = computed(() => {
    return [...connections.value].sort((a, b) => {
      const aTime = a.lastConnectedAt ? new Date(a.lastConnectedAt).getTime() : 0
      const bTime = b.lastConnectedAt ? new Date(b.lastConnectedAt).getTime() : 0
      return bTime - aTime
    })
  })

  return {
    // State
    connections,
    lastConnectionId,
    lastConnectionSource,
    initialized,

    // Computed
    hasSavedConnections,
    sortedConnections,

    // Methods
    initialize,
    loadAll,
    save,
    update,
    updateLastConnected,
    remove,
    getById,
    getLastConnection,
    setLastConnection,
    clearLastConnection,
    clearAll,
  }
}
