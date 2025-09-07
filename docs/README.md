# CORBA.ts Documentation Website

This directory contains the complete documentation website for CORBA.ts, built with modern HTML, CSS, and JavaScript using the CUSS2 theme.

## 🌐 Live Website

The documentation is automatically deployed to GitHub Pages at:
**https://elevationai.github.io/CORBA-ts/** (update URL when repository is published)

## 📁 Structure

```
docs/
├── index.html              # Landing page with project overview
├── .nojekyll               # Bypass Jekyll processing
├── assets/
│   └── css/
│       └── main.css        # Main stylesheet based on CUSS2 theme
├── guides/                 # User guides and tutorials
│   ├── index.html          # Guides overview
│   ├── getting-started.html # Quick start tutorial
│   ├── orb.html           # ORB (Object Request Broker) guide
│   └── ...                # Additional guides
├── api/                   # API reference documentation
│   ├── index.html         # API overview
│   └── ...               # Individual API pages
└── examples/              # Code examples and tutorials
    ├── index.html         # Examples overview
    ├── hello-world.html   # Basic Hello World example
    └── ...               # Additional examples
```

## 🎨 Design Features

- **CUSS2 Theme**: Modern dark theme with cyan accents
- **Responsive Design**: Works on desktop, tablet, and mobile
- **TypeScript-First**: Syntax highlighting optimized for TypeScript
- **Fast Loading**: Optimized CSS and minimal JavaScript
- **Accessible**: WCAG 2.1 compliant with keyboard navigation support

## 🚀 Deployment

The site is automatically deployed via GitHub Actions when changes are pushed to the main branch. The workflow:

1. **Trigger**: Push to `master` or `main` branch
2. **Build**: Static files are uploaded as-is (no build step needed)
3. **Deploy**: Files are deployed to GitHub Pages

## 🛠️ Local Development

To preview the site locally:

```bash
# Serve the docs directory
cd docs
python3 -m http.server 8080

# Or use any static server like Deno
deno run --allow-net --allow-read https://deno.land/std/http/file_server.ts docs/

# Or use Node.js http-server
npx http-server docs -p 8080
```

Then visit: http://localhost:8080

## 📝 Content Management

### Adding New Guides

1. Create a new HTML file in `guides/`
2. Follow the existing template structure
3. Add navigation links to `guides/index.html`
4. Update the main navigation if needed

### Adding New Examples

1. Create a new HTML file in `examples/`
2. Use the hello-world.html as a template
3. Include complete, runnable code
4. Add to the examples index page

### Updating API Documentation

1. Add new pages to `api/` directory
2. Follow the TypeScript documentation patterns
3. Include usage examples for each API
4. Update the API index page

## 🎯 Content Guidelines

### Writing Style

- **Concise**: Clear, direct explanations
- **Practical**: Include working code examples
- **Progressive**: Build from simple to complex concepts
- **TypeScript-First**: Show modern TypeScript patterns

### Code Examples

- Always include complete, runnable examples
- Use proper error handling
- Include setup and teardown
- Add explanatory comments
- Test all code samples

### Navigation

- Keep navigation depth reasonable (max 3 levels)
- Use consistent naming conventions
- Provide "breadcrumb" navigation where helpful
- Include "Next Steps" sections

## 🔧 Customization

### Theme Colors

The CUSS2 theme uses CSS custom properties for easy customization:

```css
:root {
  --primary-cyan: #64ffda; /* Main accent color */
  --secondary-blue: #48cae4; /* Secondary accent */
  --dark-navy: #0f0f1e; /* Primary background */
  --dark-purple: #1a1a2e; /* Secondary background */
  --text-primary: #e0e0e0; /* Main text */
  --text-secondary: #a0a0a0; /* Secondary text */
}
```

### Layout Components

- `.container` - Main content wrapper
- `.grid`, `.grid-2`, `.grid-3` - Responsive grid layouts
- `.panel` - Content containers with theme styling
- `.feature-card` - Cards for features/highlights
- `.code-block` - Syntax-highlighted code blocks

## 🐛 Issues and Contributions

- Report documentation issues: [GitHub Issues](https://github.com/elevationai/CORBA-ts/issues)
- Suggest improvements: [GitHub Discussions](https://github.com/elevationai/CORBA-ts/discussions)
- Submit changes: [Pull Requests](https://github.com/elevationai/CORBA-ts/pulls)

## 📄 License

This documentation is part of the CORBA.ts project and is licensed under the MIT License.
