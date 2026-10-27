# MS Moradores — PropTech

Microsserviço de **Moradores** do sistema PropTech (Gestor de Manutenção de
Condomínios — Projeto Integrador, Senac RJ). Responsável pelo cadastro de blocos,
imóveis, moradores, pelas relações de ocupação entre morador e imóvel, e pela
**autenticação** de todo o sistema (síndico e morador comum).

É um dos três microsserviços do PropTech — os outros dois (Financeiro e Serviços)
têm bancos próprios e consultam este serviço via HTTP para validar `imovel_id` e
`morador_id`, e consomem os eventos que ele publica no RabbitMQ.

---

## Sumário

- [Endereços do ambiente](#endereços-do-ambiente)
- [Stack técnica](#stack-técnica)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [Autenticação e autorização](#autenticação-e-autorização)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Guia de instalação do zero (outra máquina)](#guia-de-instalação-do-zero-outra-máquina)
- [Deploy (Jenkins)](#deploy-jenkins)
- [Banco de dados](#banco-de-dados)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Referência da API](#referência-da-api)
- [Eventos RabbitMQ](#eventos-rabbitmq)
- [Decisões de design](#decisões-de-design)
- [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)

---

## Endereços do ambiente

| Componente | Endereço público | Endereço privado (rede do Senac) |
|---|---|---|
| Front-end | <http://academico3.rj.senac.br/condominio> | <http://10.136.38.50:7520> |
| Gateway | <http://academico3.rj.senac.br/condominio/gateway> | <http://10.136.38.50:7521> |
| **Microsserviço 1 — Moradores (este projeto)** | <http://academico3.rj.senac.br/condominio/morador> | <http://10.136.38.50:7522> |
| Banco de dados (MySQL 5.7) | — | `edumysql.acesso.rj.senac.br:3306` (banco `20262m_prj5_condominio_morador`) |

O servidor repassa as requisições **mantendo** o caminho `/condominio/morador`, por isso a API usa esse prefixo
em todas as rotas. Exemplos: `POST /condominio/morador/auth/login` e o Swagger em `/condominio/morador/docs`.

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | [NestJS](https://nestjs.com/) 10 |
| ORM | [Prisma](https://www.prisma.io/) 7.10 (generator `prisma-client`, driver adapter `@prisma/adapter-mariadb`) |
| Banco de dados | MySQL 5.7 (servidor da faculdade, banco `20262m_prj5_condominio_morador`) |
| Autenticação | JWT (`@nestjs/jwt` + `passport-jwt`), esquema Bearer |
| Hash de senha | `bcryptjs` |
| Validação | `class-validator` / `class-transformer` |
| Mensageria | RabbitMQ (`@nestjs/microservices`, transporte RMQ) |
| Linguagem | TypeScript 5 |
| Segredos / variáveis | [Infisical](https://infisical.com/) (ambiente `dev`), com `.env` como alternativa |

## Arquitetura

O serviço segue a arquitetura em camadas padrão do NestJS:

```
Requisição HTTP
      │
      ▼
 Controller          valida DTO, aplica guards (JwtAuthGuard, RolesGuard)
      │
      ▼
  Service            regras de negócio, acesso ao banco via Prisma
      │
      ▼
PrismaService         client único, injetado globalmente (PrismaModule é @Global)
      │
      ▼
   MySQL              banco condominio_moradores
```

Rotas protegidas (a maioria) exigem `Authorization: Bearer <token>`, validado pelo
`JwtAuthGuard`. Perfis de acesso (`SINDICO` / `MORADOR`) são checados pelo
`RolesGuard`, com o decorator `@Roles(...)`.

Após operações relevantes, os services publicam eventos no RabbitMQ através do
`EventsService` (ver [Eventos RabbitMQ](#eventos-rabbitmq)), consumidos pelos
microsserviços Financeiro e Serviços.

## Modelo de dados

Cinco tabelas no banco `condominio_moradores`, espelhadas 1:1 em `prisma/schema.prisma`:

```
bloco (1) ──────< imovel (1) ──────< morador_imovel >────── (1) morador
                                          │
                                          │ usuario_id (FK nullable)
                                          ▼
                                       usuario
```

| Tabela | O que representa |
|---|---|
| `bloco` | Um bloco/torre do condomínio |
| `imovel` | Uma unidade (apartamento ou cobertura), pertence a um bloco |
| `morador` | Uma pessoa cadastrada no condomínio (síndico ou morador comum) |
| `usuario` | Uma conta de acesso ao sistema (login + senha com hash + perfil) |
| `morador_imovel` | A relação de ocupação entre um morador e um imóvel (proprietário, inquilino, morador ou temporada) |

**Ponto importante do modelo**: `usuario` **não tem** chave estrangeira direta para
`morador`. O vínculo é feito ao contrário — `morador_imovel.usuario_id` (nullable)
aponta para `usuario`. Isso significa que:

- Uma conta de acesso só existe de fato "amarrada" a uma pessoa através de pelo
  menos uma relação de ocupação.
- Um mesmo `usuario` pode ser referenciado por **mais de uma** linha de
  `morador_imovel` (ex.: alguém que é proprietário de dois imóveis) — desde que
  todas apontem para o mesmo `morador_id`.
- Para descobrir o `morador_id` de um usuário logado, é preciso consultar
  `morador_imovel WHERE usuario_id = :id` — é exatamente isso que o `AuthService`
  faz no login.

Todas as tabelas têm uma coluna `*_status` (inteiro, `1` = ativo / `0` = inativo).
Nenhum `DELETE` do CRUD apaga linha — todos fazem soft-delete via essa coluna.

## Autenticação e autorização

### Fluxo de login

1. Cliente envia `POST /condominio/morador/auth/login` com `usuarioLogin` e `senha`.
2. `AuthService` busca o `usuario` pelo login e confere `usuario_status = 1`.
3. A senha é comparada com `usuario_senha_hash` via `bcrypt.compare()`.
4. Se válida, o serviço resolve o `moradorId` consultando `morador_imovel` pelo
   `usuario_id` (ver seção anterior).
5. `usuario_ultimo_acesso` é atualizado para a data/hora atual.
6. Um JWT é assinado (`jsonwebtoken`, via `@nestjs/jwt`) contendo:

   ```json
   {
     "sub": 42,
     "usuarioId": 42,
     "moradorId": 7,
     "usuarioPerfil": "MORADOR",
     "iat": 1730000000,
     "exp": 1730028800
   }
   ```

7. O cliente guarda o token e passa a enviá-lo em `Authorization: Bearer <token>`
   em toda chamada protegida.

### Guards

- **`JwtAuthGuard`** — valida a assinatura do token (`JwtStrategy`) e injeta o
  payload decodificado em `req.user`. A cada requisição o `JwtStrategy` também
  consulta o `usuario` no banco: se a conta foi desativada (`usuario_status = 0`)
  ou removida, o token **já emitido deixa de valer na hora** (401), sem esperar a
  expiração. O perfil usado pelo `RolesGuard` também vem do banco, então rebaixar
  um síndico tem efeito imediato.
- **`RolesGuard`** + **`@Roles('SINDICO' | 'MORADOR')`** — compara
  `req.user.usuarioPerfil` com os perfis exigidos pela rota. Sem `@Roles(...)`,
  qualquer perfil autenticado passa.
- **`@CurrentUser()`** — decorator de parâmetro que extrai `req.user` já validado,
  usado para pegar o `moradorId` sem nunca confiar no que o cliente manda no corpo
  da requisição (é assim que os outros microsserviços também devem tratar
  `POST /reserva` e `POST /ocorrencia`, por exemplo).

### Regra geral de autorização neste serviço

| Operação | Quem pode |
|---|---|
| `POST /condominio/morador/auth/login` | qualquer um (rota pública) |
| `GET` de bloco e de imóvel (lista e detalhe) | qualquer usuário autenticado (no detalhe do imóvel, o `MORADOR` não vê CPF/e-mail/telefone dos moradores vinculados) |
| `GET` da **lista** de moradores e da **lista** de relações | só `SINDICO` (dados pessoais — LGPD) |
| `GET /morador/:id` e `GET /morador-imovel/:id` | `SINDICO` (qualquer registro) ou o próprio morador (`moradorId` do token); outro morador recebe `403` |
| Escrita (`POST` / `PATCH` / `DELETE`) de bloco / imóvel / morador / relação | só `SINDICO` |
| Tudo em `usuario` (criar conta, listar, trocar senha, revogar) | só `SINDICO` |

## Estrutura de pastas

```
ms-moradores/
├── prisma/
│   ├── schema.prisma          # schema do banco condominio_moradores
│   └── migrations/            # migrations (criação das tabelas)
├── prisma.config.ts           # config do Prisma 7 (schema, migrations, DATABASE_URL)
├── database/
│   └── Morador.sql                      # DDL anterior, mantido como referência
├── test/                      # testes e2e e helpers (mock do Prisma)
├── src/
│   ├── main.ts                 # bootstrap (porta 7522)
│   ├── app.constants.ts        # PREFIXO_API = 'condominio/morador'
│   ├── app.module.ts           # módulo raiz, amarra todos os módulos
│   │
│   ├── generated/prisma/       # Prisma Client GERADO (não versionado: rode `npx prisma generate`)
│   ├── prisma/                 # PrismaService (client + adapter MariaDB) — módulo @Global
│   ├── events/                 # EventsService — publica no RabbitMQ
│   ├── common/filters/         # filtro global de exceções do Prisma
│   │
│   ├── auth/
│   │   ├── auth.controller.ts  # POST /auth/login, GET /auth/me
│   │   ├── auth.service.ts     # login, resolução de moradorId, emissão do JWT
│   │   ├── dto/login.dto.ts
│   │   ├── strategies/jwt.strategy.ts
│   │   ├── guards/jwt-auth.guard.ts
│   │   ├── guards/roles.guard.ts
│   │   └── decorators/roles.decorator.ts, current-user.decorator.ts
│   │
│   ├── bloco/                  # CRUD de bloco
│   ├── imovel/                 # CRUD de imovel (filtro por bloco/tipo)
│   ├── morador/                # CRUD de morador (busca por nome/CPF/e-mail)
│   ├── usuario/                 # CRUD de usuario (hash de senha, nunca expõe o hash)
│   └── morador-imovel/          # CRUD da relação + PATCH /:id/encerrar
│       └── cada módulo acima segue o mesmo padrão:
│           ├── <nome>.module.ts
│           ├── <nome>.controller.ts
│           ├── <nome>.service.ts
│           └── dto/create-<nome>.dto.ts, update-<nome>.dto.ts
│
├── .env.example
├── .infisical.yaml            # vínculo com o projeto no Infisical
├── Dockerfile / docker-compose.yml / docker/entrypoint.sh
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## Guia de instalação do zero (outra máquina)

Passo a passo para quem **nunca rodou o projeto**. Antes, três fatos sobre o ambiente:

- **O banco é o MySQL 5.7 do servidor da faculdade** (`edumysql.acesso.rj.senac.br`, porta 3306, banco
  `20262m_prj5_condominio_morador`). Ele **não** roda em container. O acesso exige estar na rede do Senac
  (ou na VPN), e usuário e senha vêm do grupo, pelo Infisical.
- **O usuário da aplicação só tem `SELECT/INSERT/UPDATE/DELETE`** nesse banco. As tabelas foram criadas pelo
  professor com o script `prisma/migrations/20261019000000_init/migration.sql`; o Prisma Migrate **não** roda no servidor.
- **As rotas ficam sob o prefixo `/condominio/morador`** e a API escuta na porta **7522**.

Escolha um dos dois caminhos:

| | Caminho A — Docker | Caminho B — Manual |
|---|---|---|
| Instala | Git + Docker | Git + Node.js (+ MySQL local e RabbitMQ opcionais) |
| Dificuldade | Baixa | Média |
| Quando usar | Demonstração, "só quero ver rodando" | Desenvolvimento com recarga automática (`start:dev`) |
| Banco | o do servidor (rede do Senac/VPN) | o do servidor **ou** um MySQL local |

> **Requisitos mínimos da máquina:** ~4 GB de RAM livres, ~3 GB de disco (imagens Docker) e internet no
> primeiro uso. Portas livres: **7522** (API), **5672** e **15672** (RabbitMQ).

### Variáveis de ambiente necessárias

As duas formas precisam das mesmas variáveis (detalhes na seção [Variáveis de ambiente](#variáveis-de-ambiente)).
Elas ficam no **Infisical** (ambiente `dev`) e **nunca no Git**:

| Variável | Obrigatória | Observação |
|---|---|---|
| `DATABASE_URL` | sim | `mysql://<usuario>:<senha>@edumysql.acesso.rj.senac.br:3306/20262m_prj5_condominio_morador` — senha com `@`, `#`, `/` etc. precisa ser codificada (`@` → `%40`) |
| `JWT_SECRET` | sim | texto longo e aleatório |
| `ADMIN_SENHA` | recomendada | senha (8+ caracteres) do síndico inicial; sem ela nenhum síndico é criado e não há como fazer login |

Quem não tem acesso ao Infisical cria um arquivo `.env` na raiz com as mesmas variáveis (modelo em `.env.example`).

### Caminho A — com Docker

**1. Instale as ferramentas**

| Sistema | O que instalar |
|---|---|
| **Windows 10/11** | [Git for Windows](https://git-scm.com/download/win) e [Docker Desktop](https://www.docker.com/products/docker-desktop/) (marque "Use WSL 2" no instalador; se pedir, habilite a virtualização na BIOS e reinicie) |
| **macOS** | [Git](https://git-scm.com/download/mac) (ou `xcode-select --install`) e [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| **Linux (Ubuntu/Debian)** | `sudo apt update && sudo apt install -y git` e o [Docker Engine com o plugin Compose](https://docs.docker.com/engine/install/ubuntu/). Depois: `sudo usermod -aG docker $USER` e reabra o terminal |

Abra o Docker Desktop e espere indicar "Docker Desktop is running" (no Linux o serviço já sobe sozinho). Confira:

```bash
git --version
docker --version
docker compose version
```

**2. Baixe o projeto**

```bash
git clone https://github.com/BeSenna/Moradores-Proptech.git
cd Moradores-Proptech
```

**3. Forneça as variáveis**

*Com Infisical* (precisa de Node.js e do acesso ao projeto do grupo):

```bash
npm install                  # instala também o CLI do Infisical (@infisical/cli)
npx infisical login          # abre o navegador; use a conta convidada para o projeto
```

*Sem Infisical:* crie o `.env` na raiz, ao lado do `docker-compose.yml`:

```env
DATABASE_URL="mysql://<usuario>:<senha>@edumysql.acesso.rj.senac.br:3306/20262m_prj5_condominio_morador"
JWT_SECRET="um-segredo-longo-e-aleatorio"
ADMIN_SENHA="uma-senha-forte-com-8-ou-mais-caracteres"
```

O compose **se recusa a subir** sem `DATABASE_URL` e `JWT_SECRET` (aparece `required variable ... is missing a value`).

**4. Suba tudo** (API + RabbitMQ)

```bash
npx infisical run --env=dev -- docker compose up --build     # com Infisical
docker compose up --build                                    # sem Infisical (lê o .env)
```

Na primeira vez leva alguns minutos. Está pronto quando aparecer no log
`Nest application successfully started` e `MS Moradores rodando em http://localhost:7522/condominio/morador`.
Deixe o terminal aberto (ou acrescente `-d` para rodar em segundo plano).

**5. Confirme que funcionou**

- Swagger (documentação interativa): <http://localhost:7522/condominio/morador/docs>
- Login:
  ```bash
  curl -X POST http://localhost:7522/condominio/morador/auth/login \
    -H "Content-Type: application/json" \
    -d '{"usuarioLogin":"admin","senha":"SUA_ADMIN_SENHA"}'
  ```
  A resposta traz o `accessToken`.
- Painel do RabbitMQ: <http://localhost:15672> (usuário `guest`, senha `guest`).

**6. Parar**

```bash
docker compose down
```

O banco é o do servidor, então `docker compose down` não apaga dado nenhum.

### Caminho B — manual, sem Docker

**1. Instale os pré-requisitos**

| Programa | Versão | Windows | macOS | Ubuntu/Debian |
|---|---|---|---|---|
| **Git** | qualquer | [git-scm.com](https://git-scm.com/download/win) | `xcode-select --install` | `sudo apt install -y git` |
| **Node.js + npm** | **22.12+ ou 24** (exigência do Prisma 7; o Docker usa `node:24-slim`) | [nodejs.org](https://nodejs.org/en/download) (LTS 22.x ou 24.x) | `brew install node@24` | via [nvm](https://github.com/nvm-sh/nvm): `nvm install 24` |
| **MySQL** *(só para banco local)* | 5.7 ou 8.x | [MySQL Installer](https://dev.mysql.com/downloads/installer/) | `brew install mysql` | `sudo apt install -y mysql-server` |
| **RabbitMQ** *(opcional)* | 3.x | [rabbitmq.com/install-windows](https://www.rabbitmq.com/docs/install-windows) | `brew install rabbitmq` | `sudo apt install -y rabbitmq-server` |

> O RabbitMQ **não é necessário** para o CRUD funcionar: sem ele, a API só registra um aviso no log ao tentar
> publicar eventos. Com Docker, a forma mais simples é:
> `docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management`

Confira: `node -v` (v22.12 ou superior, ou v24.x), `npm -v`, `git --version`.

**2. Escolha o banco**

- **Servidor da faculdade (recomendado):** nada a instalar. Basta estar na rede do Senac/VPN e usar a
  `DATABASE_URL` do servidor. As tabelas já existem (criadas pelo professor).
- **MySQL local** (para testar à vontade): crie o banco e rode as migrations. Entre no MySQL e execute:
  ```sql
  CREATE DATABASE condominio_moradores CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'proptech'@'127.0.0.1' IDENTIFIED BY 'troque-esta-senha';
  GRANT ALL PRIVILEGES ON condominio_moradores.* TO 'proptech'@'127.0.0.1';
  FLUSH PRIVILEGES;
  ```
  e use `DATABASE_URL="mysql://proptech:troque-esta-senha@127.0.0.1:3306/condominio_moradores?allowPublicKeyRetrieval=true"`.
  Use `127.0.0.1` (não `localhost`: no MySQL são contas diferentes). No MySQL 8, o `allowPublicKeyRetrieval=true`
  evita falha na primeira conexão; no 5.7 ele é inofensivo.

**3. Baixe o projeto e instale as dependências**

```bash
git clone https://github.com/BeSenna/Moradores-Proptech.git
cd Moradores-Proptech
npm install
```

**4. Forneça as variáveis**

Com Infisical: `npx infisical login` (uma vez). Sem Infisical: `cp .env.example .env` (no Windows:
`copy .env.example .env`) e edite o `.env` com as variáveis da tabela acima. As variáveis do Infisical têm
**prioridade** sobre o `.env`.

**5. Gere o client do Prisma** (e, só em banco **local**, crie as tabelas)

```bash
npx prisma generate
npx prisma migrate deploy      # SOMENTE em MySQL local; no servidor da faculdade NÃO rode
```

> No Prisma 7 o client é **gerado dentro do projeto** (`src/generated/prisma`), e essa pasta **não vai
> para o Git**. Por isso o `npx prisma generate` é obrigatório em toda máquina nova e sempre que o
> `prisma/schema.prisma` mudar. Sem ele, o build falha com `Cannot find module '../generated/prisma/client'`.
> O `migrate deploy` precisa criar tabelas; no servidor da faculdade o usuário não tem essa permissão
> (erro `CREATE command denied`).

**6. Inicie a API**

```bash
npm run start:dev                  # com Infisical (padrão da equipe): infisical run --env=dev -- nest start --watch
npx nest start --watch             # sem Infisical (só com o .env)
npm run build && npm run start:prod   # produção
```

O CLI do Infisical já vem nas dependências de desenvolvimento (`@infisical/cli`), então o `npm install` basta.
Está no ar quando aparecer `MS Moradores rodando em http://localhost:7522/condominio/morador`.

**7. Confirme que funcionou**

```bash
npm test                                       # 99 testes, não precisam de MySQL (mas precisam do `prisma generate`)
curl -X POST http://localhost:7522/condominio/morador/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usuarioLogin":"admin","senha":"SUA_ADMIN_SENHA"}'
```

Abra também <http://localhost:7522/condominio/morador/docs> (Swagger).

### Conectando o frontend

O frontend (e o gateway) chamam este serviço pelo endereço da seção [Endereços do ambiente](#endereços-do-ambiente).
O navegador não fala direto com o serviço: o front usa a base `/condominio/gateway/morador`, e o gateway repassa
para `/condominio/morador/*` (precisa encaminhar o header `Authorization`, os métodos `PATCH`/`DELETE` e os corpos
de erro 400/401/403 sem alterar). Ao cadastrar moradores para testar, use **CPFs válidos** (a API confere os
dígitos verificadores; `529.982.247-25` é um exemplo).
Em desenvolvimento local, a base é `http://localhost:7522/condominio/morador`. Entre com o síndico criado
pelo `ADMIN_SENHA`.

### Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `404 Not Found` em `/api/...` | O prefixo das rotas agora é `/condominio/morador` (não existe mais `/api`). Exemplo: `/condominio/morador/auth/login` |
| `port is already allocated` / `EADDRINUSE` | Outra aplicação usa 7522, 5672 ou 15672. Pare a API local (Ctrl+C) antes de subir o Docker, ou mude a porta à esquerda em `ports:` do `docker-compose.yml` |
| `required variable DATABASE_URL is missing a value` | O compose não achou as variáveis. Rode com `npx infisical run --env=dev -- docker compose up --build` ou crie o `.env` |
| `CREATE command denied` / `P3014` | O usuário do servidor só tem `SELECT/INSERT/UPDATE/DELETE`. Não rode `prisma migrate` no servidor; peça ao professor para executar `prisma/migrations/20261019000000_init/migration.sql` |
| `Table '...' doesn't exist` / `P2021` | As tabelas ainda não foram criadas nesse banco. Peça ao professor para rodar o script SQL (ou rode `npx prisma migrate deploy` num MySQL **local**) |
| `P1001: Can't reach database server` / timeout | Sem rede até o servidor: confira se está na rede do Senac/VPN, e o host/porta/usuário/senha da `DATABASE_URL` |
| `Access denied for user` | Usuário/senha da `DATABASE_URL` errados (lembre de codificar `@` como `%40` na senha) |
| `pool timeout` só com `npm run start:dev` (e funciona com `npx nest start`) | O Infisical está injetando uma `DATABASE_URL` diferente da do `.env`. Corrija o segredo no ambiente `dev` do Infisical (e **salve**) |
| `You are not logged in` ao rodar `npm run start:dev` | Rode `npx infisical login`; ou use `npx nest start --watch` com o `.env` |
| `Cannot find module '../generated/prisma/client'` | O client não foi gerado. Rode `npx prisma generate` (a pasta `src/generated` não é versionada) |
| `Cannot find module './internal/class.ts'` ao rodar o build compilado | Client gerado com imports `.ts`. Confira no `schema.prisma`: `importFileExtension = ""` (com **i minúsculo**) e rode `npx prisma generate` de novo |
| `Environment variable not found: DATABASE_URL` ao rodar `npx prisma migrate ...` | Crie o `.env` na raiz ou rode via `npx infisical run --env=dev -- npx prisma ...` |
| `Cannot connect to the Docker daemon` / `docker: command not found` | Docker Desktop não está aberto/instalado. Abra-o e espere ficar "running" |
| Docker Desktop não inicia no Windows | Habilite a virtualização na BIOS e o WSL 2 (`wsl --install` no PowerShell como administrador) e reinicie |
| No Windows o container reinicia com `set: Illegal option -` ou `no such file` em `entrypoint.sh` | Final de linha CRLF. O repositório traz um `.gitattributes` que força LF; se o clone foi feito sem ele: `git rm --cached -r . && git reset --hard` (ou clone de novo) |
| `npm install` ou `prisma generate` falha por versão do Node | O Prisma 7 exige Node 22.12+ (ou 24). Confira `node -v`; com nvm: `nvm install 24 && nvm use 24` |
| Login do síndico retorna 401 | O síndico só é criado se `ADMIN_SENHA` tem 8+ caracteres e **ainda não existe** síndico ativo. Veja o log da API |
| Aviso de RabbitMQ no log | Normal sem o broker; a API continua funcionando (só os eventos não são publicados) |

---

## Deploy (Jenkins)

O `Jenkinsfile` da raiz faz: checkout da branch `feat/prisma-7` → `npm ci`, `prisma generate` e `npm test` (Node 24 no
agente) → build da imagem Docker → `docker run` com os segredos injetados pelo Infisical (nenhum segredo é gravado
em arquivo) → verificação de saúde. O Jenkins precisa da credencial **`infisical-token`** (tipo *Secret text*), com o
token de uma Machine Identity (Token Auth, somente leitura) do projeto no Infisical; o `RABBITMQ_URL` também deve
existir lá. A imagem (`Dockerfile`) é *multi-stage*: só o código compilado e as dependências de produção vão para a
imagem final, que roda como usuário `node` (não root). Detalhes das variáveis em [Variáveis de ambiente](#variáveis-de-ambiente).

## Banco de dados

O schema (`prisma/schema.prisma`) espelha o banco `condominio_moradores`. As tabelas são `bloco`, `imovel`,
`morador`, `usuario` e `morador_imovel`.

| Onde | Como as tabelas são criadas |
|---|---|
| **Servidor da faculdade** (MySQL 5.7) | O **professor** executa `prisma/migrations/20261019000000_init/migration.sql` (cria só as tabelas; o banco já existe). O usuário da aplicação não tem permissão de `CREATE`/`ALTER` |
| **MySQL local** (desenvolvimento) | `npx prisma migrate deploy` (migration `20261019000000_init`) |

**Em tempo de execução** a API só precisa de `SELECT/INSERT/UPDATE/DELETE`: todas as exclusões são lógicas
(`UPDATE` do `*_status`).

**Alterando o schema.** Qualquer mudança nas tabelas do servidor precisa ser pedida ao professor:

1. Altere o `prisma/schema.prisma`.
2. Num MySQL **local**, gere a migration sem aplicar: `npx prisma migrate dev --name <descricao> --create-only`.
3. Envie ao professor o arquivo `prisma/migrations/<data>_<descricao>/migration.sql` gerado.
4. Rode `npx prisma generate` e versione a pasta da migration.

### Síndico inicial (automático)

Criar um `usuario` exige já estar logado como síndico. Para resolver isso, ao subir, a API cria sozinha o
primeiro síndico **se não existir nenhum síndico ativo**, usando `ADMIN_LOGIN` (padrão `admin`) e
`ADMIN_SENHA` (mínimo 8 caracteres). Sem `ADMIN_SENHA`, nada é criado e um aviso aparece no log. Depois do
primeiro start a rotina não faz mais nada. Troque a senha em `PATCH /condominio/morador/usuario/:id/senha`.
Os moradores comuns são criados depois, pelo síndico, em `POST /condominio/morador/usuario`; as senhas ficam no
banco só como hash.

### Testes automatizados

```bash
npm test            # unitários (src/**/*.spec.ts) + e2e (test/*.e2e-spec.ts)
npm run test:cov    # com cobertura
```

Rodam sem MySQL e sem RabbitMQ (Prisma e eventos são mockados), mas precisam do `npx prisma generate`. Cobrem
login, guards e permissões por perfil, revogação de token ao desativar usuário, validações dos DTOs, CRUD de
moradores, estado derivado das relações, eventos publicados, o JSON do Swagger, o acesso do morador apenas aos
própios dados (LGPD), a validação de CPF e dos filtros de query (400 em vez de 500) e a criação de usuário vinculado.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão MySQL (`mysql://usuario:senha@host:3306/banco`). No servidor da faculdade: `...@edumysql.acesso.rj.senac.br:3306/20262m_prj5_condominio_morador` |
| `PORT` | Porta HTTP do serviço (padrão `7522`) |
| `JWT_SECRET` | Chave de assinatura do JWT — **deve ser a mesma** nos outros microsserviços, para que todos validem o mesmo token. Obrigatória no Docker |
| `JWT_EXPIRES_IN` | Validade do token (padrão `8h`) |
| `RABBITMQ_URL` | URL de conexão do broker de eventos |
| `ADMIN_LOGIN` | Login do síndico inicial criado automaticamente (padrão `admin`) |
| `ADMIN_SENHA` | Senha do síndico inicial (mín. 8 caracteres). Sem ela, o síndico inicial não é criado |

## Referência da API

Todas as rotas abaixo têm o prefixo `/condominio/morador` (ex.: `/auth/login` = `/condominio/morador/auth/login`). 🔒 = exige `Authorization: Bearer`.
👑 = exige, além do token, perfil `SINDICO`.

### Auth

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/auth/login` | público | `{ usuarioLogin, senha }` → `{ accessToken, usuario }` |
| `GET` | `/auth/me` | 🔒 | Retorna o payload decodificado do token atual |

<details>
<summary>Exemplo — POST /auth/login</summary>

Requisição:
```json
{ "usuarioLogin": "ana.souza", "senha": "minhasenha123" }
```

Resposta `200 OK`:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "usuario": {
    "usuarioId": 42,
    "usuarioLogin": "ana.souza",
    "usuarioPerfil": "MORADOR",
    "moradorId": 7
  }
}
```

Resposta `401 Unauthorized` (login ou senha errados): `{ "message": "Login ou senha inválidos." }`
</details>

### Bloco

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/bloco` | 👑 | Cria um bloco |
| `GET` | `/bloco?page=&pageSize=&status=&busca=` | 🔒 | Lista paginada, com contagem de imóveis por bloco |
| `GET` | `/bloco/:id` | 🔒 | Detalhe + lista de imóveis do bloco |
| `PATCH` | `/bloco/:id` | 👑 | Edição parcial |
| `DELETE` | `/bloco/:id` | 👑 | Soft-delete (`bloco_status = 0`) |

### Imóvel

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/imovel` | 👑 | Cria um imóvel (valida que o bloco existe) |
| `GET` | `/imovel?blocoId=&tipo=&status=` | 🔒 | Lista paginada, filtrável por bloco e tipo |
| `GET` | `/imovel/:id` | 🔒 | Detalhe + bloco + moradores vinculados (para o morador, só id e nome dos vinculados) |
| `PATCH` | `/imovel/:id` | 👑 | Edição parcial |
| `DELETE` | `/imovel/:id` | 👑 | Soft-delete (`imovel_status = 0`) |

### Morador

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/morador` | 👑 | Cria um morador (CPF e e-mail únicos) |
| `GET` | `/morador?busca=&status=` | 👑 | Lista paginada; `busca` procura em nome, CPF e e-mail |
| `GET` | `/morador/:id` | 🔒 | Detalhe + imóveis vinculados (síndico: qualquer um; morador: só o próprio, senão 403) |
| `PATCH` | `/morador/:id` | 👑 | Edição parcial |
| `DELETE` | `/morador/:id` | 👑 | Soft-delete (`morador_status = 0`) |

### Usuário

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/usuario` | 👑 | Cria uma conta (`senha` em texto puro no corpo, vira hash) |
| `GET` | `/usuario?perfil=` | 👑 | Lista paginada — nunca retorna o hash da senha |
| `GET` | `/usuario/:id` | 👑 | Detalhe |
| `PATCH` | `/usuario/:id` | 👑 | Edição (não troca senha por aqui) |
| `PATCH` | `/usuario/:id/senha` | 👑 | Troca de senha (`{ novaSenha }`) |
| `DELETE` | `/usuario/:id` | 👑 | Revoga o acesso (`usuario_status = 0`) |

<details>
<summary>Exemplo — POST /usuario</summary>

```json
{
  "usuarioLogin": "ana.souza",
  "senha": "minhasenha123",
  "usuarioPerfil": "MORADOR",
  "moradorImovelId": 15
}
```

`moradorImovelId` é opcional: se enviado, já vincula a conta criada a uma relação
`morador_imovel` existente (preenchendo `morador_imovel.usuario_id`).
</details>

### Relação (`morador_imovel`)

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/morador-imovel` | 👑 | Cria o vínculo morador↔imóvel |
| `GET` | `/morador-imovel?moradorId=&imovelId=&tipoRelacao=&status=` | 👑 | Lista paginada, com `estado` derivado |
| `GET` | `/morador-imovel/:id` | 🔒 | Detalhe + morador + imóvel + bloco (síndico: qualquer um; morador: só as próprias, senão 403) |
| `PATCH` | `/morador-imovel/:id` | 👑 | Edição parcial |
| `PATCH` | `/morador-imovel/:id/encerrar` | 👑 | Define `morador_imovel_data_fim` |
| `DELETE` | `/morador-imovel/:id` | 👑 | Soft-delete (`morador_imovel_status = 0`) |

<details>
<summary>Exemplo — resposta com estado derivado</summary>

```json
{
  "moradorImovelId": 15,
  "moradorId": 7,
  "imovelId": 3,
  "moradorImovelTipoRelacao": "PROPRIETARIO",
  "moradorImovelDataInicio": "2021-03-12T00:00:00.000Z",
  "moradorImovelDataFim": null,
  "moradorImovelStatus": 1,
  "usuarioId": 42,
  "estado": "ATIVO"
}
```

`estado` (`ATIVO` / `ENCERRANDO` / `ENCERRADO`) **não é uma coluna do banco** — é
calculado a cada resposta comparando `morador_imovel_data_fim` com a data atual.
Ver [Decisões de design](#decisões-de-design).
</details>

### Paginação

Todo `GET` de listagem aceita `page` e `pageSize` (padrão `1` e `20`). Filtros com valor inválido (ex.: `status=abc`,
`tipo=XYZ`) retornam `400`. Resposta no formato:

```json
{
  "data": [ /* ... */ ],
  "total": 142,
  "page": 1,
  "pageSize": 20,
  "totalPages": 8
}
```

## Eventos RabbitMQ

O `EventsService` (`src/events/`) publica — nunca consome — três eventos:

| Evento | Disparado em | Quando | Consumido por |
|---|---|---|---|
| `morador.cadastrado` | `POST /morador` | sempre | MS Serviços (cache local de nome) |
| `imovel.cadastrado` | `POST /imovel` | sempre | informativo |
| `morador_imovel.vinculado` | `POST /morador-imovel` | só se `moradorImovelTipoRelacao` for `PROPRIETARIO` ou `INQUILINO` | MS Financeiro (habilita novas cobranças) |

A publicação usa `emit()` (fire-and-forget) — se o RabbitMQ estiver indisponível, o
`EventsService` apenas registra um aviso em log; a requisição HTTP não falha por isso.

## Decisões de design

- **Soft-delete em tudo.** Todo `DELETE` muda a coluna `*_status` para `0` em vez
  de apagar a linha, preservando histórico (vínculos, cobranças futuras etc.).
- **Estado da relação é derivado, não gravado.** `morador_imovel` não tem coluna de
  estado ATIVO/ENCERRANDO/ENCERRADO — o `MoradorImovelService` calcula isso a cada
  leitura, comparando `morador_imovel_data_fim` com a data de hoje. A mesma
  validação (data_fim não pode ser anterior a data_inicio) é aplicada em `create`,
  `update` e `encerrar`, para que nenhuma rota consiga contornar a regra.
- **`usuario` sem FK direta para `morador`.** Ver [Modelo de dados](#modelo-de-dados).
- **Senha nunca retorna na API.** `UsuarioService` usa um `select` explícito
  (constante `SEM_SENHA`) que exclui `usuario_senha_hash` de toda resposta,
  inclusive listagens.
- **Leitura de dados pessoais é restrita (LGPD).** `GET` de bloco e imóvel só exige
  autenticação (qualquer perfil). Já as listas de moradores e de relações são só do
  `SINDICO`; o detalhe de morador/relação é do síndico ou do próprio morador
  (`moradorId` do token), e o detalhe do imóvel esconde CPF/e-mail/telefone dos
  demais moradores para o perfil `MORADOR`. As escritas são restritas a `SINDICO`.
  Os outros microsserviços que validam `morador_id` via `GET /morador/:id` precisam
  encaminhar o token do síndico ou do próprio morador.
- **Filtros de query são validados.** `page`, `status`, `blocoId` etc. aceitam só
  inteiros e `tipo`/`tipoRelacao`/`perfil` só os valores do enum — caso contrário, 400
  (decorators `@QueryInt` / `@QueryEnum` em `src/common/decorators`).
- **CPF é validado de verdade.** 11 dígitos e dígitos verificadores corretos
  (`src/common/validators/is-cpf.validator.ts`); `00000000000`, `11111111111` etc. são rejeitados.
- **`PATCH` com `null` limpa o campo.** E-mail, telefone, data de nascimento do morador
  e `moradorImovelDataFim` (reabre o vínculo) podem ser limpos enviando `null`.

## Limitações conhecidas e próximos passos

- A migração para o Prisma 7 foi validada com build, 100+ testes unitários/e2e (Prisma
  mockado), execução local com Infisical e execução via Docker Compose.
- Endpoints dedicados ao morador comum (ex.: `/me/imovel`, `/me/relacoes`) ainda não
  existem; hoje ele usa `GET /morador/:id` com o próprio `moradorId`, que já traz os
  imóveis vinculados.
- As tabelas do servidor da faculdade só podem ser criadas ou alteradas pelo professor (o usuário da
  aplicação não tem `CREATE`/`ALTER`); mudanças de schema seguem o fluxo da seção [Banco de dados](#banco-de-dados).
- Os testes automatizados não usam um MySQL real (Prisma mockado). Um próximo passo
  é uma suíte de integração contra um MySQL descartável (ex.: Testcontainers).
- Trocar a senha de um usuário (`PATCH /usuario/:id/senha`) ainda não invalida os
  tokens já emitidos dele — apenas desativar a conta faz isso.

## Acesso inicial

O síndico inicial é criado automaticamente na primeira subida, com o `ADMIN_LOGIN` (padrão `admin`) e a
`ADMIN_SENHA` definidos no Infisical (ou no `.env`). A senha **não** é documentada aqui. Os moradores comuns
são cadastrados depois pelo síndico (`POST /condominio/morador/usuario`).