import { Account, Profile, Assumptions, AccumulationResult, SsBenefitOption } from '../types';
import { calculateWithdrawals } from './withdrawals';
import type { CountryConfig } from '../countries';

export type SsOptimizerTarget = 'primary' | 'spouse';

export interface SsOptimizerOptionResult {
  option: SsBenefitOption;
  totalAfterTaxIncome: number;
  terminalBalance: number;
  totalWealth: number; // totalAfterTaxIncome + terminalBalance
  lifetimeTaxesPaid: number;
  portfolioDepletionAge: number | null;
}

export interface SsOptimizerResult {
  options: SsOptimizerOptionResult[]; // sorted best → worst by totalWealth
  bestOption: SsBenefitOption;
  explanation: string;
}

/**
 * Run the full retirement simulation for each SS benefit option and rank by
 * total lifetime after-tax wealth = Σ afterTaxIncome + terminal portfolio balance.
 *
 * @param target - 'primary' sweeps the primary earner's ssBenefitOptions while keeping
 *                 the spouse's SS fixed; 'spouse' does the reverse.
 */
export function runSsOptimizer(
  accounts: Account[],
  profile: Profile,
  assumptions: Assumptions,
  accumulationResult: AccumulationResult,
  countryConfig?: CountryConfig,
  target: SsOptimizerTarget = 'primary'
): SsOptimizerResult {
  const options = target === 'primary'
    ? (profile.ssBenefitOptions ?? [])
    : (profile.spouseSsBenefitOptions ?? []);

  if (options.length === 0) {
    throw new Error(`No SS benefit options configured for ${target}.`);
  }

  const results: SsOptimizerOptionResult[] = options.map(option => {
    // Clone profile with only the swept person's SS values changed;
    // the other person's SS fields remain fixed at whatever is in profile.
    const scenarioProfile: Profile = target === 'primary'
      ? {
          ...profile,
          socialSecurityStartAge: option.startAge,
          socialSecurityBenefit: option.monthlyBenefit,
        }
      : {
          ...profile,
          spouseSocialSecurityStartAge: option.startAge,
          spouseSocialSecurityBenefit: option.monthlyBenefit,
        };

    const result = calculateWithdrawals(
      accounts,
      scenarioProfile,
      assumptions,
      accumulationResult,
      countryConfig
    );

    const totalAfterTaxIncome = result.yearlyWithdrawals.reduce(
      (sum, y) => sum + y.afterTaxIncome,
      0
    );
    const lastYear = result.yearlyWithdrawals[result.yearlyWithdrawals.length - 1];
    const terminalBalance = lastYear?.totalRemainingBalance ?? 0;
    const totalWealth = totalAfterTaxIncome + terminalBalance;

    return {
      option,
      totalAfterTaxIncome,
      terminalBalance,
      totalWealth,
      lifetimeTaxesPaid: result.lifetimeTaxesPaid,
      portfolioDepletionAge: result.portfolioDepletionAge,
    };
  });

  // Sort best → worst
  results.sort((a, b) => b.totalWealth - a.totalWealth);

  const best = results[0];
  const secondBest = results[1];

  const delta = best.totalWealth - secondBest.totalWealth;
  const deltaStr = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.abs(delta));

  const whoLabel = target === 'spouse' ? 'Spouse' : 'Primary';
  const explanation =
    `${whoLabel} — start SS at age ${best.option.startAge} ($${best.option.monthlyBenefit.toLocaleString()}/mo) ` +
    `maximizes lifetime after-tax wealth by ${deltaStr} vs. age ${secondBest.option.startAge}.`;

  return {
    options: results,
    bestOption: best.option,
    explanation,
  };
}
