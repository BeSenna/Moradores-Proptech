// Lê o segredo usado para assinar e validar os tokens JWT.
// Sem JWT_SECRET a API NÃO sobe: um segredo "padrão" escrito no código permitiria
// a qualquer pessoa forjar um token de síndico.
export function obterJwtSecret(): string {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) {
    throw new Error('JWT_SECRET não definida. Defina no Infisical (ou no .env).');
  }
  return segredo;
}
