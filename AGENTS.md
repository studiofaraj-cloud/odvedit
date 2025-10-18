# Agent Development Guide

## Commands

### Setup
No package manager or build toolchain. Open `index.html` directly in a browser or serve with a simple HTTP server.

### Build
Not applicable (static HTML/CSS/JS site).

### Lint
Not applicable (no linter configured).

### Tests
```bash
node validate-health-check.js
```

### Dev Server
Use any HTTP server, e.g.: `python -m http.server 8000` or `npx http-server`

## Tech Stack & Architecture

- **Stack**: Static HTML, CSS, JavaScript (vanilla ES6+)
- **Structure**: Multi-page site with modular JS utilities in `/js`, styles in `/styles`, assets in `/assets`
- **Key modules**: `i18n.js` (Italian/English translations), `page-loader.js` (page loading animations), `cookie-consent.js`, `email-utils.js`
- **No framework**: Pure vanilla JavaScript, no build pipeline

## Code Style

- Use semantic HTML5, descriptive class names
- JavaScript: ES6+ syntax, classes for services, camelCase naming
- CSS: BEM-like conventions, mobile-first responsive design
- Comments only for complex logic or non-obvious code
- Italian as default language throughout
