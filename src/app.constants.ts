// Prefixo opcional das rotas (variável API_PREFIX). Vazio por padrão: a API atende na raiz (/health, /bloco...).
// O servidor da faculdade publica o serviço em http://academico3.rj.senac.br/condominio/morador e RETIRA esse
// trecho antes de repassar a requisição, então quem acessa /condominio/morador/health chega aqui como /health.
// Só use API_PREFIX se algum proxy passar a repassar o caminho completo (ex.: API_PREFIX=condominio/morador).
export const PREFIXO_API = (process.env.API_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, '');

// Monta um caminho absoluto sob o prefixo: caminhoApi('health') -> '/health' (ou '/condominio/morador/health')
export const caminhoApi = (rota = '') => '/' + [PREFIXO_API, rota.replace(/^\/+/, '')].filter(Boolean).join('/');
