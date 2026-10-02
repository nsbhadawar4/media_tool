'use client';

import { useEffect, useState } from 'react';
import { GameCountdown } from '../../GameCountdown';

/** 3… 2… 1… LUDO! — runs while the server's start countdown is in progress. */
export function StartCountdown() {
  const [value, setValue] = useState<number | string>(3);
  useEffect(() => {
    const ids = [
      setTimeout(() => setValue(2), 1000),
      setTimeout(() => setValue(1), 2000),
      setTimeout(() => setValue('LUDO!'), 3000),
    ];
    return () => ids.forEach(clearTimeout);
  }, []);
  return <GameCountdown value={value} color="#F4C430" />;
}
