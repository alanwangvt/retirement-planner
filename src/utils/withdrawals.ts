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
  getSSOrdinaryIncomeMultiplier,
  getStandardDeduction,
  getCapitalGainsBrackets,
  getMarginalTaxRate,
  getTaxBrackets,
  getWithdrawalToFillBracket,
  getRoomToNextIRMAAThreshold,
  getIRMAAProximity,
} from './taxes';
import { getRMDDivisor, RMD_START_AGE } from './constants';
import { MEDICARE_START_AGE } from '../countries/usa/constants';
import type { CountryConfig } from '../countries';

interface AccountState {
  id: string;
  type: Account['type'];
  owner: Account['owner']; // 'primary' | 'spouse' | 'joint' | undefined
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

interface YearProjection {
  age: number;
  rmd: number;
  ssIncome: number;
  ordinaryIncome: number; // rmd + taxable SS portion
}

function estimatePerDollarConversionCost(
  ordinaryIncome: number,
  ssIncome: number,
  age: number,
  filingStatus: FilingStatus,
  irmaaRelevantMAGI: number
): number {
  const ssMultiplier = getSSOrdinaryIncomeMultiplier(ssIncome, ordinaryIncome, filingStatus);
  const marginalRate = getMarginalTaxRate(ordinaryIncome + ssMultiplier, filingStatus);
  let irmaaPerDollarPenalty = 0;

  if (age >= MEDICARE_START_AGE - 2) {
    const proximity = getIRMAAProximity(irmaaRelevantMAGI, age, filingStatus);
    const room = getRoomToNextIRMAAThreshold(irmaaRelevantMAGI, filingStatus);
    if (proximity && room > 0 && Number.isFinite(room)) {
      irmaaPerDollarPenalty = proximity.nextSurchargeAnnual / room;
    }
  }

  return marginalRate * ssMultiplier + irmaaPerDollarPenalty;
}

/**
 * Pass 1: Project RMD-only ordinary income for all remaining years.
 * Balances grow at retirementReturnRate with only mandatory RMDs withdrawn.
 * No conversions or discretionary withdrawals are modelled here.
 * Returns per-year snapshots used to estimate future marginal bracket pressure.
 */
function projectRmdOnlyIncome(
  accountStates: AccountState[],
  profile: Profile,
  assumptions: Assumptions,
  currentAge: number,
  currentSsIncome: number,
  filingStatus: FilingStatus,
  countryConfig?: CountryConfig
): YearProjection[] {
  const remainingYears = profile.lifeExpectancy - currentAge;
  if (remainingYears <= 0) return [];

  const isTraditionalAccountFn = (type: string) =>
    countryConfig ? countryConfig.isTraditionalAccount(type) : isTraditional(type);

  // Snapshot balances — projection must not mutate live accountStates
  const tradBalances = accountStates
    .filter(acc => isTraditionalAccountFn(acc.type))
    .map(acc => ({ type: acc.type, balance: acc.balance }));

  // Pre-compute a per-age SS income helper so that years BEFORE SS starts still
  // show the correct future income in the projection (fixing underestimated peakFutureRate).
  const ssStartAge = profile.socialSecurityStartAge ?? null;
  const ssAnnualAtStart = (profile.socialSecurityBenefit ?? 0) * 12;

  function projectedSsIncome(projAge: number): number {
    if (countryConfig) {
      // Country config: ask it for benefits at the projected age (returns 0 if not yet started)
      const benefits = countryConfig.calculateRetirementBenefits(profile, projAge, 0);
      return benefits.reduce((sum, benefit) => {
        const benefitStartAge = benefit.startAge ?? (currentSsIncome > 0 ? currentAge : (ssStartAge ?? projAge));
        const yearsFromStart = Math.max(0, projAge - benefitStartAge);
        return sum + benefit.annualAmount * Math.pow(1 + assumptions.inflationRate, yearsFromStart);
      }, 0);
    } else {
      if (currentSsIncome > 0) {
        // SS already active — inflate from current year
        return currentSsIncome * Math.pow(1 + assumptions.inflationRate, projAge - currentAge);
      }
      if (ssStartAge !== null && ssAnnualAtStart > 0 && projAge >= ssStartAge) {
        // SS not yet started but will — inflate nominal start amount from ssStartAge
        return ssAnnualAtStart * Math.pow(1 + assumptions.inflationRate, projAge - ssStartAge);
      }
      return 0;
    }
  }

  const projections: YearProjection[] = [];

  for (let y = 0; y < remainingYears; y++) {
    const projAge = currentAge + y;
    const ssIncome = projectedSsIncome(projAge);

    // Compute per-account RMD at this projected age
    let totalRmd = 0;
    const rmdPerAcc: number[] = [];
    for (const acc of tradBalances) {
      let rmd = 0;
      if (countryConfig) {
        rmd = countryConfig.getMinimumWithdrawal(projAge, acc.balance, acc.type);
      } else if (projAge >= RMD_START_AGE) {
        const divisor = getRMDDivisor(projAge);
        if (divisor > 0) rmd = acc.balance / divisor;
      }
      rmdPerAcc.push(rmd);
      totalRmd += rmd;
    }

    const ssTaxable = calculateSSTaxableAmount(ssIncome, totalRmd, filingStatus);
    projections.push({ age: projAge, rmd: totalRmd, ssIncome, ordinaryIncome: totalRmd + ssTaxable });

    // Age each account forward: apply return then subtract its RMD
    for (let i = 0; i < tradBalances.length; i++) {
      tradBalances[i].balance = Math.max(
        0,
        tradBalances[i].balance * (1 + assumptions.retirementReturnRate) - rmdPerAcc[i]
      );
    }
  }

  return projections;
}

/**
 * Pass 2: Determine the optimal Roth conversion target bracket for this year.
 *
 * Hierarchy (fill from bottom up):
 *   1. Standard deduction — always (0% effective tax, guaranteed win)
 *   2. 10% bracket — if peak projected future rate >= 10%
 *   3. 12% bracket — if peak projected future rate >= 12%
 *   4. 22%+ brackets — only if peak future rate justifies it
 *   Never exceeds comfortMaxBracket.
 *
 * Returns the highest bracket rate that is both <= comfortMaxBracket and
 * <= peak projected future marginal rate. 0 means "fill to standard deduction only."
 */
function computeAutoTargetBracket(
  projections: YearProjection[],
  filingStatus: FilingStatus,
  comfortMaxBracket: number
) : { targetRate: number; peakFutureRate: number } {
  let peakFutureRate = 0;
  for (const proj of projections) {
    const rate = getMarginalTaxRate(proj.ordinaryIncome, filingStatus);
    if (rate > peakFutureRate) peakFutureRate = rate;
  }

  const brackets = getTaxBrackets(filingStatus);
  let targetRate = 0;
  for (const bracket of brackets) {
    if (bracket.rate > comfortMaxBracket) break;
    if (bracket.rate <= peakFutureRate) targetRate = bracket.rate;
  }

  return { targetRate, peakFutureRate };
}

/**
 * Perform Roth conversion using two-pass bracket hierarchy (auto strategy).
 *
 * Pass 1 projects future RMD + SS income to find the peak future marginal rate.
 * Pass 2 decides how much to convert this year:
 *   - Always fill at least to the standard deduction (0% effective tax)
 *   - Fill higher brackets only when future rate justifies the current tax cost
 *   - Never exceed comfortMaxBracket (rothConversionTargetRate setting)
 *   - Cross IRMAA tier only if tax savings on the crossing amount exceed the IRMAA surcharge
 */
function performRothConversion(
  accountStates: AccountState[],
  assumptions: Assumptions,
  profile: Profile,
  currentOrdinaryIncome: number,
  estimatedCapitalGains: number,
  socialSecurityIncome: number,
  pensionIncome: number,
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

  const filingStatus = profile.filingStatus || 'single';
  const stdDed = getStandardDeduction(filingStatus);
  const stdDedRoom = Math.max(0, stdDed - currentOrdinaryIncome);
  const comfortMaxBracket = assumptions.rothConversionTargetRate ?? 0.22;

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

  // Pass 1: project future RMD-only income
  const projections = projectRmdOnlyIncome(
    accountStates, profile, assumptions, age,
    socialSecurityIncome, filingStatus, countryConfig
  );

  // Pass 2: determine target bracket from hierarchy
  const { targetRate, peakFutureRate } = computeAutoTargetBracket(
    projections, filingStatus, comfortMaxBracket
  );

  // Compute gross conversion room; floor at standard deduction
  let maxConversion: number;
  let limitingFactor: string;

  if (targetRate > 0) {
    maxConversion = getWithdrawalToFillBracket(currentOrdinaryIncome, targetRate, filingStatus);
    limitingFactor = `${(targetRate * 100).toFixed(0)}% bracket (peak future: ${(peakFutureRate * 100).toFixed(0)}%)`;
  } else {
    maxConversion = stdDedRoom;
    limitingFactor = '0% floor (below standard deduction)';
  }

  // SS taxation can amplify ordinary income by 1.5x/1.85x in the torpedo zone.
  // Adjust conversion room to avoid overshooting the intended bracket target.
  const ssIncomeMultiplier = getSSOrdinaryIncomeMultiplier(
    socialSecurityIncome,
    currentOrdinaryIncome,
    filingStatus
  );
  maxConversion = maxConversion / ssIncomeMultiplier;

  const currentMAGI = currentOrdinaryIncome + estimatedCapitalGains;

  if (strategy === 'dynamic_low_magi' && age >= 70) {
    // Only apply deferral logic in later years (approaching high-MAGI phase at 73)
    // In early retirement, behave like auto strategy and fill the user-specified bracket
    const currentCost = estimatePerDollarConversionCost(
      currentOrdinaryIncome,
      socialSecurityIncome,
      age,
      filingStatus,
      currentMAGI
    );
    const futureCosts = projections
      .filter(p => p.age > age)
      .map(p => estimatePerDollarConversionCost(
        p.ordinaryIncome,
        p.ssIncome,
        p.age,
        filingStatus,
        p.ordinaryIncome
      ))
      .sort((a, b) => a - b);

    if (futureCosts.length > 0) {
      const medianFutureCost = futureCosts[Math.floor(futureCosts.length / 2)];
      const bestFutureCost = futureCosts[0];
      const stdDedFloor = stdDedRoom / Math.max(1, ssIncomeMultiplier);

      // Defer discretionary conversions when projected future years are materially cheaper.
      if (currentCost > bestFutureCost + 0.03) {
        maxConversion = Math.min(maxConversion, stdDedFloor);
        limitingFactor = `Dynamic deferral (current ${(currentCost * 100).toFixed(1)}% > future ${(bestFutureCost * 100).toFixed(1)}%)`;
      } else if (currentCost > medianFutureCost + 0.01) {
        maxConversion = Math.min(maxConversion, stdDedFloor + (maxConversion - stdDedFloor) * 0.4);
        limitingFactor = `Dynamic partial deferral (current ${(currentCost * 100).toFixed(1)}% > median future ${(medianFutureCost * 100).toFixed(1)}%)`;
      }
    }
  }

  // IRMAA check: cross tier only if tax savings on the crossing amount > one-time IRMAA surcharge
  const irmaaProximity = getIRMAAProximity(currentMAGI, age, filingStatus);
  const roomToIRMAA = getRoomToNextIRMAAThreshold(currentMAGI, filingStatus);

  // From age 63 onward, avoid crossing IRMAA tiers.
  // This keeps conversions from pushing MAGI into higher Medicare surcharge bands.
  if (age >= MEDICARE_START_AGE - 2) {
    if (roomToIRMAA < maxConversion) {
      maxConversion = roomToIRMAA;
      limitingFactor = 'IRMAA guardrail (age 63+)';
    }
  } else if (irmaaProximity && roomToIRMAA < maxConversion) {
    const amountAboveThreshold = maxConversion - roomToIRMAA;
    const rateAtThreshold = getMarginalTaxRate(currentOrdinaryIncome + roomToIRMAA, filingStatus);
    const taxSavings = amountAboveThreshold * Math.max(0, peakFutureRate - rateAtThreshold);
    const irmaaCost = irmaaProximity.nextSurchargeAnnual;

    if (taxSavings <= irmaaCost) {
      maxConversion = roomToIRMAA;
      limitingFactor = `IRMAA (savings $${Math.round(taxSavings)} ≤ cost $${Math.round(irmaaCost)}/yr)`;
    } else {
      limitingFactor += ` [IRMAA crossed: savings $${Math.round(taxSavings)} > $${Math.round(irmaaCost)}/yr]`;
    }
  }

  if (maxConversion <= 0) {
    result.reason = `At limit: ${limitingFactor}`;
    result.irmaaThresholdDistance = irmaaProximity?.distanceToNext ?? undefined;
    return result;
  }

  // Safety margin: require at least 5× annual cash need in portfolio
  const effectiveOrdinaryIncomeAfterConversion =
    currentOrdinaryIncome + maxConversion * ssIncomeMultiplier;
  const marginalRateOnConversion = getMarginalTaxRate(effectiveOrdinaryIncomeAfterConversion, filingStatus);
  const estimatedTax = maxConversion * marginalRateOnConversion;
  const totalPortfolioBalance = accountStates.reduce((sum, acc) => sum + acc.balance, 0);
  const cashNeededThisYear = targetSpending + estimatedTax - socialSecurityIncome - pensionIncome;
  if (totalPortfolioBalance < cashNeededThisYear * 5) {
    result.reason = 'Insufficient assets for safety margin';
    return result;
  }

  // Execute: largest traditional → largest Roth
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
  result.reason = `Fill to ${limitingFactor}`;

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
  let accountStates: AccountState[] = accounts.map(account => ({
    id: account.id,
    type: account.type,
    owner: account.owner,
    balance: accumulationResult.finalBalances[account.id] || 0,
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
        governmentBenefits = benefits.reduce((sum, benefit) => {
          const benefitStartAge = benefit.startAge ?? profile.socialSecurityStartAge ?? age;
          const yearsFromStartAge = Math.max(0, age - benefitStartAge);
          return sum + benefit.annualAmount * Math.pow(1 + assumptions.inflationRate, yearsFromStartAge);
        }, 0);
      }
    } else {
      // Fallback to US Social Security — primary earner
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

      // Spouse SS income — only for married filing jointly when spouse fields are set
      if (
        profile.filingStatus === 'married_filing_jointly' &&
        profile.spouseCurrentAge !== undefined &&
        profile.spouseSocialSecurityBenefit &&
        profile.spouseSocialSecurityStartAge
      ) {
        const spouseAge = profile.spouseCurrentAge + (age - profile.currentAge);
        if (spouseAge >= profile.spouseSocialSecurityStartAge) {
          const spouseYearsFromStart = spouseAge - profile.spouseSocialSecurityStartAge;
          const spouseAnnualBenefit = profile.spouseSocialSecurityBenefit * 12;
          governmentBenefits += spouseAnnualBenefit *
            Math.pow(1 + assumptions.inflationRate, spouseYearsFromStart);
        }
      }
    }
    const socialSecurityIncome = governmentBenefits; // Keep variable name for compatibility

    // Calculate pension income (defined benefit pensions with COLA adjustment)
    let pensionIncome = 0;
    // Primary pension
    if (
      profile.pensionBenefit &&
      profile.pensionStartAge &&
      age >= profile.pensionStartAge
    ) {
      const yearsFromPensionStart = age - profile.pensionStartAge;
      const annualPensionStart = profile.pensionBenefit * 12; // input is monthly
      const pensioncola = profile.pensionCola ?? 0;
      pensionIncome += annualPensionStart * Math.pow(1 + pensioncola, yearsFromPensionStart);
    }

    // Spouse pension (married filing jointly)
    if (
      profile.filingStatus === 'married_filing_jointly' &&
      profile.spouseCurrentAge !== undefined &&
      profile.spousePensionBenefit &&
      profile.spousePensionStartAge
    ) {
      const spouseAge = profile.spouseCurrentAge + (age - profile.currentAge);
      if (spouseAge >= profile.spousePensionStartAge) {
        const spouseYearsFromPensionStart = spouseAge - profile.spousePensionStartAge;
        const spouseAnnualPensionStart = profile.spousePensionBenefit * 12;
        const spousePensioncola = profile.spousePensionCola ?? 0;
        pensionIncome += spouseAnnualPensionStart * Math.pow(1 + spousePensioncola, spouseYearsFromPensionStart);
      }
    }

    // Calculate minimum required withdrawals (RMD/RRIF) for each traditional account
    // NOTE: Per IRS rules, RMDs are calculated per-account, not on total balance.
    // Each account's RMD is based on that account's prior year-end balance.
    // This is also correct for Canadian RRIF minimums.
    // Use country config for traditional detection if available
    const isTraditionalAccount = (type: string) =>
      countryConfig ? countryConfig.isTraditionalAccount(type) : isTraditional(type);
    const rmdsByAccount: Record<string, number> = {};
    let totalMinimumWithdrawal = 0;
    accountStates
      .filter(acc => isTraditionalAccount(acc.type))
      .forEach(acc => {
        // Use the account owner's age for RMD calculations.
        // Spouse-owned accounts age at the spouse's rate; all others use the primary's age.
        let ownerAge = age;
        if (
          acc.owner === 'spouse' &&
          profile.spouseCurrentAge !== undefined
        ) {
          ownerAge = profile.spouseCurrentAge + (age - profile.currentAge);
        }
        const minWithdrawal = calculateRMD(ownerAge, acc.balance, acc.type, countryConfig);
        rmdsByAccount[acc.id] = minWithdrawal;
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
    const estimatedFillTarget = assumptions.withdrawalBracketFillTarget ?? 0.12;
    const spendingGapForEstimate = Math.max(0, targetSpending - socialSecurityIncome - pensionIncome - rmdAmount);
    const taxableAvailable = accountStates
      .filter(acc => getTaxTreatment(acc.type) === 'taxable')
      .reduce((sum, acc) => sum + acc.balance, 0);
    const taxableUnrealizedGains = accountStates
      .filter(acc => getTaxTreatment(acc.type) === 'taxable')
      .reduce((sum, acc) => sum + Math.max(0, acc.balance - acc.costBasis), 0);
    const estimatedGainRatio = taxableAvailable > 0
      ? Math.max(0, Math.min(1, taxableUnrealizedGains / taxableAvailable))
      : 0;

    // Pass 1: rough traditional estimate using RMD-only as the SS provisional income base.
    const ssBasisPass1 = calculateSSTaxableAmount(socialSecurityIncome, rmdAmount, filingStatusForConversion);
    const roomInFillForEstimate = getWithdrawalToFillBracket(rmdAmount + ssBasisPass1, estimatedFillTarget, filingStatusForConversion);
    const tradBracket12Fill = Math.min(roomInFillForEstimate, spendingGapForEstimate);
    const tradFallback = Math.max(0, spendingGapForEstimate - tradBracket12Fill - taxableAvailable);

    // Pass 2: recompute SS taxable basis using the full estimated traditional income.
    // Without this, when SS starts (age 70) and RMD = 0, the pass-1 ssBasis = 0 causes the
    // conversion to be oversized, pushing actual MAGI well above the target bracket.
    const estimatedTotalTrad = rmdAmount + tradBracket12Fill + tradFallback;
    const ssBasis = calculateSSTaxableAmount(socialSecurityIncome, estimatedTotalTrad, filingStatusForConversion);
    const estimatedBaseOrdinaryIncome = estimatedTotalTrad + ssBasis + pensionIncome;
    const estimatedTaxableWithdrawal = Math.max(0, Math.min(
      taxableAvailable,
      spendingGapForEstimate - tradBracket12Fill
    ));
    const estimatedCapitalGains = estimatedTaxableWithdrawal * estimatedGainRatio;

    // Perform Roth conversion before regular withdrawals
    const rothConversion = performRothConversion(
      accountStates,
      assumptions,
      profile,
      estimatedBaseOrdinaryIncome, // estimated ordinary income from regular withdrawals + SS
      estimatedCapitalGains,
      socialSecurityIncome,
      pensionIncome,
      targetSpending,
      age,
      i, // years into retirement for inflation adjustment
      countryConfig
    );

    const { accountStates: postWithdrawalStates, outcome } = solveNetSpendingWithdrawals(
      accountStates,
      targetSpending,
      rmdsByAccount,
      socialSecurityIncome,
      pensionIncome,
      profile,
      assumptions,
      accountDepletionAges,
      age,
      rothConversion.conversionAmount,
      countryConfig
    );
    accountStates = postWithdrawalStates;

    const filingStatusFS = profile.filingStatus || 'single';
    const withdrawals = outcome.withdrawals;
    const ordinaryIncome = outcome.ordinaryIncome;
    const magi = outcome.magi;
    const federalTax = outcome.federalTax;
    const stateTax = outcome.stateTax;
    const totalTax = outcome.totalTax;
    lifetimeTaxesPaid += totalTax;
    const afterTaxIncome = outcome.afterTaxIncome;
    const grossIncome = outcome.grossIncome;

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
      pensionIncome,
      grossIncome,
      magi,
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
      effectiveMarginalRate: getMarginalTaxRate(ordinaryIncome, filingStatusFS),
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

interface WithdrawalOutcome {
  withdrawals: WithdrawalResult;
  ordinaryIncome: number;
  capitalGains: number;
  magi: number;
  federalTax: number;
  stateTax: number;
  totalTax: number;
  afterTaxIncome: number;
  grossIncome: number;
}

function cloneAccountStates(accountStates: AccountState[]): AccountState[] {
  return accountStates.map(acc => ({ ...acc }));
}

function evaluateWithdrawalOutcome(
  withdrawals: WithdrawalResult,
  socialSecurityIncome: number,
  pensionIncome: number,
  rothConversionAmount: number,
  profile: Profile
): WithdrawalOutcome {
  const filingStatus = profile.filingStatus || 'single';
  const standardDeduction = getStandardDeduction(filingStatus);
  const ssTaxable = calculateSSTaxableAmount(
    socialSecurityIncome,
    withdrawals.traditionalWithdrawal + rothConversionAmount + pensionIncome,
    filingStatus
  );
  const ordinaryIncome = withdrawals.traditionalWithdrawal + ssTaxable + rothConversionAmount + pensionIncome;
  const capitalGains = withdrawals.taxableGains;
  const magi = ordinaryIncome + capitalGains;
  const federalTax = calculateTotalFederalTax(ordinaryIncome, capitalGains, filingStatus);
  const stateTax = calculateStateTax(
    Math.max(0, ordinaryIncome + capitalGains - standardDeduction),
    profile.stateTaxRate || 0
  );
  const totalTax = federalTax + stateTax;

  return {
    withdrawals,
    ordinaryIncome,
    capitalGains,
    magi,
    federalTax,
    stateTax,
    totalTax,
    afterTaxIncome: withdrawals.total + socialSecurityIncome + pensionIncome - totalTax,
    grossIncome: withdrawals.traditionalWithdrawal + withdrawals.taxableWithdrawal + rothConversionAmount + pensionIncome,
  };
}

function solveNetSpendingWithdrawals(
  accountStates: AccountState[],
  targetSpending: number,
  rmdsByAccount: Record<string, number>,
  socialSecurityIncome: number,
  pensionIncome: number,
  profile: Profile,
  assumptions: Assumptions,
  accountDepletionAges: Record<string, number | null>,
  age: number,
  rothConversionAmount: number,
  countryConfig?: CountryConfig
): { accountStates: AccountState[]; outcome: WithdrawalOutcome } {
  let grossTarget = targetSpending;
  let bestAccountStates = cloneAccountStates(accountStates);
  let bestOutcome = evaluateWithdrawalOutcome(
    performTaxOptimizedWithdrawal(
      bestAccountStates,
      grossTarget,
      rmdsByAccount,
      socialSecurityIncome,
      pensionIncome,
      profile,
      assumptions,
      { ...accountDepletionAges },
      age,
      countryConfig
    ),
    socialSecurityIncome,
    pensionIncome,
    rothConversionAmount,
    profile
  );

  for (let iteration = 0; iteration < 6; iteration++) {
    const shortfall = targetSpending - bestOutcome.afterTaxIncome;
    if (shortfall <= 1) {
      return { accountStates: bestAccountStates, outcome: bestOutcome };
    }

    const nextGrossTarget = grossTarget + shortfall;
    if (nextGrossTarget <= grossTarget + 1) {
      break;
    }

    const trialAccountStates = cloneAccountStates(accountStates);
    const trialOutcome = evaluateWithdrawalOutcome(
      performTaxOptimizedWithdrawal(
        trialAccountStates,
        nextGrossTarget,
        rmdsByAccount,
        socialSecurityIncome,
        pensionIncome,
        profile,
        assumptions,
        { ...accountDepletionAges },
        age,
        countryConfig
      ),
      socialSecurityIncome,
      pensionIncome,
      rothConversionAmount,
      profile
    );

    if (trialOutcome.afterTaxIncome <= bestOutcome.afterTaxIncome + 1) {
      break;
    }

    grossTarget = nextGrossTarget;
    bestAccountStates = trialAccountStates;
    bestOutcome = trialOutcome;
  }

  return { accountStates: bestAccountStates, outcome: bestOutcome };
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
  rmdsByAccount: Record<string, number>,
  socialSecurityIncome: number,
  pensionIncome: number,
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

  // How much do we need after Social Security and Pension?
  let remainingNeed = Math.max(0, targetSpending - socialSecurityIncome - pensionIncome);

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

  // Step 1: Take RMDs from traditional accounts (required, per-account)
  // IRS rules require each account to satisfy its own RMD — you cannot aggregate
  // across accounts (except for IRAs, which can be aggregated, but per-account is
  // always valid and simpler to implement correctly).
  for (const acc of traditionalAccounts) {
    const accountRmd = rmdsByAccount[acc.id] ?? 0;
    if (accountRmd <= 0) continue;
    const withdrawal = Math.min(accountRmd, acc.balance);
    acc.balance -= withdrawal;
    result.byAccount[acc.id] += withdrawal;
    result.traditionalWithdrawal += withdrawal;
    result.total += withdrawal;
    remainingNeed = Math.max(0, remainingNeed - withdrawal);

    if (acc.balance <= 0 && accountDepletionAges[acc.id] === null) {
      accountDepletionAges[acc.id] = age;
    }
  }

  // Detect if this is a high-MAGI year (RMD present)
  // RMD starts at age 73, so only reorder withdrawals when RMD is actually being taken
  const totalRMDs = Object.values(rmdsByAccount).reduce((sum, rmd) => sum + Math.max(0, rmd), 0);
  const hasRMD = totalRMDs > 0;
  const isHighMagiYear = hasRMD;
  const useDynamicLowMagiReordering = assumptions.rothConversionStrategy === 'dynamic_low_magi' && isHighMagiYear;

  const filingStatus = profile.filingStatus || 'single';
  const standardDeduction = getStandardDeduction(filingStatus);
  const fillTarget = assumptions.withdrawalBracketFillTarget ?? 0.12;

  // For dynamic_low_magi strategy in high-MAGI years, prefer Roth/Taxable before filling traditional bracket
  // to minimize SS torpedo effect and IRMAA exposure
  if (useDynamicLowMagiReordering) {
    // Step 2a (dynamic): Use Roth before filling traditional bracket
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

    // Step 2b (dynamic): Use taxable accounts (gains portion has lower MAGI impact)
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

    // Step 2c (dynamic): Fill bracket with traditional (less aggressive now that Roth/Taxable used)
    {
      const ssTaxableStep2 = calculateSSTaxableAmount(socialSecurityIncome, result.traditionalWithdrawal, filingStatus);
      const incomeAfterRMDs = result.traditionalWithdrawal + ssTaxableStep2;
      const roomInFillBracket = getWithdrawalToFillBracket(incomeAfterRMDs, fillTarget, filingStatus);

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

    // Step 2d (dynamic): Deplete remaining traditional accounts beyond bracket
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

    // Step 2e (dynamic): Use HSA last (triple tax-free, stealth Roth)
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
  } else {
    // Standard order for non-dynamic or low-MAGI years
    // Step 2: RULE 3 - Fill up to target bracket with additional traditional withdrawals.
    // Always runs regardless of taxableFirstSpendingAge — filling the low bracket now (0-12%)
    // prevents larger forced RMDs later at higher rates. Taxable accounts cover remaining
    // spending above the bracket fill in Step 3.
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
  }

  return result;
}
