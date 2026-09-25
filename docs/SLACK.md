# Slack — notificações não lidas por DM

Quando uma notificação **sobre você** — task atribuída a você, ou alguém te marcou (@) no título, na descrição
ou num comentário — continua **não lida por 15 minutos**, o bot do TimeTracker manda uma DM no Slack para a pessoa, com um botão que abre a
tarefa no app. Quem está com o app aberto e lê a notificação a tempo não recebe nada no Slack.

- Mudança de status **não** vai para o Slack (fica só no sininho): só vai o que tem a ver com você
  (`SLACK_NOTIFICATION_TYPES` em `lib/slack.ts`: `task_assigned`, `task_mention`).
- Uma instalação do Slack por workspace, feita por owner/admin (Settings → Workspace → Integrations → **Add to Slack**).
- A pessoa é encontrada no Slack **pelo e-mail** da conta (`users.lookupByEmail`). E-mail diferente = sem DM
  (o card avisa "No Slack user … has your email address").
- Cada pessoa pode desligar no mesmo card ("Send my unread notifications to Slack").
- Várias pendentes viram **uma** DM agrupada (até 10 itens + "…and N more").
- Só notificações das últimas 24h: instalar o Slack não despeja o histórico antigo.

## Criar o app no Slack (uma vez)

1. https://api.slack.com/apps → **Create New App → From an app manifest** → escolher o Slack da empresa → colar:

   ```yaml
   display_information:
     name: TimeTracker
   features:
     app_home:
       messages_tab_enabled: true
       messages_tab_read_only_enabled: true
     bot_user:
       display_name: TimeTracker
       always_online: false
   oauth_config:
     redirect_urls:
       - https://tracking.gritoweb.com.br/api/slack/callback
       - http://localhost:5173/api/slack/callback
     scopes:
       bot: [chat:write, users:read, users:read.email]
   settings:
     socket_mode_enabled: false
     token_rotation_enabled: false
   ```

   Se o Slack recusar o redirect `http://localhost`, deixe só o de produção.
2. **Basic Information** → copiar **Client ID** e **Client Secret**.
3. Produção: `npx wrangler secret put SLACK_CLIENT_ID` e `npx wrangler secret put SLACK_CLIENT_SECRET`.
   Local: preencher os dois em `.dev.vars`.
4. Se o Slack da empresa exige aprovação de apps, um admin do Slack aprova na primeira instalação.

Não precisa de distribuição pública, Event Subscriptions, Interactivity nem Signing Secret: a mensagem só tem botão-link.

## Desenvolvimento local: nada sai para o Slack

`.dev.vars` traz `SLACK_DRY_RUN=1`. Com ele, `slackApi` (`src/worker/lib/slack.ts`) **não faz nenhuma
requisição** ao slack.com: registra o método e os argumentos no log (`slack dry run {…}`) e devolve
uma resposta falsa. A única exceção é `oauth.v2.access` (a troca do código ao clicar em Add to Slack),
que não envia mensagem para ninguém. Em produção a variável não existe.

Testar a varredura local sem Slack real: rodar `pnpm dev`, ter uma notificação não lida com mais de 15 min
num workspace com uma linha em `slack_installations`, e disparar o cron:
`curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"`. O payload aparece no log e
`notifications.slack_sent_at` é preenchido.

## Como funciona

- **Tabelas** (migração `0053`): `slack_installations` (token do bot cifrado com `AUTH_SECRET`),
  `slack_user_links` (cache do e-mail → id do Slack; "não achado" é re-checado após 24h),
  `notifications.slack_sent_at`, `user.slack_notify`.
- **Cron** `runSlackNotifications`, a cada 5 min: pega o que está não lido entre 15 min e 24h, só de quem
  ainda é membro, não está banido e não desligou. **Reivindica antes de enviar** (`UPDATE … WHERE
  slack_sent_at IS NULL`), então uma notificação vai para o Slack no máximo uma vez, mesmo com duas
  varreduras sobrepostas. Falha de envio não reenvia.
- **Token revogado** (`invalid_auth`, `token_revoked`, `account_inactive`, `not_authed`): a instalação é apagada
  e o card volta a mostrar "Add to Slack".
- **Rotas** `/api/slack`: `GET /status`, `PATCH /me` (opt-out), `GET /connect` e `GET /callback` (OAuth,
  cookie de state preso ao workspace e à pessoa, igual ao do calendário), `DELETE /` (revoga e apaga; só
  manager), `POST /test` (DM de teste para quem clicou; rate-limited).
- Texto da notificação vai escapado (`&`, `<`, `>`), para um nome de tarefa não virar `<!channel>` ou link falso.

## Problemas comuns

| Sintoma | Causa |
|---|---|
| Card do Slack não aparece | `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` vazios no servidor |
| `?slack=error` depois de autorizar | redirect URL não cadastrado no app, ou o state expirou (10 min) |
| "No Slack user … has your email" | e-mail do app ≠ e-mail do Slack; corrige e espera 24h ou reinstala |
| Ninguém recebe mais nada | token revogado no Slack → instalação apagada; reconectar |
