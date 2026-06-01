# Python Runner Image Placeholder Plan

## Goal

Reserve the missing local runtime-image source directory so the repository keeps
the expected build path for `neconaeco/python-runner:python-3.12-v1` without
committing runtime image sources yet.

## What Was Added

- `docker/runtime/python-runner/.gitkeep`
- `.gitignore` rules that preserve the directory path while ignoring future local
  runtime-image contents by default

## Why This Exists

The current backend runtime adapter and seed metadata still expect a runner image
identified as `neconaeco/python-runner:python-3.12-v1`. That expectation comes
from:

- `src/integrations/runtime/runtime-defaults.service.ts`
- `database/seeds/docker_images.json`
- `database/seeds/mission_templates.json`

However, the repository does not currently include the actual image source files.
The placeholder directory keeps the expected path visible so a later task can add
the real Docker build context without changing Compose paths again.

## Current State

- `docker-compose.yml` still points to `./docker/runtime/python-runner`
- the repository now preserves that directory with `.gitkeep`
- runtime-image source files remain intentionally absent
- local teams can place untracked build files under this directory without
  changing the committed path contract

## Deferred Work

A future runtime-image task still needs to add the real contents required to make
this build command succeed:

```sh
docker compose --profile runtime-images build python-runner
```

Until that work lands, the placeholder only documents the expected directory
contract.
