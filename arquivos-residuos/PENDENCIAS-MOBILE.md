# Pendências da adaptação mobile

Este checklist segue a divisão de 11 etapas definida para o projeto. A interface
mobile e o backend Node.js permanecem separados. O backend Fly.io em
`mobile-adaptation/backend` já possui Better Auth com o plugin Expo e acesso ao
Neon, mas ainda não foi publicado e atualmente só fornece autenticação,
`/health` e `/api/me`. As APIs de perfil, salas, mensagens, social, push e WebRTC
precisam ser migradas antes que os recursos do app funcionem com esse backend.

## Status

- **Implementada** — código concluído e validado localmente.
- **Parcial** — há funcionalidade implementada, mas falta suporte de plataforma
  ou uma decisão/configuração.
- **Validação pendente** — depende do backend publicado, credenciais ou aparelhos
  reais e não pode ser confirmada apenas por exportação local.

## Etapas

### Etapa 1 — Base do app e conexão com a API

**Status: App e backend Neon/Fly.io publicados; login Google e migração de APIs pendentes.**

- Estrutura Expo/React Native e telas mobile ficam em `mobile-adaptation`;
  `website-original` é apenas a referência do website.
- O app verifica a API e valida a origem configurada.
- `EXPO_PUBLIC_API_URL` foi configurada localmente em
  `mobile-adaptation/.env.local` como `https://orbit-room-testing.vercel.app`;
  na última verificação, `/api/health` respondeu 200, mas
  `/api/auth/mobile/login` continua respondendo 404.
- O backend Fly.io usa Neon, aplica as tabelas Better Auth por migração e expõe
  health check. A implantação foi validada com Postgres conectado e as rotas
  de sessão/proteção.
- `EXPO_PUBLIC_AUTH_API_URL` direciona Better Auth ao Fly.io, enquanto
  `EXPO_PUBLIC_API_URL` continua atendendo as APIs existentes do website.
- **Falta:** configurar Google OAuth e migrar os demais endpoints. O `.env.local`
  e as URLs privadas não devem ser commitados ou incluídos no APK.

### Etapa 2 — Entrada como visitante

**Status: Implementada; teste em aparelhos pendente.**

- Nome e identidade visitante são locais ao app e independentes da conta Google.
- **Falta:** confirmar entrada, saída, reconexão e preservação do perfil em
  Android e iOS com a API publicada.

### Etapa 3 — Canais públicos

**Status: Implementada; validação entre clientes pendente.**

- Presença e participantes usam a API compartilhada; cada instalação mobile tem
  um identificador de cliente próprio.
- **Falta:** testar simultaneamente website e app, incluindo duas sessões da
  mesma conta, troca de canal e limpeza de presença após desconexão.

### Etapa 4 — Chat dos canais

**Status: Implementada; sincronização real pendente.**

- Histórico, envio, atualização e remoção de mensagens usam o backend.
- **Falta:** validar mensagens e atualização entre website e app com a API
  publicada, inclusive perda temporária de conexão.

### Etapa 5 — Login Google e conta

**Status: Cliente Expo e servidor Better Auth publicados; OAuth real pendente de credenciais Google.**

- O app usa `@better-auth/expo`, navegador seguro e cookies protegidos pelo
  SecureStore. O backend separado usa tabelas Better Auth no Postgres Neon.
- A conta mobile é independente da conta do website até uma migração explícita.
- O Managed Neon Auth continua provisionado, mas não é usado pelo app.
- **Falta:** adicionar as credenciais Google ao ambiente privado do servidor,
  cadastrar
  `<BETTER_AUTH_URL>/api/auth/callback/google` no Google Cloud e testar login,
  sessão e logout em development builds Android e iOS.

### Administração

**Status: Exclusiva do website; não disponível no app mobile por decisão de escopo.**

- O app não apresenta painel, autenticação ou ações administrativas, e não envia
  senha administrativa ao backend.
- A sessão mobile continua respeitando eventos de moderação recebidos do
  servidor, como silenciamento ou desconexão.
- A administração do website pertence ao backend e ao repositório implantado
  com ele. `website-original` é apenas um backup e não foi alterado para essa
  finalidade.

### Etapa 6 — Perfil e preferências

**Status: Implementada; sincronização real pendente.**

- Perfil remoto, nome, foto, biografia e privacidade são carregados/salvos pela
  API compartilhada.
- **Falta:** editar no website e confirmar no app, e vice-versa, com contas reais.

### Etapa 7 — Salas privadas e convites

**Status: Implementada; regras reais pendentes de validação.**

- Criar, editar e excluir salas; definir privacidade, senha e capacidade; enviar,
  receber, aceitar e recusar convites.
- **Falta:** testar autorização, senha incorreta, limites e expiração dos convites
  com duas contas e o backend publicado.

### Etapa 8 — Amigos e recursos sociais

**Status: Implementada; fluxos reais pendentes de validação.**

- Amigos, solicitações sociais, mensagens privadas e estado de conversas usam as
  APIs do website.
- **Falta:** validar solicitações, aceite/recusa e mensagens entre duas contas
  reais no website e no app.

### Etapa 9 — Chamadas de voz

**Status: Implementada; homologação em dispositivos pendente.**

- WebRTC nativo usa a mesma sinalização e presença de sala do website.
- Permissão e captura do microfone, mute, áudio remoto, saída e limpeza de mídia
  estão integrados.
- **Falta:** testar voz bidirecional, interrupções, reconexão e chamadas entre
  website e app em aparelhos reais.
- O projeto usa STUN público, sem TURN configurado. Validar redes restritas exige
  escolher e configurar um serviço TURN com credenciais temporárias no servidor.
- O comportamento de chamadas em segundo plano ainda não foi homologado e não
  deve ser considerado garantido.

### Etapa 10 — Vídeo e recursos avançados

**Status: Parcial; homologação nativa pendente.**

- Câmera, vídeo remoto e controles estão implementados.
- Compartilhamento de tela está configurado apenas no Android com MediaProjection.
- **Falta:** validar permissões, interrupções e encerramento de câmera/tela em
  development builds Android e iOS.
- Compartilhamento de tela no iOS **não está implementado**; requer uma
  Broadcast Upload Extension baseada em ReplayKit e build nativo apropriado.
- O Expo Doctor aponta `react-native-webrtc` como não testado com a New
  Architecture; confirmar compatibilidade nos builds nativos antes de produção.

### Etapa 11 — Notificações e acabamento

**Status: Implementada; credenciais e entrega real pendentes.**

- Push cobre mensagens diretas, solicitações de conversa, convites de sala e
  pedidos de amizade; não inclui o texto privado nas notificações.
- O backend associa tokens à conta autenticada e remove tokens inválidos.
- Tocar no aviso abre mensagens, salas/convites recebidos ou recursos sociais;
  conversa e convite específicos são encaminhados quando o payload os identifica.
- **Falta:** associar o app a um projeto EAS e definir `EXPO_PUBLIC_EAS_PROJECT_ID`;
  configurar credenciais push Android/iOS no EAS e publicar o backend atualizado.
- `EXPO_ACCESS_TOKEN` deve ser configurado como segredo no servidor se a
  autenticação do Expo Push Service for habilitada.
- **Falta:** testar permissão, recebimento em segundo plano e abertura pelo aviso
  em aparelhos Android e iOS. Push remoto não é validado no Expo Go.
- A resposta de aceite do Expo Push Service não comprova a entrega no aparelho;
  falta acompanhar comprovantes (receipts) e validar erros de entrega em produção.

## Pendências finais — ordem sugerida

1. Configurar OAuth Google no Fly.io e testar o login com
   `EXPO_PUBLIC_AUTH_API_URL`; não apontar o app inteiro para esse backend
   enquanto faltarem as APIs de dados.
2. Migrar as rotas de perfil, salas, social, chat, RTC e push para o backend que
   usará o Neon; depois configurar `EXPO_PUBLIC_API_URL` nos builds EAS e testar
   sincronização real.
3. Configurar o projeto EAS/ID e credenciais push nas respectivas plataformas,
   sem incluir segredos no app. Administração permanece exclusiva do website.
4. Executar cenários de conta, perfil, salas, social, chat e notificações com duas
   contas reais, alternando website e app.
5. Gerar development builds e testar voz/vídeo em aparelhos Android e iOS;
   testar compartilhamento de tela Android.
6. Configurar um servidor TURN antes de homologar chamadas em redes restritas.
7. Decidir se compartilhamento de tela iOS e chamadas de voz em segundo plano
   são requisitos desta versão; se sim, implementar as extensões/serviços nativos
   e repetir os testes.
8. Rodar lint, TypeScript, Expo Doctor, testes do backend e exportações/builds
   após a configuração real.

## Validações locais já realizadas

- **31/10/2026:** lint e `tsc --noEmit` do app passaram sem erros.
- As exportações JavaScript Android e iOS passaram; isso valida os bundles, mas
  não substitui compilação nativa nem teste em aparelho.
- `expo prebuild --platform android --no-install` passou e gerou localmente
  `mobile-adaptation/android`, incluindo permissões MediaProjection e plugin
  WebRTC. A pasta é gerada pelo CNG e ignorada pelo Git.
- A compilação `app:assembleDebug` ainda não produziu APK: o único Java
  encontrado é 8, mas o Gradle requer Java 17 ou superior. Android Studio/JDK 17+
  precisam estar instalados e configurados para concluir essa etapa.
- Expo Doctor passou em 19 de 20 verificações. A ressalva é que
  `react-native-webrtc` consta como **não testado** com a New Architecture; é
  necessário validar a chamada em build nativo.
- `npm audit --omit=dev` reportou 12 vulnerabilidades moderadas transitivas em
  `glob`/`minimatch` na cadeia Expo. A correção sugerida por `npm audit fix
  --force` rebaixaria o Expo para SDK 51; não foi aplicada para evitar uma
  alteração incompatível de SDK.
- O projeto mobile não tem testes automatizados próprios.
- A API publicada respondeu 200 em `/api/health`, mas 404 em
  `/api/auth/mobile/login`; login Google, perfil autenticado e recursos sociais
  não podem ser homologados até a publicação do backend atualizado.
- Não foram feitos testes de chamadas, push ou OAuth em aparelhos reais. iOS,
  push e integração com duas contas ainda dependem de builds, credenciais e
  backend funcionais.
- Validação atual: `npm run lint`, `npx tsc --noEmit` e `npm run build` do app
  passaram; o build exportou bundles Android e iOS. Build/typecheck do backend
  passaram, a migração informou que o esquema Neon já está atualizado e os
  testes locais retornaram `/health` 200, sessão anônima 200 e `/api/me` 401.
- Deploy Fly.io v4 concluído; release da migração passou e a URL pública
  retornou `/health` 200 com Neon conectado, sessão anônima 200 e `/api/me` 401.
- OAuth Google real ainda não foi testado (`googleOAuthConfigured=false`).
  Faltam configurar credenciais Google e validar o login em development builds.

## Bloqueios para gerar e distribuir APK

- Instalar/configurar Android Studio com JDK 17+; a compilação local falhou
  antes de compilar o app porque encontrou apenas Java 8.
- O projeto foi gerado com o identificador provisório
  `com.anonymous.orbitroommobile`. Definir um `android.package` definitivo antes
  da distribuição; trocar esse identificador depois impede que o APK seja
  reconhecido como atualização do anterior.
- Associar o projeto EAS e definir `EXPO_PUBLIC_EAS_PROJECT_ID` para habilitar
  push. A variável não está configurada neste ambiente.
- Corrigir/publicar as rotas mobile no backend antes de validar login e funções
  autenticadas.
