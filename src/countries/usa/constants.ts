import type { TaxBracket, RMDEntry, IRMAAThreshold } from '../../types';

// 2025 Federal Tax Brackets - Married Filing Jointly
export const TAX_BRACKETS_MFJ: TaxBracket[] = [
  { min: 0, max: 23850, rate: 0.10 },
  { min: 23850, max: 96950, rate: 0.12 },
  { min: 96950, max: 206700, rate: 0.22 },
  { min: 206700, max: 394600, rate: 0.24 },
  { min: 394600, max: 501050, rate: 0.32 },
  { min: 501050, max: 751600, rate: 0.35 },
  { min: 751600, max: Infinity, rate: 0.37 },
];

// 2025 Federal Tax Brackets - Single
export const TAX_BRACKETS_SINGLE: TaxBracket[] = [
  { min: 0, max: 11925, rate: 0.10 },
  { min: 11925, max: 48475, rate: 0.12 },
  { min: 48475, max: 103350, rate: 0.22 },
  { min: 103350, max: 197300, rate: 0.24 },
  { min: 197300, max: 250525, rate: 0.32 },
  { min: 250525, max: 626350, rate: 0.35 },
  { min: 626350, max: Infinity, rate: 0.37 },
];

// 2025 Standard Deductions
export const STANDARD_DEDUCTION_MFJ = 31500;
export const STANDARD_DEDUCTION_SINGLE = 15750;

// Long-term capital gains rates (2025)
export const CAPITAL_GAINS_BRACKETS_MFJ: TaxBracket[] = [
  { min: 0, max: 96700, rate: 0 },
  { min: 96700, max: 600050, rate: 0.15 },
  { min: 600050, max: Infinity, rate: 0.20 },
];

export const CAPITAL_GAINS_BRACKETS_SINGLE: TaxBracket[] = [
  { min: 0, max: 48350, rate: 0 },
  { min: 48350, max: 533400, rate: 0.15 },
  { min: 533400, max: Infinity, rate: 0.20 },
];

// 2025 IRMAA Thresholds (Medicare Part B & D Surcharges)
// Based on Modified Adjusted Gross Income (MAGI) from 2 years prior
// Surcharges are monthly amounts added to the base Medicare Part B premium.
// Source: SSA.gov "Monthly Medicare Premiums for 2026" and SSA POMS HI 01101.020 (updated 12/02/2025).
// 2026 standard Part B base premium: $202.90/month.
// Part B surcharges = (total shown on POMS) - $202.90.
// Part D surcharges are listed directly by SSA (plan premium + surcharge).

export const IRMAA_THRESHOLDS_MFJ: IRMAAThreshold[] = [
  { min: 0,      max: 218000,   partBSurcharge: 0,      partDSurcharge: 0     },
  { min: 218000, max: 274000,   partBSurcharge: 81.20,  partDSurcharge: 14.50 },
  { min: 274000, max: 342000,   partBSurcharge: 202.90, partDSurcharge: 37.50 },
  { min: 342000, max: 410000,   partBSurcharge: 324.60, partDSurcharge: 60.40 },
  { min: 410000, max: 750000,   partBSurcharge: 446.30, partDSurcharge: 83.30 },
  { min: 750000, max: Infinity, partBSurcharge: 487.00, partDSurcharge: 91.00 },
];

export const IRMAA_THRESHOLDS_SINGLE: IRMAAThreshold[] = [
  { min: 0,      max: 109000,   partBSurcharge: 0,      partDSurcharge: 0     },
  { min: 109000, max: 137000,   partBSurcharge: 81.20,  partDSurcharge: 14.50 },
  { min: 137000, max: 171000,   partBSurcharge: 202.90, partDSurcharge: 37.50 },
  { min: 171000, max: 205000,   partBSurcharge: 324.60, partDSurcharge: 60.40 },
  { min: 205000, max: 500000,   partBSurcharge: 446.30, partDSurcharge: 83.30 },
  { min: 500000, max: Infinity, partBSurcharge: 487.00, partDSurcharge: 91.00 },
];

// Medicare starts at age 65
export const MEDICARE_START_AGE = 65;

// IRMAA uses MAGI from 2 years prior
export const IRMAA_LOOKBACK_YEARS = 2;

// RMD starts at age 73 (SECURE 2.0 Act)
export const RMD_START_AGE = 73;

// IRS Uniform Lifetime Table
export const RMD_TABLE: RMDEntry[] = [
  { age: 73, divisor: 26.5 },
  { age: 74, divisor: 25.5 },
  { age: 75, divisor: 24.6 },
  { age: 76, divisor: 23.7 },
  { age: 77, divisor: 22.9 },
  { age: 78, divisor: 22.0 },
  { age: 79, divisor: 21.1 },
  { age: 80, divisor: 20.2 },
  { age: 81, divisor: 19.4 },
  { age: 82, divisor: 18.5 },
  { age: 83, divisor: 17.7 },
  { age: 84, divisor: 16.8 },
  { age: 85, divisor: 16.0 },
  { age: 86, divisor: 15.2 },
  { age: 87, divisor: 14.4 },
  { age: 88, divisor: 13.7 },
  { age: 89, divisor: 12.9 },
  { age: 90, divisor: 12.2 },
  { age: 91, divisor: 11.5 },
  { age: 92, divisor: 10.8 },
  { age: 93, divisor: 10.1 },
  { age: 94, divisor: 9.5 },
  { age: 95, divisor: 8.9 },
  { age: 96, divisor: 8.4 },
  { age: 97, divisor: 7.8 },
  { age: 98, divisor: 7.3 },
  { age: 99, divisor: 6.8 },
  { age: 100, divisor: 6.4 },
  { age: 101, divisor: 6.0 },
  { age: 102, divisor: 5.6 },
  { age: 103, divisor: 5.2 },
  { age: 104, divisor: 4.9 },
  { age: 105, divisor: 4.6 },
  { age: 106, divisor: 4.3 },
  { age: 107, divisor: 4.1 },
  { age: 108, divisor: 3.9 },
  { age: 109, divisor: 3.7 },
  { age: 110, divisor: 3.5 },
  { age: 111, divisor: 3.4 },
  { age: 112, divisor: 3.3 },
  { age: 113, divisor: 3.1 },
  { age: 114, divisor: 3.0 },
  { age: 115, divisor: 2.9 },
  { age: 116, divisor: 2.8 },
  { age: 117, divisor: 2.7 },
  { age: 118, divisor: 2.5 },
  { age: 119, divisor: 2.3 },
  { age: 120, divisor: 2.0 },
];

// US States
export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];
