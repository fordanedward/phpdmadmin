import { doc, getDoc, type Firestore } from 'firebase/firestore';

export type MemberStatus = 'active' | 'inactive';

export interface MemberPatient {
  id: string;
  displayId?: string;
  mrn?: string;
  name: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  age?: number;
  birthday?: string;
  gender?: string;
  phone?: string;
  email?: string;
  registrationDate?: string;
  status?: MemberStatus;
  profileImage?: string;
  bloodType?: string;
  allergies?: string;
  currentMedications?: string;
  medicalConditions?: any;
  surgicalHistory?: any;
  surgicalHistoryItems?: string[];
  familyHistory?: any;
  familyHistoryTable?: { [member: string]: string[] };
  otherMedicalConditions?: string;
  otherSurgicalHistory?: string;
  otherRelativeSpecify?: string;
  otherFamilyHistory?: string;
  bloodTransfusionHistory?: string;
  bloodTransfusionDate?: string;
}

const FAMILY_HISTORY_CONDITIONS = [
  'Alcohol abuse',
  'Breast cancer',
  'Ovarian cancer',
  'Prostate cancer',
  'Other cancer',
  'Diabetes',
  'Heart Disease',
  'High cholesterol',
  'Hypertension',
  'Mental illness'
];

const FAMILY_MEMBERS = [
  'Mother',
  'Father',
  'Sister',
  'Brother',
  'Daughter',
  'Son',
  'Other relative (specify)'
];

function normalizeMedicalKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function formatDateDisplay(dateString: string | undefined): string {
  if (!dateString || dateString === 'N/A') return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateString;
  }
}

export function formatGenderDisplay(gender: string | undefined): string {
  const normalizedGender = (gender || '').trim().toLowerCase();
  if (!normalizedGender) return 'N/A';
  if (normalizedGender === 'male') return 'Male';
  if (normalizedGender === 'female') return 'Female';
  return normalizedGender.charAt(0).toUpperCase() + normalizedGender.slice(1);
}

export function getCheckedConditionsDisplay(conditions: any): string[] {
  if (!conditions) return [];
  if (Array.isArray(conditions)) {
    return conditions.map((item) => String(item)).filter(Boolean);
  }
  if (typeof conditions !== 'object') return [];
  return Object.entries(conditions)
    .filter(([_, value]) => value === true)
    .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
    .map((str) => str.charAt(0).toUpperCase() + str.slice(1));
}

function resolveFamilyHistoryTable(patient: MemberPatient): { [member: string]: string[] } {
  if (patient.familyHistoryTable && typeof patient.familyHistoryTable === 'object' && !Array.isArray(patient.familyHistoryTable)) {
    const table: { [member: string]: string[] } = {};
    FAMILY_MEMBERS.forEach((member) => {
      const values = patient.familyHistoryTable?.[member];
      table[member] = Array.isArray(values) ? values.filter(Boolean) : [];
    });
    return table;
  }

  const legacy = patient.familyHistory;
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) {
    return FAMILY_MEMBERS.reduce((acc, member) => {
      acc[member] = [];
      return acc;
    }, {} as { [member: string]: string[] });
  }

  return FAMILY_MEMBERS.reduce((acc, member) => {
    const legacyKey = normalizeMedicalKey(member);
    const matchingEntry = Object.entries(legacy).find(([key]) => normalizeMedicalKey(key) === legacyKey);
    if (!matchingEntry) {
      acc[member] = [];
      return acc;
    }

    const conditions = matchingEntry[1];
    if (Array.isArray(conditions)) {
      acc[member] = conditions.filter(Boolean);
      return acc;
    }

    if (!conditions || typeof conditions !== 'object') {
      acc[member] = [];
      return acc;
    }

    const conditionKeys = new Set(
      Object.entries(conditions)
        .filter(([, value]) => value === true)
        .map(([key]) => normalizeMedicalKey(key))
    );

    acc[member] = FAMILY_HISTORY_CONDITIONS.filter((condition) =>
      conditionKeys.has(normalizeMedicalKey(condition))
    );
    return acc;
  }, {} as { [member: string]: string[] });
}

export function getFamilyHistoryDisplay(
  patient: MemberPatient
): Array<{ relative: string; conditions: string[] }> {
  const table = resolveFamilyHistoryTable(patient);
  return FAMILY_MEMBERS.map((member) => ({
    relative: member,
    conditions: table[member] || []
  })).filter((item) => item.conditions.length > 0);
}

export async function fetchMemberPatientById(
  db: Firestore,
  patientId: string
): Promise<MemberPatient | null> {
  try {
    const [profileSnap, userSnap] = await Promise.all([
      getDoc(doc(db, 'patientProfiles', patientId)),
      getDoc(doc(db, 'users', patientId))
    ]);

    if (!profileSnap.exists()) return null;

    const data = profileSnap.data();
    const userData = userSnap.exists() ? userSnap.data() : null;

    return {
      id: profileSnap.id,
      displayId: userData?.customUserId || profileSnap.id,
      name: data.name || '',
      middleName: data.middleName || '',
      lastName: data.lastName || '',
      suffix: data.suffix || '',
      age: data.age,
      birthday: data.birthday,
      gender: data.gender,
      phone: data.phone,
      email: data.email || '',
      registrationDate: userData?.registrationDate
        ? new Date(userData.registrationDate).toISOString().split('T')[0]
        : 'N/A',
      mrn: data.mrn || data.MRN || '',
      status: userData?.isArchived || userData?.archived ? 'inactive' : ((data.status as MemberStatus) ?? 'active'),
      profileImage: data.profileImage || '',
      bloodType: data.bloodType || '',
      allergies: data.allergies || '',
      currentMedications: data.currentMedications || '',
      medicalConditions: data.medicalConditions || data.medicalConditionsList || [],
      surgicalHistory: data.surgicalHistory || {},
      surgicalHistoryItems: data.surgicalHistoryItems || [],
      familyHistory: data.familyHistory || {},
      familyHistoryTable: data.familyHistoryTable || {},
      otherMedicalConditions: data.otherMedicalConditions || '',
      otherSurgicalHistory: data.otherSurgicalHistory || '',
      otherRelativeSpecify: data.otherRelativeSpecify || '',
      otherFamilyHistory: data.otherFamilyHistory || '',
      bloodTransfusionHistory: data.bloodTransfusionHistory || '',
      bloodTransfusionDate: data.bloodTransfusionDate || ''
    };
  } catch (error) {
    console.error('Failed to fetch member profile:', error);
    return null;
  }
}
