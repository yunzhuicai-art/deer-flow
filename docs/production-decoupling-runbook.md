# DeerFlow Production Decoupling Runbook

Date: 2026-07-03

This runbook defines the production direction for the current DeerFlow deployment:

```text
Orpheus Console
  -> Omnipotent Agent card redirect
  -> Vercel-hosted DeerFlow frontend
  -> Hetzner-hosted DeerFlow gateway
  -> Vercel Sandbox provider
  -> external model/search/fetch/media APIs
```

The goal is to keep upstream DeerFlow easy to update while keeping local product changes isolated.

## Current Verified State

Vercel project:

```text
project: deerflow-official-frontend
production URL: https://deerflow-official-frontend.vercel.app
team: nicolavye
```

Vercel production environment variables exist:

```text
BETTER_AUTH_SECRET
BETTER_AUTH_URL
DEER_FLOW_TRUSTED_ORIGINS
DEER_FLOW_INTERNAL_GATEWAY_BASE_URL
```

Local DeerFlow Git remotes:

```text
origin   https://github.com/yunzhuicai-art/deer-flow.git
upstream https://github.com/bytedance/deer-flow.git
alexander https://github.com/AlexanderNiocalyev/deer-flow.git
```

Push to upstream and alexander is disabled locally. That is correct. Keep it that way.

Local Orpheus Git remote:

```text
origin https://github.com/yunzhuicai-art/Orpheus.git
```

The Orpheus Omnipotent Agent card already routes to:

```text
https://deerflow-official-frontend.vercel.app
```

Remaining Orpheus cleanup: change the card copy that still says "Open the DeerFlow sandbox dashboard."

## Production Component Boundaries

### 1. Orpheus Console

Responsibility:

- Owns user entry.
- Owns the Omnipotent Agent card.
- Owns the first-party login/session before the user reaches DeerFlow.
- Redirects to the DeerFlow frontend URL.

Must not:

- Import DeerFlow frontend code.
- Know sandbox provider details.
- Know DeerFlow internal run/thread implementation.
- Store DeerFlow API secrets.

Required config:

```text
VITE_DEERFLOW_FRONTEND_URL=https://deerflow-official-frontend.vercel.app
```

### 2. DeerFlow Frontend on Vercel

Responsibility:

- Hosts the DeerFlow UI.
- Proxies browser API calls to the Gateway through Next.js rewrites.
- Owns branding text, visible links, and frontend auth UX.

Must not:

- Contain model provider secrets.
- Contain sandbox provider secrets.
- Implement sandbox lifecycle logic.
- Fork large upstream UI areas unless there is a product reason.

Required production env:

```text
DEER_FLOW_INTERNAL_GATEWAY_BASE_URL=https://deerflow.62-238-14-244.sslip.io
DEER_FLOW_TRUSTED_ORIGINS=https://deerflow-official-frontend.vercel.app,https://deerflow-official-frontend-*.vercel.app
BETTER_AUTH_URL=https://deerflow-official-frontend.vercel.app
BETTER_AUTH_SECRET=<secret>
```

The local frontend already supports this through `frontend/next.config.js`:

```text
/api/* -> DEER_FLOW_INTERNAL_GATEWAY_BASE_URL/api/*
```

### 3. DeerFlow Gateway on Hetzner

Responsibility:

- Owns real auth/session validation.
- Owns users, threads, runs, agents, memory, files, artifacts.
- Owns model/tool/provider selection.
- Owns sandbox lifecycle through provider abstraction.
- Stores durable runtime state in Postgres.

Must not:

- Be scaled to multiple workers until run state, SSE, cancel/reconnect, and sandbox release are validated for distributed operation.
- Rely on manual in-container edits.
- Keep production-only changes outside the tracked config or secrets store.

Required production config classes:

```text
database.backend: postgres
run_events.backend: db
sandbox.use: deerflow.community.vercel_sandbox:VercelSandboxProvider
sandbox.vercel_record_store: database
```

Production env/secrets:

```text
DATABASE_URL
OPENAI_API_KEY or selected model-provider keys
VERCEL_TOKEN
VERCEL_PROJECT_ID
VERCEL_TEAM_ID
BETTER_AUTH_SECRET
AUTH_JWT_SECRET
INTERNAL_AUTH_TOKEN
DEERFLOW_EMBED_TOKEN_SECRET
ORPHEUS_AGENT_WORKSPACE_CALLBACK_TOKEN
TAVILY_API_KEY
JINA_API_KEY
FIRECRAWL_API_KEY
BRAVE_SEARCH_API_KEY
BRAVE_ANSWER_API_KEY
VOLCENGINE_ARK_API_KEY
```

Only configure keys that are actually enabled by the selected provider config.

### 4. Sandbox Provider

Responsibility:

- Provide isolated command/file/browser/runtime execution.
- Persist mapping from DeerFlow thread/run to sandbox instance.
- Sync artifacts back to host storage.

Current selected provider:

```text
deerflow.community.vercel_sandbox:VercelSandboxProvider
```

Recommended baseline:

```yaml
sandbox:
  use: deerflow.community.vercel_sandbox:VercelSandboxProvider
  vercel_record_store: database
  vercel_stop_on_release: true
  vercel_runtime: python3.13
  vercel_vcpus: 2
  vercel_memory_mb: 4096
  vercel_timeout_ms: 2700000
```

Fallback provider strategy:

```text
primary: Vercel Sandbox
fallback: Docker/K8s sandbox provider on Hetzner or another isolated worker
local dev only: LocalSandboxProvider
```

## Source Of Truth

Use this rule:

```text
Tracked config template + environment secrets + deployment script = truth
Running container state = disposable
```

Do not fix production by manually editing files inside a running container. If a change matters, it must be represented in one of:

- tracked config template
- tracked deploy script
- secret/env value
- database migration
- Git commit

Current production-truth requirement:

```text
/Users/zhang/Documents/deer-flow-vercel-sandbox/ops/deerflow/cloud-run/config.prod.yaml
```

must keep the production feature flags aligned with runtime:

```yaml
agents_api:
  enabled: true

skill_evolution:
  enabled: true
```

If production should expose custom agent creation and skill evolution, those values must stay enabled in the tracked production config before every image build. Otherwise a rebuild can silently remove the runtime fix.

## Upstream Sync Strategy

Keep three long-lived references:

```text
upstream/main        bytedance/deer-flow, read-only
origin/main          yunzhuicai-art/deer-flow production fork
origin/brand-overlay minimal local branding/auth/deploy changes
```

Recommended workflow:

```bash
git fetch upstream
git switch main
git pull --ff-only origin main

git switch -c sync/upstream-20260703
git merge upstream/main
```

Then apply only local overlays:

```text
frontend brand text/link cleanup
frontend auth integration
frontend gateway env/rewrite config
backend production config
deployment files
```

Do not repeatedly edit upstream components by hand. The more local edits exist inside upstream-owned UI/runtime files, the more future syncs will hurt.

### Preferred Overlay Pattern

Create a small local package or config module:

```text
frontend/src/product/brand.ts
frontend/src/product/routes.ts
frontend/src/product/auth.ts
frontend/src/product/external-links.ts
```

Example shape:

```ts
export const productBrand = {
  appName: "Agent Workspace",
  shortName: "AW",
  homeHref: "/",
  workspaceHref: "/workspace",
  showGithubLinks: false,
  showDocsLinks: false,
};
```

Upstream components should read from that module where possible. When upstream changes, the merge conflict is usually limited to the import sites.

## Deployment Flow

### Frontend

Use Git-based Vercel deployment as the normal path:

```text
merge PR -> Vercel production deployment
```

CLI deployment is acceptable for emergency/manual preview:

```bash
vercel deploy --prod --scope nicolavye
```

Required smoke checks:

```bash
curl -I https://deerflow-official-frontend.vercel.app/
curl -sS https://deerflow-official-frontend.vercel.app/ | grep -E "Agent Workspace|Open Workspace"
curl -i https://deerflow-official-frontend.vercel.app/api/v1/auth/setup-status
```

### Gateway

Use Docker image rebuild and restart, not container edits:

```bash
ssh deploy@62.238.14.244
cd <deerflow-deploy-dir>
sudo docker compose build deerflow-gateway
sudo docker compose up -d deerflow-gateway
sudo docker logs -f deerflow-gateway
```

Required smoke checks:

```bash
curl -sS http://127.0.0.1:8001/health
curl -i https://deerflow.62-238-14-244.sslip.io/health
```

Functional smoke checks:

```text
1. login
2. create new chat
3. send "hi"
4. create custom agent
5. run a task that uses web_search
6. run a task that uses web_fetch
7. run a task that writes a file
8. verify sandbox id is recorded in database-backed runtime_bindings
```

### Sandbox

Sandbox smoke task:

```text
Create a Python file that writes /mnt/user-data/outputs/smoke.txt with the current timestamp, then list the outputs directory.
```

Expected result:

```text
Vercel Sandbox is created or resumed.
Command succeeds.
Output file is synced back and visible as an artifact.
runtime_bindings contains the sandbox binding.
Sandbox is stopped/released if vercel_stop_on_release=true.
```

## Sandbox Session Manager

You do need sandbox lifecycle management, but it should live behind the Gateway sandbox provider, not in the frontend.

Recommended policy:

```text
binding key: user_id + thread_id
create: first tool call that needs execution
reuse: same thread while active
release: after run finalization or idle timeout
persist mapping: database runtime_bindings
cleanup: scheduled stale-binding sweeper
limits: max active sandboxes per user/workspace
```

Resource controls:

```text
max active sandboxes per user: 1-3
max active sandboxes per workspace: configurable
idle release: 5-15 minutes for normal users
hard timeout: provider limit
artifact sync: on every run finalization and before release
```

Failure handling:

```text
If sandbox acquire fails -> retry once -> fall back provider if configured -> mark run failed with readable error.
If sandbox command times out -> kill command -> release sandbox -> keep artifacts already synced.
If sandbox binding exists but remote sandbox missing -> recreate and update binding.
```

## Auth Direction

Target:

```text
User logs into Orpheus first.
Orpheus opens DeerFlow with a signed session or SSO/OIDC bridge.
DeerFlow should not ask the user to create a separate DeerFlow account.
```

Best production options:

1. OIDC/SSO from the existing identity provider into DeerFlow.
2. Signed embed/session token from Orpheus to DeerFlow.
3. Temporary fallback: DeerFlow local auth, but disable open public registration.

Do not leave public self-registration enabled if model/tool API costs are attached to your account.

## Security Baseline

Required before public traffic:

```text
disable public self-registration or gate it with invite/admin approval
enable strict CORS/CSRF origins
keep secrets only in env/secret store
rate-limit expensive endpoints
per-user quotas for model calls and sandbox minutes
per-user file/artifact isolation
admin-only skill install/update
admin-only model/tool provider changes
logs must redact API keys and auth tokens
```

## Known Local Cleanup

Current local DeerFlow worktree has many modified frontend files from the rejected visual redesign. Before making the next real branch:

```bash
git -C /Users/zhang/Documents/deer-flow-vercel-sandbox status --short
```

Do not blindly reset if there are user changes. The clean path is:

```text
1. create a rescue patch of current local edits
2. restore frontend from upstream/main or origin/main
3. apply the approved small brand-clean patch only
4. commit that as a small PR
```

The approved deployed frontend cleanup is now tracked as normal Git changes in the production branch. The rescue copy created during cleanup exists at:

```text
/tmp/deerflow-architecture/backups/
```

The latest good Vercel preview is:

```text
https://deerflow-official-frontend-pk4xuzjw6-nicolavye.vercel.app
```

Do not use the older immutable bad preview:

```text
https://deerflow-official-frontend-fzzrjzkk4-nicolavye.vercel.app
```

## Immediate Next Implementation Checklist

1. Make the DeerFlow repo writable in Codex or run these steps manually.
2. Create branch:

```bash
git switch -c production/decoupled-vercel-frontend
```

3. Restore official frontend baseline.
4. Apply the approved brand cleanup as a normal Git patch or cherry-pick from the production branch.
5. Keep `ops/deerflow/cloud-run/config.prod.yaml` feature flags matched to runtime:

```yaml
agents_api:
  enabled: true

skill_evolution:
  enabled: true
```

Only enable `skill_evolution` if you want users to create/evolve skills in production.

6. Add this runbook under:

```text
docs/production-decoupling-runbook.md
```

7. Patch Orpheus card copy:

```text
Open the Agent Workspace.
```

8. Deploy Orpheus Console.
9. Deploy Vercel frontend from Git.
10. Rebuild/restart Hetzner Gateway.
11. Run frontend/gateway/sandbox smoke tests.

## Evidence And Source Files

Local files inspected:

```text
/Users/zhang/Documents/deer-flow-vercel-sandbox/frontend/next.config.js
/Users/zhang/Documents/deer-flow-vercel-sandbox/frontend/src/core/auth/gateway-config.ts
/Users/zhang/Documents/deer-flow-vercel-sandbox/ops/deerflow/cloud-run/config.prod.yaml
/Users/zhang/Documents/deer-flow-vercel-sandbox/ops/deerflow/cloud-run/README.md
/Users/zhang/Documents/orpheus-agent-sandbox-phase2/apps/console/src/lib/urls.ts
/Users/zhang/Documents/orpheus-agent-sandbox-phase2/apps/console/src/app/console/features/transcribe-workspace.tsx
/Users/zhang/Documents/orpheus-agent-sandbox-phase2/package.json
```

Official upstream:

```text
https://github.com/bytedance/deer-flow
```

Generated support files now tracked in this repo:

```text
docs/production-decoupling-runbook.md
scripts/smoke-deerflow-production.sh
```
