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
| ORM | [Prisma](https://www.prisma.io/) 5 |
| Banco de dados | MySQL (`condominio_moradores`) |
| Autenticação | JWT (`@nestjs/jwt` + `passport-jwt`), esquema Bearer |
| Hash de senha | `bcryptjs` |
| Validação | `class-validator` / `class-transformer` |
| Mensageria | RabbitMQ (`@nestjs/microservices`, transporte RMQ) |
| Linguagem | TypeScript 5 |

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
├── database/
│   └── Morador.sql            # mesmo DDL das migrations, para rodar direto no MySQL
├── test/                      # testes e2e e helpers (mock do Prisma)
├── src/
│   ├── main.ts                 # bootstrap, ValidationPipe, prefixo /api
│   ├── app.module.ts           # módulo raiz, amarra todos os módulos
│   │
│   ├── prisma/                 # PrismaService (client) — módulo @Global
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
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## Instalação e execução

### Pré-requisitos

- Node.js 18+
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

npx prisma generate
npx prisma migrate deploy   # cria as tabelas
npm run start:dev
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
`npx prisma migrate dev --name <descricao>` e versione a pasta criada.

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
- Parar: `docker compose down` — apagar também o banco: `docker compose down -v`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão MySQL (`mysql://usuario:senha@host:3306/condominio_moradores`) |
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

- Não foi possível rodar `prisma generate` nem compilar de ponta a ponta no
  ambiente em que este projeto foi gerado (bloqueio de rede ao CDN de binários do
  Prisma). O código foi revisado manualmente; deve compilar normalmente assim que
  `npx prisma generate` rodar com acesso à internet.
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