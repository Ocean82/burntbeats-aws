import { useCallback, useEffect, useRef, useState } from "react";

export interface WebMidiInputDevice {
  id: string;
  name: string;
}

export interface UseWebMidiInputReturn {
  isSupported: boolean;
  isEnabled: boolean;
  devices: WebMidiInputDevice[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
  setEnabled: (enabled: boolean) => void;
}

interface UseWebMidiInputOptions {
  onNoteOn?: (pitch: number, velocity: number) => void;
  onNoteOff?: (pitch: number) => void;
}

export function useWebMidiInput(options: UseWebMidiInputOptions = {}): UseWebMidiInputReturn {
  const [isSupported] = useState(
    () => typeof navigator !== "undefined" && "requestMIDIAccess" in navigator,
  );
  const [isEnabled, setIsEnabled] = useState(false);
  const [devices, setDevices] = useState<WebMidiInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const accessRef = useRef<MIDIAccess | null>(null);
  const handlersRef = useRef(options);

  useEffect(() => {
    handlersRef.current = options;
  }, [options]);

  const attachInput = useCallback((input: MIDIInput) => {
    input.onmidimessage = (event: MIDIMessageEvent) => {
      const [status, note, velocity] = event.data ?? [];
      if (status == null || note == null) return;
      const command = status >> 4;
      if (command === 9 && velocity > 0) {
        handlersRef.current.onNoteOn?.(note, velocity);
      } else if (command === 8 || (command === 9 && velocity === 0)) {
        handlersRef.current.onNoteOff?.(note);
      }
    };
  }, []);

  const refreshDevices = useCallback((access: MIDIAccess) => {
    const list: WebMidiInputDevice[] = [];
    for (const input of access.inputs.values()) {
      list.push({ id: input.id, name: input.name || "MIDI Input" });
    }
    setDevices(list);
    if (!selectedDeviceId && list.length > 0) {
      setSelectedDeviceId(list[0].id);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!isSupported || !isEnabled) return;

    let cancelled = false;

    void navigator.requestMIDIAccess().then((access) => {
      if (cancelled) return;
      accessRef.current = access;
      refreshDevices(access);
      access.onstatechange = () => refreshDevices(access);
      for (const input of access.inputs.values()) {
        if (!selectedDeviceId || input.id === selectedDeviceId) {
          attachInput(input);
        }
      }
    });

    return () => {
      cancelled = true;
      if (accessRef.current) {
        for (const input of accessRef.current.inputs.values()) {
          input.onmidimessage = null;
        }
      }
    };
  }, [isSupported, isEnabled, selectedDeviceId, attachInput, refreshDevices]);

  const setEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
  }, []);

  return {
    isSupported,
    isEnabled,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    setEnabled,
  };
}
