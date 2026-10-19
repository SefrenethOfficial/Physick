// Rapier collision groups: high 16 bits = what I am, low 16 bits = what I collide with.
const g = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const WORLD = 0x1;
export const PROP = 0x2;
export const PLAYER = 0x4;
export const NPC = 0x8;

export const GROUPS = {
  world: g(WORLD, 0xffff),
  prop: g(PROP, 0xffff),
  player: g(PLAYER, 0xffff),
  // Living NPCs only physically touch the world and the player. Props pass through them,
  // and impacts are detected by query instead so a speeding quad doesn't stop dead on a person.
  npc: g(NPC, WORLD | PLAYER),
  // What an NPC's own walking movement treats as solid.
  npcMove: g(NPC, WORLD | PROP),
  // Query filter that only sees props.
  onlyProps: g(0xffff, PROP),
};
