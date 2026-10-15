# Context biasing: Voxtral Mini Transcribe V3 vs Whisper Large V3 Turbo

A side-by-side demo of how two speech-to-text models use a custom vocabulary. Each model has its own context biasing toggle, and both receive the same list of terms when it is on.

| Model | Provider | Biasing mechanism |
| --- | --- | --- |
| Whisper Large V3 Turbo | Workers AI (`@cf/openai/whisper-large-v3-turbo`) | `initial_prompt` (terms joined with commas) |
| Voxtral Mini Transcribe V3 | Mistral API (`voxtral-mini-transcribe-3`) | `context_bias` (up to 100 terms; multi-word terms are sent with underscores) |

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Add your Mistral API key to a `.env` file in the project root. The key needs access to `voxtral-mini-transcribe-3`.

   ```sh
   MISTRAL_API_KEY=your-key-here
   ```

   If `MISTRAL_API_KEY` is also exported in your shell, Wrangler uses that value instead of `.env` during local development.

3. Run locally (Workers AI requires `npx wrangler login`):

   ```sh
   npx wrangler dev
   ```

4. Deploy (uploads `MISTRAL_API_KEY` from `.env` as a secret):

   ```sh
   npm run deploy
   ```

## Try it

Click **Load sample** to load a recording of the script below (`public/samples/standup.wav`) along with the short list. You can also record yourself reading the script or upload your own recording. Then:

1. Transcribe with biasing off for both models.
2. Turn biasing on for both models. The short list is filled in when you load the sample; otherwise paste it from below.
3. Replace the terms with the long list and run again.

Found terms are highlighted in each transcript, and each panel shows how many of your terms it got right.

### Script

> Morning standup. Priya moved our agent API to Hono and rewrote the query layer with Kysely. Background jobs now run through Inngest, and validation uses Valibot. We also switched the build to Rolldown, so Oxlint and Vitest finish in half the time. On the model side, Devstral writes the fixes, Magistral reviews them, Pixtral reads the screenshots, and Voxtral transcribes our support calls.

Pronunciation: Kysely is "KEE-seh-lee", Inngest is "ingest", Valibot is "VAL-ee-bot", Hono is "HOH-no". The "-stral" names rhyme with "Mistral".

### Short list (12 terms)

All of these are spoken in the script.

```
Priya, Hono, Kysely, Inngest, Valibot, Rolldown, Oxlint, Vitest, Devstral, Magistral, Pixtral, Voxtral
```

### Long list (100 terms)

The 12 terms above, shuffled in with 88 real Mistral, Cloudflare, and JavaScript names that are not in the script. This simulates a team's full vocabulary list.

```
SvelteKit, Auth0, Hasura, VoidZero, Mistral, Better Auth, Shieldstral, Turborepo, Meilisearch, RabbitMQ, Rolldown, Grafana, Hyperdrive, Redis, Miniflare, Vectorize, Terraform, Le Chat, Voxtral, Okta, Strapi, Zaraz, CockroachDB, PlanetScale, Sequelize, Postmark, Storybook, ArkType, Codestral, Oxlint, Remix, Supabase, NestJS, Upstash, Kysely, Magistral, MikroORM, tsgo, Turso, R2 SQL, Astro, Wrangler, Workers KV, Kafka, Pixtral, Zod, Playwright, Hono, Tailwind, esbuild, Nuxt, Prisma, Vitest, Jotai, Mistral Large, Datadog, Ministral, pnpm, TanStack, Biome, Drizzle, Svelte, SQLite, Priya, Agents SDK, Vibe, Webpack, AI Gateway, Forge, BullMQ, Deno, Robostral Navigate, Mongoose, Fastify, Preact, Contentful, Inngest, SolidJS, Mistral Small, Oxc, Algolia, Sentry, Kubernetes, Devstral, Mistral Medium, Durable Objects, Babel, Rspack, SendGrid, Workers AI, Mistral OCR, Valibot, Leanstral, Zustand, Nx, Pulumi, Typesense, Twilio, tRPC, Elysia
```

### Reference results

Terms from the short list transcribed correctly, out of 12, using the included sample recording. Results with your own voice will vary.

| Terms sent | Whisper Large V3 Turbo | Voxtral Mini Transcribe V3 |
| --- | --- | --- |
| Biasing off | 3 | 5 |
| Short list (12 terms) | 11 | 12 |
| Long list (100 terms) | 7 | 12 |
