

# Fix: Single Logo with State-Aware Placement

## Problem
Two logos appear on the homepage simultaneously in pre-search mode:
1. A small logo in the Header (always visible)
2. A large centered logo above the search bar in Home.jsx

## Desired Behavior (from March 8th request)
- **Pre-search**: One large centered logo above the search bar. No logo in the header.
- **Post-search**: Logo disappears from center, reappears small in the header nav.
- **Clicking the header logo** in post-search returns to pre-search (large centered logo reappears).

## Changes

### 1. Header.jsx — Conditionally show logo
Hide the center logo section when in pre-search mode. Show it only in post-search.

```jsx
{/* Center: Logo — only in post-search */}
{state.mode === 'post-search' && (
  <div className="flex items-center justify-center">
    <a href="/" onClick={handleLogoClick} className="flex items-center">
      <img src={whatspotLogo} alt="Whatspot" className="h-7" />
    </a>
  </div>
)}
```

### 2. Home.jsx — No changes needed
The large centered logo in pre-search (line 208-210) already works correctly and has the click-to-clear behavior.

### Summary
One line-level edit in Header.jsx to wrap the logo in a conditional. No other files touched.

