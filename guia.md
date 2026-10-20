## Guia de instalação do zero (outra máquina)

Passo a passo completo para quem **nunca rodou o projeto**. Escolha um dos dois caminhos:

| | Caminho A — Docker | Caminho B — Manual |
|---|---|---|
| Instala | Git + Docker | Git + Node.js + MySQL (+ RabbitMQ opcional) |
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
| **Node.js + npm** | **24** (mesma versão da imagem Docker `node:24-slim`) | [nodejs.org](https://nodejs.org/en/download) (instalador da versão 24.x) | `brew install node@24` | via [nvm](https://github.com/nvm-sh/nvm): `nvm install 24` |
| **MySQL** | **8.0** | [MySQL Installer](https://dev.mysql.com/downloads/installer/) (servidor + Workbench) | `brew install mysql && brew services start mysql` | `sudo apt install -y mysql-server && sudo systemctl enable --now mysql` |
| **RabbitMQ** *(opcional)* | 3.x | [rabbitmq.com/install-windows](https://www.rabbitmq.com/docs/install-windows) | `brew install rabbitmq && brew services start rabbitmq` | `sudo apt install -y rabbitmq-server` |

> O RabbitMQ **não é necessário** para o CRUD funcionar: sem ele, a API só registra um aviso no log
> ao tentar publicar eventos. Instale-o apenas se for integrar com os outros microsserviços. Se
> tiver Docker, a forma mais simples é:
> `docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management`

Confira as versões:

```bash
node -v      # v24.x
npm -v
git --version
mysql --version
```

**2. Crie o banco e um usuário no MySQL**

Entre no MySQL (`mysql -u root -p`, ou o Workbench) e rode:

```sql
CREATE DATABASE condominio_moradores CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'proptech'@'localhost' IDENTIFIED BY 'troque-esta-senha';
GRANT ALL PRIVILEGES ON condominio_moradores.* TO 'proptech'@'localhost';
FLUSH PRIVILEGES;
```

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
DATABASE_URL="mysql://proptech:troque-esta-senha@localhost:3306/condominio_moradores"
JWT_SECRET="um-segredo-longo-e-aleatorio"
ADMIN_LOGIN="admin"
ADMIN_SENHA="uma-senha-forte-com-8-ou-mais-caracteres"
```

> Se a senha do MySQL tiver caracteres especiais (`@ : / # ?`), codifique-os na URL
> (ex.: `@` vira `%40`). `ADMIN_SENHA` precisa ter **8+ caracteres**, senão o síndico inicial não é criado.

**5. Gere o client do Prisma e crie as tabelas**

```bash
npx prisma generate
npx prisma migrate deploy
```

**6. Inicie a API**

```bash
npm run start:dev      # desenvolvimento, recarrega ao salvar
# ou, para produção:
npm run build && npm run start:prod
```

Está no ar quando aparecer `MS Moradores rodando em http://localhost:3001/api`. Na primeira subida a
API cria o síndico inicial com `ADMIN_LOGIN` / `ADMIN_SENHA`.

**7. Confirme que funcionou**

```bash
npm test                                       # 64 testes, não precisam de MySQL
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
| `P1001: Can't reach database server` | MySQL desligado ou `DATABASE_URL` errada (host/porta/usuário/senha). No Docker a API usa o host `db` automaticamente |
| `Access denied for user` | Usuário/senha do `DATABASE_URL` não conferem com o criado no passo 2 |
| `Environment variable not found: DATABASE_URL` | Falta o arquivo `.env` na raiz do projeto |
| `Cannot find module '.prisma/client'` / erros de tipo do Prisma | Rode `npx prisma generate` depois do `npm install` |
| Login do síndico retorna 401 | O síndico só é criado se `ADMIN_SENHA` tem 8+ caracteres e **ainda não existe** síndico ativo. Veja o log da API; para recomeçar do zero no Docker, `docker compose down -v` |
| Aviso de RabbitMQ no log | Normal sem o broker; a API continua funcionando (só os eventos não são publicados) |
| `npm install` falha com versão antiga do Node | Use Node 24 (`node -v`; com nvm: `nvm install 24 && nvm use 24`) |

