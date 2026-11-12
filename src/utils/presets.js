/**
 * Presets de referência de movimento — desenhados com pixel art nítida.
 *
 * Em vez de stick figures finas, cada preset desenha um personagem pequeno
 * (~20x24 px dentro da célula 32x32) com contorno escuro, corpo, cabeça,
 * membros e (no ataque) uma arma. Tudo é gerado proceduralmente no Canvas,
 * sem depender de arquivos binários.
 *
 * Cada preset tem 4 frames em uma única linha (4 colunas × 1 linha).
 */

const PX = '#070a0f'      // contorno / fundo escuro
const SKIN = '#f5cac3'    // pele
const SKIN_D = '#e3a893'  // pele sombra
const HAIR = '#8b4a1a'    // cabelo castanho
const CLOTH = '#2c3e50'   // roupa escura
const CLOTH_L = '#5d6d7e' // roupa claro
const BOOT = '#4a231a'    // bota
const SWORD = '#fbbf24'   // espada
const SWORD_D = '#b7791f' // espada sombra

/** @type {Record<string, { label: string, frames: Array<Array<{x:number,y:number,w:number,h:number,c:string}>> }>} */
export const PRESETS = {
  walk: {
    label: 'Walk',
    frames: [
      // Frame 1: pé esquerdo para frente
      [
        { x: 12, y: 4, w: 8, h: 6, c: HAIR },   // cabelo
        { x: 13, y: 6, w: 2, h: 2, c: SKIN },   // rosto esquerdo
        { x: 15, y: 6, w: 2, h: 2, c: SKIN },   // rosto direito
        { x: 13, y: 10, w: 2, h: 1, c: PX },    // olho esquerdo
        { x: 15, y: 10, w: 2, h: 1, c: PX },    // olho direito
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH }, // tronco
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },  // braço esquerdo
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },  // braço direito
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },// cinto/quadril
        { x: 10, y: 18, w: 3, h: 6, c: BOOT },  // perna esquerda (para frente)
        { x: 19, y: 20, w: 3, h: 4, c: BOOT },  // perna direita (para trás)
        { x: 9, y: 24, w: 4, h: 2, c: BOOT },   // pé esquerdo
        { x: 19, y: 24, w: 4, h: 2, c: BOOT },  // pé direito
      ],
      // Frame 2: pernas cruzadas no meio
      [
        { x: 12, y: 4, w: 8, h: 6, c: HAIR },
        { x: 13, y: 6, w: 2, h: 2, c: SKIN },
        { x: 15, y: 6, w: 2, h: 2, c: SKIN },
        { x: 13, y: 10, w: 2, h: 1, c: PX },
        { x: 15, y: 10, w: 2, h: 1, c: PX },
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH },
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },
        { x: 11, y: 18, w: 3, h: 6, c: BOOT },
        { x: 16, y: 18, w: 3, h: 6, c: BOOT },
        { x: 10, y: 24, w: 4, h: 2, c: BOOT },
        { x: 16, y: 24, w: 4, h: 2, c: BOOT },
      ],
      // Frame 3: pé direito para frente
      [
        { x: 12, y: 4, w: 8, h: 6, c: HAIR },
        { x: 13, y: 6, w: 2, h: 2, c: SKIN },
        { x: 15, y: 6, w: 2, h: 2, c: SKIN },
        { x: 13, y: 10, w: 2, h: 1, c: PX },
        { x: 15, y: 10, w: 2, h: 1, c: PX },
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH },
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },
        { x: 19, y: 18, w: 3, h: 6, c: BOOT },
        { x: 10, y: 20, w: 3, h: 4, c: BOOT },
        { x: 19, y: 24, w: 4, h: 2, c: BOOT },
        { x: 9, y: 24, w: 4, h: 2, c: BOOT },
      ],
      // Frame 4: volta ao centro
      [
        { x: 12, y: 4, w: 8, h: 6, c: HAIR },
        { x: 13, y: 6, w: 2, h: 2, c: SKIN },
        { x: 15, y: 6, w: 2, h: 2, c: SKIN },
        { x: 13, y: 10, w: 2, h: 1, c: PX },
        { x: 15, y: 10, w: 2, h: 1, c: PX },
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH },
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },
        { x: 11, y: 18, w: 3, h: 6, c: BOOT },
        { x: 16, y: 18, w: 3, h: 6, c: BOOT },
        { x: 10, y: 24, w: 4, h: 2, c: BOOT },
        { x: 16, y: 24, w: 4, h: 2, c: BOOT },
      ],
    ],
  },
  run: {
    label: 'Run',
    frames: [
      // Frame 1: impulso inicial
      [
        { x: 11, y: 2, w: 10, h: 7, c: HAIR },  // cabelo para trás
        { x: 13, y: 5, w: 2, h: 2, c: SKIN },
        { x: 15, y: 5, w: 2, h: 2, c: SKIN },
        { x: 13, y: 9, w: 2, h: 1, c: PX },
        { x: 15, y: 9, w: 2, h: 1, c: PX },
        { x: 11, y: 10, w: 10, h: 4, c: CLOTH },
        { x: 10, y: 14, w: 2, h: 4, c: SKIN },  // braço esquerdo para trás
        { x: 20, y: 14, w: 2, h: 4, c: SKIN },  // braço direito para frente
        { x: 11, y: 14, w: 10, h: 4, c: CLOTH_L },
        { x: 10, y: 18, w: 3, h: 6, c: BOOT },  // perna esquerda para trás
        { x: 17, y: 16, w: 3, h: 6, c: BOOT },  // perna direita para frente
        { x: 9, y: 24, w: 4, h: 2, c: BOOT },
        { x: 17, y: 24, w: 4, h: 2, c: BOOT },
      ],
      // Frame 2: meio do passo
      [
        { x: 12, y: 2, w: 8, h: 6, c: HAIR },
        { x: 13, y: 5, w: 2, h: 2, c: SKIN },
        { x: 15, y: 5, w: 2, h: 2, c: SKIN },
        { x: 13, y: 9, w: 2, h: 1, c: PX },
        { x: 15, y: 9, w: 2, h: 1, c: PX },
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH },
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },
        { x: 11, y: 18, w: 3, h: 6, c: BOOT },
        { x: 16, y: 18, w: 3, h: 6, c: BOOT },
        { x: 10, y: 24, w: 4, h: 2, c: BOOT },
        { x: 16, y: 24, w: 4, h: 2, c: BOOT },
      ],
      // Frame 3: pouso
      [
        { x: 11, y: 3, w: 10, h: 6, c: HAIR },
        { x: 13, y: 6, w: 2, h: 2, c: SKIN },
        { x: 15, y: 6, w: 2, h: 2, c: SKIN },
        { x: 13, y: 10, w: 2, h: 1, c: PX },
        { x: 15, y: 10, w: 2, h: 1, c: PX },
        { x: 11, y: 11, w: 10, h: 4, c: CLOTH },
        { x: 10, y: 15, w: 2, h: 4, c: SKIN },
        { x: 20, y: 15, w: 2, h: 4, c: SKIN },
        { x: 11, y: 15, w: 10, h: 4, c: CLOTH_L },
        { x: 10, y: 19, w: 4, h: 5, c: BOOT },
        { x: 16, y: 19, w: 4, h: 5, c: BOOT },
        { x: 9, y: 24, w: 5, h: 2, c: BOOT },
        { x: 16, y: 24, w: 5, h: 2, c: BOOT },
      ],
      // Frame 4: próximo impulso
      [
        { x: 12, y: 2, w: 8, h: 6, c: HAIR },
        { x: 13, y: 5, w: 2, h: 2, c: SKIN },
        { x: 15, y: 5, w: 2, h: 2, c: SKIN },
        { x: 13, y: 9, w: 2, h: 1, c: PX },
        { x: 15, y: 9, w: 2, h: 1, c: PX },
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH },
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },
        { x: 17, y: 18, w: 3, h: 6, c: BOOT },
        { x: 10, y: 20, w: 3, h: 4, c: BOOT },
        { x: 17, y: 24, w: 4, h: 2, c: BOOT },
        { x: 9, y: 24, w: 4, h: 2, c: BOOT },
      ],
    ],
  },
  attack: {
    label: 'Attack',
    frames: [
      // Frame 1: preparação (espada para trás)
      [
        { x: 12, y: 3, w: 8, h: 6, c: HAIR },
        { x: 13, y: 5, w: 2, h: 2, c: SKIN },
        { x: 15, y: 5, w: 2, h: 2, c: SKIN },
        { x: 13, y: 9, w: 2, h: 1, c: PX },
        { x: 15, y: 9, w: 2, h: 1, c: PX },
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH },
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },
        { x: 10, y: 18, w: 3, h: 6, c: BOOT },
        { x: 17, y: 18, w: 3, h: 6, c: BOOT },
        { x: 9, y: 24, w: 4, h: 2, c: BOOT },
        { x: 17, y: 24, w: 4, h: 2, c: BOOT },
        { x: 21, y: 12, w: 5, h: 2, c: SWORD_D },
        { x: 21, y: 11, w: 5, h: 2, c: SWORD },
      ],
      // Frame 2: golpe (espada no ar)
      [
        { x: 12, y: 3, w: 8, h: 6, c: HAIR },
        { x: 13, y: 5, w: 2, h: 2, c: SKIN },
        { x: 15, y: 5, w: 2, h: 2, c: SKIN },
        { x: 13, y: 9, w: 2, h: 1, c: PX },
        { x: 15, y: 9, w: 2, h: 1, c: PX },
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH },
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },
        { x: 10, y: 19, w: 3, h: 5, c: BOOT },
        { x: 17, y: 19, w: 3, h: 5, c: BOOT },
        { x: 9, y: 24, w: 4, h: 2, c: BOOT },
        { x: 17, y: 24, w: 4, h: 2, c: BOOT },
        { x: 22, y: 8, w: 2, h: 8, c: SWORD_D },
        { x: 21, y: 7, w: 2, h: 8, c: SWORD },
        { x: 20, y: 6, w: 2, h: 2, c: SWORD_D },
        { x: 19, y: 5, w: 2, h: 2, c: SWORD },
      ],
      // Frame 3: impacto (espada na frente)
      [
        { x: 12, y: 3, w: 8, h: 6, c: HAIR },
        { x: 13, y: 5, w: 2, h: 2, c: SKIN },
        { x: 15, y: 5, w: 2, h: 2, c: SKIN },
        { x: 13, y: 9, w: 2, h: 1, c: PX },
        { x: 15, y: 9, w: 2, h: 1, c: PX },
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH },
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },
        { x: 11, y: 18, w: 3, h: 6, c: BOOT },
        { x: 16, y: 18, w: 3, h: 6, c: BOOT },
        { x: 10, y: 24, w: 4, h: 2, c: BOOT },
        { x: 16, y: 24, w: 4, h: 2, c: BOOT },
        { x: 13, y: 11, w: 6, h: 2, c: SWORD_D },
        { x: 12, y: 10, w: 6, h: 2, c: SWORD },
      ],
      // Frame 4: retorno (espada recolhendo)
      [
        { x: 12, y: 3, w: 8, h: 6, c: HAIR },
        { x: 13, y: 5, w: 2, h: 2, c: SKIN },
        { x: 15, y: 5, w: 2, h: 2, c: SKIN },
        { x: 13, y: 9, w: 2, h: 1, c: PX },
        { x: 15, y: 9, w: 2, h: 1, c: PX },
        { x: 12, y: 10, w: 8, h: 4, c: CLOTH },
        { x: 11, y: 14, w: 1, h: 4, c: SKIN },
        { x: 20, y: 14, w: 1, h: 4, c: SKIN },
        { x: 12, y: 14, w: 8, h: 4, c: CLOTH_L },
        { x: 10, y: 18, w: 3, h: 6, c: BOOT },
        { x: 17, y: 18, w: 3, h: 6, c: BOOT },
        { x: 9, y: 24, w: 4, h: 2, c: BOOT },
        { x: 17, y: 24, w: 4, h: 2, c: BOOT },
        { x: 21, y: 12, w: 4, h: 2, c: SWORD_D },
        { x: 21, y: 11, w: 4, h: 2, c: SWORD },
      ],
    ],
  },
}

export const PRESET_OPTIONS = Object.entries(PRESETS).map(([id, preset]) => ({
  id,
  label: preset.label,
}))

/** Tamanho de cada célula do spritesheet de preset. */
export const PRESET_CELL = 32

/**
 * Desenha um "bloco" de pixels (retângulo preenchido) com contorno escuro
 * para dar definição de pixel art.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} color
 */
function drawBlock(context, x, y, w, h, color) {
  context.fillStyle = color
  context.fillRect(x, y, w, h)
  // Contorno nítido em volta de cada bloco para definir forma
  context.strokeStyle = PX
  context.lineWidth = 1
  context.strokeRect(x, y, w, h)
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
  context.imageSmoothingEnabled = false

  frames.forEach((frame, index) => {
    context.save()
    context.translate(index * PRESET_CELL, 0)

    // Sombra de projeção para dar volume (deslocada 1px)
    frame.forEach((block) => {
      if (block.x + block.w <= 31 && block.y + block.h <= 31) {
        context.fillStyle = '#020406'
        context.fillRect(block.x + 1, block.y + 1, block.w, block.h)
      }
    })

    // Corpo principal
    frame.forEach((block) => {
      drawBlock(context, block.x, block.y, block.w, block.h, block.c)
    })

    context.restore()
  })

  return canvas.toDataURL('image/png')
}
