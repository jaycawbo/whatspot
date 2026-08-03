import { useMemo } from 'react';
import { useSpots } from '@/hooks/useSpots';
import { useBroncoSpotLists } from '@/hooks/useBroncoSpotLists';
import { useStatusListSettings } from '@/hooks/useStatusListSettings';
import { VISIBLE_LISTS, HIDDEN_LISTS, LIST_MATCHER, STATUS_LIST_TO_SLUG } from '@/lib/spotListConstants';

// Up to 4 preview photos, one per venue (not 4 photos of a single venue) —
// matches the mosaic tile spec of "4 images from 4 venues".
function previewPhotosFor(venues) {
  return venues
    .slice(0, 4)
    .map((v) => v.photo_urls?.[0] || v.photo_url)
    .filter(Boolean);
}

export function useSpotListsOverview() {
  const { spots, isLoading: spotsLoading } = useSpots();
  const { lists: customLists, isLoading: customLoading, toggleListVisibility } = useBroncoSpotLists();
  const { settingsByListKey, ensureShareLink, toggleVisibility: toggleStatusVisibility } = useStatusListSettings();

  const buildStatusTile = (listKey) => {
    const matcher = LIST_MATCHER[listKey];
    const listSpots = matcher ? spots.filter(matcher) : [];
    const settings = settingsByListKey[listKey];
    return {
      id: listKey,
      kind: 'status',
      slug: STATUS_LIST_TO_SLUG[listKey],
      name: listKey,
      spotCount: listSpots.length,
      previewPhotoUrls: previewPhotosFor(listSpots),
      isPublic: settings ? settings.is_public : true,
      shareToken: settings?.share_token ?? null,
    };
  };

  const buildCustomTile = (list) => ({
    id: list.id,
    kind: 'custom',
    slug: list.id,
    name: list.name,
    spotCount: list.items.length,
    previewPhotoUrls: previewPhotosFor(list.items.map((i) => i.venue).filter(Boolean)),
    isPublic: list.is_public,
    shareToken: list.share_token,
  });

  const visibleTiles = useMemo(() => [
    ...VISIBLE_LISTS.map(buildStatusTile),
    ...customLists.map(buildCustomTile),
  ], [spots, customLists, settingsByListKey]);

  const hiddenTiles = useMemo(
    () => HIDDEN_LISTS.map(buildStatusTile),
    [spots, settingsByListKey]
  );

  return {
    visibleTiles,
    hiddenTiles,
    isLoading: spotsLoading || customLoading,
    ensureShareLink,
    toggleStatusVisibility,
    toggleListVisibility,
  };
}
