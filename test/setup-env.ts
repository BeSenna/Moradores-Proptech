// Variáveis de ambiente fixas para os testes (carregado antes de qualquer import do app,
// pois o JwtModule lê JWT_SECRET no momento em que o módulo é carregado).
import { Logger } from '@nestjs/common';

// silencia o log do Nest durante os testes (os testes que verificam logs usam spyOn nos métodos do Logger)
Logger.overrideLogger(false);

process.env.JWT_SECRET = 'segredo-de-teste';
process.env.JWT_EXPIRES_IN = '1h';
delete process.env.ADMIN_SENHA; // evita criar síndico real/mocado sem querer
