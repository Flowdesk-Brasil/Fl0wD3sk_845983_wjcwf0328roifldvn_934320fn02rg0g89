This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open the local hosts below to validate the subdomain routing:

- `http://localhost:3000` for the public site
- `http://fdesk.localhost:3000` for `/dashboard`
- `http://servers.localhost:3000` for `/servers`
- `http://account.localhost:3000` for `/account` and auth callbacks
- `http://status.localhost:3000` for `/status`

The auth cookies are shared between the Flowdesk subdomains when you use `*.localhost` locally or `*.flwdesk.com` in production.

Production host mapping:

- `https://www.flwdesk.com` keeps the public site
- `https://fdesk.flwdesk.com` serves the dashboard workspace
- `https://servers.flwdesk.com` serves the servers workspace
- `https://account.flwdesk.com` serves account/auth
- `https://status.flwdesk.com` serves the status page

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
