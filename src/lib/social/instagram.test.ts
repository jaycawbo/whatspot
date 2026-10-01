import { describe, it, expect } from 'vitest';
import { normalizeHandle, parsePermalink, instagramProfileUrl } from '@/lib/social/instagram';

describe('normalizeHandle', () => {
  it.each([
    ['whatspot', 'whatspot'],
    ['@whatspot', 'whatspot'],
    ['  @WhatSpot.TO_  ', 'whatspot.to_'],
    ['instagram.com/whatspot', 'whatspot'],
    ['www.instagram.com/whatspot/', 'whatspot'],
    ['https://www.instagram.com/whatspot/', 'whatspot'],
    ['http://instagram.com/whatspot?hl=en', 'whatspot'],
    ['https://www.instagram.com/whatspot/#top', 'whatspot'],
    ['a'.repeat(30), 'a'.repeat(30)],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeHandle(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    '@',
    'a'.repeat(31),
    'white space',
    'hyphen-name',
    'emoji😀',
    '@@double',
    'https://www.instagram.com/p/Cabc123/',
    'https://www.instagram.com/',
    'https://evil.com/whatspot',
    'https://instagram.com.evil.com/whatspot',
    'javascript:alert(1)',
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    'whatspot/../admin',
  ])('rejects %s', (input) => {
    expect(normalizeHandle(input)).toBeNull();
  });

  it('rejects non-strings', () => {
    for (const v of [null, undefined, 42, {}, [], true]) {
      expect(normalizeHandle(v as unknown as string)).toBeNull();
    }
  });
});

describe('instagramProfileUrl', () => {
  it('builds a profile url from a valid handle', () => {
    expect(instagramProfileUrl('@WhatSpot')).toBe('https://www.instagram.com/whatspot/');
  });
  it('returns null for an invalid handle', () => {
    expect(instagramProfileUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('parsePermalink', () => {
  it.each([
    ['https://www.instagram.com/p/Cabc123_-X/', 'p', 'Cabc123_-X'],
    ['https://www.instagram.com/reel/Cxyz789/', 'reel', 'Cxyz789'],
    ['https://www.instagram.com/tv/B1tv/', 'tv', 'B1tv'],
    ['https://www.instagram.com/p/Cabc123', 'p', 'Cabc123'],
    ['https://www.instagram.com/p/Cabc123/?utm_source=ig_web_copy_link', 'p', 'Cabc123'],
    ['https://www.instagram.com/p/Cabc123/?igsh=abc#comments', 'p', 'Cabc123'],
    ['  https://www.instagram.com/p/Cabc123/  ', 'p', 'Cabc123'],
    ['HTTPS://WWW.INSTAGRAM.COM/p/Cabc123/', 'p', 'Cabc123'],
  ])('accepts %s', (input, type, shortcode) => {
    expect(parsePermalink(input)).toEqual({
      permalink: `https://www.instagram.com/${type}/${shortcode}/`,
      shortcode,
    });
  });

  it.each([
    // wrong scheme
    'http://www.instagram.com/p/Cabc123/',
    'javascript:alert(1)',
    'javascript://www.instagram.com/p/Cabc123/%0Aalert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://www.instagram.com/p/Cabc123/',
    '//www.instagram.com/p/Cabc123/',
    // wrong or lookalike host
    'https://instagram.com/p/Cabc123/',
    'https://m.instagram.com/p/Cabc123/',
    'https://www.instagram.com.evil.com/p/Cabc123/',
    'https://evil.com/www.instagram.com/p/Cabc123/',
    'https://www.instagrarn.com/p/Cabc123/',
    'https://www.lnstagram.com/p/Cabc123/',
    'https://www.іnstagram.com/p/Cabc123/', // Cyrillic і
    'https://evil.com/?u=https://www.instagram.com/p/Cabc123/',
    // credentials / port
    'https://user@www.instagram.com/p/Cabc123/',
    'https://user:pass@www.instagram.com/p/Cabc123/',
    'https://www.instagram.com:8443/p/Cabc123/',
    // wrong paths
    'https://www.instagram.com/',
    'https://www.instagram.com/whatspot/',
    'https://www.instagram.com/p/',
    'https://www.instagram.com/reels/Cabc123/',
    'https://www.instagram.com/stories/whatspot/123/',
    'https://www.instagram.com/p/Cabc123/embed/',
    'https://www.instagram.com/p/../../evil/',
    'https://www.instagram.com/p/Cab%3Cscript%3E/',
    'https://www.instagram.com/p/<script>alert(1)</script>/',
    `https://www.instagram.com/p/${'a'.repeat(65)}/`,
    // not a URL
    '',
    'Cabc123',
    '<script>alert(1)</script>',
    `https://www.instagram.com/p/Cabc123/?${'x'.repeat(2100)}`,
  ])('rejects %s', (input) => {
    expect(parsePermalink(input)).toBeNull();
  });

  it('rejects non-strings', () => {
    for (const v of [null, undefined, 42, {}, [], true]) {
      expect(parsePermalink(v as unknown as string)).toBeNull();
    }
  });
});
