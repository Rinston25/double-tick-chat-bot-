/**
 * Single source of truth for every Zoho CRM module and field API name used
 * by this project. If your CRM uses different API names for the custom
 * fields (Zoho auto-suffixes duplicates, e.g. `Vehicle_Model1`), change
 * them here only — no other file should hardcode a Zoho field name.
 *
 * See docs/ZOHO_SETUP.md for the exact field type to create in the Zoho UI
 * for every custom field referenced below.
 */

export const ZOHO_MODULES = {
  leads: 'Leads',
  contacts: 'Contacts',
  deals: 'Deals',
  cases: 'Cases',
} as const;

export const LEAD_FIELDS = {
  firstName: 'First_Name',
  lastName: 'Last_Name',
  email: 'Email',
  phone: 'Phone',
  city: 'City',
  leadSource: 'Lead_Source',
  description: 'Description',
  vehicleModel: 'Vehicle_Model',
  preferredCity: 'Preferred_City',
  testDriveRequested: 'Test_Drive_Requested',
} as const;

export const LEAD_SOURCE_VALUE = 'AI Chat Agent';

export const CONTACT_FIELDS = {
  firstName: 'First_Name',
  lastName: 'Last_Name',
  phone: 'Phone',
  mobile: 'Mobile',
  email: 'Email',
  registrationNumber: 'Registration_Number',
} as const;

export const DEAL_FIELDS = {
  dealName: 'Deal_Name',
  stage: 'Stage',
  closingDate: 'Closing_Date',
  amount: 'Amount',
  description: 'Description',
  contactName: 'Contact_Name',
  vehicleModel: 'Vehicle_Model',
  variant: 'Variant',
  testDriveDate: 'Test_Drive_Date',
  quotationAmount: 'Quotation_Amount',
  dealerName: 'Dealer_Name',
  dealerPhone: 'Dealer_Phone',
  followUpPreference: 'Follow_Up_Preference',
  followUpTime: 'Follow_Up_Time',
  bookingId: 'Booking_ID',
  allocationStatus: 'Allocation_Status',
  vin: 'VIN',
  expectedDeliveryDate: 'Expected_Delivery_Date',
  balancePaymentLink: 'Balance_Payment_Link',
} as const;

/**
 * Deal stage values used by this app. These intentionally reuse Zoho's
 * default pipeline stages ("Negotiation/Review", "Closed Won") rather than
 * custom ones ("Test Drive Scheduled", "Closed Won - Booking Done") — Zoho's
 * Stage field is a standard/system field, and adding new picklist values to
 * it is blocked on some editions/plans both in the UI and via the Settings
 * API (only genuinely custom fields support API-driven picklist updates).
 * If your org *does* allow customizing the Stage field, feel free to add
 * dedicated stages and swap the values below — nothing else in the code
 * depends on the literal strings beyond this file.
 */
export const DEAL_STAGES = {
  /** Any open, non-closed stage works for tracking a test drive / active quotation. */
  testDriveScheduled: 'Negotiation/Review',
  /** Every Deal in this domain represents a vehicle sale, so Closed Won IS the booking. */
  closedWonBooked: 'Closed Won',
} as const;

/** Deal stages considered "closed" and therefore excluded from get_deal_status (pipeline). */
export const CLOSED_DEAL_STAGES: readonly string[] = ['Closed Won', 'Closed Lost'];

export const CASE_FIELDS = {
  subject: 'Subject',
  status: 'Status',
  priority: 'Priority',
  caseOrigin: 'Case_Origin',
  description: 'Description',
  contactName: 'Contact_Name',
  registrationNumber: 'Registration_Number',
  odometerReading: 'Odometer_Reading',
  serviceType: 'Service_Type',
  preferredServiceCenter: 'Preferred_Service_Center',
  vehicleModel: 'Vehicle_Model',
} as const;

export const CASE_DEFAULTS = {
  status: 'New',
  caseOrigin: 'Web',
  priority: 'Medium',
} as const;

export const SERVICE_TYPES = [
  'Periodic Maintenance',
  'Complaint/Repair',
  'Warranty',
  'Accident Repair',
  'Other',
] as const;

export const FOLLOW_UP_PREFERENCES = ['Call', 'WhatsApp', 'Email'] as const;

export const ALLOCATION_STATUSES = ['Dispatch Pending', 'In Transit', 'Delivered'] as const;

export const VEHICLE_MODELS = ['XUV700', 'Thar', 'Scorpio-N'] as const;
