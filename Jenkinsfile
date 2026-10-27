// Pipeline do MS Moradores (NestJS 10 + Prisma 7, Node 24) — agente Linux.
// Segue o padrão do projeto de exemplo (ProjetoAPP): segredos no Infisical, via token de acesso do projeto
// (Machine Identity, Token Auth) guardado no Jenkins, e deploy com `docker run`. Nenhum segredo é escrito em arquivo.
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
                sh 'node --version'
                sh 'npm ci'
                sh 'npx prisma generate'
                sh 'npm test'
            }
        }

        stage('Construir Imagem Docker') {
            steps {
                script {
                    env.IMAGE_TAG = "${env.APP_NAME}:${env.BUILD_ID}"
                }
                sh 'docker build -t "$IMAGE_TAG" .'
            }
        }

        stage('Fazer Deploy') {
            steps {
                sh 'docker stop "$APP_NAME" || true'
                sh 'docker rm -v "$APP_NAME" || true'

                // `infisical run` injeta os segredos só no ambiente deste comando; `-e NOME` (sem valor)
                // repassa a variável ao container. Nada é gravado em disco e os valores não aparecem no log.
                withCredentials([string(credentialsId: 'infisical-token', variable: 'INFISICAL_TOKEN')]) {
                    sh '''
                        npx -y @infisical/cli run --projectId="$INFISICAL_PROJECT_ID" --env="$INFISICAL_ENV" --path="$INFISICAL_PATH" --token="$INFISICAL_TOKEN" -- \
                            docker run -d --name "$APP_NAME" --restart unless-stopped -p "$APP_PORT:7522" \
                                -e PORT=7522 \
                                -e DATABASE_URL -e JWT_SECRET -e JWT_EXPIRES_IN \
                                -e RABBITMQ_URL -e ADMIN_LOGIN -e ADMIN_SENHA \
                                "$IMAGE_TAG"
                    '''
                }
            }
        }

        stage('Verificar Saúde') {
            steps {
                // Falha aqui deixa o build "instável" (amarelo), sem derrubar o deploy já feito.
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    sh '''
                        for i in $(seq 1 15); do
                            if curl -fsS "http://localhost:$APP_PORT/condominio/morador/docs" > /dev/null; then
                                echo "API respondendo."; exit 0
                            fi
                            sleep 3
                        done
                        echo "API não respondeu a tempo. Últimas linhas do log:"
                        docker logs --tail 40 "$APP_NAME" || true
                        exit 1
                    '''
                }
            }
        }
    }

    post {
        success { echo 'Deploy do MS Moradores realizado com sucesso!' }
        failure { echo 'Houve um erro durante o deploy do MS Moradores.' }
    }
}
