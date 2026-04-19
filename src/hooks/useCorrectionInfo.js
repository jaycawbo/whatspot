import { useState, useEffect } from 'react';

export function useCorrectionInfo(currentQuery, results) {
  const [correctionInfo, setCorrectionInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when the query changes (new search started)
  useEffect(() => {
    setDismissed(false);
    setCorrectionInfo(null);
  }, [currentQuery]);

  // Read correction info from sessionStorage once results arrive.
  // api.js writes ws_correction_info before returning results, so by the time
  // results cause a re-render here, the value is already present.
  useEffect(() => {
    if (!results?.length) return;
    try {
      const raw = sessionStorage.getItem('ws_correction_info');
      if (raw) {
        const info = JSON.parse(raw);
        if (info.correctionApplied && info.correctedQuery && info.correctedQuery !== info.rawQuery) {
          setCorrectionInfo(info);
          return;
        }
      }
    } catch {}
    setCorrectionInfo(null);
  }, [results]);

  const dismiss = () => {
    setDismissed(true);
    setCorrectionInfo(null);
  };

  return { correctionInfo: dismissed ? null : correctionInfo, dismiss };
}
