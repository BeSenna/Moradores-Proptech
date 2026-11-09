import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('responde Healthy quando o banco responde', async () => {
    const controller = new HealthController({ $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) } as any);
    await expect(controller.check()).resolves.toEqual({
      status: 'Healthy',
      checks: { api: 'up', database: 'up' },
    });
  });

  it('responde 503 Unhealthy quando o banco falha, sem vazar o motivo', async () => {
    const controller = new HealthController({
      $queryRaw: jest.fn().mockRejectedValue(new Error("Access denied for user 'x'@'10.0.0.1'")),
    } as any);
    const erro = await controller.check().catch((e) => e);
    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(erro.getResponse())).not.toContain('Access denied');
    expect(erro.getResponse()).toEqual({ status: 'Unhealthy', checks: { api: 'up', database: 'down' } });
  });
});
