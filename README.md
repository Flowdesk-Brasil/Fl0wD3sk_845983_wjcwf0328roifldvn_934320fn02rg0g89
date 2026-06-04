# Corpo & Evolução

Sistema operacional para studios, construído com Next.js 16, React 19 e Supabase.

## Módulos

- Alunos, matrículas, planos, contratos e portal do aluno
- Agenda semanal, horários disponíveis e reservas de aulas
- Financeiro com PIX Mercado Pago e aprovação automática por webhook
- Check-in por QR Code/câmera com proteção contra duplicidade
- Equipe, auditoria detalhada, comunicados e configurações

## Execução local

```bash
npm install
npm run dev
```

Sem credenciais Supabase válidas, o sistema inicia no modo local:

```text
E-mail: admin@admin.com
Senha: admin
```

O modo local usa `localStorage` e serve apenas para desenvolvimento/demonstração.

## Configuração Supabase

1. Execute [`database/schema.sql`](database/schema.sql) no SQL Editor.
2. Execute [`database/migrations/002_studio_operations.sql`](database/migrations/002_studio_operations.sql).
3. Configure `.env.local` com base em `.env.example`.
4. Defina `NEXT_PUBLIC_APP_URL` e `APP_URL` com a URL pública do sistema.

`SUPABASE_SERVICE_ROLE_KEY`, SMTP e Mercado Pago são usados somente em rotas server-only.

## Portal do aluno

1. Cadastre o aluno com CPF e e-mail.
2. Abra `Alunos`, visualize o cadastro e clique em `Liberar portal e enviar acesso`.
3. O aluno recebe um link pessoal por e-mail.
4. No portal, ele visualiza QR Code, aulas, cobranças e contratos.

## Contratos

1. Em `Configurações`, envie o PDF padrão do contrato.
2. Crie a matrícula do aluno.
3. Em `Contratos`, clique em `Enviar por e-mail`.
4. O aluno abre o link, informa o CPF, aceita os termos e assina.

## PIX Mercado Pago

Configure as variáveis `MERCADO_PAGO_*` e cadastre no Mercado Pago:

```text
https://SEU-DOMINIO/api/webhooks/mercado-pago
```

Use HTTPS público em produção. O webhook consulta o pagamento diretamente no Mercado Pago antes de atualizar a cobrança, matrícula e aluno.

## Qualidade

```bash
npm run lint
npm run typecheck
npm run build
npm run check
```

O build usa Webpack por compatibilidade com o ambiente Windows atual.
