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
│   ├── App.jsx           # Cabeçalho + teste do health check
│   ├── index.css         # Tailwind + tema base
│   └── main.jsx
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

O botão **“Testar health check”** no cabeçalho chama `GET /api/health`.
Em desenvolvimento, o Vite faz proxy de `/api` para a porta `8000`, então não
há CORS nem variáveis de ambiente obrigatórias.

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
  "previous_generated_images": [],
  "correction_prompt": null,
  "target_frame_index": null
}
```

- **Geração do zero** (`correction_prompt` ausente): as `reference_images` são
  usadas como referência de pose/movimento. Com mais de um frame, o prompt pede
  uma spritesheet horizontal na mesma ordem das referências.
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

Enquanto a interface principal ainda não consome a API, use
`/laboratorio-api.html` (também disponível em produção, ex.:
`https://spritetransfer-web.vercel.app/laboratorio-api.html`). Ela permite:

1. colar a chave e validar/listar os modelos do provedor;
2. anexar as imagens de referência de pose (redimensionadas para 512 px para
   caber no limite da Vercel);
3. anexar os frames anteriores e escrever a instrução de correção;
4. gerar/corrigir e baixar as imagens retornadas.

A chave fica apenas na memória da aba: não é salva no navegador nem enviada
para outro lugar além do backend do próprio projeto.

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
