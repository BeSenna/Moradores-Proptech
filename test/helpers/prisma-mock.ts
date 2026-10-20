// PrismaService "de mentira" para os testes: cada método vira um jest.fn() que cada teste configura.
// Assim os testes rodam sem MySQL e sem RabbitMQ.
const model = () => ({
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
});

export function createPrismaMock() {
  const mock: any = {
    bloco: model(),
    imovel: model(),
    morador: model(),
    usuario: model(),
    moradorImovel: model(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
  // aceita as duas formas usadas nos services: $transaction([a, b]) e $transaction(async (tx) => ...)
  mock.$transaction = jest.fn(async (arg: any) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(mock),
  );
  return mock;
}
