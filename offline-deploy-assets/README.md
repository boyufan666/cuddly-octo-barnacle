# Offline Deployment Assets

This directory is for preparing customer Mac offline deployment assets.

## Included

- `Docker-Desktop-Mac-arm64.dmg`
  - Docker Desktop installer for Apple Silicon Macs.
  - Use this when the customer computer cannot open the Docker website.

## Still Required

The Docker image bundle must be generated on a Mac where Docker can run and access the internet:

```bash
cd offline-deploy-assets
bash create-docker-image-bundle.sh
```

The script creates:

```text
rehab-platform-docker-images-postgres18.tar
```

Copy both files to the customer computer:

```text
Docker-Desktop-Mac-arm64.dmg
rehab-platform-docker-images-postgres18.tar
```

## On The Customer Computer

Install Docker Desktop from the DMG, open Docker Desktop, then load the images:

```bash
docker load -i rehab-platform-docker-images-postgres18.tar
docker images | grep postgres
```

After that, return to the project and run:

```bash
pnpm infra:up
```
