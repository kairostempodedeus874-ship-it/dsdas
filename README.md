# DENTAL IA - Servico de WhatsApp (Render)

Este pequeno servidor e a **ponte** entre o WhatsApp da clinica e o cerebro do robo.
A IA, a agenda e os pacientes ficam no Readdy Backend. Aqui roda so o "cabo":

1. Conecta o numero escaneando um QR Code.
2. Envia cada mensagem recebida para a IA analisar.
3. Devolve a resposta no WhatsApp e entrega as mensagens escritas pelo painel.

> Nenhuma chave de IA fica aqui. Este servico guarda apenas a senha da ponte.

---

## IMPORTANTE - todos os arquivos ficam na RAIZ

Este pacote NAO tem subpasta. Os 8 arquivos abaixo devem ficar todos no mesmo nivel
da raiz do repositorio:

    package.json
    render.yaml
    index.js
    bridge.js
    whatsapp.js
    README.md
    .env.example
    .gitignore

Se algum deles for para dentro de uma pasta (por exemplo src/), o Render quebra com
"Error: Cannot find module .../index.js".

---

## Passo 1 - Subir para o GitHub

1. Descompacte o arquivo **dentalia-whatsapp.zip** que voce baixou do painel.
2. No GitHub, crie um repositorio novo (pode ser privado), por exemplo **dentalia-whatsapp**.
3. Envie TODOS os arquivos para a raiz do repositorio.

Pelo site do GitHub: **Add file > Upload files**, selecione todos os arquivos soltos
(e o .env.example) e confirme o commit.

Confira depois: abra a pagina inicial do repositorio. Voce deve ver **index.js**,
**package.json**, **bridge.js** e **whatsapp.js** na mesma lista, sem clicar em nada.

---

## Passo 2 - Criar o servico no Render

### Opcao A - Blueprint (mais rapido, usa o render.yaml)

1. Entre em https://dashboard.render.com
2. Clique em **New > Blueprint**
3. Escolha o repositorio que voce acabou de criar
4. O Render le o **render.yaml** e cria o servico e o disco automaticamente
5. Preencha as variaveis pedidas e confirme

### Opcao B - Web Service manual

1. Clique em **New > Web Service** e escolha o repositorio
2. Preencha:

| Campo | Valor |
|---|---|
| Name | dentalia-whatsapp |
| Root Directory | deixe VAZIO |
| Runtime | Node |
| Build Command | npm install |
| Start Command | node index.js |
| Plan | Starter (necessario para o disco da sessao) |

3. Em **Advanced**, adicione um **Disk**:

| Campo | Valor |
|---|---|
| Name | wa-session |
| Mount Path | /var/data |
| Size | 1 GB |

> O disco e o que faz o WhatsApp **nao pedir QR novo** a cada deploy ou reinicio.

---

## Passo 3 - Variaveis de ambiente

Em **Environment Variables**, adicione:

| Nome | Valor |
|---|---|
| BRIDGE_URL | https://vouf0jzspa5glm7d1r7w.helloreaddy.com/functions/v1/wa-agent |
| WA_BRIDGE_SECRET | a MESMA senha que voce cadastrou como WA_BRIDGE_SECRET no backend |
| SUPABASE_ANON_KEY | sb_publishable_iDnRFJLBJDSeCuJiKlSvMes3qKbxwzWJ |
| AUTH_DIR | /var/data/auth |
| TZ | America/Sao_Paulo |

Clique em **Create Web Service** e espere o deploy terminar.
Quando os logs mostrarem **ouvindo na porta** e **conectado como ...**, deu certo.

---

## Passo 4 - Colar o link do Render no painel

1. Copie o endereco do servico no topo do Render (algo como
   **https://dentalia-whatsapp.onrender.com**). Nao copie o link do dashboard.
2. Abra o painel do DENTAL IA e va em **Robo WhatsApp**, aba **Conexao**.
3. Cole esse endereco no cartao **Endereco do servico (Render)** e clique em **Salvar**.
4. O painel passa a consultar o servico a cada 6 segundos e mostra o **QR Code
   direto ali**, sem depender de o Backend estar respondendo.

> Atencao: esse link NAO vai na variavel BRIDGE_URL. BRIDGE_URL e o endereco do
> cerebro (Backend). Se voce inverter os dois, a ponte chama a si mesma e fica muda.

---

## Passo 5 - Conectar o WhatsApp

1. Com o QR Code na tela do painel, pegue o celular da clinica.
2. **WhatsApp > Configuracoes > Dispositivos conectados > Conectar dispositivo**.
3. Aponte a camera para o QR.
4. O status vira **Conectado** e o numero aparece no painel.

---

## Rotas que este servico expoe

| Rota | Para que serve |
|---|---|
| GET /health | saber se o servico esta de pe |
| GET /api/status | status + QR Code em imagem |
| GET /api/diagnose | teste completo: variaveis + Backend + sessao |
| POST /api/reset | apaga a sessao salva e gera QR novo |

---

## Problemas comuns

**Error: Cannot find module '/opt/render/project/src/index.js'**
O arquivo index.js nao esta na raiz do repositorio. Veja a secao IMPORTANTE acima.

**O painel diz que o servico nao esta online**
O Render ainda esta construindo, ou o endereco colado esta errado. Abra o /health no navegador.

**Acesso negado ao conectar**
O WA_BRIDGE_SECRET do Render esta diferente do que esta salvo no backend.

**A IA nao responde**
Falta a chave GEMINI_API_KEY no backend. Sem ela a mensagem e gravada, mas fica sem resposta.

**Fica pedindo QR toda hora**
Falta o disco em /var/data ou o servico esta no plano gratuito.

---

## Aviso importante

Esta conexao usa o WhatsApp Web (nao oficial). E a forma mais rapida de comecar, mas
o WhatsApp pode bloquear numeros usados para disparo em massa. Para producao seria,
o caminho e migrar para a Cloud API oficial da Meta: o cerebro do robo continua igual,
so troca este arquivo de transporte.
