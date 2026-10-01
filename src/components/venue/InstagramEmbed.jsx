import React from 'react';
import { ExternalLink } from 'lucide-react';

// One Instagram post via the official blockquote pattern (the same markup
// oEmbed returns), built from React elements. embed.js later swaps the
// blockquote for an iframe, so the outer div is the node React owns: it stays
// stable and is what React removes on unmount.
//
// `permalink` must already be canonical output from parsePermalink.
export default function InstagramEmbed({ permalink, failed }) {
  if (failed) {
    return (
      <a
        href={permalink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
      >
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
        View on Instagram
      </a>
    );
  }

  return (
    <div className="flex justify-center">
      <blockquote
        className="instagram-media"
        data-instgrm-permalink={permalink}
        data-instgrm-version="14"
        style={{ margin: 0, width: '100%', minWidth: 0, maxWidth: 540 }}
      >
        <a
          href={permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground underline"
        >
          View this post on Instagram
        </a>
      </blockquote>
    </div>
  );
}
