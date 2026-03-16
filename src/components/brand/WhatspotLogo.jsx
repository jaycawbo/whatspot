import React from 'react';

const logoSizes = {
  nav: {
    gap: 'gap-2',
    icon: 'h-6 w-6',
    text: 'text-2xl',
  },
  hero: {
    gap: 'gap-3',
    icon: 'h-9 w-9 md:h-10 md:w-10',
    text: 'text-3xl md:text-4xl',
  },
};

export default function WhatspotLogo({ size = 'nav', className = '' }) {
  const selectedSize = logoSizes[size] || logoSizes.nav;

  return (
    <span
      aria-label="Whatspot"
      className={`inline-flex items-center ${selectedSize.gap} ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`${selectedSize.icon} text-primary shrink-0`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 21C15.5 16.8 18.5 13.7 18.5 9.5C18.5 5.91015 15.5899 3 12 3C8.41015 3 5.5 5.91015 5.5 9.5C5.5 13.7 8.5 16.8 12 21Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="9.5" r="2.2" fill="currentColor" />
      </svg>

      <span
        className={`leading-none font-semibold tracking-tight text-foreground ${selectedSize.text}`}
      >
        Whatspot
      </span>
    </span>
  );
}
