-- CreateTable
CREATE TABLE `bloco` (
    `bloco_id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `bloco_nome` VARCHAR(50) NOT NULL,
    `bloco_descricao` VARCHAR(255) NULL,
    `bloco_status` INTEGER NOT NULL,

    UNIQUE INDEX `uk_bloco_nome`(`bloco_nome`),
    PRIMARY KEY (`bloco_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imovel` (
    `imovel_id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `imovel_numero` VARCHAR(20) NOT NULL,
    `imovel_andar` INTEGER NULL,
    `bloco_id` INTEGER UNSIGNED NOT NULL,
    `imovel_area_m2` DECIMAL(8, 2) NULL,
    `imovel_matricula` VARCHAR(8) NULL,
    `imovel_IPTU` VARCHAR(24) NULL,
    `imovel_tipo` ENUM('COBERTURA', 'APARTAMENTO') NOT NULL,
    `imovel_garagem` INTEGER NULL,
    `imovel_status` INTEGER NOT NULL,

    UNIQUE INDEX `uk_imovel_bloco_numero`(`bloco_id`, `imovel_numero`),
    PRIMARY KEY (`imovel_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `morador` (
    `morador_id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `morador_nome` VARCHAR(300) NOT NULL,
    `morador_cpf` VARCHAR(11) NOT NULL,
    `morador_email` VARCHAR(150) NULL,
    `morador_telefone` VARCHAR(20) NULL,
    `morador_data_nascimento` DATE NULL,
    `morador_data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `morador_deficiencia_locomocao` INTEGER NULL,
    `morador_status` INTEGER NOT NULL,

    UNIQUE INDEX `uk_morador_cpf`(`morador_cpf`),
    UNIQUE INDEX `uk_morador_email`(`morador_email`),
    PRIMARY KEY (`morador_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuario` (
    `usuario_id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `usuario_login` VARCHAR(100) NOT NULL,
    `usuario_senha_hash` VARCHAR(255) NOT NULL,
    `usuario_perfil` ENUM('SINDICO', 'MORADOR') NOT NULL DEFAULT 'MORADOR',
    `usuario_data_criacao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usuario_ultimo_acesso` DATETIME(3) NULL,
    `usuario_status` INTEGER NOT NULL,

    UNIQUE INDEX `uk_usuario_login`(`usuario_login`),
    PRIMARY KEY (`usuario_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `morador_imovel` (
    `morador_imovel_id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `morador_id` INTEGER UNSIGNED NOT NULL,
    `imovel_id` INTEGER UNSIGNED NOT NULL,
    `morador_imovel_tipo_relacao` ENUM('PROPRIETARIO', 'INQUILINO', 'MORADOR', 'TEMPORADA') NOT NULL,
    `morador_imovel_data_inicio` DATE NOT NULL,
    `morador_imovel_data_fim` DATE NULL,
    `morador_imovel_status` INTEGER NOT NULL,
    `usuario_id` INTEGER UNSIGNED NULL,

    INDEX `idx_morador_imovel_morador`(`morador_id`),
    INDEX `idx_morador_imovel_imovel`(`imovel_id`),
    INDEX `fk_morador_imovel_usuario_idx`(`usuario_id`),
    UNIQUE INDEX `uk_morador_imovel_relacao`(`morador_id`, `imovel_id`, `morador_imovel_tipo_relacao`),
    PRIMARY KEY (`morador_imovel_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `imovel` ADD CONSTRAINT `imovel_bloco_id_fkey` FOREIGN KEY (`bloco_id`) REFERENCES `bloco`(`bloco_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `morador_imovel` ADD CONSTRAINT `morador_imovel_morador_id_fkey` FOREIGN KEY (`morador_id`) REFERENCES `morador`(`morador_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `morador_imovel` ADD CONSTRAINT `morador_imovel_imovel_id_fkey` FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`imovel_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `morador_imovel` ADD CONSTRAINT `morador_imovel_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`usuario_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
