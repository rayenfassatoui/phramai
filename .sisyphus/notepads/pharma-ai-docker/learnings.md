## Docker Configuration — Learnings

### uv in Docker
- Use `COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv` to get uv binary without a separate install step.
- `uv sync --frozen --no-cache --no-dev` installs only production deps. The `--no-dev` flag excludes the `[dependency-groups] dev` group defined in pyproject.toml.
- uv creates a `.venv/` at the WORKDIR. Set `PATH="/app/.venv/bin:$PATH"` in the runtime stage so Python/uvicorn are found even without uv on PATH.
- The pyproject.toml + uv.lock must be present at runtime for `uv run` to resolve the virtualenv correctly; copy both files into the runtime stage.

### Next.js standalone output
- `output: "standalone"` in next.config.ts produces `.next/standalone/server.js` — the self-contained Node server.
- Copy pattern for runtime stage:
  1. `.next/standalone` → `./` (contains server.js at root)
  2. `.next/static` → `./.next/static` (public asset hashes)
  3. `public/` → `./public` (static files served by Next)
- Set `HOSTNAME="0.0.0.0"` so Next.js listens on all interfaces inside the container (default is 127.0.0.1).

### docker-compose healthcheck pattern
- Backend exposes `/health` endpoint → use it as the healthcheck target.
- `depends_on` with `condition: service_healthy` ensures frontend waits for backend to pass health before starting.

### Security
- Both images run as a non-root user (`appuser`) created via `adduser --system`.
- `.env` is excluded from both images via `.dockerignore` — secrets flow only through `env_file` in compose or runtime injection.

### Layer caching
- Always COPY dependency manifests (pyproject.toml + uv.lock / package.json + bun.lock) before copying application source. Deps layer is reused unless manifests change.
