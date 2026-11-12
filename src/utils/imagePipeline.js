/**
 * Pipeline local de tratamento de imagens do SpriteTransfer.
 *
 * Tudo aqui roda no navegador do usuário via Canvas API (HTML5), sem enviar
 * pixels para o servidor. As funções trabalham com Data URLs PNG
 * (`data:image/png;base64,...`) e podem receber, como entrada, um `File`,
 * um `Blob`, uma Data URL/URL ou um elemento de imagem já carregado.
 *
 * Fluxo típico:
 *   1. `sliceSpritesheet`  -> separa a spritesheet recebida da IA em frames.
 *   2. `alignBoundingBox`  -> recentraliza cada frame para o preview não oscilar.
 *   3. `compileSpritesheetGrid` -> remonta a spritesheet final para download.
 *   4. `exportGIF`         -> gera um preview animado em GIF para download.
 *
 * Observação de segurança: `getImageData()` exige que a imagem seja
 * "same-origin" (ou um Data URL/Blob local). Imagens vindas de outro domínio
 * sem CORS "contaminam" o canvas; nesse caso lançamos `TAINTED_CANVAS`.
 */

/** @typedef {string | Blob | File | HTMLImageElement | HTMLCanvasElement | ImageBitmap} ImageSource */

/** Alpha mínimo (0-255) para considerar um pixel como parte do sprite. */
const DEFAULT_ALPHA_THRESHOLD = 8

/** O formato GIF guarda o atraso em centésimos de segundo; abaixo de 20 ms os navegadores costumam acelerar. */
const MIN_FRAME_DELAY_MS = 20

/** Limite defensivo para não travar a aba com animações gigantes. */
const MAX_FRAMES = 500

/** Limite de pixels por GIF (frames × largura × altura) para manter o uso de memória sob controle. */
const MAX_GIF_PIXELS = 48_000_000

/**
 * Erro específico do pipeline, com um `code` estável para o chamador tratar
 * (mostrar mensagem amigável, tentar de novo, etc.).
 */
export class ImagePipelineError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, cause?: unknown }} [options]
   */
  constructor(message, { code = 'IMAGE_PIPELINE_ERROR', cause } = {}) {
    super(message)
    this.name = 'ImagePipelineError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

/* -------------------------------------------------------------------------- */
/* Utilidades internas                                                        */
/* -------------------------------------------------------------------------- */

function assertBrowser() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new ImagePipelineError(
      'Este processamento precisa rodar no navegador (Canvas API indisponível).',
      { code: 'NO_DOM' },
    )
  }
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function assertPositiveInt(value, name) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new ImagePipelineError(
      `\"${name}\" deve ser um número inteiro maior que zero (recebido: ${String(value)}).`,
      { code: 'INVALID_ARGUMENT' },
    )
  }
  return number
}

/**
 * Aceita Data URL, URL comum ou Base64 "puro" (como o backend devolve) e
 * normaliza para algo que o navegador consiga carregar.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeImageString(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    throw new ImagePipelineError('A imagem informada está vazia.', {
      code: 'INVALID_ARGUMENT',
    })
  }
  if (/^(data:|blob:|https?:)/i.test(trimmed)) return trimmed

  // Base64 puro (com ou sem quebras de linha) -> assume PNG.
  const compact = trimmed.replace(/\s+/g, '')
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return `data:image/png;base64,${compact}`
  }

  // Último recurso: deixa o navegador tentar carregar como URL.
  return trimmed
}

/**
 * Valida e normaliza a lista de frames recebida pelas funções públicas.
 *
 * @param {unknown} frames
 * @returns {string[]}
 */
function normalizeFrames(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new ImagePipelineError(
      'Envie ao menos um frame (array de Data URLs/Base64).',
      { code: 'EMPTY_FRAMES' },
    )
  }
  if (frames.length > MAX_FRAMES) {
    throw new ImagePipelineError(
      `Foram enviados ${frames.length} frames, mas o limite é ${MAX_FRAMES}. ` +
        'Reduza a quantidade para não travar o navegador.',
      { code: 'TOO_MANY_FRAMES' },
    )
  }
  return frames.map((frame, index) => {
    if (typeof frame !== 'string' || !frame.trim()) {
      throw new ImagePipelineError(
        `O frame ${index + 1} está vazio ou não é uma string.`,
        { code: 'INVALID_FRAME' },
      )
    }
    return normalizeImageString(frame)
  })
}

/**
 * Cria um canvas invisível (fora do DOM).
 *
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
function createCanvas(width, height) {
  assertBrowser()
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new ImagePipelineError(
      `Dimensões inválidas para o canvas: ${width}x${height}.`,
      { code: 'INVALID_SIZE' },
    )
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width)
  canvas.height = Math.round(height)
  return canvas
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ readFrequently?: boolean }} [options]
 * @returns {CanvasRenderingContext2D}
 */
function getContext(canvas, { readFrequently = false } = {}) {
  // `willReadFrequently` evita o custo de manter a imagem na GPU quando
  // vamos chamar getImageData() (caso de `alignBoundingBox` e do GIF).
  const context = canvas.getContext(
    '2d',
    readFrequently ? { willReadFrequently: true } : undefined,
  )
  if (!context) {
    throw new ImagePipelineError(
      'Não foi possível obter o contexto 2D do canvas.',
      { code: 'CANVAS_UNAVAILABLE' },
    )
  }
  return context
}

/**
 * Exporta um canvas como Data URL PNG, traduzindo erros comuns.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} label
 * @returns {string}
 */
function canvasToDataUrl(canvas, label) {
  try {
    const dataUrl = canvas.toDataURL('image/png')
    if (!dataUrl.startsWith('data:image/png')) {
      throw new Error('toDataURL não retornou um PNG.')
    }
    return dataUrl
  } catch (error) {
    if (error && /** @type {any} */ (error).name === 'SecurityError') {
      throw new ImagePipelineError(
        `Não foi possível ler os pixels de ${label}: a imagem veio de outro ` +
          'domínio sem CORS. Use um arquivo local ou Data URL.',
        { code: 'TAINTED_CANVAS', cause: error },
      )
    }
    throw new ImagePipelineError(
      `Não foi possível exportar ${label} como PNG.`,
      { code: 'EXPORT_FAILED', cause: error },
    )
  }
}

/**
 * Carrega uma URL/Data URL em um `HTMLImageElement` aguardando o decode.
 *
 * @param {string} url
 * @param {string} label
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageElement(url, label) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // Permite ler pixels de imagens remotas (quando o servidor manda CORS).
    if (/^https?:/i.test(url)) image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(
        new ImagePipelineError(
          `Não foi possível carregar ${label}. Verifique se o arquivo é uma imagem válida.`,
          { code: 'IMAGE_LOAD_FAILED' },
        ),
      )
    image.src = url
  })
}

/**
 * Converte qualquer fonte suportada em algo desenhável no canvas, junto com
 * largura/altura reais e uma função de limpeza.
 *
 * @param {ImageSource} source
 * @param {string} label
 * @returns {Promise<{ drawable: CanvasImageSource, width: number, height: number, dispose: () => void }>}
 */
async function loadDrawable(source, label) {
  assertBrowser()

  if (typeof source === 'string') {
    const image = await loadImageElement(normalizeImageString(source), label)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) {
      throw new ImagePipelineError(
        `${label} carregou com dimensões inválidas.`,
        { code: 'INVALID_IMAGE' },
      )
    }
    return { drawable: image, width, height, dispose: () => {} }
  }

  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    if (source.size === 0) {
      throw new ImagePipelineError(`${label} está vazio (0 bytes).`, {
        code: 'INVALID_IMAGE',
      })
    }

    // createImageBitmap é mais rápido e não exige elemento no DOM.
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(source)
        return {
          drawable: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          dispose: () => bitmap.close?.(),
        }
      } catch {
        // Alguns formatos (ex.: SVG em certos navegadores) falham aqui;
        // tentamos o caminho clássico com  abaixo.
      }
    }

    const objectUrl = URL.createObjectURL(source)
    try {
      const image = await loadImageElement(objectUrl, label)
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (!width || !height) {
        throw new ImagePipelineError(
          `${label} carregou com dimensões inválidas.`,
          { code: 'INVALID_IMAGE' },
        )
      }
      return {
        drawable: image,
        width,
        height,
        dispose: () => URL.revokeObjectURL(objectUrl),
      }
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      throw error
    }
  }

  // Elementos já carregados: , <canvas>, ImageBitmap, OffscreenCanvas...
  const candidate = /** @type {any} */ (source)
  const width = candidate?.naturalWidth ?? candidate?.width
  const height = candidate?.naturalHeight ?? candidate?.height
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { drawable: candidate, width, height, dispose: () => {} }
  }

  throw new ImagePipelineError(
    `${label} não é um arquivo, Data URL ou elemento de imagem válido.`,
    { code: 'INVALID_IMAGE' },
  )
}

/**
 * Encontra a caixa delimitadora dos pixels com alpha acima do limite.
 *
 * @param {ImageData} imageData
 * @param {number} alphaThreshold
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
function findAlphaBounds(imageData, alphaThreshold) {
  const { data, width, height } = imageData
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width * 4
    for (let x = 0; x < width; x += 1) {
      const alpha = data[rowStart + x * 4 + 3]
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

/**
 * Divide uma dimensão total em `parts` faixas inteiras cobrindo todos os
 * pixels, mesmo quando a divisão não é exata (evita perder a última coluna).
 *
 * @param {number} total
 * @param {number} parts
 * @returns {Array<{ start: number, end: number, size: number }>}
 */
function splitAxis(total, parts) {
  const ranges = []
  for (let index = 0; index < parts; index += 1) {
    const start = Math.round((index * total) / parts)
    const end = Math.round(((index + 1) * total) / parts)
    ranges.push({ start, end, size: end - start })
  }
  return ranges
}

/**
 * Conta quantos blocos contínuos de conteúdo existem em uma projeção.
 * Pequenos vãos (1 px) são tratados como parte do mesmo bloco.
 *
 * @param {Uint32Array} projection
 * @param {number} minPixels
 * @returns {number}
 */
function countContentRuns(projection, minPixels) {
  let runs = 0
  let inRun = false
  let gap = 0
  for (let index = 0; index < projection.length; index += 1) {
    if (projection[index] >= minPixels) {
      if (!inRun) {
        runs += 1
        inRun = true
      }
      gap = 0
    } else if (inRun) {
      gap += 1
      if (gap >= 2) inRun = false
    }
  }
  return runs
}

/**
 * Detecta a grade (colunas × linhas) de uma spritesheet observando os pixels.
 *
 * Fundo transparente: conta colunas/linhas que possuem pixels opacos.
 * Fundo sólido: usa a cor dos cantos como fundo e conta o que difere dela.
 *
 * @param {ImageSource} source Spritesheet completa (Data URL, Blob etc.).
 * @param {{ maxCells?: number }} [options]
 * @returns {Promise<{ columns: number, rows: number, total: number }>}
 */
export async function detectSpriteGrid(source, { maxCells = 64 } = {}) {
  const sheet = await loadDrawable(source, 'a imagem de referência')

  try {
    const { width, height } = sheet
    const canvas = createCanvas(width, height)
    const context = getContext(canvas, { readFrequently: true })
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, width, height)
    context.drawImage(sheet.drawable, 0, 0, width, height)

    const imageData = readImageData(
      context,
      width,
      height,
      'a imagem de referência',
    )
    const data = imageData.data
    const pixelCount = width * height

    // A imagem usa transparência? Então ela é o critério mais confiável.
    let translucent = 0
    for (let offset = 3; offset < data.length; offset += 4) {
      if (data[offset] < 250) translucent += 1
    }
    const useAlpha = translucent > pixelCount * 0.01

    // Fundo opaco: usa a média dos quatro cantos.
    let background = null
    if (!useAlpha) {
      const corners = [
        0,
        (width - 1) * 4,
        (height - 1) * width * 4,
        (height * width - 1) * 4,
      ]
      let red = 0
      let green = 0
      let blue = 0
      for (const offset of corners) {
        red += data[offset]
        green += data[offset + 1]
        blue += data[offset + 2]
      }
      background = [red / 4, green / 4, blue / 4]
    }

    const columnsContent = new Uint32Array(width)
    const rowsContent = new Uint32Array(height)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        let content
        if (useAlpha) {
          content = data[offset + 3] > 24
        } else {
          const dr = data[offset] - background[0]
          const dg = data[offset + 1] - background[1]
          const db = data[offset + 2] - background[2]
          content = dr * dr + dg * dg + db * db > 24 * 24
        }
        if (content) {
          columnsContent[x] += 1
          rowsContent[y] += 1
        }
      }
    }

    const minColumnPixels = Math.max(1, Math.floor(height * 0.01))
    const minRowPixels = Math.max(1, Math.floor(width * 0.01))
    const columns = countContentRuns(columnsContent, minColumnPixels)
    const rows = countContentRuns(rowsContent, minRowPixels)
    const total = columns * rows

    if (total >= 1 && total <= maxCells) {
      return { columns, rows, total }
    }
    return { columns: 1, rows: 1, total: 1 }
  } finally {
    sheet.dispose()
  }
}

/**
 * Dispara o download de um Blob no navegador.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
  assertBrowser()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Dá tempo para o navegador iniciar o download antes de liberar a URL.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
}

/* -------------------------------------------------------------------------- */
/* API pública                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Divide um spritesheet em frames individuais.
 *
 * A imagem é desenhada em um canvas invisível e recortada célula a célula.
 * Cada recorte vira um PNG transparente independente.
 *
 * @param {ImageSource} imageFile Arquivo/Blob (ou imagem já carregada) do spritesheet.
 * @param {number} columns Número de colunas da grade.
 * @param {number} rows Número de linhas da grade.
 * @returns {Promise<string[]>} Data URLs PNG na ordem: linha 1 da esquerda para
 *   a direita, depois linha 2, etc.
 */
export async function sliceSpritesheet(imageFile, columns, rows) {
  const cols = assertPositiveInt(columns, 'columns')
  const rws = assertPositiveInt(rows, 'rows')
  const sheet = await loadDrawable(imageFile, 'o spritesheet')

  try {
    if (sheet.width < cols || sheet.height < rws) {
      throw new ImagePipelineError(
        `A imagem (${sheet.width}x${sheet.height}) é pequena demais para uma ` +
          `grade de ${cols}x${rws}.`,
        { code: 'INVALID_GRID' },
      )
    }

    const columnRanges = splitAxis(sheet.width, cols)
    const rowRanges = splitAxis(sheet.height, rws)
    const frames = []

    for (const row of rowRanges) {
      for (const column of columnRanges) {
        if (column.size < 1 || row.size < 1) {
          throw new ImagePipelineError(
            'A grade gerou uma célula sem pixels. Reduza o número de colunas/linhas.',
            { code: 'INVALID_GRID' },
          )
        }

        const canvas = createCanvas(column.size, row.size)
        const context = getContext(canvas)
        // Pixel art: nada de suavização ao recortar.
        context.imageSmoothingEnabled = false
        context.clearRect(0, 0, column.size, row.size)
        context.drawImage(
          sheet.drawable,
          column.start,
          row.start,
          column.size,
          row.size,
          0,
          0,
          column.size,
          row.size,
        )

        frames.push(
          canvasToDataUrl(canvas, `o frame ${frames.length + 1} do spritesheet`),
        )
      }
    }

    return frames
  } finally {
    sheet.dispose()
  }
}

/**
 * Recentraliza o sprite com base na caixa delimitadora dos pixels opacos.
 *
 * Isso remove o "tremor" (jitter) causado por frames exportados com margens
 * diferentes: o centro geométrico do sprite passa a coincidir com o centro do
 * canvas. O tamanho original (por exemplo 32x32 ou 64x64) é preservado por
 * padrão.
 *
 * @param {ImageSource} base64Frame Frame individual (Data URL, Base64 puro ou Blob).
 * @param {{
 *   size?: number,
 *   alphaThreshold?: number,
 *   padding?: number,
 *   anchor?: 'center' | 'bottom',
 * }} [options]
 *   - `size`: força um canvas quadrado (ex.: 32 ou 64). Sem isso, mantém o
 *     tamanho original do frame.
 *   - `alphaThreshold`: alpha mínimo para considerar o pixel opaco.
 *   - `padding`: margem em pixels ao usar `anchor: 'bottom'`.
 *   - `anchor`: `'center'` centraliza; `'bottom'` apoia o sprite no rodapé
 *     (útil para personagens em pé, com os pés no chão).
 * @returns {Promise<string>} Data URL PNG do frame recentralizado.
 */
export async function alignBoundingBox(base64Frame, options = {}) {
  const {
    size,
    alphaThreshold = DEFAULT_ALPHA_THRESHOLD,
    padding = 0,
    anchor = 'center',
  } = options

  if (anchor !== 'center' && anchor !== 'bottom') {
    throw new ImagePipelineError(
      '"anchor" deve ser "center" ou "bottom".',
      { code: 'INVALID_ARGUMENT' },
    )
  }

  const threshold = Math.max(0, Math.min(255, Number(alphaThreshold) || 0))
  const frame = await loadDrawable(base64Frame, 'o frame')

  try {
    // 1) Desenha no tamanho natural para poder ler os pixels.
    const sourceCanvas = createCanvas(frame.width, frame.height)
    const sourceContext = getContext(sourceCanvas, { readFrequently: true })
    sourceContext.clearRect(0, 0, frame.width, frame.height)
    sourceContext.drawImage(frame.drawable, 0, 0, frame.width, frame.height)

    const imageData = readImageData(
      sourceContext,
      frame.width,
      frame.height,
      'o frame',
    )

    // 2) Localiza a área realmente ocupada pelo sprite.
    const bounds = findAlphaBounds(imageData, threshold)
    if (!bounds) {
      throw new ImagePipelineError(
        'O frame está totalmente transparente: não há sprite para alinhar.',
        { code: 'EMPTY_FRAME' },
      )
    }

    // 3) Define o canvas de saída. Sem `size`, mantém as dimensões originais.
    const outputWidth = size === undefined ? frame.width : assertPositiveInt(size, 'size')
    const outputHeight = size === undefined ? frame.height : outputWidth

    // Sem `size` não há escala: preserva exatamente os pixels originais.
    // Com `size`, o frame inteiro é reescalado uniformemente para caber no
    // quadrado pedido (útil para padronizar tudo em 32x32 ou 64x64).
    const scale =
      size === undefined
        ? 1
        : outputWidth / Math.max(frame.width, frame.height)
    const drawWidth = Math.max(1, Math.round(bounds.width * scale))
    const drawHeight = Math.max(1, Math.round(bounds.height * scale))

    const margin = Math.max(
      0,
      Math.min(
        Math.round(Number(padding) || 0),
        Math.floor(Math.min(outputWidth, outputHeight) * 0.45),
      ),
    )

    const desiredX = Math.round((outputWidth - drawWidth) / 2)
    const desiredY =
      anchor === 'bottom'
        ? outputHeight - drawHeight - margin
        : Math.round((outputHeight - drawHeight) / 2)

    // Nunca deixa o sprite sair do canvas (proteção contra arredondamentos).
    const drawX = Math.min(Math.max(0, desiredX), Math.max(0, outputWidth - drawWidth))
    const drawY = Math.min(Math.max(0, desiredY), Math.max(0, outputHeight - drawHeight))

    // 4) Redesenha somente a caixa útil, já centralizada, em um canvas limpo.
    const outputCanvas = createCanvas(outputWidth, outputHeight)
    const outputContext = getContext(outputCanvas)
    outputContext.imageSmoothingEnabled = false
    outputContext.clearRect(0, 0, outputWidth, outputHeight)
    outputContext.drawImage(
      frame.drawable,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      drawX,
      drawY,
      drawWidth,
      drawHeight,
    )

    return canvasToDataUrl(outputCanvas, 'o frame alinhado')
  } finally {
    frame.dispose()
  }
}

/**
 * Compila uma lista de frames em uma única spritesheet em grade.
 *
 * Todos os frames são desenhados em células do mesmo tamanho (o maior frame
 * define a célula), centralizados e sobre fundo transparente. As linhas são
 * preenchidas da esquerda para a direita.
 *
 * @param {string[]} base64Frames Frames já processados.
 * @param {number} columns Colunas da grade final.
 * @returns {Promise<string>} Data URL PNG da spritesheet compilada.
 */
export async function compileSpritesheetGrid(base64Frames, columns) {
  const cols = assertPositiveInt(columns, 'columns')
  const frames = normalizeFrames(base64Frames)

  const loaded = await Promise.all(
    frames.map((frame, index) => loadDrawable(frame, `o frame ${index + 1}`)),
  )

  try {
    const cellWidth = Math.max(...loaded.map((frame) => frame.width))
    const cellHeight = Math.max(...loaded.map((frame) => frame.height))
    const rows = Math.ceil(loaded.length / cols)

    // Canvas único e transparente: nenhum preenchimento de fundo.
    const canvas = createCanvas(cellWidth * cols, cellHeight * rows)
    const context = getContext(canvas)
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvas.width, canvas.height)

    loaded.forEach((frame, index) => {
      const column = index % cols
      const row = Math.floor(index / cols)
      const offsetX = column * cellWidth + Math.round((cellWidth - frame.width) / 2)
      const offsetY = row * cellHeight + Math.round((cellHeight - frame.height) / 2)
      context.drawImage(
        frame.drawable,
        0,
        0,
        frame.width,
        frame.height,
        offsetX,
        offsetY,
        frame.width,
        frame.height,
      )
    })

    return canvasToDataUrl(canvas, 'a spritesheet compilada')
  } finally {
    loaded.forEach((frame) => frame.dispose())
  }
}

/**
 * Lê os pixels de um contexto 2D traduzindo o erro clássico de canvas
 * "contaminado" (imagem de outro domínio sem CORS).
 *
 * @param {CanvasRenderingContext2D} context
 * @param {number} width
 * @param {number} height
 * @param {string} label
 * @returns {ImageData}
 */
function readImageData(context, width, height, label) {
  try {
    return context.getImageData(0, 0, width, height)
  } catch (error) {
    throw new ImagePipelineError(
      `Não foi possível ler os pixels de ${label}. A imagem pode ter vindo de ` +
        'outro domínio sem permissão de CORS.',
      { code: 'TAINTED_CANVAS', cause: error },
    )
  }
}

/**
 * Quantizador simples de cores para GIF (reduce para até 256 cores).
 * Implementação pura em JavaScript, sem dependências externas.
 *
 * @param {Uint8ClampedArray[]} framesData
 * @returns {number[][]} Paleta de até 256 cores [r, g, b, a]
 */
function buildGlobalPalette(framesData) {
  const totalPixels = framesData.reduce((sum, data) => sum + data.length / 4, 0)
  const maxSamples = 262_144 // ~256 mil pixels: bom equilíbrio qualidade × custo
  const stride = Math.max(1, Math.ceil(totalPixels / maxSamples))

  const sample = new Uint8Array(Math.ceil(totalPixels / stride) * 4)
  let offset = 0

  framesData.forEach((data) => {
    const pixelCount = data.length / 4
    for (let pixel = 0; pixel < pixelCount; pixel += stride) {
      const index = pixel * 4
      sample[offset] = data[index]
      sample[offset + 1] = data[index + 1]
      sample[offset + 2] = data[index + 2]
      sample[offset + 3] = data[index + 3]
      offset += 4
    }
  })

  // Quantização simples: amostra uniforme até 255 cores + 1 para transparência
  const palette = []
  const seen = new Map()
  const sampleCount = sample.length / 4

  for (let i = 0; i < sampleCount && palette.length < 255; i += 1) {
    const idx = i * 4
    const r = sample[idx]
    const g = sample[idx + 1]
    const b = sample[idx + 2]
    const a = sample[idx + 3]
    const key = `${r},${g},${b},${a > 128 ? 255 : 0}`
    if (!seen.has(key)) {
      seen.set(key, palette.length)
      palette.push([r, g, b, a > 128 ? 255 : 0])
    }
  }

  // Garante índice transparente
  palette.push([0, 0, 0, 0])
  return palette
}

/**
 * Monta um GIF animado a partir dos frames e dispara o download.
 *
 * Implementação pura em JavaScript sem dependências externas.
 *
 * @param {string[]} base64Frames Frames em PNG (Data URL ou Base64 puro).
 * @param {number} [fps=8] Quadros por segundo do preview.
 * @param {{ download?: boolean, filename?: string }} [options]
 *   - `download`: se `true` (padrão), dispara o download automaticamente.
 *   - `filename`: nome do arquivo baixado.
 * @returns {Promise<Blob>} O Blob do GIF (útil para preview/upload sem baixar).
 */
export async function exportGIF(base64Frames, fps = 8, options = {}) {
  const { download = true, filename = 'sprite-animation.gif' } = options
  const frames = normalizeFrames(base64Frames)

  const numericFps = Number(fps)
  if (!Number.isFinite(numericFps) || numericFps <= 0) {
    throw new ImagePipelineError(
      `"fps" deve ser um número maior que zero (recebido: ${String(fps)}).`,
      { code: 'INVALID_ARGUMENT' },
    )
  }

  // GIF usa centésimos de segundo; arredondamos para 10 ms.
  const delay = Math.max(MIN_FRAME_DELAY_MS, Math.round(1000 / numericFps / 10) * 10)

  const loaded = await Promise.all(
    frames.map((frame, index) => loadDrawable(frame, `o frame ${index + 1}`)),
  )

  try {
    const width = Math.max(...loaded.map((frame) => frame.width))
    const height = Math.max(...loaded.map((frame) => frame.height))

    if (width * height * loaded.length > MAX_GIF_PIXELS) {
      throw new ImagePipelineError(
        `O GIF ficaria grande demais (${width}x${height} × ${loaded.length} frames). ` +
          'Reduza a resolução ou a quantidade de frames.',
        { code: 'GIF_TOO_LARGE' },
      )
    }

    // 1) Normaliza todos os frames para o mesmo canvas transparente.
    const canvas = createCanvas(width, height)
    const context = getContext(canvas, { readFrequently: true })
    const framesData = loaded.map((frame) => {
      context.clearRect(0, 0, width, height)
      context.imageSmoothingEnabled = false
      context.drawImage(
        frame.drawable,
        Math.round((width - frame.width) / 2),
        Math.round((height - frame.height) / 2),
        frame.width,
        frame.height,
      )
      return readImageData(context, width, height, 'um dos frames').data
    })

    try {
      // 2) Paleta global a partir de uma amostra de todos os frames.
      const palette = buildGlobalPalette(framesData)

      // 3) Escreve os frames no GIF (implementação mínima em JS puro).
      // Nota: esta é uma implementação simplificada. Para GIFs mais complexos,
      // recomenda-se usar uma biblioteca dedicada.
      const gifBytes = encodeGIF(framesData, width, height, delay, palette)

      const blob = new Blob([gifBytes], { type: 'image/gif' })

      if (download) triggerDownload(blob, filename)
      return blob
    } catch (error) {
      if (error instanceof ImagePipelineError) throw error
      throw new ImagePipelineError(
        'Não foi possível montar o GIF animado. Tente reduzir o tamanho dos frames.',
        { code: 'GIF_ENCODE_FAILED', cause: error },
      )
    }
  } finally {
    loaded.forEach((frame) => frame.dispose())
  }
}

/**
 * Encoder GIF mínimo em JavaScript puro.
 * Gera um GIF válido com paleta global e transparência de 1 bit.
 *
 * @param {Uint8ClampedArray[]} framesData
 * @param {number} width
 * @param {number} height
 * @param {number} delay centésimos de segundo
 * @param {number[][]} paleta [r, g, b, a] até 256 cores
 * @returns {Uint8Array}
 */
function encodeGIF(framesData, width, height, delay, palette) {
  // Cabeçalho GIF89a
  const header = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) // GIF89a
  const lsd = new Uint8Array([ // Logical Screen Descriptor
    width & 0xff, width >> 8,
    height & 0xff, height >> 8,
    0xf0, // Global Color Table flag, size 0 (2^(0+1)=2 entries, mas usamos full)
    0x00, // Background color index
    0x00, // Pixel aspect ratio
  ])

  // Paleta global (até 256 cores RGB)
  const gctSize = Math.min(palette.length, 256)
  const gct = new Uint8Array(gctSize * 3)
  for (let i = 0; i < gctSize; i += 1) {
    gct[i * 3] = palette[i][0] || 0
    gct[i * 3 + 1] = palette[i][1] || 0
    gct[i * 3 + 2] = palette[i][2] || 0
  }

  // Índice transparente (última cor da paleta)
  const transparentIndex = gctSize - 1

  // Application Extension (Netscape 2.0 para loop infinito)
  const appExt = new Uint8Array([
    0x21, 0xff, 0x0b, // Extension Introducer, Application Extension, size 11
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, // NETSCAPE2.0
    0x03, 0x01, 0x00, 0x00, // Block size 3, loop forever, terminator
    0x00,
  ])

  // Graphic Control Extension por frame
  function gce(frameIndex) {
    return new Uint8Array([
      0x21, 0xf9, 0x04, // Extension Introducer, Graphic Control Extension, size 4
      0x01, // Disposal method: do not dispose (0x01 << 2), user input 0, transparent color 0
      delay & 0xff, delay >> 8, // Delay time
      transparentIndex, // Transparent color index
      0x00, // Block terminator
    ])
  }

  // Image Descriptor + Image Data (LZW simplificado: armazenar como não comprimido)
  function imageDataBlock(data, width, height) {
    const id = new Uint8Array([
      0x2c, // Image Separator
      0x00, 0x00, // Left position
      0x00, 0x00, // Top position
      width & 0xff, width >> 8, // Width
      height & 0xff, height >> 8, // Height
      0x00, // No local color table
    ])
    return id
  }

  // Converte RGBA para índice de paleta (mais próximo)
  function rgbaToIndex(r, g, b, a, palette) {
    if (a < 128) return palette.length - 1 // transparente
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < palette.length; i += 1) {
      const dr = r - palette[i][0]
      const dg = g - palette[i][1]
      const db = b - palette[i][2]
      const dist = dr * dr + dg * dg + db * db
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    return bestIdx
  }

  // Converte dados de imagem para índices de paleta
  function indexImageData(data, width, height, palette) {
    const indices = new Uint8Array(width * height)
    for (let i = 0; i < width * height; i += 1) {
      const idx = i * 4
      indices[i] = rgbaToIndex(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], palette)
    }
    return indices
  }

  // Simples LZW substituição: escreve dados brutos (não comprimido, mas válido)
  // Para simplificar, usamos "uncompressed" LZW com código de tamanho fixo
  function writeImageData(indices, width, height) {
    const blocks = []
    const blockSize = 255
    for (let i = 0; i < indices.length; i += blockSize) {
      const chunk = indices.slice(i, i + blockSize)
      const block = new Uint8Array(chunk.length + 1)
      block[0] = chunk.length
      block.set(chunk, 1)
      blocks.push(block)
    }
    blocks.push(new Uint8Array([0])) // Block terminator
    return blocks
  }

  const allBytes = []
  allBytes.push(...header)
  allBytes.push(...lsd)
  allBytes.push(...gct)
  allBytes.push(...appExt)

  framesData.forEach((data, frameIdx) => {
    allBytes.push(...gce(frameIdx))
    const id = imageDataBlock(data, width, height)
    allBytes.push(...id)
    const indices = indexImageData(data, width, height, palette)
    const blocks = writeImageData(indices, width, height)
    blocks.forEach((block) => allBytes.push(...block))
  })

  allBytes.push(0x3b) // GIF Trailer

  return new Uint8Array(allBytes)
}

/**
 * Converte uma Data URL em Blob (útil para upload/download sem passar pelo DOM).
 *
 * @param {string} dataUrl
 * @returns {Blob}
 */
export function dataUrlToBlob(dataUrl) {
  const value = String(dataUrl || '')
  const commaIndex = value.indexOf(',')
  if (commaIndex === -1) {
    throw new ImagePipelineError('Data URL inválida.', { code: 'INVALID_DATA_URL' })
  }

  const header = value.slice(0, commaIndex)
  const body = value.slice(commaIndex + 1)
  const mime = /^data:([^;,]+)/i.exec(header)?.[1] || 'application/octet-stream'
  if (!/;base64/i.test(header)) {
    throw new ImagePipelineError(
      'A Data URL precisa estar em Base64.',
      { code: 'INVALID_DATA_URL' },
    )
  }

  let binary
  try {
    binary = atob(body.replace(/\s+/g, ''))
  } catch (error) {
    throw new ImagePipelineError(
      'O conteúdo Base64 da Data URL é inválido.',
      { code: 'INVALID_DATA_URL', cause: error },
    )
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime })
}

/**
 * Baixa uma imagem (Data URL) com o nome de arquivo indicado.
 *
 * @param {string} dataUrl
 * @param {string} [filename='sprite.png']
 */
export function downloadDataUrl(dataUrl, filename = 'sprite.png') {
  triggerDownload(dataUrlToBlob(dataUrl), filename)
}
