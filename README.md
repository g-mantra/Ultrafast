# UltraFast Whitepaper

The canonical source is `whitepaper.md` (GitHub-flavoured Markdown with KaTeX
math and a Mermaid architecture diagram). A pre-rendered `whitepaper.pdf`
lives next to it.

## Why render to PDF?

GitHub's Markdown viewer renders the math and Mermaid diagram, but most other
Markdown viewers do not. The PDF is the portable, self-contained format for:

- Sharing the whitepaper with people who don't read it on GitHub
- Printed copies and offline reading
- Anywhere the inline `$...$` math or the `flowchart TB` diagram needs to
  appear typeset rather than as raw source

## Building the PDF

Requires Node.js (any recent LTS).

```bash
cd build
npm install            # first time only
npx md-to-pdf --config-file config.js ../whitepaper.md
```

The output `whitepaper.pdf` is written next to `whitepaper.md`.

The render uses [`md-to-pdf`](https://github.com/simonhaenisch/md-to-pdf)
with a config that wires in KaTeX (for math) and Mermaid (for the diagram)
via headless Chromium - no LaTeX toolchain required. See `build/config.js`
for the exact stylesheet, scripts, and page options.
