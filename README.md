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
│   ├── lib/localStore.js # Persistência local (localStorage + IndexedDB)
│   ├── utils/
│   │   ├── imagePipeline.js       # Recorte, alinhamento, grade e GIF (Canvas)
│   │   ├── qualityMetrics.js      # Nota de qualidade (pose, consistência, pixel art)
│   │   └── presets.js             # Presets guardados (Walk/Run/Attack) para uso futuro
│   ├── index.css         # Tailwind + tema base + xadrez de transparência
│   └── main.jsx
├── tests/
│   ├── image-pipeline.html        # 22 testes do pipeline no navegador
│   └── quality-metrics.html       # 18 testes da métrica de qualidade
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

No Replicate, o `aspect_ratio` é derivado da grade de saída: se o modelo declara
a proporção exata, ela é usada; caso contrário, o backend prefere
`match_input_image`/`auto` (para preservar a proporção da folha de referência) e
nunca envia um valor fora da lista aceita pelo modelo — por exemplo, `21:9` em
modelos que só chegam a `16:9`. Se mesmo assim o provedor recusar apenas a
proporção, a requisição é repetida uma vez sem esse campo.

O backend **nunca troca o modelo escolhido pelo usuário**. Se o modelo falhar
(credencial interna, erro do modelo, limite etc.), o erro volta com a mensagem
explicativa e o nome do modelo, e a decisão de gerar com outro modelo é do
usuário.

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
  "appearance_images": ["<base64 ou data URL opcional>"],
  "style_images": ["<base64 ou data URL opcional>"],
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
  usadas **apenas como referência de pose/posição** (template técnico de layout,
  quantidade de frames e posicionamento), nunca como referência visual.
  `appearance_images` (opcional) definem **apenas a identidade do personagem**
  (roupa, cores, cabelo, proporções, equipamento), sem afetar pose nem estilo.
  `style_images` (opcional) definem **apenas o estilo visual**: pixel density,
  paleta, contorno, sombreamento e nível de detalhe. O texto `art_style` também
  define o estilo. Se nem imagem nem texto de estilo forem enviados, a própria
  referência de movimento também passa a valer como estilo. `frame_count`
  informa quantos frames a saída deve ter. No frontend ele vem da **grade de
  geração (Colunas × Linhas)** do campo **Frames a gerar**, que é **independente**
  da grade de recorte: se a detecção falhar e a imagem de recorte ficar 1×1, o
  usuário ainda pode informar 4×2 (= 8 frames), e a IA deve desenhar 8 frames
  nessa grade. `grid_columns`/`grid_rows` enviados são a grade de geração; o
  backend a normaliza para uma linha se não bater com `frame_count`. A referência
  é enviada inteira e a IA deve desenhar o número pedido, na mesma ordem. O
  resultado é uma spritesheet; a divisão em frames acontece só no frontend, com
  a grade de recorte aplicada à referência e ao resultado.
- **Correção** (`correction_prompt` presente): as `previous_generated_images`
  são a fonte de verdade visual.
  - **Frame individual:** envie somente aquele frame e `target_frame_index: 0`
    (o índice é relativo às imagens enviadas). O backend devolve um único frame.
  - **Em lote:** envie a **spritesheet inteira** em uma única imagem, com
    `target_frame_index: null`, `frame_count` e `grid_columns`/`grid_rows`. O
    backend devolve a folha inteira corrigida na mesma grade.
  - Depois de uma correção individual, o frontend remonta a spritesheet com
    todos os frames para exportação e para as próximas correções em lote.
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

Todas as falhas previstas voltam com uma mensagem em português no mesmo
formato: **o que aconteceu** e **o que fazer em seguida**. A mensagem não
depende de um provedor específico; quando ajuda, cita o modelo ou o provedor.

```json
{
  "detail": "A chave de API foi recusada pelo provedor (inválida, expirada ou sem permissão). Confira a chave no painel do provedor, valide novamente e, se necessário, gere uma nova.",
  "code": "invalid_api_key",
  "provider": "openai",
  "provider_status": 401
}
```

| Categoria | Códigos | O que a mensagem indica |
|---|---|---|
| Chave/conta | `invalid_api_key`, `quota_exhausted`, `rate_limit` | chave recusada, sem saldo/cota ou requisições demais |
| Imagens | `invalid_image`, `image_too_large`, `payload_too_large`, `missing_images`, `missing_previous_images`, `too_many_images`, `invalid_provider_image`, `empty_provider_image`, `provider_image_too_large`, `download_failed`, `download_timeout` | arquivo inválido/grande, limite de tamanho, quantidade de referências ou falha ao baixar a imagem gerada |
| Requisição | `invalid_request`, `validation_error`, `invalid_target_frame`, `target_frame_index_out_of_range` | parâmetro inválido ou combinação incorreta |
| Modelo | `model_not_found`, `invalid_model_id`, `invalid_model_schema`, `unsupported_model_input`, `model_without_image_input`, `provider_model_error`, `no_image_returned` | modelo inexistente, incompatível, que falhou ou terminou sem imagem |
| Provedor | `provider_auth_failed`, `provider_unavailable`, `provider_timeout`, `generation_failed`, `generation_canceled`, `safety_blocked`, `connection_error`, `network_error`, `invalid_provider_response`, `provider_error` | falha interna, indisponibilidade, limite ou bloqueio do provedor |
| Servidor | `internal_error`, `response_too_large` | erro inesperado do backend ou resposta grande demais |

`provider_auth_failed` indica que o provedor não conseguiu autenticar o modelo
num serviço upstream (credencial interna dele). **Não é a sua chave** nem os
dados enviados: tente novamente em alguns minutos, escolha outro modelo ou outro
provedor.

`provider_model_error` indica que o modelo falhou internamente no provedor
(ex.: `ModelError ... E002`). Também não é a sua chave; tente novamente ou troque
de modelo.

O backend **nunca troca o modelo escolhido**; o erro volta para o usuário
decidir. Os detalhes técnicos do provedor (`details`) acompanham a resposta para
diagnóstico, mas a mensagem principal é sempre acionável.

### Avisos locais (sem `code` de API)

Além dos erros do backend, a interface avisa quando a ação não pode continuar:

- **Chave aceita, mas nenhum modelo de imagem listado** — confira o acesso da
  conta no provedor ou use outra chave.
- **Grade inválida ou pequena demais para a imagem** — o erro aparece no card da
  referência, pedindo para ajustar Colunas/Linhas ou usar uma imagem maior.
- **Falha ao recortar o resultado** — um aviso explica que a grade não pôde ser
  aplicada e que a folha inteira está sendo exibida.
- **Correção sem frames** — aviso para gerar/carregar frames antes de corrigir.
- **Grade acima de 64 frames** — o botão de gerar fica bloqueado e o texto
  explica o limite por chamada.
- **Armazenamento local bloqueado/cheio** — aviso de que a chave, as
  configurações ou as imagens não serão lembradas ao recarregar.
- **Falha ao restaurar a sessão anterior** — aviso de que o armazenamento local
  pode estar bloqueado, sem impedir o uso da sessão atual.

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
- **Referência de movimento:** drag & drop de PNG/spritesheet. O app **detecta
  uma grade provável** pelos pixels (transparência ou cor de fundo) apenas para
  pré-preencher a grade de recorte e a de geração. A **grade de recorte** (painel
  central) só exibe/fatia; a **grade de geração** fica em **Frames a Gerar**
  (nesta coluna), é independente e define `frame_count` — por exemplo, uma folha
  de 8 frames detectada como 1×1 ainda pode ser gerada em 4×2 (= 8 frames).
- **Frames a Gerar:** colunas × linhas que a IA deve desenhar, dentro do card
  **Referência de Movimento**, junto do upload. Não altera o recorte.
- **Presets rápidos:** removidos da interface; o gerador procedural continua
  guardado em `src/utils/presets.js` para uso futuro.
- **Prompt:** aparência do personagem e estilo de arte. A aparência pode ser
  descrita em texto e/ou enviada como **imagem de referência de aparência**
  (identidade apenas: roupa, cores, cabelo, equipamento), sem afetar pose ou
  estilo. O estilo pode ser descrito em texto e/ou enviado como **imagem de
  referência de estilo** independente (clique ou arraste o arquivo para a
  área). A imagem de pose define apenas poses/posições; a de estilo define
  apenas a aparência visual. Sem texto e sem imagem de estilo, a referência de
  movimento também vale como estilo.
- **`[ GERAR NOVO SPRITESHEET ]`** limpa o histórico e gera tudo do zero,
  enviando a referência inteira e o número real de frames para a IA.

### Coluna central — preview e filmstrip
- Player lado a lado com a **animação original** e a **nova animação**, com
  seletor de **Modo: Frame a frame** ou **Animação**.
  No modo **Frame a frame** aparecem **Anterior/Próximo** e o campo **Frame N de
  M** (navegação circular: do último volta ao primeiro e vice-versa). No modo
  **Animação** aparece um **slider de FPS (1–60)** com o valor em `fps`.
- Cada quadro tem **zoom (100%–800%)**, **arraste** para reposicionar e
  **tela cheia** (`Esc` fecha). A roda do mouse e os botões `−`/`+` controlam o
  zoom; clicar na porcentagem, dar duplo clique ou pressionar `0` redefine.
  O zoom/posição é mantido ao navegar entre frames e volta ao normal quando o
  tamanho da imagem muda.
- Na **tela cheia** também há **Anterior/Próximo**, alternância entre
  **Animação** e **Frame a frame** e o controle de **FPS** quando em animação;
  `←`/`→` trocam de frame e `Esc` fecha.
- **Grade de Recorte:** fatia a referência e o resultado usando Colunas/Linhas.
  A quantidade de frames desenhada pela IA vem de **Frames a Gerar**, na coluna
  esquerda, e não é alterada por esta grade.
- Filmstrip com os frames PNG numerados e o botão **`[ Editar Frame ]`** em cada
  um. A janela de edição se ajusta à tela (com rolagem) e a correção individual
  envia só aquele frame. A correção é guardada como **candidata**: a janela
  mostra o frame atual e o corrigido e só substitui quando você escolhe
  `[ USAR FRAME CORRIGIDO ]` (ou descarta com `[ MANTER FRAME ATUAL ]`). Depois
  de aplicar, a spritesheet é remontada automaticamente.

### Coluna direita — correção e exportação
- **Correção em lote:** instrução textual aplicada à spritesheet inteira, enviada
  como uma única imagem em `previous_generated_images` para preservar o contexto.
- **Exportação:** `[ EXPORTAR SPRITESHEET PNG (GRID) ]` e
  `[ EXPORTAR GIF ANIMADO ]`, ambos processados localmente pela Canvas API.

### Persistência local (por dispositivo)

Nada de chave, configuração ou imagem é gravado no servidor. O que fica salvo é
apenas no navegador em uso:

- **`localStorage`** — chave de API por provedor e modelo preferido
  (`spritetransfer:api-config`), configurações e textos da sessão
  (`spritetransfer:workspace`) e histórico de métricas
  (`spritetransfer:usage-history`).
- **IndexedDB** (`spritetransfer-local`) — imagens de referência de pose, estilo
  e aparência, além do último spritesheet gerado, guardadas como Blob.

Ao abrir o site, a sessão anterior é restaurada automaticamente (configurações e
imagens). O escopo é a origem + navegador + perfil: **não** aparece em outro
dispositivo ou navegador, não é sincronizado e some ao limpar os dados do site.
O botão **“Limpar imagens salvas neste dispositivo”** (card Privacidade) apaga só
as imagens do IndexedDB; a tela atual continua até recarregar. Desmarcar “Salvar
chave neste navegador” mantém a chave só na memória da aba.

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

## 📊 Métricas: tempo, custo e qualidade

O painel **Métricas** mostra, para cada chamada à IA, o tempo, o custo e a
**qualidade** do resultado, além da média acumulada. A qualidade é calculada
em `src/utils/qualityMetrics.js`, **no navegador e sem chamar a IA** (avaliar
não pode gerar custo nem tempo extra). A nota vai de 0 a 100 e mede a
promessa central da ferramenta: transferir a pose da referência para um
personagem consistente, em pixel art utilizável.

| Componente | Peso | Como é medido |
| --- | --- | --- |
| Fidelidade de pose | 45% | IoU suave entre a silhueta de cada frame gerado e a do frame de referência correspondente, numa grade 24×24 normalizada (tamanho e posição do sprite não importam) |
| Consistência do personagem | 35% | Interseção do histograma de cores de cada frame com o histograma médio da animação |
| Pixel art utilizável | 20% | Número de cores dominantes (que cobrem 95% do personagem) e tipo de fundo (transparente > sólido > cenário) |

- Frames vazios ou faltando multiplicam a nota pela fração de frames válidos.
- Sem referência fatiada (uma imagem para vários frames), a pose não é
  avaliada e o peso dela é redistribuído entre os outros dois componentes.
- O frame que destoa da média (10 pontos abaixo ou mais) aparece com um
  atalho para a correção individual.
- A nota é heurística: serve para comparar tentativas (modelos, prompts,
  correções) entre si, não como verdade absoluta.

Testes: com `npm run dev`, abra `http://localhost:5173/tests/quality-metrics.html`
(18 verificações com sprites sintéticos).

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
