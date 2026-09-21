// Comprehensive department keyword definitions for Male Wellness, Orthopedics, and Skin Care.
// Supports Hindi (Unicode), Hinglish, and English terms.

export const MALE_KEYWORDS = [
  'male', 'men', 'man', 'मार्ड', 'पुरुष', 'मर्दाना', 'मर्दाना समस्या', 'मर्दाना कमजोरी', 'मर्दानगी', 
  'मर्दाना ताकत', 'पुरुषों की समस्या', 'male problem', 'men problem', 'male health', 'men health', 
  'sexual', 'यौन समस्या', 'यौन कमजोरी', 'sexual problem', 'sexual weakness', 'sexual health', 
  'सेक्स की समस्या', 'सेक्स में समस्या', 'सेक्स करने में समस्या', 'sex problem', 'sex ki problem', 
  'sex mein problem', 'sex karne mein problem', 'sex weakness', 'erectile', 'इरेक्शन की समस्या', 
  'इरेक्शन नहीं होता', 'erection problem', 'erection dysfunction', 'erection maintain', 
  'लिंग में तनाव', 'लिंग की समस्या', 'ling mein problem', 'ling ki problem', 'testosterone', 
  'टेस्टोस्टेरोन', 'testosterone low', 'prostate', 'प्रोस्टेट', 'stamina', 'स्टैमिना', 
  'stamina low', 'low stamina', 'सेक्स पावर', 'sex power', 'sexual power', 'premature ejaculation', 
  'शीघ्रपतन', 'जल्दी डिस्चार्ज', 'jaldi discharge', 'सेक्स टाइम', 'sex timing', 'sex time', 
  'libido', 'libido low', 'कामेच्छा', 'sex drive', 'पेशाब', 'peshab', 'mard', 'mardana', 
  'mardana kamzori', 'mard ki kamzori', 'mardon ki problem', 'mardana taqat', 'youn', 'youn shakti',
  'peshab ki problem', 'mardanag'
];

export const ORTHO_KEYWORDS = [
  'ortho', 'orthopedic', 'orthopaedic', 'हड्डी', 'हड्डियों', 'bone', 'bone pain', 'bone problem', 
  'haddi', 'haddi ki problem', 'haddi mein dard', 'haddi ka dard', 'joint', 'joints', 'जोड़', 
  'जोड़ों का दर्द', 'joint pain', 'joint problem', 'jodo ka dard', 'jodon ka dard', 'jodo mein dard', 
  'ghutna', 'घुटना', 'घुटने का दर्द', 'ghutne ka dard', 'ghutno ka dard', 'knee pain', 'knee problem', 
  'knee', 'kamar dard', 'कमर दर्द', 'कमर में दर्द', 'back pain', 'back problem', 'पीठ में दर्द', 
  'spine', 'रीढ़ की हड्डी', 'spine problem', 'reedh ki haddi', 'shoulder pain', 'shoulder problem', 
  'कंधे का दर्द', 'kandhe ka dard', 'kandhe mein dard', 'arthritis', 'गठिया', 'gathiya', 'ligament', 
  'fracture', 'spondylitis', 'स्पॉन्डिलाइटिस', 'cervical', 'सर्वाइकल', 'गर्दन का दर्द', 'gardan ka dard', 
  'slip disc', 'स्लिप डिस्क', 'disc problem', 'disc pain', 'peeth mein dard', 'jodo', 'jodon', 'ghutno'
];

export const SKIN_KEYWORDS = [
  'skin', 'त्वचा', 'skin problem', 'skin disease', 'skin allergy', 'acne', 'मुंहासे', 'acne problem', 
  'pimple', 'पिंपल', 'पिंपल्स', 'rash', 'eczema', 'एक्जिमा', 'psoriasis', 'सोरायसिस', 'derma', 
  'dermatology', 'pigmentation', 'पिगमेंटेशन', 'झाइयां', 'face problem', 'chehre ki problem', 
  'charm rog', 'चर्म रोग', 'daad', 'दाद', 'khujli', 'खुजली', 'itching', 'fungal', 'फंगल', 
  'fungal infection', 'dark spots', 'काले दाग', 'dry skin', 'skin infection', 'daag', 'daag dhabbe', 
  'nishan', 'skin ki problem', 'skin ki bimari', 'pimple problem', 'pimples ki problem', 'face par pimple',
  'chehre par daag', 'charm rog', 'daad khujli', 'skin spots', 'skin marks', 'red spots', 'skin rash'
];

const containsKeyword = (normalizedText, kw) => {
  // If keyword is a short English word (e.g. "men", "man"), enforce whole word boundary match to prevent matching inside "treatment"
  if (/^[a-z]{1,4}$/i.test(kw)) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(normalizedText);
  }
  return normalizedText.includes(kw);
};

/**
 * Detect department ('male', 'ortho', 'skin') from text/problem description
 */
export const detectDepartmentFromText = (text) => {
  if (!text || typeof text !== 'string') return null;
  const normalized = text.toLowerCase();

  // Check specific multi-word/specific keywords first or in priority order
  if (MALE_KEYWORDS.some(kw => containsKeyword(normalized, kw))) return 'male';
  if (ORTHO_KEYWORDS.some(kw => containsKeyword(normalized, kw))) return 'ortho';
  if (SKIN_KEYWORDS.some(kw => containsKeyword(normalized, kw))) return 'skin';

  return null;
};

export default {
  MALE_KEYWORDS,
  ORTHO_KEYWORDS,
  SKIN_KEYWORDS,
  detectDepartmentFromText,
};
