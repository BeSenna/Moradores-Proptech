import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

// Pega erros do Prisma que escaparem dos try/catch dos services (ex.: P2025 - registro não encontrado
// em alguma operação não coberta explicitamente) e devolve uma resposta HTTP legível.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const mapaStatus: Record<string, number> = {
      P2002: HttpStatus.CONFLICT,
      P2003: HttpStatus.CONFLICT, // violação de FK
      P2025: HttpStatus.NOT_FOUND,
    };

    const status = mapaStatus[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      error: exception.code,
      message: exception.message.split('\n').pop()?.trim() ?? 'Erro no banco de dados.',
    });
  }
}
