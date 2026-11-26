/**
 * The Poly Haven models the scene uses (all CC0), what each is called here, the texture size
 * it keeps and the triangles it may have.
 */
export const MODELS: { name: string; id: string; size: number; tris: number; keep?: string }[] = [
  // the tea shop and the stalls
  { name: 'monobloc', id: 'plastic_monobloc_chair_01', size: 512, tris: 2500 },
  { name: 'stool', id: 'wooden_stool_02', size: 512, tris: 2000 },
  { name: 'bench', id: 'painted_wooden_bench', size: 512, tris: 700 },
  { name: 'crate', id: 'plastic_crate_02', size: 512, tris: 3000 },
  { name: 'bottles', id: 'wine_bottles_01', size: 512, tris: 6000 },
  { name: 'gallon', id: 'plastic_bottle_gallon', size: 256, tris: 2500 },
  { name: 'bleach', id: 'bleach_bottle', size: 256, tris: 1500 },
  { name: 'cleaner', id: 'multi_cleaner_bottle', size: 256, tris: 2000 },
  { name: 'jerrycan', id: 'plastic_jerrycan', size: 256, tris: 2500 },
  { name: 'lpg', id: 'propane_tank', size: 256, tris: 2500 },
  { name: 'kettle', id: 'vintage_electric_kettle', size: 256, tris: 3000 },
  { name: 'basket', id: 'wicker_basket_02', size: 512, tris: 4000 },
  { name: 'sack', id: 'cement_bag', size: 512, tris: 900 },
  { name: 'tv', id: 'Television_01', size: 512, tris: 2000 },
  { name: 'fan', id: 'ceiling_fan', size: 256, tris: 3000 },
  // brass for the temple
  { name: 'diya', id: 'brass_diya_lantern', size: 512, tris: 5000 },
  { name: 'brasspot', id: 'brass_pot_01', size: 512, tris: 2500 },
  { name: 'brasspot2', id: 'brass_pot_02', size: 512, tris: 2500 },
  { name: 'brassvase', id: 'brass_vase_03', size: 512, tris: 2000 },
  { name: 'claypot', id: 'ceramic_pot', size: 512, tris: 2500 },
  { name: 'bucket', id: 'wooden_bucket_01', size: 512, tris: 2500 },
  // the street
  { name: 'pole1', id: 'modular_electricity_poles', size: 1024, tris: 5000, keep: 'preset_01' },
  { name: 'pole2', id: 'modular_electricity_poles', size: 1024, tris: 4000, keep: 'preset_02' },
  { name: 'pole3', id: 'modular_electricity_poles', size: 1024, tris: 5000, keep: 'preset_03' },
  { name: 'utility', id: 'utility_box_01', size: 512, tris: 2500 },
  { name: 'shutter', id: 'rollershutter_door', size: 512, tris: 1200 },
  { name: 'tyre', id: 'old_tyre', size: 256, tris: 1500 },
  { name: 'trashbag', id: 'trashbag', size: 256, tris: 1500 },
  // plants
  { name: 'fern', id: 'fern_02', size: 512, tris: 4000 },
  { name: 'anthurium', id: 'anthurium_botany_01', size: 512, tris: 3000 },
  { name: 'planter', id: 'planter_pot_clay', size: 512, tris: 2000 },
];
