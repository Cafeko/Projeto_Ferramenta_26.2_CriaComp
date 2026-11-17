/**
 * Persistência local do dispositivo (navegador).
 *
 * Nada aqui é enviado ao servidor. As configurações e textos ficam no
 * `localStorage` (pequenos e síncronos); as imagens ficam no `IndexedDB`
 * (aceita Blobs e não estoura a cota de ~5 MB do localStorage).
 *
 * O escopo é a origem + navegador + perfil: trocar de dispositivo ou de
 * navegador não recupera esses dados. Limpar os dados do site também apaga.
 */

const WORKSPACE_KEY = 'spritetransfer:workspace'
const WORKSPACE_VERSION = 1

const APP_SETTINGS_KEY = 'spritetransfer:settings'
const APP_SETTINGS_VERSION = 1

/** Preferências da interface (não fazem parte dos dados da sessão). */
export const DEFAULT_APP_SETTINGS = {
  saveSession: true,
  mode: 'advanced',
  showMetrics: true,
}

/**
 * Lê as preferências da interface.
 *
 * @returns {typeof DEFAULT_APP_SETTINGS}
 */
export function loadAppSettings() {
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_APP_SETTINGS }
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== APP_SETTINGS_VERSION) {
      return { ...DEFAULT_APP_SETTINGS }
    }
    const data = parsed.data
    if (!data || typeof data !== 'object') return { ...DEFAULT_APP_SETTINGS }
    return {
      saveSession: data.saveSession !== false,
      mode:
        data.mode === 'simple' || data.mode === 'editor'
          ? data.mode
          : 'advanced',
      showMetrics: data.showMetrics !== false,
    }
  } catch {
    return { ...DEFAULT_APP_SETTINGS }
  }
}

/** Salva as preferências da interface (ignora falhas de cota/modo privado). */
export function saveAppSettings(settings) {
  try {
    window.localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: APP_SETTINGS_VERSION,
        data: {
          saveSession: settings.saveSession !== false,
          mode:
            settings.mode === 'simple' || settings.mode === 'editor'
              ? settings.mode
              : 'advanced',
          showMetrics: settings.showMetrics !== false,
        },
      }),
    )
    return true
  } catch {
    return false
  }
}

const DB_NAME = 'spritetransfer-local'
const DB_VERSION = 1
const STORE_NAME = 'images'

/** Chaves usadas para as imagens persistidas. */
export const LOCAL_IMAGE_KEYS = {
  pose: 'pose',
  style: 'style',
  appearance: 'appearance',
  generated: 'generated',
  editorSource: 'editor-source',
  editorResult: 'editor-result',
}

/**
 * Lê as configurações da última sessão.
 *
 * @returns {{
 *   columns: string,
 *   rows: string,
 *   autoSlice: boolean,
 *   fps: number,
 *   viewMode: 'loop' | 'frame-by-frame',
 *   exportColumns: string,
 *   appearance: string,
 *   artStyle: string,
 *   generationColumns: number | null,
 *   generationRows: number | null,
 *   lastGeneration: Record<string, unknown> | null,
 * } | null}
 */
export function loadWorkspaceSettings() {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== WORKSPACE_VERSION) return null
    const data = parsed.data
    if (!data || typeof data !== 'object') return null

    return {
      columns: typeof data.columns === 'string' ? data.columns : '1',
      rows: typeof data.rows === 'string' ? data.rows : '1',
      autoSlice: typeof data.autoSlice === 'boolean' ? data.autoSlice : false,
      fps: Number.isFinite(data.fps)
        ? Math.min(60, Math.max(1, Math.round(data.fps)))
        : 8,
      viewMode: data.viewMode === 'frame-by-frame' ? 'frame-by-frame' : 'loop',
      exportColumns:
        typeof data.exportColumns === 'string' ? data.exportColumns : '4',
      appearance: typeof data.appearance === 'string' ? data.appearance : '',
      artStyle: typeof data.artStyle === 'string' ? data.artStyle : '',
      generationColumns: Number.isFinite(data.generationColumns)
        ? Math.min(64, Math.max(1, Math.round(data.generationColumns)))
        : null,
      generationRows: Number.isFinite(data.generationRows)
        ? Math.min(64, Math.max(1, Math.round(data.generationRows)))
        : null,
      lastGeneration:
        data.lastGeneration && typeof data.lastGeneration === 'object'
          ? data.lastGeneration
          : null,
      editorPrompt:
        typeof data.editorPrompt === 'string' ? data.editorPrompt : '',
    }
  } catch {
    return null
  }
}

/** Salva as configurações da sessão atual (ignora falhas de cota/modo privado). */
export function saveWorkspaceSettings(settings) {
  try {
    window.localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({ version: WORKSPACE_VERSION, data: settings }),
    )
    return true
  } catch {
    // Armazenamento indisponível: segue apenas em memória.
    return false
  }
}

/** Apaga os textos/configurações salvos da sessão. */
export function clearWorkspaceSettings() {
  try {
    window.localStorage.removeItem(WORKSPACE_KEY)
    return true
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* IndexedDB: imagens                                                          */
/* -------------------------------------------------------------------------- */function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB indisponível neste navegador.'))
      return
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function dataUrlToBlob(dataUrl) {
  const normalized = dataUrl.startsWith('data:')
    ? dataUrl
    : `data:image/png;base64,${dataUrl}`
  const response = await fetch(normalized)
  return response.blob()
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Salva uma lista de imagens sob uma chave lógica (pose, style, appearance,
 * generated). Cada item é `{ dataUrl, meta? }`; `meta` guarda nome/tamanho da
 * imagem para reconstruir o estado da interface.
 *
 * @param {string} key
 * @param {Array<{ dataUrl: string, meta?: Record<string, unknown> }>} entries
 */
export async function putLocalImages(key, entries) {
  const list = Array.isArray(entries) ? entries.filter((entry) => entry?.dataUrl) : []
  if (list.length === 0) {
    await deleteLocalImages(key)
    return true
  }

  try {
    const items = []
    for (const entry of list) {
      items.push({
        blob: await dataUrlToBlob(entry.dataUrl),
        meta: entry.meta ?? null,
      })
    }

    const database = await openDatabase()
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put({ items, savedAt: Date.now() }, key)
      await transactionDone(transaction)
    } finally {
      database.close()
    }
    return true
  } catch (error) {
    console.warn('[local-store]', error)
    return false
  }
}

/**
 * Lê as imagens salvas sob uma chave, já como data URLs.
 *
 * @param {string} key
 * @returns {Promise<Array<{ dataUrl: string, meta: Record<string, unknown> | null }>>}
 */
export async function getLocalImages(key) {
  try {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const record = await requestToPromise(
        transaction.objectStore(STORE_NAME).get(key),
      )
      if (!record || !Array.isArray(record.items)) return []

      const result = []
      for (const item of record.items) {
        if (!item?.blob) continue
        result.push({
          dataUrl: await blobToDataUrl(item.blob),
          meta: item.meta ?? null,
        })
      }
      return result
    } finally {
      database.close()
    }
  } catch (error) {
    console.warn('[local-store]', error)
    throw error
  }
}

/** Apaga as imagens de uma chave. Devolve `false` se o navegador recusar. */
export async function deleteLocalImages(key) {
  try {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(key)
      await transactionDone(transaction)
    } finally {
      database.close()
    }
    return true
  } catch (error) {
    console.warn('[local-store]', error)
    return false
  }
}

/** Apaga todas as imagens salvas neste dispositivo. */
export async function clearLocalImages() {
  try {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).clear()
      await transactionDone(transaction)
    } finally {
      database.close()
    }
    return true
  } catch (error) {
    console.warn('[local-store]', error)
    return false
  }
}
