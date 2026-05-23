# UltraFast Whitepaper

The canonical source is `whitepaper.md` (GitHub-flavoured Markdown with KaTeX
math and a Mermaid architecture diagram). A pre-rendered `whitepaper.pdf`
lives next to it.

## Where to start

- [whitepaper.md](whitepaper.md) — the full technical specification of the UltraFast L1, for readers who want the consensus, execution, and matching design in depth.
- [litepaper.md](litepaper.md) — a shorter, prose-first overview of what UltraFast is and why it exists, for readers who want the pitch before the protocol details.
- [stack/README.md](stack/README.md) — an index of deep-research notes on every external technology the whitepaper references, for readers who want to understand the building blocks behind each design choice.

## Why render to PDF?

The main reason is to view the mathematical notation correctly. Most Markdown
viewers render `$...$` math as raw source rather than typeset formulae, and
the same is true for the `flowchart TB` Mermaid diagram. The PDF is the
portable, self-contained format that renders both — useful for sharing with
people who don't read it on GitHub, for printed copies, and for offline
reading.

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
