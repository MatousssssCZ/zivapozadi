/** Šablony kostry pro vektorové postavy bez otevřené scény (laboratoř postav) – převzaté z knihovny dílů. */
import type { SkeletonTemplate } from '../anim/skeleton';

export const BASE_TEMPLATES: Record<'adult' | 'child', SkeletonTemplate & { id: string }> = {
 "adult": {
  "id": "adult-cg",
  "label": "Dospělý (reference v2)",
  "height": 130,
  "bones": {
   "thigh": 32,
   "shin": 30,
   "ankleHeight": 3,
   "torso": 43,
   "neck": 13,
   "shoulderDrop": 4,
   "upperArm": 24,
   "forearm": 21
  },
  "views": {
   "front3q": {
    "forward": {
     "x": 0.72,
     "y": 0.3
    },
    "hipSpread": 6.54,
    "shoulderSpread": 8.69,
    "headOffsetX": 0,
    "shoulderOffsetX": 0.37,
    "nearSide": -1
   },
   "back3q": {
    "forward": {
     "x": 0.72,
     "y": -0.3
    },
    "hipSpread": 6.55,
    "shoulderSpread": 8.71,
    "headOffsetX": 0,
    "shoulderOffsetX": -0.1,
    "nearSide": 1
   }
  },
  "gait": {
   "strideLength": 100,
   "stanceFraction": 0.58,
   "stepLift": 6.5,
   "armSwing": 0.36,
   "maxDip": 2.2,
   "sway": 1.1,
   "lean": 0.035
  },
  "idle": {
   "breathe": 0.5,
   "headAmp": 0.02,
   "shiftAmp": 1.4,
   "shiftPeriod": 7.5
  },
  "proportions": {
   "height": [
    0.95,
    1.05
   ],
   "build": [
    0.95,
    1.05
   ]
  },
  "motionRanges": {
   "strideScale": [
    0.9,
    1.1
   ],
   "armSwing": [
    0.65,
    1.35
   ],
   "bob": [
    0.8,
    1.2
   ],
   "sway": [
    0.75,
    1.25
   ],
   "idleTempo": [
    0.85,
    1.15
   ],
   "lean": [
    0,
    3
   ],
   "speed": [
    0.85,
    1.25
   ],
   "armLag": [
    -2,
    4
   ],
   "armLR": [
    0.85,
    1.15
   ]
  },
  "foot": {
   "heel": 3.33,
   "toe": 7.95
  }
 },
 "child": {
  "id": "child-cg",
  "label": "Dítě (~7 let, balík Liberec)",
  "height": 89,
  "bones": {
   "thigh": 20,
   "shin": 18.5,
   "ankleHeight": 2.5,
   "torso": 27,
   "neck": 8.5,
   "shoulderDrop": 3,
   "upperArm": 15,
   "forearm": 13
  },
  "views": {
   "front3q": {
    "forward": {
     "x": 0.72,
     "y": 0.3
    },
    "hipSpread": 4.85,
    "shoulderSpread": 5.83,
    "headOffsetX": 0,
    "shoulderOffsetX": 0.34,
    "nearSide": -1
   },
   "back3q": {
    "forward": {
     "x": 0.72,
     "y": -0.3
    },
    "hipSpread": 4.69,
    "shoulderSpread": 5.65,
    "headOffsetX": 0,
    "shoulderOffsetX": 0.05,
    "nearSide": 1
   }
  },
  "gait": {
   "strideLength": 62,
   "stanceFraction": 0.58,
   "stepLift": 4,
   "armSwing": 0.4,
   "maxDip": 1.4,
   "sway": 0.7,
   "lean": 0.03
  },
  "idle": {
   "breathe": 0.35,
   "headAmp": 0.025,
   "shiftAmp": 0.9,
   "shiftPeriod": 5.5
  },
  "proportions": {
   "height": [
    0.95,
    1.05
   ],
   "build": [
    0.95,
    1.05
   ]
  },
  "motionRanges": {
   "strideScale": [
    0.9,
    1.1
   ],
   "armSwing": [
    0.65,
    1.35
   ],
   "bob": [
    0.8,
    1.2
   ],
   "sway": [
    0.75,
    1.25
   ],
   "idleTempo": [
    0.85,
    1.15
   ],
   "lean": [
    0,
    3
   ],
   "speed": [
    0.85,
    1.25
   ],
   "armLag": [
    -2,
    4
   ],
   "armLR": [
    0.85,
    1.15
   ]
  },
  "foot": {
   "heel": 2.44,
   "toe": 5.2
  }
 }
} as never;
