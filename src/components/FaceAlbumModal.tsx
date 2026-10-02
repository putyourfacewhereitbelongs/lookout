import React, { useEffect, useState } from 'react';
import {
  Users,
  Dog,
  UserCheck,
  HelpCircle,
  Edit2,
  Trash2,
  Plus,
  Camera,
  Check,
  X,
  Sparkles,
  Shield,
  Clock,
  Layers,
} from 'lucide-react';
import { FaceProfile } from '../types';
import { StorageService } from '../services/db';
import { faceRecognitionService } from '../services/faceRecognitionService';
import { RefreshCw } from 'lucide-react';

interface FaceAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
}

export const FaceAlbumModal: React.FC<FaceAlbumModalProps> = ({ isOpen, onClose, onProfileUpdated }) => {
  const [activeTab, setActiveTab] = useState<'unknown' | 'known'>('unknown');
  const [profiles, setProfiles] = useState<FaceProfile[]>(StorageService.getFaceProfiles());
  const [editingProfile, setEditingProfile] = useState<FaceProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<FaceProfile['role']>('friend');
  const [editType, setEditType] = useState<'person' | 'animal'>('person');
  const [editNotes, setEditNotes] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [comprefaceSubjects, setComprefaceSubjects] = useState<string[]>([]);
  const [registrationTarget, setRegistrationTarget] = useState('__new__');
  const [isRegisteringFace, setIsRegisteringFace] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');

  useEffect(() => {
    if (isOpen) setProfiles(StorageService.getFaceProfiles());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSyncCompreFace = async () => {
    setIsSyncing(true);
    try {
      const subjects = await faceRecognitionService.getSubjects();
      const subjectImages = await faceRecognitionService.getSubjectImages();
      if (subjects && subjects.length > 0) {
        const currentProfiles = StorageService.getFaceProfiles();
        const profilesToAdd: Array<{ subject: string; image?: string }> = [];
        subjects.forEach((subj) => {
          const image = subjectImages[subj];
          const existing = currentProfiles.find((p) => p.subjectType === 'person' && p.name.toLowerCase() === subj.toLowerCase());
          if (existing) {
            existing.thumbnail = image || '';
            existing.snapshots = image ? [image] : [];
          } else if (!existing) profilesToAdd.push({ subject: subj, image });
        });
        StorageService.saveFaceProfiles(currentProfiles);
        profilesToAdd.forEach(({ subject, image }) => StorageService.addManualProfile({
          name: subject,
          subjectType: 'person',
          role: 'family',
          thumbnail: image || '',
          notes: 'Enrolled in CompreFace Biometric Database',
        }));
        const updated = StorageService.getFaceProfiles();
        setProfiles(updated);
        if (onProfileUpdated) onProfileUpdated();
      }
    } catch (e) {
      console.warn('Sync error:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const unknownProfiles = profiles.filter((p) => p.role === 'unknown');
  const knownProfiles = profiles.filter((p) => p.role !== 'unknown');

  const handleStartNaming = (profile: FaceProfile) => {
    setEditingProfile(profile);
    setEditName(profile.name.startsWith('Unknown') ? '' : profile.name);
    setEditRole(profile.role === 'unknown' ? (profile.subjectType === 'animal' ? 'pet' : 'family') : profile.role);
    setEditType(profile.subjectType);
    setEditNotes(profile.notes || '');
    setRegistrationTarget('__new__');
    setRegistrationMessage('');
    if (profile.subjectType === 'person') {
      faceRecognitionService.getSubjects()
        .then(setComprefaceSubjects)
        .catch(() => setComprefaceSubjects([]));
    } else {
      setComprefaceSubjects([]);
    }
  };

  const handleSaveName = () => {
    if (!editingProfile) return;
    const finalName = editName.trim() || editingProfile.name;
    StorageService.updateProfileNameAndRole(editingProfile.id, finalName, editRole, editNotes, editType);
    setProfiles(StorageService.getFaceProfiles());
    setEditingProfile(null);
    if (onProfileUpdated) onProfileUpdated();
  };

  const handleRegisterFace = async () => {
    if (!editingProfile || editType !== 'person') return;
    const subject = registrationTarget === '__new__' ? editName.trim() : registrationTarget;
    if (!subject) {
      setRegistrationMessage('Enter a name for the new person.');
      return;
    }
    if (!editingProfile.thumbnail.startsWith('data:image/')) {
      setRegistrationMessage('This profile has no captured face image to register.');
      return;
    }

    setIsRegisteringFace(true);
    setRegistrationMessage('Registering captured face…');
    try {
      const result = await faceRecognitionService.enrollFace(subject, editingProfile.thumbnail);
      if (!result?.success) {
        setRegistrationMessage(result?.error || 'CompreFace could not register this face.');
        return;
      }
      const imageId = result.data?.image_id;
      const imageUrl = imageId ? `/api/recognition/faces/${encodeURIComponent(imageId)}/image` : editingProfile.thumbnail;
      const updated = StorageService.getFaceProfiles().map((profile) => profile.id === editingProfile.id
        ? { ...profile, name: subject, subjectType: 'person' as const, role: editRole, notes: editNotes, thumbnail: imageUrl, snapshots: [imageUrl], lastSeen: Date.now() }
        : profile);
      StorageService.saveFaceProfiles(updated);
      setProfiles(updated);
      setEditingProfile(null);
      if (onProfileUpdated) onProfileUpdated();
    } catch {
      setRegistrationMessage('Could not reach CompreFace. Check its connection and try again.');
    } finally {
      setIsRegisteringFace(false);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this face profile from local database?')) {
      StorageService.deleteProfile(id);
      setProfiles(StorageService.getFaceProfiles());
      if (onProfileUpdated) onProfileUpdated();
    }
  };

  return (
    <div className="mobile-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="mobile-dialog flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-3 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 flex items-center gap-2 sm:gap-3">
            <div className="p-2.5 bg-cyan-950 border border-cyan-800 rounded-xl text-cyan-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-bold text-white sm:text-lg">Biometric Face & Animal Intelligence</h2>
                <span className="hidden rounded border border-cyan-800 bg-cyan-950 px-2 py-0.5 font-mono text-[10px] text-cyan-400 sm:inline">
                  FACE + LOCAL PET RECOGNITION
                </span>
              </div>
              <p className="hidden text-xs font-mono text-slate-400 sm:block">
                CompreFace identifies people; the local Pet Recognition module compares enrolled animal reference photos privately in your browser.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 overflow-x-auto border-b border-slate-800 bg-slate-950/30 px-3 no-scrollbar sm:px-6">
          <div className="flex shrink-0 gap-3 sm:gap-4">
            <button
              onClick={() => setActiveTab('unknown')}
              className={`flex items-center gap-2 py-3 border-b-2 font-mono text-xs font-semibold transition ${
                activeTab === 'unknown'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span className="sm:hidden">UNKNOWN ({unknownProfiles.length})</span>
              <span className="hidden sm:inline">UNKNOWN GROUPINGS ({unknownProfiles.length})</span>
              {unknownProfiles.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('known')}
              className={`flex items-center gap-2 py-3 border-b-2 font-mono text-xs font-semibold transition ${
                activeTab === 'known'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span className="sm:hidden">KNOWN ({knownProfiles.length})</span>
              <span className="hidden sm:inline">VERIFIED PROFILES ({knownProfiles.length})</span>
            </button>
          </div>

          <button
            onClick={handleSyncCompreFace}
            disabled={isSyncing}
            className="flex shrink-0 items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-[11px] font-bold text-cyan-300 shadow-sm transition hover:bg-slate-800"
            title="Sync registered subjects from CompreFace neural server"
            aria-label="Sync CompreFace subjects"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="sm:hidden">SYNC</span>
            <span className="hidden sm:inline">{isSyncing ? 'SYNCING...' : 'SYNC COMPREFACE'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-3 custom-scrollbar sm:p-6">
          {activeTab === 'unknown' ? (
            <div>
              <div className="p-3 mb-4 rounded-xl bg-amber-950/30 border border-amber-800/50 text-xs font-mono text-amber-300/90 flex items-center justify-between">
                <span>
                  Name people and animals detected by the cameras. Animal profiles store local reference photos and label their active tracked detections.
                </span>
                <span className="shrink-0 px-2 py-1 bg-amber-900/40 rounded border border-amber-700/60 text-[10px]">
                  PRIVACY PRESERVED: LOCAL STORE ONLY
                </span>
              </div>

              {unknownProfiles.length === 0 ? (
                <div className="text-center py-16 text-slate-400 font-mono text-xs">
                  <Camera className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  No uncataloged people or animals detected yet. New subjects passing in front of the camera will appear here.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {unknownProfiles.map((p, idx) => (
                    <div
                      key={`${p.id}-${idx}`}
                      className="group rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 p-4 transition shadow-lg flex flex-col justify-between"
                    >
                      <div>
                        {/* Cropped Face Snapshot */}
                        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-slate-900 border border-slate-800 mb-3">
                          {p.thumbnail ? (
                            <img src={p.thumbnail} alt={p.name} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                          ) : <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 font-mono">NO REFERENCE PHOTO</div>}
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/90 text-black">
                            {p.subjectType === 'animal' ? 'ANIMAL / PET' : 'PERSON'}
                          </div>
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-mono bg-black/80 text-cyan-300 border border-slate-700 flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {p.snapshots.length} Snapshots
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-bold text-sm text-slate-200 truncate">{p.name}</h3>
                          <span className="text-[10px] font-mono text-emerald-400">
              {p.subjectType === 'animal' ? `${p.snapshots.length} references` : `${(p.similarityScore * 100).toFixed(0)}% Match`}
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 font-mono line-clamp-1">{p.notes}</p>
                        <div className="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last seen {new Date(p.lastSeen).toLocaleTimeString()}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                        <button
                          onClick={() => handleStartNaming(p)}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-mono font-semibold text-xs transition flex items-center justify-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          NAME SUBJECT
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {knownProfiles.map((p, idx) => (
                <div
                  key={`${p.id}-${idx}`}
                  className="rounded-xl bg-slate-950 border border-slate-800 p-4 shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-slate-900 border border-slate-800 mb-3">
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt={p.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 font-mono">NO REFERENCE PHOTO</div>}
                      <div
                        className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          p.role === 'family'
                            ? 'bg-blue-500 text-white'
                            : p.role === 'pet'
                            ? 'bg-emerald-500 text-black'
                            : p.role === 'friend'
                            ? 'bg-purple-500 text-white'
                            : 'bg-red-500 text-white'
                        }`}
                      >
                        {p.role.toUpperCase()}
                      </div>
                    </div>

                    <h3 className="font-bold text-sm text-white">{p.name}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{p.notes}</p>
                    <div className="text-[10px] font-mono text-cyan-400 mt-2">
                      {p.subjectType === 'animal' ? `LOCAL ANIMAL REFERENCES • ${p.snapshots.length} PHOTOS` : 'VERIFIED FACE TOKEN • PERSON'}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2">
                    <button
                      onClick={() => handleStartNaming(p)}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition flex items-center justify-center gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      EDIT
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Naming / Editing Sub-Modal Dialog */}
        {editingProfile && (
          <div className="mobile-overlay fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="mobile-dialog max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-2xl sm:p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Identify & Name Subject
                </h3>
                <button
                  onClick={() => setEditingProfile(null)}
                  className="p-1 text-slate-400 hover:text-white rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <img
                  src={editingProfile.thumbnail}
                  alt="Target"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-lg object-cover border border-slate-700"
                />
                <div className="text-xs font-mono space-y-1">
                  <div className="text-slate-400">{editingProfile.subjectType === 'animal' ? 'LOCAL ANIMAL PROFILE' : 'FACE EMBEDDING PROFILE'}</div>
                  <div className="text-cyan-300 font-bold">{editingProfile.clusterId}</div>
                  <div className="text-slate-500 text-[10px]">
                    {editingProfile.snapshots.length} reference images recorded
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 font-mono text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Subject Full Name or Pet Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Grandma Helen, Buster (Beagle)"
                    disabled={registrationTarget !== '__new__'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {editType === 'person' && (
                  <div className="rounded-lg border border-cyan-900/70 bg-cyan-950/20 p-3 space-y-2">
                    <label className="block text-cyan-200 font-bold">Register this captured face in CompreFace</label>
                    <select
                      value={registrationTarget}
                      onChange={(event) => {
                        setRegistrationTarget(event.target.value);
                        if (event.target.value !== '__new__') setEditName(event.target.value);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="__new__">Create a new person…</option>
                      {comprefaceSubjects.map((subject) => <option key={subject} value={subject}>Add face to {subject}</option>)}
                    </select>
                    <p className="text-[10px] text-slate-400">Choose an existing person or enter a new name above. The displayed captured face will be enrolled.</p>
                    {registrationMessage && <p className="text-[10px] text-amber-300">{registrationMessage}</p>}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-slate-400 mb-1">Entity Type</label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                    >
                      <option value="person">Person</option>
                      <option value="animal">Animal / Pet</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Category Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                    >
                      <option value="family">Family</option>
                      <option value="friend">Friend</option>
                      <option value="pet">Pet</option>
                      <option value="wildlife">Wildlife</option>
                      <option value="intruder">Intruder / Threat</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Surveillance Notes</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="e.g. Allowed front porch access, notify if spotted at night"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleSaveName}
                  className="flex-1 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-mono font-bold text-xs text-white transition flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {editType === 'animal' ? 'SAVE ANIMAL PROFILE' : 'SAVE FACE PROFILE'}
                </button>
                {editType === 'person' && (
                  <button
                    onClick={handleRegisterFace}
                    disabled={isRegisteringFace || (registrationTarget === '__new__' && !editName.trim())}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-mono font-bold text-xs text-white transition"
                  >
                    {isRegisteringFace ? 'REGISTERING…' : 'SAVE & REGISTER FACE'}
                  </button>
                )}
                <button
                  onClick={() => setEditingProfile(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-mono text-xs"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
