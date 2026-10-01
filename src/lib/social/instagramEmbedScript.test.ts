import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  INSTAGRAM_EMBED_SCRIPT_SRC,
  loadInstagramEmbedScript,
  processInstagramEmbeds,
  __resetInstagramEmbedScriptForTests,
} from '@/lib/social/instagramEmbedScript';

type InstgrmWindow = Window & { instgrm?: { Embeds: { process: () => void } } };
const win = () => window as InstgrmWindow;

const scripts = () =>
  Array.from(document.querySelectorAll('script')).filter((s) => s.src === INSTAGRAM_EMBED_SCRIPT_SRC);

describe('loadInstagramEmbedScript', () => {
  beforeEach(() => {
    __resetInstagramEmbedScriptForTests();
    scripts().forEach((s) => s.remove());
    delete win().instgrm;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('injects a single script tag across repeat calls', async () => {
    const a = loadInstagramEmbedScript();
    const b = loadInstagramEmbedScript();
    expect(a).toBe(b);
    expect(scripts()).toHaveLength(1);

    win().instgrm = { Embeds: { process: vi.fn() } };
    scripts()[0].dispatchEvent(new Event('load'));
    await expect(a).resolves.toBeUndefined();
    expect(scripts()).toHaveLength(1);
  });

  it('rejects when the script errors, and caches the failure', async () => {
    const p = loadInstagramEmbedScript();
    scripts()[0].dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow();
    await expect(loadInstagramEmbedScript()).rejects.toThrow();
    expect(scripts()).toHaveLength(1);
  });

  it('rejects when the script loads but instgrm is missing (blocked stub)', async () => {
    const p = loadInstagramEmbedScript();
    scripts()[0].dispatchEvent(new Event('load'));
    await expect(p).rejects.toThrow();
  });

  it('rejects after a timeout', async () => {
    vi.useFakeTimers();
    const p = loadInstagramEmbedScript();
    const assertion = expect(p).rejects.toThrow(/timed out/);
    vi.advanceTimersByTime(8000);
    await assertion;
  });

  it('resolves immediately when instgrm already exists', async () => {
    win().instgrm = { Embeds: { process: vi.fn() } };
    await expect(loadInstagramEmbedScript()).resolves.toBeUndefined();
    expect(scripts()).toHaveLength(0);
  });
});

describe('processInstagramEmbeds', () => {
  beforeEach(() => {
    delete win().instgrm;
  });

  it('is a no-op without instgrm', () => {
    expect(() => processInstagramEmbeds()).not.toThrow();
  });

  it('calls instgrm.Embeds.process and swallows its errors', () => {
    const process = vi.fn(() => {
      throw new Error('boom');
    });
    win().instgrm = { Embeds: { process } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => processInstagramEmbeds()).not.toThrow();
    expect(process).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
