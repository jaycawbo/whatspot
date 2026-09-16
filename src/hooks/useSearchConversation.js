import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { runConversationalSearch } from '../services/searchOrchestrator'
import { SearchGateError } from '../lib/parseSearchIntent'

// --- Hook ---
// Search requires sign-in and is capped server-side at one search per 4.8h/user
// (admins bypass) — see supabase/functions/_shared/searchQuota.ts (issue #319).
// This hook only reacts to what the server decides; it holds no client-side
// quota of its own, since that was trivially bypassable (cleared localStorage/
// private window) and didn't actually stop anonymous search spend.

export function useSearchConversation() {
  const { isAuthenticated, user } = useAuth()

  const [isSearching, setIsSearching] = useState(false)
  const [authGateOpen, setAuthGateOpen] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const [nextAllowedAt, setNextAllowedAt] = useState(null)
  const [cooldownOpen, setCooldownOpen] = useState(false)

  const clearTimerRef = useRef(null)

  // Auto-clear the block the instant the cooldown actually expires, so the
  // user doesn't need to reload to search again.
  useEffect(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    if (!nextAllowedAt) return

    const msRemaining = new Date(nextAllowedAt).getTime() - Date.now()
    if (msRemaining <= 0) {
      setRateLimited(false)
      setNextAllowedAt(null)
      return
    }
    clearTimerRef.current = setTimeout(() => {
      setRateLimited(false)
      setNextAllowedAt(null)
    }, msRemaining)

    return () => clearTimeout(clearTimerRef.current)
  }, [nextAllowedAt])

  // Derived — blocks the search UI outright for guests or during the cooldown
  const isLimitReached = !isAuthenticated || rateLimited

  function closeAuthGate() {
    setAuthGateOpen(false)
  }

  function closeCooldown() {
    setCooldownOpen(false)
  }

  async function runGatedSearch(rawQuery, userCoordinates, userFilters, locationName = '') {
    if (isSearching) return null

    if (!isAuthenticated) {
      setAuthGateOpen(true)
      return null
    }
    if (rateLimited) {
      setCooldownOpen(true)
      return null
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
    } catch (err) {
      if (err instanceof SearchGateError) {
        if (err.reason === 'auth_required') {
          setAuthGateOpen(true)
        } else if (err.reason === 'rate_limited') {
          setRateLimited(true)
          setNextAllowedAt(err.nextAllowedAt)
          setCooldownOpen(true)
        }
        return null
      }
      return null
    } finally {
      setIsSearching(false)
    }
  }

  // Primary search — stateless per call, no history accumulation
  async function search(rawQuery, userCoordinates, userFilters = {}, locationName = '') {
    return runGatedSearch(rawQuery, userCoordinates, userFilters, locationName)
  }

  // Re-run with new filters — same gate as any other search
  async function searchWithFilters(rawQuery, userCoordinates, userFilters, locationName = '') {
    return runGatedSearch(rawQuery, userCoordinates, userFilters, locationName)
  }

  function resetSession() {
    // the cooldown is server-side and per-user — nothing to reset client-side
  }

  return {
    isLimitReached,
    isSearching,
    authGateOpen,
    closeAuthGate,
    rateLimited,
    nextAllowedAt,
    cooldownOpen,
    closeCooldown,
    search,
    searchWithFilters,
    resetSession,
  }
}
