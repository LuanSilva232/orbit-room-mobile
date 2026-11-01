# Orbit Room Mobile

Este aplicativo Expo é um cliente nativo independente. O website original
permanece em `../website-original`; o app mobile fala com o serviço API-only em
`api/`, implantado em um app Fly separado.

## Configuração local

1. Configure e publique primeiro o serviço em `api/`. Depois, copie
   `.env.example` para `.env.local`; `EXPO_PUBLIC_API_URL` e
   `EXPO_PUBLIC_AUTH_API_URL` devem usar a origem HTTPS do novo app Fly.
2. Na raiz de `mobile-adaptation`, instale as dependências com `npm install`,
   rode `npm run build` para exportar Android/iOS ou `npx expo start` para
   desenvolvimento.

O login Google usa OAuth/PKCE implementado no serviço mobile independente. O
app guarda o token Bearer no SecureStore e o envia nas chamadas autenticadas;
nenhuma credencial Google ou URL de banco é embutida no app. O esquema
`orbitroom://` em `app.json` deve permanecer configurado. O redirect URI do
Google Cloud é
`https://orbit-room-mobile-api-rieie-7k4m2.fly.dev/api/auth/callback`.
Teste o fluxo em um development build, não apenas no Expo Go.

## Neon

O projeto Neon existente está vinculado à branch `production`; `neon.ts`
declara Managed Auth e o PostgreSQL é o serviço padrão. `neon deploy` provisiona
esses serviços e sincroniza as variáveis `DATABASE_URL`,
`DATABASE_URL_UNPOOLED` e `NEON_AUTH_*` no `.env` local, que não deve ser
publicado. O backend usa `DATABASE_URL` para as conexões normais e
`DATABASE_URL_UNPOOLED` para migrações. Nunca coloque essas variáveis em
`EXPO_PUBLIC_*`.

Durante a transição, a API mobile acessa o Neon existente para preservar os
dados já usados pelo app e pelo website. As contas e sessões atuais continuam
no mesmo esquema até uma migração planejada para um banco exclusivo do mobile.
O fluxo PKCE troca um código de uso único por um token de sessão; as
credenciais do Google permanecem no servidor.

## API mobile no Fly.io

A API independente fica em `api/`, com suas próprias rotas, imagem Docker e
`fly.toml`. Ela é implantada no app Fly `orbit-room-mobile-api-rieie-7k4m2`, sem
substituir o serviço antigo nem publicar a interface do website. Siga
[`api/README.md`](./api/README.md) para criar o app e configurar secrets. As
rotas mobile continuam usando o Neon atual temporariamente; a migração de dados
para um banco exclusivo fica para uma etapa futura.

Visitantes continuam usando um identificador UUID exclusivo do app e um nome
local salvo com AsyncStorage. Esse perfil não é convertido automaticamente em
conta Google. Ao entrar com Google, o app usa a sessão armazenada no Neon.

A interface nativa usa `StyleSheet` do React Native; estilos CSS do website não
são carregados no app.

## Interface adaptável

As telas mobile preservam os fluxos nativos e usam a identidade visual do
website — incluindo a logo original, fundo escuro estrelado com gradientes e
painéis translúcidos. A navegação inferior segue as quatro categorias do
website: Início, Chamadas, Chat e Config. Início oferece salas públicas,
privadas, criação/minhas salas, perfil e atalhos de amigos/configurações.
Os três canais públicos mostram a ação de entrada e o limite de 10 pessoas,
igual ao limite validado pelo servidor. Visitantes sem nome salvo entram como
“Anônimo” por padrão e podem editar esse nome antes de entrar.
Chamadas mostra um estado de espera até entrar em um canal; depois exibe
participantes, controles e chat. Chat reúne as conversas e a área de amigos.
Config lista as subcategorias de conta/comunidade, áudio/vídeo,
aparência/comportamento e sistema, encaminhando cada fluxo aos recursos
mobile existentes quando disponíveis.

As telas Sobre e Atualizações reproduzem em português a descrição, os créditos e
as notas completas das versões v0.65, v0.6, v0.5, v0.4 e v0.3 do website. O
fundo nativo usa a mesma base escura e as mesmas cores de gradiente e estrelas;
recursos exclusivos do website continuam identificados como indisponíveis no
app, em vez de aparecerem como controles sem ação.

O modo silencioso é salvo no aparelho e faz novas entradas começarem com o
microfone desligado. O volume das vozes recebidas pode ser ajustado em
Configurações → Áudio e vídeo e é aplicado também durante chamadas ativas.
O volume geral do aparelho continua controlado pelos botões físicos. A câmera
frontal ou traseira pode ser definida para a próxima captura. Privacidade e
notificações têm controles nativos; privacidade é sincronizada com o perfil e
notificações push de mensagens, convites e solicitações exigem login, projeto
EAS e permissões do aparelho. Alertas de entrada/saída de participantes do
website ainda não foram portados.

O website inclui ainda solicitação de exclusão de conta, tema claro, idioma
inglês, filtros de vídeo e ferramentas administrativas. Essas funções não são
simuladas no app: exclusão de conta e administração continuam apenas no website;
tema claro, inglês e filtros de vídeo não foram portados. A limpeza mobile
restaura preferências locais e permite apagar o perfil visitante, sem apagar
dados do servidor. O processamento nativo do microfone e as notificações do
sistema seguem as capacidades do Android/iOS.

A orientação padrão permite retrato e paisagem. Os layouts recalculam dimensões
ao girar ou redimensionar: o conteúdo fica centralizado e limitado em telas
largas, e o canal ativo coloca controles/participantes ao lado do chat quando
há espaço horizontal. Em telefones estreitos, o canal mantém uma composição
vertical e rolável.

O serviço mobile e o website têm deploys independentes. Enquanto a API mobile
usa o Neon existente, ambos continuam interoperando com os mesmos dados.

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
