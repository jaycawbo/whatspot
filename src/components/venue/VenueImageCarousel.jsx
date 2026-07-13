import React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from '@/components/ui/dialog';

export default function VenueImageCarousel({ images = [], forceLoading = false }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [expandedEmblaRef, expandedEmblaApi] = useEmblaCarousel({ loop: true });

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    return () => emblaApi.off('select', onSelect);
  }, [emblaApi]);

  React.useEffect(() => {
    if (!expandedEmblaApi) return;
    const onSelect = () => setSelectedIndex(expandedEmblaApi.selectedScrollSnap());
    expandedEmblaApi.on('select', onSelect);
    return () => expandedEmblaApi.off('select', onSelect);
  }, [expandedEmblaApi]);

  // Jump both carousels to the clicked photo the instant the fullscreen view opens/closes,
  // so neither view resets the other's browsing position.
  React.useEffect(() => {
    if (isExpanded) {
      expandedEmblaApi?.scrollTo(selectedIndex, true);
    } else {
      emblaApi?.scrollTo(selectedIndex, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  const srcs = images.length > 0 ? images : ['/placeholder.svg'];
  const [loadedSrcs, setLoadedSrcs] = React.useState(() => new Set());
  const markLoaded = (src) => setLoadedSrcs((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));

  return (
    <div className="relative w-full">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {srcs.map((src, i) => (
            <div key={i} className="relative min-w-0 flex-[0_0_100%]">
              <img
                src={src}
                alt={`Venue photo ${i + 1}`}
                className="h-60 md:h-96 lg:h-[28rem] w-full object-cover bg-muted cursor-pointer"
                loading={i === 0 ? 'eager' : 'lazy'}
                onLoad={() => markLoaded(src)}
                onError={() => markLoaded(src)}
                onClick={() => setIsExpanded(true)}
              />
              {(forceLoading || !loadedSrcs.has(src)) && (
                <>
                  <div className="absolute inset-0 animate-pulse bg-muted-foreground/25" />
                  <div className="absolute inset-0 shimmer-sweep" />
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {srcs.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {srcs.map((_, i) => (
            <button
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === selectedIndex ? 'w-4 bg-background' : 'w-1.5 bg-background/50'
              )}
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}

      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content className="fixed inset-0 z-[1001] flex items-center justify-center bg-black outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
            <DialogTitle className="sr-only">Venue photos</DialogTitle>
            <div className="overflow-hidden w-full h-full" ref={expandedEmblaRef}>
              <div className="flex h-full">
                {srcs.map((src, i) => (
                  <div key={i} className="relative min-w-0 flex-[0_0_100%] h-full flex items-center justify-center">
                    <img src={src} alt={`Venue photo ${i + 1}`} className="max-h-full max-w-full object-contain" />
                  </div>
                ))}
              </div>
            </div>
            {srcs.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
                {srcs.map((_, i) => (
                  <button
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === selectedIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                    )}
                    onClick={() => expandedEmblaApi?.scrollTo(i)}
                    aria-label={`Go to image ${i + 1}`}
                  />
                ))}
              </div>
            )}
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1.5 bg-black/40 text-white opacity-80 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
