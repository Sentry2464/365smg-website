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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

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

## Client Portal (`/portal`)

The client portal home page, built from the v2 design handoff (light theme: white, navy and gold). Code lives in
`src/app/portal/` (route and scoped `portal.css`) and `src/components/portal/`.

- Sign-in is at `/portal/login`: password, then a 6-digit code from an authenticator app.
  365 SMG staff manage clients, sites and users at `/portal/admin`.
- Data lives in a SQLite file (`.data/portal.db` in development, `/var/lib/smg/portal.db` on
  the VM). Server code is in `src/server/`; every client query is bound to the signed-in
  user's client.
- `data.ts` still holds the handoff's sample feeds (alerts, weather, news); Phase 4 replaces them.

Local development:

```bash
npm run portal-admin -- seed-demo   # demo clients and users, password "demo-password-2026"
npm run dev                         # then open http://localhost:3000/portal
npm test                            # login, two-step codes and data separation tests
```

- To review the extra design states, open
  `/portal?state=no-alert,empty-alerts,sent&threat=LOW` (any combination; `threat` is LOW, ELEVATED or HIGH).
- Hosting: the portal runs on a Proxmox VM behind a Cloudflare Tunnel at portal.365smg.com. See
  [`deploy/README.md`](deploy/README.md).
