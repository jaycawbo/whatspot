import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseTakeoutCsv, MAX_IMPORT_ROWS } from '@/lib/googleListImport';
import { useBroncoSpotLists } from '@/hooks/useBroncoSpotLists';
import { toast } from 'sonner';

// Delay between sequential Places API calls during import — avoids bursting
// the API and keeps the monthly spend-cap circuit breaker meaningful.
const IMPORT_DELAY_MS = 200;

const STATUS_LISTS = ['Favourites', 'Interested', 'Been To', 'Not Interested', "Didn't Like It"];

const STEPS = { PICK: 'pick', PREVIEW: 'preview', IMPORTING: 'importing', DONE: 'done' };
const NEW_LIST_VALUE = '__new__';

function normalize(name) {
  return (name || '').toLowerCase().trim();
}

export default function ImportListDialog({ open, onOpenChange, existingSpots = [], onSaveVenue }) {
  const { lists: customLists, createList, saveVenue: saveToCustomList } = useBroncoSpotLists();

  const [step, setStep] = useState(STEPS.PICK);
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState({ entries: [], truncated: false });
  const [toImport, setToImport] = useState([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState({ imported: [], unmatched: [] });

  // Destination: 'status:<ListName>' | 'custom:<listId>' | '__new__'
  const [destination, setDestination] = useState('status:Interested');
  const [newListName, setNewListName] = useState('');

  const reset = () => {
    setStep(STEPS.PICK);
    setCsvText('');
    setParsed({ entries: [], truncated: false });
    setToImport([]);
    setSkippedCount(0);
    setProgress({ done: 0, total: 0 });
    setResults({ imported: [], unmatched: [] });
    setDestination('status:Interested');
    setNewListName('');
  };

  const handleClose = (o) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFile = async (file) => {
    const text = await file.text();
    setCsvText(text);
  };

  const handleParse = () => {
    const result = parseTakeoutCsv(csvText);
    const existingNames = new Set(existingSpots.map((s) => normalize(s.name)));
    const deduped = result.entries.filter((e) => !existingNames.has(normalize(e.title)));
    setParsed(result);
    setToImport(deduped);
    setSkippedCount(result.entries.length - deduped.length);
    setStep(STEPS.PREVIEW);
  };

  const canImport = toImport.length > 0 && (destination !== NEW_LIST_VALUE || newListName.trim().length > 0);

  const handleImport = async () => {
    setStep(STEPS.IMPORTING);
    setProgress({ done: 0, total: toImport.length });
    const imported = [];
    const unmatched = [];

    // Resolve destination once: create the list up front if needed, then
    // save each imported venue into either a status label or a custom list.
    let statusLabel = null;
    let customListId = null;
    if (destination === NEW_LIST_VALUE) {
      const created = await createList(newListName.trim());
      customListId = created?.id ?? null;
      if (!customListId) {
        toast.error("Couldn't create the new list — import cancelled");
        setStep(STEPS.PREVIEW);
        return;
      }
    } else if (destination.startsWith('custom:')) {
      customListId = destination.slice('custom:'.length);
    } else if (destination.startsWith('status:')) {
      statusLabel = destination.slice('status:'.length);
    }

    for (const entry of toImport) {
      try {
        const { data, error } = await supabase.functions.invoke('search-google-place', {
          body: { venue_name: entry.title, lat: entry.lat, lon: entry.lon, register: true },
        });
        if (error || !data?.success) {
          unmatched.push(entry.title);
        } else if (customListId) {
          await saveToCustomList(
            { id: data.venue_id, name: data.name, google_place_id: data.place_id },
            customListId
          );
          imported.push(data.name || entry.title);
        } else {
          await onSaveVenue({ place_id: data.place_id, name: data.name }, statusLabel);
          imported.push(data.name || entry.title);
        }
      } catch {
        unmatched.push(entry.title);
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      await new Promise((r) => setTimeout(r, IMPORT_DELAY_MS));
    }

    setResults({ imported, unmatched });
    setStep(STEPS.DONE);
    if (imported.length > 0) toast.success(`Imported ${imported.length} venue${imported.length === 1 ? '' : 's'}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import from Google Maps</DialogTitle>
        </DialogHeader>

        {step === STEPS.PICK && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Export a saved list from Google Takeout (Maps → your places) and upload the CSV file here.
            </p>
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 cursor-pointer hover:bg-accent transition-colors">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Choose a .csv file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
            {csvText && (
              <Button className="w-full" onClick={handleParse}>Parse file</Button>
            )}
          </div>
        )}

        {step === STEPS.PREVIEW && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Found <span className="font-medium">{parsed.entries.length}</span> place{parsed.entries.length === 1 ? '' : 's'} in this list.
            </p>
            {skippedCount > 0 && (
              <p className="text-xs text-muted-foreground">{skippedCount} already in your Spots — will be skipped.</p>
            )}
            {parsed.truncated && (
              <p className="text-xs text-amber-600">
                This list has more than {MAX_IMPORT_ROWS} places. Only the first {MAX_IMPORT_ROWS} will be imported — split larger lists into multiple exports.
              </p>
            )}

            {toImport.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Add to</label>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background"
                >
                  <optgroup label="Status">
                    {STATUS_LISTS.map((l) => (
                      <option key={l} value={`status:${l}`}>{l}</option>
                    ))}
                  </optgroup>
                  {customLists.length > 0 && (
                    <optgroup label="Your lists">
                      {customLists.map((l) => (
                        <option key={l.id} value={`custom:${l.id}`}>{l.name}</option>
                      ))}
                    </optgroup>
                  )}
                  <option value={NEW_LIST_VALUE}>+ Create new list</option>
                </select>
                {destination === NEW_LIST_VALUE && (
                  <input
                    autoFocus
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="New list name"
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            )}

            {toImport.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing new to import.</p>
            ) : (
              <Button className="w-full" onClick={handleImport} disabled={!canImport}>
                Import {toImport.length} place{toImport.length === 1 ? '' : 's'}
              </Button>
            )}
          </div>
        )}

        {step === STEPS.IMPORTING && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground text-center">
              Importing {progress.done} / {progress.total}…
            </p>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-foreground transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {step === STEPS.DONE && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Imported {results.imported.length} of {toImport.length} place{toImport.length === 1 ? '' : 's'}.
            </p>
            {results.unmatched.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Couldn't find a match for:</p>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                  {results.unmatched.map((name, i) => <li key={i}>{name}</li>)}
                </ul>
              </div>
            )}
            <Button className="w-full" onClick={() => handleClose(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
