import { INestApplication } from '@nestjs/common';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { PREFIXO_API } from '../app.constants';

/**
 * Documentação OpenAPI (Swagger) do MS Moradores.
 *
 * Escrita a partir do código do repositório: schema.prisma (campos e enums), DTOs
 * (validações), services (regras de negócio, erros e formato das respostas) e controllers
 * (rotas, paginação e permissões). Fica toda neste arquivo para não misturar documentação
 * com a lógica dos controllers. Ao criar/alterar uma rota, atualize o trecho correspondente.
 *
 * UI:   GET /condominio/morador/docs
 * JSON: GET /condominio/morador/docs-json
 */

// ───────────────────────── helpers ─────────────────────────
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const arr = (items: any) => ({ type: 'array', items });
const int = (example?: number, description?: string) => ({ type: 'integer', example, description });
const str = (example?: string, description?: string, extra: any = {}) => ({
  type: 'string',
  example,
  description,
  ...extra,
});
const date = (example: string, description?: string) =>
  str(example, description, { format: 'date' });
const dateTime = (example: string, description?: string) =>
  str(example, description, { format: 'date-time' });
const flag = (description: string) => ({
  type: 'integer',
  enum: [0, 1],
  example: 1,
  description,
});

const obj = (properties: Record<string, any>, required: string[] = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
});

// PATCH: mesmas propriedades do POST, todas opcionais
const partial = (schema: any, omit: string[] = []) => {
  const properties = { ...schema.properties };
  omit.forEach((k) => delete properties[k]);
  return { type: 'object', properties };
};

const paged = (item: string, descricao: string) =>
  obj({
    data: { ...arr(ref(item)), description: descricao },
    total: int(142, 'Total de registros que atendem aos filtros'),
    page: int(1, 'Página atual'),
    pageSize: int(20, 'Itens por página'),
    totalPages: int(8, 'Total de páginas'),
  });

const json = (schema: any, example?: any) => ({
  'application/json': { schema, ...(example !== undefined ? { example } : {}) },
});

const body = (schemaName: string, example: any) => ({
  required: true,
  content: json(ref(schemaName), example),
});

// ───────────────────────── respostas de erro ─────────────────────────
const ERR = {
  400: {
    description:
      'Corpo ou parâmetros inválidos (ValidationPipe: campos desconhecidos são rejeitados e as regras do DTO são aplicadas).',
    content: json(ref('ErroValidacao'), {
      statusCode: 400,
      message: ['moradorCpf deve ter exatamente 11 dígitos (sem pontuação).'],
      error: 'Bad Request',
    }),
  },
  401: {
    description: 'Token ausente, inválido ou expirado (o token vale 8h — faça login novamente).',
    content: json(ref('Erro'), { statusCode: 401, message: 'Unauthorized' }),
  },
  403: {
    description: 'Token válido, mas o perfil não é SINDICO.',
    content: json(ref('Erro'), {
      statusCode: 403,
      message: 'Forbidden resource',
      error: 'Forbidden',
    }),
  },
  404: (msg: string) => ({
    description: 'Registro não encontrado.',
    content: json(ref('Erro'), { statusCode: 404, message: msg, error: 'Not Found' }),
  }),
  409: (msg: string) => ({
    description: 'Conflito (valor único já existente ou regra de negócio violada).',
    content: json(ref('Erro'), { statusCode: 409, message: msg, error: 'Conflict' }),
  }),
};

// ───────────────────────── parâmetros ─────────────────────────
const q = (name: string, description: string, schema: any) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
});
const P_PAGE = q('page', 'Número da página (padrão 1)', { type: 'integer', minimum: 1, default: 1 });
const P_SIZE = q('pageSize', 'Itens por página (padrão 20)', {
  type: 'integer',
  minimum: 1,
  default: 20,
});
const P_STATUS = (campo: string) =>
  q('status', `Filtra por ${campo}: 1 = ativo, 0 = inativo (excluído logicamente). Sem o filtro, retorna todos.`, {
    type: 'integer',
    enum: [0, 1],
  });
const idParam = (nome: string, example = 1) => ({
  name: 'id',
  in: 'path',
  required: true,
  description: `ID de ${nome}`,
  schema: { type: 'integer', example },
});

// ───────────────────────── operações ─────────────────────────
interface OpDef {
  tag: string;
  summary: string;
  description?: string;
  sindico?: boolean; // exige perfil SINDICO
  public?: boolean; // sem token
  parameters?: any[];
  requestBody?: any;
  ok: [code: number, description: string, schema: any, example?: any];
  errors?: Array<[number, string?]>;
}

const op = (d: OpDef) => {
  const responses: Record<string, any> = {
    [d.ok[0]]: { description: d.ok[1], content: json(d.ok[2], d.ok[3]) },
  };
  const errs: Array<[number, string?]> = [...(d.errors ?? [])];
  if (d.requestBody || (d.parameters ?? []).some((p) => p.in === 'query')) {
    if (!errs.some(([c]) => c === 400)) errs.unshift([400]);
  }
  if (!d.public) errs.push([401]);
  if (d.sindico) errs.push([403]);
  for (const [code, msg] of errs) {
    const e: any = (ERR as any)[code];
    responses[code] = typeof e === 'function' ? e(msg ?? '') : e;
  }
  return {
    tags: [d.tag],
    summary: d.summary,
    description:
      (d.description ? d.description + '\n\n' : '') +
      (d.public
        ? '**Acesso:** público.'
        : d.sindico
          ? '**Acesso:** exige token JWT com perfil `SINDICO`.'
          : '**Acesso:** exige token JWT (qualquer perfil).'),
    security: d.public ? [] : [{ JWT: [] }],
    ...(d.parameters?.length ? { parameters: d.parameters } : {}),
    ...(d.requestBody ? { requestBody: d.requestBody } : {}),
    responses,
  };
};

// ───────────────────────── exemplos ─────────────────────────
const EX_BLOCO = { blocoId: 1, blocoNome: 'Bloco A', blocoDescricao: 'Torre frontal, 6 pavimentos', blocoStatus: 1 };
const EX_IMOVEL = {
  imovelId: 3,
  imovelNumero: '101',
  imovelAndar: 1,
  blocoId: 1,
  imovelAreaM2: '78.50',
  imovelMatricula: '12345678',
  imovelIptu: '123456789012345678901234',
  imovelTipo: 'APARTAMENTO',
  imovelGaragem: 1,
  imovelStatus: 1,
};
const EX_MORADOR = {
  moradorId: 7,
  moradorNome: 'Ana Beatriz Souza',
  moradorCpf: '11122233344',
  moradorEmail: 'ana.souza@email.com',
  moradorTelefone: '(21) 99999-0000',
  moradorDataNascimento: '1990-05-14T00:00:00.000Z',
  moradorDataCadastro: '2026-09-01T12:00:00.000Z',
  moradorDeficienciaLocomocao: 0,
  moradorStatus: 1,
};
const EX_USUARIO = {
  usuarioId: 42,
  usuarioLogin: 'ana.souza',
  usuarioPerfil: 'MORADOR',
  usuarioDataCriacao: '2026-09-01T12:00:00.000Z',
  usuarioUltimoAcesso: null,
  usuarioStatus: 1,
};
const EX_REL = {
  moradorImovelId: 15,
  moradorId: 7,
  imovelId: 3,
  moradorImovelTipoRelacao: 'PROPRIETARIO',
  moradorImovelDataInicio: '2021-03-12T00:00:00.000Z',
  moradorImovelDataFim: null,
  moradorImovelStatus: 1,
  usuarioId: 42,
  estado: 'ATIVO',
};
const pagedEx = (item: any, total = 1) => ({ data: [item], total, page: 1, pageSize: 20, totalPages: 1 });

// ───────────────────────── schemas ─────────────────────────
const TIPO_IMOVEL = { type: 'string', enum: ['COBERTURA', 'APARTAMENTO'], example: 'APARTAMENTO' };
const TIPO_RELACAO = {
  type: 'string',
  enum: ['PROPRIETARIO', 'INQUILINO', 'MORADOR', 'TEMPORADA'],
  example: 'PROPRIETARIO',
};
const PERFIL = { type: 'string', enum: ['SINDICO', 'MORADOR'], example: 'MORADOR' };

const blocoBase = {
  blocoId: int(1),
  blocoNome: str('Bloco A', 'Nome único do bloco'),
  blocoDescricao: { ...str('Torre frontal, 6 pavimentos'), nullable: true },
  blocoStatus: flag('1 = ativo, 0 = inativo (soft-delete)'),
};
const imovelBase = {
  imovelId: int(3),
  imovelNumero: str('101', 'Número do imóvel (único dentro do bloco)'),
  imovelAndar: { ...int(1), nullable: true },
  blocoId: int(1),
  imovelAreaM2: {
    ...str('78.50', 'Área em m² (o Prisma serializa Decimal como string)'),
    nullable: true,
  },
  imovelMatricula: { ...str('12345678'), nullable: true },
  imovelIptu: { ...str('123456789012345678901234'), nullable: true },
  imovelTipo: TIPO_IMOVEL,
  imovelGaragem: { ...int(1, 'Quantidade de vagas'), nullable: true },
  imovelStatus: flag('1 = ativo, 0 = inativo (soft-delete)'),
};
const moradorBase = {
  moradorId: int(7),
  moradorNome: str('Ana Beatriz Souza'),
  moradorCpf: str('11122233344', 'CPF com 11 dígitos, sem pontuação (único)'),
  moradorEmail: { ...str('ana.souza@email.com', 'E-mail (único)'), nullable: true },
  moradorTelefone: { ...str('(21) 99999-0000'), nullable: true },
  moradorDataNascimento: { ...dateTime('1990-05-14T00:00:00.000Z'), nullable: true },
  moradorDataCadastro: dateTime('2026-09-01T12:00:00.000Z', 'Preenchido automaticamente'),
  moradorDeficienciaLocomocao: {
    ...flag('1 = possui, 0 = não possui'),
    nullable: true,
  },
  moradorStatus: flag('1 = ativo, 0 = inativo (soft-delete)'),
};
const usuarioBase = {
  usuarioId: int(42),
  usuarioLogin: str('ana.souza'),
  usuarioPerfil: PERFIL,
  usuarioDataCriacao: dateTime('2026-09-01T12:00:00.000Z'),
  usuarioUltimoAcesso: { ...dateTime('2026-09-10T08:30:00.000Z'), nullable: true },
  usuarioStatus: flag('1 = ativo, 0 = acesso revogado'),
};
const relBase = {
  moradorImovelId: int(15),
  moradorId: int(7),
  imovelId: int(3),
  moradorImovelTipoRelacao: TIPO_RELACAO,
  moradorImovelDataInicio: dateTime('2021-03-12T00:00:00.000Z'),
  moradorImovelDataFim: { ...dateTime('2025-06-10T00:00:00.000Z'), nullable: true },
  moradorImovelStatus: flag('1 = ativo, 0 = removido (soft-delete)'),
  usuarioId: { ...int(42, 'Conta de acesso vinculada (opcional)'), nullable: true },
  estado: {
    type: 'string',
    enum: ['ATIVO', 'ENCERRANDO', 'ENCERRADO'],
    example: 'ATIVO',
    description:
      'Derivado a cada resposta (não é coluna do banco): sem data_fim = ATIVO; data_fim no futuro = ENCERRANDO; data_fim hoje ou no passado = ENCERRADO.',
  },
};

const blocoCreate = obj(
  {
    blocoNome: str('Bloco A', 'Nome único do bloco', { maxLength: 50 }),
    blocoDescricao: str('Torre frontal, 6 pavimentos', undefined, { maxLength: 255 }),
    blocoStatus: flag('Padrão 1 (ativo)'),
  },
  ['blocoNome'],
);
const imovelCreate = obj(
  {
    imovelNumero: str('101', 'Único dentro do bloco', { maxLength: 20 }),
    imovelAndar: int(1),
    blocoId: int(1, 'O bloco precisa existir'),
    imovelAreaM2: { type: 'number', minimum: 0, example: 78.5 },
    imovelMatricula: str('12345678', undefined, { maxLength: 8 }),
    imovelIptu: str('123456789012345678901234', undefined, { maxLength: 24 }),
    imovelTipo: TIPO_IMOVEL,
    imovelGaragem: { type: 'integer', minimum: 0, example: 1 },
    imovelStatus: flag('Padrão 1 (ativo)'),
  },
  ['imovelNumero', 'blocoId', 'imovelTipo'],
);
const moradorCreate = obj(
  {
    moradorNome: str('Ana Beatriz Souza', undefined, { maxLength: 300 }),
    moradorCpf: str('11122233344', 'Exatamente 11 dígitos, sem pontuação', {
      minLength: 11,
      maxLength: 11,
    }),
    moradorEmail: str('ana.souza@email.com', undefined, { format: 'email', maxLength: 150 }),
    moradorTelefone: str('(21) 99999-0000', undefined, { maxLength: 20 }),
    moradorDataNascimento: date('1990-05-14'),
    moradorDeficienciaLocomocao: flag('1 = possui, 0 = não possui'),
    moradorStatus: flag('Padrão 1 (ativo)'),
  },
  ['moradorNome', 'moradorCpf'],
);
const usuarioCreate = obj(
  {
    usuarioLogin: str('ana.souza', 'Único', { maxLength: 100 }),
    senha: str('minhasenha123', 'Texto puro, mínimo 8 caracteres — o serviço grava apenas o hash (bcrypt)', {
      minLength: 8,
      format: 'password',
    }),
    usuarioPerfil: { ...PERFIL, description: 'Padrão MORADOR' },
    usuarioStatus: flag('Padrão 1 (ativo)'),
    moradorImovelId: int(15, 'Opcional: já vincula esta conta a uma relação morador_imovel existente'),
  },
  ['usuarioLogin', 'senha'],
);
const relCreate = obj(
  {
    moradorId: int(7, 'O morador precisa existir'),
    imovelId: int(3, 'O imóvel precisa existir'),
    moradorImovelTipoRelacao: TIPO_RELACAO,
    moradorImovelDataInicio: date('2021-03-12'),
    moradorImovelDataFim: date('2025-06-10', 'Opcional; não pode ser anterior à data de início'),
    moradorImovelStatus: flag('Padrão 1 (ativo)'),
  },
  ['moradorId', 'imovelId', 'moradorImovelTipoRelacao', 'moradorImovelDataInicio'],
);

const schemas: Record<string, any> = {
  Erro: obj({
    statusCode: int(404),
    message: str('Bloco #99 não encontrado.'),
    error: str('Not Found'),
  }),
  ErroValidacao: obj({
    statusCode: int(400),
    message: { ...arr({ type: 'string' }), example: ['moradorCpf deve ter exatamente 11 dígitos (sem pontuação).'] },
    error: str('Bad Request'),
  }),

  LoginRequest: obj(
    { usuarioLogin: str('admin'), senha: str('Admin@12345', undefined, { format: 'password' }) },
    ['usuarioLogin', 'senha'],
  ),
  LoginResponse: obj({
    accessToken: str('eyJhbGciOiJIUzI1NiIs...', 'JWT — enviar em Authorization: Bearer <token>'),
    usuario: obj({
      usuarioId: int(42),
      usuarioLogin: str('ana.souza'),
      usuarioPerfil: PERFIL,
      moradorId: { ...int(7, 'Resolvido via morador_imovel.usuario_id; null para contas sem vínculo'), nullable: true },
    }),
  }),
  TokenPayload: obj({
    sub: int(42, 'usuario_id'),
    usuarioId: int(42),
    moradorId: { ...int(7), nullable: true },
    usuarioPerfil: PERFIL,
    iat: int(1760000000, 'Emitido em (epoch)'),
    exp: int(1760028800, 'Expira em (epoch)'),
  }),

  Bloco: obj(blocoBase),
  BlocoLista: obj({ ...blocoBase, _count: obj({ imoveis: int(18, 'Quantidade de imóveis do bloco') }) }),
  BlocoDetalhe: obj({ ...blocoBase, imoveis: arr(ref('Imovel')) }),
  BlocoCreate: blocoCreate,
  BlocoUpdate: partial(blocoCreate),

  Imovel: obj(imovelBase),
  ImovelLista: obj({ ...imovelBase, bloco: obj({ blocoNome: str('Bloco A') }) }),
  ImovelDetalhe: obj({
    ...imovelBase,
    bloco: ref('Bloco'),
    moradorImoveis: {
      ...arr(obj({ ...relBase, morador: ref('Morador') })),
      description: 'Vínculos deste imóvel, cada um com o morador',
    },
  }),
  ImovelCreate: imovelCreate,
  ImovelUpdate: partial(imovelCreate),

  Morador: obj(moradorBase),
  MoradorDetalhe: obj({
    ...moradorBase,
    moradorImoveis: {
      ...arr(obj({ ...relBase, imovel: obj({ ...imovelBase, bloco: ref('Bloco') }) })),
      description: 'Vínculos do morador, cada um com o imóvel e o bloco',
    },
  }),
  MoradorCreate: moradorCreate,
  MoradorUpdate: partial(moradorCreate),

  Usuario: obj(usuarioBase),
  UsuarioCreate: usuarioCreate,
  UsuarioUpdate: partial(usuarioCreate, ['senha']),
  TrocaSenha: obj({ novaSenha: str('novaSenha456', 'Mínimo 8 caracteres', { minLength: 8, format: 'password' }) }, [
    'novaSenha',
  ]),

  MoradorImovel: obj(relBase),
  MoradorImovelLista: obj({
    ...relBase,
    morador: obj({ moradorId: int(7), moradorNome: str('Ana Beatriz Souza') }),
    imovel: obj({ imovelId: int(3), imovelNumero: str('101'), blocoId: int(1) }),
  }),
  MoradorImovelDetalhe: obj({
    ...relBase,
    morador: ref('Morador'),
    imovel: obj({ ...imovelBase, bloco: ref('Bloco') }),
  }),
  MoradorImovelCreate: relCreate,
  MoradorImovelUpdate: partial(relCreate),
  EncerrarRelacao: obj(
    { moradorImovelDataFim: date('2026-12-31', 'Não pode ser anterior à data de início da relação') },
    ['moradorImovelDataFim'],
  ),

  PaginadoBloco: paged('BlocoLista', 'Blocos (com contagem de imóveis), ordenados por nome'),
  PaginadoImovel: paged('ImovelLista', 'Imóveis, ordenados por bloco e número'),
  PaginadoMorador: paged('Morador', 'Moradores, ordenados por nome'),
  PaginadoUsuario: paged('Usuario', 'Usuários, ordenados por login (nunca inclui o hash da senha)'),
  PaginadoMoradorImovel: paged('MoradorImovelLista', 'Relações, da mais recente para a mais antiga'),
};

// ───────────────────────── rotas ─────────────────────────
const paths: Record<string, any> = {
  '/auth/login': {
    post: op({
      tag: 'Autenticação',
      summary: 'Login',
      description:
        'Valida login e senha (hash bcrypt) de um usuário **ativo** e devolve o token JWT (validade configurada em `JWT_EXPIRES_IN`, padrão 8h). O `moradorId` é resolvido consultando `morador_imovel.usuario_id`.',
      public: true,
      requestBody: body('LoginRequest', { usuarioLogin: 'admin', senha: 'Admin@12345' }),
      ok: [
        201,
        'Autenticado',
        ref('LoginResponse'),
        {
          accessToken: 'eyJhbGciOiJIUzI1NiIs...',
          usuario: { usuarioId: 42, usuarioLogin: 'ana.souza', usuarioPerfil: 'MORADOR', moradorId: 7 },
        },
      ],
      errors: [[401, 'Login ou senha inválidos.']],
    }),
  },
  '/auth/me': {
    get: op({
      tag: 'Autenticação',
      summary: 'Dados do token atual',
      description: 'Devolve o payload decodificado do token — útil para o frontend validar a sessão.',
      ok: [
        200,
        'Payload do token',
        ref('TokenPayload'),
        { sub: 42, usuarioId: 42, moradorId: 7, usuarioPerfil: 'MORADOR', iat: 1760000000, exp: 1760028800 },
      ],
    }),
  },

  '/bloco': {
    post: op({
      tag: 'Bloco',
      summary: 'Cria um bloco',
      sindico: true,
      requestBody: body('BlocoCreate', { blocoNome: 'Bloco A', blocoDescricao: 'Torre frontal, 6 pavimentos' }),
      ok: [201, 'Bloco criado', ref('Bloco'), EX_BLOCO],
      errors: [[409, 'Já existe um bloco com esse nome.']],
    }),
    get: op({
      tag: 'Bloco',
      summary: 'Lista blocos',
      description: 'Lista paginada, ordenada por nome, com a contagem de imóveis de cada bloco (`_count.imoveis`).',
      parameters: [
        P_PAGE,
        P_SIZE,
        P_STATUS('bloco_status'),
        q('busca', 'Texto contido no nome do bloco', { type: 'string', example: 'Bloco' }),
      ],
      ok: [200, 'Página de blocos', ref('PaginadoBloco'), pagedEx({ ...EX_BLOCO, _count: { imoveis: 18 } })],
    }),
  },
  '/bloco/{id}': {
    get: op({
      tag: 'Bloco',
      summary: 'Detalhe do bloco',
      description: 'Retorna o bloco com a lista de imóveis.',
      parameters: [idParam('bloco')],
      ok: [200, 'Bloco com imóveis', ref('BlocoDetalhe'), { ...EX_BLOCO, imoveis: [EX_IMOVEL] }],
      errors: [[404, 'Bloco #99 não encontrado.']],
    }),
    patch: op({
      tag: 'Bloco',
      summary: 'Edita parcialmente um bloco',
      description: 'Envie apenas os campos que deseja alterar.',
      sindico: true,
      parameters: [idParam('bloco')],
      requestBody: body('BlocoUpdate', { blocoDescricao: 'Torre frontal, 7 pavimentos' }),
      ok: [200, 'Bloco atualizado', ref('Bloco'), EX_BLOCO],
      errors: [[404, 'Bloco #99 não encontrado.'], [409, 'Já existe um bloco com esse nome.']],
    }),
    delete: op({
      tag: 'Bloco',
      summary: 'Exclui logicamente um bloco',
      description: 'Soft-delete: muda `bloco_status` para 0, preservando o histórico dos imóveis vinculados.',
      sindico: true,
      parameters: [idParam('bloco')],
      ok: [200, 'Bloco com status 0', ref('Bloco'), { ...EX_BLOCO, blocoStatus: 0 }],
      errors: [[404, 'Bloco #99 não encontrado.']],
    }),
  },

  '/imovel': {
    post: op({
      tag: 'Imóvel',
      summary: 'Cria um imóvel',
      description: 'Valida que o bloco informado existe. O par (bloco, número) é único.',
      sindico: true,
      requestBody: body('ImovelCreate', {
        imovelNumero: '101',
        imovelAndar: 1,
        blocoId: 1,
        imovelAreaM2: 78.5,
        imovelTipo: 'APARTAMENTO',
        imovelGaragem: 1,
      }),
      ok: [201, 'Imóvel criado', ref('Imovel'), EX_IMOVEL],
      errors: [[404, 'Bloco #99 não encontrado.'], [409, 'Já existe um imóvel com esse número neste bloco.']],
    }),
    get: op({
      tag: 'Imóvel',
      summary: 'Lista imóveis',
      description: 'Lista paginada, ordenada por bloco e número, com o nome do bloco.',
      parameters: [
        P_PAGE,
        P_SIZE,
        q('blocoId', 'Filtra pelo ID do bloco', { type: 'integer', example: 1 }),
        q('tipo', 'Filtra pelo tipo do imóvel', TIPO_IMOVEL),
        P_STATUS('imovel_status'),
      ],
      ok: [200, 'Página de imóveis', ref('PaginadoImovel'), pagedEx({ ...EX_IMOVEL, bloco: { blocoNome: 'Bloco A' } })],
    }),
  },
  '/imovel/{id}': {
    get: op({
      tag: 'Imóvel',
      summary: 'Detalhe do imóvel',
      description: 'Retorna o imóvel com o bloco e os moradores vinculados. Usado pelos MS Financeiro e Serviços para validar `imovel_id`.',
      parameters: [idParam('imóvel', 3)],
      ok: [
        200,
        'Imóvel com bloco e vínculos',
        ref('ImovelDetalhe'),
        { ...EX_IMOVEL, bloco: EX_BLOCO, moradorImoveis: [{ ...EX_REL, morador: EX_MORADOR }] },
      ],
      errors: [[404, 'Imóvel #99 não encontrado.']],
    }),
    patch: op({
      tag: 'Imóvel',
      summary: 'Edita parcialmente um imóvel',
      sindico: true,
      parameters: [idParam('imóvel', 3)],
      requestBody: body('ImovelUpdate', { imovelGaragem: 2 }),
      ok: [200, 'Imóvel atualizado', ref('Imovel'), EX_IMOVEL],
      errors: [[404, 'Imóvel #99 não encontrado.'], [409, 'Já existe um imóvel com esse número neste bloco.']],
    }),
    delete: op({
      tag: 'Imóvel',
      summary: 'Exclui logicamente um imóvel',
      description: 'Soft-delete: muda `imovel_status` para 0.',
      sindico: true,
      parameters: [idParam('imóvel', 3)],
      ok: [200, 'Imóvel com status 0', ref('Imovel'), { ...EX_IMOVEL, imovelStatus: 0 }],
      errors: [[404, 'Imóvel #99 não encontrado.']],
    }),
  },

  '/morador': {
    post: op({
      tag: 'Morador',
      summary: 'Cadastra um morador',
      description: 'CPF (11 dígitos, sem pontuação) e e-mail são únicos.',
      sindico: true,
      requestBody: body('MoradorCreate', {
        moradorNome: 'Ana Beatriz Souza',
        moradorCpf: '11122233344',
        moradorEmail: 'ana.souza@email.com',
        moradorTelefone: '(21) 99999-0000',
        moradorDataNascimento: '1990-05-14',
      }),
      ok: [201, 'Morador criado', ref('Morador'), EX_MORADOR],
      errors: [[409, 'Já existe um morador com esse(a) CPF.']],
    }),
    get: op({
      tag: 'Morador',
      summary: 'Lista moradores',
      description: 'Lista paginada, ordenada por nome.',
      parameters: [
        P_PAGE,
        P_SIZE,
        P_STATUS('morador_status'),
        q('busca', 'Procura (contém) no nome, CPF e e-mail', { type: 'string', example: 'ana' }),
      ],
      ok: [200, 'Página de moradores', ref('PaginadoMorador'), pagedEx(EX_MORADOR)],
    }),
  },
  '/morador/{id}': {
    get: op({
      tag: 'Morador',
      summary: 'Detalhe do morador',
      description:
        'Retorna o morador com os imóveis vinculados (e o bloco de cada um). Usado pelo MS Serviços para validar `morador_id`. Atenção: não filtra por status, então um morador excluído logicamente ainda é retornado (com `moradorStatus: 0`).',
      parameters: [idParam('morador', 7)],
      ok: [
        200,
        'Morador com vínculos',
        ref('MoradorDetalhe'),
        { ...EX_MORADOR, moradorImoveis: [{ ...EX_REL, imovel: { ...EX_IMOVEL, bloco: EX_BLOCO } }] },
      ],
      errors: [[404, 'Morador #99 não encontrado.']],
    }),
    patch: op({
      tag: 'Morador',
      summary: 'Edita parcialmente um morador',
      sindico: true,
      parameters: [idParam('morador', 7)],
      requestBody: body('MoradorUpdate', { moradorTelefone: '(21) 98888-7777' }),
      ok: [200, 'Morador atualizado', ref('Morador'), EX_MORADOR],
      errors: [[404, 'Morador #99 não encontrado.'], [409, 'Já existe um morador com esse(a) e-mail.']],
    }),
    delete: op({
      tag: 'Morador',
      summary: 'Exclui logicamente um morador',
      description: 'Soft-delete: muda `morador_status` para 0.',
      sindico: true,
      parameters: [idParam('morador', 7)],
      ok: [200, 'Morador com status 0', ref('Morador'), { ...EX_MORADOR, moradorStatus: 0 }],
      errors: [[404, 'Morador #99 não encontrado.']],
    }),
  },

  '/morador-imovel': {
    post: op({
      tag: 'Morador x Imóvel',
      summary: 'Cria o vínculo morador ↔ imóvel',
      description:
        'Valida que morador e imóvel existem e que `dataFim` não é anterior a `dataInicio`. A combinação (morador, imóvel, tipo de relação) é única.\n\nQuando o tipo é `PROPRIETARIO` ou `INQUILINO`, publica o evento `morador_imovel.vinculado` no RabbitMQ (consumido pelo MS Financeiro).',
      sindico: true,
      requestBody: body('MoradorImovelCreate', {
        moradorId: 7,
        imovelId: 3,
        moradorImovelTipoRelacao: 'PROPRIETARIO',
        moradorImovelDataInicio: '2021-03-12',
      }),
      ok: [201, 'Relação criada (com `estado` derivado)', ref('MoradorImovel'), EX_REL],
      errors: [
        [404, 'Morador #99 não encontrado.'],
        [409, 'Já existe uma relação com esse morador, imóvel e tipo de relação.'],
      ],
    }),
    get: op({
      tag: 'Morador x Imóvel',
      summary: 'Lista relações',
      description: 'Lista paginada, da mais recente para a mais antiga, com o morador e o imóvel resumidos. Cada item traz o `estado` derivado.',
      parameters: [
        P_PAGE,
        P_SIZE,
        q('moradorId', 'Filtra pelo ID do morador', { type: 'integer', example: 7 }),
        q('imovelId', 'Filtra pelo ID do imóvel', { type: 'integer', example: 3 }),
        q('tipoRelacao', 'Filtra pelo tipo de relação', TIPO_RELACAO),
        P_STATUS('morador_imovel_status'),
      ],
      ok: [
        200,
        'Página de relações',
        ref('PaginadoMoradorImovel'),
        pagedEx({
          ...EX_REL,
          morador: { moradorId: 7, moradorNome: 'Ana Beatriz Souza' },
          imovel: { imovelId: 3, imovelNumero: '101', blocoId: 1 },
        }),
      ],
    }),
  },
  '/morador-imovel/{id}': {
    get: op({
      tag: 'Morador x Imóvel',
      summary: 'Detalhe da relação',
      description: 'Retorna a relação com morador, imóvel e bloco.',
      parameters: [idParam('relação (morador_imovel_id)', 15)],
      ok: [
        200,
        'Relação detalhada',
        ref('MoradorImovelDetalhe'),
        { ...EX_REL, morador: EX_MORADOR, imovel: { ...EX_IMOVEL, bloco: EX_BLOCO } },
      ],
      errors: [[404, 'Relação #99 não encontrada.']],
    }),
    patch: op({
      tag: 'Morador x Imóvel',
      summary: 'Edita parcialmente uma relação',
      description: 'Mesmas validações do POST (inclusive `dataFim` ≥ `dataInicio`).',
      sindico: true,
      parameters: [idParam('relação (morador_imovel_id)', 15)],
      requestBody: body('MoradorImovelUpdate', { moradorImovelTipoRelacao: 'INQUILINO' }),
      ok: [200, 'Relação atualizada', ref('MoradorImovel'), EX_REL],
      errors: [
        [404, 'Relação #99 não encontrada.'],
        [409, 'morador_imovel_data_fim não pode ser anterior à data_inicio.'],
      ],
    }),
    delete: op({
      tag: 'Morador x Imóvel',
      summary: 'Exclui logicamente uma relação',
      description: 'Soft-delete: muda `morador_imovel_status` para 0.',
      sindico: true,
      parameters: [idParam('relação (morador_imovel_id)', 15)],
      ok: [200, 'Relação com status 0', ref('MoradorImovel'), { ...EX_REL, moradorImovelStatus: 0 }],
      errors: [[404, 'Relação #99 não encontrada.']],
    }),
  },
  '/morador-imovel/{id}/encerrar': {
    patch: op({
      tag: 'Morador x Imóvel',
      summary: 'Encerra a relação',
      description:
        'Define `morador_imovel_data_fim`. O `estado` (ATIVO / ENCERRANDO / ENCERRADO) é sempre derivado dessa data — não existe coluna própria. Uma data futura deixa a relação em ENCERRANDO.',
      sindico: true,
      parameters: [idParam('relação (morador_imovel_id)', 15)],
      requestBody: body('EncerrarRelacao', { moradorImovelDataFim: '2026-12-31' }),
      ok: [200, 'Relação encerrada', ref('MoradorImovel'), { ...EX_REL, moradorImovelDataFim: '2026-12-31T00:00:00.000Z', estado: 'ENCERRANDO' }],
      errors: [
        [404, 'Relação #99 não encontrada.'],
        [409, 'morador_imovel_data_fim não pode ser anterior à data_inicio.'],
      ],
    }),
  },

  '/usuario': {
    post: op({
      tag: 'Usuário',
      summary: 'Cria uma conta de acesso',
      description:
        'A `senha` vai em texto puro no corpo e é gravada como hash bcrypt (nunca retorna). Se `moradorImovelId` for enviado, a conta já é vinculada a essa relação (`morador_imovel.usuario_id`) na mesma transação.',
      sindico: true,
      requestBody: body('UsuarioCreate', {
        usuarioLogin: 'ana.souza',
        senha: 'minhasenha123',
        usuarioPerfil: 'MORADOR',
        moradorImovelId: 15,
      }),
      ok: [201, 'Usuário criado (sem o hash da senha)', ref('Usuario'), EX_USUARIO],
      errors: [[409, 'Já existe um usuário com esse login.']],
    }),
    get: op({
      tag: 'Usuário',
      summary: 'Lista usuários',
      description: 'Lista paginada, ordenada por login. Nunca retorna o hash da senha.',
      sindico: true,
      parameters: [P_PAGE, P_SIZE, q('perfil', 'Filtra pelo perfil', PERFIL)],
      ok: [200, 'Página de usuários', ref('PaginadoUsuario'), pagedEx(EX_USUARIO)],
    }),
  },
  '/usuario/{id}': {
    get: op({
      tag: 'Usuário',
      summary: 'Detalhe do usuário',
      sindico: true,
      parameters: [idParam('usuário', 42)],
      ok: [200, 'Usuário', ref('Usuario'), EX_USUARIO],
      errors: [[404, 'Usuário #99 não encontrado.']],
    }),
    patch: op({
      tag: 'Usuário',
      summary: 'Edita parcialmente um usuário',
      description: 'Não altera a senha — para isso use `PATCH /usuario/{id}/senha`.',
      sindico: true,
      parameters: [idParam('usuário', 42)],
      requestBody: body('UsuarioUpdate', { usuarioPerfil: 'SINDICO' }),
      ok: [200, 'Usuário atualizado', ref('Usuario'), EX_USUARIO],
      errors: [[404, 'Usuário #99 não encontrado.'], [409, 'Já existe um usuário com esse login.']],
    }),
    delete: op({
      tag: 'Usuário',
      summary: 'Revoga o acesso',
      description: 'Soft-delete: muda `usuario_status` para 0 (o login deixa de funcionar), sem apagar o histórico.',
      sindico: true,
      parameters: [idParam('usuário', 42)],
      ok: [200, 'Usuário com status 0', ref('Usuario'), { ...EX_USUARIO, usuarioStatus: 0 }],
      errors: [[404, 'Usuário #99 não encontrado.']],
    }),
  },
  '/usuario/{id}/senha': {
    patch: op({
      tag: 'Usuário',
      summary: 'Troca a senha',
      description: 'Grava o hash bcrypt da nova senha.',
      sindico: true,
      parameters: [idParam('usuário', 42)],
      requestBody: body('TrocaSenha', { novaSenha: 'novaSenha456' }),
      ok: [200, 'Senha alterada', ref('Usuario'), EX_USUARIO],
      errors: [[404, 'Usuário #99 não encontrado.']],
    }),
  },
};

// ───────────────────────── documento ─────────────────────────
const document: OpenAPIObject = {
  openapi: '3.0.0',
  info: {
    title: 'MS Moradores — PropTech',
    version: '1.0',
    description: [
      'Microsserviço de **Moradores** do PropTech (Gestor de Manutenção de Condomínios — PI Senac RJ): ',
      'blocos, imóveis, moradores, relações morador × imóvel, usuários e autenticação de todo o sistema.',
      '',
      '**Como testar**',
      '1. Em *Autenticação → POST /auth/login*, clique em *Try it out* e execute (o exemplo já vem preenchido).',
      '2. Copie o `accessToken` da resposta, clique em **Authorize** e cole só o token (sem a palavra `Bearer`).',
      '3. Execute qualquer rota. Rotas com 🔒 exigem token; as marcadas como *SINDICO* exigem também esse perfil (senão: 403).',
      '',
      '**Convenções**',
      '- Prefixo `/condominio/morador` em todas as rotas.',
      '- Exclusão é *lógica*: `DELETE` muda o `*_status` para 0 e o registro continua existindo.',
      '- Listagens aceitam `page` e `pageSize` e respondem `{ data, total, page, pageSize, totalPages }`.',
      '- Erros seguem `{ statusCode, message, error }`.',
    ].join('\n'),
  },
  servers: [{ url: `/${PREFIXO_API}`, description: 'MS Moradores' }],
  tags: [
    { name: 'Autenticação', description: 'Login e verificação do token JWT' },
    { name: 'Bloco', description: 'Blocos (torres) do condomínio' },
    { name: 'Imóvel', description: 'Apartamentos e coberturas' },
    { name: 'Morador', description: 'Cadastro de moradores' },
    { name: 'Morador x Imóvel', description: 'Relação de ocupação (proprietário, inquilino, morador, temporada)' },
    { name: 'Usuário', description: 'Contas de acesso (somente SINDICO)' },
  ],
  paths,
  components: {
    securitySchemes: {
      JWT: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token obtido em POST /auth/login' },
    },
    schemas,
  },
} as any;

export function setupSwagger(app: INestApplication) {
  SwaggerModule.setup(`${PREFIXO_API}/docs`, app, document, {
    customSiteTitle: 'MS Moradores — API',
    swaggerOptions: { persistAuthorization: true },
  });
}