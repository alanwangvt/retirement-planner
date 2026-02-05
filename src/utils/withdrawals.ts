import {
  Account,
  Profile,
  Assumptions,
  AccumulationResult,
  RetirementResult,
  YearlyWithdrawal,
  getTaxTreatment,
  isTraditional,
} from '../types';
import {
  calculateTotalFederalTax,
  calculateStateTax,
  getStandardDeduction,
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
 * Perform Roth conversion based on strategy
 * Automatically converts up to the minimum of:
 * - Target tax bracket ceiling
 * - Next IRMAA threshold
 */
function performRothConversion(
  accountStates: AccountState[],
  assumptions: Assumptions,
  profile: Profile,
  currentOrdinaryIncome: number,
  socialSecurityIncome: number,
  targetSpending: number,
  age: number,
  yearsIntoRetirement: number,
  countryConfig?: CountryConfig
): RothConversionResult {
  const result: RothConversionResult = {
    conversionAmount: 0,
    taxOnConversion: 0,
    fromAccountId: null,
    toAccountId: null,
  };

  // Check if conversions are enabled
  const strategy = assumptions.rothConversionStrategy ?? 'off';
  if (strategy === 'off') return result;

  const targetRate = assumptions.rothConversionTargetRate ?? 0.22;
  const inflationRate = assumptions.inflationRate ?? 0.03;
  const filingStatus = profile.filingStatus || 'single';

  // Check current marginal rate
  const currentMarginalRate = getMarginalTaxRate(currentOrdinaryIncome, filingStatus);
  
  // Don't convert if we're already at or above target rate
  if (currentMarginalRate >= targetRate) {
    result.reason = `Already at ${(currentMarginalRate * 100).toFixed(0)}% bracket`;
    return result;
  }

  // Get account groups
  const isTraditionalAccount = (type: string) =>
    countryConfig ? countryConfig.isTraditionalAccount(type) : isTraditional(type);
  const traditionalAccounts = accountStates
    .filter(acc => isTraditionalAccount(acc.type) && acc.balance > 0)
    .sort((a, b) => b.balance - a.balance); // Largest first
  const rothAccounts = accountStates
    .filter(acc => getTaxTreatment(acc.type) === 'roth' && acc.balance >= 0)
    .sort((a, b) => b.balance - a.balance); // Largest first

  if (traditionalAccounts.length === 0) {
    result.reason = 'No traditional accounts';
    return result;
  }

  // Calculate room in target bracket
  const roomInBracket = getWithdrawalToFillBracket(
    currentOrdinaryIncome,
    targetRate,
    filingStatus
  );

  // Calculate room to next IRMAA threshold (for current year's MAGI)
  // MAGI ≈ ordinary income for retirement purposes (simplified)
  const roomToIRMAA = getRoomToNextIRMAAThreshold(currentOrdinaryIncome, filingStatus);
  const irmaaProximity = getIRMAAProximity(currentOrdinaryIncome, age, filingStatus);

  // Determine constraint: minimum of bracket room and IRMAA room
  let maxConversion = roomInBracket;
  let limitingFactor = 'bracket';

  if (irmaaProximity && roomToIRMAA < roomInBracket) {
    maxConversion = roomToIRMAA;
    limitingFactor = 'IRMAA';
  }

  if (maxConversion <= 0) {
    result.reason = `At ${limitingFactor} limit`;
    result.irmaaThresholdDistance = irmaaProximity?.distanceToNext ?? undefined;
    return result;
  }

  // Check if we can afford the tax on conversion and still meet living expenses
  // Estimate tax on conversion
  const marginalRateOnConversion = getMarginalTaxRate(
    currentOrdinaryIncome + maxConversion,
    filingStatus
  );
  const estimatedTax = maxConversion * marginalRateOnConversion;
  
  // Verify we have sufficient portfolio balance to cover conversion tax plus living expenses
  const totalPortfolioBalance = accountStates.reduce((sum, acc) => sum + acc.balance, 0);
  const cashNeededThisYear = targetSpending + estimatedTax - socialSecurityIncome;
  
  // Only convert if we have enough assets (at least 5 years of expenses as safety margin)
  if (totalPortfolioBalance < cashNeededThisYear * 5) {
    result.reason = 'Insufficient assets for safety margin';
    return result;
  }

  // Perform conversion from largest traditional to largest Roth (or create implicit Roth)
  const fromAccount = traditionalAccounts[0];
  const actualConversion = Math.min(maxConversion, fromAccount.balance);
  
  if (actualConversion <= 0) {
    result.reason = 'No balance to convert';
    return result;
  }

  // Reduce traditional account
  fromAccount.balance -= actualConversion;

  // Add to Roth account (if exists, add to largest; otherwise it's a conversion that increases future Roth balance)
  let toAccount = rothAccounts.length > 0 ? rothAccounts[0] : null;
  if (toAccount) {
    toAccount.balance += actualConversion;
  }

  result.conversionAmount = actualConversion;
  result.taxOnConversion = estimatedTax;
  result.fromAccountId = fromAccount.id;
  result.toAccountId = toAccount?.id || null;
  result.irmaaThresholdDistance = irmaaProximity?.distanceToNext ?? undefined;
  
  // Set reason for conversion
  if (limitingFactor === 'IRMAA') {
    const nextSurcharge = irmaaProximity?.nextSurchargeAnnual || 0;
    result.reason = `Fill to ${(targetRate * 100).toFixed(0)}% (IRMAA limit: +$${Math.round(nextSurcharge)}/yr)`;
  } else {
    result.reason = `Fill to ${(targetRate * 100).toFixed(0)}% bracket`;
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

    // Perform Roth conversion before regular withdrawals
    const rothConversion = performRothConversion(
      accountStates,
      assumptions,
      profile,
      socialSecurityIncome * 0.85, // Start with SS as base income
      socialSecurityIncome,
      targetSpending,
      age,
      i, // years into retirement for inflation adjustment
      countryConfig
    );

    // Tax-optimized withdrawal strategy
    const withdrawals = performTaxOptimizedWithdrawal(
      accountStates,
      targetSpending,
      rmdAmount,
      socialSecurityIncome,
      profile,
      accountDepletionAges,
      age,
      countryConfig
    );

    // Apply investment returns to remaining balances
    accountStates.forEach(acc => {
      acc.balance *= (1 + assumptions.retirementReturnRate);
    });

    // Calculate taxes using country-specific logic
    // Include Roth conversion in ordinary income (it's taxable when converted)
    const ordinaryIncome = withdrawals.traditionalWithdrawal + socialSecurityIncome * 0.85 + rothConversion.conversionAmount; // 85% of SS/CPP taxable
    const capitalGains = withdrawals.taxableGains;

    let federalTax: number;
    let stateTax: number;

    if (countryConfig) {
      // Use country-specific tax calculations
      federalTax = countryConfig.calculateFederalTax(ordinaryIncome, profile.filingStatus);
      // Add capital gains tax (country handles inclusion rates)
      federalTax += countryConfig.calculateCapitalGainsTax(
        capitalGains,
        ordinaryIncome,
        profile.region || '',
        profile.filingStatus
      );
      // Calculate regional (state/provincial) tax
      stateTax = countryConfig.calculateRegionalTax(
        ordinaryIncome + capitalGains,
        profile.region || ''
      );
      // For US, regional tax is still calculated using flat rate from profile
      // (the US config returns 0 from calculateRegionalTax)
      if (countryConfig.code === 'US') {
        stateTax = calculateStateTax(
          ordinaryIncome + capitalGains - getStandardDeduction(profile.filingStatus || 'single'),
          profile.stateTaxRate || 0
        );
      }
    } else {
      // Fallback to US logic
      federalTax = calculateTotalFederalTax(
        ordinaryIncome,
        capitalGains,
        profile.filingStatus || 'single'
      );
      stateTax = calculateStateTax(
        ordinaryIncome + capitalGains - getStandardDeduction(profile.filingStatus || 'single'),
        profile.stateTaxRate || 0
      );
    }
    const totalTax = federalTax + stateTax;
    lifetimeTaxesPaid += totalTax;

    // Add Roth conversion amounts to withdrawal tracking for display
    // (conversion withdraws from traditional and deposits into Roth)
    const withdrawalsByAccount = { ...withdrawals.byAccount };
    if (rothConversion.conversionAmount > 0) {
      if (rothConversion.fromAccountId) {
        withdrawalsByAccount[rothConversion.fromAccountId] = 
          (withdrawalsByAccount[rothConversion.fromAccountId] || 0) + rothConversion.conversionAmount;
      }
      // Note: We don't subtract from toAccount because that would show as negative withdrawal
      // The conversion is already reflected in account balances
    }

    // Total withdrawals shown to the user should include Roth conversions
    const grossWithdrawal = withdrawals.total + rothConversion.conversionAmount;
    // Gross income is all taxable income: traditional + taxable + 85% SS + Roth conversions
    // (Roth withdrawals & HSA withdrawals are NOT taxable, so excluded)
    const grossIncome = withdrawals.traditionalWithdrawal + withdrawals.taxableWithdrawal + 
                        socialSecurityIncome * 0.85 + rothConversion.conversionAmount;
    // After-tax income is spendable cash including non-taxable withdrawals
    const afterTaxIncome = withdrawals.total + socialSecurityIncome - totalTax;

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
      totalWithdrawal: grossWithdrawal,
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

  // Step 2: RULE 3 - Fill up to 12% bracket with additional traditional withdrawals
  // (Standard deduction + 12% bracket gives good tax efficiency)
  const filingStatus = profile.filingStatus || 'single';
  const standardDeduction = getStandardDeduction(filingStatus);
  const bracket12Max = filingStatus === 'married_filing_jointly' ? 96950 : 48475;
  const targetOrdinaryIncome = standardDeduction + bracket12Max;
  const currentOrdinaryIncome = result.traditionalWithdrawal + socialSecurityIncome * 0.85;
  const roomIn12Bracket = Math.max(0, targetOrdinaryIncome - currentOrdinaryIncome);

  // Withdraw additional from traditional if we have room and need the money
  const additionalTraditional = Math.min(roomIn12Bracket, remainingNeed);
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
      accountDepletionAges[acc.id] = age;esult.traditionalWithdrawal += withdrawal;
      result.total += withdrawal;
      remainingNeed -= withdrawal;

      if (acc.balance <= 0 && accountDepletionAges[acc.id] === null) {
        accountDepletionAges[acc.id] = age;
      }
    }
  }

  return result;
}
