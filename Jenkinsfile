// Pipeline do MS Moradores (NestJS 10 + Prisma 7, Node 24) — agente WINDOWS (usa bat, docker run e infisical run).
// Para agente Linux use o JenkinsfileLinux (mesmo fluxo, com sh). Segue o padrão do projeto de exemplo (ProjetoAPP):
// segredos no Infisical, via token de acesso do projeto (Machine Identity, Token Auth) guardado no Jenkins.
// Nenhum segredo é escrito em arquivo.
pipeline {
    agent any

    environment {
        APP_NAME       = 'moradores-proptech'   // nome do container e da imagem (docker exige minúsculas)
        APP_PORT       = '7522'
        // Ajuste conforme o que foi criado no Infisical/Jenkins:
        INFISICAL_PROJECT_ID = '70db4fbb-c0a2-4296-b9ad-730ebf55bb62'  // projeto "Morador" (não é segredo)
        INFISICAL_ENV  = 'dev'                  // ambiente do Infisical (slug: dev/prod)
        INFISICAL_PATH = '/'                    // pasta dos segredos dentro do ambiente
    }

    stages {
        stage('Verificar Repositório') {
            steps {
                checkout([$class: 'GitSCM',
                    branches: [[name: '*/feat/prisma-7']],
                    userRemoteConfigs: [[url: 'https://github.com/BeSenna/Moradores-Proptech']]
                ])
            }
        }

        stage('Instalar Dependências e Testar') {
            steps {
                // Requer Node 24 no agente (o mesmo da imagem Docker). Os testes não precisam de banco.
                bat 'node --version'
                bat 'npm ci'
                bat 'npx prisma generate'
                bat 'npm test'
            }
        }

        stage('Construir Imagem Docker') {
            steps {
                script {
                    env.IMAGE_TAG = "${env.APP_NAME}:${env.BUILD_ID}"
                }
                bat 'docker build -t %IMAGE_TAG% .'
            }
        }

        stage('Fazer Deploy') {
            steps {
                bat 'docker stop %APP_NAME% || exit 0'
                bat 'docker rm -v %APP_NAME% || exit 0'

                // `infisical run` injeta os segredos só no ambiente deste comando; `-e NOME` (sem valor)
                // repassa a variável ao container. Nada é gravado em disco e os valores não aparecem no log.
                withCredentials([string(credentialsId: 'infisical-token', variable: 'INFISICAL_TOKEN')]) {
                    bat 'npx -y @infisical/cli run --projectId=%INFISICAL_PROJECT_ID% --env=%INFISICAL_ENV% --path=%INFISICAL_PATH% --token=%INFISICAL_TOKEN% -- docker run -d --name %APP_NAME% --restart unless-stopped -p %APP_PORT%:7522 -e PORT=7522 -e DATABASE_URL -e JWT_SECRET -e JWT_EXPIRES_IN -e RABBITMQ_URL -e ADMIN_LOGIN -e ADMIN_SENHA %IMAGE_TAG%'
                }
            }
        }

        stage('Verificar Saúde') {
            steps {
                // Falha aqui deixa o build "instável" (amarelo), sem derrubar o deploy já feito.
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    bat '''powershell -NoProfile -Command "for ($i = 0; $i -lt 15; $i++) { try { Invoke-WebRequest -UseBasicParsing ('http://localhost:' + $env:APP_PORT + '/condominio/morador/docs') | Out-Null; Write-Host 'API respondendo.'; exit 0 } catch { Start-Sleep -Seconds 3 } }; Write-Host 'API nao respondeu a tempo. Ultimas linhas do log:'; docker logs --tail 40 $env:APP_NAME; exit 1"'''
                }
            }
        }
    }

    post {
        success { echo 'Deploy do MS Moradores realizado com sucesso!' }
        failure { echo 'Houve um erro durante o deploy do MS Moradores.' }
    }
}
