# Adicionais para o site original

Esta pasta reúne a implementação de referência para habilitar o login mobile no
backend do website. Ela **não está conectada à Vercel** e a simples existência
destes arquivos aqui não publica nem altera o website.

## Arquivos incluídos

### Rotas novas

Copie estas rotas para os mesmos caminhos no repositório oficial do website:

- `app/api/auth/mobile/login/route.ts`
- `app/api/auth/mobile/exchange/route.ts`
- `app/api/auth/mobile/logout/route.ts`

### Alterações em arquivos existentes

Estes arquivos já existem no website. As cópias desta pasta são referências
com as alterações mobile integradas; **não as use para substituir cegamente**
as versões oficiais, pois o repositório oficial pode conter mudanças mais
recentes ou diferentes. Compare e integre as partes necessárias:

- `app/api/auth/callback/route.ts` — mantém o callback web e acrescenta o retorno
  OAuth para o app.
- `lib/auth.ts` — acrescenta emissão/troca de código mobile, sessão Bearer e
  revogação; a autenticação web por cookie deve continuar funcionando.
- `db/index.ts` — cria a tabela de códigos temporários mobile no banco existente.

As cópias foram organizadas nos caminhos correspondentes abaixo de `Adicionais`.
Elas vieram de `website-original`, que é somente a cópia de referência disponível
nesta workspace, não o repositório oficial conectado à Vercel.

## Requisitos para o app autenticado funcionar

O fluxo usa as credenciais OAuth **Web application** já configuradas no backend
(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI`) e o mesmo
banco utilizado pelo website. Não crie outro banco, não remova as credenciais do
website e nunca coloque o client secret no app.

Além do login, as rotas privadas usadas pelo app precisam aceitar a sessão
Bearer. No padrão desta implementação, elas chamam `getCurrentUser()` de
`lib/auth.ts`, que verifica o Bearer e também preserva a sessão web por cookie.
Ao integrar no backend oficial, confirme esse padrão nas APIs de perfil, salas,
RTC, social, mensagens e notificações.

## Publicação e verificação

1. Faça uma cópia de segurança/branch no repositório oficial do website.
2. Compare e integre as três rotas novas e as alterações dos três arquivos
   existentes, preservando outras mudanças do website.
3. Execute lint, TypeScript, testes e build do website antes de publicar.
4. Envie as alterações pelo fluxo normal do repositório conectado à Vercel e
   aguarde o deploy ficar pronto.
5. Teste `https://SEU-DOMINIO/api/auth/mobile/login` sem o parâmetro `challenge`:
   a resposta esperada é `400` (`INVALID_MOBILE_CHALLENGE`), não `404`. Esse
   teste apenas confirma que a rota existe; o login completo deve ser feito
   pelo app para validar OAuth, PKCE, sessão Bearer e acesso ao banco.
6. Confirme o login no app e valide perfil, salas e recursos sociais com a mesma
   conta do website.

O estado observado antes desta preparação era `/api/health` com `200` e
`/api/auth/mobile/login` com `404`. Portanto, o app só conseguirá autenticar
depois da integração e publicação no backend oficial.
