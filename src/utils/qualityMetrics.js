/**
 * Métrica de qualidade da animação gerada.
 *
 * Roda inteira no navegador (Canvas), sem chamar a IA de novo: medir a
 * qualidade não pode custar dinheiro nem tempo de API, senão ela distorce as
 * outras duas métricas (custo e tempo).
 *
 * A nota (0–100) responde à pergunta central da ferramenta — "a pose da
 * referência foi transferida para um personagem consistente, em pixel art
 * utilizável?" — com três componentes objetivos:
 *
 *   1. Fidelidade de pose (45%): a silhueta de cada frame gerado é comparada
 *      com a silhueta do frame de referência correspondente (IoU suave sobre
 *      uma grade normalizada; escala e posição não importam, só o formato).
 *   2. Consistência do personagem (35%): o histograma de cores de cada frame
 *      é comparado com o histograma médio da animação. Personagem que muda de
 *      roupa/cor entre frames derruba a nota.
 *   3. Pixel art utilizável (20%): paleta enxuta (poucas cores dominantes) e
 *      fundo transparente ou sólido (fácil de remover).
 *
 * Frames vazios ou faltando multiplicam a nota pela fração de frames válidos.
 * Sem referência fatiada (1 imagem para N frames), a pose não é avaliada e os
 * pesos dos outros dois componentes são redistribuídos.
 *
 * As faixas de calibração abaixo são heurísticas: a nota serve para comparar
 * tentativas (modelos, prompts, correções) entre si, não como verdade absoluta.
 */

/** Maior lado (px) usado na análise. Reduz custo sem perder a silhueta. */
const ANALYSIS_SIZE = 128
/** Lado da grade normalizada usada para comparar silhuetas. */
const MASK_GRID = 24
/** Fração mínima de pixels de conteúdo para o frame não ser considerado vazio. */
const MIN_CONTENT_RATIO = 0.005

export const QUALITY_WEIGHTS = { pose: 0.45, consistency: 0.35, pixelArt: 0.2 }

/** Calibração: valor bruto que vira 0 e valor bruto que vira 100. */
const POSE_RANGE = [0.3, 0.8] // IoU de silhueta
const CONSISTENCY_RANGE = [0.4, 0.9] // interseção de histogramas
const PALETTE_RANGE = [32, 512] // cores dominantes (escala log; menos é melhor)
const BACKGROUND_SCORES = { transparent: 1, solid: 0.6, noisy: 0.2 }

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function rescale(value, [low, high]) {
  return clamp01((value - low) / (high - low))
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar o frame para avaliar.'))
    const trimmed = src.trim()
    image.src =
      trimmed.startsWith('data:') || /^(https?:|blob:)/i.test(trimmed)
        ? trimmed
        : `data:image/png;base64,${trimmed}`
  })
}

/**
 * Lê os pixels de um frame já reduzido (vizinho mais próximo, para não criar
 * cores intermediárias que inflariam a paleta).
 */
async function readPixels(src) {
  const image = await loadImage(src)
  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  const scale = Math.min(1, ANALYSIS_SIZE / Math.max(naturalWidth, naturalHeight))
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D indisponível.')
  context.imageSmoothingEnabled = false
  context.drawImage(image, 0, 0, width, height)
  return { data: context.getImageData(0, 0, width, height).data, width, height }
}

/**
 * Extrai do frame: máscara do personagem, silhueta normalizada, histograma de
 * cores, tamanho da paleta e tipo de fundo.
 *
 * @param {string} src Data URL/Base64 do frame.
 */
export async function analyzeFrame(src) {
  const { data, width, height } = await readPixels(src)
  const pixelCount = width * height

  // Mesmo critério de `detectSpriteGrid`: usa o alpha se a imagem tiver
  // transparência; senão, a cor média dos cantos é o fundo.
  let translucent = 0
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] < 250) translucent += 1
  }
  const useAlpha = translucent > pixelCount * 0.01

  let background = null
  let backgroundKind = 'transparent'
  if (!useAlpha) {
    const corners = [0, (width - 1) * 4, (height - 1) * width * 4, (pixelCount - 1) * 4]
    background = [0, 1, 2].map(
      (channel) => corners.reduce((sum, offset) => sum + data[offset + channel], 0) / 4,
    )
    // Cantos todos iguais (±) = fundo sólido removível; diferentes = cenário/ruído.
    const spread = Math.max(
      ...corners.map((offset) =>
        Math.hypot(
          data[offset] - background[0],
          data[offset + 1] - background[1],
          data[offset + 2] - background[2],
        ),
      ),
    )
    backgroundKind = spread < 24 ? 'solid' : 'noisy'
  }

  const mask = new Uint8Array(pixelCount)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let content = 0
  const histogram = new Float64Array(512) // 3 bits por canal
  const palette = new Map() // 5 bits por canal

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    const isContent = useAlpha
      ? data[offset + 3] > 24
      : Math.hypot(red - background[0], green - background[1], blue - background[2]) > 32
    if (!isContent) continue

    mask[index] = 1
    content += 1
    const x = index % width
    const y = (index - x) / width
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y

    histogram[((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5)] += 1
    const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3)
    palette.set(key, (palette.get(key) ?? 0) + 1)
  }

  if (content < Math.max(4, pixelCount * MIN_CONTENT_RATIO)) {
    return { empty: true, backgroundKind, silhouette: null, histogram: null, colors: 0 }
  }

  for (let bin = 0; bin < histogram.length; bin += 1) histogram[bin] /= content

  // Cores dominantes: quantas cores cobrem 95% do personagem. Ignora o
  // "rabo" de ruído/antialias que toda imagem gerada por IA tem.
  const counts = [...palette.values()].sort((a, b) => b - a)
  let covered = 0
  let colors = 0
  for (const count of counts) {
    covered += count
    colors += 1
    if (covered >= content * 0.95) break
  }

  // Silhueta normalizada: a caixa do personagem é encaixada numa grade
  // MASK_GRID×MASK_GRID (centralizada na horizontal, apoiada no chão), com a
  // ocupação de cada célula entre 0 e 1. Assim o tamanho do sprite não importa.
  const boxWidth = maxX - minX + 1
  const boxHeight = maxY - minY + 1
  const cellScale = MASK_GRID / Math.max(boxWidth, boxHeight)
  const offsetX = (MASK_GRID - boxWidth * cellScale) / 2
  const offsetY = MASK_GRID - boxHeight * cellScale
  const silhouette = new Float64Array(MASK_GRID * MASK_GRID)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!mask[y * width + x]) continue
      const cellX = Math.min(MASK_GRID - 1, Math.floor(offsetX + (x - minX + 0.5) * cellScale))
      const cellY = Math.min(MASK_GRID - 1, Math.floor(offsetY + (y - minY + 0.5) * cellScale))
      silhouette[cellY * MASK_GRID + cellX] += 1
    }
  }
  const pixelsPerCell = 1 / (cellScale * cellScale)
  for (let cell = 0; cell < silhouette.length; cell += 1) {
    silhouette[cell] = Math.min(1, silhouette[cell] / pixelsPerCell)
  }

  return { empty: false, backgroundKind, silhouette, histogram, colors }
}

/** IoU suave entre duas silhuetas normalizadas (Σmin / Σmax). */
export function silhouetteIoU(a, b) {
  let intersection = 0
  let union = 0
  for (let cell = 0; cell < a.length; cell += 1) {
    intersection += Math.min(a[cell], b[cell])
    union += Math.max(a[cell], b[cell])
  }
  return union > 0 ? intersection / union : 0
}

/** Interseção de histogramas normalizados (1 = mesma distribuição de cores). */
export function histogramIntersection(a, b) {
  let total = 0
  for (let bin = 0; bin < a.length; bin += 1) total += Math.min(a[bin], b[bin])
  return total
}

function paletteScore(colors) {
  if (colors <= PALETTE_RANGE[0]) return 1
  const [low, high] = PALETTE_RANGE.map(Math.log)
  return 1 - rescale(Math.log(colors), [low, high])
}

/**
 * Média ponderada dos componentes (0–1). Sem pose, o peso dela é
 * redistribuído proporcionalmente entre os outros dois.
 */
function blend(pose, consistency, pixelArt) {
  const { pose: wPose, consistency: wConsistency, pixelArt: wPixel } = QUALITY_WEIGHTS
  if (pose === null) {
    return (consistency * wConsistency + pixelArt * wPixel) / (wConsistency + wPixel)
  }
  return pose * wPose + consistency * wConsistency + pixelArt * wPixel
}

export function qualityGrade(score) {
  if (score >= 80) return { label: 'Ótima', tone: 'green' }
  if (score >= 60) return { label: 'Boa', tone: 'cyan' }
  if (score >= 40) return { label: 'Regular', tone: 'amber' }
  return { label: 'Fraca', tone: 'red' }
}

/**
 * @typedef {{
 *   score: number,
 *   pose: number | null,
 *   consistency: number,
 *   pixelArt: number,
 *   completeness: number,
 *   frameCount: number,
 *   emptyFrames: number,
 *   colors: number,
 *   backgroundKind: 'transparent' | 'solid' | 'noisy',
 *   worstFrameIndex: number | null,
 *   perFrame: Array<number | null>,
 * }} QualityReport
 *
 * Todos os valores de nota estão em 0–100 (inteiros). `pose` é `null` quando
 * não há referência fatiada para comparar.
 */

/**
 * Avalia a animação atual.
 *
 * @param {{ frames: string[], referenceFrames?: string[] }} input
 * @returns {Promise<QualityReport | null>}
 */
export async function evaluateAnimationQuality({ frames, referenceFrames = [] }) {
  if (!Array.isArray(frames) || frames.length === 0) return null

  // Referência inteira para N frames não tem pose por frame para comparar.
  const comparePose =
    referenceFrames.length > 0 && (referenceFrames.length > 1 || frames.length === 1)

  const [generated, references] = await Promise.all([
    Promise.all(frames.map(analyzeFrame)),
    comparePose ? Promise.all(referenceFrames.map(analyzeFrame)) : Promise.resolve([]),
  ])

  const valid = generated.filter((frame) => !frame.empty)
  const expected = Math.max(frames.length, comparePose ? referenceFrames.length : 0)
  const completeness = valid.length / expected

  if (valid.length === 0) {
    return {
      score: 0,
      pose: comparePose ? 0 : null,
      consistency: 0,
      pixelArt: 0,
      completeness: 0,
      frameCount: frames.length,
      emptyFrames: frames.length,
      colors: 0,
      backgroundKind: generated[0]?.backgroundKind ?? 'noisy',
      worstFrameIndex: null,
      perFrame: frames.map(() => 0),
    }
  }

  const meanHistogram = new Float64Array(512)
  for (const frame of valid) {
    for (let bin = 0; bin < 512; bin += 1) meanHistogram[bin] += frame.histogram[bin] / valid.length
  }

  const poseScores = []
  const consistencyScores = []
  const pixelScores = []
  const perFrame = generated.map((frame, index) => {
    if (frame.empty) return 0

    let pose = null
    if (comparePose) {
      const referenceIndex =
        references.length === frames.length
          ? index
          : Math.min(references.length - 1, Math.floor((index * references.length) / frames.length))
      const reference = references[referenceIndex]
      pose = reference.empty ? null : rescale(silhouetteIoU(frame.silhouette, reference.silhouette), POSE_RANGE)
      if (pose !== null) poseScores.push(pose)
    }

    // Com um único frame não há o que comparar: consistência é total.
    const consistency =
      valid.length > 1
        ? rescale(histogramIntersection(frame.histogram, meanHistogram), CONSISTENCY_RANGE)
        : 1
    const pixelArt =
      0.6 * paletteScore(frame.colors) + 0.4 * BACKGROUND_SCORES[frame.backgroundKind]
    consistencyScores.push(consistency)
    pixelScores.push(pixelArt)

    return Math.round(blend(pose, consistency, pixelArt) * 100)
  })

  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length
  const pose = poseScores.length > 0 ? mean(poseScores) : null
  const consistency = mean(consistencyScores)
  const pixelArt = mean(pixelScores)

  const blended = blend(pose, consistency, pixelArt)

  // O frame mais fraco só é apontado quando destoa do resto (vale corrigir).
  let worstFrameIndex = null
  if (frames.length > 1) {
    const average = mean(perFrame)
    let worst = 0
    perFrame.forEach((value, index) => {
      if (value < perFrame[worst]) worst = index
    })
    if (perFrame[worst] <= average - 10) worstFrameIndex = worst
  }

  const backgroundCounts = { transparent: 0, solid: 0, noisy: 0 }
  for (const frame of valid) backgroundCounts[frame.backgroundKind] += 1
  const backgroundKind = /** @type {'transparent' | 'solid' | 'noisy'} */ (
    Object.entries(backgroundCounts).sort((a, b) => b[1] - a[1])[0][0]
  )

  return {
    score: Math.round(blended * completeness * 100),
    pose: pose === null ? null : Math.round(pose * 100),
    consistency: Math.round(consistency * 100),
    pixelArt: Math.round(pixelArt * 100),
    completeness: Math.round(completeness * 100),
    frameCount: frames.length,
    emptyFrames: frames.length - valid.length,
    colors: Math.round(mean(valid.map((frame) => frame.colors))),
    backgroundKind,
    worstFrameIndex,
    perFrame,
  }
}
