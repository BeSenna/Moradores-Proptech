import { validate } from 'class-validator';
import { IsSenhaForte, validarSenha } from './senha-forte';

describe('validarSenha', () => {
  it('aceita senha dentro da política', () => {
    expect(validarSenha('Senha@1234')).toBeNull();
    expect(validarSenha('Aa1!aaaa')).toBeNull(); // 8 caracteres (limite inferior)
    expect(validarSenha('Aa1!aaaaaaaaaaaa')).toBeNull(); // 16 caracteres (limite superior)
  });

  it.each([
    ['', 'obrigatória'],
    ['Ab1!', 'entre 8 e 16'],
    ['Aa1!aaaaaaaaaaaaa', 'entre 8 e 16'], // 17
    ['senha@1234', 'maiúscula'],
    ['SENHA@1234', 'minúscula'],
    ['Senha@abcd', 'número'],
    ['Senha12345', 'especial'],
  ])('recusa "%s"', (senha, trecho) => {
    expect(validarSenha(senha)).toContain(trecho);
  });

  it('recusa valores que não são texto', () => {
    expect(validarSenha(undefined)).not.toBeNull();
    expect(validarSenha(12345678)).not.toBeNull();
  });
});

describe('@IsSenhaForte', () => {
  class Dto {
    @IsSenhaForte()
    senha!: string;
  }
  const checar = async (senha: unknown) => validate(Object.assign(new Dto(), { senha }));

  it('não gera erro para senha válida', async () => {
    expect(await checar('Senha@1234')).toHaveLength(0);
  });

  it('gera erro com a mensagem do requisito que falhou', async () => {
    const erros = await checar('senhafraca');
    expect(erros).toHaveLength(1);
    expect(Object.values(erros[0].constraints ?? {})[0]).toContain('maiúscula');
  });
});
