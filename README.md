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

- [Stack técnica](#stack-técnica)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [Autenticação e autorização](#autenticação-e-autorização)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Guia de instalação do zero (outra máquina)](#guia-de-instalação-do-zero-outra-máquina)
- [Instalação e execução](#instalação-e-execução)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Referência da API](#referência-da-api)
- [Eventos RabbitMQ](#eventos-rabbitmq)
- [Decisões de design](#decisões-de-design)
- [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)

---

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | [NestJS](https://nestjs.com/) 10 |
| ORM | [Prisma](https://www.prisma.io/) 7.10 (generator `prisma-client`, driver adapter `@prisma/adapter-mariadb`) |
| Banco de dados | MySQL (`condominio_moradores`) |
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

1. Cliente envia `POST /api/auth/login` com `usuarioLogin` e `senha`.
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
| `POST /api/auth/login` | qualquer um (rota pública) |
| `GET` de bloco / imóvel / morador / relação | qualquer usuário autenticado (outros microsserviços também consultam) |
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
│   └── Morador.sql            # mesmo DDL das migrations, para rodar direto no MySQL
├── test/                      # testes e2e e helpers (mock do Prisma)
├── src/
│   ├── main.ts                 # bootstrap, ValidationPipe, prefixo /api
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
├── .infisical.json            # vínculo com o projeto no Infisical
├── Dockerfile / docker-compose.yml / docker/entrypoint.sh
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## Guia de instalação do zero (outra máquina)

Passo a passo completo para quem **nunca rodou o projeto**. Escolha um dos dois caminhos:

| | Caminho A — Docker | Caminho B — Manual |
|---|---|---|
| Instala | Git + Docker | Git + Node.js + MySQL (+ RabbitMQ e Infisical opcionais) |
| Dificuldade | Baixa (um comando) | Média |
| Quando usar | Demonstração, avaliação, "só quero ver rodando" | Desenvolvimento com `start:dev` e recarga automática |

> **Requisitos mínimos da máquina:** ~4 GB de RAM livres, ~3 GB de disco (imagens Docker) e internet
> no primeiro uso (baixa dependências e imagens). Portas livres: **3001** (API), **3307** (MySQL do
> Docker), **5672** e **15672** (RabbitMQ).

### Caminho A — com Docker (recomendado)

**1. Instale as ferramentas**

| Sistema | O que instalar |
|---|---|
| **Windows 10/11** | [Git for Windows](https://git-scm.com/download/win) e [Docker Desktop](https://www.docker.com/products/docker-desktop/) (marque "Use WSL 2" no instalador; se pedir, habilite a virtualização na BIOS e reinicie) |
| **macOS** | [Git](https://git-scm.com/download/mac) (ou `xcode-select --install`) e [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| **Linux (Ubuntu/Debian)** | `sudo apt update && sudo apt install -y git` e o [Docker Engine com o plugin Compose](https://docs.docker.com/engine/install/ubuntu/). Depois: `sudo usermod -aG docker $USER` e reabra o terminal |

Abra o Docker Desktop e espere o ícone indicar "Docker Desktop is running" (no Linux o serviço já sobe sozinho).

Confira no terminal (PowerShell, Terminal ou bash):

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

**3. (Opcional) Defina senha do síndico e segredo do JWT**

Sem nada, o Compose usa os valores de demonstração (`admin` / `Admin@12345`). Para trocar, crie um
arquivo `.env` na raiz, ao lado do `docker-compose.yml`:

```env
ADMIN_LOGIN=admin
ADMIN_SENHA=uma-senha-forte-com-8-ou-mais-caracteres
JWT_SECRET=um-segredo-longo-e-aleatorio
```

**4. Suba tudo**

```bash
docker compose up --build
```

Na primeira vez leva alguns minutos (baixa as imagens e compila a API). Está pronto quando aparecer
no log algo como `MS Moradores rodando em http://localhost:3001/api`. Deixe este terminal aberto
(ou use `docker compose up --build -d` para rodar em segundo plano).

**5. Confirme que funcionou**

- Swagger (documentação interativa): <http://localhost:3001/api/docs>
- Faça login em `POST /api/auth/login` com `{ "usuarioLogin": "admin", "senha": "Admin@12345" }`
  (ou os valores do seu `.env`). A resposta traz o `accessToken`.
- Painel do RabbitMQ: <http://localhost:15672> (usuário `guest`, senha `guest`).

**6. Parar**

```bash
docker compose down        # para os containers, mantém o banco
docker compose down -v     # para e APAGA o banco (recomeça do zero)
```

### Caminho B — manual, sem Docker

**1. Instale os pré-requisitos**

| Programa | Versão | Windows | macOS | Ubuntu/Debian |
|---|---|---|---|---|
| **Git** | qualquer | [git-scm.com](https://git-scm.com/download/win) | `xcode-select --install` | `sudo apt install -y git` |
| **Node.js + npm** | **22.12+ ou 24** (exigência do Prisma 7; o Docker usa `node:24-slim`) | [nodejs.org](https://nodejs.org/en/download) (instalador LTS 22.x ou 24.x) | `brew install node@24` | via [nvm](https://github.com/nvm-sh/nvm): `nvm install 24` |
| **MySQL** | **8.0** | [MySQL Installer](https://dev.mysql.com/downloads/installer/) (servidor + Workbench) | `brew install mysql && brew services start mysql` | `sudo apt install -y mysql-server && sudo systemctl enable --now mysql` |
| **RabbitMQ** *(opcional)* | 3.x | [rabbitmq.com/install-windows](https://www.rabbitmq.com/docs/install-windows) | `brew install rabbitmq && brew services start rabbitmq` | `sudo apt install -y rabbitmq-server` |

> O RabbitMQ **não é necessário** para o CRUD funcionar: sem ele, a API só registra um aviso no log
> ao tentar publicar eventos. Instale-o apenas se for integrar com os outros microsserviços. Se
> tiver Docker, a forma mais simples é:
> `docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management`

Confira as versões:

```bash
node -v      # v22.12 ou superior (ou v24.x)
npm -v
git --version
mysql --version
```

**2. Crie o banco e um usuário no MySQL**

Entre no MySQL (`mysql -u root -p`, ou o Workbench) e rode:

```sql
CREATE DATABASE condominio_moradores CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'proptech'@'127.0.0.1' IDENTIFIED BY 'troque-esta-senha';
GRANT ALL PRIVILEGES ON condominio_moradores.* TO 'proptech'@'127.0.0.1';
FLUSH PRIVILEGES;
```

> **Use `127.0.0.1` e não `localhost`.** No MySQL, `'usuario'@'localhost'` e `'usuario'@'127.0.0.1'`
> são contas diferentes, e a API conecta pelo endereço IP. Se o usuário foi criado só para
> `localhost`, o login pode falhar.

> As **tabelas não precisam ser criadas à mão**: o passo 5 as cria. (Alternativa sem Node na máquina
> do banco: `mysql -u root -p < database/Morador.sql`.)

**3. Baixe o projeto e instale as dependências**

```bash
git clone https://github.com/BeSenna/Moradores-Proptech.git
cd Moradores-Proptech
npm install
```

**4. Configure o `.env`**

```bash
cp .env.example .env          # Windows (cmd/PowerShell): copy .env.example .env
```

Edite o `.env` e ajuste, no mínimo:

```env
DATABASE_URL="mysql://proptech:troque-esta-senha@127.0.0.1:3306/condominio_moradores?allowPublicKeyRetrieval=true"
JWT_SECRET="um-segredo-longo-e-aleatorio"
ADMIN_LOGIN="admin"
ADMIN_SENHA="uma-senha-forte-com-8-ou-mais-caracteres"
```

> - Host em **`127.0.0.1`** (não `localhost`) e o parâmetro **`?allowPublicKeyRetrieval=true`**: o MySQL 8
>   usa a autenticação `caching_sha2_password`, e sem esse parâmetro a primeira conexão pode falhar
>   (erro `pool timeout` ou `Access denied`).
> - Se a senha do MySQL tiver caracteres especiais (`@ : / # ?`), codifique-os na URL
>   (ex.: `@` vira `%40`).
> - `ADMIN_SENHA` precisa ter **8+ caracteres**, senão o síndico inicial não é criado.
> - O `.env` é lido pelo `prisma.config.ts` (comandos `prisma ...`) e pelo `PrismaService` (API).
>   Se o Infisical estiver em uso (passo 6), o valor que ele injeta **vence** o do `.env`.

**5. Gere o client do Prisma e crie as tabelas**

```bash
npx prisma generate
npx prisma migrate deploy
```

> No Prisma 7 o client é **gerado dentro do projeto** (`src/generated/prisma`), e essa pasta **não vai
> para o Git**. Por isso o `npx prisma generate` é obrigatório em toda máquina nova e sempre que o
> `prisma/schema.prisma` mudar. Sem ele, o build falha com `Cannot find module '../generated/prisma/client'`.

**6. Inicie a API**

O projeto usa o **Infisical** para entregar as variáveis de ambiente em desenvolvimento. O script
`npm run start:dev` executa `infisical run --env=dev -- nest start --watch`. Há dois jeitos de rodar:

*Opção 1 — com Infisical (padrão da equipe).* Precisa do acesso ao projeto do grupo no Infisical:

```bash
npm install -g @infisical/cli     # ou: brew install infisical/get-cli/infisical
infisical login                    # abre o navegador; use a conta convidada para o projeto
npm run start:dev                  # as variáveis do ambiente "dev" são injetadas
```

O arquivo `.infisical.json` (já versionado) aponta o projeto. **As variáveis do Infisical têm
prioridade sobre o `.env`**: se `DATABASE_URL` estiver errada lá, a API usa a errada.

*Opção 2 — sem Infisical (só com o `.env`).* Para quem não tem acesso ao Infisical:

```bash
npx nest start --watch             # desenvolvimento, recarrega ao salvar
```

*Produção (qualquer opção):*

```bash
npm run build && npm run start:prod
```

Está no ar quando aparecer `MS Moradores rodando em http://localhost:3001/api`. Na primeira subida a
API cria o síndico inicial com `ADMIN_LOGIN` / `ADMIN_SENHA`.

**7. Confirme que funcionou**

```bash
npm test                                       # 64 testes, não precisam de MySQL (mas precisam do `prisma generate` do passo 5)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usuarioLogin":"admin","senha":"SUA_ADMIN_SENHA"}'
```

Abra também <http://localhost:3001/api/docs> (Swagger).

### Conectando o frontend

No repositório do frontend (React): `npm install` e `npm run dev` (<http://localhost:5173>). Ele encaminha
`/api` para `http://localhost:3001`; se a API estiver em outro endereço, use
`VITE_API_PROXY=http://endereco:3001 npm run dev`. Entre com o síndico criado acima.

### Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `port is already allocated` / `EADDRINUSE` | Outra aplicação usa 3001, 3307, 5672 ou 15672. Feche-a ou mude a porta à esquerda em `ports:` do `docker-compose.yml` (ex.: `"3002:3001"`) |
| `Cannot connect to the Docker daemon` / `docker: command not found` | Docker Desktop não está aberto/instalado. Abra-o e espere ficar "running" |
| Docker Desktop não inicia no Windows | Habilite a virtualização na BIOS e o WSL 2 (`wsl --install` no PowerShell como administrador) e reinicie |
| No Windows o container da API reinicia com erro `set: Illegal option -` ou `no such file` em `entrypoint.sh` | Final de linha CRLF no script. O repositório traz um `.gitattributes` que força LF; se o clone já foi feito sem ele: `git rm --cached -r . && git reset --hard` (ou clone de novo) |
| `P3005: The database schema is not empty` | Banco antigo criado por outro script. No Docker: `docker compose down -v` e suba de novo. Manual: `npx prisma migrate resolve --applied 20261019000000_init` |
| `P1001: Can't reach database server` | MySQL desligado ou `DATABASE_URL` errada (host/porta/usuário/senha). No Docker a API usa o host `db` automaticamente; se persistir em loop, rode `docker compose down` e suba de novo |
| `Access denied for user` (sem relação com o Infisical) | Usuário/senha do `DATABASE_URL` não conferem com o criado no passo 2 |
| `Environment variable not found: DATABASE_URL` | Falta o arquivo `.env` na raiz do projeto |
| `Cannot find module '../generated/prisma/client'` / erros de tipo do Prisma | O client não foi gerado. Rode `npx prisma generate` depois do `npm install` (a pasta `src/generated` não é versionada) |
| `Cannot find module './internal/class.ts'` ao rodar o build compilado | Client gerado com imports `.ts`. Confira no `schema.prisma`: `importFileExtension = ""` (com **i minúsculo**) e rode `npx prisma generate` de novo |
| `pool timeout` ou `Can't reach database` só com `npm run start:dev` (mas funciona com `npx nest start`) | O Infisical está injetando uma `DATABASE_URL` diferente da do `.env`. Corrija o segredo no ambiente `dev` do Infisical (e **salve**) |
| `Access denied` / `Unknown authentication plugin` / `pool timeout` com MySQL 8 | Use `127.0.0.1` no host e `?allowPublicKeyRetrieval=true` na `DATABASE_URL`; confira que a conta existe para `'127.0.0.1'` |
| `infisical: command not found` ou `You are not logged in` | Instale o CLI (`npm install -g @infisical/cli`) e rode `infisical login`; ou use `npx nest start --watch` com o `.env` |
| `Environment variable not found: DATABASE_URL` ao rodar `npx prisma ...` | O `prisma.config.ts` lê o `.env` da raiz; crie-o (passo 4) ou rode via `infisical run --env=dev -- npx prisma ...` |
| No Docker: `address already in use` na porta 3001 | A API local está rodando. Pare-a (Ctrl+C) e rode `docker compose down` antes de `docker compose up --build` |
| Login do síndico retorna 401 | O síndico só é criado se `ADMIN_SENHA` tem 8+ caracteres e **ainda não existe** síndico ativo. Veja o log da API; para recomeçar do zero no Docker, `docker compose down -v` |
| Aviso de RabbitMQ no log | Normal sem o broker; a API continua funcionando (só os eventos não são publicados) |
| `npm install` ou `prisma generate` falha por versão do Node | O Prisma 7 exige Node 22.12+ (ou 24). Confira `node -v`; com nvm: `nvm install 24 && nvm use 24` |

---

## Instalação e execução

### Pré-requisitos

- Node.js 22.12+ (ou 24)
- MySQL (o banco `condominio_moradores` pode ser criado vazio; as tabelas vêm das
  migrations — ver "Banco de dados" abaixo)
- RabbitMQ (opcional para rodar o CRUD — só é necessário para os eventos; se não
  estiver disponível, a publicação apenas falha silenciosamente em log, sem
  derrubar a API)

### Passos

```bash
npm install

cp .env.example .env
# edite o .env: DATABASE_URL, JWT_SECRET, RABBITMQ_URL

npx prisma generate         # obrigatório (client em src/generated, não versionado)
npx prisma migrate deploy   # cria as tabelas
npm run start:dev           # com Infisical; sem ele: npx nest start --watch
```

A API sobe em `http://localhost:3001/api` (Swagger em `/api/docs`).

### Banco de dados

O schema é versionado em `prisma/migrations/` (migration `20261019000000_init`, que
cria `bloco`, `imovel`, `morador`, `usuario` e `morador_imovel`).

| Situação | Como preparar |
|---|---|
| Banco novo/vazio (recomendado) | `npx prisma migrate deploy` |
| Sem Node na máquina do banco | `mysql -u root -p < database/Morador.sql` (cria o banco e as tabelas; é o mesmo DDL da migration) |
| Banco **já existente** criado por outro script (`P3005: database schema is not empty`) | `npx prisma migrate resolve --applied 20261019000000_init` para marcar a migration como aplicada |
| Docker | automático (`docker compose up --build`) |

Ao alterar o `schema.prisma`, gere uma nova migration em desenvolvimento com
`npx prisma migrate dev --name <descricao>`, rode `npx prisma generate` e versione a pasta de migration criada.
A URL do banco **não fica no schema**: no Prisma 7 ela é lida em `prisma.config.ts` (`DATABASE_URL`) e, na API, passada ao adapter em `src/prisma/prisma.service.ts`.

### Síndico inicial (automático)

Criar um `usuario` exige já estar logado como síndico. Para resolver isso, ao subir,
a API cria sozinha o primeiro síndico **se não existir nenhum síndico ativo**, usando
`ADMIN_LOGIN` (padrão `admin`) e `ADMIN_SENHA` (mínimo 8 caracteres) do `.env`. Sem
`ADMIN_SENHA`, nada é criado e um aviso aparece no log. Depois do primeiro start a
rotina não faz mais nada. Troque a senha em `PATCH /api/usuario/:id/senha`.

### Testes automatizados

```bash
npm test            # unitários (src/**/*.spec.ts) + e2e (test/*.e2e-spec.ts)
npm run test:cov    # com cobertura
```

Rodam sem MySQL e sem RabbitMQ (Prisma e eventos são mockados) e cobrem login, guards
e permissões por perfil, revogação de token ao desativar usuário, validações dos DTOs,
CRUD de moradores (inclusive PATCH parcial sem reaplicar valores padrão), estado
derivado das relações, eventos publicados e o JSON do Swagger.

## Executando com Docker

Requer apenas o Docker (com Compose). Sobe a API, o MySQL e o RabbitMQ juntos:

```bash
docker compose up --build
```

- API: http://localhost:3001/api — Swagger: http://localhost:3001/api/docs
- Na primeira execução as migrations são aplicadas (`prisma migrate deploy`) e a API cria o síndico `admin` / `Admin@12345`
  (troque com `ADMIN_LOGIN` / `ADMIN_SENHA`; o segredo do JWT com `JWT_SECRET`, num `.env` ao lado do compose).
- MySQL exposto em `localhost:3307` (usuário `root`, senha `root`); RabbitMQ em http://localhost:15672 (guest/guest).
- No build da imagem o `prisma generate` roda automaticamente (Dockerfile); não precisa de Infisical nem de `.env` no Docker.
- Se a API local estiver rodando na porta 3001, pare-a antes (`address already in use`).
- Parar: `docker compose down` — apagar também o banco: `docker compose down -v`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão MySQL (`mysql://usuario:senha@127.0.0.1:3306/condominio_moradores?allowPublicKeyRetrieval=true`) |
| `PORT` | Porta HTTP do serviço (padrão `3001`) |
| `JWT_SECRET` | Chave de assinatura do JWT — **deve ser a mesma** nos outros microsserviços, para que todos validem o mesmo token |
| `JWT_EXPIRES_IN` | Validade do token (padrão `8h`) |
| `RABBITMQ_URL` | URL de conexão do broker de eventos |
| `ADMIN_LOGIN` | Login do síndico inicial criado automaticamente (padrão `admin`) |
| `ADMIN_SENHA` | Senha do síndico inicial (mín. 8 caracteres). Sem ela, o síndico inicial não é criado |

## Referência da API

Todas as rotas abaixo têm o prefixo `/api`. 🔒 = exige `Authorization: Bearer`.
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
| `GET` | `/imovel/:id` | 🔒 | Detalhe + bloco + moradores vinculados |
| `PATCH` | `/imovel/:id` | 👑 | Edição parcial |
| `DELETE` | `/imovel/:id` | 👑 | Soft-delete (`imovel_status = 0`) |

### Morador

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/morador` | 👑 | Cria um morador (CPF e e-mail únicos) |
| `GET` | `/morador?busca=&status=` | 🔒 | Lista paginada; `busca` procura em nome, CPF e e-mail |
| `GET` | `/morador/:id` | 🔒 | Detalhe + imóveis vinculados |
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
| `GET` | `/morador-imovel?moradorId=&imovelId=&tipoRelacao=&status=` | 🔒 | Lista paginada, com `estado` derivado |
| `GET` | `/morador-imovel/:id` | 🔒 | Detalhe + morador + imóvel + bloco |
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

Todo `GET` de listagem aceita `page` e `pageSize` (padrão `1` e `20`) e responde no formato:

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
- **Rotas de leitura mais abertas que as de escrita.** `GET` de bloco/imóvel/
  morador só exige autenticação (qualquer perfil), porque os outros
  microsserviços também os consultam para validação síncrona de `imovel_id` e
  `morador_id`. As escritas são restritas a `SINDICO`.

## Limitações conhecidas e próximos passos

- A migração para o Prisma 7 foi validada com build, 64 testes unitários/e2e (Prisma
  mockado), execução local com Infisical e execução via Docker Compose.
- A API imprime `DATABASE_URL`, `API_KEY` e `JWT_SECRET` no log ao iniciar (`src/app.module.ts`).
  Útil em desenvolvimento, mas **deve ser removido antes de qualquer entrega/produção**.
- Endpoints equivalentes para o morador comum (ex.: `/me/imovel`, `/me/relacoes`,
  usando o `moradorId` do próprio token em vez de regra por perfil) ainda não
  existem — hoje o morador comum só tem acesso de leitura às mesmas rotas do
  síndico, sem filtro automático pelos seus próprios dados.
- Os testes automatizados não usam um MySQL real (Prisma mockado). Um próximo passo
  é uma suíte de integração contra um MySQL descartável (ex.: Testcontainers).
- Trocar a senha de um usuário (`PATCH /usuario/:id/senha`) ainda não invalida os
  tokens já emitidos dele — apenas desativar a conta faz isso.

## Admin

login: admin
senha: Admin@12345

## Morador

login: 
senha: