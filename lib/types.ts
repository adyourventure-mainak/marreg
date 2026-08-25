import type { ActCode } from "./acts";

export type ApplicationStatus =
  | "DRAFT" | "PAYMENT_PENDING" | "SUBMITTED" | "UNDER_SCRUTINY" | "AWAITING_APPLICANT_FIX"
  | "NOTICE_PUBLISHED" | "OBJECTION_UNDER_ENQUIRY" | "AWAITING_REGISTRATION" | "REGISTERED"
  | "CERTIFICATE_ISSUED" | "CORRECTION_PENDING" | "CANCELLED" | "LAPSED";

export type UserRole =
  | "APPLICANT" | "MARRIAGE_OFFICER" | "HINDU_REGISTRAR" | "DISTRICT_REGISTRAR"
  | "RGM_ADMIN" | "SUPPORT_READONLY" | "AUDITOR";

export type PartyRole = "BRIDE" | "GROOM" | "WIFE" | "HUSBAND";
export type DocumentStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type DocumentType =
  | "PHOTO" | "SIGNATURE_LTI" | "AGE_PROOF" | "ADDRESS_PROOF" | "IDENTITY_PROOF"
  | "GUARDIAN_CONSENT" | "DIVORCE_DECREE" | "DEATH_CERTIFICATE_SPOUSE"
  | "PRIEST_CERTIFICATE" | "AFFIDAVIT" | "OBJECTION_EVIDENCE";

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  PHOTO: "Passport photograph",
  SIGNATURE_LTI: "Signature / thumb impression",
  AGE_PROOF: "Age proof",
  ADDRESS_PROOF: "Address proof",
  IDENTITY_PROOF: "Identity proof",
  GUARDIAN_CONSENT: "Guardian consent",
  DIVORCE_DECREE: "Divorce decree",
  DEATH_CERTIFICATE_SPOUSE: "Death certificate of previous spouse",
  PRIEST_CERTIFICATE: "Priest / ceremony certificate",
  AFFIDAVIT: "Affidavit",
  OBJECTION_EVIDENCE: "Objection evidence",
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  PAYMENT_PENDING: "Payment pending",
  SUBMITTED: "Submitted",
  UNDER_SCRUTINY: "Under scrutiny",
  AWAITING_APPLICANT_FIX: "Correction needed",
  NOTICE_PUBLISHED: "Notice published",
  OBJECTION_UNDER_ENQUIRY: "Objection under enquiry",
  AWAITING_REGISTRATION: "Awaiting registration",
  REGISTERED: "Registered",
  CERTIFICATE_ISSUED: "Certificate issued",
  CORRECTION_PENDING: "Correction pending",
  CANCELLED: "Cancelled",
  LAPSED: "Lapsed",
};

/** Plain-language guidance shown to the citizen for each status. */
export const STATUS_GUIDANCE: Record<ApplicationStatus, string> = {
  DRAFT: "You have not submitted this application yet. Continue where you left off.",
  PAYMENT_PENDING: "Complete the fee payment to submit your application.",
  SUBMITTED: "We have received your application. A Marriage Officer will be assigned shortly.",
  UNDER_SCRUTINY: "The Marriage Officer is checking your documents. No action is needed from you.",
  AWAITING_APPLICANT_FIX: "The office has asked for a correction. Open the application to see what is needed.",
  NOTICE_PUBLISHED: "Your notice is published. The objection period is running.",
  OBJECTION_UNDER_ENQUIRY: "An objection has been filed and is being examined by the office.",
  AWAITING_REGISTRATION: "The objection period has closed. Your registration appointment will be confirmed.",
  REGISTERED: "Your marriage is registered. The certificate will be issued shortly.",
  CERTIFICATE_ISSUED: "Your certificate has been issued. You may download a certified copy.",
  CORRECTION_PENDING: "A correction to your certificate is being processed.",
  CANCELLED: "This application was cancelled. See the note from the office for the reason.",
  LAPSED: "This application lapsed because the registration deadline passed.",
};

export const STATUS_TONE: Record<ApplicationStatus, "neutral" | "progress" | "action" | "good" | "bad"> = {
  DRAFT: "neutral", PAYMENT_PENDING: "action", SUBMITTED: "progress", UNDER_SCRUTINY: "progress",
  AWAITING_APPLICANT_FIX: "action", NOTICE_PUBLISHED: "progress", OBJECTION_UNDER_ENQUIRY: "action",
  AWAITING_REGISTRATION: "progress", REGISTERED: "good", CERTIFICATE_ISSUED: "good",
  CORRECTION_PENDING: "progress", CANCELLED: "bad", LAPSED: "bad",
};

/** Ordered journey shown as a progress rail on the status page. */
export const JOURNEY: ApplicationStatus[] = [
  "SUBMITTED", "UNDER_SCRUTINY", "NOTICE_PUBLISHED", "AWAITING_REGISTRATION", "REGISTERED", "CERTIFICATE_ISSUED",
];

export type Office = {
  id: string;
  office_code: string;
  name: string;
  officer_name: string | null;
  designation: string | null;
  district_code: string;
  sub_division: string | null;
  police_station: string | null;
  address: string;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  acts: ActCode[];
  is_functional: boolean;
};

export type District = { code: string; name: string; name_bn: string | null; division: string | null };

export type Party = {
  id: string;
  application_id: string;
  role: PartyRole;
  name_english: string;
  name_bengali: string | null;
  date_of_birth: string;
  religion: string | null;
  nationality: string | null;
  marital_status_prior: string | null;
  occupation: string | null;
  father_name: string | null;
  mother_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  district_code: string | null;
  pincode: string | null;
  contact_email: string | null;
  contact_mobile: string | null;
};

export type Witness = {
  id: string; application_id: string; sequence: number;
  name: string; address: string | null; id_type: string | null; id_last_four: string | null; mobile: string | null;
};

export type MarregDocument = {
  id: string; application_id: string; type: DocumentType; storage_path: string;
  file_name: string | null; mime_type: string | null; size_bytes: number | null;
  status: DocumentStatus; rejection_reason: string | null; created_at: string;
};

export type Application = {
  id: string;
  application_number: string | null;
  owner_id: string;
  act_code: ActCode;
  status: ApplicationStatus;
  office_id: string | null;
  district_code: string | null;
  police_station: string | null;
  marriage_date: string | null;
  marriage_place: string | null;
  notice_receipt_date: string | null;
  receipt_date: string | null;
  objection_window_ends_at: string | null;
  registration_deadline_at: string | null;
  registered_at: string | null;
  submitted_at: string | null;
  cancelled_reason: string | null;
  officer_note: string | null;
  current_step: number;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string; email: string | null; full_name: string | null;
  mobile: string | null; role: UserRole; office_id: string | null;
};
