/**
 * Converts an HTML string to plain text suitable for AI context/prompts.
 *
 * Safety properties:
 *  - Two-pass tag stripping: once before and once after entity decoding,
 *    so entities like &lt;script&gt; cannot survive as tags in the output.
 *  - Second pass uses /<[a-zA-Z\/!][^>]*>/g so only valid tag starters are
 *    stripped; decoded text like "< b >" (space-leading) is preserved as-is.
 *  - &amp; is decoded last, preventing double-unescaping of sequences like
 *    &amp;lt; (which would otherwise become < via &amp;→& then &lt;→<).
 *  - <img> src is preserved as a [图片:URL] placeholder.
 */
export function htmlToText(html: string): string {
  return (html ?? '')
    .replace(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)["']?[^>]*>/gi, ' [图片:$1] ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/<[a-zA-Z\/!][^>]*>/g, ' ');
}
