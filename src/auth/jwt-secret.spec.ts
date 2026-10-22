import { obterJwtSecret } from './jwt-secret';

describe('obterJwtSecret', () => {
  const original = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.JWT_SECRET = original;
  });

  it('devolve o segredo definido no ambiente', () => {
    process.env.JWT_SECRET = 'segredo-qualquer';
    expect(obterJwtSecret()).toBe('segredo-qualquer');
  });

  it('lança erro (e a API não sobe) quando JWT_SECRET está ausente ou vazia', () => {
    delete process.env.JWT_SECRET;
    expect(() => obterJwtSecret()).toThrow('JWT_SECRET');
    process.env.JWT_SECRET = '';
    expect(() => obterJwtSecret()).toThrow('JWT_SECRET');
  });
});
