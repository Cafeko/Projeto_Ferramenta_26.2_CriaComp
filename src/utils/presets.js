/**
 * Presets de referência de movimento.
 *
 * Em vez de depender de arquivos binários, desenhamos pequenas "pose sheets"
 * de 32x32 px no próprio navegador. Elas servem como referência de pose para
 * os modelos de imagem (silhuetas/stick figures), no espírito do OpenPose.
 *
 * Cada preset tem 4 frames em uma única linha (4 colunas × 1 linha).
 */

const BODY = '#7dd3fc'
const BODY_DARK = '#0b1220'
const SWORD = '#fbbf24'
const SWORD_DARK = '#3a2404'

/** @typedef {{ x1: number, y1: number, x2: number, y2: number, width?: number }} Segment */
/** @typedef {{ head: [number, number], segments: Segment[], sword?: Segment }} PoseFrame */

/** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {number} [width] @returns {Segment} */
const line = (x1, y1, x2, y2, width = 2) => ({ x1, y1, x2, y2, width })

/** @type {Record<string, { label: string, frames: PoseFrame[] }>} */
export const PRESETS = {
  walk: {
    label: 'Walk',
    frames: [
      {
        head: [16, 6],
        segments: [
          line(16, 9, 16, 18, 4),
          line(16, 11, 12, 15),
          line(16, 11, 20, 15),
          line(16, 18, 11, 29),
          line(16, 18, 21, 29),
        ],
      },
      {
        head: [16, 6],
        segments: [
          line(16, 9, 16, 18, 4),
          line(16, 11, 14, 16),
          line(16, 11, 18, 16),
          line(16, 18, 15, 29),
          line(16, 18, 18, 28),
        ],
      },
      {
        head: [16, 6],
        segments: [
          line(16, 9, 16, 18, 4),
          line(16, 11, 20, 15),
          line(16, 11, 12, 15),
          line(16, 18, 21, 29),
          line(16, 18, 11, 29),
        ],
      },
      {
        head: [16, 6],
        segments: [
          line(16, 9, 16, 18, 4),
          line(16, 11, 18, 16),
          line(16, 11, 14, 16),
          line(16, 18, 18, 28),
          line(16, 18, 15, 29),
        ],
      },
    ],
  },
  run: {
    label: 'Run',
    frames: [
      {
        head: [17, 6],
        segments: [
          line(17, 9, 15, 17, 4),
          line(16, 11, 20, 14),
          line(16, 11, 12, 13),
          line(15, 17, 9, 26),
          line(15, 17, 22, 29),
        ],
      },
      {
        head: [17, 6],
        segments: [
          line(17, 9, 15, 17, 4),
          line(16, 11, 19, 9),
          line(16, 11, 13, 15),
          line(15, 17, 12, 23),
          line(15, 17, 19, 24),
        ],
      },
      {
        head: [17, 6],
        segments: [
          line(17, 9, 15, 17, 4),
          line(16, 11, 22, 12),
          line(16, 11, 11, 15),
          line(15, 17, 21, 26),
          line(15, 17, 10, 29),
        ],
      },
      {
        head: [17, 6],
        segments: [
          line(17, 9, 15, 17, 4),
          line(16, 11, 18, 15),
          line(16, 11, 12, 10),
          line(15, 17, 13, 24),
          line(15, 17, 20, 22),
        ],
      },
    ],
  },
  attack: {
    label: 'Attack',
    frames: [
      {
        head: [16, 6],
        segments: [
          line(16, 9, 16, 18, 4),
          line(16, 11, 20, 7),
          line(16, 11, 13, 15),
          line(16, 18, 12, 29),
          line(16, 18, 20, 29),
        ],
        sword: line(20, 7, 26, 3),
      },
      {
        head: [16, 6],
        segments: [
          line(16, 9, 16, 18, 4),
          line(16, 11, 22, 13),
          line(16, 11, 12, 16),
          line(16, 18, 11, 29),
          line(16, 18, 21, 29),
        ],
        sword: line(22, 13, 30, 17),
      },
      {
        head: [16, 6],
        segments: [
          line(16, 9, 16, 18, 4),
          line(16, 11, 20, 17),
          line(16, 11, 13, 14),
          line(16, 18, 12, 29),
          line(16, 18, 20, 29),
        ],
        sword: line(20, 17, 27, 22),
      },
      {
        head: [16, 6],
        segments: [
          line(16, 9, 16, 18, 4),
          line(16, 11, 17, 16),
          line(16, 11, 14, 15),
          line(16, 18, 12, 29),
          line(16, 18, 20, 29),
        ],
        sword: line(17, 16, 24, 13),
      },
    ],
  },
}

export const PRESET_OPTIONS = Object.entries(PRESETS).map(([id, preset]) => ({
  id,
  label: preset.label,
}))

/** Tamanho de cada célula do spritesheet de preset. */
export const PRESET_CELL = 32

/** @param {CanvasRenderingContext2D} context @param {Segment} segment @param {string} color */
function drawSegment(context, segment, color) {
  context.strokeStyle = color
  context.lineWidth = segment.width ?? 2
  context.lineCap = 'square'
  context.beginPath()
  context.moveTo(segment.x1, segment.y1)
  context.lineTo(segment.x2, segment.y2)
  context.stroke()
}

/**
 * Cria o spritesheet de um preset (4 colunas × 1 linha, células 32x32) como
 * Data URL PNG.
 *
 * @param {'walk' | 'run' | 'attack'} name
 * @returns {string}
 */
export function createPresetSheet(name) {
  const preset = PRESETS[name]
  if (!preset) {
    throw new Error(`Preset de movimento desconhecido: ${name}`)
  }
  if (typeof document === 'undefined') {
    throw new Error('Os presets só podem ser gerados no navegador.')
  }

  const frames = preset.frames
  const canvas = document.createElement('canvas')
  canvas.width = PRESET_CELL * frames.length
  canvas.height = PRESET_CELL
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D indisponível para gerar o preset.')
  }
  context.clearRect(0, 0, canvas.width, canvas.height)

  frames.forEach((frame, index) => {
    context.save()
    context.translate(index * PRESET_CELL, 0)

    // Contorno escuro primeiro, para o sprite aparecer no fundo xadrez.
    frame.segments.forEach((segment) => {
      drawSegment(context, { ...segment, width: (segment.width ?? 2) + 2 }, BODY_DARK)
    })
    context.fillStyle = BODY_DARK
    context.fillRect(frame.head[0] - 4, frame.head[1] - 4, 8, 8)

    frame.segments.forEach((segment) => drawSegment(context, segment, BODY))
    context.fillStyle = BODY
    context.fillRect(frame.head[0] - 3, frame.head[1] - 3, 6, 6)

    if (frame.sword) {
      drawSegment(context, { ...frame.sword, width: 4 }, SWORD_DARK)
      drawSegment(context, frame.sword, SWORD)
    }

    context.restore()
  })

  return canvas.toDataURL('image/png')
}
