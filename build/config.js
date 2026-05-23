module.exports = {
  stylesheet: [
    'https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.css',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
  ],
  script: [
    { url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js' },
    { url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js' },
    { url: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js' },
    {
      content: `
        document.querySelectorAll('pre code.language-mermaid').forEach((el) => {
          const div = document.createElement('div');
          div.className = 'mermaid';
          div.textContent = el.textContent;
          el.parentElement.replaceWith(div);
        });
        renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$',  right: '$',  display: false },
          ],
          throwOnError: false,
        });
        mermaid.initialize({ startOnLoad: false, theme: 'default', flowchart: { useMaxWidth: true } });
        window.__mermaidDone = mermaid.run();
      `,
    },
  ],
  body_class: ['markdown-body'],
  css: `
    .markdown-body { box-sizing: border-box; max-width: 880px; margin: 0 auto; padding: 24px; font-size: 11pt; }
    .markdown-body pre { page-break-inside: avoid; }
    .markdown-body table { page-break-inside: avoid; }
    .mermaid { text-align: center; page-break-inside: avoid; }
    .mermaid svg { max-width: 100%; height: auto; }
    h1, h2, h3 { page-break-after: avoid; }
    @page { size: A4; margin: 18mm; }
  `,
  pdf_options: {
    format: 'A4',
    margin: { top: '18mm', right: '18mm', bottom: '20mm', left: '18mm' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="font-size:8pt;width:100%;text-align:center;color:#888;">' +
      '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  },
  launch_options: { args: ['--no-sandbox'] },
  marked_options: { gfm: true },
};
