/**
 * The sidebar's Lucide icons, drawn the same but able to move. Their motion follows the
 * MIT-licensed AnimateIcons set (https://animateicons.in, github.com/Avijit07x/animateicons,
 * © Avijit Dey); Settings2 has no counterpart there, so its motion is our own.
 *
 * An icon plays only when asked (`start()`), once, and never under reduced or off motion or
 * the system's reduce-motion setting.
 */
import { motion, useAnimation, type Transition, type Variants } from 'motion/react';
import { forwardRef, useImperativeHandle, type ForwardRefExoticComponent, type ReactNode, type RefAttributes } from 'react';
import { cn } from '@renderer/lib/cn';

export interface MotionIconHandle {
  start(): void;
  stop(): void;
}

export type MotionIcon = ForwardRefExoticComponent<{ className?: string } & RefAttributes<MotionIconHandle>>;

function motionAllowed(): boolean {
  const setting = document.documentElement.dataset.motion;
  return (setting === undefined || setting === 'full') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function createMotionIcon(name: string, children: ReactNode, variants?: Variants): MotionIcon {
  const Icon = forwardRef<MotionIconHandle, { className?: string }>(({ className }, ref) => {
    const controls = useAnimation();
    useImperativeHandle(
      ref,
      () => ({
        start: () => {
          if (motionAllowed()) void controls.start('animate');
        },
        stop: () => void controls.start('normal'),
      }),
      [controls],
    );
    return (
      <motion.svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={cn('lucide overflow-visible', className)}
        animate={controls}
        initial="normal"
        variants={variants}
      >
        {children}
      </motion.svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

const settle: Transition = { duration: 0.6, ease: 'easeInOut', times: [0, 0.35, 0.7, 1] };
const pulse = (scale: number[], delay = 0): Variants => ({
  normal: { scale: 1 },
  animate: { scale, transition: { ...settle, delay } },
});
const nudge = (axis: 'x' | 'y', path: number[], delay = 0, duration = 0.6): Variants =>
  axis === 'x'
    ? { normal: { x: 0 }, animate: { x: path, transition: { duration, ease: 'easeInOut', delay } } }
    : { normal: { y: 0 }, animate: { y: path, transition: { duration, ease: 'easeInOut', delay } } };
const origin = (x: number, y: number) => ({ transformBox: 'view-box' as const, originX: `${x}px`, originY: `${y}px` });

export const MicMotion = createMotionIcon(
  'MicMotion',
  <>
    <motion.rect x="9" y="2" width="6" height="13" rx="3" variants={pulse([1, 1.1, 0.96, 1])} style={origin(12, 8.5)} />
    <motion.g variants={pulse([1, 1.06, 0.97, 1], 0.1)} style={origin(12, 10)}>
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    </motion.g>
  </>,
);

const word = (length: number, delay: number): Variants => ({
  normal: { strokeDashoffset: 0, opacity: 1 },
  animate: {
    strokeDashoffset: [length, 0],
    opacity: [0, 1],
    transition: { strokeDashoffset: { duration: 0.3, ease: 'easeOut', delay }, opacity: { duration: 0.25, delay } },
  },
});

export const CaptionsMotion = createMotionIcon(
  'CaptionsMotion',
  <>
    <rect width="18" height="14" x="3" y="5" rx="2" ry="2" />
    <motion.path d="M7 11h2" strokeDasharray="2" variants={word(2, 0.05)} />
    <motion.path d="M13 11h4" strokeDasharray="4" variants={word(4, 0.17)} />
    <motion.path d="M7 15h4" strokeDasharray="4" variants={word(4, 0.32)} />
    <motion.path d="M15 15h2" strokeDasharray="2" variants={word(2, 0.44)} />
  </>,
);

export const Volume2Motion = createMotionIcon(
  'Volume2Motion',
  <>
    <motion.path
      d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
      variants={pulse([1, 1.1, 0.96, 1])}
      style={origin(6.5, 12)}
    />
    <motion.path d="M16 9a5 5 0 0 1 0 6" variants={nudge('x', [0, 1.5, -0.4, 0], 0.1)} />
    <motion.path d="M19.364 18.364a9 9 0 0 0 0-12.728" variants={nudge('x', [0, 0.9, -0.3, 0], 0.2)} />
  </>,
);

export const HistoryMotion = createMotionIcon(
  'HistoryMotion',
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <motion.path
      d="M3 3v5h5"
      variants={{
        normal: { x: 0, y: 0 },
        animate: { x: [0, -1.5, 0.5, 0], y: [0, -1.5, 0.5, 0], transition: settle },
      }}
    />
    <motion.path
      d="M12 7v5"
      variants={{
        normal: { rotate: 0, transition: { duration: 0 } },
        animate: { rotate: [0, -360], transition: { duration: 0.9, ease: 'easeInOut' } },
      }}
      style={origin(12, 12)}
    />
    <path d="M12 12l4 2" />
  </>,
);

const hop: Variants = {
  normal: { y: 0 },
  animate: (i: number) => ({ y: [0, -2 - i, 0], transition: { duration: 0.54, delay: i * 0.08, ease: 'easeInOut' } }),
};

export const BoxesMotion = createMotionIcon(
  'BoxesMotion',
  <>
    <motion.g variants={hop} custom={2}>
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
      <path d="m7 16.5-4.74-2.85" />
      <path d="m7 16.5 5-3" />
      <path d="M7 16.5v5.17" />
    </motion.g>
    <motion.g variants={hop} custom={1}>
      <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
      <path d="m17 16.5-5-3" />
      <path d="m17 16.5 4.74-2.85" />
      <path d="M17 16.5v5.17" />
    </motion.g>
    <motion.g variants={hop} custom={0}>
      <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
      <path d="M12 8 7.26 5.15" />
      <path d="m12 8 4.74-2.85" />
      <path d="M12 13.5V8" />
    </motion.g>
  </>,
  { normal: { scale: 1 }, animate: { scale: [1, 1.04, 1], transition: { duration: 0.6, ease: 'easeInOut' } } },
);

const bar = (scale: number, delay: number): Variants => ({
  normal: { scaleY: 1 },
  animate: { scaleY: [1, scale, 1], transition: { duration: 0.6, ease: 'easeInOut', delay } },
});

export const AudioLinesMotion = createMotionIcon(
  'AudioLinesMotion',
  <>
    <motion.path d="M2 10v3" variants={bar(2.4, 0)} style={origin(2, 11.5)} />
    <motion.path d="M6 6v11" variants={bar(0.55, 0.05)} style={origin(6, 11.5)} />
    <motion.path d="M10 3v18" variants={bar(0.55, 0.1)} style={origin(10, 12)} />
    <motion.path d="M14 8v7" variants={bar(1.7, 0.15)} style={origin(14, 11.5)} />
    <motion.path d="M18 5v13" variants={bar(0.6, 0.2)} style={origin(18, 11.5)} />
    <motion.path d="M22 10v3" variants={bar(2.4, 0.25)} style={origin(22, 11.5)} />
  </>,
);

export const SparklesMotion = createMotionIcon(
  'SparklesMotion',
  <>
    <motion.path
      d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
      variants={{
        normal: { rotate: 0, scale: 1 },
        animate: { rotate: [0, 14, -8, 0], scale: [1, 1.1, 0.95, 1], transition: { ...settle, duration: 0.8 } },
      }}
      style={origin(12, 12)}
    />
    <motion.g
      variants={{
        normal: { rotate: 0, scale: 1 },
        animate: { rotate: [0, 45, 0], scale: [1, 1.3, 1], transition: { duration: 0.6, ease: 'easeInOut', delay: 0.12 } },
      }}
      style={origin(20, 4)}
    >
      <path d="M20 2v4" />
      <path d="M22 4h-4" />
    </motion.g>
    <motion.circle cx="4" cy="20" r="2" variants={pulse([1, 1.4, 0.9, 1], 0.25)} style={origin(4, 20)} />
  </>,
);

const twinkle: Variants = {
  normal: { scale: 1, opacity: 1 },
  animate: (i: number) => ({
    scale: [1, 0, 1.3, 1],
    opacity: [1, 0, 1, 1],
    transition: { duration: 0.5, ease: 'easeOut', times: [0, 0.25, 0.65, 1], delay: 0.15 + i * 0.12 },
  }),
};

export const WandSparklesMotion = createMotionIcon(
  'WandSparklesMotion',
  <>
    <motion.g
      variants={{ normal: { rotate: 0 }, animate: { rotate: [0, -8, 5, -2, 0], transition: { duration: 0.7, ease: 'easeInOut' } } }}
      style={origin(3, 21)}
    >
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
      <path d="m14 7 3 3" />
    </motion.g>
    <motion.g variants={twinkle} custom={0} style={origin(5, 8)}>
      <path d="M5 6v4" />
      <path d="M7 8H3" />
    </motion.g>
    <motion.g variants={twinkle} custom={1} style={origin(10, 3)}>
      <path d="M10 2v2" />
      <path d="M11 3H9" />
    </motion.g>
    <motion.g variants={twinkle} custom={2} style={origin(19, 16)}>
      <path d="M19 14v4" />
      <path d="M21 16h-4" />
    </motion.g>
  </>,
);

const chevron = (direction: 1 | -1): Variants => ({
  normal: { x: 0 },
  animate: { x: [0, 2.5 * direction, 0, 2.5 * direction, 0], transition: { duration: 0.8, ease: 'easeInOut', times: [0, 0.25, 0.5, 0.75, 1] } },
});

export const PanelLeftCloseMotion = createMotionIcon(
  'PanelLeftCloseMotion',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <motion.path d="M9 3v18" variants={nudge('x', [0, -2, 0])} />
    <motion.path d="m16 15-3-3 3-3" variants={chevron(-1)} />
  </>,
);

export const PanelLeftOpenMotion = createMotionIcon(
  'PanelLeftOpenMotion',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <motion.path d="M9 3v18" variants={nudge('x', [0, 2, 0])} />
    <motion.path d="m14 9 3 3-3 3" variants={chevron(1)} />
  </>,
);

/** Lucide's Settings2: two slider knobs that pass each other and come back. */
export const Settings2Motion = createMotionIcon(
  'Settings2Motion',
  <>
    <path d="M14 17H5" />
    <path d="M19 7h-9" />
    <motion.circle cx="17" cy="17" r="3" variants={nudge('x', [0, -5, 0.6, 0], 0.05, 0.7)} />
    <motion.circle cx="7" cy="7" r="3" variants={nudge('x', [0, 5, -0.6, 0], 0, 0.7)} />
  </>,
);
