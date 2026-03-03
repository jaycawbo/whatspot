import React from 'react';
import { List, Map } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function ViewToggle({ view, setView }) {
  return (
    <div className="flex items-center border border-border rounded-lg overflow-hidden">
      <Button
        variant="ghost"
        size="sm"
        className={cn('rounded-none h-8 px-2', view === 'list' && 'bg-accent')}
        onClick={() => setView('list')}
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn('rounded-none h-8 px-2', view === 'map' && 'bg-accent')}
        onClick={() => setView('map')}
      >
        <Map className="h-4 w-4" />
      </Button>
    </div>
  );
}
