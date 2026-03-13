import React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { cn } from '@/lib/utils';

export default function VenueImageCarousel({ images = [] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    return () => emblaApi.off('select', onSelect);
  }, [emblaApi]);

  const srcs = images.length > 0 ? images : ['/placeholder.svg'];

  return (
    <div className="relative w-full">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {srcs.map((src, i) => (
            <div key={i} className="min-w-0 flex-[0_0_100%]">
              <img
                src={src}
                alt={`Venue photo ${i + 1}`}
                className="h-60 w-full object-cover bg-muted"
                loading={i === 0 ? 'eager' : 'lazy'}
              />
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
    </div>
  );
}
