# Cue on AWS — Deployment Runbook

Production hosting for the Cue API: **ECS Fargate + Application Load Balancer + RDS PostgreSQL 17**,
defined in one CloudFormation template ([`infra/aws/cue-api.yaml`](../../infra/aws/cue-api.yaml))
and deployed by a manual GitHub Actions workflow
([`.github/workflows/deploy-api.yml`](../../.github/workflows/deploy-api.yml)). Supersedes the
Railway plan. Nothing here has been run against AWS yet.

## What gets created

| Piece           | Detail                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Network         | VPC, 2 public subnets (load balancer + API tasks), 2 isolated subnets (database). **No NAT gateway.**                       |
| HTTPS           | Free ACM certificate for your API hostname; ALB on 443 (TLS 1.2/1.3), port 80 redirects to HTTPS                            |
| API             | Fargate tasks (0.25 vCPU / 0.5 GB) from the root `Dockerfile`; rolling deploys with auto-rollback                           |
| Database        | RDS PostgreSQL 17.11, `db.t4g.micro`, 20 GB gp3, encrypted, private, 7-day backups, deletion protection, snapshot on delete |
| Secrets         | Generated DB password; `DATABASE_URL`; an app secret you fill (`CLERK_SECRET_KEY`, optional `NEXCONN_APP_SECRET`)           |
| Images and logs | ECR (immutable tags, scan on push, keeps 20); CloudWatch logs kept 30 days                                                  |
| Deploy access   | GitHub OIDC role limited to the `main` branch of your repository — no AWS keys stored in GitHub                             |

Security posture: API tasks accept traffic only from the load balancer, so `TRUST_PROXY_HOPS=1`
is exact and client IPs cannot be spoofed past it. The database accepts connections only from the
API and migration tasks. Database TLS stays `verify-full` for both the API and migrations, using
Amazon's public RDS CA bundle shipped in the image (`/app/certs/rds-global-bundle.pem`).

**Rough cost** (us-east-1, before free-tier credits, varies by region and traffic): load balancer
~$18, Fargate 1 task ~$10, RDS `db.t4g.micro` ~$13 + storage ~$2.5, logs/secrets/ECR ~$3 →
**about $45–50/month**. Set an AWS Budget alarm before creating the stack.

## One-time setup (you)

1. **AWS account** with MFA on the root user; work as an IAM admin user or IAM Identity Center user.
   Create a **Budget** alarm (Billing → Budgets) for your monthly limit.
2. **Pick a region** close to your users and use it everywhere below.
3. **Clerk production instance** (Clerk Dashboard → create production instance on your domain):
   - add the DNS records Clerk lists for your domain;
   - Google sign-in: production instances need **your own Google OAuth client** (Clerk shows the
     redirect URI to register in Google Cloud Console);
   - enable Native API; allow-list `app://bundle/` for the native SSO redirect;
   - Organizations: **membership not required** (Cue uses its own workspaces);
   - note the **secret key** (`sk_live_…`), **publishable key** (`pk_live_…`), **Frontend API host**
     and **issuer** (the Frontend API URL).
4. **Create the stack**: CloudFormation → Create stack → upload `infra/aws/cue-api.yaml`.
   Stack name e.g. `cue-prod`. Parameters:
   - `ApiDomainName`: e.g. `api.<your-domain>`
   - `ClerkJwtIssuer`: the production issuer; `ClerkAuthorizedParties`: `app://bundle`
   - `CorsOrigin`: `app://bundle` (lets the desktop status indicator read health) or empty
   - `EnableChat`: `false` unless you have Nexconn production credentials (then fill the three
     `Nexconn*` values)
   - `CreateGitHubOidcProvider`: `false` only if the account already has GitHub's OIDC provider
   - leave `ImageTag=bootstrap`, `DesiredCount=0`
   - acknowledge IAM resource creation.
5. **Validate the certificate** while the stack is creating: Certificate Manager → the pending
   certificate → copy its CNAME validation record into your domain's DNS. The stack waits for it
   (usually minutes after the record propagates).
6. **Point the API hostname** at the load balancer: add a CNAME `api.<your-domain>` → stack output
   `LoadBalancerDnsName`.
7. **Fill the app secret**: Secrets Manager → stack output `AppSecretArn` → set `CLERK_SECRET_KEY`
   to the `sk_live_…` key (and `NEXCONN_APP_SECRET` if chat is enabled). `sk_test_` keys are refused.
8. **GitHub repository variables** (Settings → Secrets and variables → Actions → Variables):
   `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN` (output `GitHubDeployRoleArn`), `CUE_STACK_NAME`
   (e.g. `cue-prod`), `CUE_API_URL` (output `ApiUrl`). These are identifiers, not secrets.

## Every release

1. Merge to `main`.
2. Take an RDS snapshot if the release contains a migration (RDS → Snapshots → Take snapshot).
3. GitHub → Actions → **Deploy API** → Run workflow (on `main`). It:
   1. builds the root `Dockerfile` and pushes `:<commit-sha>` to ECR;
   2. runs `npm run db:migrate:deploy` as a one-off Fargate task on the new image — **a failed
      migration stops the deploy** before any traffic moves;
   3. updates the stack's `ImageTag` (and `DesiredCount=1`) so ECS rolls out the new tasks; failed
      health checks roll back automatically;
   4. waits for `https://<api>/api/v1/health/ready` to return 200.

Migrations must stay backward compatible with the previous release (it keeps serving during the
rollout). A failed migration is recorded in `_prisma_migrations` and needs a manual
`prisma migrate resolve` after inspection; restore from the snapshot if data was affected.

## Desktop release build

On the build machine, with production values (never committed):

```bash
BT_API_BASE_URL=https://api.<your-domain> VITE_CLERK_PUBLISHABLE_KEY=pk_live_... VITE_CLERK_FRONTEND_API_HOST=<clerk-frontend-host> pnpm desktop:package
```

The build refuses a non-HTTPS/private API origin and a `pk_test_` key. Publish the installer from
`apps/desktop/release/` (e.g. a GitHub Release). The API hostname is built in — keep it stable.

## Health and operations

- Liveness `/api/v1/health` (load balancer target health); readiness `/api/v1/health/ready`
  (database reachable; checked after each deploy).
- Logs: CloudWatch `/ecs/<stack-name>`, prefixes `api` and `migrate`.
- Graceful shutdown: ECS sends SIGTERM, the API drains (≤ 8 s) and disconnects (≤ 5 s); the task
  `StopTimeout` is 30 s and target deregistration delay 15 s.
- Rate limits are in-memory per task: keep one task until a shared store exists.
- Scale up: raise `DbInstanceClass`, task CPU/memory, or `DesiredCount` (≤ 2 with in-memory limits).

## Not verified yet (do before the first real users)

- First stack creation and deploy in a real account (template passes `cfn-lint` v1.60.1 for
  us-east-1, ap-south-1 and eu-west-1; never executed).
- Building `DATABASE_URL` from the generated secret via a dynamic reference inside `Fn::Sub`.
- Prisma's migration engine with the multi-certificate RDS bundle as its trusted CA, and the
  8 migrations on PostgreSQL 17 (validated so far on 16) — both testable locally once Docker runs.
- Clerk production sign-in (Google OAuth with your own client) end to end from the packaged app.
