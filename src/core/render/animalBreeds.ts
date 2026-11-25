/** Vygenerováno scripts/process-animal-breeds.py – kotvy dílů ras psů a koček (needitovat ručně). */
export interface BreedInfo { species: "dog" | "cat"; parts: string[]; legs: Record<"fu" | "fl" | "hu" | "hl", { a: [number, number]; b: [number, number] }>; legs_back?: Record<"fu" | "fl" | "hu" | "hl", { a: [number, number]; b: [number, number] }>; ears?: { u: number; v: number; w: number; part: string }[]; ears_back?: { u: number; v: number; w: number; part: string }[]; sizes: Record<string, [number, number]> }
export const BREEDS: Record<string, BreedInfo> = {
 "dog_bernese": {
  "species": "dog",
  "parts": [
   "fl_a",
   "fl_a_back",
   "fl_b",
   "fl_b_back",
   "fu_a",
   "fu_a_back",
   "fu_b",
   "fu_b_back",
   "head",
   "head_back",
   "hl_a",
   "hl_a_back",
   "hl_b",
   "hl_b_back",
   "hu_a",
   "hu_a_back",
   "hu_b",
   "hu_b_back",
   "tail",
   "tail_back",
   "torso",
   "torso_back"
  ],
  "legs": {
   "fu": {
    "a": [
     0.553,
     0.1
    ],
    "b": [
     0.379,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.446,
     0.14
    ],
    "b": [
     0.619,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.574,
     0.1
    ],
    "b": [
     0.269,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.436,
     0.14
    ],
    "b": [
     0.619,
     0.985
    ]
   }
  },
  "legs_back": {
   "fu": {
    "a": [
     0.566,
     0.1
    ],
    "b": [
     0.363,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.421,
     0.14
    ],
    "b": [
     0.609,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.528,
     0.1
    ],
    "b": [
     0.302,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.444,
     0.14
    ],
    "b": [
     0.625,
     0.985
    ]
   }
  },
  "sizes": {
   "torso": [
    388,
    263
   ],
   "head": [
    220,
    302
   ],
   "tail": [
    204,
    275
   ],
   "fu_a": [
    132,
    220
   ],
   "fl_a": [
    101,
    219
   ],
   "fu_b": [
    128,
    215
   ],
   "fl_b": [
    105,
    200
   ],
   "hu_a": [
    175,
    258
   ],
   "hl_a": [
    118,
    226
   ],
   "hu_b": [
    189,
    256
   ],
   "hl_b": [
    117,
    216
   ],
   "torso_back": [
    400,
    261
   ],
   "head_back": [
    224,
    308
   ],
   "tail_back": [
    222,
    286
   ],
   "fu_a_back": [
    128,
    216
   ],
   "fl_a_back": [
    101,
    205
   ],
   "fu_b_back": [
    137,
    211
   ],
   "fl_b_back": [
    105,
    195
   ],
   "hu_a_back": [
    179,
    257
   ],
   "hl_a_back": [
    116,
    226
   ],
   "hu_b_back": [
    188,
    255
   ],
   "hl_b_back": [
    121,
    222
   ]
  }
 },
 "dog_dalmatian": {
  "species": "dog",
  "parts": [
   "fl_a",
   "fl_a_back",
   "fl_b",
   "fl_b_back",
   "fu_a",
   "fu_a_back",
   "fu_b",
   "fu_b_back",
   "head",
   "head_back",
   "hl_a",
   "hl_a_back",
   "hl_b",
   "hl_b_back",
   "hu_a",
   "hu_a_back",
   "hu_b",
   "hu_b_back",
   "tail",
   "tail_back",
   "torso",
   "torso_back"
  ],
  "legs": {
   "fu": {
    "a": [
     0.403,
     0.1
    ],
    "b": [
     0.486,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.33,
     0.14
    ],
    "b": [
     0.587,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.611,
     0.1
    ],
    "b": [
     0.285,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.658,
     0.14
    ],
    "b": [
     0.599,
     0.985
    ]
   }
  },
  "legs_back": {
   "fu": {
    "a": [
     0.39,
     0.1
    ],
    "b": [
     0.535,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.366,
     0.14
    ],
    "b": [
     0.594,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.507,
     0.1
    ],
    "b": [
     0.307,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.653,
     0.14
    ],
    "b": [
     0.566,
     0.985
    ]
   }
  },
  "sizes": {
   "torso": [
    392,
    238
   ],
   "head": [
    243,
    284
   ],
   "tail": [
    190,
    213
   ],
   "fu_a": [
    108,
    235
   ],
   "fl_a": [
    103,
    218
   ],
   "fu_b": [
    99,
    236
   ],
   "fl_b": [
    94,
    212
   ],
   "hu_a": [
    158,
    232
   ],
   "hl_a": [
    101,
    224
   ],
   "hu_b": [
    126,
    232
   ],
   "hl_b": [
    106,
    210
   ],
   "torso_back": [
    387,
    233
   ],
   "head_back": [
    225,
    290
   ],
   "tail_back": [
    194,
    215
   ],
   "fu_a_back": [
    114,
    240
   ],
   "fl_a_back": [
    101,
    208
   ],
   "fu_b_back": [
    106,
    239
   ],
   "fl_b_back": [
    101,
    203
   ],
   "hu_a_back": [
    137,
    229
   ],
   "hl_a_back": [
    98,
    221
   ],
   "hu_b_back": [
    134,
    229
   ],
   "hl_b_back": [
    107,
    204
   ]
  }
 },
 "dog_frenchie": {
  "species": "dog",
  "parts": [
   "fl_a",
   "fl_a_back",
   "fl_b",
   "fl_b_back",
   "fu_a",
   "fu_a_back",
   "fu_b",
   "fu_b_back",
   "head",
   "head_back",
   "hl_a",
   "hl_a_back",
   "hl_b",
   "hl_b_back",
   "hu_a",
   "hu_a_back",
   "hu_b",
   "hu_b_back",
   "tail",
   "tail_back",
   "torso",
   "torso_back"
  ],
  "legs": {
   "fu": {
    "a": [
     0.573,
     0.1
    ],
    "b": [
     0.319,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.525,
     0.14
    ],
    "b": [
     0.593,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.596,
     0.1
    ],
    "b": [
     0.28,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.567,
     0.14
    ],
    "b": [
     0.531,
     0.985
    ]
   }
  },
  "legs_back": {
   "fu": {
    "a": [
     0.538,
     0.1
    ],
    "b": [
     0.38,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.481,
     0.14
    ],
    "b": [
     0.563,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.58,
     0.1
    ],
    "b": [
     0.289,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.608,
     0.14
    ],
    "b": [
     0.453,
     0.985
    ]
   }
  },
  "sizes": {
   "torso": [
    395,
    243
   ],
   "head": [
    265,
    373
   ],
   "tail": [
    86,
    84
   ],
   "fu_a": [
    124,
    184
   ],
   "fl_a": [
    102,
    156
   ],
   "fu_b": [
    119,
    184
   ],
   "fl_b": [
    102,
    155
   ],
   "hu_a": [
    157,
    260
   ],
   "hl_a": [
    97,
    185
   ],
   "hu_b": [
    157,
    230
   ],
   "hl_b": [
    107,
    185
   ],
   "torso_back": [
    396,
    243
   ],
   "head_back": [
    278,
    362
   ],
   "tail_back": [
    93,
    75
   ],
   "fu_a_back": [
    117,
    178
   ],
   "fl_a_back": [
    103,
    154
   ],
   "fu_b_back": [
    123,
    182
   ],
   "fl_b_back": [
    106,
    152
   ],
   "hu_a_back": [
    168,
    260
   ],
   "hl_a_back": [
    106,
    189
   ],
   "hu_b_back": [
    164,
    230
   ],
   "hl_b_back": [
    110,
    185
   ]
  }
 },
 "dog_collie": {
  "species": "dog",
  "parts": [
   "fl_a",
   "fl_a_back",
   "fl_b",
   "fl_b_back",
   "fu_a",
   "fu_a_back",
   "fu_b",
   "fu_b_back",
   "head",
   "head_back",
   "hl_a",
   "hl_a_back",
   "hl_b",
   "hl_b_back",
   "hu_a",
   "hu_a_back",
   "hu_b",
   "hu_b_back",
   "tail",
   "tail_back",
   "torso",
   "torso_back"
  ],
  "legs": {
   "fu": {
    "a": [
     0.592,
     0.1
    ],
    "b": [
     0.396,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.42,
     0.14
    ],
    "b": [
     0.67,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.588,
     0.1
    ],
    "b": [
     0.261,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.547,
     0.14
    ],
    "b": [
     0.658,
     0.985
    ]
   }
  },
  "legs_back": {
   "fu": {
    "a": [
     0.59,
     0.1
    ],
    "b": [
     0.402,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.407,
     0.14
    ],
    "b": [
     0.672,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.56,
     0.1
    ],
    "b": [
     0.278,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.495,
     0.14
    ],
    "b": [
     0.657,
     0.985
    ]
   }
  },
  "sizes": {
   "torso": [
    378,
    248
   ],
   "head": [
    221,
    317
   ],
   "tail": [
    213,
    260
   ],
   "fu_a": [
    120,
    222
   ],
   "fl_a": [
    100,
    193
   ],
   "fu_b": [
    109,
    221
   ],
   "fl_b": [
    107,
    187
   ],
   "hu_a": [
    159,
    266
   ],
   "hl_a": [
    95,
    197
   ],
   "hu_b": [
    161,
    268
   ],
   "hl_b": [
    102,
    199
   ],
   "torso_back": [
    382,
    246
   ],
   "head_back": [
    222,
    316
   ],
   "tail_back": [
    216,
    254
   ],
   "fu_a_back": [
    122,
    222
   ],
   "fl_a_back": [
    102,
    194
   ],
   "fu_b_back": [
    111,
    221
   ],
   "fl_b_back": [
    104,
    188
   ],
   "hu_a_back": [
    158,
    267
   ],
   "hl_a_back": [
    105,
    199
   ],
   "hu_b_back": [
    164,
    267
   ],
   "hl_b_back": [
    103,
    198
   ]
  }
 },
 "dog_husky": {
  "species": "dog",
  "parts": [
   "fl_a",
   "fl_a_back",
   "fl_b",
   "fl_b_back",
   "fu_a",
   "fu_a_back",
   "fu_b",
   "fu_b_back",
   "head",
   "head_back",
   "hl_a",
   "hl_a_back",
   "hl_b",
   "hl_b_back",
   "hu_a",
   "hu_a_back",
   "hu_b",
   "hu_b_back",
   "tail",
   "tail_back",
   "torso",
   "torso_back"
  ],
  "legs": {
   "fu": {
    "a": [
     0.463,
     0.1
    ],
    "b": [
     0.418,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.426,
     0.14
    ],
    "b": [
     0.626,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.533,
     0.1
    ],
    "b": [
     0.338,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.594,
     0.14
    ],
    "b": [
     0.638,
     0.985
    ]
   }
  },
  "legs_back": {
   "fu": {
    "a": [
     0.484,
     0.1
    ],
    "b": [
     0.402,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.395,
     0.14
    ],
    "b": [
     0.629,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.478,
     0.1
    ],
    "b": [
     0.392,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.529,
     0.14
    ],
    "b": [
     0.631,
     0.985
    ]
   }
  },
  "sizes": {
   "torso": [
    392,
    215
   ],
   "head": [
    216,
    322
   ],
   "tail": [
    205,
    267
   ],
   "fu_a": [
    122,
    223
   ],
   "fl_a": [
    95,
    194
   ],
   "fu_b": [
    108,
    228
   ],
   "fl_b": [
    97,
    193
   ],
   "hu_a": [
    151,
    242
   ],
   "hl_a": [
    112,
    197
   ],
   "hu_b": [
    158,
    244
   ],
   "hl_b": [
    114,
    195
   ],
   "torso_back": [
    406,
    216
   ],
   "head_back": [
    207,
    320
   ],
   "tail_back": [
    204,
    275
   ],
   "fu_a_back": [
    123,
    229
   ],
   "fl_a_back": [
    105,
    191
   ],
   "fu_b_back": [
    99,
    229
   ],
   "fl_b_back": [
    97,
    188
   ],
   "hu_a_back": [
    158,
    243
   ],
   "hl_a_back": [
    103,
    197
   ],
   "hu_b_back": [
    162,
    245
   ],
   "hl_b_back": [
    115,
    196
   ]
  }
 },
 "dog_dachshund": {
  "species": "dog",
  "parts": [
   "fl_a",
   "fl_a_back",
   "fl_b",
   "fl_b_back",
   "fu_a",
   "fu_a_back",
   "fu_b",
   "fu_b_back",
   "head",
   "head_back",
   "hl_a",
   "hl_a_back",
   "hl_b",
   "hl_b_back",
   "hu_a",
   "hu_a_back",
   "hu_b",
   "hu_b_back",
   "tail",
   "tail_back",
   "torso",
   "torso_back"
  ],
  "legs": {
   "fu": {
    "a": [
     0.508,
     0.1
    ],
    "b": [
     0.484,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.407,
     0.14
    ],
    "b": [
     0.558,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.529,
     0.1
    ],
    "b": [
     0.359,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.467,
     0.14
    ],
    "b": [
     0.589,
     0.985
    ]
   }
  },
  "legs_back": {
   "fu": {
    "a": [
     0.52,
     0.1
    ],
    "b": [
     0.484,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.464,
     0.14
    ],
    "b": [
     0.53,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.538,
     0.1
    ],
    "b": [
     0.363,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.456,
     0.14
    ],
    "b": [
     0.582,
     0.985
    ]
   }
  },
  "sizes": {
   "torso": [
    410,
    192
   ],
   "head": [
    279,
    301
   ],
   "tail": [
    175,
    125
   ],
   "fu_a": [
    124,
    175
   ],
   "fl_a": [
    86,
    125
   ],
   "fu_b": [
    127,
    175
   ],
   "fl_b": [
    93,
    117
   ],
   "hu_a": [
    153,
    189
   ],
   "hl_a": [
    90,
    129
   ],
   "hu_b": [
    155,
    186
   ],
   "hl_b": [
    94,
    126
   ],
   "torso_back": [
    425,
    192
   ],
   "head_back": [
    262,
    297
   ],
   "tail_back": [
    173,
    124
   ],
   "fu_a_back": [
    125,
    172
   ],
   "fl_a_back": [
    83,
    122
   ],
   "fu_b_back": [
    130,
    175
   ],
   "fl_b_back": [
    89,
    117
   ],
   "hu_a_back": [
    157,
    190
   ],
   "hl_a_back": [
    91,
    125
   ],
   "hu_b_back": [
    157,
    189
   ],
   "hl_b_back": [
    92,
    125
   ]
  }
 },
 "cat_british": {
  "species": "cat",
  "parts": [
   "ear_a",
   "ear_a_back",
   "ear_b",
   "ear_b_back",
   "fl_a",
   "fl_a_back",
   "fl_b",
   "fl_b_back",
   "fu_a",
   "fu_a_back",
   "fu_b",
   "fu_b_back",
   "head",
   "head_back",
   "hl_a",
   "hl_a_back",
   "hl_b",
   "hl_b_back",
   "hu_a",
   "hu_a_back",
   "hu_b",
   "hu_b_back",
   "tail_1",
   "tail_1_back",
   "tail_2",
   "tail_2_back",
   "tail_3",
   "tail_3_back",
   "torso",
   "torso_back"
  ],
  "legs": {
   "fu": {
    "a": [
     0.607,
     0.1
    ],
    "b": [
     0.393,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.419,
     0.14
    ],
    "b": [
     0.596,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.591,
     0.1
    ],
    "b": [
     0.383,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.448,
     0.14
    ],
    "b": [
     0.569,
     0.985
    ]
   }
  },
  "legs_back": {
   "fu": {
    "a": [
     0.569,
     0.1
    ],
    "b": [
     0.428,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.466,
     0.14
    ],
    "b": [
     0.55,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.606,
     0.1
    ],
    "b": [
     0.388,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.444,
     0.14
    ],
    "b": [
     0.571,
     0.985
    ]
   }
  },
  "ears": [
   {
    "u": 0.24,
    "v": 0.22,
    "w": 0.3,
    "part": "ear_a"
   },
   {
    "u": 0.72,
    "v": 0.22,
    "w": 0.28,
    "part": "ear_b"
   }
  ],
  "ears_back": [
   {
    "u": 0.26,
    "v": 0.2,
    "w": 0.3,
    "part": "earb_a"
   },
   {
    "u": 0.66,
    "v": 0.2,
    "w": 0.28,
    "part": "earb_b"
   }
  ],
  "sizes": {
   "ear_a": [
    103,
    110
   ],
   "ear_b": [
    96,
    107
   ],
   "torso": [
    536,
    276
   ],
   "head": [
    298,
    252
   ],
   "tail_1": [
    325,
    163
   ],
   "tail_2": [
    194,
    101
   ],
   "tail_3": [
    155,
    97
   ],
   "fu_a": [
    145,
    180
   ],
   "fu_b": [
    138,
    179
   ],
   "hu_a": [
    137,
    171
   ],
   "hu_b": [
    131,
    176
   ],
   "fl_a": [
    135,
    177
   ],
   "fl_b": [
    130,
    175
   ],
   "hl_a": [
    124,
    182
   ],
   "hl_b": [
    124,
    177
   ],
   "ear_a_back": [
    102,
    108
   ],
   "ear_b_back": [
    102,
    106
   ],
   "torso_back": [
    494,
    294
   ],
   "head_back": [
    298,
    259
   ],
   "tail_1_back": [
    329,
    166
   ],
   "tail_2_back": [
    194,
    108
   ],
   "tail_3_back": [
    155,
    96
   ],
   "fu_a_back": [
    152,
    182
   ],
   "fu_b_back": [
    148,
    180
   ],
   "hu_a_back": [
    156,
    177
   ],
   "hu_b_back": [
    126,
    176
   ],
   "fl_a_back": [
    119,
    171
   ],
   "fl_b_back": [
    133,
    168
   ],
   "hl_a_back": [
    126,
    169
   ],
   "hl_b_back": [
    131,
    171
   ],
   "earb_a": [
    102,
    108
   ],
   "earb_b": [
    102,
    106
   ]
  }
 },
 "cat_mainecoon": {
  "species": "cat",
  "parts": [
   "ear_a",
   "ear_a_back",
   "ear_b",
   "ear_b_back",
   "fl_a",
   "fl_a_back",
   "fl_b",
   "fl_b_back",
   "fu_a",
   "fu_a_back",
   "fu_b",
   "fu_b_back",
   "head",
   "head_back",
   "hl_a",
   "hl_a_back",
   "hl_b",
   "hl_b_back",
   "hu_a",
   "hu_a_back",
   "hu_b",
   "hu_b_back",
   "tail_1",
   "tail_1_back",
   "tail_2",
   "tail_2_back",
   "tail_3",
   "tail_3_back",
   "torso",
   "torso_back"
  ],
  "legs": {
   "fu": {
    "a": [
     0.609,
     0.1
    ],
    "b": [
     0.355,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.4,
     0.14
    ],
    "b": [
     0.605,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.632,
     0.1
    ],
    "b": [
     0.392,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.423,
     0.14
    ],
    "b": [
     0.577,
     0.985
    ]
   }
  },
  "legs_back": {
   "fu": {
    "a": [
     0.547,
     0.1
    ],
    "b": [
     0.377,
     0.8
    ]
   },
   "fl": {
    "a": [
     0.517,
     0.14
    ],
    "b": [
     0.539,
     0.985
    ]
   },
   "hu": {
    "a": [
     0.632,
     0.1
    ],
    "b": [
     0.368,
     0.8
    ]
   },
   "hl": {
    "a": [
     0.427,
     0.14
    ],
    "b": [
     0.568,
     0.985
    ]
   }
  },
  "ears": [
   {
    "u": 0.3,
    "v": 0.3,
    "w": 0.38,
    "part": "ear_a"
   },
   {
    "u": 0.7,
    "v": 0.27,
    "w": 0.36,
    "part": "ear_b"
   }
  ],
  "ears_back": [
   {
    "u": 0.3,
    "v": 0.3,
    "w": 0.38,
    "part": "earb_a"
   },
   {
    "u": 0.68,
    "v": 0.28,
    "w": 0.36,
    "part": "earb_b"
   }
  ],
  "sizes": {
   "ear_a": [
    103,
    145
   ],
   "head": [
    172,
    151
   ],
   "ear_b": [
    88,
    144
   ],
   "torso": [
    466,
    198
   ],
   "tail_1": [
    306,
    145
   ],
   "tail_2": [
    204,
    106
   ],
   "tail_3": [
    194,
    98
   ],
   "fu_a": [
    110,
    142
   ],
   "fu_b": [
    90,
    138
   ],
   "hu_a": [
    106,
    142
   ],
   "hu_b": [
    108,
    138
   ],
   "fl_a": [
    100,
    118
   ],
   "fl_b": [
    94,
    118
   ],
   "hl_a": [
    104,
    118
   ],
   "hl_b": [
    105,
    120
   ],
   "ear_a_back": [
    90,
    146
   ],
   "head_back": [
    176,
    153
   ],
   "ear_b_back": [
    86,
    143
   ],
   "torso_back": [
    446,
    204
   ],
   "tail_1_back": [
    302,
    147
   ],
   "tail_2_back": [
    206,
    100
   ],
   "tail_3_back": [
    190,
    92
   ],
   "fu_a_back": [
    118,
    144
   ],
   "fu_b_back": [
    97,
    140
   ],
   "hu_a_back": [
    114,
    138
   ],
   "hu_b_back": [
    113,
    138
   ],
   "fl_a_back": [
    89,
    110
   ],
   "fl_b_back": [
    100,
    110
   ],
   "hl_a_back": [
    96,
    110
   ],
   "hl_b_back": [
    100,
    113
   ],
   "earb_a": [
    90,
    146
   ],
   "earb_b": [
    86,
    143
   ]
  }
 }
};
