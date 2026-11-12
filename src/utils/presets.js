/**
 * Presets de referência de movimento — pixel art chibi simples, 4 frames cada.
 *
 * Estilo inspirado em sprites de personagem pequeno: cabeça proporcional,
 * corpo compacto, cores sólidas e contornos nítidos. Tudo é desenhado
 * proceduralmente no Canvas (sem arquivos binários).
 *
 * Cada preset tem 4 frames em uma única linha (4 colunas × 1 linha, 32×32 px).
 */

const C = {
  // Cores base
  skin: '#f5cac3',
  skinD: '#e3a893',
  hair: '#a67c52',
  hairD: '#8b5a3c',
  cloth: '#4a5568',
  clothL: '#718096',
  boot: '#2d3748',
  bootL: '#4a5568',
  eye: '#2d3748',
  mouth: '#744210',
  outline: '#1a202c',
  // Detalhes
  blush: '#feb2b2',
  white: '#f7fafc',
  grey: '#a0aec0',
}

/** @type {Record<string, { label: string, frames: Array<Array<{x:number,y:number,w:number,h:number,c:string}>> }>} */
export const PRESETS = {
  idle: {
    label: 'Idle',
    frames: [
      // Frame 1: parado, pé esquerdo levemente à frente
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 20, w: 3, h: 5, c: C.boot },
        { x: 19, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 25, w: 4, h: 2, c: C.bootL },
      ],
      // Frame 2: respiração (tronco levemente mais alto)
      [
        { x: 12, y: 2, w: 8, h: 7, c: C.hair },
        { x: 12, y: 9, w: 2, h: 2, c: C.skin },
        { x: 16, y: 9, w: 2, h: 2, c: C.skin },
        { x: 13, y: 10, w: 1, h: 1, c: C.eye },
        { x: 17, y: 10, w: 1, h: 1, c: C.eye },
        { x: 14, y: 12, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 11, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 16, w: 1, h: 3, c: C.skin },
        { x: 20, y: 16, w: 1, h: 3, c: C.skin },
        { x: 12, y: 16, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 19, w: 3, h: 5, c: C.boot },
        { x: 19, y: 19, w: 3, h: 5, c: C.boot },
        { x: 9, y: 24, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 24, w: 4, h: 2, c: C.bootL },
      ],
      // Frame 3: parado, pé direito levemente à frente
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 20, w: 3, h: 5, c: C.boot },
        { x: 19, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 25, w: 4, h: 2, c: C.bootL },
      ],
      // Frame 4: respiração (mesmo que frame 2)
      [
        { x: 12, y: 2, w: 8, h: 7, c: C.hair },
        { x: 12, y: 9, w: 2, h: 2, c: C.skin },
        { x: 16, y: 9, w: 2, h: 2, c: C.skin },
        { x: 13, y: 10, w: 1, h: 1, c: C.eye },
        { x: 17, y: 10, w: 1, h: 1, c: C.eye },
        { x: 14, y: 12, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 11, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 16, w: 1, h: 3, c: C.skin },
        { x: 20, y: 16, w: 1, h: 3, c: C.skin },
        { x: 12, y: 16, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 19, w: 3, h: 5, c: C.boot },
        { x: 19, y: 19, w: 3, h: 5, c: C.boot },
        { x: 9, y: 24, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 24, w: 4, h: 2, c: C.bootL },
      ],
    ],
  },
  walk: {
    label: 'Walk',
    frames: [
      // Frame 1: pé esquerdo para frente
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 9, y: 20, w: 3, h: 5, c: C.boot },
        { x: 20, y: 20, w: 3, h: 4, c: C.boot },
        { x: 8, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 20, y: 25, w: 4, h: 2, c: C.bootL },
      ],
      // Frame 2: pernas cruzadas no meio
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 20, w: 3, h: 5, c: C.boot },
        { x: 15, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 15, y: 25, w: 4, h: 2, c: C.bootL },
      ],
      // Frame 3: pé direito para frente
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 20, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 20, w: 3, h: 4, c: C.boot },
        { x: 20, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 8, y: 25, w: 4, h: 2, c: C.bootL },
      ],
      // Frame 4: volta ao centro
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 20, w: 3, h: 5, c: C.boot },
        { x: 19, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 25, w: 4, h: 2, c: C.bootL },
      ],
    ],
  },
  jump: {
    label: 'Jump',
    frames: [
      // Frame 1: agachamento (preparação)
      [
        { x: 12, y: 4, w: 8, h: 6, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 4, c: C.skin },
        { x: 20, y: 17, w: 1, h: 4, c: C.skin },
        { x: 12, y: 17, w: 8, h: 4, c: C.clothL },
        { x: 10, y: 21, w: 3, h: 4, c: C.boot },
        { x: 19, y: 21, w: 3, h: 4, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 25, w: 4, h: 2, c: C.bootL },
      ],
      // Frame 2: subida (pernas dobradas no ar)
      [
        { x: 12, y: 2, w: 8, h: 6, c: C.hair },
        { x: 12, y: 8, w: 2, h: 2, c: C.skin },
        { x: 16, y: 8, w: 2, h: 2, c: C.skin },
        { x: 13, y: 9, w: 1, h: 1, c: C.eye },
        { x: 17, y: 9, w: 1, h: 1, c: C.eye },
        { x: 14, y: 11, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 10, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 15, w: 1, h: 4, c: C.skin },
        { x: 20, y: 15, w: 1, h: 4, c: C.skin },
        { x: 12, y: 15, w: 8, h: 4, c: C.clothL },
        { x: 11, y: 19, w: 3, h: 4, c: C.boot },
        { x: 18, y: 19, w: 3, h: 4, c: C.boot },
        { x: 10, y: 23, w: 4, h: 2, c: C.bootL },
        { x: 18, y: 23, w: 4, h: 2, c: C.bootL },
      ],
      // Frame 3: no ar (pernas estendidas)
      [
        { x: 12, y: 1, w: 8, h: 6, c: C.hair },
        { x: 12, y: 7, w: 2, h: 2, c: C.skin },
        { x: 16, y: 7, w: 2, h: 2, c: C.skin },
        { x: 13, y: 8, w: 1, h: 1, c: C.eye },
        { x: 17, y: 8, w: 1, h: 1, c: C.eye },
        { x: 14, y: 10, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 9, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 14, w: 1, h: 4, c: C.skin },
        { x: 20, y: 14, w: 1, h: 4, c: C.skin },
        { x: 12, y: 14, w: 8, h: 4, c: C.clothL },
        { x: 10, y: 18, w: 3, h: 4, c: C.boot },
        { x: 19, y: 18, w: 3, h: 4, c: C.boot },
        { x: 9, y: 22, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 22, w: 4, h: 2, c: C.bootL },
      ],
      // Frame 4: pouso (joelhos levemente flexionados)
      [
        { x: 12, y: 3, w: 8, h: 6, c: C.hair },
        { x: 12, y: 9, w: 2, h: 2, c: C.skin },
        { x: 16, y: 9, w: 2, h: 2, c: C.skin },
        { x: 13, y: 10, w: 1, h: 1, c: C.eye },
        { x: 17, y: 10, w: 1, h: 1, c: C.eye },
        { x: 14, y: 12, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 11, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 16, w: 1, h: 4, c: C.skin },
        { x: 20, y: 16, w: 1, h: 4, c: C.skin },
        { x: 12, y: 16, w: 8, h: 4, c: C.clothL },
        { x: 10, y: 20, w: 3, h: 5, c: C.boot },
        { x: 19, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 25, w: 4, h: 2, c: C.bootL },
      ],
    ],
  },
  attack: {
    label: 'Attack',
    frames: [
      // Frame 1: preparação (braço para trás)
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 20, w: 3, h: 5, c: C.boot },
        { x: 19, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 10, y: 12, w: 3, h: 3, c: C.grey },
        { x: 13, y: 12, w: 2, h: 3, c: C.white },
      ],
      // Frame 2: golpe (braço estendido para frente)
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 20, w: 3, h: 5, c: C.boot },
        { x: 19, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 20, y: 12, w: 4, h: 3, c: C.grey },
        { x: 21, y: 12, w: 3, h: 3, c: C.white },
      ],
      // Frame 3: impacto (braço no meio do alvo)
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 20, w: 3, h: 5, c: C.boot },
        { x: 19, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 18, y: 12, w: 3, h: 3, c: C.grey },
        { x: 18, y: 12, w: 2, h: 3, c: C.white },
      ],
      // Frame 4: retorno (braço recolhendo)
      [
        { x: 12, y: 3, w: 8, h: 7, c: C.hair },
        { x: 12, y: 10, w: 2, h: 2, c: C.skin },
        { x: 16, y: 10, w: 2, h: 2, c: C.skin },
        { x: 13, y: 11, w: 1, h: 1, c: C.eye },
        { x: 17, y: 11, w: 1, h: 1, c: C.eye },
        { x: 14, y: 13, w: 2, h: 1, c: C.mouth },
        { x: 12, y: 12, w: 8, h: 5, c: C.cloth },
        { x: 11, y: 17, w: 1, h: 3, c: C.skin },
        { x: 20, y: 17, w: 1, h: 3, c: C.skin },
        { x: 12, y: 17, w: 8, h: 3, c: C.clothL },
        { x: 10, y: 20, w: 3, h: 5, c: C.boot },
        { x: 19, y: 20, w: 3, h: 5, c: C.boot },
        { x: 9, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 19, y: 25, w: 4, h: 2, c: C.bootL },
        { x: 11, y: 12, w: 3, h: 3, c: C.grey },
        { x: 13, y: 12, w: 2, h: 3, c: C.white },
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
 * Desenha um bloco de pixels com contorno escuro para dar definição de pixel art.
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
  context.strokeStyle = C.outline
  context.lineWidth = 1
  context.strokeRect(x, y, w, h)
}

/**
 * Cria o spritesheet de um preset (4 colunas × 1 linha, células 32x32) como
 * Data URL PNG.
 *
 * @param {'idle' | 'walk' | 'jump' | 'attack'} name
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

    // Sombra de projeção para dar volume
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
