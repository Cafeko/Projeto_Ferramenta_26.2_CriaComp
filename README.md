# Projeto_Ferramenta_26.2_CriaComp

🎨 SpriteTransfer Web
Crie e adapte animações em pixel art de forma inteligente, sem precisar animar quadro a quadro.

O SpriteTransfer Web é uma ferramenta de criatividade computacional desenvolvida para acelerar a criação de assets para jogos 2D. Ele permite gerar sprites e spritesheets animados completos combinando imagens de referência de movimento com descrições textuais.

🎯 A Ideia do Projeto
Animar personagens em pixel art quadro a quadro é um processo trabalhoso que consome horas (ou dias) de desenvolvedores indie e artistas. O SpriteTransfer Web resolve esse gargalo ao transferir a pose e a fluidez de uma animação de referência para um novo personagem definido pelo usuário.

Em vez de gerar resultados completamente aleatórios a cada tentativa, a ferramenta coloca quem está criando no controle:

Entrada flexível: Utilize imagens ou animações de referência para guiar o movimento do seu personagem.

Personalização visual: Defina a aparência e o estilo de arte desejados por meio de descrições textuais simples.

Ajustes direcionados: Corrija e refine resultados (seja a animação inteira ou um quadro isolado) preservando o histórico e a consistência visual do seu personagem.

Autonomia (BYOK): Suporte ao modelo Bring Your Own Key, permitindo configurar sua própria chave de API e escolher o provedor/modelo de IA da sua preferência.

🚀 Para quem é?
Devs Indie & Solo Developers: Para gerar assets animados rapidamente sem a necessidade de contratar um animador dedicado.

Participantes de Game Jams: Para produzir animações prontas e consistentes em poucas horas sob prazos apertados.

Artistas & Designers: Para explorar variações visuais e rascunhar movimentações de personagens sem redesenhar cada pose do zero.

---

## 🧱 Stack e estrutura

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 19 + Vite 8 + TailwindCSS 4 + Lucide React |
| Backend | Python + FastAPI (Vercel Service / Function) |
| Deploy | Vercel (frontend e API no mesmo domínio) |

```text
.
├── api/
│   ├── __init__.py       # Torna `api` importável (api.index:app)
│   └── index.py          # App ASGI (FastAPI) exportado como `app`
├── src/
│   ├── App.jsx           # Shell: cabeçalho, dashboard e rodapé
│   ├── components/
│   │   ├── MainDashboard.jsx      # Estado global + chamadas de API
│   │   └── dashboard/             # Cards (BYOK, referência, preview, correção, exportação)
│   ├── lib/api.js        # Cliente do backend e normalização de erros
│   ├── utils/
│   │   ├── imagePipeline.js       # Recorte, alinhamento, grade e GIF (Canvas)
│   │   └── presets.js             # Presets Walk/Run/Attack desenhados no navegador
│   ├── index.css         # Tailwind + tema base + xadrez de transparência
│   └── main.jsx
├── tests/
│   └── image-pipeline.html        # 22 testes do pipeline no navegador
├── index.html
├── vite.config.js        # Proxy /api -> http://127.0.0.1:8000
├── vercel.json           # Services: /api/* -> FastAPI, resto -> Vite
├── requirements.txt
└── package.json
```

## 🚀 Rodando localmente (Vite + FastAPI)

Pré-requisitos: **Node.js ≥ 22.12** e **Python ≥ 3.12**.

### 1. Instalar dependências

**Windows (PowerShell):**

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install --upgrade pip
pip install -r requirements.txt
npm.cmd install
```

> **PowerShell bloqueou a ativação?** É a política de execução do Windows, que
> impede scripts `.ps1` (inclusive `Activate.ps1` e `npm.ps1`). Escolha uma:
>
> ```powershell
> # A) liberar apenas nesta janela (temporário, não precisa de admin)
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> .\.venv\Scripts\Activate.ps1
>
> # B) liberar para o seu usuário (permanente, não precisa de admin)
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
>
> **Sem ativar o venv:** chame os executáveis direto pelo caminho:
> `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` e
> `.\.venv\Scripts\python.exe -m uvicorn api.index:app --reload --port 8000`.
>
> Se o comando `python` abrir a Microsoft Store, use o launcher `py`.

**Linux / macOS:**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
npm install
```

### 2. Subir os dois serviços

**Opção A — um comando (recomendado):**

```bash
npm run dev:all
```

**Opção B — dois terminais:**

```bash
# Terminal 1 — API
uvicorn api.index:app --reload --port 8000
# (sem venv ativado: .\.venv\Scripts\python.exe -m uvicorn api.index:app --reload --port 8000)

# Terminal 2 — Frontend
npm run dev
```

### 3. Acessar

| Serviço | URL |
| --- | --- |
| Frontend (Vite) | http://localhost:5173 |
| Health check (direto na API) | http://localhost:8000/api/health |
| Swagger UI | http://localhost:8000/api/docs |

O dashboard principal abre em `http://localhost:5173`. Em desenvolvimento, o
Vite faz proxy de `/api` para a porta `8000`, então não há CORS nem variáveis de
ambiente obrigatórias.

## 🔌 API de geração (BYOK)

O backend é um intermediário sem estado entre o frontend e os provedores. A
chave enviada em cada requisição é usada apenas em memória para chamar o
provedor escolhido; ela **não é gravada nem registrada em log**.

Provedores aceitos: `gemini`, `openai`, `openrouter` e `replicate`.

### `POST /api/models`

Valida a chave e devolve os modelos de imagem/visão disponíveis. Quando o
provedor não permite uma listagem simples (caso do Replicate), a resposta traz
uma lista segura de modelos recomendados e `source: "fallback"`.

```json
{
  "provider": "gemini",
  "api_key": "SUA_CHAVE"
}
```

Resposta:

```json
{
  "provider": "gemini",
  "source": "remote",
  "models": [
    {
      "id": "gemini-nano-banana-2.1",
      "name": "Nano Banana 2.1",
      "description": "Geração e edição de imagens...",
      "supports_reference_images": true
    }
  ],
  "warning": null
}
```

### `POST /api/generate`

```json
{
  "provider": "gemini",
  "api_key": "SUA_CHAVE",
  "model_id": "gemini-nano-banana-2.1",
  "reference_images": ["<base64 ou data URL>"],
  "character_appearance": "Cavaleira de armadura azul, cabelo curto...",
  "art_style": "Pixel art 16-bit, paleta limitada, contorno grosso",
  "frame_count": 16,
  "grid_columns": 4,
  "grid_rows": 4,
  "previous_generated_images": [],
  "correction_prompt": null,
  "target_frame_index": null
}
```

- **Geração do zero** (`correction_prompt` ausente): as `reference_images` são
  usadas como referência de pose/movimento. `frame_count` informa quantos frames
  a saída deve ter (o total detectado na grade da referência, ex.: 16) e
  `grid_columns`/`grid_rows` definem o formato da grade de saída (ex.: 4×4). A
  referência é enviada inteira e a IA deve desenhar o mesmo número de frames, na
  mesma ordem. O resultado é uma spritesheet; a divisão em frames acontece só no
  frontend — e usa a grade real detectada na imagem devolvida.
- **Correção** (`correction_prompt` presente): as `previous_generated_images`
  são a fonte de verdade visual. Se `target_frame_index` for informado, apenas
  aquele frame é corrigido (índice começa em `0`); caso contrário, a correção é
  aplicada a todos os frames.
- **Formatos de imagem**: Base64 puro ou data URL (`data:image/png;base64,...`).
  O backend detecta o MIME real (PNG, JPEG, WebP, GIF ou BMP).
- **Limite de corpo**: a Vercel aceita ~4,5 MB por requisição. Reduza a
  resolução/quantidade de frames antes de enviar.

Resposta:

```json
{
  "provider": "gemini",
  "model_id": "gemini-nano-banana-2.1",
  "mode": "generation",
  "target_frame_index": null,
  "images": ["<base64>"],
  "mime_types": ["image/png"]
}
```

Para exibir no frontend:
`data:${mime_types[i]};base64,${images[i]}`.

### Erros

Todas as falhas previstas voltam com uma mensagem em português e um `code`:

```json
{
  "detail": "Chave de API inválida ou sem permissão no OpenAI. Confira a chave...",
  "code": "invalid_api_key",
  "provider": "openai",
  "provider_status": 401
}
```

Códigos comuns: `invalid_api_key`, `quota_exhausted`, `rate_limit`,
`provider_timeout`, `no_image_returned`, `model_without_image_input`,
`too_many_images`, `payload_too_large`, `invalid_image` e
`target_frame_index_out_of_range`.

### Página de teste (laboratório)

A interface principal já consome a API. O `/laboratorio-api.html` continua
disponível para depurar o backend isoladamente (também em produção, ex.:
`https://spritetransfer-web.vercel.app/laboratorio-api.html`). Ela permite:

1. colar a chave e validar/listar os modelos do provedor;
2. anexar as imagens de referência de pose (redimensionadas para 512 px para
   caber no limite da Vercel);
3. anexar os frames anteriores e escrever a instrução de correção;
4. gerar/corrigir e baixar as imagens retornadas.

A chave fica apenas na memória da aba: não é salva no navegador nem enviada
para outro lugar além do backend do próprio projeto.

## 🖥️ Dashboard principal

`src/components/MainDashboard.jsx` concentra o estado e as chamadas à API; a
interface é dividida em três colunas responsivas (empilham no celular e viram
duas colunas em tablets):

### Coluna esquerda — configuração
- **BYOK:** provedor, chave (com botão `Validar`), lista dinâmica de modelos e
  link `Obter chave` para o console de cada provedor.
- **Referência de movimento:** presets `Idle`, `Walk`, `Jump` e `Attack` ou drag
  & drop de PNG/spritesheet. O app **detecta a grade real da imagem** pelos
  pixels (transparência ou cor de fundo) e mostra os campos **Colunas/Linhas**
  da referência, com botão **detectar** para rodar de novo. É essa grade que
  define quantos frames a IA deve gerar — o painel central só recorta o
  resultado. Ex.: uma spritesheet 4×4 gera 16 frames mesmo que o painel esteja
  exibindo 4 colunas.
- **Prompt:** aparência do personagem e estilo de arte.
- **`[ GERAR NOVO SPRITESHEET ]`** limpa o histórico e gera tudo do zero,
  enviando a referência inteira e o número real de frames para a IA.

### Coluna central — preview e filmstrip
- Player lado a lado com a **animação original** e a **nova animação**, em loop
  sincronizado, controle de **FPS** e **Play/Pause**.
- Filmstrip com os frames PNG numerados e o botão **`[ Editar Frame ]`** em cada
  um (envia `target_frame_index` e corrige só aquele quadro).

### Coluna direita — correção e exportação
- **Correção em lote:** instrução textual aplicada a todos os frames atuais, que
  são enviados como `previous_generated_images` para preservar o contexto.
- **Exportação:** `[ EXPORTAR SPRITESHEET PNG (GRID) ]` e
  `[ EXPORTAR GIF ANIMADO ]`, ambos processados localmente pela Canvas API.

A chave nunca é persistida (nem em `localStorage`): fica só no estado do React.
Os frames e as referências são normalizados para Data URLs antes de ir ao
backend, e o cliente bloqueia o envio quando o Base64 passa do limite da Vercel.

## 🎨 Pipeline local de imagens

`src/utils/imagePipeline.js` concentra o tratamento de imagens que roda
**inteiramente no navegador** (Canvas API), sem custo de servidor. Todas as
funções devolvem Data URLs PNG (ou um `Blob` de GIF) e lançam
`ImagePipelineError` com um `code` estável.

```js
import {
  sliceSpritesheet,
  alignBoundingBox,
  compileSpritesheetGrid,
  exportGIF,
} from './utils/imagePipeline'

// 1. separa a spritesheet gerada pela IA (4 colunas × 2 linhas)
const frames = await sliceSpritesheet(spritesheetFile, 4, 2)

// 2. recentraliza cada frame (evita a animação "tremer")
const aligned = await Promise.all(frames.map((frame) => alignBoundingBox(frame)))

// 3. remonta a spritesheet final em grade para download
const sheet = await compileSpritesheetGrid(aligned, 4)

// 4. gera e baixa um GIF de preview a 8 FPS
await exportGIF(aligned, 8)
```

- **`sliceSpritesheet(imageFile, columns, rows)`** — recorta a grade em frames
  PNG transparentes, na ordem de leitura (linha a linha).
- **`detectSpriteGrid(imageFile, options)`** — detecta `colunas × linhas` da
  spritesheet pelos pixels (alpha ou diferença em relação à cor de fundo dos
  cantos), com limite de 64 células; usado para saber quantos frames a IA deve
  gerar e para recortar a imagem devolvida mesmo se o modelo mudar a grade.
- **`alignBoundingBox(base64Frame, options)`** — usa `getImageData()` para
  achar a caixa dos pixels com alpha > 0 e recentraliza o sprite. Mantém o
  tamanho original por padrão; `{ size: 64 }` padroniza em 64x64,
  `{ anchor: 'bottom', padding: 2 }` apoia os pés no chão.
- **`compileSpritesheetGrid(base64Frames, columns)`** — compila os frames em
  uma grade única, com células do tamanho do maior frame e fundo transparente.
- **`exportGIF(base64Frames, fps, options)`** — normaliza os frames para o
  mesmo canvas, calcula uma paleta global com transparência de 1 bit (encoder
  GIF próprio em JS, sem dependência externa) e dispara o download (ou devolve
  o `Blob` com `{ download: false }`).

Os testes de navegador ficam em `tests/image-pipeline.html`: com `npm run dev`,
abra `http://localhost:5173/tests/image-pipeline.html` (22 verificações de
recorte, alinhamento, compilação, GIF e erros).

## ☁️ Deploy na Vercel

1. Suba o repositório para o GitHub.
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
3. Não é preciso escolher preset nem configurar build: o `vercel.json` já
   declara os dois **services** (`frontend` com Vite e `backend` com FastAPI).
4. Clique em **Deploy**. A Vercel instala o `package.json` para o frontend e o
   `requirements.txt` para o backend, cada um no seu serviço.

Alternativa via CLI:

```bash
npm i -g vercel
vercel login
vercel          # preview
vercel --prod   # produção
```

Para rodar os dois serviços localmente como na Vercel:

```bash
npm run vercel:dev   # equivale a: vercel dev --local
```

> No Windows, se o CLI falhar com `EPERM` ao criar symlinks, habilite o **Modo
> de Desenvolvedor** do Windows ou use o fluxo `uvicorn` + `npm run dev`.

### Como o roteamento funciona

- `vercel.json` usa **Vercel Services** (disponível no plano Hobby):
  - `frontend` → Vite, `root: "."`, build em `dist`.
  - `backend` → FastAPI, `root: "."`, entrypoint `api.index:app`.
- O rewrite `/api/(.*)` → serviço `backend` **preserva o caminho original**:
  `/api/health` chega ao FastAPI como `/api/health`.
- Qualquer outra rota vai para o serviço `frontend`, que tem fallback de SPA
  para `/index.html`.
- Em produção não é necessário configurar `VITE_API_BASE_URL`: o frontend
  chama a API pelo mesmo domínio.

> **Por que não um rewrite direto para `api/index.py`?**
> Na Vercel atual `api/index.py` é exposto na rota `/api`, e um `rewrite`
> substitui o caminho que a aplicação enxerga. Apontar `/api/(.*)` para
> `/api/index.py` faria o FastAPI receber sempre `/api/index.py` — e não
> `/api/health`. O modelo de Services mantém o caminho intacto e é o mecanismo
> oficial para Vite + FastAPI no mesmo projeto. A estrutura de arquivos
> continua exatamente a mesma.

## 🔐 Observações

- **BYOK**: as chaves são enviadas pelo frontend a cada chamada de
  `/api/models` ou `/api/generate` e usadas apenas em memória no backend. Não
  coloque chaves em variáveis `VITE_*`: tudo que começa com `VITE_` vai para o
  bundle público.
- O backend não guarda histórico de imagens. O frontend deve manter os frames
  anteriores e reenviá-los em `previous_generated_images` ao corrigir.
- A geração pode levar dezenas de segundos. O `vercel.json` configura
  `maxDuration: 300` para a função do backend; o Replicate é acompanhado por
  polling com limite próprio (`REPLICATE_TIMEOUT_SECONDS`, padrão 200 s).
- A Vercel usa **Python 3.12** por padrão nas Functions; o `requirements.txt`
  já está compatível com 3.12+.
- `CORS_ORIGINS` é opcional e só é necessário se o frontend for servido de
  outro domínio.
- Timeouts e limites podem ser ajustados por variáveis de ambiente:
  `PROVIDER_CONNECT_TIMEOUT_SECONDS`, `PROVIDER_READ_TIMEOUT_SECONDS`,
  `MAX_INPUT_IMAGE_BYTES`, `MAX_OUTPUT_IMAGE_BYTES` e
  `REPLICATE_TIMEOUT_SECONDS`.
