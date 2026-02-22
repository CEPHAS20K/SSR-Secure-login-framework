# Backend

Express + Pug server lives here.

API docs are available at:

- `/api-docs` (Swagger UI)
- `/api-docs.json` (OpenAPI JSON)

## UML / Architecture Diagrams

Generate UML + architecture docs from backend context:

```bash
npm run docs:generate-uml
```

This command regenerates:

- `../docs/architecture.md`
- `../README.md` UML section

## Demo Video

Record an automated app walkthrough video from backend context:

```bash
npm run demo:video
```

Output directory:

- `../artifacts/demo-videos/`
