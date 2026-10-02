import React, { useState } from 'react';
import {
  Users,
  UserCheck,
  HelpCircle,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Search,
  Sparkles,
  Camera,
  Check,
  X,
  Dog,
  Shield,
  AlertCircle,
  RefreshCw,
  Cpu,
  Key,
} from 'lucide-react';
import { FaceProfile, StoragePreferences } from '../../types';
import { StorageService } from '../../services/db';
import { faceRecognitionService } from '../../services/faceRecognitionService';

interface FaceDatabaseSectionProps {
  faceProfiles: FaceProfile[];
  onFaceProfilesChange: (profiles: FaceProfile[]) => void;
  storagePreferences: StoragePreferences;
  onStoragePreferencesChange: (s: StoragePreferences) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1552053831-71594a27632d?w=150&auto=format&fit=crop&q=80', // Golden Retriever
  'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=150&auto=format&fit=crop&q=80', // Beagle
  'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=150&auto=format&fit=crop&q=80', // Cat
];

export const FaceDatabaseSection: React.FC<FaceDatabaseSectionProps> = ({
  faceProfiles,
  onFaceProfilesChange,
  storagePreferences,
  onStoragePreferencesChange,
}) => {
  const [filterRole, setFilterRole] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<FaceProfile | null>(null);

  // New profile form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'person' | 'animal'>('person');
  const [newRole, setNewRole] = useState<FaceProfile['role']>('family');
  const [newAvatar, setNewAvatar] = useState(PRESET_AVATARS[0]);
  const [newNotes, setNewNotes] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<FaceProfile['role']>('family');
  const [editNotes, setEditNotes] = useState('');

  const [notificationMsg, setNotificationMsg] = useState('');
  const [isSyncingCf, setIsSyncingCf] = useState(false);
  const [cfSubjects, setCfSubjects] = useState<string[]>([]);

  const showToast = (msg: string) => {
    setNotificationMsg(msg);
    setTimeout(() => setNotificationMsg(''), 3500);
  };

  const handleSyncCompreFace = async () => {
    setIsSyncingCf(true);
    try {
      const subjects = await faceRecognitionService.getSubjects();
      const subjectImages = await faceRecognitionService.getSubjectImages();
      const finalSubjects = subjects;
      setCfSubjects(finalSubjects);

      let addedCount = 0;
      const currentProfiles = StorageService.getFaceProfiles();
      const profilesToAdd: Array<{ subject: string; image?: string }> = [];
      finalSubjects.forEach((subj) => {
        const image = subjectImages[subj];
        const existing = currentProfiles.find((p) => p.subjectType === 'person' && p.name.toLowerCase() === subj.toLowerCase());
        if (existing) {
          existing.thumbnail = image || '';
          existing.snapshots = image ? [image] : [];
        } else if (!existing) profilesToAdd.push({ subject: subj, image });
      });
      StorageService.saveFaceProfiles(currentProfiles);
      profilesToAdd.forEach(({ subject, image }) => {
        StorageService.addManualProfile({
          name: subject,
          subjectType: 'person',
          role: 'family',
          thumbnail: image || '',
          notes: 'Enrolled in CompreFace Biometric Database',
        });
        addedCount++;
      });
      const updated = StorageService.getFaceProfiles();
      onFaceProfilesChange(updated);
      showToast(`Synced with CompreFace server: ${finalSubjects.length} subjects registered (${addedCount} added to catalog).`);
    } catch {
      showToast('Could not sync CompreFace. Check that the local service is running and COMPREFACE_API_KEY is configured.');
    } finally {
      setIsSyncingCf(false);
    }
  };

  const handleCreateProfile = () => {
    if (!newName.trim()) return;
    if (newType === 'animal' && !newAvatar.startsWith('data:image/')) {
      showToast('Add a clear photo of this animal to create its local reference profile.');
      return;
    }
    if (faceProfiles.some((profile) => profile.subjectType === newType && profile.name.toLowerCase() === newName.trim().toLowerCase())) {
      showToast(`A ${newType} profile with that name already exists.`);
      return;
    }
    const created = StorageService.addManualProfile({
      name: newName.trim(),
      subjectType: newType,
      role: newRole,
      thumbnail: newAvatar,
      notes: newNotes.trim() || undefined,
    });
    const updated = StorageService.getFaceProfiles();
    onFaceProfilesChange(updated);
    setShowAddModal(false);
    setNewName('');
    setNewNotes('');
    setNewType('person');
    setNewRole('family');
    setNewAvatar(PRESET_AVATARS[0]);
    showToast(created.subjectType === 'animal'
      ? `Added ${created.name} to the local animal reference catalog.`
      : `Added ${created.name} to the local face profile catalog.`);
  };

  const handleAnimalPhotoUpload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Choose an image file for the animal reference photo.');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setNewAvatar(canvas.toDataURL('image/jpeg', 0.84));
      }
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      showToast('Could not read that animal photo. Try another image.');
    };
    image.src = objectUrl;
  };

  const handleStartEdit = (profile: FaceProfile) => {
    setEditingProfile(profile);
    setEditName(profile.name);
    setEditRole(profile.role === 'unknown' ? (profile.subjectType === 'animal' ? 'pet' : 'family') : profile.role);
    setEditNotes(profile.notes || '');
  };

  const handleSaveEdit = () => {
    if (!editingProfile) return;
    StorageService.updateProfileNameAndRole(editingProfile.id, editName.trim() || editingProfile.name, editRole, editNotes);
    const updated = StorageService.getFaceProfiles();
    onFaceProfilesChange(updated);
    setEditingProfile(null);
    showToast('Profile updated successfully.');
  };

  const handleDeleteProfile = (id: string) => {
    if (confirm('Delete this face profile from the local database?')) {
      StorageService.deleteProfile(id);
      const updated = StorageService.getFaceProfiles();
      onFaceProfilesChange(updated);
      showToast('Profile deleted.');
    }
  };

  const handlePurgeUnknown = () => {
    if (confirm('Purge all unverified unknown face groupings?')) {
      StorageService.purgeUnknownFaces();
      const updated = StorageService.getFaceProfiles();
      onFaceProfilesChange(updated);
      showToast('All unknown face clusters purged.');
    }
  };

  const handleExportFaceDb = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(faceProfiles, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `lookout-ai-face-db-${new Date().toISOString().slice(0, 10)}.json`);
    dlAnchorElem.click();
    showToast('Face database exported as JSON.');
  };

  const handleImportFaceDb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          StorageService.saveFaceProfiles(parsed);
          onFaceProfilesChange(parsed);
          showToast(`Successfully imported ${parsed.length} face profiles!`);
        } else {
          alert('Invalid JSON file format. Must be an array of face profiles.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredProfiles = faceProfiles.filter((p) => {
    const matchesRole =
      filterRole === 'all'
        ? true
        : filterRole === 'unknown'
        ? p.role === 'unknown'
        : filterRole === 'verified'
        ? p.role !== 'unknown'
        : p.role === filterRole;

    const matchesSearch =
      searchQuery.trim() === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.notes?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesRole && matchesSearch;
  });

  const unknownCount = faceProfiles.filter((p) => p.role === 'unknown').length;
  const verifiedCount = faceProfiles.filter((p) => p.role !== 'unknown').length;

  return (
    <div className="space-y-6">
      {/* Header and Master Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-950/80 border border-cyan-800/60 rounded-xl text-cyan-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Biometric Facial & Animal Recognition Database
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                PEOPLE FACE MATCH + ANIMAL REFERENCES
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Enroll people with CompreFace; add local animal profiles with your own reference photos.
            </p>
          </div>
        </div>

        {/* Global Controls & Master Toggle */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <button
            onClick={() =>
              onStoragePreferencesChange({
                ...storagePreferences,
                facialRecognitionMasterEnabled: !storagePreferences.facialRecognitionMasterEnabled,
              })
            }
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              storagePreferences.facialRecognitionMasterEnabled
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
            }`}
          >
            <span>
              {storagePreferences.facialRecognitionMasterEnabled ? 'AI MATCHER ON' : 'AI MATCHER OFF'}
            </span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950"
          >
            <Plus className="w-4 h-4" />
            <span>ADD PROFILE</span>
          </button>
        </div>
      </div>

      {notificationMsg && (
        <div className="p-3 bg-cyan-950/40 border border-cyan-800 text-cyan-300 rounded-xl font-mono text-xs flex items-center justify-between">
          <span>{notificationMsg}</span>
          <button onClick={() => setNotificationMsg('')} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* CompreFace Neural Face Recognition Service Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/30 border border-cyan-800/60 shadow-xl space-y-3 font-mono text-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-700 text-cyan-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white uppercase tracking-wider text-xs">
                  CompreFace Neural Recognition Service
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  SELF-HOSTED
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Endpoint: <span className="text-cyan-400">LOCAL COMPREFACE VIA LOOKOUT PROXY</span> • Requires configured API key
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSyncCompreFace}
              disabled={isSyncingCf}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold transition flex items-center gap-1.5 shadow-md shadow-cyan-950 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCf ? 'animate-spin' : ''}`} />
              <span>{isSyncingCf ? 'SYNCING...' : 'SYNC SUBJECTS'}</span>
            </button>
          </div>
        </div>

        {/* Feature Badges & Endpoint Plugins */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
          <span className="text-[10px] text-slate-400 uppercase font-bold">ACTIVE PLUGINS:</span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-700 text-cyan-300">
            5-POINT LANDMARKS
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-700 text-slate-500">
            AGE / GENDER / POSE DISABLED FOR SPEED
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-blue-950 border border-blue-800 text-blue-300 font-bold">
            ALWAYS-FOLLOWING PERSON TARGET LOCK
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-violet-950 border border-violet-800 text-violet-200 font-bold">
            LONG-RANGE 3 × 2 FACE SCAN
          </span>
        </div>

        {/* Enrolled CompreFace Subjects */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
            <span className="font-bold uppercase">
              REGISTERED RECOGNITION DATABASE SUBJECTS ({cfSubjects.length}):
            </span>
            <span className="text-emerald-400">AUTONOMOUS IDENTIFICATION ACTIVE</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cfSubjects.map((subj) => (
              <span
                key={subj}
                className="px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 text-slate-200 text-[11px] font-semibold flex items-center gap-1.5 transition"
              >
                <Check className="w-3 h-3 text-cyan-400" />
                {subj}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Match Threshold Slider & Database Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-slate-300">
            <span className="font-bold">SIMILARITY MATCH THRESHOLD</span>
            <span className="text-cyan-400 font-bold">
              {(storagePreferences.faceMatchThreshold * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-[10px] text-slate-400">
            Minimum visual embedding similarity required to confirm a face. One sharp HD enrollment photo is supported; a competing identity must still be clearly behind it.
          </p>
          <input
            type="range"
            min="0.80"
            max="0.98"
            step="0.01"
            value={storagePreferences.faceMatchThreshold}
            onChange={(e) =>
              onStoragePreferencesChange({
                ...storagePreferences,
                faceMatchThreshold: parseFloat(e.target.value),
              })
            }
            className="w-full accent-cyan-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-500">
            <span>80% (One photo)</span>
            <span>84% (Balanced)</span>
            <span>98% (Strict)</span>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">CATALOG POPULATION</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{faceProfiles.length}</span>
              <span className="text-slate-400 text-xs">Total Profiles</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-2 space-y-0.5">
              <div>
                <span className="text-emerald-400 font-bold">{verifiedCount}</span> Verified (Family, Friends, Pets)
              </div>
              <div>
                <span className="text-amber-400 font-bold">{unknownCount}</span> Unknown Clusters Awaiting Review
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">DATA PORTABILITY</span>
            <p className="text-[10px] text-slate-400 mt-1">
              Backup facial embeddings and notes or import from another security station.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleExportFaceDb}
              className="flex-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              EXPORT JSON
            </button>
            <label className="flex-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              IMPORT JSON
              <input type="file" accept=".json" onChange={handleImportFaceDb} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: `ALL (${faceProfiles.length})` },
            { id: 'verified', label: `VERIFIED (${verifiedCount})` },
            { id: 'unknown', label: `UNKNOWN (${unknownCount})` },
            { id: 'family', label: 'FAMILY' },
            { id: 'pet', label: 'PETS' },
            { id: 'friend', label: 'FRIENDS' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterRole(tab.id)}
              className={`px-3 py-1.5 rounded-lg border transition shrink-0 ${
                filterRole === tab.id
                  ? 'bg-slate-800 border-cyan-500 text-cyan-300 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search faces or pets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {unknownCount > 0 && (
            <button
              onClick={handlePurgeUnknown}
              className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-800 text-amber-300 font-bold transition flex items-center gap-1 shrink-0"
              title="Clean up unverified unknown faces"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>PURGE UNKNOWN</span>
            </button>
          )}
        </div>
      </div>

      {/* Profiles Grid */}
      {filteredProfiles.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-500">
          <Camera className="w-10 h-10 mx-auto text-slate-700 mb-2" />
          No face profiles match the selected filter or search query.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 font-mono text-xs">
          {filteredProfiles.map((p) => {
            const isUnknown = p.role === 'unknown';
            const roleBadgeColor =
              p.role === 'family'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : p.role === 'pet'
                ? 'bg-blue-950 text-blue-300 border-blue-800'
                : p.role === 'friend'
                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                : p.role === 'intruder'
                ? 'bg-red-950 text-red-300 border-red-800'
                : 'bg-amber-950 text-amber-300 border-amber-800';

            return (
              <div
                key={p.id}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex flex-col justify-between transition group shadow-md"
              >
                <div>
                  <div className="flex items-start gap-3 mb-2.5">
                    <img
                      src={p.thumbnail}
                      alt={p.name}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0 bg-slate-900"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white truncate text-xs">{p.name}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] border font-bold uppercase ${roleBadgeColor}`}>
                          {p.role}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {p.subjectType === 'animal' ? 'Pet/Animal' : 'Person'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {p.notes && (
                    <p className="text-[10px] text-slate-400 line-clamp-2 bg-slate-900/60 p-2 rounded border border-slate-800/80 mb-2">
                      {p.notes}
                    </p>
                  )}

                  <div className="text-[9px] text-slate-500 space-y-0.5 pt-1">
                    <div>{p.subjectType === 'animal' ? `ANIMAL REFERENCES: ${p.snapshots.length} photos` : `FACE MATCH SCORE: ${(p.similarityScore * 100).toFixed(0)}%`}</div>
                    <div>SEEN: {new Date(p.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-3 mt-2 border-t border-slate-900">
                  <button
                    onClick={() => handleStartEdit(p)}
                    className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-900 rounded transition"
                    title="Edit profile & role"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(p.id)}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded transition"
                    title="Delete profile"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Profile Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in font-mono">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-white text-sm">Add Face / Animal Reference Profile</h4>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1">Subject Name or Identifier</label>
                <input
                  type="text"
                  placeholder="e.g. Grandma Helen or Buddy (Golden Retriever)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Subject Type</label>
                  <select
                    value={newType}
                    onChange={(e) => {
                      const type = e.target.value as 'person' | 'animal';
                      setNewType(type);
                      setNewRole(type === 'animal' ? 'pet' : 'family');
                      setNewAvatar(type === 'animal' ? '' : PRESET_AVATARS[0]);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="person">Person (Human)</option>
                    <option value="animal">Animal / Pet</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Security Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="family">Family (Trusted)</option>
                    <option value="friend">Friend / Verified</option>
                    <option value="pet">Household Pet</option>
                    <option value="wildlife">Wildlife</option>
                    <option value="intruder">Mark as Intruder</option>
                  </select>
                </div>
              </div>

              {newType === 'animal' ? (
                <div>
                  <label className="text-slate-400 block mb-1">Animal reference photo</label>
                  <label className="flex items-center gap-3 p-2 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer hover:border-blue-500/60">
                    {newAvatar.startsWith('data:image/') ? (
                      <img src={newAvatar} alt="Animal reference" className="w-14 h-14 rounded-lg object-cover" />
                    ) : (
                      <span className="w-14 h-14 rounded-lg bg-slate-900 flex items-center justify-center"><Dog className="w-6 h-6 text-blue-400" /></span>
                    )}
                    <span className="text-slate-300">{newAvatar ? 'Replace reference photo' : 'Choose a clear photo of this animal'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleAnimalPhotoUpload(event.target.files?.[0])} />
                  </label>
                  <p className="text-[10px] text-slate-500 mt-1">Stored locally as an animal reference. Human face enrollment is handled separately.</p>
                </div>
              ) : (
                <div>
                  <label className="text-slate-400 block mb-1">Select Avatar</label>
                  <div className="flex items-center gap-2 overflow-x-auto p-1 bg-slate-950 rounded-lg border border-slate-800">
                    {PRESET_AVATARS.map((url, idx) => (
                      <img key={idx} src={url} alt="Avatar option" onClick={() => setNewAvatar(url)} className={`w-10 h-10 rounded-lg object-cover cursor-pointer border-2 shrink-0 ${newAvatar === url ? 'border-cyan-400 ring-1 ring-cyan-400 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`} />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-slate-400 block mb-1">Notes / Clearance Instructions</label>
                <textarea
                  placeholder="e.g. Primary resident, allowed in all zones."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white h-16 resize-none focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProfile}
                disabled={!newName.trim() || (newType === 'animal' && !newAvatar.startsWith('data:image/'))}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg"
              >
                Save Local Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in font-mono">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="font-bold text-white text-sm">Edit Profile: {editingProfile.name}</h4>
              <button onClick={() => setEditingProfile(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1">Profile Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Role Classification</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="family">Family (Trusted)</option>
                  <option value="friend">Friend / Verified</option>
                  <option value="pet">Household Pet</option>
                  <option value="wildlife">Wildlife</option>
                  <option value="intruder">Intruder / Threat</option>
                  <option value="unknown">Unknown Grouping</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Forensic Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white h-20 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEditingProfile(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg"
              >
                Update Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
