# Diagnóstico da infraestrutura do website

Este relatório foi feito examinando a cópia local `website-original`. Ela ajuda
a entender o código, mas não confirma sozinha o que está implantado na produção.
Nenhum `.env` com valores reais foi encontrado ou copiado.

## O que o código confirma

### Backend

- O website e as APIs fazem parte do mesmo projeto **Next.js 16**, usando App
  Router. As rotas de servidor ficam em `website-original/app/api/`.
- A configuração local inclui `website-original/vercel.json`, que seleciona
  Next.js e executa `pnpm run build`. Isso indica configuração para Vercel, mas
  não prova qual projeto ou commit está implantado.
- Não há `Dockerfile` ou `docker-compose.yml` nesta cópia.
- As rotas de API não formam um serviço Node independente nesta arquitetura.
  Hospedar apenas a API fora do Vercel exigiria uma separação/proxy planejados;
  manter o Next.js inteiro em outro host é uma alternativa distinta.

### Banco de dados

- O driver em `website-original/db/index.ts` é `postgres`; o código conecta a
  PostgreSQL usando a variável privada `DATABASE_URL`.
- Pelo hostname compartilhado pelo proprietário, a conexão atual aponta para
  `database-pool.happyseeds.ai` (HappySeeds). Isso identifica o host informado,
  mas não confirma acesso ao painel, backups ou detalhes da instância.
- A cópia inclui apenas `website-original/.env.example`, com um exemplo genérico
  de conexão. Não foram encontrados `.env`, `.env.local` ou configuração local
  `.vercel` com o endereço real.
- Um comentário em `db/index.ts` menciona Reactus/PostgreSQL; o hostname
  informado identifica HappySeeds para a conexão compartilhada, mas não confirma
  região, backups ou detalhes da instância.
- O banco armazena não só contas e conteúdo: `website-original/lib/rtc/store.ts`
  persiste presença, estado de salas, mensagens de sinalização WebRTC e chat.
  Portanto, não se deve apontar o app para outro banco se o objetivo é manter
  website e app sincronizados.

## Serviços e variáveis identificados

| Uso | Variável/configuração | Observação |
|---|---|---|
| Banco compartilhado | `DATABASE_URL` | PostgreSQL em `database-pool.happyseeds.ai` (hostname informado). |
| Login Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Segredos e redirect usados no servidor; não colocar no app. |
| Push | `EXPO_ACCESS_TOKEN` | Opcional conforme a configuração do Expo Push Service. |
| Marca d'água HappySeeds/Reactus | `REACTUS_BASE_URL`, `HAPPYSEEDS_PROJECT_ID` | Integração externa distinta do banco, conforme o uso no código. |
| Analytics | `NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Opcionais. |

O nome `NEXT_PUBLIC_` indica valor destinado ao cliente. Não use esse prefixo
para credenciais ou segredos.

## O que ainda não sabemos

1. Em qual região está o PostgreSQL e quais são as opções de backup/restauração
   da instância HappySeeds.
2. Se o website oficial e a implantação atual usam exatamente o mesmo
   `DATABASE_URL` desta cópia de referência.
3. Qual provedor hospeda o website de produção e qual repositório/commit ele
   executa.
4. Se há backups automáticos e como restaurá-los.

Esses dados não estão nos arquivos de código consultados. Precisam ser vistos no
painel do projeto de hospedagem atual ou confirmados pelo proprietário.

## Identificação segura do banco

O hostname informado para `DATABASE_URL` é `database-pool.happyseeds.ai`
(HappySeeds). Não é necessário enviar o valor novamente. A URL completa contém
usuário, senha e nome do banco; mantenha-a privada.

Exemplos do tipo de informação segura a compartilhar:

- `provedor: nome do serviço PostgreSQL`
- `host: db-****.provedor.example`
- `região: nome da região`, se aparecer

**Atenção:** a URL completa foi compartilhada na conversa, incluindo a senha do
banco. Trate essa credencial como exposta: altere/rotacione a senha no provedor
HappySeeds, atualize `DATABASE_URL` no ambiente de produção da Vercel com o novo
valor e confirme que um novo deploy consegue conectar. Faça isso sem enviar a
nova URL por chat. Não crie outro banco nem faça migração até confirmar backup e
destino.

## Considerações antes de tirar o backend do Vercel

- A configuração atual junta interface Next.js e rotas `/api/*` no mesmo
  projeto. Se apenas as APIs mudarem de host, o website precisará encaminhar as
  chamadas ao novo backend; autenticação por cookie entre domínios, CORS, OAuth
  e sessão também precisarão ser planejados e testados.
- Mover somente o backend **não exige automaticamente mover o PostgreSQL**.
  Primeiro é preciso verificar se o banco atual aceita conexões seguras do novo
  host e se os limites de conexão são adequados.
- Para continuar compartilhando dados, tanto o website quanto o app devem usar
  a mesma API e a mesma instância PostgreSQL, ou um proxy que conduza ambos a
  elas.
- Antes de qualquer mudança: obter backup testável, preparar um ambiente de
  teste, validar OAuth, perfil, salas, social, chat e sinalização WebRTC, e
  manter um caminho claro para voltar ao deploy anterior.

## Nota de segurança para a migração

A cópia de referência contém um segredo de administrador fixado diretamente em
`website-original/lib/rtc/store.ts`. Não o copie para o novo host nem para o app.
Antes de qualquer publicação, o administrador do backend deve removê-lo do
código e configurar uma credencial nova, privada, no ambiente do servidor. Não
reproduza nem envie o valor existente.
