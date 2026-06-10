'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

export function TextToSpeechWidget() {
  const [text, setText] = useState('Hello! Type anything here and press play to hear it spoken aloud.');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [supported, setSupported] = useState(true);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length) {
        setVoices(list);
        setVoiceURI((cur) => cur || list.find((v) => v.default)?.voiceURI || list[0].voiceURI);
      }
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const handlePlay = () => {
    if (!supported || !text.trim()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = pitch;
    u.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    u.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utterRef.current = u;
    synth.speak(u);
    setSpeaking(true);
    setPaused(false);
  };

  const handlePauseResume = () => {
    const synth = window.speechSynthesis;
    if (paused) {
      synth.resume();
      setPaused(false);
    } else {
      synth.pause();
      setPaused(true);
    }
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  };

  if (!supported) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        Your browser doesn&apos;t support speech synthesis. Try the latest Chrome, Edge, or Safari.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="tts-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Text to read aloud
        </label>
        <textarea
          id="tts-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste the text you want spoken…"
          rows={6}
          className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label htmlFor="tts-voice" className="mb-2 block text-sm font-semibold text-ink-700">
            Voice
          </label>
          <select
            id="tts-voice"
            value={voiceURI}
            onChange={(e) => setVoiceURI(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          >
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="tts-rate" className="text-sm font-semibold text-ink-700">Speed</label>
            <span className="text-xs font-semibold text-ink-500">{rate.toFixed(1)}×</span>
          </div>
          <input id="tts-rate" type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-wa-green" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="tts-pitch" className="text-sm font-semibold text-ink-700">Pitch</label>
            <span className="text-xs font-semibold text-ink-500">{pitch.toFixed(1)}</span>
          </div>
          <input id="tts-pitch" type="range" min={0} max={2} step={0.1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} className="w-full accent-wa-green" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handlePlay}
          disabled={!text.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {speaking ? 'Restart' : 'Play'}
        </button>
        <button
          type="button"
          onClick={handlePauseResume}
          disabled={!speaking}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:border-wa-green/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pause className="h-4 w-4" />
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={!speaking}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:border-wa-green/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Square className="h-4 w-4" />
          Stop
        </button>
      </div>

      {text && (() => {
        const cta = buildToolPrefill('text-to-speech', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: playback uses the natural voices already installed on your device, so the voice list
        changes between phones and browsers. Everything runs locally — nothing is uploaded.
      </p>
    </div>
  );
}
