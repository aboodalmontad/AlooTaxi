import { SyrianProvinces, VehicleType } from './types';

export const SYRIAN_PROVINCES = [
  { id: SyrianProvinces.DAMASCUS, en: 'Damascus', ar: 'دمشق' },
  { id: SyrianProvinces.RIF_DIMASHQ, en: 'Rif Dimashq', ar: 'ريف دمشق' },
  { id: SyrianProvinces.QUNEITRA, en: 'Quneitra', ar: 'القنيطرة' },
  { id: SyrianProvinces.DARAA, en: 'Daraa', ar: 'درعا' },
  { id: SyrianProvinces.SUWAYDA, en: 'Al-Suwayda', ar: 'السويداء' },
  { id: SyrianProvinces.HOMS, en: 'Homs', ar: 'حمص' },
  { id: SyrianProvinces.TARTUS, en: 'Tartus', ar: 'طرطوس' },
  { id: SyrianProvinces.LATAKIA, en: 'Latakia', ar: 'اللاذقية' },
  { id: SyrianProvinces.HAMA, en: 'Hama', ar: 'حماة' },
  { id: SyrianProvinces.IDLIB, en: 'Idlib', ar: 'إدلب' },
  { id: SyrianProvinces.ALEPPO, en: 'Aleppo', ar: 'حلب' },
  { id: SyrianProvinces.RAQQA, en: 'Raqqa', ar: 'الرقة' },
  { id: SyrianProvinces.DEIR_EZ_ZOR, en: 'Deir ez-Zor', ar: 'دير الزور' },
  { id: SyrianProvinces.AL_HASAKAH, en: 'Al-Hasakah', ar: 'الحسكة' },
];

export const VEHICLE_TYPES = [
    { id: VehicleType.NORMAL_CAR, ar: 'سيارة عادية', icon: '🚗' },
    { id: VehicleType.AC_CAR, ar: 'سيارة مكيفة', icon: '🚙' },
    { id: VehicleType.PUBLIC_CAR, ar: 'سيارة عامة', icon: '🚕' },
    { id: VehicleType.VIP, ar: 'سيارة VIP', icon: 'Luxury' },
    { id: VehicleType.MICROBUS, ar: 'ميكرو باص', icon: '🚐' },
    { id: VehicleType.MOTORCYCLE, ar: 'دراجة', icon: '🏍️' },
];

export const DAMASCUS_COORDS: [number, number] = [33.5138, 36.2765];

export const PROVINCE_COORDS: { [key in SyrianProvinces]: [number, number] } = {
    [SyrianProvinces.DAMASCUS]: [33.5138, 36.2765],
    [SyrianProvinces.RIF_DIMASHQ]: [33.5138, 36.2765],
    [SyrianProvinces.QUNEITRA]: [33.1252, 35.8285],
    [SyrianProvinces.DARAA]: [32.6255, 36.1044],
    [SyrianProvinces.SUWAYDA]: [32.7042, 36.5683],
    [SyrianProvinces.HOMS]: [34.7326, 36.7144],
    [SyrianProvinces.TARTUS]: [34.8890, 35.8865],
    [SyrianProvinces.LATAKIA]: [35.5239, 35.7831],
    [SyrianProvinces.HAMA]: [35.1318, 36.7578],
    [SyrianProvinces.IDLIB]: [35.9293, 36.6322],
    [SyrianProvinces.ALEPPO]: [36.2021, 37.1594],
    [SyrianProvinces.RAQQA]: [35.9554, 39.0183],
    [SyrianProvinces.DEIR_EZ_ZOR]: [35.3421, 40.1425],
    [SyrianProvinces.AL_HASAKAH]: [36.5160, 40.7441],
};
