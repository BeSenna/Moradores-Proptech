import { registerDecorator, ValidationOptions } from 'class-validator';

// Valida CPF só com dígitos (11) e confere os dois dígitos verificadores.
// Rejeita sequências repetidas (000.000.000-00, 111.111.111-11 etc.).
export function cpfValido(valor: unknown): boolean {
  if (typeof valor !== 'string' || !/^\d{11}$/.test(valor)) return false;
  if (/^(\d)\1{10}$/.test(valor)) return false;

  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return (
    digito(valor.slice(0, 9), 10) === Number(valor[9]) &&
    digito(valor.slice(0, 10), 11) === Number(valor[10])
  );
}

export function IsCpf(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName,
      options: {
        message: 'morador_cpf deve ser um CPF válido com 11 dígitos (sem pontuação).',
        ...options,
      },
      validator: { validate: (v) => cpfValido(v) },
    });
}
