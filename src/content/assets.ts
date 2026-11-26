export type Sex = 'm' | 'f';

export const CLIP_NAMES = ['walk_neutral_01', 'walk_slow_01', 'idle_neutral_01', 'idle_neutral_02', 'gestic_talk_neutral_01', 'sit_chair_idle_neutral_01', 'crouch_idle', 'idle_look_around_01'] as const;

export type ClipName = (typeof CLIP_NAMES)[number];

export const AVATARS = {
  dev_m11: { file: 'dev_m11', base: 'Male_Adult_11', sex: 'm' },
  lamp_m08: { file: 'lamp_m08', base: 'Male_Adult_08', sex: 'm' },
  tea_m15: { file: 'tea_m15', base: 'Male_Adult_15', sex: 'm' },
  home_m12: { file: 'home_m12', base: 'Male_Adult_12', sex: 'm' },
  tea_m09: { file: 'tea_m09', base: 'Male_Adult_12', sex: 'm' },
  tea_m01: { file: 'tea_m01', base: 'Male_Adult_01', sex: 'm' },
  tea_m17: { file: 'tea_m17', base: 'Male_Adult_06', sex: 'm' },
  lane_m01: { file: 'lane_m01', base: 'Male_Adult_01', sex: 'm' },
  road_m08: { file: 'road_m08', base: 'Male_Adult_08', sex: 'm' },
  mosque_m15: { file: 'mosque_m15', base: 'Male_Adult_15', sex: 'm' },
  mosque_m11: { file: 'mosque_m11', base: 'Male_Adult_11', sex: 'm' },
  home_m09: { file: 'home_m09', base: 'Male_Adult_08', sex: 'm' },
  dev_f15: { file: 'dev_f15', base: 'Female_Adult_15', sex: 'f' },
  dev_f06: { file: 'dev_f06', base: 'Female_Adult_04', sex: 'f' },
  gate_f02: { file: 'gate_f02', base: 'Female_Adult_02', sex: 'f' },
  road_f11: { file: 'road_f11', base: 'Female_Adult_11', sex: 'f' },
  home_f06: { file: 'home_f06', base: 'Female_Adult_06', sex: 'f' },
  home_f11: { file: 'home_f11', base: 'Female_Adult_11', sex: 'f' },
} as const satisfies Record<string, { file: string; base: string; sex: Sex }>;

export const SOUND_FILES = ['bed', 'forest', 'river', 'town', 'fire', 'calls', 'steps'] as const;
export const BEAST_FILES = { herd: 'beasts/cow.glb', pack: 'beasts/dhole.glb' } as const;
