// Значки модификаторов (SVG-строки, без графики Three.js): рисуются цветом currentColor.
export const MOD_ICON = {
  // Мощь: ударная звезда
  might: '<svg viewBox="0 0 32 32"><path d="M16 2l3.500 8.500L28 8l-5 7.500L30 20l-9 1-2 9-3-7.500L7 28l3-8-8-4 8.500-2.500L8 5l8.500 4z" fill="currentColor"/></svg>',
  // Прыткость: двойной шеврон
  swift: '<svg viewBox="0 0 32 32"><path d="M5 6l11 10L5 26v-5l6-5-6-5zM16 6l11 10-11 10v-5l6-5-6-5z" fill="currentColor"/></svg>',
  // Пробитие: стрела, пронзающая диски
  pierce: '<svg viewBox="0 0 32 32"><path d="M2 16h22M24 10l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="16" r="6" fill="none" stroke="currentColor" stroke-width="2" opacity=".7"/></svg>',
  // Эпический: фиолетовый ромб с ×2
  epic: '<svg viewBox="0 0 32 32"><path d="M16 1l13 15-13 15L3 16z" fill="currentColor" opacity=".25"/><path d="M16 1l13 15-13 15L3 16z" fill="none" stroke="currentColor" stroke-width="2"/><text x="16" y="21" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="13" fill="currentColor">×2</text></svg>',
  // Легендарный: золотая звезда с ×3
  legendary: '<svg viewBox="0 0 32 32"><path d="M16 1l4 8 9 1.500-6.500 6.500 1.500 9-8-4.200-8 4.200 1.500-9L3 10.500 12 9z" fill="currentColor" opacity=".25"/><path d="M16 1l4 8 9 1.500-6.500 6.500 1.500 9-8-4.200-8 4.200 1.500-9L3 10.500 12 9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><text x="16" y="21" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="11" fill="currentColor">×3</text></svg>',
};
