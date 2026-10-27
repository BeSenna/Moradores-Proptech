import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';

// Parâmetros de query opcionais, validados de forma explícita.
// Não usamos `@Query('x') x?: number` porque o ValidationPipe global (enableImplicitConversion)
// transforma "abc" e "ausente" em NaN — e aí não dá mais para distinguir um do outro.
// Ausente => undefined; presente e inválido => 400 (em vez de 500 ou filtro ignorado).

function ler(ctx: ExecutionContext, nome: string): string | undefined {
  const bruto = ctx.switchToHttp().getRequest().query?.[nome];
  if (bruto === undefined) return undefined;
  if (typeof bruto !== 'string') {
    throw new BadRequestException(`O parâmetro de consulta "${nome}" deve ser informado uma única vez.`);
  }
  return bruto;
}

export const QueryInt = createParamDecorator((nome: string, ctx: ExecutionContext): number | undefined => {
  const valor = ler(ctx, nome);
  if (valor === undefined) return undefined;
  if (!/^\d{1,9}$/.test(valor)) {
    throw new BadRequestException(`O parâmetro de consulta "${nome}" deve ser um número inteiro não negativo.`);
  }
  return Number(valor);
});

export const QueryEnum = createParamDecorator(
  (opcoes: { nome: string; valores: readonly string[] }, ctx: ExecutionContext): string | undefined => {
    const valor = ler(ctx, opcoes.nome);
    if (valor === undefined) return undefined;
    if (!opcoes.valores.includes(valor)) {
      throw new BadRequestException(
        `O parâmetro de consulta "${opcoes.nome}" deve ser um de: ${opcoes.valores.join(', ')}.`,
      );
    }
    return valor;
  },
);
