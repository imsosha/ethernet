import type { FC } from '../../../lib/teact/teact';
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from '../../../lib/teact/teact';

import buildClassName from '../../../util/buildClassName';

import styles from './EthernetAnimatedLogo.module.scss';

type OwnProps = {
  onClick?: () => void;
  className?: string;
};

const TARGET_LETTERS = ['e', 't', 'h', 'e', 'r', 'n', 'e', 't'];

// Whitelist of characters for proximity scramble
const SCRAMBLE_CHARS = ['e', 't', 'h', 'r', 'n', 'x', '4', 'w', 'q', '[', ']', '/', '.'];

function getRandomScrambleChar(avoid?: string): string {
  const pool = avoid ? SCRAMBLE_CHARS.filter((c) => c !== avoid) : SCRAMBLE_CHARS;
  return pool[Math.floor(Math.random() * pool.length)];
}

const PROXIMITY_RADIUS = 0.35; // Normalized cursor proximity radius
const SCRAMBLE_TICK_MS = 95; // Deliberate, smooth scramble speed

const EthernetAnimatedLogo: FC<OwnProps> = ({ onClick, className }) => {
  const containerRef = useRef<HTMLButtonElement | null>(null);
  const [letters, setLetters] = useState<string[]>(() => [...TARGET_LETTERS]);
  const [activeIndices, setActiveIndices] = useState<Set<number>>(() => new Set());
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const cursorNormalizedX = useRef<number | null>(null);
  const animLoopRef = useRef<number | undefined>(undefined);
  const lastTickTimeRef = useRef<number>(0);
  const settleTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Frame update loop with deliberate throttle for proximity scramble
  const updateScramble = useCallback((timestamp: number) => {
    if (cursorNormalizedX.current === null) {
      return;
    }

    if (timestamp - lastTickTimeRef.current >= SCRAMBLE_TICK_MS) {
      lastTickTimeRef.current = timestamp;

      const normX = cursorNormalizedX.current;
      const active = new Set<number>();
      const total = TARGET_LETTERS.length;

      const nextLetters = TARGET_LETTERS.map((char, index) => {
        const charCenter = (index + 0.5) / total;
        const dist = Math.abs(normX - charCenter);

        if (dist < PROXIMITY_RADIUS) {
          active.add(index);
          const intensity = 1 - dist / PROXIMITY_RADIUS;
          if (Math.random() < 0.25 + intensity * 0.65) {
            return getRandomScrambleChar(char);
          }
        }
        return char;
      });

      setLetters(nextLetters);
      setActiveIndices(active);
    }

    animLoopRef.current = requestAnimationFrame(updateScramble);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    cursorNormalizedX.current = normX;

    if (!isHovered) {
      setIsHovered(true);
    }

    if (!animLoopRef.current) {
      lastTickTimeRef.current = 0;
      animLoopRef.current = requestAnimationFrame(updateScramble);
    }
  }, [isHovered, updateScramble]);

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    setIsHovered(true);
    handleMouseMove(e);
  }, [handleMouseMove]);

  const handleMouseLeave = useCallback(() => {
    cursorNormalizedX.current = null;
    setIsHovered(false);

    if (animLoopRef.current) {
      cancelAnimationFrame(animLoopRef.current);
      animLoopRef.current = undefined;
    }

    // Smooth settle back to original letters
    let step = 0;
    const totalSteps = 4;
    const settle = () => {
      step += 1;
      if (step >= totalSteps) {
        setLetters([...TARGET_LETTERS]);
        setActiveIndices(new Set());
      } else {
        setLetters((prev) => prev.map((c, i) => (Math.random() < 0.5 ? TARGET_LETTERS[i] : c)));
        settleTimeoutRef.current = setTimeout(settle, 50);
      }
    };
    settle();
  }, []);

  // Burst animation on click
  const handleClick = useCallback(() => {
    onClick?.();

    let burstStep = 0;
    const burst = () => {
      burstStep += 1;
      if (burstStep > 6) {
        setLetters([...TARGET_LETTERS]);
        setActiveIndices(new Set());
      } else {
        setLetters(TARGET_LETTERS.map((char) => (Math.random() < 0.7 ? getRandomScrambleChar(char) : char)));
        setActiveIndices(new Set(TARGET_LETTERS.map((_, i) => i)));
        setTimeout(burst, 70);
      }
    };
    burst();
  }, [onClick]);

  useEffect(() => {
    return () => {
      if (animLoopRef.current) cancelAnimationFrame(animLoopRef.current);
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    };
  }, []);

  return (
    <button
      ref={containerRef}
      type="button"
      className={buildClassName(styles.root, className)}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title="@ethernetgram"
      aria-label="Ethernet Official Channel"
    >
      <span className={styles.foregroundText}>
        {letters.map((char, index) => {
          const isActive = activeIndices.has(index);
          return (
            <span
              key={index}
              className={buildClassName(styles.letter, isActive && styles.scrambling)}
            >
              {char}
            </span>
          );
        })}
      </span>
    </button>
  );
};

export default memo(EthernetAnimatedLogo);
