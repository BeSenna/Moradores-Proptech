import { swaggerHabilitado } from './swagger.config';

describe('swaggerHabilitado', () => {
  it.each([
    [{}, true], // desenvolvimento: ligado
    [{ NODE_ENV: 'development' }, true],
    [{ NODE_ENV: 'test' }, true],
    [{ NODE_ENV: 'production' }, false], // imagem Docker: desligado por padrão
    [{ NODE_ENV: 'production', SWAGGER_ENABLED: '' }, false], // variável vazia (docker-compose) = padrão
    [{ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }, true], // ligado de propósito (demonstração)
    [{ NODE_ENV: 'production', SWAGGER_ENABLED: ' TRUE ' }, true],
    [{ NODE_ENV: 'production', SWAGGER_ENABLED: '1' }, true],
    [{ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }, false],
    [{ NODE_ENV: 'development', SWAGGER_ENABLED: '0' }, false],
  ])('%j → %s', (env, esperado) => {
    expect(swaggerHabilitado(env as NodeJS.ProcessEnv)).toBe(esperado);
  });
});
