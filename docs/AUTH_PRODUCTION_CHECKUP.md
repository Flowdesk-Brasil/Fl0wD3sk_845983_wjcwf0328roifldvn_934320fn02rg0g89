# Checkup de Auth, GitHub, Passkey, 2FA e Cartao

Use este roteiro depois de configurar `.env.local` e tambem antes de publicar em producao.

## Variaveis obrigatorias

- `NEXT_PUBLIC_SITE_URL` ou dominio publico correto da aplicacao.
- `FLOWSECURE_MASTER_KEY` forte e igual entre builds do mesmo ambiente.
- `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`.
- `GITHUB_HOSTING_REDIRECT_URI` em producao: `https://seu-dominio.com/api/auth/github/hosting/callback`.
- `NEXT_PUBLIC_MERCADO_PAGO_CARD_PUBLIC_KEY` ou chave publica equivalente.
- `FLOWDESK_ENABLE_CARD_CHECKOUTS=true`.
- `NEXT_PUBLIC_FLOWDESK_ENABLE_CARD_CHECKOUTS=true` quando o cliente precisar renderizar cartao.

## GitHub local

1. No GitHub OAuth App, adicione callback local: `http://localhost:3000/api/auth/github/hosting/callback`.
2. Rode `npm run dev` dentro de `site`.
3. Abra `/dashboard/hosting`, conecte GitHub e confirme que repositorios reais aparecem.
4. Se voltar sem repositorios, confira se o OAuth App tem o callback local e se o navegador nao esta preso em cookie antigo.

## GitHub producao

1. No OAuth App, adicione exatamente o dominio de producao em `GITHUB_HOSTING_REDIRECT_URI`.
2. Publique com `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` e `FLOWSECURE_MASTER_KEY`.
3. Conecte GitHub por uma conta real e valide `/api/auth/me/hosting/github/status`.
4. Crie uma hospedagem e abra `/vps/[code]`; arquivos, deploys e commits devem usar o token persistido.

## Passkey e 2FA

1. Em local, use `localhost`; WebAuthn nao funciona em HTTP comum fora de localhost.
2. Em producao, use HTTPS valido e dominio estavel.
3. Cadastre uma passkey em `/account/security`.
4. Ative TOTP/2FA, salve os codigos de recuperacao e teste uma acao sensivel.
5. Revogue uma passkey e confirme que ela nao autentica mais.

## Cartao e recorrencia

1. Configure as chaves publicas do Mercado Pago e `FLOWDESK_ENABLE_CARD_CHECKOUTS=true`.
2. Rode `npm run lint`, `npx tsc --noEmit` e `npm test`.
3. Abra uma tela de plano e confirme que cartao nao aparece mais como desativado.
4. Teste um pagamento em sandbox antes de usar credenciais de producao.

## Exclusao de conta

1. Crie uma conta de teste com GitHub, passkey, TOTP, chave API, metodo salvo e equipe.
2. Execute a exclusao pela aba de conta.
3. Confirme que sessoes, API keys, OAuth, passkeys, TOTP, GitHub e metodos salvos nao continuam ativos.
4. Historico financeiro/auditoria pode permanecer apenas para obrigacao legal, conciliacao e antifraude.
