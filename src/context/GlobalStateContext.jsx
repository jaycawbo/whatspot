import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const GlobalStateContext = createContext();

const initialFilters = {
  openNow: false,
  priceLevels: [],
  cuisines: [],
  radius: 3,
};

function getInitialState() {
  const anonymousId = localStorage.getItem('whatspot_anonymous_id') || uuidv4();
  localStorage.setItem('whatspot_anonymous_id', anonymousId);

  const savedLocation = localStorage.getItem('whatspot_user_location');
  const location = savedLocation
    ? JSON.parse(savedLocation)
    : { lat: 43.6532, lon: -79.3832 };

  const locationName =
    localStorage.getItem('whatspot_location_name') || 'Toronto, Ontario, Canada';

  const history = JSON.parse(localStorage.getItem('whatspot_search_history') || '[]');

  return {
    mode: 'pre-search',
    query: '',
    category: null,
    tileBaseQuery: null,
    chips: [],
    suggestedChips: [],
    sort: 'relevance',
    view: 'list',
    userLocation: location,
    locationName,
    filters: initialFilters,
    anonymousId,
    searchHistory: history,
    results: [],
    pagination: null,
    appliedRelaxations: [],
    isLoading: false,
    isQuerying: false,
    gated: false,
    relaxationLevel: 0,
    noVenuesAtAll: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.payload };
    case 'SET_CATEGORY':
      return { ...state, category: action.payload };
    case 'SET_TILE_BASE_QUERY':
      return { ...state, tileBaseQuery: action.payload };
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'SET_SORT':
      return { ...state, sort: action.payload };
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case 'SET_LOCATION':
      return {
        ...state,
        userLocation: action.payload.coords,
        locationName: action.payload.name,
      };
    case 'SET_RESULTS':
      return {
        ...state,
        results: action.payload.results,
        pagination: action.payload.pagination,
        suggestedChips: action.payload.suggested_chips || [],
        appliedRelaxations: action.payload.applied_relaxations || [],
        gated: action.payload.gated || false,
        isLoading: false,
        isQuerying: false,
        mode: 'post-search',
      };
    case 'APPEND_RESULTS':
      return {
        ...state,
        results: [...state.results, ...action.payload.results],
        pagination: action.payload.pagination,
        isLoading: false,
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload, isQuerying: action.payload };
    case 'SET_SUGGESTED_CHIPS':
      return { ...state, suggestedChips: action.payload };
    case 'ADD_SEARCH_HISTORY': {
      const entry = action.payload;
      const deduped = state.searchHistory.filter((h) => h.query !== entry.query);
      const updated = [entry, ...deduped].slice(0, 10);
      localStorage.setItem('whatspot_search_history', JSON.stringify(updated));
      return { ...state, searchHistory: updated };
    }
    case 'SET_RELAXATION_LEVEL':
      return { ...state, relaxationLevel: action.payload };
    case 'SET_NO_VENUES':
      return { ...state, noVenuesAtAll: action.payload };
    case 'CLEAR_SEARCH':
      return {
        ...state,
        mode: 'pre-search',
        query: '',
        category: null,
        tileBaseQuery: null,
        chips: [],
        suggestedChips: [],
        results: [],
        pagination: null,
        appliedRelaxations: [],
        relaxationLevel: 0,
        noVenuesAtAll: false,
        gated: false,
        isLoading: false,
        isQuerying: false,
      };
    default:
      return state;
  }
}

export function GlobalStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, getInitialState);

  // Persist location changes
  useEffect(() => {
    localStorage.setItem('whatspot_user_location', JSON.stringify(state.userLocation));
    localStorage.setItem('whatspot_location_name', state.locationName);
  }, [state.userLocation, state.locationName]);

  return (
    <GlobalStateContext.Provider value={{ state, dispatch }}>
      {children}
    </GlobalStateContext.Provider>
  );
}

export function useGlobalState() {
  const context = useContext(GlobalStateContext);
  if (!context) throw new Error('useGlobalState must be used within GlobalStateProvider');
  return context;
}
