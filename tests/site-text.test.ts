import { describe, it, expect } from 'vitest';
import { pageText } from '../src/lib/site-text';

describe('site text from Apify markdown', () => {
  it('keeps words, drops images and link targets, and labels like the discovery crawl', () => {
    const text = pageText('https://brand.example/', {
      markdown: '# THEKUA\n\n![A thekua](https://x/img.png)\n\nHandmade in **Mithila**. [Shop now](https://brand.example/shop)',
      metadata: { title: 'Buy Thekua', description: 'Fresh from Mithila', url: 'https://brand.example/' },
    });
    expect(text).toBe(
      'Page: https://brand.example/\nTitle: Buy Thekua\nDescription: Fresh from Mithila\nText: THEKUA Handmade in Mithila. Shop now',
    );
  });
  it('returns nothing for an empty page and caps long pages', () => {
    expect(pageText('https://a.example/', undefined)).toBe('');
    expect(pageText('https://a.example/', { markdown: '' })).toBe('');
    expect(pageText('https://a.example/', { markdown: 'word '.repeat(5000) }).length).toBe(6000);
  });
});
