# Orbit Room Mobile

Este aplicativo Expo é a adaptação nativa do website mantido em `../website-original`.
O código do website não é copiado para dentro do runtime mobile: telas web são
recriadas com React Native, e o app conversa com o backend HTTP já existente.

## Configuração local

1. Publique primeiro o backend atualizado de `../website-original`, incluindo as
   rotas `/api/auth/mobile/*` e a aceitação de sessão Bearer. As tabelas da
   sessão mobile são criadas automaticamente pelo inicializador do banco.
2. Copie `.env.example` para `.env.local` para manter a configuração local fora
   do Git.
3. Troque `EXPO_PUBLIC_API_URL` pela URL HTTPS pública do backend Orbit Room.
   O app verifica a conexão usando `/api/health` e só habilita a entrada nos
   canais quando o servidor estiver acessível. Não inclua caminhos, credenciais
   ou segredos nessa URL.
4. Instale as dependências com `npm install`.
5. Inicie o Expo com `npx expo start`.

O login Google usa o navegador seguro do sistema, um código temporário protegido
por PKCE e uma sessão armazenada no SecureStore do aparelho. O backend usa o
mesmo cadastro e as mesmas sessões do website; não compartilha a senha Google
com o app. O fluxo mobile atual reutiliza no backend o cliente OAuth do tipo
**Web application** já usado pelo website, pois o servidor troca e valida o
código Google com `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Clientes OAuth
Android/iOS criados no Google Cloud não são usados por esse fluxo e não devem
ter secrets copiados para o aplicativo. O redirect URI autorizado no Google
continua apontando para `/api/auth/callback` no backend; `orbitroom://auth/callback`
é apenas o retorno do backend para o app. Como o app usa esse esquema próprio,
o fluxo OAuth deve ser testado em um development build, não no Expo Go.

Website e app podem estar em repositórios e interfaces separados, mas precisam
usar o mesmo backend publicado e o mesmo banco configurado nele para
compartilhar contas, perfil, salas, mensagens e dados sociais. As chamadas
usam a mesma sinalização da API; o áudio/vídeo WebRTC é transmitido entre os
dispositivos e não fica armazenado no backend.

Visitantes continuam usando um identificador UUID exclusivo do app e um nome
local salvo com AsyncStorage. Esse perfil não é convertido automaticamente em
conta Google. Ao entrar com Google, o app usa o perfil remoto da conta.

A interface nativa usa `StyleSheet` do React Native; estilos CSS do website não
são carregados no app.

O backend do website continua sendo um serviço Node.js separado. Ele precisa
estar implantado e configurado com as variáveis privadas do banco de dados e dos
serviços externos. O aplicativo não deve receber essas credenciais.

O acompanhamento das etapas e pendências está em
[`../PENDENCIAS-MOBILE.md`](../PENDENCIAS-MOBILE.md), na raiz do repositório.

## Funcionalidades mobile

- Perfil Google sincronizado, edição de nome/biografia e opções de privacidade.
- Lista de amigos, solicitações por código, aceitar/recusar e mensagens diretas.
- Criação, edição e exclusão de salas, capacidade, senhas, convites e entrada
  em salas próprias ou recebidas.
- Perfil visitante local, canais públicos, participantes e chat de texto.
- Chamadas WebRTC nativas nas salas compartilhadas com o website: microfone,
  câmera, mute e vídeo remoto.
- Compartilhamento de tela Android com confirmação do sistema e sinalização
  dos participantes pela API existente.
- A administração é exclusiva do website. O app não oferece painel nem ações
  administrativas; ações de moderação recebidas do servidor continuam sendo
  respeitadas pela sessão mobile.
- Notificações push de mensagens diretas, solicitações sociais e convites de
  sala, com navegação para a tela correspondente ao tocar no aviso.

## Notificações push

Copie o ID do projeto EAS para `EXPO_PUBLIC_EAS_PROJECT_ID` em `.env` antes de
ativar notificações no perfil. O backend cria automaticamente a tabela de tokens
e usa o Expo Push Service; configure `EXPO_ACCESS_TOKEN` no servidor se o projeto
exigir autenticação para esse serviço. Nenhuma dessas credenciais deve ser
incluída no app.

Notificações remotas precisam de credenciais FCM no Android e APNs no iOS,
configuradas no projeto EAS, e de um development build ou build de produção.
Não valide a entrega push pelo Expo Go. O backend precisa estar publicado com
as alterações desta etapa, e o app precisa estar apontado para ele por
`EXPO_PUBLIC_API_URL`.

O push encaminha notificações de conversa direta, solicitações sociais e
convites de sala; mensagens do chat público dos canais não geram push.

## Build nativo para chamadas

`react-native-webrtc` requer um development build; voz e vídeo não funcionam no
Expo Go. Para Android, gere/instale um build nativo com `npx expo run:android`;
no Windows, use um build EAS para instalar o app no aparelho. No macOS, use
`npx expo run:ios` ou EAS para iOS. O plugin local
`plugins/with-webrtc-media-projection.js` configura o serviço MediaProjection
exigido pelo Android para compartilhar a tela.

### Abrir no Android Studio

O projeto Android nativo é gerado pelo Expo CNG a partir de `app.json` e dos
config plugins. Gere-o com `npx expo prebuild --platform android` e abra a pasta
`mobile-adaptation/android` no Android Studio. Não edite os arquivos gerados
como fonte permanente; faça ajustes em `app.json` ou nos config plugins e gere
novamente o projeto.

O identificador Android atual (`com.anonymous.orbitroommobile`) é provisório e
deve ser substituído por um `android.package` definitivo antes de distribuir o
app. A compilação local também precisa de Android Studio/SDK e JDK 17 ou
superior. Chamadas, OAuth e notificações exigem validação em um development
build ou APK instalado, não apenas no Expo Go ou na exportação JavaScript.

O compartilhamento de tela está habilitado no Android. No iOS, o WebRTC exige
uma Broadcast Upload Extension ReplayKit própria, que não faz parte deste
build; por isso o controle de compartilhamento fica indisponível nessa
plataforma nesta etapa. Câmera, microfone e voz continuam disponíveis no iOS.

Chamadas mobile e website usam o mesmo endpoint de sinalização `/api/rtc`.
Conexões entre redes restritas podem exigir um servidor TURN; o projeto ainda
usa apenas servidores STUN públicos. A URL HTTPS, os builds assinados e a
validação com o backend publicado são pendências da etapa final, listadas em
[`../PENDENCIAS-MOBILE.md`](../PENDENCIAS-MOBILE.md).

Os diretórios `app/`, `components/`, `lib/` e `db/` do website permanecem em
`../website-original` como referência. Não copie handlers de API Node.js para a
interface React Native: eles devem continuar rodando no servidor.
