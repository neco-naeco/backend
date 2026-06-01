# Python Runner Image

This directory builds the runtime image referenced by the seeded Docker image metadata:

- image URI: `neconaeco/python-runner:python-3.12-v1`

The backend runtime adapter starts a sibling container from this image at game start
and then uses `docker exec` to:

- write submitted files into `/workspace`
- run commands such as `python /workspace/main.py`

The image intentionally stays minimal:

- base image: `python:3.12-slim`
- shell available for `sh -lc ...`
- default working directory: `/workspace`
- default command: `tail -f /dev/null`

Build with:

```sh
docker compose --profile runtime-images build python-runner
```
