# backend

## Local runtime images

Game start prepares a Docker container from the seeded Python runner image:

```sh
docker compose --profile runtime-images build python-runner
```

Run this before starting a local game flow when the image is missing or after
changing files under `docker/runtime/python-runner/`.
