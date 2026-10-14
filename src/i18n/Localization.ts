export type LangCode = 'en' | 'ru' | 'kk' | 'de';

export const LOCALES: Record<LangCode, Record<string, string>> = {
  en: {
    title: 'CHRONOS', subtitle: 'Civilization Survival 3D',
    newSingle: 'New / Load Singleplayer', createLan: 'Create LAN Game', joinLan: 'Join LAN Game',
    settings: 'Settings', resume: 'Resume', inventory: 'Inventory & Craft', map: 'Strategic Map & RTS',
    saveGame: 'Save World', leaveGame: 'Leave Game', health: 'HEALTH', hunger: 'HUNGER', stamina: 'STAMINA',
    attack: 'ATTACK', use: 'USE', jump: 'JUMP', seedPlaceholder: 'World Seed (e.g. 2026)',
    back: 'Back', saveAndReturn: 'Save & Return', deleteSave: 'Delete Saved World'
  },
  ru: {
    title: 'ХРОНОС', subtitle: 'Симулятор Выживания и Цивилизаций 3D',
    newSingle: 'Одиночная Игра', createLAN: 'Создать LAN Игру', joinLAN: 'Присоединиться к LAN',
    settings: 'Настройки', resume: 'Продолжить', inventory: 'Инвентарь и Крафт', map: 'Карта и Стратегия (RTS)',
    saveGame: 'Сохранить Мир', leaveGame: 'Выйти в Меню', health: 'ЗДОРОВЬЕ', hunger: 'ГОЛОД', stamina: 'ВЫНОСЛИВОСТЬ',
    attack: 'УДАР', use: 'ИСПОЛЬЗ.', jump: 'ПРЫЖОК', seedPlaceholder: 'Сид мира (напр. 2026)',
    back: 'Назад', saveAndReturn: 'Сохранить и Назад', deleteSave: 'Удалить Сохранение'
  },
  kk: {
    title: 'ХРОНОС', subtitle: 'Өмір сүру және Өркениеттер 3D',
    newSingle: 'Жалғыз ойын', createLan: 'LAN Ойын құру', joinLan: 'LAN Ойынға қосылу',
    settings: 'Баптаулар', resume: 'Жалғастыру', inventory: 'Инвентарь және Қолөнер', map: 'Карта және Стратегия (RTS)',
    saveGame: 'Әлемді сақтау', leaveGame: 'Мәзірге шығу', health: 'ДЕНСАУЛЫҚ', hunger: 'АШТЫҚ', stamina: 'ТӨЗІМДІЛІК',
    attack: 'ШАБУЛ', use: 'ҚОЛДАНУ', jump: 'СЕКРУ', seedPlaceholder: 'Әлем коды (мысалы 2026)',
    back: 'Артқа', saveAndReturn: 'Сақтау және қайту', deleteSave: 'Сақталғанды өшіру'
  },
  de: {
    title: 'CHRONOS', subtitle: 'Zivilisations-Survival 3D',
    newSingle: 'Einzelspieler / Laden', createLan: 'LAN-Spiel erstellen', joinLan: 'LAN-Spiel beitreten',
    settings: 'Einstellungen', resume: 'Fortsetzen', inventory: 'Inventar & Handwerk', map: 'Strategische Karte & RTS',
    saveGame: 'Welt Speichern', leaveGame: 'Spiel Verlassen', health: 'GESUNDHEIT', hunger: 'HUNGER', stamina: 'AUSDAUER',
    attack: 'ANGRIFF', use: 'BENUTZEN', jump: 'SPRUNG', seedPlaceholder: 'Welt-Seed (z.B. 2026)',
    back: 'Zurück', saveAndReturn: 'Speichern & Zurück', deleteSave: 'Welt Löschen'
  }
};

export class Localization {
  public static currentLang: LangCode = 'en';
  public static init(): void {
    const sys = (navigator.language || 'en').slice(0, 2).toLowerCase();
    this.currentLang = (sys === 'ru' || sys === 'kk' || sys === 'de') ? (sys as LangCode) : 'en';
  }
  public static setLang(lang: LangCode): void { this.currentLang = lang; }
  public static get(key: string): string { return LOCALES[this.currentLang]?.[key] || LOCALES['en'][key] || key; }
}
