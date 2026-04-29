# Resume Generator Studio

A Render-ready resume builder for two flows:

- start from scratch
- improve an existing resume

The app turns your inputs plus a job description into:

- an AI-ready resume-writing prompt
- editable resume sections
- a printable PDF layout

## What It Does

- Collects candidate details, strengths, achievements, and target role
- Accepts an existing resume paste for rewrite mode
- Accepts a job description
- Builds structured editable sections:
  - Header
  - Summary
  - Skills
  - Experience
  - Projects
  - Education
  - Certifications
- Generates a reusable AI prompt for tools like ChatGPT or other LLMs
- Lets you copy JSON or the prompt
- Saves the result as PDF through the browser print flow

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

## API

### `POST /api/resume-prompt`

Accepts resume-generation inputs and returns:

- `prompt`
- `sections`
- `generatedAt`

The backend does not call an external AI model directly. It prepares a structured AI-ready prompt and starter content so the site works without API keys.

## Deploy On Render

1. Push the project to GitHub.
2. Create a Render Web Service from the repo.
3. Use:

```text
Runtime: Node
Build command: npm install
Start command: npm start
Health check path: /health
```

## Files

- `server.js` - Express server, health route, resume prompt API
- `public/index.html` - resume generator interface
- `public/app.js` - form logic, prompt generation flow, PDF export
- `public/styles.css` - responsive editor styling
- `render.yaml` - Render config
