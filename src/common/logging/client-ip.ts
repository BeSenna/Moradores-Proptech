import { Request } from 'express';

// IP de quem fez a requisição. Atrás do gateway/proxy o IP "direto" é o do proxy, então usamos o
// primeiro endereço de X-Forwarded-For quando existir. Serve apenas para LOG (o header pode ser
// forjado pelo cliente): não use para decisões de segurança.
export function ipDoCliente(req: Pick<Request, 'headers' | 'ip' | 'socket'>): string {
  const encaminhado = req.headers?.['x-forwarded-for'];
  const bruto = Array.isArray(encaminhado) ? encaminhado[0] : encaminhado;
  const ip = bruto?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || '-';
  return ip.replace(/^::ffff:/, '');
}

// Texto digitado pelo usuário (ex.: o login) vai para o log: remove quebras de linha e limita o
// tamanho, para ninguém conseguir "forjar" linhas de log.
export function textoSeguroParaLog(valor: unknown, max = 100): string {
  return String(valor ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, max);
}
