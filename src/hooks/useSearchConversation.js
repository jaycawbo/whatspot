import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../lib/AuthContext'
import { runConversationalSearch } from '../services/searchOrchestrator'
import { SearchGateError } from '../lib/parseSearchIntent'

// --- Hook ---
// Search requires sign-in and is capped server-side at 5/day/user (admins
// bypass) — see supabase/functions/_shared/searchQuota.ts (issue #319). This
// hook only reacts to what the server decides; it holds no client-side quota
// of its own, since that was trivially bypassable (cleared localStorage/private
// window) and didn't actually stop anonymous search spend.

export function useSearchConversation() {
  const { isAuthenticated, user } = useAuth()

  const [isSearching, setIsSearching] = useState(false)
  const [authGateOpen, setAuthGateOpen] = useState(false)
  const [dailyLimitReached, setDailyLimitReached] = useState(false)

  // Derived — blocks the search UI outright for guests or once today's quota is used
  const isLimitReached = !isAuthenticated || dailyLimitReached

  function closeAuthGate() {
    setAuthGateOpen(false)
  }

  async function runGatedSearch(rawQuery, userCoordinates, userFilters) {
    if (isSearching) return null

    if (!isAuthenticated) {
      setAuthGateOpen(true)
      return null
    }
    if (dailyLimitReached) return null

    setIsSearching(true)
    try {
      return await runConversationalSearch({
        rawQuery,
        userCoordinates,
        conversationHistory: [],
        userId: user?.id ?? null,
        userFilters,
      })
    } catch (err) {
      if (err instanceof SearchGateError) {
        if (err.reason === 'auth_required') {
          setAuthGateOpen(true)
        } else if (err.reason === 'daily_limit_reached') {
          setDailyLimitReached(true)
          toast("You've used all 5 searches for today — more tomorrow.")
        }
        return null
      }
      return null
    } finally {
      setIsSearching(false)
    }
  }

  // Primary search — stateless per call, no history accumulation
  async function search(rawQuery, userCoordinates, userFilters = {}) {
    return runGatedSearch(rawQuery, userCoordinates, userFilters)
  }

  // Re-run with new filters — same gate as any other search
  async function searchWithFilters(rawQuery, userCoordinates, userFilters) {
    return runGatedSearch(rawQuery, userCoordinates, userFilters)
  }

  function resetSession() {
    // daily quota is server-side and day-scoped — nothing to reset client-side
  }

  return {
    isLimitReached,
    isSearching,
    authGateOpen,
    closeAuthGate,
    dailyLimitReached,
    search,
    searchWithFilters,
    resetSession,
  }
}
