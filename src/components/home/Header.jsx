import React, { useState } from 'react';
import { MapPin, Heart, ChevronDown, X, User, LogOut } from 'lucide-react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link, useNavigate } from 'react-router-dom';
import WhatspotLogo from '@/components/brand/WhatspotLogo';
import LocationSearch from '@/components/home/LocationSearch';
import AuthModal from '@/components/auth/AuthModal';

export default function Header() {
  const { state, dispatch } = useGlobalState();
  const { user, isAuthenticated, signOut } = useAuth();
  const [editingLocation, setEditingLocation] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleLocationSelect = ({ name, coords }) => {
    dispatch({
      type: 'SET_LOCATION',
      payload: {
        coords: coords || state.userLocation,
        name,
      },
    });
    setEditingLocation(false);
  };

  const handleLogoClick = (e) => {
    e.preventDefault();
    dispatch({ type: 'CLEAR_SEARCH' });
    navigate('/');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const userInitials = user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-background border-b border-border flex items-center px-4 md:px-8">
      {/* Left: Location */}
      <div className="flex items-center min-w-0 flex-1">
        {editingLocation ? (
          <LocationSearch
            currentName={state.locationName}
            onLocationSelect={handleLocationSelect}
            onClose={() => setEditingLocation(false)}
          />
        ) : (
          <button
            onClick={() => setEditingLocation(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors max-w-[200px] truncate"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{state.locationName}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>
        )}
      </div>

      {/* Center: Logo — only in post-search */}
      {state.mode === 'post-search' && (
        <div className="flex items-center justify-center">
          <a href="/" onClick={handleLogoClick} className="flex items-center">
            <img src={whatspotLogo} alt="Whatspot" className="h-7" />
          </a>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center justify-end flex-1 gap-2">
        {state.mode === 'post-search' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => dispatch({ type: 'CLEAR_SEARCH' })}
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        <Link to="/Spots" className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
          <Heart className="h-5 w-5" />
        </Link>

        {isAuthenticated ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user?.user_metadata?.avatar_url} />
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAuthModalOpen(true)}>
            Sign in
          </Button>
        )}
      </div>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </header>
  );
}
