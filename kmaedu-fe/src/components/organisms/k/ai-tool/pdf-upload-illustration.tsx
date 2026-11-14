/** PDF sheet with a red tag, a faded sheet behind it and a cloud-upload badge (upload drop zone art). */
export function PdfUploadIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 132 104" fill="none" aria-hidden className={className}>
      {/* back sheet */}
      <path d="M52 8h30l14 14v52a6 6 0 0 1-6 6H52a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6Z" fill="#F4F4F5" stroke="#E4E4E7" strokeWidth="1.5" />
      {/* front sheet */}
      <g filter="url(#pdf-shadow)">
        <path d="M32 18h32l16 16v56a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6Z" fill="#fff" />
        <path d="M32 18h32l16 16v56a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6Z" stroke="#E4E4E7" strokeWidth="1.5" />
      </g>
      <path d="M64 18v10a6 6 0 0 0 6 6h10" fill="#F4F4F5" />
      <path d="M64 18v10a6 6 0 0 0 6 6h10" stroke="#E4E4E7" strokeWidth="1.5" />
      <rect x="34" y="38" width="22" height="3" rx="1.5" fill="#E4E4E7" />
      <rect x="34" y="45" width="30" height="3" rx="1.5" fill="#E4E4E7" />
      <rect x="34" y="52" width="26" height="3" rx="1.5" fill="#E4E4E7" />
      {/* PDF tag */}
      <rect x="31" y="64" width="32" height="18" rx="4" fill="#EE2F2B" />
      <text x="47" y="77" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="10" fontWeight="700" fill="#fff">
        PDF
      </text>
      {/* cloud upload badge */}
      <path
        d="M96 82h18a10 10 0 0 0 1.4-19.9A14 14 0 0 0 88.6 58 11 11 0 0 0 96 82Z"
        fill="#fff"
        stroke="#EE2F2B"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M103 80V66m0 0-5.5 5.5M103 66l5.5 5.5" stroke="#EE2F2B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <filter id="pdf-shadow" x="18" y="14" width="70" height="92" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0F172A" floodOpacity="0.08" />
        </filter>
      </defs>
    </svg>
  );
}
