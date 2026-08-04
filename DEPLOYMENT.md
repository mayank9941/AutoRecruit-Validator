# Deploying AutoRecruit on GCP

The whole stack runs on a single Compute Engine VM with Docker Compose:

```
Browser ── HTTPS ──> Caddy (auto-TLS, serves React build, proxies /api/*)
                        │
                        └──> FastAPI backend (uvicorn) ──> Postgres 16
                                   │
                                   └──> /app/storage (docker volume: JD PDFs + candidate docs)
```

Why a VM and not Cloud Run: candidate master ZIPs can be multi-GB (Cloud
Run caps HTTP/1 request bodies at 32 MB), screening runs as in-process
background threads that must outlive the HTTP request, and documents are
stored on local disk. A single always-on VM matches all three.

## 1. One-time GCP setup

```bash
gcloud auth login
gcloud projects create <PROJECT_ID> && gcloud config set project <PROJECT_ID>
# link a billing account in the console, then:
gcloud services enable compute.googleapis.com

gcloud compute addresses create autorecruit-ip --region=asia-south1
gcloud compute instances create autorecruit-vm \
  --zone=asia-south1-a \
  --machine-type=e2-standard-2 \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud \
  --boot-disk-size=100GB \
  --address=autorecruit-ip \
  --tags=http-server,https-server
```

(2 vCPU / 8 GB for parallel screening + PDF parsing; 100 GB disk for
candidate documents. Pick a region near your users.)

Firewall: the default `http-server` / `https-server` tags open 80/443. If
your project doesn't have those rules yet:

```bash
gcloud compute firewall-rules create allow-http  --allow=tcp:80  --target-tags=http-server
gcloud compute firewall-rules create allow-https --allow=tcp:443 --target-tags=https-server
```

## 1b. No domain? Plain-HTTP mode

You can run IP-only (no DNS, no TLS) by setting in `.env`:

```
DOMAIN=:80
COOKIE_SECURE=false
```

Then access the app at `http://<static-ip>`. Skip step 2 entirely.
`COOKIE_SECURE=false` is mandatory here -- a `Secure` cookie is silently
dropped by browsers over plain http and login would loop forever.
Move to a real domain + HTTPS before real candidate data enters the
system; when you do, set `DOMAIN=<your-domain>`, remove
`COOKIE_SECURE=false`, and `docker compose up -d` -- Caddy fetches the
certificate on its own.

## 2. DNS

Create an **A record** for your domain (e.g. `hr.yourdomain.com`) pointing
at the static IP (`gcloud compute addresses describe autorecruit-ip
--region=asia-south1` shows it). Caddy issues the HTTPS certificate
automatically once the record resolves -- there is no manual TLS step.

## 3. Install Docker on the VM

```bash
gcloud compute ssh autorecruit-vm --zone=asia-south1-a
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER   # then log out & back in
```

## 4. Deploy

```bash
git clone https://github.com/mayank9941/AutoRecruit-Validator.git
cd AutoRecruit-Validator
cp .env.example .env
nano .env    # set DOMAIN, DB_PASSWORD, SECRET_KEY, GEMINI_API_KEY
             # generate secrets with: openssl rand -hex 32
docker compose up -d --build
```

First boot builds both images (frontend build included -- no Node needed
on the VM). Tables are created automatically on backend startup.

## 5. Create the first HR account

```bash
docker compose exec backend python scripts/create_hr_user.py hr@yourcompany.com
```

Then open `https://<your-domain>`, log in, and run one JD upload + one
small candidate batch + one screening end-to-end as a smoke test.

## 6. Updating to a new version

```bash
cd AutoRecruit-Validator
git pull
docker compose up -d --build   # rebuilds changed images, keeps volumes/data
```

## 6b. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml` deploys every push to `main`: it first runs
the frontend production build + backend compile checks, and only if they
pass, SSHes into the VM and runs `git pull && docker compose up -d --build`.

One-time setup:

1. On the VM, create a deploy key and authorize it:

   ```bash
   ssh-keygen -t ed25519 -f ~/deploy_key -N "" -C "github-actions"
   cat ~/deploy_key.pub >> ~/.ssh/authorized_keys
   cat ~/deploy_key        # copy the ENTIRE private key output
   rm ~/deploy_key ~/deploy_key.pub
   ```

2. In GitHub: repo -> Settings -> Secrets and variables -> Actions ->
   New repository secret, create three secrets:

   | Secret | Value |
   |---|---|
   | `VM_HOST` | the VM's static IP |
   | `VM_USER` | the SSH username on the VM (run `whoami` there) |
   | `VM_SSH_KEY` | the private key copied above (all lines, including BEGIN/END) |

3. Port 22 must be reachable (GCP's `default-allow-ssh` firewall rule
   normally covers this).

After that, `git push` to main (or merging a PR) is a deployment. Manual
re-deploys: Actions tab -> Deploy -> Run workflow.

## 7. Backups

Nightly DB dump + document sync to a GCS bucket (create the bucket once:
`gsutil mb -l asia-south1 gs://<PROJECT_ID>-autorecruit-backups`):

```bash
# /etc/cron.daily/autorecruit-backup (chmod +x)
#!/bin/bash
set -e
cd /home/<user>/AutoRecruit-Validator
mkdir -p /var/backups/autorecruit
docker compose exec -T db pg_dump -U ihmcl ihmcl_hr | gzip \
  > /var/backups/autorecruit/db-$(date +%F).sql.gz
gsutil -m rsync /var/backups/autorecruit gs://<PROJECT_ID>-autorecruit-backups/db
docker run --rm -v autorecruit-validator_appstorage:/data -v /var/backups:/backup \
  alpine tar czf /backup/storage-latest.tar.gz -C /data .
gsutil cp /var/backups/storage-latest.tar.gz gs://<PROJECT_ID>-autorecruit-backups/storage/
```

Also enable a weekly VM snapshot schedule (Compute Engine -> Snapshots ->
snapshot schedules) as a belt-and-braces recovery path.

## Troubleshooting

- **Backend restarting on boot** -- `docker compose logs backend`; usually a
  wrong `DATABASE_URL`/`DB_PASSWORD` or Postgres still initializing (the
  healthcheck normally prevents this).
- **No HTTPS certificate** -- `docker compose logs caddy`; almost always the
  DNS A record not pointing at the VM yet, or port 80 blocked.
- **Login succeeds but /me returns 401** -- the site must be reached via
  `https://$DOMAIN` (the cookie is `Secure`); check `COOKIE_SECURE` and that
  you aren't hitting the raw IP.
- **Uploads fail for big ZIPs** -- `request_body max_size` in `Caddyfile`
  (currently 5GB).

## Environment variables (backend)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLAlchemy Postgres URL (set by compose) |
| `GEMINI_API_KEY` | Google AI Studio key for screening/OCR/JD parsing |
| `SECRET_KEY` | Signs session cookies -- long random string |
| `FRONTEND_ORIGINS` | CORS allowlist (same-origin in this setup; kept for dev) |
| `COOKIE_SECURE` | `true` in production (HTTPS-only session cookie) |
| `JD_UPLOAD_DIR` / `CANDIDATE_UPLOAD_DIR` | Optional storage overrides (default `storage/...`) |
