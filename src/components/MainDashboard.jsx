import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'

import ApiConfigPanel from './dashboard/ApiConfigPanel'
import CorrectionPanel from './dashboard/CorrectionPanel'
import ExportPanel from './dashboard/ExportPanel'
import FrameEditModal from './FrameEditModal'
import PreviewPanel from './dashboard/PreviewPanel'
import ReferencePanel from './dashboard/ReferencePanel'
import UsagePanel from './dashboard/UsagePanel'
import {
  DEFAULT_PROVIDER,
  MAX_PREVIOUS_FRAMES,
  MAX_TOTAL_BASE64_CHARS,
  countBase64Chars,
  describeApiError,
  generateSprites,
  listModels,
} from '../lib/api'
import {
  LOCAL_IMAGE_KEYS,
  clearLocalImages,
  deleteLocalImages,
  getLocalImages,
  loadWorkspaceSettings,
  putLocalImages,
  saveWorkspaceSettings,
} from '../lib/localStore'
import {
  compileSpritesheetGrid,
  detectSpriteGrid,
  downloadDataUrl,
  exportGIF,
  resizeFrameToMatch,
  sliceSpritesheet,
} from '../utils/imagePipeline'
import { evaluateAnimationQuality } from '../utils/qualityMetrics'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_REFERENCE_SIDE = 1200

/** Garante que o conjunto de imagens caiba no limite da Vercel. */
function ensurePayloadSize(dataUrls) {
  const chars = countBase64Chars(dataUrls)
  if (chars > MAX_TOTAL_BASE64_CHARS) {
    const megabytes = (chars / 1_000_000).toFixed(1)
    throw new Error(
      `As imagens somam ${megabytes} MB e passam do limite de ~4,5 MB da ` +
        'requisição. Reduza a resolução, a quantidade de frames ou remova ' +
        'imagens opcionais e tente novamente.',
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
      reject(
        new Error(
          'O arquivo escolhido não é uma imagem. Use PNG, WebP, GIF ou JPEG.',
        ),
      )
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(
        new Error(
          'A imagem tem mais de 8 MB. Reduza o arquivo (ou a resolução) e ' +
            'tente novamente.',
        ),
      )
      return
    }

    const reader = new FileReader()
    reader.onerror = () =>
      reject(
        new Error(
          'Não foi possível ler o arquivo. Ele pode estar corrompido ou ' +
            'bloqueado pelo navegador.',
        ),
      )
    reader.onload = () => {
      const originalUrl = String(reader.result || '')
      const image = new Image()
      image.onerror = () =>
        reject(
          new Error(
            'O arquivo não é uma imagem válida ou está corrompido. ' +
              'Tente outro arquivo.',
          ),
        )
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
        try {
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(width * scale))
          canvas.height = Math.max(1, Math.round(height * scale))
          const context = canvas.getContext('2d')
          if (!context) {
            reject(
              new Error(
                'O navegador não conseguiu preparar o canvas para redimensionar ' +
                  'a imagem. Tente outro navegador ou reduza o arquivo antes.',
              ),
            )
            return
          }
          context.imageSmoothingEnabled = false
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
            sourceWidth: width,
            sourceHeight: height,
            resized: true,
          })
        } catch {
          reject(
            new Error(
              'Não foi possível redimensionar a imagem. Tente outro arquivo ou ' +
                'reduza a resolução antes de enviar.',
            ),
          )
        }
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

const USAGE_STORAGE_KEY = 'spritetransfer:usage-history'
const API_CONFIG_STORAGE_KEY = 'spritetransfer:api-config'
const MAX_USAGE_HISTORY = 200

/** Lê configuração de API salva (provedor, chaves e modelos preferidos). */
function loadSavedApiConfig() {
  try {
    const raw = window.localStorage.getItem(API_CONFIG_STORAGE_KEY)
    if (!raw) {
      return {
        provider: DEFAULT_PROVIDER,
        rememberKey: true,
        keysByProvider: {},
        modelsByProvider: {},
      }
    }
    const parsed = JSON.parse(raw)
    return {
      provider:
        typeof parsed?.provider === 'string' && parsed.provider
          ? parsed.provider
          : DEFAULT_PROVIDER,
      rememberKey:
        typeof parsed?.rememberKey === 'boolean' ? parsed.rememberKey : true,
      keysByProvider:
        parsed?.keysByProvider && typeof parsed.keysByProvider === 'object'
          ? parsed.keysByProvider
          : {},
      modelsByProvider:
        parsed?.modelsByProvider && typeof parsed.modelsByProvider === 'object'
          ? parsed.modelsByProvider
          : {},
    }
  } catch {
    return {
      provider: DEFAULT_PROVIDER,
      rememberKey: true,
      keysByProvider: {},
      modelsByProvider: {},
    }
  }
}

/** Lê o histórico de métricas salvo, descartando entradas inválidas. */
function loadUsageHistory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USAGE_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.id === 'number' &&
        entry.usage &&
        typeof entry.usage.clientElapsedMs === 'number',
    )
  } catch {
    return []
  }
}

export default function MainDashboard() {
  /* ------------------------------- BYOK ---------------------------------- */
  const [initialApiConfig] = useState(loadSavedApiConfig)
  // Configurações e textos da última sessão (localStorage). As imagens são
  // restauradas em seguida, de forma assíncrona, do IndexedDB.
  const [initialWorkspace] = useState(loadWorkspaceSettings)
  const [provider, setProvider] = useState(initialApiConfig.provider)
  const [rememberKey, setRememberKey] = useState(initialApiConfig.rememberKey)
  const [savedKeys, setSavedKeys] = useState(initialApiConfig.keysByProvider)
  const [savedModels, setSavedModels] = useState(initialApiConfig.modelsByProvider)
  const [apiKey, setApiKey] = useState(() =>
    initialApiConfig.rememberKey
      ? initialApiConfig.keysByProvider[initialApiConfig.provider] || ''
      : '',
  )
  const [keyStatus, setKeyStatus] = useState('idle')
  const [keyError, setKeyError] = useState('')
  const [models, setModels] = useState([])
  const [modelsWarning, setModelsWarning] = useState(null)
  const [modelId, setModelId] = useState(
    () => initialApiConfig.modelsByProvider[initialApiConfig.provider] || '',
  )
  const validationSeqRef = useRef(0)

  /* --------------------------- Referência ------------------------------- */
  const [reference, setReference] = useState(null)
  // Grade usada no app. Os campos Colunas/Linhas do painel central são a fonte
  // da verdade: definem o recorte da referência, o recorte do resultado e a
  // quantidade de frames pedida à IA. A detecção automática apenas preenche
  // esses campos ao carregar a imagem.
  const [columns, setColumns] = useState(() => initialWorkspace?.columns ?? '1')
  const [rows, setRows] = useState(() => initialWorkspace?.rows ?? '1')
  const [autoSlice, setAutoSlice] = useState(
    () => initialWorkspace?.autoSlice ?? false,
  )
  const [referenceFrames, setReferenceFrames] = useState([])
  const [referenceBusy, setReferenceBusy] = useState(false)
  const [referenceError, setReferenceError] = useState('')
  // Grade efetiva do app: com o auto-fatiamento ativo vale o que está nos
  // campos Colunas/Linhas (ajustáveis para corrigir a detecção); desligado, a
  // imagem inteira é tratada como 1 frame.
  const effectiveGrid = useMemo(() => {
    if (!autoSlice) return { columns: 1, rows: 1, total: 1 }
    const parsedColumns = Math.max(
      1,
      Math.min(64, Number.parseInt(columns, 10) || 1),
    )
    const parsedRows = Math.max(1, Math.min(64, Number.parseInt(rows, 10) || 1))
    return {
      columns: parsedColumns,
      rows: parsedRows,
      total: parsedColumns * parsedRows,
    }
  }, [autoSlice, columns, rows])
  // Imagem opcional que define APENAS o estilo de arte do resultado.
  const [styleReference, setStyleReference] = useState(null)
  // Imagem opcional que define APENAS a aparência/identidade do personagem.
  const [appearanceReference, setAppearanceReference] = useState(null)

  /* ----------------------------- Prompts -------------------------------- */
  const [appearance, setAppearance] = useState(
    () => initialWorkspace?.appearance ?? '',
  )
  const [artStyle, setArtStyle] = useState(
    () => initialWorkspace?.artStyle ?? '',
  )

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
  const [viewMode, setViewMode] = useState(
    () => initialWorkspace?.viewMode ?? 'loop',
  ) // 'loop' | 'frame-by-frame'
  const [fps, setFps] = useState(() => initialWorkspace?.fps ?? 8)

  /* --------------------------- Correção --------------------------------- */
  const [correctionPrompt, setCorrectionPrompt] = useState('')
  const [correctionFrame, setCorrectionFrame] = useState(null)
  const [correcting, setCorrecting] = useState(false)
  const [correctionError, setCorrectionError] = useState('')

  /* --------------------------- Exportação ------------------------------- */
  const [exportColumns, setExportColumns] = useState(
    () => initialWorkspace?.exportColumns ?? '4',
  )
  const [exporting, setExporting] = useState(null)

  /* --------------------------- Modal de Edição -------------------------- */
  const [modalOpen, setModalOpen] = useState(false)
  const [modalFrameIndex, setModalFrameIndex] = useState(null)
  const [modalPrompt, setModalPrompt] = useState('')
  const [modalPreviewFrame, setModalPreviewFrame] = useState(null)
  // Correção individual aguardando escolha: fica guardada sem substituir o
  // frame atual até o usuário decidir qual dos dois manter.
  const [modalCandidateFrame, setModalCandidateFrame] = useState(null)
  const [modalApplyingSingle, setModalApplyingSingle] = useState(false)
  const [modalApplyingAll, setModalApplyingAll] = useState(false)

  /* ------------------- Métricas de tempo e custo ----------------------- */
  // Histórico das chamadas à IA (tempo, tokens, custo). Fica no localStorage
  // para o controle de custo sobreviver a um recarregamento da página; a chave
  // de API nunca entra aqui.
  const [usageHistory, setUsageHistory] = useState(loadUsageHistory)
  const usageId = useRef(usageHistory.reduce((max, entry) => Math.max(max, entry.id), 0))

  useEffect(() => {
    try {
      window.localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usageHistory))
    } catch {
      // Armazenamento indisponível (aba anônima, cota): segue só em memória.
    }
  }, [usageHistory])

  /* ----------------------------- Avisos --------------------------------- */
  const [elapsed, setElapsed] = useState(0)
  const [toasts, setToasts] = useState([])
  const toastId = useRef(0)
  // Guarda a última lista de spritesheets já gravada no IndexedDB. Comparar a
  // referência do array (e não o conteúdo) garante que uma correção individual
  // — que remonta a folha inteira com o mesmo tamanho de PNG — seja salva.
  const lastSavedSheetsRef = useRef(null)
  const restoreLocalRef = useRef(false)
  // Evita repetir o aviso de recorte inválido ao ajustar a grade.
  const sliceWarnedRef = useRef('')

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

  // Avisa uma vez por sessão se o navegador recusar a gravação local (cota
  // cheia, modo privado ou armazenamento bloqueado).
  const localSaveWarned = useRef(false)
  const warnLocalSaveFailure = useCallback(
    (action) => {
      if (localSaveWarned.current) return
      localSaveWarned.current = true
      pushToast(
        `Não foi possível ${action} neste dispositivo. O armazenamento do ` +
          'navegador pode estar cheio ou bloqueado: libere espaço ou limpe os ' +
          'dados do site e tente novamente.',
        'warning',
      )
    },
    [pushToast],
  )

  // Persiste a configuração de API (provedor, chave e modelo) no navegador.
  // Se o localStorage estiver bloqueado, avisa uma vez em vez de falhar calado.
  const storageWarned = useRef(false)
  useEffect(() => {
    try {
      const payload = rememberKey
        ? {
            provider,
            rememberKey: true,
            keysByProvider: savedKeys,
            modelsByProvider: savedModels,
          }
        : {
            provider,
            rememberKey: false,
            keysByProvider: {},
            modelsByProvider: {},
          }
      window.localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      if (!storageWarned.current) {
        storageWarned.current = true
        pushToast(
          'O navegador bloqueou o armazenamento local. A chave e as ' +
            'configurações não serão lembradas ao recarregar; elas continuam ' +
            'funcionando apenas nesta aba.',
          'warning',
        )
      }
    }
  }, [provider, rememberKey, savedKeys, savedModels, pushToast])

  /** Chama a API e registra as métricas da resposta no histórico. */
  const generateAndTrack = useCallback(
    async (input) => {
      const result = await generateSprites(input)
      usageId.current += 1
      const entry = {
        id: usageId.current,
        at: Date.now(),
        kind: input.correctionPrompt
          ? input.targetFrameIndex !== null &&
            input.targetFrameIndex !== undefined
            ? 'single'
            : 'batch'
          : 'generation',
        provider: result.provider,
        modelId: result.modelId,
        usage: result.usage,
      }
      setUsageHistory((current) => [...current, entry].slice(-MAX_USAGE_HISTORY))
      return result
    },
    [],
  )

  const handleResetUsage = useCallback(() => setUsageHistory([]), [])

  /* ---------------- Persistência local (só neste dispositivo) ----------- */
  // Configurações e textos: pequenos, vão para o localStorage a cada mudança.
  // Não inclui chave de API (tem fluxo próprio em api-config).
  useEffect(() => {
    const saved = saveWorkspaceSettings({
      columns,
      rows,
      autoSlice,
      fps,
      viewMode,
      exportColumns,
      appearance,
      artStyle,
    })
    if (!saved) warnLocalSaveFailure('salvar as configurações da sessão')
  }, [
    columns,
    rows,
    autoSlice,
    fps,
    viewMode,
    exportColumns,
    appearance,
    artStyle,
    warnLocalSaveFailure,
  ])

  // Último resultado gerado: salvo no IndexedDB quando muda. Não é apagado ao
  // iniciar uma geração nova, para não perder o anterior se a chamada falhar.
  // Depois de uma correção individual, o estado recebe a folha INTEIRA remontada
  // (novo array), então o que fica salvo é a spritesheet completa, não o frame.
  useEffect(() => {
    if (generatedSheets.length === 0) return
    if (lastSavedSheetsRef.current === generatedSheets) return
    lastSavedSheetsRef.current = generatedSheets
    void putLocalImages(
      LOCAL_IMAGE_KEYS.generated,
      generatedSheets.map((dataUrl) => ({ dataUrl })),
    ).then((ok) => {
      if (!ok) warnLocalSaveFailure('salvar o resultado gerado')
    })
  }, [generatedSheets, warnLocalSaveFailure])

  // Restaura, uma única vez ao abrir, as imagens salvas neste navegador.
  useEffect(() => {
    if (restoreLocalRef.current) return
    restoreLocalRef.current = true

    ;(async () => {
      try {
        const [pose, style, appearanceImage, generated] = await Promise.all([
          getLocalImages(LOCAL_IMAGE_KEYS.pose),
          getLocalImages(LOCAL_IMAGE_KEYS.style),
          getLocalImages(LOCAL_IMAGE_KEYS.appearance),
          getLocalImages(LOCAL_IMAGE_KEYS.generated),
        ])

        let restored = 0
        if (pose[0]?.dataUrl) {
          setReference({
            ...(pose[0].meta || {}),
            dataUrl: pose[0].dataUrl,
            kind: pose[0].meta?.kind || 'file',
          })
          restored += 1
        }
        if (style[0]?.dataUrl) {
          setStyleReference({
            ...(style[0].meta || {}),
            dataUrl: style[0].dataUrl,
          })
          restored += 1
        }
        if (appearanceImage[0]?.dataUrl) {
          setAppearanceReference({
            ...(appearanceImage[0].meta || {}),
            dataUrl: appearanceImage[0].dataUrl,
          })
          restored += 1
        }

        const sheets = generated.map((item) => item.dataUrl).filter(Boolean)
        if (sheets.length > 0) {
          // Evita regravar exatamente o que acabou de ser restaurado.
          lastSavedSheetsRef.current = sheets
          setGeneratedSheets(sheets)
          restored += 1
        }

        if (restored > 0) {
          pushToast('Sessão anterior restaurada deste dispositivo.', 'info')
        }
      } catch (error) {
        console.warn('[restore-local]', error)
        pushToast(
          'Não foi possível restaurar a sessão anterior deste dispositivo. O ' +
            'armazenamento local pode estar bloqueado ou os dados podem ter ' +
            'sido apagados; a sessão atual continua normalmente.',
          'warning',
        )
      }
    })()
  }, [pushToast])

  const handleClearLocalImages = useCallback(async () => {
    const ok = await clearLocalImages()
    if (!ok) {
      pushToast(
        'Não foi possível apagar as imagens salvas. O armazenamento do ' +
          'navegador pode estar bloqueado; limpe os dados do site pelas ' +
          'configurações do navegador.',
        'error',
      )
      return
    }
    pushToast(
      'Imagens salvas neste dispositivo foram apagadas. A tela atual continua ' +
        'até você recarregar ou gerar novamente.',
      'info',
    )
  }, [pushToast])

  /* ------------------------ Métrica de qualidade ------------------------ */
  // Avaliada no navegador sempre que os frames exibidos mudam (geração,
  // correção aplicada ou novo recorte da grade). A nota também é anexada à
  // última chamada do histórico, para comparar custo × tempo × qualidade.
  const [quality, setQuality] = useState(null)
  const [qualityBusy, setQualityBusy] = useState(false)

  useEffect(() => {
    if (frames.length === 0 || slicingResult || generating) {
      if (frames.length === 0) {
        setQuality(null)
        setQualityBusy(false)
      }
      return undefined
    }

    let cancelled = false
    setQualityBusy(true)
    evaluateAnimationQuality({ frames, referenceFrames })
      .then((report) => {
        if (cancelled || !report) return
        setQuality(report)
        setUsageHistory((current) => {
          if (current.length === 0) return current
          const last = current[current.length - 1]
          return [
            ...current.slice(0, -1),
            {
              ...last,
              quality: {
                score: report.score,
                pose: report.pose,
                consistency: report.consistency,
                pixelArt: report.pixelArt,
              },
            },
          ]
        })
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('[quality]', error)
          setQuality(null)
        }
      })
      .finally(() => {
        if (!cancelled) setQualityBusy(false)
      })

    return () => {
      cancelled = true
    }
  }, [frames, referenceFrames, slicingResult, generating])

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
      setReferenceError(
        'A grade precisa de colunas e linhas entre 1 e 64. Ajuste os valores ' +
          'para recortar a referência.',
      )
      return undefined
    }

    let cancelled = false
    ;(async () => {
      setReferenceBusy(true)
      setReferenceError('')
      try {
        const sliced = await sliceSpritesheet(reference.dataUrl, gridColumns, gridRows)
        if (cancelled) return
        if (sliced.length === 0) {
          throw new Error(
            'A grade não gerou nenhum frame. Confira Colunas/Linhas e tente ' +
              'novamente.',
          )
        }
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
        const key = `${generatedSheets[0].length}:${gridColumns}x${gridRows}`
        if (sliceWarnedRef.current !== key) {
          sliceWarnedRef.current = key
          pushToast(
            `Não foi possível recortar o resultado na grade ` +
              `${gridColumns}×${gridRows}. ${describeApiError(error)} ` +
              'Ajuste Colunas/Linhas para ver os frames.',
            'warning',
          )
        }
      } finally {
        if (!cancelled) setSlicingResult(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [generatedSheets, autoSlice, columns, rows, pushToast])

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
    setModalCandidateFrame(null)
    setModalPreviewFrame(null)
  }, [
    provider,
    modelId,
    appearance,
    artStyle,
    reference,
    styleReference,
    appearanceReference,
  ])

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
  const runValidateKey = useCallback(
    async (
      targetProvider,
      rawKey,
      preferredModelId = '',
      { silent = false } = {},
    ) => {
      const trimmedKey = String(rawKey || '').trim()
      if (!trimmedKey) {
        if (!silent) {
          setKeyStatus('error')
          setKeyError('Informe sua chave de API antes de validar.')
        }
        return
      }

      const seq = ++validationSeqRef.current
      setKeyStatus('validating')
      setKeyError('')
      setModels([])
      setModelId('')
      setModelsWarning(null)

      try {
        const result = await listModels({
          provider: targetProvider,
          apiKey: trimmedKey,
        })
        if (validationSeqRef.current !== seq) return

        setModels(result.models)
        setModelsWarning(result.warning)
        const preferred =
          result.models.find((model) => model.supports_reference_images !== false) ??
          result.models[0]

        let resolvedModelId = preferred?.id || ''
        if (
          preferredModelId &&
          result.models.some((model) => model.id === preferredModelId)
        ) {
          resolvedModelId = preferredModelId
        }
        setModelId(resolvedModelId)
        setKeyStatus('valid')

        if (rememberKey) {
          setSavedKeys((current) =>
            current[targetProvider] === trimmedKey
              ? current
              : { ...current, [targetProvider]: trimmedKey },
          )
          if (resolvedModelId) {
            setSavedModels((current) =>
              current[targetProvider] === resolvedModelId
                ? current
                : { ...current, [targetProvider]: resolvedModelId },
            )
          }
        }

        if (!silent) {
          if (result.models.length === 0) {
            pushToast(
              'A chave foi aceita, mas o provedor não listou modelos de ' +
                'imagem. Verifique o acesso da conta ou use outra chave.',
              'warning',
            )
          } else {
            pushToast(
              `Chave validada: ${result.models.length} modelo${result.models.length === 1 ? '' : 's'} disponíve${result.models.length === 1 ? 'l' : 'is'}.`,
              'success',
            )
          }
        }
      } catch (error) {
        if (validationSeqRef.current !== seq) return
        setKeyStatus('error')
        const message = describeApiError(error)
        setKeyError(message)
        if (!silent) {
          pushToast(message, 'error')
        }
        console.error('[models]', error)
      }
    },
    [pushToast, rememberKey],
  )

  const autoValidatedRef = useRef(false)
  useEffect(() => {
    if (autoValidatedRef.current) return
    autoValidatedRef.current = true
    if (!initialApiConfig.rememberKey) return
    const savedKey =
      initialApiConfig.keysByProvider[initialApiConfig.provider] || ''
    if (!savedKey.trim()) return
    const savedModel =
      initialApiConfig.modelsByProvider[initialApiConfig.provider] || ''
    runValidateKey(initialApiConfig.provider, savedKey, savedModel, {
      silent: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleProviderChange = useCallback(
    (nextProvider) => {
      validationSeqRef.current += 1
      setProvider(nextProvider)
      const nextKey = rememberKey ? savedKeys[nextProvider] || '' : ''
      const nextSavedModel = rememberKey ? savedModels[nextProvider] || '' : ''
      setApiKey(nextKey)
      setModels([])
      setModelId(nextSavedModel)
      setModelsWarning(null)
      setKeyStatus('idle')
      setKeyError('')
      if (nextKey.trim()) {
        runValidateKey(nextProvider, nextKey, nextSavedModel, { silent: true })
      }
    },
    [rememberKey, runValidateKey, savedKeys, savedModels],
  )

  const handleApiKeyChange = useCallback(
    (nextValue) => {
      setApiKey(nextValue)
      setKeyStatus('idle')
      setKeyError('')
      if (rememberKey) {
        const trimmed = nextValue.trim()
        setSavedKeys((current) => {
          if (trimmed) {
            if (current[provider] === trimmed) return current
            return { ...current, [provider]: trimmed }
          }
          if (!(provider in current)) return current
          const next = { ...current }
          delete next[provider]
          return next
        })
      }
    },
    [provider, rememberKey],
  )

  const handleModelChange = useCallback(
    (nextModelId) => {
      setModelId(nextModelId)
      if (rememberKey && nextModelId) {
        setSavedModels((current) =>
          current[provider] === nextModelId
            ? current
            : { ...current, [provider]: nextModelId },
        )
      }
    },
    [provider, rememberKey],
  )

  const handleRememberKeyChange = useCallback(
    (nextRemember) => {
      setRememberKey(nextRemember)
      if (nextRemember) {
        const trimmed = apiKey.trim()
        if (trimmed) {
          setSavedKeys((current) => ({ ...current, [provider]: trimmed }))
        }
        if (modelId) {
          setSavedModels((current) => ({ ...current, [provider]: modelId }))
        }
        pushToast('Chave de API será mantida salva neste navegador.', 'info')
      } else {
        setSavedKeys({})
        setSavedModels({})
        pushToast(
          'Chaves removidas do navegador (mantida apenas na aba atual).',
          'info',
        )
      }
    },
    [apiKey, modelId, provider, pushToast],
  )

  const handleClearSavedKey = useCallback(() => {
    validationSeqRef.current += 1
    setApiKey('')
    setModels([])
    setModelId('')
    setModelsWarning(null)
    setKeyStatus('idle')
    setKeyError('')
    setSavedKeys((current) => {
      if (!(provider in current)) return current
      const next = { ...current }
      delete next[provider]
      return next
    })
    setSavedModels((current) => {
      if (!(provider in current)) return current
      const next = { ...current }
      delete next[provider]
      return next
    })
    pushToast('Chave salva deste provedor foi removida.', 'info')
  }, [provider, pushToast])

  const handleValidateKey = useCallback(
    () =>
      runValidateKey(
        provider,
        apiKey,
        modelId || (rememberKey ? savedModels[provider] || '' : ''),
      ),
    [apiKey, modelId, provider, rememberKey, runValidateKey, savedModels],
  )

  const handleFileSelected = useCallback(
    async (file) => {
      try {
        const image = await readImageFile(file)

        // Detecta nos pixels a grade provável da spritesheet (ex.: 4×4 = 16
        // frames) apenas para PRÉ-PREENCHER os campos Colunas/Linhas. A grade
        // usada de fato é sempre a dos campos, que o usuário pode corrigir.
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
        // Mantém a referência salva neste navegador para a próxima visita.
        void putLocalImages(LOCAL_IMAGE_KEYS.pose, [
          {
            dataUrl: image.dataUrl,
            meta: {
              width: image.width,
              height: image.height,
              name: file.name,
              size: file.size,
              kind: 'file',
            },
          },
        ]).then((ok) => {
          if (!ok) warnLocalSaveFailure('salvar a referência de pose')
        })
        setColumns(String(detected.columns))
        setRows(String(detected.rows))
        setAutoSlice(total > 1)
        setReferenceError('')

        if (total > 1) {
          pushToast(
            `Grade detectada: ${detected.columns}×${detected.rows} (${total} frames). ` +
              'Se estiver errada, ajuste Colunas/Linhas em Grade de Frames.',
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
    [pushToast, warnLocalSaveFailure],
  )

  const handleClearReference = useCallback(() => {
    setReference(null)
    setReferenceFrames([])
    setColumns('1')
    setRows('1')
    setAutoSlice(false)
    setReferenceError('')
    void deleteLocalImages(LOCAL_IMAGE_KEYS.pose).then((ok) => {
      if (!ok) warnLocalSaveFailure('apagar a referência salva')
    })
  }, [warnLocalSaveFailure])

  const handleStyleFileSelected = useCallback(
    async (file) => {
      try {
        const image = await readImageFile(file)
        setStyleReference({
          dataUrl: image.dataUrl,
          width: image.width,
          height: image.height,
          name: file.name,
        })
        void putLocalImages(LOCAL_IMAGE_KEYS.style, [
          {
            dataUrl: image.dataUrl,
            meta: {
              width: image.width,
              height: image.height,
              name: file.name,
            },
          },
        ]).then((ok) => {
          if (!ok) warnLocalSaveFailure('salvar a referência de estilo')
        })
        pushToast('Imagem de referência de estilo carregada.', 'success')
      } catch (error) {
        pushToast(describeApiError(error), 'error')
      }
    },
    [pushToast, warnLocalSaveFailure],
  )

  const handleClearStyleReference = useCallback(() => {
    setStyleReference(null)
    void deleteLocalImages(LOCAL_IMAGE_KEYS.style).then((ok) => {
      if (!ok) warnLocalSaveFailure('apagar a referência de estilo salva')
    })
  }, [warnLocalSaveFailure])

  const handleAppearanceFileSelected = useCallback(
    async (file) => {
      try {
        const image = await readImageFile(file)
        setAppearanceReference({
          dataUrl: image.dataUrl,
          width: image.width,
          height: image.height,
          name: file.name,
        })
        void putLocalImages(LOCAL_IMAGE_KEYS.appearance, [
          {
            dataUrl: image.dataUrl,
            meta: {
              width: image.width,
              height: image.height,
              name: file.name,
            },
          },
        ]).then((ok) => {
          if (!ok) warnLocalSaveFailure('salvar a referência de aparência')
        })
        pushToast('Imagem de referência de aparência carregada.', 'success')
      } catch (error) {
        pushToast(describeApiError(error), 'error')
      }
    },
    [pushToast, warnLocalSaveFailure],
  )

  const handleClearAppearanceReference = useCallback(() => {
    setAppearanceReference(null)
    void deleteLocalImages(LOCAL_IMAGE_KEYS.appearance).then((ok) => {
      if (!ok) warnLocalSaveFailure('apagar a referência de aparência salva')
    })
  }, [warnLocalSaveFailure])

  const canGenerate = Boolean(
    apiKey.trim() &&
      modelId &&
      referenceFrames.length > 0 &&
      (appearance.trim() || appearanceReference) &&
      effectiveGrid.total <= 64 &&
      !generating,
  )

  const generateHint = useMemo(() => {
    if (!apiKey.trim()) return 'Informe e valide sua chave de API para começar.'
    if (!modelId) return 'Valide a chave e escolha um modelo de imagem.'
    if (referenceFrames.length === 0) return 'Envie uma referência de movimento.'
    if (!appearance.trim() && !appearanceReference) {
      return 'Descreva a aparência do personagem ou envie uma imagem de referência.'
    }
    if (effectiveGrid.total > 64) {
      return `A grade atual gera ${effectiveGrid.total} frames, mas o limite é 64 por chamada. Reduza Colunas/Linhas.`
    }
    const hasStyle = Boolean(artStyle.trim() || styleReference)
    return hasStyle
      ? `Pronto para gerar ${effectiveGrid.total} frame(s) — grade ${effectiveGrid.columns}×${effectiveGrid.rows}.`
      : `Pronto para gerar ${effectiveGrid.total} frame(s) — sem estilo definido, a referência de movimento também define o estilo.`
  }, [
    apiKey,
    modelId,
    referenceFrames,
    effectiveGrid,
    appearance,
    appearanceReference,
    artStyle,
    styleReference,
  ])

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
      const styleImages = styleReference?.dataUrl ? [styleReference.dataUrl] : []
      const appearanceImages = appearanceReference?.dataUrl
        ? [appearanceReference.dataUrl]
        : []

      // A grade pedida à IA é a mesma dos campos Colunas/Linhas (que o usuário
      // pode ajustar quando a detecção automática errar). A referência inteira
      // continua sendo enviada; só a contagem e o formato vêm daqui.
      const requestedFrameCount = effectiveGrid.total
      const requestedGrid = {
        columns: effectiveGrid.columns,
        rows: effectiveGrid.rows,
      }

      try {
        ensurePayloadSize([
          ...referenceImage,
          ...styleImages,
          ...appearanceImages,
        ])
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
      setModalCandidateFrame(null)
      setModalPreviewFrame(null)

      let result
      try {
        result = await generateAndTrack({
          provider,
          apiKey: apiKey.trim(),
          modelId,
          referenceImages: referenceImage,
          characterAppearance: appearance.trim(),
          artStyle: artStyle.trim(),
          appearanceImages,
          styleImages,
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
        const message =
          'O servidor devolveu um resultado que o app não conseguiu ' +
          'interpretar. Tente novamente; se persistir, recarregue a página.'
        setGenerationError(message)
        pushToast(message, 'error')
        return
      }

      if (result.images.length === 0) {
        setGenerating(false)
        setFrames([])
        const message =
          'O modelo terminou sem devolver imagem. Ajuste o prompt ou escolha ' +
          'outro modelo e tente novamente.'
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
    effectiveGrid,
    styleReference,
    appearanceReference,
  ])

  const handleEditFrame = useCallback((index) => {
    setCorrectionError('')
    setCurrentFrameIndex(index)
    setModalOpen(true)
    setModalFrameIndex(index)
    setModalPrompt('')
    setModalPreviewFrame(null)
    setModalCandidateFrame(null)
  }, [])

  /**
   * Junta novamente todos os frames em UMA spritesheet. É usada depois de uma
   * correção individual para que o resultado atualizado possa ser exportado ou
   * enviado inteiro nas correções em lote.
   */
  const recompileGeneratedSheet = useCallback(
    async (nextFrames) => {
      if (!Array.isArray(nextFrames) || nextFrames.length === 0) return
      const cols = Math.max(
        1,
        Math.min(nextFrames.length, Number.parseInt(columns, 10) || 1),
      )
      try {
        const sheet = await compileSpritesheetGrid(nextFrames, cols)
        setGeneratedSheets([sheet])
        setColumns(String(cols))
        setRows(String(Math.ceil(nextFrames.length / cols)))
        setAutoSlice(nextFrames.length > 1)
        setExportColumns(String(Math.min(4, nextFrames.length)))
      } catch (error) {
        console.error('[recompile-sheet]', error)
        pushToast(
          'A correção foi aplicada, mas não foi possível remontar a ' +
            'spritesheet. Tente novamente ou exporte os frames ' +
            'individualmente.',
          'error',
        )
      }
    },
    [columns, pushToast],
  )

  const handleApplyCorrection = useCallback(async () => {
    if (correcting) return
    if (frames.length === 0) {
      pushToast(
        'Nenhum frame disponível para corrigir. Gere ou carregue frames antes ' +
          'de aplicar a correção.',
        'warning',
      )
      return
    }
    if (!correctionPrompt.trim()) {
      pushToast(
        'A instrução de correção está vazia. Descreva o que deve ser corrigido ' +
          'e tente novamente.',
        'warning',
      )
      return
    }
    if (!apiKey.trim() || !modelId) {
      pushToast(
        'A chave de API ou o modelo ainda não estão prontos. Valide a chave e ' +
          'escolha um modelo antes de corrigir.',
        'warning',
      )
      return
    }

    const individual =
      correctionFrame !== null &&
      correctionFrame >= 0 &&
      correctionFrame < frames.length

    const gridColumns = Math.max(1, Number.parseInt(columns, 10) || 1)
    const gridRows = Math.max(
      1,
      individual ? 1 : Math.ceil(frames.length / gridColumns),
    )

    // Individual: envia SÓ o frame escolhido e pede 1 frame de volta.
    // Em lote: envia a spritesheet INTEIRA e pede a folha corrigida inteira.
    const previousImages = individual
      ? [frames[correctionFrame]]
      : generatedSheets.length === 1
        ? [generatedSheets[0]]
        : frames.slice(0, MAX_PREVIOUS_FRAMES)
    const referenceImages = individual
      ? referenceFrames[correctionFrame]
        ? [referenceFrames[correctionFrame]]
        : []
      : reference?.dataUrl
        ? [reference.dataUrl]
        : []
    const styleImages = styleReference?.dataUrl ? [styleReference.dataUrl] : []
    const appearanceImages = appearanceReference?.dataUrl
      ? [appearanceReference.dataUrl]
      : []

    try {
      ensurePayloadSize([
        ...previousImages,
        ...referenceImages,
        ...styleImages,
        ...appearanceImages,
      ])
    } catch (error) {
      pushToast(describeApiError(error), 'error')
      return
    }

    setCorrecting(true)
    setCorrectionError('')

    try {
      const result = await generateAndTrack({
        provider,
        apiKey: apiKey.trim(),
        modelId,
        referenceImages,
        characterAppearance: appearance.trim(),
        artStyle: artStyle.trim(),
        appearanceImages,
        styleImages,
        previousImages,
        correctionPrompt: correctionPrompt.trim(),
        targetFrameIndex: individual ? 0 : null,
        frameCount: individual ? 1 : frames.length,
        gridColumns: individual ? 1 : gridColumns,
        gridRows: individual ? 1 : gridRows,
      })

      if (result.images.length === 0) {
        throw new Error('A IA não retornou nenhuma imagem corrigida. Tente novamente.')
      }

      if (individual) {
        const index = correctionFrame
        // A resposta pode vir em outra resolução: normaliza para o tamanho do
        // frame original antes de recolocar na sequência.
        const corrected = await resizeFrameToMatch(
          result.images[0],
          frames[index],
        )
        const nextFrames = frames.map((frame, position) =>
          position === index ? corrected : frame,
        )
        setFrames(nextFrames)
        await recompileGeneratedSheet(nextFrames)
        pushToast(
          `Frame #${index + 1} corrigido sem alterar os demais.`,
          'success',
        )
      } else if (result.images.length === 1) {
        // Correção em lote: a IA devolveu a spritesheet inteira corrigida.
        // Detecta a grade real da resposta (pode ter mudado) para recortar.
        let resultGrid = { columns: gridColumns, rows: gridRows }
        try {
          const detected = await detectSpriteGrid(result.images[0])
          if (detected.total === frames.length) resultGrid = detected
        } catch (detectError) {
          console.warn('[correction-grid]', detectError)
        }
        setGeneratedSheets(result.images)
        setColumns(String(resultGrid.columns))
        setRows(String(resultGrid.rows))
        setAutoSlice(frames.length > 1)
        pushToast(
          `${frames.length} frame${frames.length === 1 ? '' : 's'} corrigido${frames.length === 1 ? '' : 's'} em lote.`,
          'success',
        )
      } else {
        setGeneratedSheets(result.images)
        setFrames(result.images)
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
    columns,
    correcting,
    correctionFrame,
    correctionPrompt,
    frames,
    generatedSheets,
    modelId,
    provider,
    pushToast,
    recompileGeneratedSheet,
    reference,
    referenceFrames,
    styleReference,
    appearanceReference,
  ])

  /* --------------------------- Modal: correção individual -------------------------- */
  const handleModalApplySingle = useCallback(async () => {
    if (modalApplyingSingle || modalApplyingAll) return
    if (modalFrameIndex === null || frames.length === 0) {
      pushToast(
        'Nenhum frame disponível para corrigir. Gere ou carregue frames antes ' +
          'de continuar.',
        'warning',
      )
      return
    }
    if (!modalPrompt.trim()) {
      pushToast(
        'A instrução de correção está vazia. Descreva o que deve ser corrigido ' +
          'e tente novamente.',
        'warning',
      )
      return
    }
    if (!apiKey.trim() || !modelId) {
      pushToast(
        'A chave de API ou o modelo ainda não estão prontos. Valide a chave e ' +
          'escolha um modelo antes de corrigir.',
        'warning',
      )
      return
    }

    const index = modalFrameIndex
    if (index < 0 || index >= frames.length) {
      pushToast(
        'O frame selecionado não existe mais. Feche esta janela e escolha um ' +
          'frame válido.',
        'warning',
      )
      return
    }
    // Envia APENAS o frame selecionado. O índice do alvo é 0 porque só há uma
    // imagem em `previous_generated_images` (o frame local pode ser, p.ex., 7).
    const previousImages = [frames[index]]
    const referenceImages = referenceFrames[index]
      ? [referenceFrames[index]]
      : []
    const styleImages = styleReference?.dataUrl ? [styleReference.dataUrl] : []
    const appearanceImages = appearanceReference?.dataUrl
      ? [appearanceReference.dataUrl]
      : []

    try {
      ensurePayloadSize([
        ...previousImages,
        ...referenceImages,
        ...styleImages,
        ...appearanceImages,
      ])
    } catch (error) {
      pushToast(describeApiError(error), 'error')
      return
    }

    setModalApplyingSingle(true)
    setCorrectionError('')

    try {
      const result = await generateAndTrack({
        provider,
        apiKey: apiKey.trim(),
        modelId,
        referenceImages,
        characterAppearance: appearance.trim(),
        artStyle: artStyle.trim(),
        appearanceImages,
        styleImages,
        previousImages,
        correctionPrompt: modalPrompt.trim(),
        targetFrameIndex: 0,
        frameCount: 1,
        gridColumns: 1,
        gridRows: 1,
      })

      if (result.images.length === 0) {
        throw new Error(
          'O provedor não devolveu a imagem corrigida. Tente novamente; se ' +
            'persistir, escolha outro modelo.',
        )
      }

      // Normaliza a resolução da resposta para o tamanho do frame original.
      // NÃO substitui ainda: guarda a correção como candidata para o usuário
      // escolher entre o frame atual e o corrigido.
      const corrected = await resizeFrameToMatch(result.images[0], frames[index])
      setModalCandidateFrame(corrected)
      setModalPreviewFrame(corrected)
      setModalPrompt('')
      pushToast(
        `Correção do frame #${index + 1} pronta. Escolha qual frame manter.`,
        'info',
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
    recompileGeneratedSheet,
    referenceFrames,
    styleReference,
    appearanceReference,
  ])

  /* --------------------- Modal: escolha do frame final --------------------- */
  const handleModalUseCandidate = useCallback(async () => {
    if (!modalCandidateFrame || modalFrameIndex === null) {
      pushToast(
        'Nenhuma correção candidata para aplicar. Gere a correção novamente.',
        'warning',
      )
      return
    }
    const index = modalFrameIndex
    if (index < 0 || index >= frames.length) {
      pushToast(
        'O frame selecionado não existe mais. Feche esta janela e escolha um ' +
          'frame válido.',
        'warning',
      )
      return
    }
    const nextFrames = frames.map((frame, position) =>
      position === index ? modalCandidateFrame : frame,
    )
    setFrames(nextFrames)
    setModalCandidateFrame(null)
    setModalPreviewFrame(null)
    setModalOpen(false)
    await recompileGeneratedSheet(nextFrames)
    pushToast(`Frame #${index + 1} atualizado com a correção.`, 'success')
  }, [
    frames,
    modalCandidateFrame,
    modalFrameIndex,
    pushToast,
    recompileGeneratedSheet,
  ])

  const handleModalDiscardCandidate = useCallback(() => {
    setModalCandidateFrame(null)
    setModalPreviewFrame(null)
    setModalOpen(false)
    pushToast('Frame atual mantido (correção descartada).', 'info')
  }, [pushToast])

  /* --------------------------- Modal: correção em lote -------------------------- */
  const handleModalApplyAll = useCallback(async () => {
    if (modalApplyingAll || modalApplyingSingle) return
    if (frames.length === 0) {
      pushToast(
        'Nenhum frame disponível para corrigir. Gere ou carregue frames antes ' +
          'de continuar.',
        'warning',
      )
      return
    }
    if (!modalPrompt.trim()) {
      pushToast(
        'A instrução de correção está vazia. Descreva o que deve ser corrigido ' +
          'e tente novamente.',
        'warning',
      )
      return
    }
    if (!apiKey.trim() || !modelId) {
      pushToast(
        'A chave de API ou o modelo ainda não estão prontos. Valide a chave e ' +
          'escolha um modelo antes de corrigir.',
        'warning',
      )
      return
    }

    const gridColumns = Math.max(1, Number.parseInt(columns, 10) || 1)
    const gridRows = Math.max(1, Math.ceil(frames.length / gridColumns))

    // Em lote, envia a spritesheet inteira e pede a folha inteira corrigida.
    const previousImages =
      generatedSheets.length === 1
        ? [generatedSheets[0]]
        : frames.slice(0, MAX_PREVIOUS_FRAMES)
    const referenceImages = reference?.dataUrl
      ? [reference.dataUrl]
      : []
    const styleImages = styleReference?.dataUrl ? [styleReference.dataUrl] : []
    const appearanceImages = appearanceReference?.dataUrl
      ? [appearanceReference.dataUrl]
      : []

    try {
      ensurePayloadSize([
        ...previousImages,
        ...referenceImages,
        ...styleImages,
        ...appearanceImages,
      ])
    } catch (error) {
      pushToast(describeApiError(error), 'error')
      return
    }

    setModalApplyingAll(true)
    setCorrectionError('')

    try {
      const result = await generateAndTrack({
        provider,
        apiKey: apiKey.trim(),
        modelId,
        referenceImages,
        characterAppearance: appearance.trim(),
        artStyle: artStyle.trim(),
        appearanceImages,
        styleImages,
        previousImages,
        correctionPrompt: modalPrompt.trim(),
        targetFrameIndex: null,
        frameCount: frames.length,
        gridColumns,
        gridRows,
      })

      if (result.images.length === 0) {
        throw new Error(
          'O provedor não devolveu a imagem corrigida. Tente novamente; se ' +
            'persistir, escolha outro modelo.',
        )
      }

      if (result.images.length === 1 && frames.length > 1) {
        // A IA devolveu a spritesheet corrigida inteira: guarda a folha e deixa
        // o efeito de recorte reconstruir os frames com a grade real detectada.
        let resultGrid = { columns: gridColumns, rows: gridRows }
        try {
          const detected = await detectSpriteGrid(result.images[0])
          if (detected.total === frames.length) resultGrid = detected
        } catch (detectError) {
          console.warn('[modal correction-grid]', detectError)
        }
        setGeneratedSheets(result.images)
        setColumns(String(resultGrid.columns))
        setRows(String(resultGrid.rows))
        setAutoSlice(true)
        try {
          const sliced = await sliceSpritesheet(
            result.images[0],
            resultGrid.columns,
            resultGrid.rows,
          )
          setModalPreviewFrame(sliced[0] ?? null)
        } catch (sliceError) {
          console.warn('[modal batch preview]', sliceError)
          setModalPreviewFrame(null)
        }
      } else {
        setGeneratedSheets(result.images)
        setFrames(result.images)
        setModalPreviewFrame(result.images[0] ?? null)
      }

      setModalPrompt('')
      setModalCandidateFrame(null)
      pushToast(
        `${frames.length} frame${frames.length === 1 ? '' : 's'} corrigido${frames.length === 1 ? '' : 's'} em lote.`,
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
    columns,
    frames,
    generatedSheets,
    modalApplyingAll,
    modalApplyingSingle,
    modalPrompt,
    modelId,
    provider,
    pushToast,
    reference,
    referenceFrames,
    styleReference,
    appearanceReference,
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
            onApiKeyChange={handleApiKeyChange}
            onValidate={handleValidateKey}
            status={keyStatus}
            error={keyError}
            models={models}
            modelId={modelId}
            onModelChange={handleModelChange}
            modelsWarning={modelsWarning}
            rememberKey={rememberKey}
            onRememberKeyChange={handleRememberKeyChange}
            onClearKey={handleClearSavedKey}
          />

          <ReferencePanel
            reference={reference}
            onFileSelected={handleFileSelected}
            onClearReference={handleClearReference}
            appearance={appearance}
            onAppearanceChange={setAppearance}
            appearanceReference={appearanceReference}
            onAppearanceFileSelected={handleAppearanceFileSelected}
            onClearAppearanceReference={handleClearAppearanceReference}
            artStyle={artStyle}
            onArtStyleChange={setArtStyle}
            styleReference={styleReference}
            onStyleFileSelected={handleStyleFileSelected}
            onClearStyleReference={handleClearStyleReference}
            onGenerate={handleGenerate}
            generating={generating}
            elapsed={elapsed}
            canGenerate={canGenerate}
            generateHint={generateHint}
            referenceError={referenceError}
            onMultipleFiles={() =>
              pushToast(
                'Envie apenas uma imagem por vez em cada campo. Usei a primeira.',
                'info',
              )
            }
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
            referenceGrid={effectiveGrid}
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

          <UsagePanel
            history={usageHistory}
            onReset={handleResetUsage}
            quality={quality}
            qualityBusy={qualityBusy}
            onEditFrame={frames.length > 1 ? handleEditFrame : null}
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
              Sua chave, as configurações e as imagens (referências e último
              resultado) ficam apenas neste dispositivo — no <code>localStorage</code>{' '}
              e no <code>IndexedDB</code> do navegador. Elas não são gravadas no
              servidor e não aparecem em outro dispositivo ou navegador. Para
              manter a chave só na memória desta aba, desmarque “Salvar chave
              neste navegador”. O recorte, o alinhamento, a spritesheet e o GIF
              são processados localmente via Canvas API.
            </p>
            <p className="mt-1.5">
              Ao abrir o site, a última sessão é restaurada automaticamente. Se
              quiser que as imagens não voltem, apague-as deste dispositivo:
            </p>
            <button
              type="button"
              onClick={handleClearLocalImages}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-rose-400/30 hover:bg-rose-400/5 hover:text-rose-300"
            >
              <Trash2 className="size-3" />
              Limpar imagens salvas neste dispositivo
            </button>
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
          setModalCandidateFrame(null)
          setModalPreviewFrame(null)
        }}
        frameIndex={modalFrameIndex ?? 0}
        originalFrame={referenceFrames[modalFrameIndex ?? 0] ?? ''}
        currentFrame={frames[modalFrameIndex ?? 0] ?? ''}
        previewFrame={modalPreviewFrame}
        candidateFrame={modalCandidateFrame}
        correctionPrompt={modalPrompt}
        onPromptChange={setModalPrompt}
        onApplySingle={handleModalApplySingle}
        onApplyAll={handleModalApplyAll}
        onUseCandidate={handleModalUseCandidate}
        onDiscardCandidate={handleModalDiscardCandidate}
        applyingSingle={modalApplyingSingle}
        applyingAll={modalApplyingAll}
      />
    </>
  )
}
