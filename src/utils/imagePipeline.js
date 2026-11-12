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

import gifenc from 'gifenc'
const { GIFEncoder, applyPalette, quantize } = gifenc

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
      `"${name}" deve ser um número inteiro maior que zero (recebido: ${String(value)}).`,
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
        // tentamos o caminho clássico com <img> abaixo.
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

  // Elementos já carregados: <img>, <canvas>, ImageBitmap, OffscreenCanvas...
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
 *   - `alphaThreshold`: alpha mínimo para considerar o pixel opaco (0-255).
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
 * Monta um GIF animado a partir dos frames e dispara o download.
 *
 * Estratégia: todos os frames são normalizados para o mesmo canvas
 * transparente, uma única paleta global (com transparência de 1 bit) é
 * calculada a partir de uma amostra de todos os frames e cada frame é
 * indexado nessa paleta antes de ser escrito no GIF. Assim as cores ficam
 * estáveis entre os frames (sem "piscar") e o arquivo final é pequeno.
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
      let transparentIndex = palette.findIndex(
        (color) => color.length > 3 && color[3] === 0,
      )
      if (transparentIndex === -1) {
        // Garante o índice transparente mesmo se o quantizador não o criar.
        palette.push([0, 0, 0, 0])
        transparentIndex = palette.length - 1
      }

      // 3) Escreve os frames no GIF.
      const gif = GIFEncoder()
      framesData.forEach((data) => {
        const indexed = applyPalette(data, palette, 'rgba4444')
        gif.writeFrame(indexed, width, height, {
          palette,
          delay,
          repeat: 0, // loop infinito
          transparent: true,
          transparentIndex,
          // `dispose: 2` limpa o frame anterior, evitando "fantasmas"
          // quando há transparência entre os quadros.
          dispose: 2,
        })
      })
      gif.finish()
      const blob = new Blob([gif.bytesView()], { type: 'image/gif' })

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
 * Cria uma paleta global (até 256 cores, com alpha de 1 bit) a partir de uma
 * amostra distribuída de todos os frames.
 *
 * @param {Uint8ClampedArray[]} framesData
 * @returns {number[][]}
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

  // 255 cores + 1 reservada para transparência.
  return quantize(sample.subarray(0, offset), 255, {
    format: 'rgba4444',
    oneBitAlpha: true,
    clearAlpha: true,
  })
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
