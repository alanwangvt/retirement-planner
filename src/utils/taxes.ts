import { FilingStatus, TaxBracket, IRMAAThreshold } from '../types';
import {
  TAX_BRACKETS_MFJ,
  TAX_BRACKETS_SINGLE,
  STANDARD_DEDUCTION_MFJ,
  STANDARD_DEDUCTION_SINGLE,
  CAPITAL_GAINS_BRACKETS_MFJ,
  CAPITAL_GAINS_BRACKETS_SINGLE,
} from './constants';
import {
  IRMAA_THRESHOLDS_MFJ,
  IRMAA_THRESHOLDS_SINGLE,
  MEDICARE_START_AGE,
} from '../countries/usa/constants';

export function getTaxBrackets(filingStatus: FilingStatus): TaxBracket[] {
  return filingStatus === 'married_filing_jointly'
    ? TAX_BRACKETS_MFJ
    : TAX_BRACKETS_SINGLE;
}

export function getStandardDeduction(filingStatus: FilingStatus): number {
  return filingStatus === 'married_filing_jointly'
    ? STANDARD_DEDUCTION_MFJ
    : STANDARD_DEDUCTION_SINGLE;
}

export function getCapitalGainsBrackets(filingStatus: FilingStatus): TaxBracket[] {
  return filingStatus === 'married_filing_jointly'
    ? CAPITAL_GAINS_BRACKETS_MFJ
    : CAPITAL_GAINS_BRACKETS_SINGLE;
}

/**
 * Calculate federal income tax on ordinary income
 */
export function calculateFederalIncomeTax(
  taxableIncome: number,
  filingStatus: FilingStatus
): number {
  if (taxableIncome <= 0) return 0;

  const brackets = getTaxBrackets(filingStatus);
  let tax = 0;
  let remainingIncome = taxableIncome;

  for (const bracket of brackets) {
    const bracketWidth = bracket.max - bracket.min;
    const incomeInBracket = Math.min(remainingIncome, bracketWidth);

    if (incomeInBracket <= 0) break;

    tax += incomeInBracket * bracket.rate;
    remainingIncome -= incomeInBracket;
  }

  return tax;
}

/**
 * Calculate capital gains tax on taxable brokerage withdrawals
 * Simplified: treats the entire gain portion at long-term capital gains rates
 */
export function calculateCapitalGainsTax(
  capitalGains: number,
  otherTaxableIncome: number,
  filingStatus: FilingStatus
): number {
  if (capitalGains <= 0) return 0;

  const brackets = getCapitalGainsBrackets(filingStatus);
  const standardDeduction = getStandardDeduction(filingStatus);

  // Capital gains stack on top of ordinary income for bracket determination
  const incomeBase = Math.max(0, otherTaxableIncome - standardDeduction);

  let tax = 0;
  let remainingGains = capitalGains;
  let currentIncome = incomeBase;

  for (const bracket of brackets) {
    if (remainingGains <= 0) break;

    // How much room is left in this bracket?
    const roomInBracket = Math.max(0, bracket.max - currentIncome);
    const gainsInBracket = Math.min(remainingGains, roomInBracket);

    if (gainsInBracket > 0 && currentIncome + gainsInBracket > bracket.min) {
      // Some gains fall in this bracket
      const effectiveGains = Math.min(
        gainsInBracket,
        currentIncome + gainsInBracket - Math.max(bracket.min, currentIncome)
      );
      tax += effectiveGains * bracket.rate;
    }

    currentIncome += gainsInBracket;
    remainingGains -= gainsInBracket;
  }

  return tax;
}

/**
 * Calculate total federal tax on a mix of income types
 */
export function calculateTotalFederalTax(
  ordinaryIncome: number, // Traditional withdrawals, SS, etc.
  capitalGains: number, // Growth portion of taxable account withdrawals
  filingStatus: FilingStatus
): number {
  const standardDeduction = getStandardDeduction(filingStatus);
  const taxableOrdinaryIncome = Math.max(0, ordinaryIncome - standardDeduction);

  const incomeTax = calculateFederalIncomeTax(taxableOrdinaryIncome, filingStatus);
  const capitalGainsTax = calculateCapitalGainsTax(capitalGains, ordinaryIncome, filingStatus);

  return incomeTax + capitalGainsTax;
}

/**
 * Calculate state tax (simplified flat rate)
 */
export function calculateStateTax(
  taxableIncome: number,
  stateTaxRate: number
): number {
  return Math.max(0, taxableIncome) * stateTaxRate;
}

/**
 * Calculate the marginal tax rate for the next dollar of ordinary income
 */
export function getMarginalTaxRate(
  currentTaxableIncome: number,
  filingStatus: FilingStatus
): number {
  const standardDeduction = getStandardDeduction(filingStatus);
  const adjustedIncome = currentTaxableIncome - standardDeduction;

  if (adjustedIncome <= 0) return 0;

  const brackets = getTaxBrackets(filingStatus);

  for (const bracket of brackets) {
    if (adjustedIncome <= bracket.max) {
      return bracket.rate;
    }
  }

  return brackets[brackets.length - 1].rate;
}

/**
 * Calculate how much can be withdrawn from traditional accounts
 * while staying in a specific tax bracket
 */
export function getWithdrawalToFillBracket(
  currentOrdinaryIncome: number,
  targetBracketRate: number,
  filingStatus: FilingStatus
): number {
  const standardDeduction = getStandardDeduction(filingStatus);
  const brackets = getTaxBrackets(filingStatus);

  // Find the target bracket
  const targetBracket = brackets.find(b => b.rate === targetBracketRate);
  if (!targetBracket) return 0;

  const currentTaxable = Math.max(0, currentOrdinaryIncome - standardDeduction);

  // If already past this bracket, return 0
  if (currentTaxable >= targetBracket.max) return 0;

  // Calculate room from current position to top of target bracket
  // This includes all intermediate brackets
  const roomInBracket = targetBracket.max - currentTaxable;

  // If we're below the standard deduction, add that room too
  const deductionRoom = currentOrdinaryIncome < standardDeduction
    ? standardDeduction - currentOrdinaryIncome
    : 0;

  return roomInBracket + deductionRoom;
}

/**
 * Calculate the taxable portion of Social Security income using the IRS
 * provisional income formula (IRS Publication 915).
 *
 * Provisional income = otherOrdinaryIncome + 50% of SS
 *   - Below base amount (T1): 0% of SS is taxable
 *   - Between T1 and T2:      up to 50% of SS is taxable
 *   - Above T2:               up to 85% of SS is taxable
 */
export function calculateSSTaxableAmount(
  ssIncome: number,
  otherOrdinaryIncome: number, // traditional withdrawals + Roth conversions (no SS)
  filingStatus: FilingStatus
): number {
  if (ssIncome <= 0) return 0;

  const [t1, t2] = filingStatus === 'married_filing_jointly'
    ? [32000, 44000]
    : [25000, 34000];

  const provisionalIncome = otherOrdinaryIncome + ssIncome * 0.5;

  if (provisionalIncome < t1) return 0;

  if (provisionalIncome < t2) {
    return Math.min(ssIncome * 0.5, (provisionalIncome - t1) * 0.5);
  }

  // PI >= T2: 85% zone
  const zone2Portion = Math.min(ssIncome * 0.5, (t2 - t1) * 0.5);
  return Math.min(ssIncome * 0.85, zone2Portion + 0.85 * (provisionalIncome - t2));
}

/**
 * Effective tax rate
 */
export function getEffectiveTaxRate(
  totalTax: number,
  grossIncome: number
): number {
  if (grossIncome <= 0) return 0;
  return totalTax / grossIncome;
}

/**
 * Get IRMAA thresholds based on filing status
 */
export function getIRMAAThresholds(filingStatus: FilingStatus): IRMAAThreshold[] {
  return filingStatus === 'married_filing_jointly'
    ? IRMAA_THRESHOLDS_MFJ
    : IRMAA_THRESHOLDS_SINGLE;
}

/**
 * Calculate room to next IRMAA threshold
 * Returns how much income can be added before hitting next IRMAA tier
 */
export function getRoomToNextIRMAAThreshold(
  currentMAGI: number,
  filingStatus: FilingStatus
): number {
  const thresholds = getIRMAAThresholds(filingStatus);
  
  // Find current threshold
  const currentThreshold = thresholds.find(t => currentMAGI >= t.min && currentMAGI < t.max);
  if (!currentThreshold) {
    // Already at max threshold
    return 0;
  }
  
  return currentThreshold.max - currentMAGI;
}

/**
 * Get IRMAA surcharge for given MAGI
 * Returns total annual surcharge (Part B + Part D) * 12 months
 */
export function getAnnualIRMAASurcharge(
  magi: number,
  filingStatus: FilingStatus
): number {
  const thresholds = getIRMAAThresholds(filingStatus);
  
  const threshold = thresholds.find(t => magi >= t.min && magi < t.max);
  if (!threshold) {
    // Use the highest threshold if beyond max
    const maxThreshold = thresholds[thresholds.length - 1];
    return (maxThreshold.partBSurcharge + maxThreshold.partDSurcharge) * 12;
  }
  
  return (threshold.partBSurcharge + threshold.partDSurcharge) * 12;
}

/**
 * Calculate distance to next IRMAA threshold and the surcharge impact
 * Returns null if Medicare has not started yet
 */
export function getIRMAAProximity(
  currentMAGI: number,
  age: number,
  filingStatus: FilingStatus
): { distanceToNext: number; nextSurchargeAnnual: number } | null {
  // IRMAA only matters if at or approaching Medicare age
  if (age < MEDICARE_START_AGE - 2) return null;
  
  const thresholds = getIRMAAThresholds(filingStatus);
  const currentThreshold = thresholds.find(t => currentMAGI >= t.min && currentMAGI < t.max);
  
  if (!currentThreshold) {
    return { distanceToNext: 0, nextSurchargeAnnual: 0 };
  }
  
  // Find the next threshold
  const currentIndex = thresholds.indexOf(currentThreshold);
  const nextThreshold = thresholds[currentIndex + 1];
  
  if (!nextThreshold) {
    return { distanceToNext: Infinity, nextSurchargeAnnual: 0 };
  }
  
  const distanceToNext = currentThreshold.max - currentMAGI;
  const nextSurchargeAnnual = (nextThreshold.partBSurcharge + nextThreshold.partDSurcharge) * 12;
  
  return { distanceToNext, nextSurchargeAnnual };
}
