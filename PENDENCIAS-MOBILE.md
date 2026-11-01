# Pendências da adaptação mobile

Este checklist segue a divisão de 11 etapas definida para o projeto. A interface
mobile e o backend Node.js permanecem separados; o app usa as mesmas contas,
dados e salas do website por meio da API.

## Status

- **Implementada** — código concluído e validado localmente.
- **Parcial** — há funcionalidade implementada, mas falta suporte de plataforma
  ou uma decisão/configuração.
- **Validação pendente** — depende do backend publicado, credenciais ou aparelhos
  reais e não pode ser confirmada apenas por exportação local.

## Etapas

### Etapa 1 — Base do app e conexão com a API

**Status: Implementada; URL local configurada; deploy mobile pendente.**

- Estrutura Expo/React Native e telas mobile ficam em `mobile-adaptation`;
  website e backend Node.js ficam em `website-original`.
- O app verifica a API e valida a origem configurada.
- `EXPO_PUBLIC_API_URL` foi configurada localmente em
  `mobile-adaptation/.env.local` como `https://orbit-room-testing.vercel.app`;
  na última verificação, `/api/health` respondeu 200, mas
  `/api/auth/mobile/login` continua respondendo 404.
- **Falta:** publicar o app/build com essa variável no ambiente de build e
  confirmar chamadas autenticadas e acesso ao banco pelo app. O `.env.local`
  local não deve ser commitado.

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

### Etapa 5 — Login Google e conta compartilhada

**Status: Implementada no app; OAuth real bloqueado pelo backend publicado.**

- O app usa navegador seguro, PKCE e sessão mobile própria; a conta e a
  autenticação continuam no backend compartilhado.
- O fluxo atual reutiliza o cliente OAuth **Web application** do backend do
  website. Clientes OAuth Android/iOS não são consumidos pelo fluxo existente.
  O Google redireciona para `/api/auth/callback`; `orbitroom://auth/callback`
  apenas retorna do backend ao app.
- O redirect URI informado para o website (`https://orbit-room-testing.vercel.app/api/auth/callback`)
  foi confirmado como igual ao URI autorizado no Google Cloud.
- **Bloqueio confirmado:** `https://orbit-room-testing.vercel.app/api/auth/mobile/login`
  retorna 404 na implantação atual; publique o backend atualizado de
  `website-original` antes de testar o login mobile.
- **Falta:** validar o retorno OAuth e a revogação de sessão com domínio HTTPS e
  credenciais Google de produção em aparelhos Android e iOS.

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

1. Publicar `website-original` com as rotas de autenticação mobile, sessões,
   tokens push e envio de notificações; confirmar o banco de produção. O endpoint
   `/api/auth/mobile/login` da URL configurada atualmente retorna 404.
   Administração permanece exclusiva do website e deve ser validada no
   repositório real do backend, caso necessário; nenhuma integração admin mobile
   está planejada.
2. Configurar `EXPO_PUBLIC_API_URL` também no ambiente EAS usado para os builds;
   a URL local já está em `mobile-adaptation/.env.local`. Configurar o projeto
   EAS/ID e credenciais push nas respectivas plataformas, sem incluir segredos
   do backend no app.
3. Executar cenários de conta, perfil, salas, social, chat e notificações com duas
   contas reais, alternando website e app.
4. Gerar development builds e testar voz/vídeo em aparelhos Android e iOS;
   testar compartilhamento de tela Android.
5. Configurar um servidor TURN antes de homologar chamadas em redes restritas.
6. Decidir se compartilhamento de tela iOS e chamadas de voz em segundo plano
   são requisitos desta versão; se sim, implementar as extensões/serviços nativos
   e repetir os testes.
7. Rodar lint, TypeScript, Expo Doctor, testes do backend e exportações/builds
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
- O projeto mobile não tem script nem arquivos de testes automatizados próprios.
- A API publicada respondeu 200 em `/api/health`, mas 404 em
  `/api/auth/mobile/login`; login Google, perfil autenticado e recursos sociais
  não podem ser homologados até a publicação do backend atualizado.
- Não foram feitos testes de chamadas, push ou OAuth em aparelhos reais. iOS,
  push e integração com duas contas ainda dependem de builds, credenciais e
  backend funcionais.

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
