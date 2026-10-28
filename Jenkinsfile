// Pipeline do MS Moradores (NestJS 10 + Prisma 7, Node 24) — agente WINDOWS (usa bat e docker compose).
// Mesmo fluxo do JenkinsfileLinux (padrão do projeto HemoVida-estoque), com a credencial "tokenbernardocondominio".
// Aqui os segredos NÃO viram .env: o `infisical run` injeta as variáveis só no processo do docker compose
// (que as lê por ${VAR} no docker-compose.yml). Nada é gravado em disco e não há o problema das aspas do export.
pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timestamps()
    }

    environment {
        APP_NAME             = 'moradores-proptech'   // = container_name do docker-compose.yml
        APP_PORT             = '7522'
        INFISICAL_PROJECT_ID = '70db4fbb-c0a2-4296-b9ad-730ebf55bb62'  // projeto "Morador" (não é segredo)
        INFISICAL_ENV        = 'dev'                  // ambiente do Infisical (slug: dev/prod)
        INFISICAL_PATH       = '/'                    // pasta dos segredos dentro do ambiente
    }

    stages {

        stage('Checkout GitHub') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/feat/prisma-7']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/BeSenna/Moradores-Proptech'
                    ]]
                ])
            }
        }

        stage('Validar Docker Compose') {
            steps {
                withCredentials([string(credentialsId: 'tokenbernardocondominio', variable: 'INFISICAL_TOKEN')]) {
                    bat 'npx -y @infisical/cli run --projectId=%INFISICAL_PROJECT_ID% --env=%INFISICAL_ENV% --path=%INFISICAL_PATH% --token=%INFISICAL_TOKEN% -- docker compose config --quiet'
                }
            }
        }

        stage('Construir Imagem Docker') {
            steps {
                bat 'docker compose build api'
            }
        }

        stage('Deploy Docker') {
            steps {
                // --no-deps: sobe só a API (o RabbitMQ do compose é para uso local; no servidor vale o RABBITMQ_URL do Infisical)
                withCredentials([string(credentialsId: 'tokenbernardocondominio', variable: 'INFISICAL_TOKEN')]) {
                    bat 'npx -y @infisical/cli run --projectId=%INFISICAL_PROJECT_ID% --env=%INFISICAL_ENV% --path=%INFISICAL_PATH% --token=%INFISICAL_TOKEN% -- docker compose up -d --no-build --no-deps --force-recreate api'
                }
            }
        }

        stage('Verificar Container') {
            steps {
                sleep time: 10, unit: 'SECONDS'
                bat '''
                    @echo off
                    for /f %%i in ('docker inspect --format "{{.State.Running}}" %APP_NAME%') do set RUNNING=%%i
                    if not "%RUNNING%"=="true" (
                        echo ERRO: Container nao esta rodando.
                        docker logs --tail 50 %APP_NAME%
                        exit /b 1
                    )
                    echo Container em execucao.
                    docker exec %APP_NAME% node -v
                '''
                // Falha aqui deixa o build "instável" (amarelo), sem derrubar o deploy já feito.
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    bat '''docker exec %APP_NAME% node -e "const t=async()=>{for(let i=0;i<15;i++){try{const r=await fetch('http://localhost:7522/condominio/morador/docs');if(r.ok){console.log('API respondendo.');return}}catch(e){}await new Promise(r=>setTimeout(r,3000))}console.log('API nao respondeu a tempo.');process.exit(1)};t()"'''
                }
            }
        }
    }

    post {
        success { echo 'Deploy do MS Moradores realizado com sucesso!' }
        failure { echo 'Houve um erro durante o deploy do MS Moradores.' }
    }
}
