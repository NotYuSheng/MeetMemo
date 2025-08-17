import React from 'react';

const MeetMemoIcon = ({ size = 24, className = "" }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background circle */}
      <circle cx="16" cy="16" r="15" fill="currentColor" opacity="0.1"/>
      
      {/* Microphone body */}
      <rect x="13" y="8" width="6" height="10" rx="3" fill="currentColor"/>
      
      {/* Microphone stand */}
      <line x1="16" y1="18" x2="16" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      
      {/* Microphone base */}
      <line x1="12" y1="22" x2="20" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      
      {/* Sound waves / memo lines */}
      <path d="M8 12L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M8 14L11 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M8 16L10 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      
      <path d="M22 12L24 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M21 14L24 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M22 16L24 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
    </svg>
  );
};

export default MeetMemoIcon;