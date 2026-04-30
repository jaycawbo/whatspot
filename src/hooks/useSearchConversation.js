import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { runConversationalSearch } from '../services/searchOrchestrator'

const CONV_HISTORY_KEY    = 'ws_conv_history'
const SESSION_COUNT_KEY   = 'ws_session_count'
const AUTH_TURN_LIMIT     = 5
const GUEST_TURN_LIMIT    = 3
const GUEST_SESSION_LIMIT = 3

// --- sessionStorage helpers (all try/catch) ---

function readGuestHistory() {
  try {
    const raw = sessionStorage.getItem(CONV_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeGuestHistory(turns) {
  try {
    sessionStorage.setItem(CONV_HISTORY_KEY, JSON.stringify(turns))
  } catch {}
}

function clearGuestHistory() {
  try {
    sessionStorage.removeItem(CONV_HISTORY_KEY)
  } catch {}
}

function readSessionCount() {
  try {
    return parseInt(sessionStorage.getItem(SESSION_COUNT_KEY) || '0', 10) || 0
  } catch {
    return 0
  }
}

function writeSessionCount(n) {
  try {
    sessionStorage.setItem(SESSION_COUNT_KEY, String(n))
  } catch {}
}

// --- Hook ---

export function useSearchConversation() {
  const { isAuthenticated, user } = useAuth()

  const [history, setHistory] = useState([])
  const [isSessionLocked, setIsSessionLocked] = useState(false)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const prevIsAuthRef = useRef(isAuthenticated)

  // Derived
  const turnLimit          = isAuthenticated ? AUTH_TURN_LIMIT : GUEST_TURN_LIMIT
  const currentTurnCount   = history.length
  const isLimitReached     = currentTurnCount >= turnLimit
  const followUpsRemaining = isAuthenticated
    ? Math.max(0, turnLimit - currentTurnCount - 1)
    : null

  // Effect A — hydrate guest state on mount
  useEffect(() => {
    if (!isAuthenticated) {
      const saved = readGuestHistory()
      if (saved.length > 0) setHistory(saved)
      const count = readSessionCount()
      if (count >= GUEST_SESSION_LIMIT) setIsSessionLocked(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Effect B — handle auth transitions
  useEffect(() => {
    const wasAuth = prevIsAuthRef.current
    prevIsAuthRef.current = isAuthenticated

    if (wasAuth && !isAuthenticated) {
      // Logout: discard auth history, reset guest counters
      setHistory([])
      setIsSessionLocked(false)
      setShowAuthPrompt(false)
      clearGuestHistory()
      writeSessionCount(0)
    } else if (!wasAuth && isAuthenticated) {
      // Login: discard guest state
      setHistory([])
      setIsSessionLocked(false)
      setShowAuthPrompt(false)
      clearGuestHistory()
      // ws_session_count belongs to the guest identity — leave it
    }
  }, [isAuthenticated])

  // Effect C — sync guest history to sessionStorage
  useEffect(() => {
    if (!isAuthenticated) {
      writeGuestHistory(history)
    }
  }, [history, isAuthenticated])

  // Private: gate first turn of a guest session against the session cap
  function _checkAndIncrementSession() {
    const count = readSessionCount()
    if (count >= GUEST_SESSION_LIMIT) {
      setIsSessionLocked(true)
      setShowAuthPrompt(true)
      return { locked: true }
    }
    writeSessionCount(count + 1)
    return { locked: false }
  }

  // Primary search function — manages full turn lifecycle
  async function search(rawQuery, userCoordinates) {
    if (isSearching || isLimitReached || isSessionLocked) return null

    // Gate guest session count on first turn
    if (history.length === 0 && !isAuthenticated) {
      const { locked } = _checkAndIncrementSession()
      if (locked) return null
    }

    // Snapshot history BEFORE appending the user turn so the orchestrator
    // receives the prior context only (rawQuery is passed separately)
    const conversationHistory = [...history]
    const userTurn = { role: 'user', content: rawQuery, timestamp: Date.now() }
    setHistory(h => [...h, userTurn])
    setIsSearching(true)

    try {
      const result = await runConversationalSearch({
        rawQuery,
        userCoordinates,
        conversationHistory,
        userId: user?.id ?? null,
      })

      if (result?.conversational_response) {
        setHistory(h => [
          ...h,
          { role: 'assistant', content: result.conversational_response, timestamp: Date.now() },
        ])
      }

      return result
    } catch {
      // User turn stays in history — accurate record of the attempt
      return null
    } finally {
      setIsSearching(false)
    }
  }

  // Public escape hatch for external callers (tests, future components)
  function addTurn(role, content) {
    if (isLimitReached) return
    setHistory(h => [...h, { role, content, timestamp: Date.now() }])
  }

  function resetSession() {
    setHistory([])
    setIsSessionLocked(false)
    setShowAuthPrompt(false)
    clearGuestHistory()
    // ws_session_count intentionally not reset — persists to enforce session cap
  }

  function closeAuthPrompt() {
    setShowAuthPrompt(false)
  }

  return {
    history,
    isLimitReached,
    isSessionLocked,
    followUpsRemaining,
    isSearching,
    search,
    addTurn,
    resetSession,
    showAuthPrompt,
    closeAuthPrompt,
  }
}
