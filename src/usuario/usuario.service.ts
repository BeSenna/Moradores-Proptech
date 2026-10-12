import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

const SALT_ROUNDS = 10;

// Seleção explícita que nunca inclui usuario_senha_hash nas respostas da API.
const SEM_SENHA = {
  usuarioId: true,
  usuarioLogin: true,
  usuarioPerfil: true,
  usuarioDataCriacao: true,
  usuarioUltimoAcesso: true,
  usuarioStatus: true,
} as const;

@Injectable()
export class UsuarioService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUsuarioDto) {
    const { senha, moradorImovelId, usuarioLogin, usuarioPerfil, usuarioStatus } = dto;
    const usuarioSenhaHash = await bcrypt.hash(senha!, SALT_ROUNDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            usuarioLogin: usuarioLogin!,
            usuarioPerfil: usuarioPerfil ?? 'MORADOR',
            usuarioStatus: usuarioStatus ?? 1,
            usuarioSenhaHash,
          },
          select: SEM_SENHA,
        });

        if (moradorImovelId) {
          await tx.moradorImovel.update({
            where: { moradorImovelId },
            data: { usuarioId: usuario.usuarioId },
          });
        }

        return usuario;
      });
    } catch (e) {
      this.tratarErroUnicidade(e);
    }
  }

  async findAll(params: { page?: number; pageSize?: number; perfil?: string }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 20;

    const where: Prisma.UsuarioWhereInput = {
      ...(params.perfil ? { usuarioPerfil: params.perfil as 'SINDICO' | 'MORADOR' } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.usuario.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { usuarioLogin: 'asc' },
        select: SEM_SENHA,
      }),
      this.prisma.usuario.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioId },
      select: SEM_SENHA,
    });
    if (!usuario) throw new NotFoundException(`Usuário #${usuarioId} não encontrado.`);
    return usuario;
  }

  async update(usuarioId: number, dto: UpdateUsuarioDto) {
    await this.findOne(usuarioId);
    // moradorImovelId só é usado na criação (ver create()); vinculá-lo a outra
    // relação depois exige atualizar o morador_imovel diretamente, não este endpoint.
    const { moradorImovelId, ...resto } = dto;
    try {
      return await this.prisma.usuario.update({
        where: { usuarioId },
        data: resto,
        select: SEM_SENHA,
      });
    } catch (e) {
      this.tratarErroUnicidade(e);
    }
  }

  async changePassword(usuarioId: number, novaSenha: string) {
    await this.findOne(usuarioId);
    const usuarioSenhaHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
    await this.prisma.usuario.update({
      where: { usuarioId },
      data: { usuarioSenhaHash },
    });
    return { mensagem: 'Senha atualizada com sucesso.' };
  }

  async remove(usuarioId: number) {
    await this.findOne(usuarioId);
    // soft-delete: revoga o acesso sem apagar o histórico de vínculos que apontam para este usuário
    return this.prisma.usuario.update({
      where: { usuarioId },
      data: { usuarioStatus: 0 },
      select: SEM_SENHA,
    });
  }

  private tratarErroUnicidade(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Já existe um usuário com esse login.');
    }
    throw e;
  }
}