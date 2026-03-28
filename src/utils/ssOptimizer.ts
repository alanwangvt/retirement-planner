import { Account, Profile, Assumptions, AccumulationResult, SsBenefitOption } from '../types';
import { calculateWithdrawals } from './withdrawals';
import type { CountryConfig } from '../countries';

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
 */
export function runSsOptimizer(
  accounts: Account[],
  profile: Profile,
  assumptions: Assumptions,
  accumulationResult: AccumulationResult,
  countryConfig?: CountryConfig
): SsOptimizerResult {
  const options = profile.ssBenefitOptions ?? [];
  if (options.length === 0) {
    throw new Error('No SS benefit options configured.');
  }

  const results: SsOptimizerOptionResult[] = options.map(option => {
    // Clone profile with this scenario's SS values
    const scenarioProfile: Profile = {
      ...profile,
      socialSecurityStartAge: option.startAge,
      socialSecurityBenefit: option.monthlyBenefit,
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

  const explanation =
    `Starting SS at age ${best.option.startAge} ($${best.option.monthlyBenefit.toLocaleString()}/mo) ` +
    `maximizes lifetime after-tax wealth by ${deltaStr} vs. the next-best option ` +
    `(age ${secondBest.option.startAge}).`;

  return {
    options: results,
    bestOption: best.option,
    explanation,
  };
}
