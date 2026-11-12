import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react'

import ApiConfigPanel from './dashboard/ApiConfigPanel'
import CorrectionPanel from './dashboard/CorrectionPanel'
import ExportPanel from './dashboard/ExportPanel'
import FrameEditModal from './FrameEditModal'
import PreviewPanel from './dashboard/PreviewPanel'
import ReferencePanel from './dashboard/ReferencePanel'
import {
  DEFAULT_ART_STYLE,
  DEFAULT_PROVIDER,
  MAX_PREVIOUS_FRAMES,
  MAX_REFERENCE_FRAMES,
  MAX_TOTAL_BASE64_CHARS,
  countBase64Chars,
  describeApiError,
  generateSprites,
  listModels,
} from '../lib/api'
import {
  compileSpritesheetGrid,
  detectSpriteGrid,
  downloadDataUrl,
  exportGIF,
  sliceSpritesheet,
} from '../utils/imagePipeline'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_REFERENCE_SIDE = 1200

/** Garante que o conjunto de imagens caiba no limite da Vercel. */
function ensurePayloadSize(dataUrls) {
  const chars = countBase64Chars(dataUrls)
  if (chars > MAX_TOTAL_BASE64_CHARS) {
    const megabytes = (chars / 1_000_000).toFixed(1)
    throw new Error(
      `As imagens somam ${megabytes} MB em Base64 e passam do limite de ~4,5 MB da Vercel. ` +
        'Reduza a resolução, a quantidade de frames ou desative o auto-fatiar.',
    )
  }
}

/**
 * Lê um arquivo de imagem, redimensiona se for grande demais e devolve a Data
 * URL com as dimensões reais.
 *
 * @param {File} file
 * @returns {Promise<{ dataUrl: string, width: number, height: number, resized: boolean }>}
 */
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type).startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem (PNG, WebP, GIF ou JPEG).'))
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error('A imagem tem mais de 8 MB. Reduza o arquivo antes de enviar.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo escolhido.'))
    reader.onload = () => {
      const originalUrl = String(reader.result || '')
      const image = new Image()
      image.onerror = () => reject(new Error('O arquivo escolhido não é uma imagem válida.'))
      image.onload = () => {
        const width = image.naturalWidth || image.width
        const height = image.naturalHeight || image.height
        const largestSide = Math.max(width, height)

        if (largestSide <= MAX_REFERENCE_SIDE) {
          resolve({
            dataUrl: originalUrl,
            width,
            height,
            sourceWidth: width,
            sourceHeight: height,
            resized: false,
          })
          return
        }

        // Fotos enormes são reduzidas para caber no limite da Vercel.
        const scale = MAX_REFERENCE_SIDE / largestSide
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('Canvas 2D indisponível para redimensionar a imagem.'))
          return
        }
        context.imageSmoothingEnabled = false
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
          sourceWidth: width,
          height: canvas.height,
          resized: true,
        })
      }
      image.src = originalUrl
    }
    reader.readAsDataURL(file)
  })
}

/** @typedef {string | Blob | File | HTMLImageElement | HTMLCanvasElement | ImageBitmap} ImageSource */

const TOAST_STYLES = {
  success: {
    icon: CheckCircle2,
    box: 'border-emerald-400/30 bg-[#0c1b16]/95 text-emerald-100',
  },
  error: {
    icon: XCircle,
    box: 'border-rose-500/30 bg-[#1b0e12]/95 text-rose-100',
  },
  warning: {
    icon: AlertTriangle,
    box: 'border-amber-400/30 bg-[#1b1508]/95 text-amber-100',
  },
  info: {
    icon: Info,
    box: 'border-sky-400/30 bg-[#0a1520]/95 text-sky-100',
  },
}

/**
 * @param {{ toasts: Array<{ id: number, message: string, tone: keyof typeof TOAST_STYLES }>, onDismiss: (id: number) => void }} props
 */
function ToastStack({ toasts, onDismiss }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const tone = TOAST_STYLES[toast.tone] ?? TOAST_STYLES.info
        const Icon = tone.icon
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed shadow-2xl shadow-black/50 backdrop-blur ${tone.box}`}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded p-0.5 opacity-60 transition hover:bg-white/10 hover:opacity-100"
              aria-label="Fechar aviso"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default function MainDashboard() {
  /* ------------------------------- BYOK ---------------------------------- */
  const [provider, setProvider] = useState(DEFAULT_PROVIDER)
  const [apiKey, setApiKey] = useState('')
  const [keyStatus, setKeyStatus] = useState('idle')
  const [keyError, setKeyError] = useState('')
  const [models, setModels] = useState([])
  const [modelsWarning, setModelsWarning] = useState(null)
  const [modelId, setModelId] = useState('')

  /* --------------------------- Referência ------------------------------- */
  const [reference, setReference] = useState(null)
  // Grade real da imagem de referência (detectada nos pixels). É ELA que define
  // quantos frames a IA deve gerar. Os campos Colunas/Linhas do painel central
  // recortam tanto a referência quanto o resultado.
  const [referenceGrid, setReferenceGrid] = useState({
    columns: 1,
    rows: 1,
    total: 1,
  })
  const [columns, setColumns] = useState('1')
  const [rows, setRows] = useState('1')
  const [autoSlice, setAutoSlice] = useState(false)
  const [referenceFrames, setReferenceFrames] = useState([])
  const [referenceBusy, setReferenceBusy] = useState(false)
  const [referenceError, setReferenceError] = useState('')

  /* ----------------------------- Prompts -------------------------------- */
  const [appearance, setAppearance] = useState('')
  const [artStyle, setArtStyle] = useState(DEFAULT_ART_STYLE)

  /* --------------------------- Geração ---------------------------------- */
  // Spritesheets brutos devolvidos pela IA (sem fatiar). Ficam guardados para
  // recalcular os frames quando o usuário muda Colunas/Linhas, sem precisar
  // gerar novamente e sem apagar o resultado.
  const [generatedSheets, setGeneratedSheets] = useState([])
  const [frames, setFrames] = useState([])
  const [slicingResult, setSlicingResult] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')

  /* ----------------------------- Player --------------------------------- */
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [viewMode, setViewMode] = useState('loop') // 'loop' | 'frame-by-frame'
  const [fps, setFps] = useState(8)

  /* --------------------------- Correção --------------------------------- */
  const [correctionPrompt, setCorrectionPrompt] = useState('')
  const [correctionFrame, setCorrectionFrame] = useState(null)
  const [correcting, setCorrecting] = useState(false)
  const [correctionError, setCorrectionError] = useState('')

  /* --------------------------- Exportação ------------------------------- */
  const [exportColumns, setExportColumns] = useState('4')
  const [exporting, setExporting] = useState(null)

  /* --------------------------- Modal de Edição -------------------------- */
  const [modalOpen, setModalOpen] = useState(false)
  const [modalFrameIndex, setModalFrameIndex] = useState(null)
  const [modalPrompt, setModalPrompt] = useState('')
  const [modalPreviewFrame, setModalPreviewFrame] = useState(null)
  const [modalApplyingSingle, setModalApplyingSingle] = useState(false)
  const [modalApplyingAll, setModalApplyingAll] = useState(false)

  /* ----------------------------- Avisos --------------------------------- */
  const [elapsed, setElapsed] = useState(0)
  const [toasts, setToasts] = useState([])
  const toastId = useRef(0)

  const pushToast = useCallback((message, tone = 'info') => {
    const id = toastId.current + 1
    toastId.current = id
    setToasts((current) => [...current.slice(-3), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 6500)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  /* ------------------ Fatiamento da referência -------------------------- */
  useEffect(() => {
    if (!reference?.dataUrl) {
      setReferenceFrames([])
      setReferenceError('')
      return undefined
    }

    // Os mesmos campos Colunas/Linhas do painel central recortam a referência
    // antiga e o resultado novo, para a comparação ficar alinhada.
    const parsedColumns = Number.parseInt(columns, 10)
    const parsedRows = Number.parseInt(rows, 10)
    const gridColumns = autoSlice ? parsedColumns : 1
    const gridRows = autoSlice ? parsedRows : 1

    if (
      !Number.isInteger(gridColumns) ||
      !Number.isInteger(gridRows) ||
      gridColumns < 1 ||
      gridRows < 1 ||
      gridColumns > 64 ||
      gridRows > 64
    ) {
      setReferenceFrames([reference.dataUrl])
      setReferenceError('Informe colunas e linhas entre 1 e 64 para fatiar a grade.')
      return undefined
    }

    let cancelled = false
    ;(async () => {
      setReferenceBusy(true)
      setReferenceError('')
      try {
        const sliced = await sliceSpritesheet(reference.dataUrl, gridColumns, gridRows)
        if (cancelled) return
        if (sliced.length === 0) throw new Error('A grade não gerou nenhum frame.')
        setReferenceFrames(sliced)
      } catch (error) {
        if (cancelled) return
        // Falhou o recorte? Usa a imagem inteira como uma única referência.
        setReferenceFrames([reference.dataUrl])
        setReferenceError(describeApiError(error))
      } finally {
        if (!cancelled) setReferenceBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [reference, autoSlice, columns, rows])

  /* ------------------ Fatiamento do resultado gerado --------------------- */
  // O spritesheet devolvido pela IA é guardado inteiro. Sempre que a grade
  // (colunas/linhas) mudar, os frames são recalculados a partir dele — a
  // imagem nunca é apagada só por ajustar a grade.
  useEffect(() => {
    let cancelled = false

    if (generatedSheets.length === 0) {
      setFrames([])
      setSlicingResult(false)
      return undefined
    }

    const gridColumns = Math.max(1, Number.parseInt(columns, 10) || 1)
    const gridRows = Math.max(1, Number.parseInt(rows, 10) || 1)
    const isSingleImage = gridColumns === 1 && gridRows === 1
    const shouldSlice =
      autoSlice && generatedSheets.length === 1 && !isSingleImage

    if (!shouldSlice) {
      setFrames(generatedSheets)
      setSlicingResult(false)
      return undefined
    }

    setSlicingResult(true)
    ;(async () => {
      try {
        const sliced = await sliceSpritesheet(
          generatedSheets[0],
          gridColumns,
          gridRows,
        )
        if (cancelled) return
        setFrames(sliced.length > 0 ? sliced : generatedSheets)
      } catch (error) {
        if (cancelled) return
        console.error('[slice-result]', error)
        setFrames(generatedSheets)
      } finally {
        if (!cancelled) setSlicingResult(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [generatedSheets, autoSlice, columns, rows])

  /* --------------------------- Playback --------------------------------- */
  useEffect(() => {
    if (viewMode !== 'loop') return undefined
    const interval = Math.max(40, Math.round(1000 / Math.max(1, fps)))
    const id = window.setInterval(() => {
      const total = Math.max(referenceFrames.length, frames.length)
      if (total === 0) return
      setCurrentFrameIndex((value) => (value + 1) % total)
    }, interval)
    return () => window.clearInterval(id)
  }, [viewMode, fps, referenceFrames.length, frames.length])

  /* -------------------- Limpeza ao mudar inputs da coluna esquerda -------------------- */
  useEffect(() => {
    if (frames.length === 0) return
    // Qualquer alteração nos inputs de configuração invalida a geração anterior,
    // forçando o usuário a regenerar do zero com os novos parâmetros.
    setGeneratedSheets([])
    setFrames([])
    setCorrectionFrame(null)
    setCorrectionPrompt('')
    setCurrentFrameIndex(0)
    setModalOpen(false)
  }, [provider, modelId, appearance, artStyle, reference])

  /* ------------------------ Cronômetro ---------------------------------- */
  useEffect(() => {
    if (!generating && !correcting) {
      setElapsed(0)
      return undefined
    }
    setElapsed(0)
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [generating, correcting])

  /* ---------------------------- Handlers -------------------------------- */
  const handleProviderChange = useCallback((nextProvider) => {
    setProvider(nextProvider)
    setModels([])
    setModelId('')
    setModelsWarning(null)
    setKeyStatus('idle')
    setKeyError('')
  }, [])

  const handleValidateKey = useCallback(async () => {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      setKeyStatus('error')
      setKeyError('Informe sua chave de API antes de validar.')
      return
    }

    setKeyStatus('validating')
    setKeyError('')
    setModels([])
    setModelId('')
    setModelsWarning(null)

    try {
      const result = await listModels({ provider, apiKey: trimmedKey })
      setModels(result.models)
      setModelsWarning(result.warning)
      const preferred =
        result.models.find((model) => model.supports_reference_images !== false) ??
        result.models[0]
      setModelId((current) => {
        const stillThere = result.models.some((model) => model.id === current)
        return stillThere ? current : preferred?.id || ''
      })
      setKeyStatus('valid')
      pushToast(
        `Chave validada: ${result.models.length} modelo${result.models.length === 1 ? '' : 's'} disponíve${result.models.length === 1 ? 'l' : 'is'}.`,
        'success',
      )
    } catch (error) {
      setKeyStatus('error')
      setKeyError(describeApiError(error))
      pushToast(describeApiError(error), 'error')
      console.error('[models]', error)
    }
  }, [apiKey, provider, pushToast])

  const handleFileSelected = useCallback(
    async (file) => {
      try {
        const image = await readImageFile(file)

        // Detecta nos pixels a grade real da spritesheet (ex.: 4×4 = 16 frames).
        // É esse total que a IA deve gerar e também o recorte inicial da
        // referência e do resultado no painel central.
        let detected = { columns: 1, rows: 1, total: 1 }
        try {
          detected = await detectSpriteGrid(image.dataUrl)
        } catch (error) {
          console.warn('[detect-grid]', error)
        }

        const total = detected.columns * detected.rows
        setReference({
          dataUrl: image.dataUrl,
          width: image.width,
          height: image.height,
          name: file.name,
          size: file.size,
          kind: 'file',
        })
        setReferenceGrid({
          columns: detected.columns,
          rows: detected.rows,
          total,
        })
        // A grade do meio começa igual à grade real da referência.
        setColumns(String(detected.columns))
        setRows(String(detected.rows))
        setAutoSlice(total > 1)
        setReferenceError('')

        if (total > 1) {
          pushToast(
            `Grade detectada: ${detected.columns}×${detected.rows} (${total} frames).`,
            'info',
          )
        } else {
          pushToast(
            'Nenhuma grade detectada: a imagem será tratada como 1 frame. ' +
              'Ajuste os campos da referência se necessário.',
            'warning',
          )
        }

        if (image.resized) {
          pushToast(
            `Imagem redimensionada para ${image.width}×${image.height} px para caber no limite.`,
            'info',
          )
        }
      } catch (error) {
        pushToast(describeApiError(error), 'error')
      }
    },
    [pushToast],
  )

  const handleClearReference = useCallback(() => {
    setReference(null)
    setReferenceFrames([])
    setReferenceGrid({ columns: 1, rows: 1, total: 1 })
    setColumns('1')
    setRows('1')
    setAutoSlice(false)
    setReferenceError('')
  }, [])

  const canGenerate = Boolean(
    apiKey.trim() &&
      modelId &&
      referenceFrames.length > 0 &&
      appearance.trim() &&
      artStyle.trim() &&
      !generating,
  )

  const generateHint = useMemo(() => {
    if (!apiKey.trim()) return 'Informe e valide sua chave de API para começar.'
    if (!modelId) return 'Valide a chave e escolha um modelo de imagem.'
    if (referenceFrames.length === 0) return 'Envie uma referência de movimento.'
    if (!appearance.trim()) return 'Descreva a aparência do personagem.'
    if (!artStyle.trim()) return 'Defina o estilo de arte.'
    return `Pronto para gerar ${referenceGrid.total ?? referenceGrid.columns * referenceGrid.rows} frame(s) — grade ${referenceGrid.columns}×${referenceGrid.rows}.`
  }, [apiKey, modelId, referenceFrames, referenceGrid, appearance, artStyle])

  const handleGenerate = useCallback(async () => {
    try {
      if (generating) return
      if (!canGenerate) {
        pushToast(generateHint, 'warning')
        return
      }

      // A referência é enviada INTEIRA para a IA (spritesheet completa ou imagem única).
      // Não fatiamos no frontend antes de enviar: a divisão em grid acontece
      // apenas no frontend para exibição nos frames lado a lado e filmstrip.
      const referenceImage = reference?.dataUrl ? [reference.dataUrl] : []

      // Quantidade de frames que a IA deve desenhar: vem da grade REAL da
      // referência (detectada nos pixels), nunca dos campos de exibição.
      const referenceTotal =
        Number(referenceGrid.total) ||
        (Number(referenceGrid.columns) || 1) * (Number(referenceGrid.rows) || 1)
      const requestedFrameCount = Math.max(
        1,
        Math.min(64, Math.floor(referenceTotal) || 1),
      )
      // O formato pedido à IA é a própria grade detectada na referência, para
      // que a grade do meio recorte referência e resultado da mesma forma.
      const requestedGrid = {
        columns: Math.max(1, Math.min(64, Number(referenceGrid.columns) || 1)),
        rows: Math.max(1, Math.min(64, Number(referenceGrid.rows) || 1)),
      }

      try {
        ensurePayloadSize(referenceImage)
      } catch (error) {
        pushToast(describeApiError(error), 'error')
        return
      }

      // O botão de gerar sempre começa um trabalho novo: limpa o histórico.
      setGenerating(true)
      setGenerationError('')
      setCorrectionError('')
      setGeneratedSheets([])
      setFrames([])
      setCorrectionFrame(null)
      setCorrectionPrompt('')
      setCurrentFrameIndex(0)
      setModalOpen(false)

      let result
      try {
        result = await generateSprites({
          provider,
          apiKey: apiKey.trim(),
          modelId,
          referenceImages: referenceImage,
          characterAppearance: appearance.trim(),
          artStyle: artStyle.trim(),
          frameCount: requestedFrameCount,
          gridColumns: requestedGrid.columns,
          gridRows: requestedGrid.rows,
        })
      } catch (apiError) {
        const message = describeApiError(apiError)
        setGenerationError(message)
        pushToast(message, 'error')
        console.error('[generate api]', apiError)
        setGenerating(false)
        setFrames([])
        return
      }

      if (!result || !Array.isArray(result.images)) {
        setGenerating(false)
        setFrames([])
        const message = 'A API não retornou um resultado válido.'
        setGenerationError(message)
        pushToast(message, 'error')
        return
      }

      if (result.images.length === 0) {
        setGenerating(false)
        setFrames([])
        const message = 'A IA não retornou nenhuma imagem. Tente outro modelo ou prompt.'
        setGenerationError(message)
        pushToast(message, 'error')
        return
      }

      // Guarda o spritesheet inteiro. O efeito de fatiamento acima recalcula
      // os frames sempre que a grade mudar, sem precisar gerar de novo.
      //
      // A grade pedida à IA pode não ser respeitada: detectamos a grade REAL da
      // imagem devolvida e usamos ela para recortar. Assim os frames continuam
      // corretos mesmo se o modelo entregar outra organização.
      let displayGrid = requestedGrid
      if (result.images.length === 1 && requestedFrameCount > 1) {
        try {
          const detected = await detectSpriteGrid(result.images[0])
          if (detected.total === requestedFrameCount) {
            displayGrid = { columns: detected.columns, rows: detected.rows }
          }
        } catch (detectError) {
          console.warn('[detect-result-grid]', detectError)
        }
      }

      setGeneratedSheets(result.images)
      // Sincroniza o recorte com a grade real da imagem devolvida.
      setColumns(String(displayGrid.columns))
      setRows(String(displayGrid.rows))
      setAutoSlice(requestedFrameCount > 1)
      setExportColumns(String(Math.min(4, requestedFrameCount)))
      pushToast(
        `Spritesheet recebido com ${requestedFrameCount} frame${requestedFrameCount === 1 ? '' : 's'} esperado${requestedFrameCount === 1 ? '' : 's'}.`,
        'success',
      )
    } catch (error) {
      const message = describeApiError(error)
      setGenerationError(message)
      pushToast(message, 'error')
      console.error('[generate]', error)
      setGenerating(false)
      setFrames([])
    } finally {
      setGenerating(false)
    }
  }, [
    apiKey,
    appearance,
    artStyle,
    canGenerate,
    generateHint,
    generating,
    modelId,
    provider,
    pushToast,
    reference,
    referenceGrid,
  ])

  const handleEditFrame = useCallback((index) => {
    setCorrectionError('')
    setCurrentFrameIndex(index)
    setModalOpen(true)
    setModalFrameIndex(index)
    setModalPrompt('')
    setModalPreviewFrame(null)
  }, [])

  const handleApplyCorrection = useCallback(async () => {
    if (correcting || frames.length === 0) return
    if (!correctionPrompt.trim()) {
      pushToast('Escreva a instrução de correção antes de aplicar.', 'warning')
      return
    }
    if (!apiKey.trim() || !modelId) {
      pushToast('Valide a chave e escolha um modelo antes de corrigir.', 'warning')
      return
    }

    const previousImages = frames.slice(0, MAX_PREVIOUS_FRAMES)
    const targetFrameIndex =
      correctionFrame !== null && correctionFrame < previousImages.length
        ? correctionFrame
        : null

    if (correctionFrame !== null && targetFrameIndex === null) {
      pushToast(
        `A correção individual aceita até ${MAX_PREVIOUS_FRAMES} frames. Use a correção em lote.`,
        'error',
      )
      return
    }

    try {
      ensurePayloadSize([
        ...previousImages,
        ...referenceFrames.slice(0, MAX_REFERENCE_FRAMES),
      ])
    } catch (error) {
      pushToast(describeApiError(error), 'error')
      return
    }

    setCorrecting(true)
    setCorrectionError('')

    try {
      const result = await generateSprites({
        provider,
        apiKey: apiKey.trim(),
        modelId,
        referenceImages: referenceFrames.slice(0, MAX_REFERENCE_FRAMES),
        characterAppearance: appearance.trim(),
        artStyle: artStyle.trim(),
        previousImages,
        correctionPrompt: correctionPrompt.trim(),
        targetFrameIndex,
      })

      if (result.images.length === 0) {
        throw new Error('A IA não retornou nenhuma imagem corrigida. Tente novamente.')
      }

      if (result.targetFrameIndex !== null) {
        const index = result.targetFrameIndex
        setFrames((current) =>
          current.map((frame, position) =>
            position === index ? result.images[0] : frame,
          ),
        )
        pushToast(`Frame #${index + 1} corrigido sem alterar os demais.`, 'success')
      } else {
        setFrames((current) => {
          if (result.images.length === current.length) return result.images
          // Resposta parcial: mantém os frames que a IA não devolveu.
          return current.map((frame, position) => result.images[position] ?? frame)
        })
        pushToast(
          `${result.images.length} frame${result.images.length === 1 ? '' : 's'} corrigido${result.images.length === 1 ? '' : 's'} em lote.`,
          'success',
        )
      }

      setCorrectionPrompt('')
      setCorrectionFrame(null)
    } catch (error) {
      const message = describeApiError(error)
      setCorrectionError(message)
      pushToast(message, 'error')
      console.error('[correction]', error)
    } finally {
      setCorrecting(false)
    }
  }, [
    apiKey,
    appearance,
    artStyle,
    correcting,
    correctionFrame,
    correctionPrompt,
    frames,
    modelId,
    provider,
    pushToast,
    referenceFrames,
  ])

  /* --------------------------- Modal: correção individual -------------------------- */
  const handleModalApplySingle = useCallback(async () => {
    if (
      modalApplyingSingle ||
      modalApplyingAll ||
      modalFrameIndex === null ||
      frames.length === 0
    )
      return
    if (!modalPrompt.trim()) {
      pushToast('Escreva a instrução de correção antes de aplicar.', 'warning')
      return
    }
    if (!apiKey.trim() || !modelId) {
      pushToast('Valide a chave e escolha um modelo antes de corrigir.', 'warning')
      return
    }

    const index = modalFrameIndex
    const previousImages = [frames[index]]
    const referenceImages = referenceFrames.slice(0, MAX_REFERENCE_FRAMES)

    try {
      ensurePayloadSize([...previousImages, ...referenceImages])
    } catch (error) {
      pushToast(describeApiError(error), 'error')
      return
    }

    setModalApplyingSingle(true)
    setCorrectionError('')

    try {
      const result = await generateSprites({
        provider,
        apiKey: apiKey.trim(),
        modelId,
        referenceImages,
        characterAppearance: appearance.trim(),
        artStyle: artStyle.trim(),
        previousImages,
        correctionPrompt: modalPrompt.trim(),
        targetFrameIndex: index,
      })

      if (result.images.length === 0) {
        throw new Error(
          'A IA não retornou nenhuma imagem corrigida. Tente novamente.',
        )
      }

      setFrames((current) =>
        current.map((frame, position) =>
          position === index ? result.images[0] : frame,
        ),
      )
      setModalPreviewFrame(result.images[0])
      setModalPrompt('')
      pushToast(
        `Frame #${index + 1} corrigido sem alterar os demais.`,
        'success',
      )
    } catch (error) {
      const message = describeApiError(error)
      setCorrectionError(message)
      pushToast(message, 'error')
      console.error('[modal single correction]', error)
    } finally {
      setModalApplyingSingle(false)
    }
  }, [
    apiKey,
    appearance,
    artStyle,
    modalApplyingAll,
    modalApplyingSingle,
    modalFrameIndex,
    modalPrompt,
    frames,
    modelId,
    provider,
    pushToast,
    referenceFrames,
  ])

  /* --------------------------- Modal: correção em lote -------------------------- */
  const handleModalApplyAll = useCallback(async () => {
    if (
      modalApplyingAll ||
      modalApplyingSingle ||
      frames.length === 0
    )
      return
    if (!modalPrompt.trim()) {
      pushToast('Escreva a instrução de correção antes de aplicar.', 'warning')
      return
    }
    if (!apiKey.trim() || !modelId) {
      pushToast('Valide a chave e escolha um modelo antes de corrigir.', 'warning')
      return
    }

    const previousImages = frames.slice(0, MAX_PREVIOUS_FRAMES)
    const referenceImages = referenceFrames.slice(0, MAX_REFERENCE_FRAMES)

    try {
      ensurePayloadSize([...previousImages, ...referenceImages])
    } catch (error) {
      pushToast(describeApiError(error), 'error')
      return
    }

    setModalApplyingAll(true)
    setCorrectionError('')

    try {
      const result = await generateSprites({
        provider,
        apiKey: apiKey.trim(),
        modelId,
        referenceImages,
        characterAppearance: appearance.trim(),
        artStyle: artStyle.trim(),
        previousImages,
        correctionPrompt: modalPrompt.trim(),
        targetFrameIndex: null,
      })

      if (result.images.length === 0) {
        throw new Error(
          'A IA não retornou nenhuma imagem corrigida. Tente novamente.',
        )
      }

      setFrames((current) => {
        if (result.images.length === current.length) return result.images
        // Resposta parcial: mantém os frames que a IA não devolveu.
        return current.map((frame, position) => result.images[position] ?? frame)
      })
      setModalPreviewFrame(result.images[0] ?? null)
      setModalPrompt('')
      pushToast(
        `${result.images.length} frame${result.images.length === 1 ? '' : 's'} corrigido${result.images.length === 1 ? '' : 's'} em lote.`,
        'success',
      )
    } catch (error) {
      const message = describeApiError(error)
      setCorrectionError(message)
      pushToast(message, 'error')
      console.error('[modal batch correction]', error)
    } finally {
      setModalApplyingAll(false)
    }
  }, [
    apiKey,
    appearance,
    artStyle,
    modalApplyingAll,
    modalApplyingSingle,
    modalPrompt,
    frames,
    modelId,
    provider,
    pushToast,
    referenceFrames,
  ])

  const handleExportGrid = useCallback(async () => {
    if (frames.length === 0 || exporting) return
    setExporting('grid')
    try {
      const parsed = Number.parseInt(exportColumns, 10)
      const gridColumns = Math.min(
        Math.max(1, Number.isInteger(parsed) ? parsed : 4),
        frames.length,
      )
      const sheet = await compileSpritesheetGrid(frames, gridColumns)
      downloadDataUrl(sheet, `spritetransfer-spritesheet-${frames.length}f.png`)
      pushToast('Spritesheet PNG exportada.', 'success')
    } catch (error) {
      pushToast(describeApiError(error), 'error')
      console.error('[export-grid]', error)
    } finally {
      setExporting(null)
    }
  }, [exportColumns, exporting, frames, pushToast])

  const handleExportGif = useCallback(async () => {
    if (frames.length === 0 || exporting) return
    setExporting('gif')
    try {
      await exportGIF(frames, fps, {
        filename: `spritetransfer-${fps}fps.gif`,
      })
      pushToast(`GIF animado exportado a ${fps} FPS.`, 'success')
    } catch (error) {
      pushToast(describeApiError(error), 'error')
      console.error('[export-gif]', error)
    } finally {
      setExporting(null)
    }
  }, [exporting, fps, frames, pushToast])

  /* ----------------------------- Layout --------------------------------- */
  return (
    <>
      <main className="relative mx-auto grid w-full max-w-[1600px] gap-4 px-4 pt-5 pb-12 lg:grid-cols-2 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <ApiConfigPanel
            provider={provider}
            onProviderChange={handleProviderChange}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            onValidate={handleValidateKey}
            status={keyStatus}
            error={keyError}
            models={models}
            modelId={modelId}
            onModelChange={setModelId}
            modelsWarning={modelsWarning}
          />

          <ReferencePanel
            reference={reference}
            onFileSelected={handleFileSelected}
            onClearReference={handleClearReference}
            appearance={appearance}
            onAppearanceChange={setAppearance}
            artStyle={artStyle}
            onArtStyleChange={setArtStyle}
            onGenerate={handleGenerate}
            generating={generating}
            elapsed={elapsed}
            canGenerate={canGenerate}
            generateHint={generateHint}
          />
        </section>

        <section className="space-y-4">
          <PreviewPanel
            referenceFrames={referenceFrames}
            frames={frames}
            fps={fps}
            onFpsChange={setFps}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            currentFrameIndex={currentFrameIndex}
            onCurrentFrameIndexChange={setCurrentFrameIndex}
            generating={generating}
            referenceBusy={referenceBusy}
            generationError={generationError}
            onEditFrame={handleEditFrame}
            editingFrame={modalOpen ? modalFrameIndex : null}
            slicing={slicingResult}
            columns={columns}
            rows={rows}
            autoSlice={autoSlice}
            referenceGrid={referenceGrid}
            onColumnsChange={setColumns}
            onRowsChange={setRows}
            onAutoSliceChange={setAutoSlice}
          />
        </section>

        <aside className="grid gap-4 md:grid-cols-2 lg:col-span-2 xl:col-span-1 xl:block xl:space-y-4">
          <CorrectionPanel
            prompt={correctionPrompt}
            onPromptChange={setCorrectionPrompt}
            onApply={handleApplyCorrection}
            busy={correcting}
            disabled={generating || modalOpen}
            editingFrame={modalOpen ? modalFrameIndex : correctionFrame}
            onClearEditing={() => {
              setCorrectionFrame(null)
              setModalOpen(false)
            }}
            frameCount={frames.length}
            error={correctionError}
            elapsed={elapsed}
          />

          <ExportPanel
            frames={frames}
            columns={exportColumns}
            onColumnsChange={setExportColumns}
            onExportGrid={handleExportGrid}
            onExportGif={handleExportGif}
            exporting={exporting}
            fps={fps}
          />

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[10px] leading-relaxed text-slate-500 md:col-span-2 xl:col-span-1">
            <p className="flex items-center gap-1.5 font-semibold tracking-wide text-slate-400 uppercase">
              <Info className="size-3" />
              Privacidade
            </p>
            <p className="mt-1.5">
              A chave fica apenas na memória desta aba. O recorte, o alinhamento,
              a spritesheet e o GIF são processados localmente via Canvas API.
            </p>
            <p className="mt-1.5 font-mono text-slate-600">
              pipeline 100% client-side · sem upload de frames
            </p>
          </div>
        </aside>
      </main>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <FrameEditModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setCorrectionFrame(null)
        }}
        frameIndex={modalFrameIndex ?? 0}
        originalFrame={referenceFrames[modalFrameIndex ?? 0] ?? ''}
        currentFrame={frames[modalFrameIndex ?? 0] ?? ''}
        previewFrame={modalPreviewFrame}
        correctionPrompt={modalPrompt}
        onPromptChange={setModalPrompt}
        onApplySingle={handleModalApplySingle}
        onApplyAll={handleModalApplyAll}
        applyingSingle={modalApplyingSingle}
        applyingAll={modalApplyingAll}
      />
    </>
  )
}
