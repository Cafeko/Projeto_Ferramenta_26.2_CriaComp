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

const DB_NAME = 'spritetransfer-local'
const DB_VERSION = 1
const STORE_NAME = 'images'

/** Chaves usadas para as imagens persistidas. */
export const LOCAL_IMAGE_KEYS = {
  pose: 'pose',
  style: 'style',
  appearance: 'appearance',
  generated: 'generated',
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
 *   frameCount: number | null,
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
      frameCount: Number.isFinite(data.frameCount)
        ? Math.min(64, Math.max(1, Math.round(data.frameCount)))
        : null,
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

/* -------------------------------------------------------------------------- */
/* IndexedDB: imagens                                                          */
/* -------------------------------------------------------------------------- */

function openDatabase() {
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
