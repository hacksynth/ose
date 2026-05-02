import { describe, expect, it } from 'vitest';

import { htmlToText } from '@/lib/utils/html-to-text';

describe('htmlToText', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('');
  });

  it('handles null-like input via nullish coalescing', () => {
    expect(htmlToText(undefined as unknown as string)).toBe('');
  });

  it('passes plain text through unchanged', () => {
    expect(htmlToText('hello world')).toBe('hello world');
  });

  it('strips basic HTML tags', () => {
    expect(htmlToText('<p>hello</p>')).toBe(' hello\n');
  });

  it('converts <br> to newline', () => {
    expect(htmlToText('line1<br>line2')).toBe('line1\nline2');
    expect(htmlToText('line1<br/>line2')).toBe('line1\nline2');
  });

  it('converts </p> to newline', () => {
    expect(htmlToText('<p>para</p>')).toBe(' para\n');
  });

  it('converts <img src> to placeholder', () => {
    expect(htmlToText('<img src="http://example.com/img.png" alt="x">')).toContain(
      '[图片:http://example.com/img.png]'
    );
  });

  it('converts <img src> with single-quoted src to placeholder', () => {
    expect(htmlToText("<img src='pic.jpg'>")).toContain('[图片:pic.jpg]');
  });

  it('decodes &lt; and &gt;', () => {
    // Decoded "< b >" starts with a space so the second-pass tag stripper
    // (which only matches /<[a-zA-Z\/!]...>/) leaves it intact.
    expect(htmlToText('a &lt; b &gt; c')).toBe('a < b > c');
  });

  it('decodes &amp; last — &amp;lt; becomes &lt; not <', () => {
    // Double-encoded: &amp;lt; should yield &lt;, NOT <
    expect(htmlToText('&amp;lt;')).toBe('&lt;');
  });

  it('decodes &amp; to & for normal ampersands', () => {
    expect(htmlToText('a &amp; b')).toBe('a & b');
  });

  it('decodes &quot; and &#39;', () => {
    expect(htmlToText('say &quot;hello&quot; &amp; it&#39;s fine')).toBe(
      "say \"hello\" & it's fine"
    );
  });

  it('decodes &nbsp; to space', () => {
    expect(htmlToText('a&nbsp;b')).toBe('a b');
  });

  // CodeQL alert #1 — incomplete multi-character sanitization
  it('strips tags introduced by &lt;/&gt; entity decoding (second pass)', () => {
    // &lt;script&gt; becomes <script> after entity decode — second pass strips it
    const result = htmlToText('&lt;script&gt;alert()&lt;/script&gt;');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script');
    expect(result).toContain('alert()');
  });

  // CodeQL alerts #2 & #3 — double-escaping / double-unescaping
  it('does not double-unescape &amp;lt; into <', () => {
    const result = htmlToText('&amp;lt;script&amp;gt;alert()&amp;lt;/script&amp;gt;');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script');
  });

  it('strips residual tags in complex mixed content', () => {
    const input =
      '<p>Q: which of <b>these</b> is right?</p><img src="img.png"><br/>Answer: &lt;A&gt; &amp; &lt;B&gt;';
    const result = htmlToText(input);
    // &lt;A&gt; and &lt;B&gt; decode to <A> and <B>; the second pass strips them
    // because they start with a letter — consistent with stripping real HTML tags.
    expect(result).not.toMatch(/<[a-zA-Z]/);
    expect(result).toContain('[图片:img.png]');
    expect(result).toContain('&');
  });
});
