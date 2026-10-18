# Deployment policy

Production runs on a self-hosted Coolify instance on the OVH VPS (51.91.127.128), app "+352 Flights".
A GitHub push webhook on `main` makes Coolify build and deploy automatically, so **merging or pushing to `main` publishes to production**. See `docs/deployment.md`.

Do not merge or push to `main`, trigger a Coolify deployment (UI, API or `artisan`), change Coolify or server settings, or delete deployments without explicit user authorization. Feature branches and pull requests do not deploy; local verification does not need a deployment.

Apply the Supabase migrations a change depends on before it reaches `main`: production code that writes new columns or calls new RPCs fails until they exist.

Vercel is no longer used; its GitHub check failing ("Account is blocked") is not a code problem.

Keep scanner files available locally and in GitHub Actions. Never display or commit secrets. Preserve existing working-tree changes.
