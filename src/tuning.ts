// The numbers that set how the night plays: the dholes, the herd, and what they do to you.
// Distances are metres, times seconds, speeds metres a second, rates per second.
// tests/tuning.test.ts snapshots every value: change one there too, on purpose.

export const TUNING = {
  /** How every beast moves (steer). */
  move: {
    /** Closer than this it has arrived and stops. */
    arrive: 0.05,
    /** Slows to this many times the distance left, a second, as it nears its goal. */
    brake: 2,
    /** How quickly its speed catches up with what it wants. */
    accel: 3,
    /** Default turning rate. */
    turn: 4,
  },

  /** The pack of red dogs. */
  dholes: {
    /** Pack sizes: small, and big (also how many dogs exist). */
    size: [3, 4],
    /** Chance of the small pack. */
    smallChance: 0.5,
    /** Seconds of wild forest before the first hunt. */
    firstIn: [45, 75],
    /** Before the next hunt, after you go down. */
    afterDown: [60, 100],
    /** Before the next hunt, after they leave. */
    afterLeave: [80, 150],
    /** They come from behind you, give or take this many radians. */
    fromBehind: 1.2,
    /** How far off they turn up. */
    spawnDist: 60,
    /** How far off a summoned pack turns up (tests), straight ahead. */
    summonDist: 17,
    /** Each dog turns up within this of the pack's middle. */
    scatter: 4,
    /** The answering whistle, this long after the first. */
    answerIn: 1.3,
    /** ...and from this far off the first: [x, z]. */
    answerOffset: [8, -6],
    /** Dog stride length, for the gait. */
    stride: 1.3,

    /** Coming in on your scent. */
    coming: {
      trot: 4.2,
      /** Nearer than this they slow to a stalk and fan out. */
      stalkDist: 38,
      stalk: 2.4,
      /** Metres between dogs in the line: trotting, stalking. */
      spacingTrot: 2.2,
      spacingStalk: 5,
      whistleEvery: [4, 8],
      /** Nearer than this they find you, unless you're hidden. */
      noticeDist: 22,
      /** Hidden: they pass this far beyond you, this far to one side. */
      passBeyond: 25,
      passSide: 10,
      /** They give up coming after this long. */
      giveUp: 40,
    },

    /** Sniffing about where they lost you. */
    searching: {
      speed: 1.5,
      turn: 2,
      /** Wander: rate, phase between dogs, metres; and spacing between dogs. */
      sniffRate: 0.7,
      sniffPhase: 2,
      sniffAmp: 3,
      spacing: 1.5,
      growlDist: 18,
      growlEvery: [3, 6],
      /** Up and in the open nearer than this, they see you. */
      seeDist: 15,
      /** They give up searching after this long (you hid). */
      giveUp: 12,
    },

    /** They have you. */
    attack: {
      /** First lunge this soon: straight from coming, and after seeing you while searching. */
      firstLunge: 1.2,
      firstLungeSeen: 0.8,
      lungeEvery: [1.8, 3.2],
      /** Running makes them lunge this many times as often. */
      runHaste: 2.2,
      /** A dog is "in view" when the cosine to it from where you face is above this. */
      viewCos: 0.8,
      /** Standing tall: not crouched, not running, slower than this. */
      tallPace: 1.6,
      /** Hold them this long (nerve) and they give up. */
      hold: 7,
      /** Nerve a second: tall, facing, torch on; times this with your back to cover. */
      nerveTorch: 1,
      nerveTorchCover: 1.7,
      /** Tall and facing, no torch. */
      nerveDark: 0.4,
      /** Lost a second otherwise, and running. */
      nerveDecay: 0.5,
      nerveRun: 3,
      /** Lost per bite. */
      nervePerBite: 2,
      /** Ring: spin rate, radius, wider by this per second of nerve; speed and turn. */
      ringSpin: 0.5,
      ring: 5.5,
      ringPerNerve: 0.35,
      ringSpeed: 3.4,
      ringTurn: 6,
      /** Falling back after a lunge: radius, speed; for this long after a feint, a bite. */
      backRing: 8,
      backSpeed: 6,
      backFeint: 1.2,
      backBite: 0.8,
      /** The lunge: speed, turn; a feint stops this short; a bite lands this close; gives up after. */
      lungeSpeed: 7.5,
      lungeTurn: 10,
      feintAt: 2.6,
      reach: 1.1,
      lungeFor: 1.6,
      /** Bite damage, times `seen` if you saw it coming, `behind` if not; knock-back speed. */
      bite: [0.08, 0.13],
      seen: 0.7,
      behind: 1.3,
      push: 2.2,
      growlEvery: [1.2, 2.5],
      /** They give up after this long anyway. */
      giveUp: 45,
    },

    /** Going away. */
    leaving: {
      /** Heads for a point this far beyond them, away from you. */
      ahead: 10,
      speed: 5.5,
      turn: 3,
      /** Gone once the pack is this far off. */
      goneDist: 70,
    },
  },

  /** The cow, her sister and a calf in the glade. */
  herd: {
    /** Body scale of each; the first is the cow. */
    sizes: [1.05, 0.95, 0.55],
    /** Starting spread: radians between them, metres apart; random facing ±. */
    spreadAngle: 0.9,
    spacing: 3,
    startYaw: 1.5,
    firstWait: [3, 10],
    /** Stride at size 1, for the gait. */
    stride: 2.6,
    /** Further than this from the glade nothing is simulated; the alarm only decays. */
    range: 200,
    /** Nearer than this you're told how to pass them. */
    warnDist: 55,

    /** What they notice. */
    sense: {
      /** Noise: standing still (slower than stillPace), crouched, walking, running. */
      stillPace: 0.2,
      still: 0.05,
      crouch: 0.18,
      walk: 1,
      run: 3.2,
      /** Torch on the cow (cosine above beamCos, nearer than beamDist), or merely on. */
      beamCos: 0.9,
      beamDist: 35,
      lit: 0.7,
      glow: 0.12,
      /** Reach: full at `near` minus `span`, none past `near`; at most reachMax. */
      near: 32,
      span: 20,
      reachMax: 1.5,
      /** Wind: scent carries when the cosine upwind of her is above scentCos, within scentDist. */
      scentCos: 0.35,
      scentDist: 48,
      scentGain: 0.6,
      /** Downwind (cosine below downCos) your noise is muffled to this. */
      downCos: -0.3,
      downMuffle: 0.6,
      /** Alarm a second per unit of noise and per unit of scent. */
      gain: 0.11,
      scentRate: 0.11,
      /** Below this rise the alarm decays instead, at `decay` a second. */
      riseMin: 0.012,
      decay: 0.045,
      /** Told she smells you: scent above this while the alarm is above scentAlarm. */
      scentTell: 0.08,
      scentAlarm: 0.3,
    },

    /** The alarm's steps (0..1). */
    alarm: {
      /** `threat` is on above this. */
      threat: 0.3,
      /** Heads up and still above this; how fast they raise them. */
      alert: 0.35,
      alertRate: 2,
      rumble: 0.45,
      trumpet: 0.8,
      /** Warnings reset below this. */
      calm: 0.25,
      /** A charge at this. */
      charge: 1,
    },

    /** The charge. */
    charge: {
      mockChance: 0.45,
      speed: 6.8,
      mockSpeed: 5,
      turn: 5,
      thudEvery: 0.32,
      /** A real charge tramples you this close: damage, knock-back; the alarm after. */
      hitDist: 2.4,
      dmg: 0.5,
      push: 7,
      afterHit: 0.5,
      /** A mock charge stops after running mockRun, or this close to you. */
      mockRun: 12,
      mockStop: 7,
      /** Any charge stops after running this far, or this long; the alarm after. */
      maxRun: 28,
      maxT: 9,
      afterStop: 0.55,
    },

    /** Alert: the calf keeps this far behind its mother; speed, turn, and turning to face you. */
    alert: { calfBehind: 2, speed: 1.2, turn: 1.5, face: 1.2 },

    /** Feeding: pause between moves; wander within this of the glade's radius; calf near mother. */
    feed: { wait: [6, 16], roam: 0.55, calfNear: 3, speed: 0.6, calfSpeed: 0.8, turn: 0.8 },
  },

  /** You. */
  player: {
    /** Health after you go down and wake. */
    afterDown: 0.7,
    /** Healing a second: in the wild, by a lamp; only once calm and unhurt for `wait`. */
    healWild: 0.006,
    healSafe: 0.05,
    wait: 6,
    /** Sitting up on a machan: this fast, after `aloftWait`. */
    healAloft: 0.1,
    aloftWait: 2,
  },

  /** Substep length for danger and story, so a big dt (fast-forward) plays the same. */
  maxStep: 1 / 30,
} as const;
