import React, { useState } from 'react';
import Header from '@/components/home/Header';
import { useSpots } from '@/hooks/useSpots';
import { useSpotListsOverview } from '@/hooks/useSpotListsOverview';
import ListMosaic from '@/components/spots/ListMosaic';
import ListEditDialog from '@/components/spots/ListEditDialog';
import ImportListDialog from '@/components/spots/ImportListDialog';
import AuthModal from '@/components/auth/AuthModal';
import { Button } from '@/components/ui/button';
import { Upload, Heart } from 'lucide-react';

export default function Spots() {
  const { spots, saveSpot, isAuthenticated } = useSpots();
  const overview = useSpotListsOverview();

  const [editingTile, setEditingTile] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="pt-14 px-4 md:px-8 lg:px-12 py-6 max-w-4xl mx-auto space-y-4">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Spots</h1>
            {isAuthenticated && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {spots.length} {spots.length === 1 ? 'spot' : 'spots'} saved
              </p>
            )}
          </div>
          {isAuthenticated && (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1.5" />
              Import
            </Button>
          )}
        </div>

        {/* Unauthenticated */}
        {!isAuthenticated && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Heart className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Sign in to save and view your Spots</h2>
              <p className="text-sm text-muted-foreground mt-1">Keep track of everywhere you've been and want to go.</p>
            </div>
            <Button onClick={() => setAuthModalOpen(true)}>Sign in with Google</Button>
          </div>
        )}

        {isAuthenticated && !overview.isLoading && (
          <ListMosaic
            visibleTiles={overview.visibleTiles}
            hiddenTiles={overview.hiddenTiles}
            onEdit={setEditingTile}
          />
        )}
      </div>

      <ListEditDialog
        tile={editingTile}
        onOpenChange={(open) => { if (!open) setEditingTile(null); }}
        ensureShareLink={overview.ensureShareLink}
        toggleStatusVisibility={overview.toggleStatusVisibility}
        toggleListVisibility={overview.toggleListVisibility}
      />
      <ImportListDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingSpots={spots}
        onSaveVenue={(venue, label) => saveSpot({ venue, labels: [label || 'Interested'] })}
      />
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </div>
  );
}
