import React, { createContext, useContext, useState } from 'react';

const BroncoContext = createContext(null);

export function BroncoProvider({ children }) {
  const [requestModalVenue, setRequestModalVenue] = useState(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  // Tray drag state — set by ResultsBottomSheet so the floating pill can respond
  const [isTrayDragging, setTrayDragging] = useState(false);
  const [traySnapHeightPx, setTraySnapHeight] = useState(0);

  return (
    <BroncoContext.Provider value={{
      requestModalVenue,
      openRequestModal: (venue) => setRequestModalVenue(venue),
      closeRequestModal: () => setRequestModalVenue(null),
      overlayOpen,
      openOverlay: () => setOverlayOpen(true),
      closeOverlay: () => setOverlayOpen(false),
      isTrayDragging,
      setTrayDragging,
      traySnapHeightPx,
      setTraySnapHeight,
    }}>
      {children}
    </BroncoContext.Provider>
  );
}

export function useBronco() {
  const ctx = useContext(BroncoContext);
  if (!ctx) throw new Error('useBronco must be used inside BroncoProvider');
  return ctx;
}
