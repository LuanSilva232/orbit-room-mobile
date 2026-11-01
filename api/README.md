# Orbit Room Mobile API

Este é um serviço API-only separado do website e implantado em um app Fly.io
próprio. Ele contém as rotas que o app mobile consome, sem as páginas ou a
interface do website.

## Banco durante a transição

Inicialmente, configure `DATABASE_URL` com a conexão pooled do Neon atual. A API
usa o esquema e as contas existentes para preservar perfis, salas, amizades e
mensagens enquanto o backend mobile é validado. Não crie nem copie dados para
outro banco até que a migração tenha sido planejada e conferida.

## Desenvolvimento

Copie `.env.example` para `.env.local` e preencha as credenciais do banco e do
Google OAuth. O redirect URI cadastrado no Google Cloud precisa ser igual a
`GOOGLE_REDIRECT_URI`.

```powershell
npm install
npm run dev
```

## Fly.io

O arquivo `fly.toml` define o app independente
`orbit-room-mobile-api-rieie-7k4m2`. Verifique se esse nome está disponível na sua conta
Fly antes de criar o app. Configure `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `ORBIT_ROOM_ADMIN_PASSWORD` e
`ORBIT_ROOM_MOBILE_ORIGINS` como secrets do Fly; nunca os coloque no app Expo.

Faça o deploy a partir desta pasta com:

```powershell
fly apps create orbit-room-mobile-api-rieie-7k4m2
fly secrets set DATABASE_URL="..." GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." GOOGLE_REDIRECT_URI="https://orbit-room-mobile-api-rieie-7k4m2.fly.dev/api/auth/callback" ORBIT_ROOM_ADMIN_PASSWORD="..." ORBIT_ROOM_MOBILE_ORIGINS="https://seu-preview-web.example"
fly deploy --config fly.toml
```

O `DATABASE_URL` do aplicativo é a URL pooled do Neon. A inicialização da API
cria/adiciona tabelas de forma idempotente para o contrato atual; ela não apaga
ou migra dados.

## Rotas

O serviço inclui autenticação mobile OAuth/PKCE, perfil, salas, convites,
presença/sinalização RTC, social, chat social e registro de notificações push.
As rotas foram copiadas para este serviço para que o deploy não publique a
interface web. A pasta `website-original` é apenas a origem atual desses
contratos e não é necessária no build ou no deploy da API.
