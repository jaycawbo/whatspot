import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { runConversationalSearch } from '../services/searchOrchestrator'

const GUEST_SEARCH_LIMIT    = 5
const GUEST_SEARCH_COUNT_KEY = 'ws_guest_searches'

// --- sessionStorage helpers ---

function readGuestSearchCount() {
  try {
    return parseInt(sessionStorage.getItem(GUEST_SEARCH_COUNT_KEY) || '0', 10) || 0
  } catch {
    return 0
  }
}

function writeGuestSearchCount(n) {
  try {
    sessionStorage.setItem(GUEST_SEARCH_COUNT_KEY, String(n))
  } catch {}
}

function clearGuestSearchCount() {
  try {
    sessionStorage.removeItem(GUEST_SEARCH_COUNT_KEY)
  } catch {}
}

// --- Hook ---

export function useSearchConversation() {
  const { isAuthenticated, user } = useAuth()

  const [guestSearchCount, setGuestSearchCount] = useState(0)
  const [isSearching, setIsSearching] = useState(false)

  const prevIsAuthRef = useRef(isAuthenticated)

  // Derived
  const isLimitReached = !isAuthenticated && guestSearchCount >= GUEST_SEARCH_LIMIT

  // Sync guest count from sessionStorage; clear on login
  useEffect(() => {
    const wasAuth = prevIsAuthRef.current
    prevIsAuthRef.current = isAuthenticated

    if (!isAuthenticated) {
      setGuestSearchCount(readGuestSearchCount())
    } else if (!wasAuth && isAuthenticated) {
      // User just logged in — clear any guest count
      setGuestSearchCount(0)
      clearGuestSearchCount()
    }
  }, [isAuthenticated])

  // Primary search — stateless per call, no history accumulation
  async function search(rawQuery, userCoordinates, userFilters = {}, locationName = '') {
    if (isSearching) return null
    if (isLimitReached) return null

    // Gate guest searches
    if (!isAuthenticated) {
      const count = readGuestSearchCount()
      if (count >= GUEST_SEARCH_LIMIT) {
        setGuestSearchCount(count)
        return null
      }
      const next = count + 1
      writeGuestSearchCount(next)
      setGuestSearchCount(next)
    }

    setIsSearching(true)
    try {
      return await runConversationalSearch({
        rawQuery,
        userCoordinates,
        conversationHistory: [],
        userId: user?.id ?? null,
        userFilters,
        locationName,
      })
    } catch {
      return null
    } finally {
      setIsSearching(false)
    }
  }

  // Re-run with new filters — counts against guest quota like any other search
  async function searchWithFilters(rawQuery, userCoordinates, userFilters, locationName = '') {
    if (isSearching) return null
    if (isLimitReached) return null

    if (!isAuthenticated) {
      const count = readGuestSearchCount()
      if (count >= GUEST_SEARCH_LIMIT) {
        setGuestSearchCount(count)
        return null
      }
      const next = count + 1
      writeGuestSearchCount(next)
      setGuestSearchCount(next)
    }

    setIsSearching(true)
    try {
      return await runConversationalSearch({
        rawQuery,
        userCoordinates,
        conversationHistory: [],
        userId: user?.id ?? null,
        userFilters,
        locationName,
      })
    } catch {
      return null
    } finally {
      setIsSearching(false)
    }
  }

  function resetSession() {
    // guest search count intentionally not reset — cap persists for the browser session
  }

  return {
    isLimitReached,
    isSearching,
    search,
    searchWithFilters,
    resetSession,
  }
}
