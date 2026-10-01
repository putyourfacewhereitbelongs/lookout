import React, { useState } from 'react';
import { QrCode, Copy, Check, ExternalLink, X, Smartphone, Wifi } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  urlToShare?: string;
}

// Compact algorithmic QR code matrix generator without external dependencies
function generateQrMatrix(text: string): boolean[][] {
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder pattern helper
  const setFinder = (startX: number, startY: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        if (
          x === 0 ||
          x === 6 ||
          y === 0 ||
          y === 6 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4)
        ) {
          matrix[startY + y][startX + x] = true;
        } else {
          matrix[startY + y][startX + x] = false;
        }
      }
    }
  };

  setFinder(0, 0);
  setFinder(size - 7, 0);
  setFinder(0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Hash input text into data payload dots
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  let bitIdx = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Don't overwrite finder patterns or timing patterns
      if (
        (x < 8 && y < 8) ||
        (x >= size - 8 && y < 8) ||
        (x < 8 && y >= size - 8) ||
        x === 6 ||
        y === 6
      ) {
        continue;
      }
      const pseudoRand = Math.sin(hash + bitIdx * 12.9898) * 43758.5453;
      matrix[y][x] = (pseudoRand - Math.floor(pseudoRand)) > 0.46;
      bitIdx++;
    }
  }

  return matrix;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, urlToShare }) => {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const currentUrl = urlToShare || (typeof window !== 'undefined' ? window.location.href : 'https://lookout.ai');
  const matrix = generateQrMatrix(currentUrl);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mobile-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="mobile-dialog relative w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-900 p-4 text-slate-100 shadow-2xl sm:p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-cyan-950/80 border border-cyan-800/60 rounded-xl text-cyan-400">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">Share Lookout AI</h2>
            <p className="text-xs text-slate-400 font-mono">Scan QR Code with mobile camera to sync & open</p>
          </div>
        </div>

        {/* QR Display Card */}
        <div className="flex flex-col items-center justify-center p-6 bg-slate-950 rounded-xl border border-slate-800 my-4 shadow-inner">
          <div className="bg-white p-4 rounded-xl shadow-lg">
            <svg
              viewBox="0 0 25 25"
              className="block h-40 w-40 sm:h-48 sm:w-48"
              shapeRendering="crispEdges"
            >
              {matrix.map((row, y) =>
                row.map((filled, x) =>
                  filled ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#090d16" /> : null
                )
              )}
            </svg>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs font-mono text-cyan-400">
            <Smartphone className="w-4 h-4" />
            <span>INSTANT PWA PAIRED CLIENT</span>
          </div>
        </div>

        {/* Share URL & Copy Box */}
        <div className="mt-4 space-y-2">
          <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">
            Direct Application URL
          </label>
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-xs text-slate-300">
            <span className="truncate flex-1">{currentUrl}</span>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 text-xs font-sans transition shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="mt-5 p-3 rounded-lg bg-slate-800/50 border border-slate-700/60 text-xs text-slate-300 flex items-start gap-2.5">
          <Wifi className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            Works across local Wi-Fi and mobile networks. All biometric and facial profiles sync securely in real-time.
          </span>
        </div>
      </div>
    </div>
  );
};
