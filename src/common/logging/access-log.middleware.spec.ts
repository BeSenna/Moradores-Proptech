import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import { accessLog } from './access-log.middleware';
import { ipDoCliente, textoSeguroParaLog } from './client-ip';

function requisicao(extra: Record<string, unknown> = {}) {
  return { method: 'GET', originalUrl: '/condominio/morador/bloco', headers: {}, ip: '10.0.0.5', ...extra } as any;
}
function resposta(status: number) {
  const res = new EventEmitter() as any;
  res.statusCode = status;
  return res;
}

describe('accessLog', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  const rodar = (req: any, res: any) => {
    const next = jest.fn();
    accessLog(req, res, next);
    res.emit('finish');
    expect(next).toHaveBeenCalled();
  };

  it('registra método, rota, status, usuário e IP — sem query string', () => {
    rodar(requisicao({ originalUrl: '/condominio/morador/morador?busca=52998224725', user: { usuarioId: 7 } }), resposta(200));
    const linha = log.mock.calls[0][0] as string;
    expect(linha).toMatch(/^GET \/condominio\/morador\/morador 200 \d+ms \| usuario=7 \| ip=10\.0\.0\.5$/);
    expect(linha).not.toContain('52998224725');
  });

  it('usa o nível de acordo com o status (4xx = warn, 5xx = error) e "-" sem usuário', () => {
    rodar(requisicao(), resposta(401));
    expect(warn.mock.calls[0][0]).toContain('401');
    expect(warn.mock.calls[0][0]).toContain('usuario=-');
    rodar(requisicao(), resposta(500));
    expect(error.mock.calls[0][0]).toContain('500');
  });

  it('não registra /health nem o Swagger', () => {
    rodar(requisicao({ originalUrl: '/condominio/morador/health' }), resposta(200));
    rodar(requisicao({ originalUrl: '/condominio/morador/docs/swagger-ui.css' }), resposta(200));
    expect(log).not.toHaveBeenCalled();
  });
});

describe('ipDoCliente / textoSeguroParaLog', () => {
  it('prefere o primeiro IP de X-Forwarded-For e tira o prefixo IPv4-mapeado', () => {
    expect(ipDoCliente({ headers: { 'x-forwarded-for': '200.1.2.3, 10.0.0.1' }, ip: '10.0.0.9' } as any)).toBe('200.1.2.3');
    expect(ipDoCliente({ headers: {}, ip: '::ffff:192.168.0.12' } as any)).toBe('192.168.0.12');
  });

  it('remove quebras de linha e limita o tamanho', () => {
    expect(textoSeguroParaLog('ana\nFALSO | login ok')).toBe('ana FALSO | login ok');
    expect(textoSeguroParaLog('x'.repeat(500))).toHaveLength(100);
  });
});
