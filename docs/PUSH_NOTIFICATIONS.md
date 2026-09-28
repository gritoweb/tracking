# Notificações no navegador (web push)

Tudo que cai no sininho — tarefa atribuída, menção, mudança de status de uma tarefa sua — aparece
também como notificação do sistema, no canto da tela e com o som do computador. Clicar abre a
tarefa e marca a notificação como lida (e aí o Slack não manda a DM).

## Como a pessoa liga

**Settings → General → Desktop notifications → Enable notifications.** O navegador pede permissão;
cada navegador/computador liga uma vez. Funciona com o navegador aberto, mesmo sem o TimeTracker
aberto. No iPhone/iPad só funciona com o site salvo na tela inicial (Compartilhar → Adicionar à Tela
de Início) e ligado a partir de lá.

## Como funciona

1. `notifyUser` (`src/worker/lib/notifications.ts`) grava a notificação, avisa o sininho ao vivo e
   chama `sendWebPush` (`src/worker/lib/web-push.ts`).
2. `sendWebPush` manda um push **sem conteúdo** para cada navegador da pessoa (`push_subscriptions`),
   assinado com as chaves VAPID (JWT ES256 pela WebCrypto — sem dependência nova, sem servidor novo).
   Sem conteúdo porque aí não há criptografia de payload a fazer, e nada da tarefa passa pelo
   serviço de push do Google/Mozilla/Apple.
3. O service worker (`public/sw.js`) acorda, lê `/api/notifications` com a sessão da pessoa e mostra
   as não lidas que ainda não mostrou (guarda os ids no Cache Storage). Se o app está em foco, não
   mostra nada: o sininho já está ali.
4. Clique: marca como lida (`PATCH /api/notifications/:id/read`), foca a aba aberta e navega até a
   tarefa, ou abre uma aba nova.

Sem chaves VAPID no servidor, o botão ainda liga as notificações da página (site aberto em outra
aba), só não há push com o site fechado.

## Segurança

- O servidor só faz POST para os serviços de push dos navegadores (`isPushEndpoint`: FCM, Mozilla,
  Apple, Windows, sempre https) — um cliente não consegue apontar o worker para outra URL.
- Uma assinatura pertence a quem ligou por último naquele navegador; só o dono a remove.
- Serviço de push respondeu 404/410: a assinatura é apagada.
- O push não carrega dados; quem não tem sessão válida no navegador não vê nada.

## Limites conhecidos

- O service worker lê o workspace **ativo** da sessão. Quem é de dois workspaces e recebe algo no
  outro vê a notificação no sininho de lá, mas o push desse navegador não encontra nada novo.
- O envio acontece dentro da requisição que gerou a notificação (sem fila). Serve para o tamanho do
  time; se um único evento notificar centenas de pessoas, o caminho é mover `sendWebPush` para uma
  Cloudflare Queue.

## Chaves VAPID

Um par P-256 por ambiente. Gerar:

```bash
node -e 'const {subtle}=crypto;(async()=>{const k=await subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign"]);console.log("VAPID_PUBLIC_KEY="+Buffer.from(await subtle.exportKey("raw",k.publicKey)).toString("base64url"));console.log("VAPID_PRIVATE_KEY="+(await subtle.exportKey("jwk",k.privateKey)).d)})()'
```

Local: no `.dev.vars`. Produção: `wrangler secret put VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`, e a
migration `0054_push_subscriptions.sql` aplicada antes do deploy. **Trocar o par invalida todas as
assinaturas** — cada pessoa precisa ligar de novo.

## Testar local

`pnpm dev` (ou `pnpm dev --port 8787 --strictPort` se a 5173 estiver ocupada — a 8787 já é origem
confiável do auth em dev), entrar, Settings → General → Enable notifications → Send a test, e trocar
de aba ou de app para ver a notificação.
