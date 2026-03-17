import React from 'react';
import logoSvg from '@/assets/whatspot_logo.svg';

const logoSizes = {
  sm: 'h-5',
  nav: 'h-6',
  hero: 'h-9 md:h-10',
};

export default function WhatspotLogo({ size = 'nav', className = '' }) {
  const sizeClass = logoSizes[size] || logoSizes.nav;

  return (
    <img
      src={logoSvg}
      alt="Whatspot"
      className={`${sizeClass} w-auto ${className}`}
    />
  );
}
