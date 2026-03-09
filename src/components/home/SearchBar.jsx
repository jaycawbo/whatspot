import React, { useRef } from 'react';
import { Search, X, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SearchBar({ query, onQueryChange, onSearch, isQuerying, onStopQuery, centered }) {
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'w-full transition-all duration-300',
        centered ? 'max-w-xl mx-auto' : 'max-w-3xl'
      )}>
      
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}

          className="w-full h-11 pl-10 pr-10 rounded-full border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background transition-shadow" placeholder="Ask and you shall receive..." />
        
        {isQuerying ?
        <button
          type="button"
          onClick={onStopQuery}
          className="absolute right-2 h-7 w-7 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">
          
            <X className="h-3.5 w-3.5" />
          </button> :
        query.trim() ?
        <button
          type="submit"
          className="absolute right-2 h-7 w-7 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          
            <Search className="h-3.5 w-3.5" />
          </button> :
        null}
      </div>
    </form>);

}