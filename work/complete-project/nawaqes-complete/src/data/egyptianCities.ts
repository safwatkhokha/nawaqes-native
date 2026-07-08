// ─── Egyptian Cities Data ──────────────────────────────────────
// Comprehensive list of Egyptian cities and governorates
// Used for location targeting, filtering, and promotion city selection

export interface EgyptianCity {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string;
  governorate: string;
  region: 'greater_cairo' | 'delta' | 'canal' | 'upper_egypt' | 'desert' | 'alexandria';
  isGovernorate?: boolean;
}

export const egyptianCities: EgyptianCity[] = [
  // ── Greater Cairo ─────────────────────────────────────────────
  { id: 'cairo', name: 'Cairo', nameEn: 'Cairo', nameAr: 'القاهرة', governorate: 'القاهرة', region: 'greater_cairo', isGovernorate: true },
  { id: 'giza', name: 'Giza', nameEn: 'Giza', nameAr: 'الجيزة', governorate: 'الجيزة', region: 'greater_cairo', isGovernorate: true },
  { id: 'qalyubia', name: 'Qalyubia', nameEn: 'Qalyubia', nameAr: 'القليوبية', governorate: 'القليوبية', region: 'greater_cairo', isGovernorate: true },
  { id: 'shubra_el_keima', name: 'Shubra El Kheima', nameEn: 'Shubra El Kheima', nameAr: 'شبرا الخيمة', governorate: 'القليوبية', region: 'greater_cairo' },
  { id: 'banha', name: 'Banha', nameEn: 'Banha', nameAr: 'بنها', governorate: 'القليوبية', region: 'greater_cairo' },
  { id: 'qalyub', name: 'Qalyub', nameEn: 'Qalyub', nameAr: 'قليوب', governorate: 'القليوبية', region: 'greater_cairo' },
  { id: 'el_obaour', name: 'El Obour', nameEn: 'El Obour', nameAr: 'العبور', governorate: 'القليوبية', region: 'greater_cairo' },
  { id: 'helwan', name: 'Helwan', nameEn: 'Helwan', nameAr: 'حلوان', governorate: 'القاهرة', region: 'greater_cairo' },
  { id: 'shorouk', name: 'New Cairo', nameEn: 'New Cairo', nameAr: 'القاهرة الجديدة', governorate: 'القاهرة', region: 'greater_cairo' },
  { id: 'sixth_october', name: '6th of October', nameEn: '6th of October', nameAr: '٦ أكتوبر', governorate: 'الجيزة', region: 'greater_cairo' },
  { id: 'sheikh_zayed', name: 'Sheikh Zayed', nameEn: 'Sheikh Zayed', nameAr: 'الشيخ زايد', governorate: 'الجيزة', region: 'greater_cairo' },
  { id: 'haram', name: 'El Haram', nameEn: 'El Haram', nameAr: 'الحرم', governorate: 'الجيزة', region: 'greater_cairo' },
  { id: 'faisal', name: 'Faisal', nameEn: 'Faisal', nameAr: 'فيصل', governorate: 'الجيزة', region: 'greater_cairo' },
  { id: 'hadayek_el_ahram', name: 'Hadayek El Ahram', nameEn: 'Hadayek El Ahram', nameAr: 'حدائق الأهرام', governorate: 'الجيزة', region: 'greater_cairo' },

  // ── Alexandria ────────────────────────────────────────────────
  { id: 'alex', name: 'Alexandria', nameEn: 'Alexandria', nameAr: 'الإسكندرية', governorate: 'الإسكندرية', region: 'alexandria', isGovernorate: true },
  { id: 'smouha', name: 'Smouha', nameEn: 'Smouha', nameAr: 'سموحة', governorate: 'الإسكندرية', region: 'alexandria' },
  { id: 'sidi_gaber', name: 'Sidi Gaber', nameEn: 'Sidi Gaber', nameAr: 'سيدي جابر', governorate: 'الإسكندرية', region: 'alexandria' },
  { id: 'montazah', name: 'Montazah', nameEn: 'Montazah', nameAr: 'المندرة', governorate: 'الإسكندرية', region: 'alexandria' },
  { id: 'agami', name: 'Agami', nameEn: 'Agami', nameAr: 'أجيامي', governorate: 'الإسكندرية', region: 'alexandria' },
  { id: 'bourg_el_arab', name: 'Borg El Arab', nameEn: 'Borg El Arab', nameAr: 'برج العرب', governorate: 'الإسكندرية', region: 'alexandria' },
  { id: 'miami', name: 'Miami', nameEn: 'Miami', nameAr: 'ميامي', governorate: 'الإسكندرية', region: 'alexandria' },

  // ── Canal Zone ────────────────────────────────────────────────
  { id: 'portsaid', name: 'Port Said', nameEn: 'Port Said', nameAr: 'بورسعيد', governorate: 'بورسعيد', region: 'canal', isGovernorate: true },
  { id: 'ismailia', name: 'Ismailia', nameEn: 'Ismailia', nameAr: 'الإسماعيلية', governorate: 'الإسماعيلية', region: 'canal', isGovernorate: true },
  { id: 'suez', name: 'Suez', nameEn: 'Suez', nameAr: 'السويس', governorate: 'السويس', region: 'canal', isGovernorate: true },
  { id: 'port_fouad', name: 'Port Fouad', nameEn: 'Port Fouad', nameAr: 'بور فؤاد', governorate: 'بورسعيد', region: 'canal' },
  { id: 'faisal_suez', name: 'El Arbaeen', nameEn: 'El Arbaeen', nameAr: 'الأربعين', governorate: 'السويس', region: 'canal' },

  // ── Delta ─────────────────────────────────────────────────────
  { id: 'dakahlia', name: 'Dakahlia', nameEn: 'Dakahlia', nameAr: 'الدقهلية', governorate: 'الدقهلية', region: 'delta', isGovernorate: true },
  { id: 'mansoura', name: 'Mansoura', nameEn: 'Mansoura', nameAr: 'المنصورة', governorate: 'الدقهلية', region: 'delta' },
  { id: 'talkha', name: 'Talkha', nameEn: 'Talkha', nameAr: 'طلخا', governorate: 'الدقهلية', region: 'delta' },
  { id: 'mit_ghamr', name: 'Mit Ghamr', nameEn: 'Mit Ghamr', nameAr: 'ميت غمر', governorate: 'الدقهلية', region: 'delta' },
  { id: 'agar', name: 'Aga', nameEn: 'Aga', nameAr: 'أجا', governorate: 'الدقهلية', region: 'delta' },

  { id: 'sharqia', name: 'Sharqia', nameEn: 'Sharqia', nameAr: 'الشرقية', governorate: 'الشرقية', region: 'delta', isGovernorate: true },
  { id: 'zagazig', name: 'Zagazig', nameEn: 'Zagazig', nameAr: 'الزقازيق', governorate: 'الشرقية', region: 'delta' },
  { id: 'tenth_of_ramadan', name: '10th of Ramadan', nameEn: '10th of Ramadan', nameAr: 'العاشر من رمضان', governorate: 'الشرقية', region: 'delta' },
  { id: 'belbeis', name: 'Belbeis', nameEn: 'Belbeis', nameAr: 'بلبيس', governorate: 'الشرقية', region: 'delta' },
  { id: 'minya_el_qamh', name: 'Minya El Qamh', nameEn: 'Minya El Qamh', nameAr: 'منية القمح', governorate: 'الشرقية', region: 'delta' },

  { id: 'gharbia', name: 'Gharbia', nameEn: 'Gharbia', nameAr: 'الغربية', governorate: 'الغربية', region: 'delta', isGovernorate: true },
  { id: 'tanta', name: 'Tanta', nameEn: 'Tanta', nameAr: 'طنطا', governorate: 'الغربية', region: 'delta' },
  { id: 'el_mahalla', name: 'El Mahalla El Kubra', nameEn: 'El Mahalla El Kubra', nameAr: 'المحلة الكبرى', governorate: 'الغربية', region: 'delta' },
  { id: 'kafr_elsheikh_city', name: 'Zifta', nameEn: 'Zifta', nameAr: 'زفتى', governorate: 'الغربية', region: 'delta' },
  { id: 'samannoud', name: 'Samannoud', nameEn: 'Samannoud', nameAr: 'سمنود', governorate: 'الغربية', region: 'delta' },

  { id: 'kafr_elsheikh', name: 'Kafr El Sheikh', nameEn: 'Kafr El Sheikh', nameAr: 'كفر الشيخ', governorate: 'كفر الشيخ', region: 'delta', isGovernorate: true },
  { id: 'desouk', name: 'Desouk', nameEn: 'Desouk', nameAr: 'دسوق', governorate: 'كفر الشيخ', region: 'delta' },
  { id: 'baltim', name: 'Baltim', nameEn: 'Baltim', nameAr: 'بلطيم', governorate: 'كفر الشيخ', region: 'delta' },

  { id: 'damietta', name: 'Damietta', nameEn: 'Damietta', nameAr: 'دمياط', governorate: 'دمياط', region: 'delta', isGovernorate: true },
  { id: 'ras_el_barr', name: 'Ras El Bar', nameEn: 'Ras El Bar', nameAr: 'رأس البر', governorate: 'دمياط', region: 'delta' },
  { id: 'new_damietta', name: 'New Damietta', nameEn: 'New Damietta', nameAr: 'دمياط الجديدة', governorate: 'دمياط', region: 'delta' },

  { id: 'monufia', name: 'Monufia', nameEn: 'Monufia', nameAr: 'المنوفية', governorate: 'المنوفية', region: 'delta', isGovernorate: true },
  { id: 'shebin_el_kom', name: 'Shebin El Kom', nameEn: 'Shebin El Kom', nameAr: 'شبين الكوم', governorate: 'المنوفية', region: 'delta' },
  { id: 'menouf', name: 'Menouf', nameEn: 'Menouf', nameAr: 'منوف', governorate: 'المنوفية', region: 'delta' },
  { id: 'sadat_city', name: 'Sadat City', nameEn: 'Sadat City', nameAr: 'مدينة السادات', governorate: 'المنوفية', region: 'delta' },
  { id: 'ashmoun', name: 'Ashmoun', nameEn: 'Ashmoun', nameAr: 'أشمون', governorate: 'المنوفية', region: 'delta' },

  { id: 'beheira', name: 'Beheira', nameEn: 'Beheira', nameAr: 'البحيرة', governorate: 'البحيرة', region: 'delta', isGovernorate: true },
  { id: 'damanhur', name: 'Damanhur', nameEn: 'Damanhur', nameAr: 'دمنهور', governorate: 'البحيرة', region: 'delta' },
  { id: 'kafr_eldawwar', name: 'Kafr El Dawwar', nameEn: 'Kafr El Dawwar', nameAr: 'كفر الدوار', governorate: 'البحيرة', region: 'delta' },
  { id: 'abu_hummus', name: 'Abu Hummus', nameEn: 'Abu Hummus', nameAr: 'أبو حمص', governorate: 'البحيرة', region: 'delta' },
  { id: 'rashid', name: 'Rashid (Rosetta)', nameEn: 'Rashid (Rosetta)', nameAr: 'رشيد', governorate: 'البحيرة', region: 'delta' },
  { id: 'edko', name: 'Edko', nameEn: 'Edko', nameAr: 'إدكو', governorate: 'البحيرة', region: 'delta' },

  // ── Upper Egypt ───────────────────────────────────────────────
  { id: 'minya', name: 'Minya', nameEn: 'Minya', nameAr: 'المنيا', governorate: 'المنيا', region: 'upper_egypt', isGovernorate: true },
  { id: 'abu_qurqas', name: 'Abu Qurqas', nameEn: 'Abu Qurqas', nameAr: 'أبو قرقاص', governorate: 'المنيا', region: 'upper_egypt' },
  { id: 'mallawi', name: 'Mallawi', nameEn: 'Mallawi', nameAr: 'ملوي', governorate: 'المنيا', region: 'upper_egypt' },
  { id: 'samalut', name: 'Samalut', nameEn: 'Samalut', nameAr: 'سمالوط', governorate: 'المنيا', region: 'upper_egypt' },

  { id: 'asyut', name: 'Asyut', nameEn: 'Asyut', nameAr: 'أسيوط', governorate: 'أسيوط', region: 'upper_egypt', isGovernorate: true },
  { id: 'abnub', name: 'Abnub', nameEn: 'Abnub', nameAr: 'أبنوب', governorate: 'أسيوط', region: 'upper_egypt' },
  { id: 'dairut', name: 'Dairut', nameEn: 'Dairut', nameAr: 'ديروط', governorate: 'أسيوط', region: 'upper_egypt' },
  { id: 'el_quoseya', name: 'El Quseya', nameEn: 'El Quseya', nameAr: 'القوصية', governorate: 'أسيوط', region: 'upper_egypt' },

  { id: 'sohag', name: 'Sohag', nameEn: 'Sohag', nameAr: 'سوهاج', governorate: 'سوهاج', region: 'upper_egypt', isGovernorate: true },
  { id: 'akhmim', name: 'Akhmim', nameEn: 'Akhmim', nameAr: 'أخميم', governorate: 'سوهاج', region: 'upper_egypt' },
  { id: 'tahta', name: 'Tahta', nameEn: 'Tahta', nameAr: 'طهطا', governorate: 'سوهاج', region: 'upper_egypt' },
  { id: 'girga', name: 'Girga', nameEn: 'Girga', nameAr: 'جرجا', governorate: 'سوهاج', region: 'upper_egypt' },

  { id: 'qena', name: 'Qena', nameEn: 'Qena', nameAr: 'قنا', governorate: 'قنا', region: 'upper_egypt', isGovernorate: true },
  { id: 'nag_hammadi', name: 'Nag Hammadi', nameEn: 'Nag Hammadi', nameAr: 'نجع حمادي', governorate: 'قنا', region: 'upper_egypt' },
  { id: 'deshna', name: 'Deshna', nameEn: 'Deshna', nameAr: 'دشنا', governorate: 'قنا', region: 'upper_egypt' },
  { id: 'qus', name: 'Qus', nameEn: 'Qus', nameAr: 'قوص', governorate: 'قنا', region: 'upper_egypt' },

  { id: 'luxor', name: 'Luxor', nameEn: 'Luxor', nameAr: 'الأقصر', governorate: 'الأقصر', region: 'upper_egypt', isGovernorate: true },
  { id: 'armant', name: 'Armant', nameEn: 'Armant', nameAr: 'أرمنت', governorate: 'الأقصر', region: 'upper_egypt' },
  { id: 'esna', name: 'Esna', nameEn: 'Esna', nameAr: 'إسنا', governorate: 'الأقصر', region: 'upper_egypt' },

  { id: 'aswan', name: 'Aswan', nameEn: 'Aswan', nameAr: 'أسوان', governorate: 'أسوان', region: 'upper_egypt', isGovernorate: true },
  { id: 'komombo', name: 'Kom Ombo', nameEn: 'Kom Ombo', nameAr: 'كوم أمبو', governorate: 'أسوان', region: 'upper_egypt' },
  { id: 'edfu', name: 'Edfu', nameEn: 'Edfu', nameAr: 'إدفو', governorate: 'أسوان', region: 'upper_egypt' },
  { id: 'abu_simbel', name: 'Abu Simbel', nameEn: 'Abu Simbel', nameAr: 'أبو سمبل', governorate: 'أسوان', region: 'upper_egypt' },

  { id: 'benisuef', name: 'Beni Suef', nameEn: 'Beni Suef', nameAr: 'بني سويف', governorate: 'بني سويف', region: 'upper_egypt', isGovernorate: true },
  { id: 'el_wasta', name: 'El Wasta', nameEn: 'El Wasta', nameAr: 'الواسطي', governorate: 'بني سويف', region: 'upper_egypt' },
  { id: 'nasser', name: 'Beni Suef City', nameEn: 'Beni Suef City', nameAr: 'بني سويف المدينة', governorate: 'بني سويف', region: 'upper_egypt' },

  { id: 'fayoum', name: 'Fayoum', nameEn: 'Fayoum', nameAr: 'الفيوم', governorate: 'الفيوم', region: 'upper_egypt', isGovernorate: true },
  { id: 'ibsheway', name: 'Ibsheway', nameEn: 'Ibsheway', nameAr: 'إبشواي', governorate: 'الفيوم', region: 'upper_egypt' },
  { id: 'itssa', name: 'Itsa', nameEn: 'Itsa', nameAr: 'إطسا', governorate: 'الفيوم', region: 'upper_egypt' },
  { id: 'tamiya', name: 'Tamiya', nameEn: 'Tamiya', nameAr: 'طامية', governorate: 'الفيوم', region: 'upper_egypt' },

  // ── Desert / Frontier Governorates ────────────────────────────
  { id: 'new_valley', name: 'New Valley', nameEn: 'New Valley', nameAr: 'الوادي الجديد', governorate: 'الوادي الجديد', region: 'desert', isGovernorate: true },
  { id: 'kharga', name: 'Kharga', nameEn: 'Kharga', nameAr: 'الخارجة', governorate: 'الوادي الجديد', region: 'desert' },
  { id: 'dakhla', name: 'Dakhla', nameEn: 'Dakhla', nameAr: 'الداخلة', governorate: 'الوادي الجديد', region: 'desert' },
  { id: 'paris_oasis', name: 'Paris Oasis', nameEn: 'Paris Oasis', nameAr: 'باريس', governorate: 'الوادي الجديد', region: 'desert' },

  { id: 'red_sea', name: 'Red Sea', nameEn: 'Red Sea', nameAr: 'البحر الأحمر', governorate: 'البحر الأحمر', region: 'desert', isGovernorate: true },
  { id: 'hurghada', name: 'Hurghada', nameEn: 'Hurghada', nameAr: 'الغردقة', governorate: 'البحر الأحمر', region: 'desert' },
  { id: 'safaga', name: 'Safaga', nameEn: 'Safaga', nameAr: 'سفاجا', governorate: 'البحر الأحمر', region: 'desert' },
  { id: 'marsa_alam', name: 'Marsa Alam', nameEn: 'Marsa Alam', nameAr: 'مرسى علم', governorate: 'البحر الأحمر', region: 'desert' },
  { id: 'el_gouna', name: 'El Gouna', nameEn: 'El Gouna', nameAr: 'الجونة', governorate: 'البحر الأحمر', region: 'desert' },

  { id: 'matrouh', name: 'Matrouh', nameEn: 'Matrouh', nameAr: 'مطروح', governorate: 'مطروح', region: 'desert', isGovernorate: true },
  { id: 'marsa_matrouh', name: 'Marsa Matrouh', nameEn: 'Marsa Matrouh', nameAr: 'مرسى مطروح', governorate: 'مطروح', region: 'desert' },
  { id: 'siwa', name: 'Siwa Oasis', nameEn: 'Siwa Oasis', nameAr: 'سيوة', governorate: 'مطروح', region: 'desert' },
  { id: 'el_alamein', name: 'El Alamein', nameEn: 'El Alamein', nameAr: 'العلمين', governorate: 'مطروح', region: 'desert' },
  { id: 'sidi_barrani', name: 'Sidi Barrani', nameEn: 'Sidi Barrani', nameAr: 'سيدي براني', governorate: 'مطروح', region: 'desert' },
  { id: 'new_alamein', name: 'New Alamein', nameEn: 'New Alamein', nameAr: 'العلمين الجديدة', governorate: 'مطروح', region: 'desert' },

  { id: 'north_sinai', name: 'North Sinai', nameEn: 'North Sinai', nameAr: 'شمال سيناء', governorate: 'شمال سيناء', region: 'desert', isGovernorate: true },
  { id: 'el_arish', name: 'El Arish', nameEn: 'El Arish', nameAr: 'العريش', governorate: 'شمال سيناء', region: 'desert' },
  { id: 'bir_el_abd', name: 'Bir El Abd', nameEn: 'Bir El Abd', nameAr: 'بير العبد', governorate: 'شمال سيناء', region: 'desert' },
  { id: 'sheikh_zuweid', name: 'Sheikh Zuweid', nameEn: 'Sheikh Zuweid', nameAr: 'الشيخ زويد', governorate: 'شمال سيناء', region: 'desert' },

  { id: 'south_sinai', name: 'South Sinai', nameEn: 'South Sinai', nameAr: 'جنوب سيناء', governorate: 'جنوب سيناء', region: 'desert', isGovernorate: true },
  { id: 'sharm_el_sheikh', name: 'Sharm El Sheikh', nameEn: 'Sharm El Sheikh', nameAr: 'شرم الشيخ', governorate: 'جنوب سيناء', region: 'desert' },
  { id: 'dahab', name: 'Dahab', nameEn: 'Dahab', nameAr: 'دهب', governorate: 'جنوب سيناء', region: 'desert' },
  { id: 'nuweiba', name: 'Nuweiba', nameEn: 'Nuweiba', nameAr: 'نويبع', governorate: 'جنوب سيناء', region: 'desert' },
  { id: 'taba', name: 'Taba', nameEn: 'Taba', nameAr: 'طابا', governorate: 'جنوب سيناء', region: 'desert' },
  { id: 'saint_catherine', name: 'Saint Catherine', nameEn: 'Saint Catherine', nameAr: 'سانت كاترين', governorate: 'جنوب سيناء', region: 'desert' },
];

// ── Region Labels ───────────────────────────────────────────────
export const regionLabels: Record<string, { en: string; ar: string }> = {
  greater_cairo: { en: 'Greater Cairo', ar: 'القاهرة الكبرى' },
  alexandria: { en: 'Alexandria', ar: 'الإسكندرية' },
  delta: { en: 'Delta', ar: 'الدلتا' },
  canal: { en: 'Canal Zone', ar: 'منطقة القناة' },
  upper_egypt: { en: 'Upper Egypt', ar: 'صعيد مصر' },
  desert: { en: 'Desert & Frontier', ar: 'الصحراء والحدود' },
};

// ── Region Display Order ────────────────────────────────────────
export const regionOrder: string[] = [
  'greater_cairo',
  'alexandria',
  'delta',
  'canal',
  'upper_egypt',
  'desert',
];

// ── Helper Functions ────────────────────────────────────────────

/** Get Arabic name of a city by its ID */
export function getCityNameAr(id: string): string {
  const city = egyptianCities.find(c => c.id === id);
  return city?.nameAr || id;
}

/** Search cities by name (Arabic or English), case-insensitive */
export function searchCities(query: string): EgyptianCity[] {
  if (!query.trim()) return egyptianCities;
  const q = query.trim().toLowerCase();
  return egyptianCities.filter(
    c =>
      c.name.toLowerCase().includes(q) ||
      c.nameAr.includes(q) ||
      c.governorate.includes(q)
  );
}

/** Get a list of unique governorates (Arabic names) */
export function getGovernorates(): string[] {
  const seen = new Set<string>();
  return egyptianCities.filter(c => {
    if (seen.has(c.governorate)) return false;
    seen.add(c.governorate);
    return true;
  }).map(c => c.governorate);
}

/** Format selected city IDs into a readable Arabic string */
export function formatSelectedCities(cityIds: string[]): string {
  if (cityIds.length === 0) return '';
  if (cityIds.length <= 3) {
    return cityIds.map(id => getCityNameAr(id)).join('، ');
  }
  const firstThree = cityIds.slice(0, 3).map(id => getCityNameAr(id)).join('، ');
  return `${firstThree} +${cityIds.length - 3}`;
}

/** Count the number of cities in a given governorate */
export function getGovernorateCount(governorate: string): number {
  return egyptianCities.filter(c => c.governorate === governorate).length;
}
