import { useEffect, useState } from 'react';
import { detectScionDeviceCapability } from '../lib/scionDeviceCapability';

const IDLE = Object.freeze({
  phase: 'idle',
  code: null,
  message: '',
  localModel: false,
  evidenceCompiler: false,
});

export default function useScionDeviceCapability(enabled = true) {
  const [capability, setCapability] = useState(IDLE);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setCapability(IDLE);
      return () => {
        active = false;
      };
    }
    setCapability({ ...IDLE, phase: 'checking', message: 'Checking this device…' });
    detectScionDeviceCapability().then((next) => {
      if (active) setCapability(next);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return capability;
}
