import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Persistent anonymous ID — survives across sessions until user signs in
const ANON_ID_KEY = 'whatspot_anon_id';
if (!localStorage.getItem(ANON_ID_KEY)) {
  const newId = crypto.randomUUID();
  localStorage.setItem(ANON_ID_KEY, newId);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
