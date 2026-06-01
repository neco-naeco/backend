# Python Runner Image Bootstrap

## Goal

Restore the missing local runtime-image build source so the backend can build the
seeded mission runner image `neconaeco/python-runner:python-3.12-v1`.

## What Was Added

- `docker/runtime/python-runner/Dockerfile`
- `docker/runtime/python-runner/.dockerignore`
- `docker/runtime/python-runner/README.md`

## Image Contract

The current backend runtime adapter expects a runner image that can:

- start from `docker run -d ... sh -lc 'tail -f /dev/null'`
- accept file writes into `/workspace` via `docker exec -i ... cat > /workspace/...`
- execute commands like `python /workspace/main.py`

Those expectations come from:

- `src/integrations/runtime/runtime-defaults.service.ts`
- `database/seeds/docker_images.json`
- `database/seeds/mission_templates.json`

## Current Build Command

```sh
docker compose --profile runtime-images build python-runner
```

## Expected Output

After a successful build, this command should succeed:

```sh
docker image inspect neconaeco/python-runner:python-3.12-v1
```

## Notes

- The image is intentionally minimal and uses `python:3.12-slim`.
- The default command is `tail -f /dev/null` because the runtime adapter starts an
  idle sibling container first and executes user code later with `docker exec`.
- `/workspace` is the expected work directory, matching the seeded calculator
  mission template.
