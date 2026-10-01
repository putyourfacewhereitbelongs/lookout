import React, { useState } from 'react';
import {
  Bell,
  Volume2,
  VolumeX,
  Play,
  Square,
  Shield,
  Clock,
  Sparkles,
  Mic,
  Plus,
  Trash2,
  CheckCircle,
  Radio,
  AlertTriangle,
} from 'lucide-react';
import { AlertNotificationSettings, AlertToneType, EmergencyContact } from '../../types';
import { audioEngine } from '../../services/audioEngine';

interface AlertsTonesSectionProps {
  settings: AlertNotificationSettings;
  onChange: (s: AlertNotificationSettings) => void;
  emergencyContacts: EmergencyContact[];
  onEmergencyContactsChange: (c: EmergencyContact[]) => void;
}

const ALERT_TONES: Array<{
  id: AlertToneType;
  name: string;
  description: string;
  category: string;
}> = [
  {
    id: 'tactical_chime',
    name: 'Tactical High-Tech Chime',
    description: 'Crisp dual-frequency harmonic tone (880Hz to 1320Hz)',
    category: 'Balanced / Professional',
  },
  {
    id: 'intruder_siren',
    name: 'Intruder Emergency Siren',
    description: 'Alternating sawtooth security alarm for perimeter breach',
    category: 'High Threat Alarm',
  },
  {
    id: 'radar_ping',
    name: 'Sonar Radar Ping',
    description: 'Acoustic submarine radar ping with exponential decay',
    category: 'Tactical Recon',
  },
  {
    id: 'subtle_pulse',
    name: 'Subtle Soft Pulse',
    description: 'Discreet low-frequency pulse for quiet domestic monitoring',
    category: 'Discreet / Indoor',
  },
  {
    id: 'cyber_pulse',
    name: 'Cyber Arpeggio Burst',
    description: '4-tone futuristic digital alert sequence',
    category: 'Futuristic HUD',
  },
  {
    id: 'hypersonic_chirp',
    name: 'Hypersonic Warning Chirp',
    description: 'Rapid high-frequency bird-like chirp sweep for instant attention',
    category: 'Immediate Attention',
  },
  {
    id: 'perimeter_horn',
    name: 'Perimeter Security Horn',
    description: 'Deep resonant low brass klaxon tone (140Hz to 110Hz)',
    category: 'Deep Klaxon',
  },
];

export const AlertsTonesSection: React.FC<AlertsTonesSectionProps> = ({
  settings,
  onChange,
  emergencyContacts,
  onEmergencyContactsChange,
}) => {
  const [playingTone, setPlayingTone] = useState<AlertToneType | null>(null);
  const [isTestingSpeech, setIsTestingSpeech] = useState(false);
  const [pushStatus, setPushStatus] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // New contact form
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRelation, setContactRelation] = useState('');

  const handlePreviewTone = (tone: AlertToneType) => {
    setPlayingTone(tone);
    audioEngine.playAlertTone(tone, settings.alertToneVolume);
    setTimeout(() => setPlayingTone(null), 600);
  };

  const handleTestTTS = () => {
    setIsTestingSpeech(true);
    audioEngine.speak(
      'Lookout AI security alert. Human entity identified at perimeter access point. Verification active.',
      settings.ttsVoiceRate,
      settings.ttsVoicePitch
    );
    setTimeout(() => setIsTestingSpeech(false), 3500);
  };

  const handleRequestPushPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert('HTML5 Web Notifications API not supported in this browser environment.');
      return;
    }
    const perm = await Notification.requestPermission();
    setPushStatus(perm);
    if (perm === 'granted') {
      onChange({ ...settings, browserPush: true });
      try {
        new Notification('Lookout AI Security', {
          body: 'Browser push notifications successfully connected!',
          icon: '/icon.svg',
        });
      } catch {}
    } else {
      onChange({ ...settings, browserPush: false });
    }
  };

  const handleAddContact = () => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    const newContact: EmergencyContact = {
      id: `ec-${Date.now()}`,
      name: contactName.trim(),
      phone: contactPhone.trim(),
      relation: contactRelation.trim() || 'Emergency Contact',
    };
    onEmergencyContactsChange([...emergencyContacts, newContact]);
    setContactName('');
    setContactPhone('');
    setContactRelation('');
  };

  const handleRemoveContact = (id: string) => {
    onEmergencyContactsChange(emergencyContacts.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-950/80 border border-purple-800/60 rounded-xl text-purple-400">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              Alert Notifications & Custom Tones Engine
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Multi-channel security dispatch, acoustic alert tones, synthetic voice narration, and quiet schedules
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 1: CUSTOM ALERT TONE SELECTION & VOLUME */}
      <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-mono font-bold uppercase text-white">
              Primary Security Alert Tone Selection
            </h4>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400">AUDIBLE CHIMES:</span>
            <button
              onClick={() => onChange({ ...settings, audibleChime: !settings.audibleChime })}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                settings.audibleChime
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-950'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {settings.audibleChime ? 'ENABLED' : 'MUTED'}
            </button>
          </div>
        </div>

        {/* Tone Volume Slider */}
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {settings.alertToneVolume === 0 ? (
              <VolumeX className="w-4 h-4 text-slate-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-purple-400" />
            )}
            <div>
              <span className="font-bold text-slate-200">Alert Sound Volume</span>
              <span className="text-[10px] text-slate-400 block">Controls acoustic intensity of alert sirens and pings</span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:w-64">
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.05"
              value={settings.alertToneVolume}
              onChange={(e) => onChange({ ...settings, alertToneVolume: parseFloat(e.target.value) })}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <span className="text-purple-400 font-bold w-12 text-right">
              {(settings.alertToneVolume * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* 7 Alert Tones Interactive Picker Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 font-mono text-xs pt-1">
          {ALERT_TONES.map((tone) => {
            const isSelected = settings.customTone === tone.id;
            const isPlaying = playingTone === tone.id;
            return (
              <div
                key={tone.id}
                className={`p-3 rounded-xl border transition flex flex-col justify-between ${
                  isSelected
                    ? 'bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/30'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                      {tone.category}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-bold text-purple-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-white text-xs mt-1">{tone.name}</div>
                  <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-snug">
                    {tone.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-3 mt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => handlePreviewTone(tone.id)}
                    className="flex-1 py-1.5 px-2 bg-slate-950 hover:bg-purple-900/60 border border-slate-700 hover:border-purple-500 text-purple-300 font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-[11px]"
                  >
                    <Play className={`w-3 h-3 ${isPlaying ? 'text-emerald-400 animate-spin' : ''}`} />
                    <span>{isPlaying ? 'PLAYING...' : 'PREVIEW'}</span>
                  </button>

                  <button
                    onClick={() => onChange({ ...settings, customTone: tone.id })}
                    disabled={isSelected}
                    className={`py-1.5 px-3 rounded-lg font-bold transition text-[11px] ${
                      isSelected
                        ? 'bg-purple-600 text-white cursor-default'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {isSelected ? 'SELECTED' : 'SELECT'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: NOTIFICATION CHANNELS & SCHEDULE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        {/* Notification Delivery Channels */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h4 className="font-bold uppercase text-white flex items-center gap-2 text-xs">
            <Radio className="w-4 h-4 text-cyan-400" />
            Alert Delivery Channels
          </h4>

          <div className="space-y-2">
            {/* Visual HUD Banners */}
            <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.visualBanners}
                onChange={(e) => onChange({ ...settings, visualBanners: e.target.checked })}
                className="accent-cyan-500 rounded mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-200 block">On-Screen HUD Banners</span>
                <span className="text-[10px] text-slate-400">
                  Real-time colored telemetry banner displayed over active video viewport
                </span>
              </div>
            </label>

            {/* Browser Push Notifications */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div className="flex-1 pr-2">
                <span className="font-bold text-slate-200 block">Browser Push Notifications</span>
                <span className="text-[10px] text-slate-400 block">
                  Delivers desktop/mobile background push notifications when minimized
                </span>
                <span className="text-[9px] text-slate-500 mt-1 block">
                  PERMISSION: {pushStatus.toUpperCase()}
                </span>
              </div>
              <button
                onClick={handleRequestPushPermission}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-950 border border-cyan-700 text-cyan-300 font-bold shrink-0 hover:bg-cyan-900 transition"
              >
                {pushStatus === 'granted' ? 'CONNECTED' : 'ENABLE PUSH'}
              </button>
            </div>

            {/* Critical Siren Alarm */}
            <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.criticalThreatSiren}
                onChange={(e) => onChange({ ...settings, criticalThreatSiren: e.target.checked })}
                className="accent-red-500 rounded mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-200 block">Threat Level Siren Override</span>
                <span className="text-[10px] text-slate-400">
                  Automatically escalates tone to emergency warble siren on Critical threats
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Cooldown & Quiet Hours Schedule */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h4 className="font-bold uppercase text-white flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4 text-amber-400" />
            Alert Cooldown & Quiet Schedule
          </h4>

          {/* Cooldown Slider */}
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-slate-300">
              <span className="font-bold">ALERT RE-TRIGGER COOLDOWN</span>
              <span className="text-amber-400 font-bold">{settings.cooldownSeconds}s</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Suppresses identical category duplicate alerts within this time window.
            </p>
            <input
              type="range"
              min="5"
              max="120"
              step="5"
              value={settings.cooldownSeconds}
              onChange={(e) => onChange({ ...settings, cooldownSeconds: parseInt(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>5s (Instant)</span>
              <span>15s (Optimal)</span>
              <span>120s (Minimal)</span>
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">Quiet Hours (Do Not Disturb)</span>
              <input
                type="checkbox"
                checked={settings.quietHoursEnabled}
                onChange={(e) => onChange({ ...settings, quietHoursEnabled: e.target.checked })}
                className="accent-amber-500 rounded"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span className="text-[9px] text-slate-400 block mb-0.5">MUTE START</span>
                <input
                  type="time"
                  value={settings.quietHoursStart}
                  onChange={(e) => onChange({ ...settings, quietHoursStart: e.target.value })}
                  disabled={!settings.quietHoursEnabled}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-slate-200 disabled:opacity-40"
                />
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block mb-0.5">MUTE END</span>
                <input
                  type="time"
                  value={settings.quietHoursEnd}
                  onChange={(e) => onChange({ ...settings, quietHoursEnd: e.target.value })}
                  disabled={!settings.quietHoursEnabled}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-slate-200 disabled:opacity-40"
                />
              </div>
            </div>
            <span className="text-[9px] text-slate-500 block">
              Mutes acoustic chimes while keeping HUD visual recording active.
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 3: AI SPEECH SYNTHESIZER (TTS) NARRATION */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-purple-400" />
            <h4 className="font-bold uppercase text-white">AI Spoken Scene Narration (TTS)</h4>
          </div>
          <button
            onClick={() => onChange({ ...settings, ttsVoiceEnabled: !settings.ttsVoiceEnabled })}
            className={`px-3 py-1 rounded-lg font-bold transition ${
              settings.ttsVoiceEnabled
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {settings.ttsVoiceEnabled ? 'VOICE ACTIVE' : 'MUTED'}
          </button>
        </div>

        <p className="text-slate-400 text-[11px]">
          Uses synthetic voice to articulate scene activity, detected family members, and obstacle hazards for hands-free audio surveillance.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Rate Slider */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
            <div className="flex justify-between text-[11px] text-slate-300 mb-1">
              <span>VOICE SPEED</span>
              <span className="text-purple-400 font-bold">{settings.ttsVoiceRate.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.50"
              step="0.05"
              value={settings.ttsVoiceRate}
              onChange={(e) => onChange({ ...settings, ttsVoiceRate: parseFloat(e.target.value) })}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>0.75x (Deliberate)</span>
              <span>1.50x (Brisk)</span>
            </div>
          </div>

          {/* Pitch Slider */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
            <div className="flex justify-between text-[11px] text-slate-300 mb-1">
              <span>VOICE PITCH</span>
              <span className="text-purple-400 font-bold">{settings.ttsVoicePitch.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.35"
              step="0.05"
              value={settings.ttsVoicePitch}
              onChange={(e) => onChange({ ...settings, ttsVoicePitch: parseFloat(e.target.value) })}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>Deep Low Tone</span>
              <span>Higher Tone</span>
            </div>
          </div>

          {/* Test TTS Button */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold">TEST SPEECH SYNTHESIS</span>
            <button
              onClick={handleTestTTS}
              disabled={isTestingSpeech}
              className="w-full py-2 bg-purple-950 hover:bg-purple-900 border border-purple-700 text-purple-300 font-bold rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <Mic className={`w-3.5 h-3.5 ${isTestingSpeech ? 'animate-pulse text-emerald-400' : ''}`} />
              <span>{isTestingSpeech ? 'SPEAKING...' : 'TEST NARRATION'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: EMERGENCY DISPATCH CONTACTS */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-400" />
            <h4 className="font-bold uppercase text-white">Emergency Contacts</h4>
          </div>
        </div>

        {/* Existing Contacts */}
        <div className="space-y-2">
          {emergencyContacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800"
            >
              <div>
                <span className="font-bold text-white">{c.name}</span>
                <span className="text-slate-400 ml-2">({c.relation})</span>
                <div className="text-emerald-400 text-[11px]">{c.phone}</div>
              </div>
              <button
                onClick={() => handleRemoveContact(c.id)}
                className="p-1.5 text-slate-500 hover:text-red-400 rounded transition"
                title="Remove contact"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Contact Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
          <input
            type="text"
            placeholder="Name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
          />
          <input
            type="text"
            placeholder="Phone Number"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
          />
          <input
            type="text"
            placeholder="Relation (Sister, Neighbor)"
            value={contactRelation}
            onChange={(e) => setContactRelation(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
          />
          <button
            onClick={handleAddContact}
            className="bg-cyan-600 hover:bg-cyan-500 font-bold text-white p-2 rounded-lg flex items-center justify-center gap-1 transition"
          >
            <Plus className="w-4 h-4" />
            ADD CONTACT
          </button>
        </div>
      </div>
    </div>
  );
};
