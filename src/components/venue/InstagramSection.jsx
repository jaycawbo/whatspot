import React, { useEffect, useRef, useState } from 'react';
import { Instagram } from 'lucide-react';
import { useVenueInstagram } from '@/hooks/useVenueInstagram';
import { instagramProfileUrl } from '@/lib/social/instagram';
import { loadInstagramEmbedScript, processInstagramEmbeds } from '@/lib/social/instagramEmbedScript';
import InstagramEmbed from '@/components/venue/InstagramEmbed';

// Instagram profile link + up to 3 post embeds for the venue detail view.
// Renders nothing while loading or when the venue has no valid handle/posts.
// embed.js is only requested once this section nears the viewport.
export default function InstagramSection({ placeId }) {
  const { handle, posts, loading } = useVenueInstagram(placeId);
  const sectionRef = useRef(null);
  const [scriptState, setScriptState] = useState('idle'); // idle | ready | failed

  const hasPosts = posts.length > 0;
  const postsKey = posts.map((p) => p.shortcode).join(',');

  // Lazy-load embed.js when the section is within ~400px of the viewport
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !hasPosts || scriptState !== 'idle') return;

    let cancelled = false;
    const load = () => {
      loadInstagramEmbedScript()
        .then(() => !cancelled && setScriptState('ready'))
        .catch((err) => {
          console.warn('Instagram embeds unavailable, showing links:', err?.message);
          if (!cancelled) setScriptState('failed');
        });
    };

    if (typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [hasPosts, scriptState]);

  // Convert blockquotes to iframes after mount and whenever the post set changes
  useEffect(() => {
    if (scriptState === 'ready' && hasPosts) processInstagramEmbeds();
  }, [scriptState, hasPosts, postsKey]);

  const profileUrl = instagramProfileUrl(handle);
  if (loading || (!profileUrl && !hasPosts)) return null;

  return (
    <section ref={sectionRef} className="space-y-3 pt-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Instagram</h2>
        {profileUrl && (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-foreground hover:bg-muted"
          >
            <Instagram className="h-4 w-4" />
            @{handle}
          </a>
        )}
      </div>
      {hasPosts && (
        <div className="space-y-3">
          {posts.map((post) => (
            <InstagramEmbed key={post.shortcode} permalink={post.permalink} failed={scriptState === 'failed'} />
          ))}
        </div>
      )}
    </section>
  );
}
