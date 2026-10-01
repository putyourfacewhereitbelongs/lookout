import React, { useState } from 'react';
import {
  Film,
  Download,
  Trash2,
  Play,
  Clock,
  HardDrive,
  Camera,
  Sparkles,
  ExternalLink,
  Shield,
  X,
} from 'lucide-react';
import { SavedRecording } from '../types';
import { StorageService } from '../services/db';

interface RecordingsLibraryProps {
  recordings: SavedRecording[];
  onRefresh: () => void;
  onTake4KSnapshot: () => void;
}

export const RecordingsLibrary: React.FC<RecordingsLibraryProps> = ({
  recordings,
  onRefresh,
  onTake4KSnapshot,
}) => {
  const [selectedRecording, setSelectedRecording] = useState<SavedRecording | null>(null);

  const handleDelete = (id: string) => {
    if (confirm('Delete this recorded clip from local storage?')) {
      StorageService.deleteRecording(id);
      onRefresh();
      if (selectedRecording?.id === id) {
        setSelectedRecording(null);
      }
    }
  };

  const handleDownload = (rec: SavedRecording) => {
    const a = document.createElement('a');
    a.href = rec.blobUrl;
    a.download = `${rec.title.replace(/\s+/g, '_')}_${rec.resolution}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 text-slate-100 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-950/80 border border-blue-800/60 rounded-xl text-blue-400">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                DVR Recordings & 4K Forensics Master
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800">
                PROCESSED REPOSITORIES
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Captured footage with burned-in telemetry, facial metadata, and 4K upscaling
            </p>
          </div>
        </div>

        {/* Snapshot & Export Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={onTake4KSnapshot}
            className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-mono text-xs font-bold text-white transition flex items-center gap-2 shadow-lg shadow-cyan-900/30"
          >
            <Camera className="w-4 h-4" />
            EXPORT 4K FORENSIC SNAPSHOT
          </button>
        </div>
      </div>

      {/* Grid of Recordings */}
      <div className="mt-5">
        {recordings.length === 0 ? (
          <div className="text-center py-12 text-slate-400 font-mono text-xs bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
            <HardDrive className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            No saved clips yet. Use the "Record" button in the live DVR toolbar to capture high-definition or 4K footage!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recordings.map((rec, idx) => (
              <div
                key={`${rec.id}-${idx}`}
                className="group rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 p-3.5 transition flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-slate-900 border border-slate-800 mb-2.5">
                    <img
                      src={rec.thumbnail}
                      alt={rec.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-black/80 text-cyan-400 border border-slate-700">
                      {rec.resolution}
                    </div>
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-mono bg-black/80 text-white flex items-center gap-1">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      {rec.durationSeconds}s
                    </div>
                    <button
                      onClick={() => setSelectedRecording(rec)}
                      className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-cyan-600/90 hover:bg-cyan-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg"
                    >
                      <Play className="w-5 h-5 ml-0.5" />
                    </button>
                  </div>

                  <h4 className="font-bold text-xs text-white truncate">{rec.title}</h4>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
                    <span>{rec.cameraName}</span>
                    <span>{new Date(rec.timestamp).toLocaleDateString()}</span>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {rec.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-800/80 flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(rec)}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-[11px] transition flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    DOWNLOAD 4K
                  </button>
                  <button
                    onClick={() => handleDelete(rec.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video Playback Modal */}
      {selectedRecording && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div>
                <h3 className="text-sm font-bold text-white font-mono">{selectedRecording.title}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedRecording.resolution} • Recorded from {selectedRecording.cameraName}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecording(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-slate-800">
              <video
                src={selectedRecording.blobUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>

            <div className="mt-4 flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400">
                Processed at 60 FPS • Bitrate 12 Mbps
              </span>
              <button
                onClick={() => handleDownload(selectedRecording)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                DOWNLOAD EXPORT FILE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
