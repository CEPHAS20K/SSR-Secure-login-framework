# Frontend

Tailwind, static assets, and client-side scripts live here.

## UML / Architecture Diagrams

Generate UML + architecture docs from frontend context:

```bash
npm run docs:generate-uml
```

This command regenerates:

- `../docs/architecture.md`
- `../README.md` UML section

## Demo Video

Record an automated app walkthrough video from frontend context:

```bash
npm run demo:video
```

Output directory:

- `../artifacts/demo-videos/`

Speed controls:

```bash
DEMO_SPEED_MULTIPLIER=2.2 npm run demo:video
DEMO_SPEED_MULTIPLIER=1.2 npm run demo:video
```

Notes:

- Default speed is `1.6`.
- Install ffmpeg for MP4 export: `sudo apt update && sudo apt install -y ffmpeg`
