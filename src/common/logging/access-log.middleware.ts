import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ipDoCliente } from './client-ip';

const logger = new Logger('HTTP');

// Log de acesso: uma linha por requisição respondida, com QUEM (id do usuário do token), O QUÊ
// (método, rota e status), QUANTO (duração) e DE ONDE (IP). O Logger do Nest acrescenta o QUANDO.
//   GET /condominio/morador/bloco 200 12ms | usuario=1 | ip=10.136.38.50
// Propositalmente NÃO registra query string (a busca pode conter CPF), corpo nem headers (senha e token).
// Não registra /health (chamado a cada poucos segundos) nem os arquivos do Swagger.
export function accessLog(req: Request, res: Response, next: NextFunction) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const caminho = req.originalUrl.split('?')[0];
    if (caminho.endsWith('/health') || caminho.includes('/docs')) return;

    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const usuario = (req as Request & { user?: { usuarioId?: number } }).user?.usuarioId ?? '-';
    const linha = `${req.method} ${caminho} ${res.statusCode} ${ms.toFixed(0)}ms | usuario=${usuario} | ip=${ipDoCliente(req)}`;

    if (res.statusCode >= 500) logger.error(linha);
    else if (res.statusCode >= 400) logger.warn(linha);
    else logger.log(linha);
  });
  next();
}
