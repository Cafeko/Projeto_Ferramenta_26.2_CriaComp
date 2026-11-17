import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  PencilLine,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react'

import ApiConfigPanel from './dashboard/ApiConfigPanel'
import AnimationFramesPanel from './dashboard/AnimationFramesPanel'
import BatchEditModal from './dashboard/BatchEditModal'
import CorrectionPanel from './dashboard/CorrectionPanel'
import EditorMode from './dashboard/EditorMode'
import ExportPanel from './dashboard/ExportPanel'
import FrameEditModal from './FrameEditModal'
import GridPanel from './dashboard/GridPanel'
import LogsPage from './dashboard/LogsPage'
import PreviewPanel from './dashboard/PreviewPanel'
import ReferencePanel from './dashboard/ReferencePanel'
import SettingsModal from './dashboard/SettingsModal'
import SimpleMode from './dashboard/SimpleMode'
import UsageSummary from './dashboard/UsageSummary'
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
  clearLocalImages,
  clearWorkspaceSettings,
  deleteLocalImages,
  getLocalImages,
  imageKey,
  loadAppSettings,
  loadWorkspaceSettings,
  putLocalImages,
  saveAppSettings,
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
const MAX_USAGE_HISTORY = 100

/** Lê configuração de API salva (provedor, chaves e modelos preferidos). */
function loadSavedApiConfig(enabled = true) {
  if (!enabled) {
    return {
      provider: DEFAULT_PROVIDER,
      rememberKey: true,
      keysByProvider: {},
      modelsByProvider: {},
    }
  }
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
    return parsed
      .filter(
        (entry) =>
          entry &&
          typeof entry.id === 'number' &&
          entry.usage &&
          typeof entry.usage.clientElapsedMs === 'number',
      )
      .map((entry) => ({
        ...entry,
        // Entradas antigas não tinham status; eram chamadas bem-sucedidas.
        status: entry.status === 'error' ? 'error' : 'success',
      }))
      .slice(-MAX_USAGE_HISTORY)
  } catch {
    return []
  }
}

export default function MainDashboard({
  logsOpen = false,
  onCloseLogs,
  onOpenLogs,
  settingsOpen = false,
  onCloseSettings,
}) {
  /* ---------------------------- Configurações ---------------------------- */
  const [initialSettings] = useState(loadAppSettings)
  const [settings, setSettings] = useState(initialSettings)
  const saveSession = settings.saveSession
  const [clearingSession, setClearingSession] = useState(false)

  /* ------------------------------- BYOK ---------------------------------- */
  const [initialApiConfig] = useState(() => loadSavedApiConfig(saveSession))
  // Configurações e textos da última sessão (localStorage). As imagens são
  // restauradas em seguida, de forma assíncrona, do IndexedDB.
  const [initialWorkspace] = useState(() =>
    saveSession ? loadWorkspaceSettings() : null,
  )
  // Cada modo (avançado/editor/simples) tem seus próprios dados salvos.
  const initialBuckets =
    initialWorkspace?.modes && typeof initialWorkspace.modes === 'object'
      ? initialWorkspace.modes
      : initialWorkspace
        ? { advanced: initialWorkspace }
        : {}
  const initialBucket = initialBuckets[initialSettings.mode] || null
  const modeRef = useRef(initialSettings.mode)
  const modeBucketsRef = useRef(initialBuckets)
  const modeImagesRef = useRef({})
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
  const [columns, setColumns] = useState(() => initialBucket?.columns ?? '1')
  const [rows, setRows] = useState(() => initialBucket?.rows ?? '1')
  const [autoSlice, setAutoSlice] = useState(
    () => initialBucket?.autoSlice ?? false,
  )
  // Quantidade de frames que a IA deve desenhar. É independente da grade de
  // Grade que a IA deve desenhar (colunas × linhas). É independente da grade
  // de recorte usada para exibir/fatiar a imagem.
  const [generationColumns, setGenerationColumns] = useState(() =>
    Number.isFinite(initialBucket?.generationColumns)
      ? String(initialBucket.generationColumns)
      : '1',
  )
  const [generationRows, setGenerationRows] = useState(() =>
    Number.isFinite(initialBucket?.generationRows)
      ? String(initialBucket.generationRows)
      : '1',
  )
  const initialGridTotal =
    Math.max(1, Number.parseInt(initialBucket?.columns, 10) || 1) *
    Math.max(1, Number.parseInt(initialBucket?.rows, 10) || 1)
  const generationGridEditedRef = useRef(
    Number.isFinite(initialBucket?.generationColumns) &&
      Number.isFinite(initialBucket?.generationRows) &&
      initialBucket.generationColumns * initialBucket.generationRows !==
        initialGridTotal,
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
  // Grade que a IA deve desenhar: colunas × linhas. O total é o frame_count.
  const generationGrid = useMemo(() => {
    const parsedColumns = Math.min(
      64,
      Math.max(1, Number.parseInt(generationColumns, 10) || 1),
    )
    const parsedRows = Math.min(
      64,
      Math.max(1, Number.parseInt(generationRows, 10) || 1),
    )
    return {
      columns: parsedColumns,
      rows: parsedRows,
      total: parsedColumns * parsedRows,
    }
  }, [generationColumns, generationRows])
  const requestedFrameCount = generationGrid.total

  // Enquanto o usuário não editar a grade de geração, ela acompanha a grade de
  // recorte (ex.: detecção 4×2 preenche as duas).
  useEffect(() => {
    if (!autoSlice) return
    if (generationGridEditedRef.current) return
    setGenerationColumns(String(effectiveGrid.columns))
    setGenerationRows(String(effectiveGrid.rows))
  }, [autoSlice, effectiveGrid])
  // Imagem opcional que define APENAS o estilo de arte do resultado.
  const [styleReference, setStyleReference] = useState(null)
  // Imagem opcional que define APENAS a aparência/identidade do personagem.
  const [appearanceReference, setAppearanceReference] = useState(null)

  /* ----------------------------- Prompts -------------------------------- */
  const [appearance, setAppearance] = useState(
    () => initialBucket?.appearance ?? '',
  )
  const [artStyle, setArtStyle] = useState(
    () => initialBucket?.artStyle ?? '',
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

  /* ----------------------------- Editor --------------------------------- */
  const [editorSource, setEditorSource] = useState(null)

  /* ----------------------------- Player --------------------------------- */
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [viewMode, setViewMode] = useState(
    () => initialBucket?.viewMode ?? 'loop',
  ) // 'loop' | 'frame-by-frame'
  const [fps, setFps] = useState(() => initialBucket?.fps ?? 8)

  /* --------------------------- Correção --------------------------------- */
  const [correctionPrompt, setCorrectionPrompt] = useState(
    () => initialBucket?.correctionPrompt ?? '',
  )
  const [correctionFrame, setCorrectionFrame] = useState(null)
  const [correcting, setCorrecting] = useState(false)
  const [correctionError, setCorrectionError] = useState('')

  /* --------------------------- Exportação ------------------------------- */
  const [exportColumns, setExportColumns] = useState(
    () => initialBucket?.exportColumns ?? '4',
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
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [batchCandidate, setBatchCandidate] = useState(null)
  const [simpleStep, setSimpleStep] = useState(1)

  /* ------------------- Métricas de tempo e custo ----------------------- */
  // Histórico das chamadas à IA (tempo, tokens, custo). Fica no localStorage
  // para o controle de custo sobreviver a um recarregamento da página; a chave
  // de API nunca entra aqui.
  const [usageHistory, setUsageHistory] = useState(loadUsageHistory)
  const usageId = useRef(usageHistory.reduce((max, entry) => Math.max(max, entry.id), 0))
  // Dados da última geração que devolveu imagem, para o painel de métricas.
  // Independente dos logs: é limpo ao remover o resultado gerado.
  const [lastGeneration, setLastGeneration] = useState(
    () => initialBucket?.lastGeneration ?? null,
  )

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
    if (!saveSession) return
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
  }, [provider, rememberKey, savedKeys, savedModels, saveSession, pushToast])

  /** Chama a API e registra a requisição (sucesso ou erro) no histórico. */
  const generateAndTrack = useCallback(
    async (input) => {
      const startedAt = Date.now()
      const kind =
        input.entryKind ||
        (input.correctionPrompt
          ? input.targetFrameIndex !== null &&
            input.targetFrameIndex !== undefined
            ? 'single'
            : 'batch'
          : 'generation')

      try {
        const result = await generateSprites(input)
        usageId.current += 1
        const entry = {
          id: usageId.current,
          at: startedAt,
          kind,
          status: 'success',
          provider: result.provider,
          modelId: result.modelId,
          usage: result.usage,
        }
        setUsageHistory((current) =>
          [...current, entry].slice(-MAX_USAGE_HISTORY),
        )
        if (
          !input.skipLastGeneration &&
          Array.isArray(result.images) &&
          result.images.length > 0
        ) {
          setLastGeneration({
            at: entry.at,
            kind: entry.kind,
            provider: entry.provider,
            modelId: entry.modelId,
            usage: entry.usage,
          })
        }
        return result
      } catch (error) {
        usageId.current += 1
        const entry = {
          id: usageId.current,
          at: startedAt,
          kind,
          status: 'error',
          provider: input.provider,
          modelId: input.modelId,
          errorCode: error?.code || 'request_failed',
          errorMessage:
            error?.message || 'A requisição falhou sem detalhes adicionais.',
          usage: {
            clientElapsedMs: Math.max(0, Date.now() - startedAt),
            serverElapsedMs: null,
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
            imageCount: 0,
            costUsd: null,
            costSource: 'unavailable',
            costNote: null,
            computeSeconds: null,
          },
        }
        setUsageHistory((current) =>
          [...current, entry].slice(-MAX_USAGE_HISTORY),
        )
        throw error
      }
    },
    [],
  )

  const handleResetUsage = useCallback(() => setUsageHistory([]), [])

  /* ------------------------- Preferências da interface ------------------- */
  // Modo (avançado/simples), métricas no rodapé e o interruptor geral de
  // persistência. Ficam no localStorage, separados dos dados da sessão.
  useEffect(() => {
    saveAppSettings(settings)
  }, [settings])

  const handleSettingsChange = useCallback((patch) => {
    setSettings((current) => ({ ...current, ...patch }))
  }, [])

  /* ---------------- Persistência local (só neste dispositivo) ----------- */
  // Textos, prompts e grade são salvos por modo. As imagens usam chaves
  // separadas no IndexedDB (avançado/editor/simples).
  useEffect(() => {
    if (!saveSession) return
    const bucket = {
      columns,
      rows,
      autoSlice,
      fps,
      viewMode,
      exportColumns,
      appearance,
      artStyle,
      generationColumns: Number.parseInt(generationColumns, 10) || null,
      generationRows: Number.parseInt(generationRows, 10) || null,
      correctionPrompt,
      lastGeneration,
    }
    const modes = { ...modeBucketsRef.current, [modeRef.current]: bucket }
    modeBucketsRef.current = modes
    const saved = saveWorkspaceSettings({ modes })
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
    generationColumns,
    generationRows,
    correctionPrompt,
    lastGeneration,
    saveSession,
    warnLocalSaveFailure,
  ])

  // Último resultado gerado: salvo no IndexedDB quando muda. Não é apagado ao
  // iniciar uma geração nova, para não perder o anterior se a chamada falhar.
  // Depois de uma correção individual, o estado recebe a folha INTEIRA remontada
  // (novo array), então o que fica salvo é a spritesheet completa, não o frame.
  useEffect(() => {
    if (!saveSession) return
    if (generatedSheets.length === 0) return
    if (lastSavedSheetsRef.current === generatedSheets) return
    lastSavedSheetsRef.current = generatedSheets
    void putLocalImages(
      imageKey(modeRef.current, 'generated'),
      generatedSheets.map((dataUrl) => ({ dataUrl })),
    ).then((ok) => {
      if (!ok) warnLocalSaveFailure('salvar o resultado gerado')
    })
  }, [generatedSheets, saveSession, warnLocalSaveFailure])

  // Modo editor: a imagem de entrada e o resultado ficam salvos como os demais
  // dados da sessão; remover qualquer um deles apaga a cópia local.
  useEffect(() => {
    if (!saveSession || !editorSource?.dataUrl) return
    void putLocalImages(imageKey('editor', 'editorSource'), [
      {
        dataUrl: editorSource.dataUrl,
        meta: { name: editorSource.name || 'editor.png' },
      },
    ]).then((ok) => {
      if (!ok) warnLocalSaveFailure('salvar a imagem do editor')
    })
  }, [editorSource, saveSession, warnLocalSaveFailure])

  /* ---------------------- Dados por modo (sessão) ------------------------ */
  const captureModeImages = useCallback(
    () => ({
      reference,
      styleReference,
      appearanceReference,
      generatedSheets,
      editorSource,
    }),
    [
      reference,
      styleReference,
      appearanceReference,
      generatedSheets,
      editorSource,
    ],
  )

  const applyModeImages = useCallback((snapshot) => {
    const snap = snapshot || {}
    setReference(snap.reference ?? null)
    setStyleReference(snap.styleReference ?? null)
    setAppearanceReference(snap.appearanceReference ?? null)
    setGeneratedSheets(
      Array.isArray(snap.generatedSheets) ? snap.generatedSheets : [],
    )
    setEditorSource(snap.editorSource ?? null)
    lastSavedSheetsRef.current = Array.isArray(snap.generatedSheets)
      ? snap.generatedSheets
      : []
  }, [])

  const readModeImages = useCallback(async (mode, name) => {
    const primary = await getLocalImages(imageKey(mode, name))
    if (primary.length > 0) return primary
    // Compatibilidade: dados antigos ficavam sem prefixo de modo.
    if (mode === 'advanced') {
      const legacy = await getLocalImages(name)
      if (legacy.length > 0) return legacy
    }
    return []
  }, [])

  const loadModeImages = useCallback(
    async (mode) => {
      const cached = modeImagesRef.current[mode]
      if (cached) {
        applyModeImages(cached)
        return 0
      }

      const [pose, style, appearanceImage, generated, editorInput] =
        await Promise.all([
          readModeImages(mode, 'pose'),
          readModeImages(mode, 'style'),
          readModeImages(mode, 'appearance'),
          readModeImages(mode, 'generated'),
          readModeImages(mode, 'editorSource'),
        ])

      const snapshot = {
        reference: pose[0]?.dataUrl
          ? {
              ...(pose[0].meta || {}),
              dataUrl: pose[0].dataUrl,
              kind: pose[0].meta?.kind || 'file',
            }
          : null,
        styleReference: style[0]?.dataUrl
          ? { ...(style[0].meta || {}), dataUrl: style[0].dataUrl }
          : null,
        appearanceReference: appearanceImage[0]?.dataUrl
          ? { ...(appearanceImage[0].meta || {}), dataUrl: appearanceImage[0].dataUrl }
          : null,
        generatedSheets: generated.map((item) => item.dataUrl).filter(Boolean),
        editorSource: editorInput[0]?.dataUrl
          ? {
              dataUrl: editorInput[0].dataUrl,
              name: editorInput[0].meta?.name || 'editor.png',
            }
          : null,
      }
      modeImagesRef.current[mode] = snapshot
      applyModeImages(snapshot)
      return [pose, style, appearanceImage, generated, editorInput].filter(
        (list) => list.length > 0,
      ).length
    },
    [applyModeImages, readModeImages],
  )

  // Troca de modo: guarda o estado atual no modo de origem e carrega o destino.
  useEffect(() => {
    if (modeRef.current === settings.mode) return
    const previous = modeRef.current
    modeImagesRef.current[previous] = captureModeImages()

    const target = modeBucketsRef.current[settings.mode] || null
    setColumns(typeof target?.columns === 'string' ? target.columns : '1')
    setRows(typeof target?.rows === 'string' ? target.rows : '1')
    setAutoSlice(Boolean(target?.autoSlice))
    setFps(Number.isFinite(target?.fps) ? target.fps : 8)
    setViewMode(
      target?.viewMode === 'frame-by-frame' ? 'frame-by-frame' : 'loop',
    )
    setExportColumns(
      typeof target?.exportColumns === 'string' ? target.exportColumns : '4',
    )
    setAppearance(typeof target?.appearance === 'string' ? target.appearance : '')
    setArtStyle(typeof target?.artStyle === 'string' ? target.artStyle : '')
    setGenerationColumns(
      Number.isFinite(target?.generationColumns)
        ? String(target.generationColumns)
        : '1',
    )
    setGenerationRows(
      Number.isFinite(target?.generationRows)
        ? String(target.generationRows)
        : '1',
    )
    setCorrectionPrompt(
      typeof target?.correctionPrompt === 'string' ? target.correctionPrompt : '',
    )
    setLastGeneration(target?.lastGeneration ?? null)
    setCurrentFrameIndex(0)
    setCorrectionFrame(null)
    setCorrectionError('')
    setModalOpen(false)

    modeRef.current = settings.mode
    if (settings.mode === 'simple') setSimpleStep(1)
    void loadModeImages(settings.mode)
  }, [settings.mode, captureModeImages, loadModeImages])

  // Restaura, uma única vez ao abrir, as imagens do modo ativo.
  useEffect(() => {
    if (restoreLocalRef.current) return
    restoreLocalRef.current = true
    if (!saveSession) return undefined

    ;(async () => {
      try {
        const restored = await loadModeImages(initialSettings.mode)
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
  }, [initialSettings.mode, loadModeImages, pushToast, saveSession])


  const handleConfirmRemoveGenerated = useCallback(async () => {
    setRemoveDialogOpen(false)
    setGeneratedSheets([])
    setFrames([])
    setCorrectionFrame(null)
    setCorrectionPrompt('')
    setCurrentFrameIndex(0)
    setModalOpen(false)
    setModalCandidateFrame(null)
    setModalPreviewFrame(null)
    setLastGeneration(null)
    lastSavedSheetsRef.current = null

    const ok = await deleteLocalImages(imageKey(modeRef.current, 'generated'))
    if (!ok) {
      warnLocalSaveFailure('apagar o resultado salvo')
      return
    }
    pushToast('Resultado gerado removido.', 'info')
  }, [pushToast, warnLocalSaveFailure])

  useEffect(() => {
    if (!removeDialogOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setRemoveDialogOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [removeDialogOpen])

  /**
   * Apaga os dados da sessão salvos neste navegador: imagens de entrada,
   * textos, chaves de API e a imagem gerada. Os logs de requisições ficam
   * intactos (só são apagados na página de logs).
   */
  const handleClearSession = useCallback(async () => {
    setClearingSession(true)
    try {
      const ok = await clearLocalImages()
      if (!ok) {
        warnLocalSaveFailure('apagar os dados salvos')
        return
      }
      clearWorkspaceSettings()
      modeBucketsRef.current = {}
      modeImagesRef.current = {}
      try {
        window.localStorage.removeItem(API_CONFIG_STORAGE_KEY)
      } catch {
        // Armazenamento bloqueado: nada a remover.
      }

      lastSavedSheetsRef.current = null
      setReference(null)
      setReferenceFrames([])
      setReferenceError('')
      setStyleReference(null)
      setAppearanceReference(null)
      setAppearance('')
      setArtStyle('')
      setCorrectionPrompt('')
      setModalPrompt('')
      setCorrectionError('')
      setGeneratedSheets([])
      setFrames([])
      setSlicingResult(false)
      setQuality(null)
      setLastGeneration(null)
      setEditorSource(null)
      setApiKey('')
      setSavedKeys({})
      setSavedModels({})
      setModels([])
      setModelId('')
      setKeyStatus('idle')
      setKeyError('')
      pushToast(
        'Dados salvos neste dispositivo foram apagados. Os logs foram mantidos.',
        'info',
      )
    } finally {
      setClearingSession(false)
    }
  }, [pushToast, warnLocalSaveFailure])

  /* ----------------------------- Modo editor ---------------------------- */
  // Carregar a imagem já a coloca na pipeline como spritesheet atual; a edição
  // acontece na correção em lote ou no editor de cada frame, abaixo.
  const handleEditorFileSelected = useCallback(
    async (file) => {
      try {
        const image = await readImageFile(file)
        setEditorSource({
          dataUrl: image.dataUrl,
          width: image.width,
          height: image.height,
          name: file.name,
        })
        setGeneratedSheets([image.dataUrl])
        setCorrectionFrame(null)
        setCorrectionPrompt('')
        setCorrectionError('')
        setCurrentFrameIndex(0)
        setModalOpen(false)

        try {
          const detected = await detectSpriteGrid(image.dataUrl)
          const total = detected.columns * detected.rows
          setColumns(String(detected.columns))
          setRows(String(detected.rows))
          setAutoSlice(total > 1)
          setExportColumns(String(Math.min(4, Math.max(1, total))))
        } catch (detectError) {
          console.warn('[editor-detect-grid]', detectError)
        }

        pushToast(
          'Imagem carregada. Use a Correção em Lote ou edite um frame abaixo.',
          'info',
        )
        if (image.resized) {
          pushToast(
            `Imagem redimensionada para ${image.width}×${image.height} px para ` +
              'caber no limite.',
            'info',
          )
        }
      } catch (error) {
        pushToast(describeApiError(error), 'error')
      }
    },
    [pushToast],
  )

  const handleEditorClearSource = useCallback(() => {
    setEditorSource(null)
    setGeneratedSheets([])
    setFrames([])
    setCorrectionFrame(null)
    setCorrectionPrompt('')
    setCorrectionError('')
    lastSavedSheetsRef.current = null
    void deleteLocalImages(imageKey('editor', 'editorSource'))
    void deleteLocalImages(imageKey(modeRef.current, 'generated'))
  }, [])

  /* ------------------------ Métrica de qualidade ------------------------ */
  // Avaliada no navegador sempre que os frames exibidos mudam (geração,
  // correção aplicada ou novo recorte da grade). A nota também é anexada à
  // última chamada do histórico, para comparar custo × tempo × qualidade.
  const [quality, setQuality] = useState(null)
  // No modo editor, a comparação de qualidade usa a própria imagem enviada.
  const activeReferenceFrames = useMemo(() => {
    // No editor não existe referência original: só o frame em edição.
    if (settings.mode === 'editor') return []
    return referenceFrames
  }, [settings.mode, referenceFrames])

  useEffect(() => {
    if (frames.length === 0 || slicingResult || generating) {
      if (frames.length === 0) {
        setQuality(null)
      }
      return undefined
    }

    let cancelled = false
    evaluateAnimationQuality({ frames, referenceFrames: activeReferenceFrames })
      .then((report) => {
        if (cancelled || !report) return
        setQuality(report)
        setLastGeneration((current) =>
          current
            ? {
                ...current,
                quality: {
                  score: report.score,
                  pose: report.pose,
                  consistency: report.consistency,
                  pixelArt: report.pixelArt,
                },
              }
            : current,
        )
        setUsageHistory((current) => {
          if (current.length === 0) return current
          const last = current[current.length - 1]
          // Uma falha posterior não deve receber a nota da imagem anterior.
          if (last.status === 'error') return current
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

    return () => {
      cancelled = true
    }
  }, [frames, activeReferenceFrames, slicingResult, generating])

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
    const interval = Math.max(16, Math.round(1000 / Math.max(1, fps)))
    const id = window.setInterval(() => {
      const total = Math.max(referenceFrames.length, frames.length)
      if (total === 0) return
      setCurrentFrameIndex((value) => (value + 1) % total)
    }, interval)
    return () => window.clearInterval(id)
  }, [viewMode, fps, referenceFrames.length, frames.length])

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
        if (saveSession) {
          void putLocalImages(imageKey(modeRef.current, 'pose'), [
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
        }
        setColumns(String(detected.columns))
        setRows(String(detected.rows))
        setAutoSlice(total > 1)
        generationGridEditedRef.current = false
        setGenerationColumns(String(detected.columns))
        setGenerationRows(String(detected.rows))
        setReferenceError('')

        if (total > 1) {
          pushToast(
            `Grade detectada: ${detected.columns}×${detected.rows} (${total} frames). ` +
              'Se estiver errada, ajuste Colunas/Linhas ou Frames a gerar.',
            'info',
          )
        } else {
          pushToast(
            'Nenhuma grade detectada: a imagem será tratada como 1 frame na ' +
              'grade de recorte. Se a folha tiver vários frames, informe a ' +
              'quantidade em “Frames a gerar”.',
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
    [pushToast, saveSession, warnLocalSaveFailure],
  )

  const handleClearReference = useCallback(() => {
    setReference(null)
    setReferenceFrames([])
    setColumns('1')
    setRows('1')
    setAutoSlice(false)
    generationGridEditedRef.current = false
    setGenerationColumns('1')
    setGenerationRows('1')
    setReferenceError('')
    void deleteLocalImages(imageKey(modeRef.current, 'pose')).then((ok) => {
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
        if (saveSession) {
          void putLocalImages(imageKey(modeRef.current, 'style'), [
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
        }
        pushToast('Imagem de referência de estilo carregada.', 'success')
      } catch (error) {
        pushToast(describeApiError(error), 'error')
      }
    },
    [pushToast, saveSession, warnLocalSaveFailure],
  )

  const handleClearStyleReference = useCallback(() => {
    setStyleReference(null)
    void deleteLocalImages(imageKey(modeRef.current, 'style')).then((ok) => {
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
        if (saveSession) {
          void putLocalImages(imageKey(modeRef.current, 'appearance'), [
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
        }
        pushToast('Imagem de referência de aparência carregada.', 'success')
      } catch (error) {
        pushToast(describeApiError(error), 'error')
      }
    },
    [pushToast, saveSession, warnLocalSaveFailure],
  )

  const handleClearAppearanceReference = useCallback(() => {
    setAppearanceReference(null)
    void deleteLocalImages(imageKey(modeRef.current, 'appearance')).then((ok) => {
      if (!ok) warnLocalSaveFailure('apagar a referência de aparência salva')
    })
  }, [warnLocalSaveFailure])

  const handleGenerationColumnsChange = useCallback((value) => {
    generationGridEditedRef.current = true
    if (String(value).trim() === '') {
      setGenerationColumns('')
      return
    }
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) {
      setGenerationColumns(String(Math.min(64, Math.max(1, parsed))))
    }
  }, [])

  const handleGenerationRowsChange = useCallback((value) => {
    generationGridEditedRef.current = true
    if (String(value).trim() === '') {
      setGenerationRows('')
      return
    }
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) {
      setGenerationRows(String(Math.min(64, Math.max(1, parsed))))
    }
  }, [])

  const canGenerate = Boolean(
    apiKey.trim() &&
      modelId &&
      referenceFrames.length > 0 &&
      (appearance.trim() || appearanceReference) &&
      generationGrid.total <= 64 &&
      !generating,
  )

  const generateHint = useMemo(() => {
    if (!apiKey.trim()) return 'Informe e valide sua chave de API para começar.'
    if (!modelId) return 'Valide a chave e escolha um modelo de imagem.'
    if (referenceFrames.length === 0) return 'Envie uma referência de movimento.'
    if (!appearance.trim() && !appearanceReference) {
      return 'Descreva a aparência do personagem ou envie uma imagem de referência.'
    }
    if (generationGrid.total > 64) {
      return `A grade de geração tem ${generationGrid.total} frames, mas o limite é 64 por chamada. Reduza Colunas/Linhas de geração.`
    }
    const hasStyle = Boolean(artStyle.trim() || styleReference)
    return hasStyle
      ? `Pronto para gerar ${requestedFrameCount} frame(s) — grade de geração ${generationGrid.columns}×${generationGrid.rows}, recorte ${effectiveGrid.columns}×${effectiveGrid.rows}.`
      : `Pronto para gerar ${requestedFrameCount} frame(s) — sem estilo definido, a referência de movimento também define o estilo.`
  }, [
    apiKey,
    modelId,
    referenceFrames,
    effectiveGrid,
    generationGrid,
    requestedFrameCount,
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

      // A grade de geração define frame_count e o formato do desenho. É
      // independente da grade de recorte usada para exibir/fatiar a imagem.
      const requestedGrid = {
        columns: generationGrid.columns,
        rows: generationGrid.rows,
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
    generationGrid,
    requestedFrameCount,
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
        frameCount: individual
          ? 1
          : Math.max(frames.length, requestedFrameCount),
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
        // Não aplica direto: pergunta se mantém a atual ou usa a editada,
        // igual à correção por frame.
        setBatchCandidate({ images: result.images, grid: resultGrid })
        pushToast(
          'Correção em lote pronta: escolha manter a atual ou usar a editada.',
          'info',
        )
        return
      } else {
        setBatchCandidate({ images: result.images, grid: null })
        pushToast(
          'Correção em lote pronta: escolha manter a atual ou usar a editada.',
          'info',
        )
        return
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
    requestedFrameCount,
    styleReference,
    appearanceReference,
  ])

  const handleUseBatchCandidate = useCallback(() => {
    if (!batchCandidate) return
    const { images, grid } = batchCandidate
    if (images.length === 1 && grid) {
      setGeneratedSheets(images)
      setColumns(String(grid.columns))
      setRows(String(grid.rows))
      setAutoSlice(frames.length > 1)
    } else {
      setGeneratedSheets(images)
      setFrames(images)
    }
    setBatchCandidate(null)
    setCorrectionPrompt('')
    setCorrectionFrame(null)
    pushToast('Correção em lote aplicada.', 'success')
  }, [batchCandidate, frames.length, pushToast])

  const handleKeepBatchCurrent = useCallback(() => {
    if (!batchCandidate) return
    setBatchCandidate(null)
    pushToast(
      'Correção em lote descartada. A versão anterior foi mantida.',
      'info',
    )
  }, [batchCandidate, pushToast])

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
        frameCount: Math.max(frames.length, requestedFrameCount),
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
    requestedFrameCount,
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

  /* -------------------------- Modo simples ------------------------------ */
  const simpleProps = {
    step: simpleStep,
    onStepChange: setSimpleStep,
    showMetrics: settings.showMetrics,
    api: {
      provider,
      onProviderChange: handleProviderChange,
      apiKey,
      onApiKeyChange: handleApiKeyChange,
      onValidate: handleValidateKey,
      status: keyStatus,
      error: keyError,
      models,
      modelId,
      onModelChange: handleModelChange,
      modelsWarning,
      rememberKey,
      onRememberKeyChange: handleRememberKeyChange,
      onClearKey: handleClearSavedKey,
    },
    reference: {
      reference,
      onFileSelected: handleFileSelected,
      onClearReference: handleClearReference,
      appearance,
      onAppearanceChange: setAppearance,
      appearanceReference,
      onAppearanceFileSelected: handleAppearanceFileSelected,
      onClearAppearanceReference: handleClearAppearanceReference,
      artStyle,
      onArtStyleChange: setArtStyle,
      styleReference,
      onStyleFileSelected: handleStyleFileSelected,
      onClearStyleReference: handleClearStyleReference,
      onGenerate: handleGenerate,
      generating,
      elapsed,
      canGenerate,
      generateHint,
      referenceError,
      onMultipleFiles: () =>
        pushToast(
          'Envie apenas uma imagem por vez em cada campo. Usei a primeira.',
          'info',
        ),
      generationColumns,
      generationRows,
      referenceGrid: effectiveGrid,
      onGenerationColumnsChange: handleGenerationColumnsChange,
      onGenerationRowsChange: handleGenerationRowsChange,
    },
    preview: {
      referenceFrames: activeReferenceFrames,
      frames,
      fps,
      onFpsChange: setFps,
      viewMode,
      onViewModeChange: setViewMode,
      currentFrameIndex,
      onCurrentFrameIndexChange: setCurrentFrameIndex,
      generating,
      referenceBusy,
      generationError,
      slicing: slicingResult,
      onRemoveGenerated: () => setRemoveDialogOpen(true),
      showOriginal: true,
    },
    grid: {
      referenceGrid: effectiveGrid,
      generationColumns,
      generationRows,
      columns,
      rows,
      autoSlice,
      slicing: slicingResult,
      frameCount: frames.length,
      onColumnsChange: setColumns,
      onRowsChange: setRows,
      onAutoSliceChange: setAutoSlice,
    },
    exportPanel: {
      frames,
      columns: exportColumns,
      onColumnsChange: setExportColumns,
      onExportGrid: handleExportGrid,
      onExportGif: handleExportGif,
      exporting,
    },
    metrics: {
      history: usageHistory,
      latest: lastGeneration,
      quality,
      onEditFrame: frames.length > 1 ? handleEditFrame : null,
      onOpenLogs: onOpenLogs ?? (() => {}),
    },
  }

  /* ----------------------------- Layout --------------------------------- */
  return (
    <>
      <main className="relative mx-auto w-full max-w-[1600px] space-y-4 px-4 pt-5 pb-12">
        {settings.mode === 'editor' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-200">
                <PencilLine className="size-3.5" />
                Modo editor
                <span className="font-normal text-slate-400">
                  · edite uma imagem e divida/corrija os frames
                </span>
              </p>
              <button
                type="button"
                onClick={() => handleSettingsChange({ mode: 'advanced' })}
                className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/5"
              >
                Voltar ao modo avançado
              </button>
            </div>

            <EditorMode
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
              source={editorSource}
              onFileSelected={handleEditorFileSelected}
              onClearSource={handleEditorClearSource}
            />
          </>
        ) : settings.mode === 'simple' ? (
          <SimpleMode {...simpleProps} />
        ) : (
          <>
        {/* Faixa 1 — API + inputs, ocupando a largura toda */}
        <section
          aria-label="Configuração e referências"
          className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]"
        >
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
            generationColumns={generationColumns}
            generationRows={generationRows}
            referenceGrid={effectiveGrid}
            onGenerationColumnsChange={handleGenerationColumnsChange}
            onGenerationRowsChange={handleGenerationRowsChange}
          />
        </section>

          </>
        )}

        {settings.mode !== 'simple' && (
          <>
        {/* Faixa 2 — visualização dos frames e grade/exportação */}
        <section
          aria-label="Visualização e grade"
          className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"
        >
          <PreviewPanel
            referenceFrames={activeReferenceFrames}
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
            slicing={slicingResult}
            onRemoveGenerated={() => setRemoveDialogOpen(true)}
            showOriginal={settings.mode !== 'editor'}
          />

          <div className="grid gap-4 md:grid-cols-2 xl:block xl:space-y-4">
            <GridPanel
              referenceGrid={effectiveGrid}
              generationColumns={generationColumns}
              generationRows={generationRows}
              columns={columns}
              rows={rows}
              autoSlice={autoSlice}
              slicing={slicingResult}
              frameCount={frames.length}
              onColumnsChange={setColumns}
              onRowsChange={setRows}
              onAutoSliceChange={setAutoSlice}
            />

            <ExportPanel
              frames={frames}
              columns={exportColumns}
              onColumnsChange={setExportColumns}
              onExportGrid={handleExportGrid}
              onExportGif={handleExportGif}
              exporting={exporting}
            />
          </div>
        </section>

        {/* Faixa 3 — frames individuais e correção em lote */}
        <section
          aria-label="Frames e correção"
          className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
        >
          <AnimationFramesPanel
            frames={frames}
            currentFrameIndex={currentFrameIndex}
            onCurrentFrameIndexChange={setCurrentFrameIndex}
            onEditFrame={handleEditFrame}
            editingFrame={modalOpen ? modalFrameIndex : null}
          />

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
        </section>

        {/* Faixa 4 — métricas e aviso de privacidade */}
        <section aria-label="Métricas e privacidade" className="space-y-4">
          {settings.showMetrics && (
            <UsageSummary
              history={usageHistory}
              latest={lastGeneration}
              quality={quality}
              onEditFrame={frames.length > 1 ? handleEditFrame : null}
              onOpenLogs={onOpenLogs ?? (() => {})}
            />
          )}

          <p className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-[10px] leading-relaxed text-slate-500">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400/80" />
            <span>
              <strong className="font-semibold text-slate-300">
                Privacidade:
              </strong>{' '}
              nada é salvo nos servidores do app. Chave, configurações, textos e
              imagens ficam somente neste navegador, no <code>localStorage</code>{' '}
              e no <code>IndexedDB</code>, e podem ser removidos ao limpar os
              dados do site. Recorte, spritesheet e GIF são processados
              localmente.
            </span>
          </p>
        </section>
          </>
        )}
      </main>

      <LogsPage
        open={logsOpen}
        history={usageHistory}
        onClose={onCloseLogs}
        onClear={handleResetUsage}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={handleSettingsChange}
        onClearSession={handleClearSession}
        clearing={clearingSession}
        onClose={onCloseSettings}
      />

      <BatchEditModal
        open={Boolean(batchCandidate)}
        previous={generatedSheets[0] || frames[0] || null}
        candidate={batchCandidate?.images?.[0] || null}
        onUseCandidate={handleUseBatchCandidate}
        onKeepCurrent={handleKeepBatchCurrent}
      />

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
        showPose={settings.mode !== 'editor'}
      />

      {removeDialogOpen && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setRemoveDialogOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-generated-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0b111c] p-4 shadow-2xl shadow-black/60"
          >
            <h2
              id="remove-generated-title"
              className="text-[13px] font-semibold text-slate-100"
            >
              Remover a imagem gerada?
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              O resultado atual e a cópia salva neste dispositivo serão
              apagados. Esta ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveDialogOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveGenerated}
                className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/25"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
