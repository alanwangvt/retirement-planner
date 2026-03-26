import {
  Account,
  Profile,
  Assumptions,
  AccumulationResult,
  RetirementResult,
  YearlyWithdrawal,
  FilingStatus,
  getTaxTreatment,
  isTraditional,
} from '../types';
import {
  calculateTotalFederalTax,
  calculateStateTax,
  calculateSSTaxableAmount,
  getStandardDeduction,
  getCapitalGainsBrackets,
  getMarginalTaxRate,
  getWithdrawalToFillBracket,
  getRoomToNextIRMAAThreshold,
  getIRMAAProximity,
} from './taxes';
import { getRMDDivisor, RMD_START_AGE } from './constants';
import type { CountryConfig } from '../countries';

interface AccountState {
  id: string;
  type: Account['type'];
  balance: number;
  costBasis: number; // For taxable accounts, tracks original investment
}

interface RothConversionResult {
  conversionAmount: number;
  taxOnConversion: number;
  fromAccountId: string | null;
  toAccountId: string | null;
  reason?: string;
  irmaaThresholdDistance?: number;
}

/**
 * Project future forced ordinary income (RMDs + taxable SS) across remaining retirement years
 * and return the marginal tax rate at the average annual income.
 * Gives the "level" rate that equalizes tax burden across all remaining years.
 * Recomputed each year as balances evolve.
 */
function computeLevelTargetRate(
  accountStates: AccountState[],
  profile: Profile,
  assumptions: Assumptions,
  currentAge: number,
  currentSocialSecurityIncome: number,
  filingStatus: FilingStatus,
  countryConfig?: CountryConfig
): number {
  const remainingYears = profile.lifeExpectancy - currentAge;
  if (remainingYears <= 0) return 0;

  const isTraditionalAccountFn = (type: string) =>
    countryConfig ? countryConfig.isTraditionalAccount(type) : isTraditional(type);
  const firstTradType = accountStates.find(acc => isTraditionalAccountFn(acc.type))?.type;

  let projectedTradBalance = accountStates
    .filter(acc => isTraditionalAccountFn(acc.type))
    .reduce((sum, acc) => sum + acc.balance, 0);

  let totalFutureOrdinaryIncome = 0;
  for (let y = 0; y < remainingYears; y++) {
    const projectedAge = currentAge + y;
    const ssIncome = currentSocialSecurityIncome > 0
      ? currentSocialSecurityIncome * Math.pow(1 + assumptions.inflationRate, y)
      : 0;

    let rmd = 0;
    if (countryConfig && firstTradType) {
      rmd = countryConfig.getMinimumWithdrawal(projectedAge, projectedTradBalance, firstTradType);
    } else if (projectedAge >= RMD_START_AGE) {
      const divisor = getRMDDivisor(projectedAge);
      if (divisor > 0) rmd = projectedTradBalance / divisor;
    }

    const ssTaxable = calculateSSTaxableAmount(ssIncome, rmd, filingStatus);
    totalFutureOrdinaryIncome += rmd + ssTaxable;

    projectedTradBalance = Math.max(
      0,
      projectedTradBalance * (1 + assumptions.retirementReturnRate) - rmd
    );
  }

  const averageAnnualOrdinaryIncome = totalFutureOrdinaryIncome / remainingYears;
  return getMarginalTaxRate(averageAnnualOrdinaryIncome, filingStatus);
}

/**
 * Perform Roth conversion based on strategy:
 *
 * aggressive-early (pre-RMD):  Convert up to user-set target bracket, capped at IRMAA.
 * aggressive-early (post-RMD): Convert only the 0% room (gap to standard deduction), capped at IRMAA.
 * auto: Bracket-smoothing — compute the level marginal rate that equalizes tax across all remaining
 *   years from projected RMDs + SS. Convert up to that bracket, with standard deduction as floor,
 *   capped at IRMAA.
 */
function performRothConversion(
  accountStates: AccountState[],
  assumptions: Assumptions,
  profile: Profile,
  currentOrdinaryIncome: number,
  socialSecurityIncome: number,
  targetSpending: number,
  age: number,
  _yearsIntoRetirement: number,
  countryConfig?: CountryConfig
): RothConversionResult {
  const result: RothConversionResult = {
    conversionAmount: 0,
    taxOnConversion: 0,
    fromAccountId: null,
    toAccountId: null,
  };

  const strategy = assumptions.rothConversionStrategy ?? 'off';
  if (strategy === 'off') return result;

  const isPreRMD = age < RMD_START_AGE;
  const filingStatus = profile.filingStatus || 'single';
  const stdDed = getStandardDeduction(filingStatus);
  const stdDedRoom = Math.max(0, stdDed - currentOrdinaryIncome);

  // Get account groups (shared across strategies)
  const isTraditionalAccountFn = (type: string) =>
    countryConfig ? countryConfig.isTraditionalAccount(type) : isTraditional(type);
  const traditionalAccounts = accountStates
    .filter(acc => isTraditionalAccountFn(acc.type) && acc.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const rothAccounts = accountStates
    .filter(acc => getTaxTreatment(acc.type) === 'roth' && acc.balance >= 0)
    .sort((a, b) => b.balance - a.balance);

  if (traditionalAccounts.length === 0) {
    result.reason = 'No traditional accounts';
    return result;
  }

  // IRMAA constraint (shared)
  const roomToIRMAA = getRoomToNextIRMAAThreshold(currentOrdinaryIncome, filingStatus);
  const irmaaProximity = getIRMAAProximity(currentOrdinaryIncome, age, filingStatus);

  // --- Determine maxConversion by strategy ---
  let maxConversion = 0;
  let limitingFactor = '';
  let targetRateForReason = 0;

  if (strategy === 'aggressive-early' && isPreRMD) {
    // Pre-RMD: convert up to user-set target rate
    const targetRate = assumptions.rothConversionTargetRate ?? 0.22;
    const currentMarginalRate = getMarginalTaxRate(currentOrdinaryIncome, filingStatus);
    if (currentMarginalRate >= targetRate) {
      result.reason = `Already at ${(currentMarginalRate * 100).toFixed(0)}% bracket`;
      return result;
    }
    maxConversion = getWithdrawalToFillBracket(currentOrdinaryIncome, targetRate, filingStatus);
    limitingFactor = `${(targetRate * 100).toFixed(0)}% bracket`;
    targetRateForReason = targetRate;
  } else if (strategy === 'aggressive-early' && !isPreRMD) {
    // Post-RMD: only harvest the 0% room (income below standard deduction)
    maxConversion = stdDedRoom;
    limitingFactor = '0% floor';
  } else {
    // auto: bracket-smoothing with standard-deduction floor
    const levelTargetRate = computeLevelTargetRate(
      accountStates, profile, assumptions, age,
      socialSecurityIncome, filingStatus, countryConfig
    );
    // getWithdrawalToFillBracket includes stdDedRoom when income < stdDed
    const levelRoom = levelTargetRate > 0
      ? getWithdrawalToFillBracket(currentOrdinaryIncome, levelTargetRate, filingStatus)
      : stdDedRoom;
    // Floor: always at least the 0% room even if level rate falls below standard deduction
    maxConversion = Math.max(levelRoom, stdDedRoom);
    limitingFactor = levelTargetRate > 0
      ? `${(levelTargetRate * 100).toFixed(0)}% level bracket`
      : '0% floor';
    targetRateForReason = levelTargetRate;
  }

  // Apply IRMAA cap
  if (irmaaProximity && roomToIRMAA < maxConversion) {
    maxConversion = roomToIRMAA;
    limitingFactor = 'IRMAA';
  }

  if (maxConversion <= 0) {
    result.reason = `At ${limitingFactor} limit`;
    result.irmaaThresholdDistance = irmaaProximity?.distanceToNext ?? undefined;
    return result;
  }

  // Safety margin check
  const marginalRateOnConversion = getMarginalTaxRate(currentOrdinaryIncome + maxConversion, filingStatus);
  const estimatedTax = maxConversion * marginalRateOnConversion;
  const totalPortfolioBalance = accountStates.reduce((sum, acc) => sum + acc.balance, 0);
  const cashNeededThisYear = targetSpending + estimatedTax - socialSecurityIncome;
  if (totalPortfolioBalance < cashNeededThisYear * 5) {
    result.reason = 'Insufficient assets for safety margin';
    return result;
  }

  // Execute conversion: largest traditional → largest Roth
  const fromAccount = traditionalAccounts[0];
  const actualConversion = Math.min(maxConversion, fromAccount.balance);
  if (actualConversion <= 0) {
    result.reason = 'No balance to convert';
    return result;
  }

  fromAccount.balance -= actualConversion;
  const toAccount = rothAccounts.length > 0 ? rothAccounts[0] : null;
  if (toAccount) toAccount.balance += actualConversion;

  result.conversionAmount = actualConversion;
  result.taxOnConversion = estimatedTax;
  result.fromAccountId = fromAccount.id;
  result.toAccountId = toAccount?.id || null;
  result.irmaaThresholdDistance = irmaaProximity?.distanceToNext ?? undefined;

  if (limitingFactor === 'IRMAA') {
    const nextSurcharge = irmaaProximity?.nextSurchargeAnnual || 0;
    const rateLabel = targetRateForReason > 0 ? `${(targetRateForReason * 100).toFixed(0)}%` : '0%';
    result.reason = `Fill to ${rateLabel} (IRMAA limit: +$${Math.round(nextSurcharge)}/yr)`;
  } else {
    result.reason = `Fill to ${limitingFactor}`;
  }

  return result;
}

/**
 * Calculate Required Minimum Distribution for traditional accounts
 * Uses country-specific logic if CountryConfig provided
 */
function calculateRMD(
  age: number,
  traditionalBalance: number,
  accountType: string,
  countryConfig?: CountryConfig
): number {
  if (countryConfig) {
    return countryConfig.getMinimumWithdrawal(age, traditionalBalance, accountType);
  }
  // Fallback to US RMD logic
  if (age < RMD_START_AGE) return 0;
  const divisor = getRMDDivisor(age);
  if (divisor <= 0) return 0;
  return traditionalBalance / divisor;
}

/**
 * Simulate retirement withdrawals with tax-optimized strategy
 */
export function calculateWithdrawals(
  accounts: Account[],
  profile: Profile,
  assumptions: Assumptions,
  accumulationResult: AccumulationResult,
  countryConfig?: CountryConfig
): RetirementResult {
  const retirementYears = profile.lifeExpectancy - profile.retirementAge;
  const currentYear = new Date().getFullYear();
  const retirementStartYear = currentYear + (profile.retirementAge - profile.currentAge);

  // Initialize account states with final balances from accumulation
  const accountStates: AccountState[] = accounts.map(account => ({
    id: account.id,
    type: account.type,
    balance: accumulationResult.finalBalances[account.id] || 0,
    // For taxable accounts, estimate cost basis as original balance + contributions
    // (simplified: assume 50% of balance is gains)
    costBasis: getTaxTreatment(account.type) === 'taxable'
      ? (accumulationResult.finalBalances[account.id] || 0) * 0.5
      : 0,
  }));

  // Calculate initial target spending based on safe withdrawal rate
  const totalPortfolio = accumulationResult.totalAtRetirement;
  let targetSpending = assumptions.annualSpendingAtRetirement 
    ?? (totalPortfolio * assumptions.safeWithdrawalRate);

  const yearlyWithdrawals: YearlyWithdrawal[] = [];
  let lifetimeTaxesPaid = 0;
  let portfolioDepletionAge: number | null = null;
  const accountDepletionAges: Record<string, number | null> = {};

  accounts.forEach(account => {
    accountDepletionAges[account.id] = null;
  });

  for (let i = 0; i <= retirementYears; i++) {
    const age = profile.retirementAge + i;
    const year = retirementStartYear + i;

    // Check if portfolio is depleted
    const totalRemaining = accountStates.reduce((sum, acc) => sum + acc.balance, 0);
    if (totalRemaining <= 0 && portfolioDepletionAge === null) {
      portfolioDepletionAge = age;
    }

    // Calculate government retirement benefits (Social Security, CPP/OAS, etc.)
    let governmentBenefits = 0;
    if (countryConfig) {
      const benefits = countryConfig.calculateRetirementBenefits(profile, age, 0);
      if (benefits.length > 0) {
        // Adjust for inflation from start age onwards
        const startAge = profile.socialSecurityStartAge || age;
        const yearsFromStartAge = Math.max(0, age - startAge);
        governmentBenefits = benefits.reduce((sum, b) => sum + b.annualAmount, 0);
        governmentBenefits *= Math.pow(1 + assumptions.inflationRate, yearsFromStartAge);
      }
    } else {
      // Fallback to US Social Security
      if (
        profile.socialSecurityBenefit &&
        profile.socialSecurityStartAge &&
        age >= profile.socialSecurityStartAge
      ) {
        // Adjust for inflation from start age onwards
        const yearsFromStartAge = age - profile.socialSecurityStartAge;
        const annualStartBenefit = profile.socialSecurityBenefit * 12; // input now monthly
        governmentBenefits = annualStartBenefit *
          Math.pow(1 + assumptions.inflationRate, yearsFromStartAge);
      }
    }
    const socialSecurityIncome = governmentBenefits; // Keep variable name for compatibility

    // Calculate minimum required withdrawals (RMD/RRIF) for each traditional account
    // NOTE: Per IRS rules, RMDs are calculated per-account, not on total balance.
    // Each account's RMD is based on that account's prior year-end balance.
    // This is also correct for Canadian RRIF minimums.
    // Use country config for traditional detection if available
    const isTraditionalAccount = (type: string) =>
      countryConfig ? countryConfig.isTraditionalAccount(type) : isTraditional(type);
    let totalMinimumWithdrawal = 0;
    accountStates
      .filter(acc => isTraditionalAccount(acc.type))
      .forEach(acc => {
        const minWithdrawal = calculateRMD(age, acc.balance, acc.type, countryConfig);
        totalMinimumWithdrawal += minWithdrawal;
      });
    const rmdAmount = totalMinimumWithdrawal;

    // Estimate the ordinary income that will result from regular withdrawals this year,
    // so the Roth conversion uses the correct base for bracket/IRMAA calculations.
    // The withdrawal strategy will:
    //   1. Take RMDs (already known)
    //   2. Fill bracket with traditional (up to spending need) — skipped if taxable-first is active
    //   3. Use taxable accounts for the remainder
    //   4. Fall back to more traditional if taxable insufficient
    const filingStatusForConversion = profile.filingStatus || 'single';
    const rothStrategy = assumptions.rothConversionStrategy ?? 'off';
    const estimatedFillTarget = rothStrategy === 'aggressive-early'
      ? (assumptions.rothConversionTargetRate ?? 0.22)
      : (assumptions.withdrawalBracketFillTarget ?? 0.12);
    const ssBasis = calculateSSTaxableAmount(socialSecurityIncome, rmdAmount, filingStatusForConversion);
    const roomInFillForEstimate = getWithdrawalToFillBracket(rmdAmount + ssBasis, estimatedFillTarget, filingStatusForConversion);
    const spendingGapForEstimate = Math.max(0, targetSpending - socialSecurityIncome - rmdAmount);
    const tradBracket12Fill = Math.min(roomInFillForEstimate, spendingGapForEstimate);
    const taxableAvailable = accountStates
      .filter(acc => getTaxTreatment(acc.type) === 'taxable')
      .reduce((sum, acc) => sum + acc.balance, 0);
    const tradFallback = Math.max(0, spendingGapForEstimate - tradBracket12Fill - taxableAvailable);
    const estimatedBaseOrdinaryIncome = rmdAmount + tradBracket12Fill + tradFallback + ssBasis;

    // Perform Roth conversion before regular withdrawals
    const rothConversion = performRothConversion(
      accountStates,
      assumptions,
      profile,
      estimatedBaseOrdinaryIncome, // estimated ordinary income from regular withdrawals + SS
      socialSecurityIncome,
      targetSpending,
      age,
      i, // years into retirement for inflation adjustment
      countryConfig
    );

    // Single-pass tax calculation — totalTax = federalIncomeTax + stateIncomeTax (no capital gains)
    const withdrawals = performTaxOptimizedWithdrawal(
      accountStates, targetSpending, rmdAmount, socialSecurityIncome,
      profile, assumptions, accountDepletionAges, age, countryConfig
    );

    const filingStatusFS = profile.filingStatus || 'single';
    const stdDed = getStandardDeduction(filingStatusFS);
    const ssTaxable = calculateSSTaxableAmount(
      socialSecurityIncome,
      withdrawals.traditionalWithdrawal + rothConversion.conversionAmount,
      filingStatusFS
    );
    const ordinaryIncome = withdrawals.traditionalWithdrawal + ssTaxable + rothConversion.conversionAmount;
    const federalTax = calculateTotalFederalTax(ordinaryIncome, 0, filingStatusFS);
    const stateTax = calculateStateTax(Math.max(0, ordinaryIncome - stdDed), profile.stateTaxRate || 0);
    const totalTax = federalTax + stateTax;
    lifetimeTaxesPaid += totalTax;
    const afterTaxIncome = withdrawals.total + socialSecurityIncome - totalTax;
    const grossIncome = withdrawals.traditionalWithdrawal + withdrawals.taxableWithdrawal +
                        rothConversion.conversionAmount;

    // Apply investment returns to remaining balances after finalised withdrawals
    accountStates.forEach(acc => {
      acc.balance *= (1 + assumptions.retirementReturnRate);
    });

    // Add Roth conversion amounts to withdrawal tracking for display
    const withdrawalsByAccount = { ...withdrawals.byAccount };
    if (rothConversion.conversionAmount > 0 && rothConversion.fromAccountId) {
      withdrawalsByAccount[rothConversion.fromAccountId] =
        (withdrawalsByAccount[rothConversion.fromAccountId] || 0) + rothConversion.conversionAmount;
    }

    // Record the year's data
    const remainingBalances: Record<string, number> = {};
    accountStates.forEach(acc => {
      remainingBalances[acc.id] = acc.balance;
    });

    yearlyWithdrawals.push({
      age,
      year,
      withdrawals: withdrawalsByAccount,
      remainingBalances,
      totalWithdrawal: withdrawals.total,
      traditionalWithdrawal: withdrawals.traditionalWithdrawal,
      rothWithdrawal: withdrawals.rothWithdrawal,
      taxableWithdrawal: withdrawals.taxableWithdrawal,
      hsaWithdrawal: withdrawals.hsaWithdrawal,
      socialSecurityIncome,
      grossIncome,
      federalTax,
      stateTax,
      totalTax,
      afterTaxIncome,
      targetSpending,
      rmdAmount,
      rothConversionAmount: rothConversion.conversionAmount,
      rothConversionFromAccountId: rothConversion.fromAccountId,
      rothConversionToAccountId: rothConversion.toAccountId,
      rothConversionReason: rothConversion.reason,
      irmaaThresholdDistance: rothConversion.irmaaThresholdDistance,
      totalRemainingBalance: accountStates.reduce((sum, acc) => sum + acc.balance, 0),
    });

    // Inflate target spending for next year
    targetSpending *= (1 + assumptions.inflationRate);
  }

  // Calculate sustainable withdrawal amounts in today's dollars
  // Note: Does not include Roth conversions as they are reinvested, not spent
  const sustainableAnnualWithdrawal = totalPortfolio * assumptions.safeWithdrawalRate;
  const sustainableMonthlyWithdrawal = sustainableAnnualWithdrawal / 12;

  return {
    yearlyWithdrawals,
    portfolioDepletionAge,
    lifetimeTaxesPaid,
    sustainableMonthlyWithdrawal,
    sustainableAnnualWithdrawal,
    accountDepletionAges,
  };
}

interface WithdrawalResult {
  total: number;
  traditionalWithdrawal: number;
  rothWithdrawal: number;
  taxableWithdrawal: number;
  taxableGains: number;
  hsaWithdrawal: number;
  byAccount: Record<string, number>;
}

/**
 * Perform tax-optimized withdrawal strategy based on comprehensive tax rules:
 * 
 * RULE 0: Take required RMDs from traditional accounts (mandatory)
 * RULE 3: Fill low tax brackets deliberately with traditional withdrawals
 * RULE 4: Prefer capital gains over ordinary income (use taxable brokerage)
 * RULE 2 + RULE 6: Deplete traditional accounts to reduce future RMDs
 * RULE 8: Use Roth only as pressure-release valve (preserve tax-free growth)
 * RULE 9: Use HSA last (triple tax-free, better than Roth)
 * 
 * Philosophy: Protect tax-free growth (Roth/HSA last), exploit low brackets,
 * prefer capital gains, and maintain control over timing of taxation.
 */
function performTaxOptimizedWithdrawal(
  accountStates: AccountState[],
  targetSpending: number,
  rmdAmount: number,
  socialSecurityIncome: number,
  profile: Profile,
  assumptions: Assumptions,
  accountDepletionAges: Record<string, number | null>,
  age: number,
  countryConfig?: CountryConfig
): WithdrawalResult {
  const result: WithdrawalResult = {
    total: 0,
    traditionalWithdrawal: 0,
    rothWithdrawal: 0,
    taxableWithdrawal: 0,
    taxableGains: 0,
    hsaWithdrawal: 0,
    byAccount: {},
  };

  accountStates.forEach(acc => {
    result.byAccount[acc.id] = 0;
  });

  // How much do we need after Social Security?
  let remainingNeed = Math.max(0, targetSpending - socialSecurityIncome);

  // Get account groups - use country config for traditional detection if available
  const isTraditionalAccount = (type: string) =>
    countryConfig ? countryConfig.isTraditionalAccount(type) : isTraditional(type);
  const traditionalAccounts = accountStates.filter(acc => isTraditionalAccount(acc.type));
  const rothAccounts = accountStates.filter(acc =>
    getTaxTreatment(acc.type) === 'roth'
  );
  const taxableAccounts = accountStates.filter(acc =>
    getTaxTreatment(acc.type) === 'taxable'
  );
  const hsaAccounts = accountStates.filter(acc =>
    getTaxTreatment(acc.type) === 'hsa'
  );

  // Step 1: Take RMDs from traditional accounts (required)
  let rmdRemaining = rmdAmount;
  for (const acc of traditionalAccounts) {
    if (rmdRemaining <= 0) break;
    const withdrawal = Math.min(rmdRemaining, acc.balance);
    acc.balance -= withdrawal;
    result.byAccount[acc.id] += withdrawal;
    result.traditionalWithdrawal += withdrawal;
    result.total += withdrawal;
    rmdRemaining -= withdrawal;
    remainingNeed = Math.max(0, remainingNeed - withdrawal);

    if (acc.balance <= 0 && accountDepletionAges[acc.id] === null) {
      accountDepletionAges[acc.id] = age;
    }
  }

  // Step 2: RULE 3 - Fill up to target bracket with additional traditional withdrawals.
  // Always runs regardless of taxableFirstSpendingAge — filling the low bracket now (0-12%)
  // prevents larger forced RMDs later at higher rates. Taxable accounts cover remaining
  // spending above the bracket fill in Step 3.
  const filingStatus = profile.filingStatus || 'single';
  const standardDeduction = getStandardDeduction(filingStatus);
  const rothStrategy = assumptions.rothConversionStrategy ?? 'off';
  const fillTarget = rothStrategy === 'aggressive-early'
    ? (assumptions.rothConversionTargetRate ?? 0.22)
    : (assumptions.withdrawalBracketFillTarget ?? 0.12);

  {
    const ssTaxableStep2 = calculateSSTaxableAmount(socialSecurityIncome, result.traditionalWithdrawal, filingStatus);
    const incomeAfterRMDs = result.traditionalWithdrawal + ssTaxableStep2;
    const roomInFillBracket = getWithdrawalToFillBracket(incomeAfterRMDs, fillTarget, filingStatus);

    // Withdraw additional from traditional if we have room and need the money
    const additionalTraditional = Math.min(roomInFillBracket, remainingNeed);
    let additionalRemaining = additionalTraditional;

    for (const acc of traditionalAccounts) {
      if (additionalRemaining <= 0) break;
      const withdrawal = Math.min(additionalRemaining, acc.balance);
      acc.balance -= withdrawal;
      result.byAccount[acc.id] += withdrawal;
      result.traditionalWithdrawal += withdrawal;
      result.total += withdrawal;
      additionalRemaining -= withdrawal;
      remainingNeed -= withdrawal;

      if (acc.balance <= 0 && accountDepletionAges[acc.id] === null) {
        accountDepletionAges[acc.id] = age;
      }
    }
  }

  // Step 2.5: 0% LTCG Harvesting
  // In years where ordinary income is below the 0% capital gains threshold,
  // step up cost basis on taxable accounts by simulating a sell-and-rebuy.
  // This eliminates future capital gains taxes at no current cost.
  {
    const ltcgBrackets = getCapitalGainsBrackets(filingStatus);
    const ltcg0Ceiling = ltcgBrackets[0].max; // 96700 MFJ / 48350 single
    const ssTaxableForHarvest = calculateSSTaxableAmount(socialSecurityIncome, result.traditionalWithdrawal, filingStatus);
    const ordinaryTaxableIncome = Math.max(0, result.traditionalWithdrawal + ssTaxableForHarvest - standardDeduction);
    let harvestRoom = Math.max(0, ltcg0Ceiling - ordinaryTaxableIncome);

    for (const acc of taxableAccounts) {
      if (harvestRoom <= 0) break;
      const unrealizedGains = Math.max(0, acc.balance - acc.costBasis);
      if (unrealizedGains <= 0) continue;
      const harvestAmount = Math.min(unrealizedGains, harvestRoom);
      acc.costBasis += harvestAmount; // step up basis — 0% tax, $0 cash impact
      harvestRoom -= harvestAmount;
    }
  }

  // Step 3: RULE 4 - Use taxable brokerage for remaining needs
  // Prefer capital gains (0-15%) over ordinary income at higher brackets
  for (const acc of taxableAccounts) {
    if (remainingNeed <= 0) break;
    const withdrawal = Math.min(remainingNeed, acc.balance);

    // Calculate gains portion (simplified: proportional to balance vs cost basis)
    const gainRatio = acc.costBasis > 0 ? Math.max(0, 1 - acc.costBasis / acc.balance) : 0.5;
    const gains = withdrawal * gainRatio;

    acc.balance -= withdrawal;
    // Reduce cost basis proportionally
    if (acc.balance > 0) {
      acc.costBasis *= (acc.balance / (acc.balance + withdrawal));
    } else {
      acc.costBasis = 0;
    }

    result.byAccount[acc.id] += withdrawal;
    result.taxableWithdrawal += withdrawal;
    result.taxableGains += gains;
    result.total += withdrawal;
    remainingNeed -= withdrawal;

    if (acc.balance <= 0 && accountDepletionAges[acc.id] === null) {
      accountDepletionAges[acc.id] = age;
    }
  }

  // Step 4: RULE 2 + RULE 6 - Deplete traditional accounts beyond 12% bracket
  // Better to control when we pay taxes than let future RMDs force us into higher brackets
  if (remainingNeed > 0) {
    for (const acc of traditionalAccounts) {
      if (remainingNeed <= 0) break;
      const withdrawal = Math.min(remainingNeed, acc.balance);
      acc.balance -= withdrawal;
      result.byAccount[acc.id] += withdrawal;
      result.traditionalWithdrawal += withdrawal;
      result.total += withdrawal;
      remainingNeed -= withdrawal;

      if (acc.balance <= 0 && accountDepletionAges[acc.id] === null) {
        accountDepletionAges[acc.id] = age;
      }
    }
  }

  // Step 5: RULE 8 - Use Roth only as pressure-release valve
  // Preserve tax-free growth; use only when other options exhausted
  for (const acc of rothAccounts) {
    if (remainingNeed <= 0) break;
    const withdrawal = Math.min(remainingNeed, acc.balance);
    acc.balance -= withdrawal;
    result.byAccount[acc.id] += withdrawal;
    result.rothWithdrawal += withdrawal;
    result.total += withdrawal;
    remainingNeed -= withdrawal;

    if (acc.balance <= 0 && accountDepletionAges[acc.id] === null) {
      accountDepletionAges[acc.id] = age;
    }
  }

  // Step 6: RULE 9 - Use HSA last (triple tax-free, stealth Roth)
  // Superior tax treatment; preserve as long as possible
  for (const acc of hsaAccounts) {
    if (remainingNeed <= 0) break;
    const withdrawal = Math.min(remainingNeed, acc.balance);
    acc.balance -= withdrawal;
    result.byAccount[acc.id] += withdrawal;
    result.hsaWithdrawal += withdrawal;
    result.total += withdrawal;
    remainingNeed -= withdrawal;

    if (acc.balance <= 0 && accountDepletionAges[acc.id] === null) {
      accountDepletionAges[acc.id] = age;
    }
  }

  return result;
}
