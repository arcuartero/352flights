# Deployment policy

Vercel Git integration is the only deployment mechanism for this repository.
When asked to publish code, commit/push to the appropriate Git branch and let that integration build it once per environment. Do not also run `vercel deploy`, `vercel --prod`, invoke a Deploy Hook, or call a deployment tool/API. Do not redeploy the same commit from Codex.

Do not deploy to production, change Vercel account settings, or delete deployments without explicit user authorization. Local verification does not require a Preview deployment.

Keep scanner files available locally and in GitHub Actions. Never display or commit secrets. Preserve existing working-tree changes.
