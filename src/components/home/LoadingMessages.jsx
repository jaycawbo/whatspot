import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const messages = [
  'Searching the neighbourhood...',
  'Finding the best matches...',
  'Curating your recommendations...',
  'Almost there...',
];

const longWaitMessages = [
  'Still working on it — hang tight...',
  'Digging a little deeper for the best spots...',
  "This one's taking a moment — thanks for your patience...",
];

export default function LoadingMessages({ light = false }) {
  const [index, setIndex] = useState(0);
  const [isLongWait, setIsLongWait] = useState(false);
  const [longIndex, setLongIndex] = useState(0);

  // Switch to long-wait messages after 15 seconds
  useEffect(() => {
    const timer = setTimeout(() => setIsLongWait(true), 15000);
    return () => clearTimeout(timer);
  }, []);

  // Cycle through normal messages every 4s
  useEffect(() => {
    if (isLongWait) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isLongWait]);

  // Cycle through long-wait messages every 5s
  useEffect(() => {
    if (!isLongWait) return;
    const interval = setInterval(() => {
      setLongIndex((prev) => (prev + 1) % longWaitMessages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isLongWait]);

  const activeMessages = isLongWait ? longWaitMessages : messages;
  const activeIndex = isLongWait ? longIndex : index;

  return (
    <div className="flex justify-center py-3">
      <AnimatePresence mode="wait">
        <motion.p
          key={`${isLongWait ? 'long' : 'normal'}-${activeIndex}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className={`text-sm italic ${light ? 'text-white' : 'text-muted-foreground'}`}
        >
          {activeMessages[activeIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
