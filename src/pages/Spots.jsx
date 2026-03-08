import React from 'react';
import Header from '@/components/home/Header';

export default function Spots() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-14 px-4 md:px-8 py-8">
        <h1 className="text-2xl font-bold text-foreground">My Spots</h1>
        <p className="text-muted-foreground mt-2">Your saved spots will appear here.</p>
      </div>
    </div>
  );
}
