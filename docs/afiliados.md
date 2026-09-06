# Programa de afiliados

Como o sistema funciona, o que precisa ser feito para colocá-lo no ar e onde
mexer quando algo der errado.

## A cadeia, do clique ao PIX

```
1. Afiliado gera link          POST /api/affiliates/links
2. Visitante clica             GET  /r/<codigo>/<plano>-<periodo>
   ├─ registra em affiliate_clicks (dedupe + filtro de bot)
   ├─ grava cookie fd_aff assinado (HMAC)
   └─ redireciona para /payment/<planSlug>/<periodSlug>
3. Cliente compra              o cookie vira provider_payload.flowdesk_affiliate
                               no pedido (lib/affiliates/checkoutAttribution.ts)
4. Pagamento aprovado          markSettlementAsSettled dispara
                               recordAffiliateConversionForOrderSafe
5. Comissão calculada          nível + bônus de pódio → affiliate_conversions
6. Lançamento no ledger        commission_accrued → saldo em carência
7. Carência cumprida           job maturation → commission_matured → sacável
8. Saque                       POST /api/affiliates/withdrawals → admin paga
```

Se o cookie não existir (outro dispositivo, aba anônima, cookie expirado), o
passo 3 tem uma segunda via: se o cliente digitou o cupom do afiliado, a
redenção em `payment_coupon_redemptions` resolve a atribuição no passo 4.

## Colocar no ar

**1. Aplicar as migrações** no SQL Editor do Supabase, nesta ordem:

```
sql/148_affiliates_platform.sql      (se ainda não aplicada)
sql/150_affiliates_platform_v2.sql   (nova)
```

A 150 é idempotente: pode rodar mais de uma vez sem estragar nada.

**2. Conferir o ambiente.** Tudo tem padrão; o mínimo é ter `AUTH_SECRET`
definido (a assinatura do cookie de atribuição cai nele). Veja o bloco
"Programa de afiliados" no `.env.example` para ajustar as regras.

**3. Agendar as rotinas** (autenticadas por `CRON_SECRET` ou
`AFFILIATE_JOBS_TOKEN`):

```bash
# maturação da carência — a cada hora
curl -X POST "https://www.flwdesk.com/api/internal/affiliates/jobs?job=maturation" \
  -H "Authorization: Bearer $CRON_SECRET"

# entrega de webhooks — a cada 5 minutos
curl -X POST "https://www.flwdesk.com/api/internal/affiliates/jobs?job=webhooks" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Sem a rotina de maturação, a comissão fica em carência para sempre e ninguém
consegue sacar.

**4. Dar as permissões** de `affiliates.*` a algum cargo em `/admin/roles`.
Sem `affiliates.payout`, ninguém consegue pagar um saque.

**5. Abrir a área**: trocar `MANUTENTION_AFFILIATES` para `false`.

## As 8 decisões de negócio

Todas em `lib/affiliates/programRules.ts`, com padrão e variável de ambiente.
Mudar ali muda o comportamento em todo o sistema — e o texto da landing e do
painel acompanha, porque ambos leem as mesmas regras.

| Decisão | Padrão | Variável |
|---|---|---|
| Janela de atribuição | 30 dias, último clique | `AFFILIATE_ATTRIBUTION_WINDOW_DAYS`, `AFFILIATE_ATTRIBUTION_MODEL` |
| Recorrência | só a 1ª compra | `AFFILIATE_RECURRENCE_MODE` |
| Carência | 7 dias | `AFFILIATE_HOLDING_PERIOD_DAYS` |
| Saque mínimo | R$ 50 | `AFFILIATE_WITHDRAWAL_MINIMUM_BRL` |
| Execução do PIX | manual | fixo, por decisão |
| Nível pode cair | sim | `AFFILIATE_LEVEL_CAN_REGRESS` |
| Auto-indicação | bloqueada | `AFFILIATE_BLOCK_SELF_REFERRAL` |
| Cupom | 10%, sai da margem | `AFFILIATE_COUPON_DISCOUNT_PCT` |

A carência precisa cobrir a janela de reembolso do meio de pagamento. Se o
reembolso pode acontecer em 30 dias e a carência é 7, uma comissão pode ser
sacada antes do estorno — e o ledger fica negativo, com o débito abatendo as
comissões seguintes.

## O ledger

**O saldo não é um campo, é a soma dos lançamentos.** `affiliate_ledger` é
append-only: o banco recusa `update` e `delete`. Corrigir um erro significa
lançar a entrada inversa.

Os campos `balance_pending`, `balance_available` e `total_earned` em
`affiliates` são cache, reescritos por `affiliate_recompute_balances()` a cada
lançamento.

Para conferir se o cache bate com a verdade:

```sql
select public.affiliate_recompute_all_balances();
```

O detalhe de um afiliado no admin (`GET /api/admin/affiliates/<id>`) devolve
`balanceDrift`: diferença entre o cache e a soma do ledger. Diferente de zero
significa lançamento perdido — investigue antes de pagar qualquer saque.

**Saldo negativo é legítimo.** Acontece quando um reembolso chega depois de o
afiliado já ter sacado a comissão: o valor vira dívida, abatida pelas próximas
comissões. Enquanto o saldo estiver negativo, `requestWithdrawal` recusa
qualquer saque. A função de recálculo emite um `warning` no log do Postgres,
mas não falha — se ela lançasse exceção, o lançamento de estorno (já gravado, e
imutável) congelaria o afiliado, porque todo recálculo seguinte quebraria.

Por isso a migração 150 **remove** os checks `affiliates_balance_available_check`
e `affiliates_balance_pending_check`, criados pela v1 exigindo saldo `>= 0`. Com
eles no lugar, o recálculo falharia por violação de constraint exatamente nesse
cenário. `total_earned` continua não-negativo, porque é métrica de vida e a
função aplica `greatest(x, 0)` antes de gravar.

## Onde mexer

| Preciso mudar | Arquivo |
|---|---|
| Percentual de comissão por nível | `lib/affiliates/affiliateLevels.ts` |
| Qualquer regra de negócio | `lib/affiliates/programRules.ts` |
| Cálculo e registro da comissão | `lib/affiliates/commissions.ts` |
| Saldo e extrato | `lib/affiliates/ledger.ts` |
| Regras de saque e validação de PIX | `lib/affiliates/withdrawals.ts` |
| Cookie de atribuição | `lib/affiliates/attribution.ts` |
| Adesão e termos | `lib/affiliates/account.ts` |
| Disparo de webhook | `lib/affiliates/notifications.ts` |
| Redirecionador do link | `app/r/[...segments]/route.ts` |

## Decisões de projeto que parecem estranhas mas são propositais

**O programa de afiliados nunca derruba um pagamento.** Todos os ganchos no
fluxo de pagamento são `void ...Safe(...)`: falham em silêncio com log. Um erro
aqui não pode impedir o cliente que pagou de receber o que comprou.

**Auto-indicação vira conversão cancelada, não conversão inexistente.** Fica
registrada com `reversal_reason = 'self_referral'` para ser auditável — é
sinal de tentativa de fraude e você vai querer ver o histórico.

**O saldo sai na solicitação do saque, não no pagamento.** Se continuasse
disponível enquanto o pedido está na fila, o afiliado poderia solicitar duas
vezes o mesmo dinheiro. Rejeitar devolve (`withdrawal_refunded`).

**A chave PIX aparece completa só no admin.** No painel do afiliado ela vai
mascarada. O admin é o único lugar onde alguém precisa dela inteira, porque é
quem transfere.

**Webhook exige https e recusa rede interna.** Sem isso, um afiliado poderia
cadastrar `http://169.254.169.254/` e usar o servidor para ler metadados da
infraestrutura (SSRF).

## O que ainda não existe

- **Treinamento e templates**: as abas existem, o conteúdo não. A de
  treinamento diz isso honestamente em vez de listar aulas que não abrem.
- **Transferência PIX automática**: por decisão. Mover dinheiro sozinho precisa
  de integração dedicada e aprovação humana.
- **Tratamento fiscal**: retenção de IR e nota fiscal para o afiliado pessoa
  física não estão implementados. Consulte a contabilidade antes de operar em
  volume.
- **E-mail e SMS de notificação**: os campos são salvos e o webhook dispara; os
  outros dois canais ainda não têm remetente ligado.
