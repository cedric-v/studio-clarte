/**
 * Rendu Markdown léger côté client (bulles de chat + vue visuelle du preview).
 * Aucune dépendance externe : headings, listes, code, gras/italique, liens,
 * images CDN, paragraphes. Le contenu est d'abord échappé (anti-XSS).
 */

function escapeHtml(src: string): string {
  return src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(url: string): string {
  const trimmed = url.trim();
  return /^(https?:|mailto:|tel:|#|\/)/i.test(trimmed) ? trimmed : '#';
}

function inline(src: string): string {
  return src
    // images ![alt](url)
    .replace(
      /!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (_m, alt: string, url: string) =>
        `<figure class="md-figure"><img src="${safeUrl(url)}" alt="${alt}" loading="lazy" /><figcaption>${alt}</figcaption></figure>`,
    )
    // liens [text](url)
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_m, text: string, url: string) =>
        `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`,
    )
    // code inline
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // gras
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // italique
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function renderMarkdown(src: string): string {
  const escaped = escapeHtml(src);
  const lines = escaped.split(/\r?\n/);

  const blocks: string[] = [];
  let list: string[] | null = null;
  let ordered: string[] | null = null;
  let code: string[] | null = null;
  let codeLang = '';

  const flushList = () => {
    if (list) {
      blocks.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      list = null;
    }
    if (ordered) {
      blocks.push(`<ol>${ordered.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`);
      ordered = null;
    }
  };
  const flushCode = () => {
    if (code) {
      blocks.push(
        `<pre class="code-fence" data-lang="${codeLang}"><code>${code.join('\n')}</code></pre>`,
      );
      code = null;
    }
  };

  for (const line of lines) {
    // blocs de code ```
    if (line.trimStart().startsWith('```')) {
      if (code) {
        flushCode();
      } else {
        flushList();
        code = [];
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }

    // headings
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length + 1; // # → h2, #### → h5
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    // listes non ordonnées
    if (/^\s*[-•*]\s+/.test(line)) {
      ordered = null;
      list ??= [];
      list.push(line.replace(/^\s*[-•*]\s+/, ''));
      continue;
    }
    // listes ordonnées
    if (/^\s*\d+\.\s+/.test(line)) {
      list = null;
      ordered ??= [];
      ordered.push(line.replace(/^\s*\d+\.\s+/, ''));
      continue;
    }

    if (line.trim() === '') {
      flushList();
      continue;
    }

    flushList();
    blocks.push(`<p>${inline(line.trim())}</p>`);
  }

  flushList();
  flushCode();
  return blocks.join('\n');
}

/**
 * JSON joli + coloration syntaxique minimale (clés, chaînes, nombres, booléens).
 */
export function renderJson(src: string): { html: string; pretty: string } {
  let pretty: string;
  try {
    pretty = JSON.stringify(JSON.parse(src), null, 2);
  } catch {
    pretty = src;
  }
  const escaped = escapeHtml(pretty);
  const highlighted = escaped
    .replace(/(&quot;(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\&])*&quot;)(\s*:)/g, '<span class="tok-key">$1</span>$2')
    .replace(/(&quot;(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\&])*&quot;)(?!\s*:)/g, '<span class="tok-str">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="tok-bool">$1</span>')
    .replace(/\b(null)\b/g, '<span class="tok-null">$1</span>')
    .replace(/\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b/g, '<span class="tok-num">$&</span>');
  return { html: highlighted, pretty };
}
