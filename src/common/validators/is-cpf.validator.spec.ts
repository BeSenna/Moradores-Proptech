import { cpfValido } from './is-cpf.validator';

describe('cpfValido', () => {
  it.each(['52998224725', '11144477735', '39053344705'])('aceita %s', (cpf) => {
    expect(cpfValido(cpf)).toBe(true);
  });

  it.each([
    ['dígito verificador errado', '52998224724'],
    ['sequência repetida', '11111111111'],
    ['letras', 'abcdefghijk'],
    ['pontuação', '529.982.247-25'],
    ['curto', '123'],
    ['longo', '529982247250'],
    ['vazio', ''],
  ])('rejeita %s', (_nome, cpf) => {
    expect(cpfValido(cpf)).toBe(false);
  });

  it('rejeita valores que não são string', () => {
    expect(cpfValido(null)).toBe(false);
    expect(cpfValido(52998224725)).toBe(false);
  });
});
