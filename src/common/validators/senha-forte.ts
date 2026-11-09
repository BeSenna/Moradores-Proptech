import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

// Política de senha das contas de acesso (a mesma regra existe no frontend, em src/lib/senha.ts):
// 8 a 16 caracteres, com letra maiúscula, minúscula, número e caractere especial.
export const SENHA_MIN = 8;
export const SENHA_MAX = 16;
export const SENHA_DICA = `De ${SENHA_MIN} a ${SENHA_MAX} caracteres, com letra maiúscula, minúscula, número e caractere especial.`;

/** Devolve a mensagem do primeiro requisito não atendido, ou null se a senha é válida. */
export function validarSenha(senha: unknown): string | null {
  if (typeof senha !== 'string' || senha.length === 0) return 'A senha é obrigatória.';
  if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) {
    return `A senha deve ter entre ${SENHA_MIN} e ${SENHA_MAX} caracteres.`;
  }
  if (!/[A-Z]/.test(senha) || !/[a-z]/.test(senha)) {
    return 'A senha deve ter ao menos uma letra maiúscula e uma minúscula.';
  }
  if (!/\d/.test(senha)) return 'A senha deve ter ao menos um número.';
  if (!/[^A-Za-z0-9]/.test(senha)) return 'A senha deve ter ao menos um caractere especial.';
  return null;
}

/** Decorator do class-validator: recusa (400) senhas fora da política, dizendo qual requisito falhou. */
export function IsSenhaForte(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSenhaForte',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => validarSenha(value) === null,
        defaultMessage: (args: ValidationArguments) => validarSenha(args.value) ?? 'Senha inválida.',
      },
    });
  };
}
