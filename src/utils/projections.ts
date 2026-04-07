import {
  Account,
  Profile,
  AccumulationResult,
  YearlyAccountBalance,
  is401k,
} from '../types';
import type { CountryConfig } from '../countries';

/**
 * Calculate employer match for accounts that support it (401k, employer RRSP)
 */
function calculateEmployerMatch(account: Account): number {
  const supportsMatch = is401k(account.type) || account.type === 'employer_rrsp';

  if (!supportsMatch || !account.employerMatchPercent || !account.employerMatchLimit) {
    return 0;
  }

  // Match is the lesser of:
  // 1. The match percent times the contribution
  // 2. The match limit
  const matchAmount = account.annualContribution * account.employerMatchPercent;
  return Math.min(matchAmount, account.employerMatchLimit);
}

/**
 * Project account growth during accumulation phase
 */
export function calculateAccumulation(
  accounts: Account[],
  profile: Profile,
  countryConfig: CountryConfig
): AccumulationResult {
  // Primary earner retires at retirementAge — this is when withdrawals start.
  // If the spouse retires later, we extend the chart to the spouse's retirement
  // (showing continued growth) while snapshotting finalBalances at the primary's
  // retirement so the withdrawal simulation starts at the correct point.
  const primaryYearsToRetirement = profile.retirementAge - profile.currentAge;
  const householdYearsToRetirement = profile.spouseRetirementAge !== undefined
    ? Math.max(primaryYearsToRetirement, profile.spouseRetirementAge - profile.currentAge)
    : primaryYearsToRetirement;
  const currentYear = new Date().getFullYear();

  // Initialize balances
  const balances: Record<string, number> = {};
  const contributions: Record<string, number> = {};

  accounts.forEach(account => {
    balances[account.id] = account.balance;
    contributions[account.id] = account.annualContribution;
  });

  const yearlyBalances: YearlyAccountBalance[] = [];

  // Snapshot of balances at primary's retirement — used to seed the withdrawal sim
  let finalBalancesAtPrimaryRetirement: Record<string, number> | null = null;

  // Record initial state (year 0)
  yearlyBalances.push({
    age: profile.currentAge,
    year: currentYear,
    balances: { ...balances },
    totalBalance: Object.values(balances).reduce((sum, b) => sum + b, 0),
    contributions: { ...contributions },
  });

  // Project each year up to the household retirement age (later of the two)
  for (let i = 1; i <= householdYearsToRetirement; i++) {
    const age = profile.currentAge + i;
    const year = currentYear + i;

    accounts.forEach(account => {
      const currentBalance = balances[account.id];
      const currentContribution = contributions[account.id];

      // 1. Apply investment return to existing balance
      const balanceAfterReturn = currentBalance * (1 + account.returnRate);

      // 2. Determine whether this account's owner is still working.
      //    - spouse-owned accounts stop at spouseRetirementAge (if set)
      //    - all others (primary / joint / unset) stop at the primary's retirementAge
      const owner = account.owner ?? 'primary';
      let ownerStillWorking: boolean;
      if (owner === 'spouse' && profile.spouseRetirementAge !== undefined) {
        const spouseYearsToRetirement = profile.spouseRetirementAge - profile.currentAge;
        ownerStillWorking = i <= spouseYearsToRetirement;
      } else {
        ownerStillWorking = i <= primaryYearsToRetirement;
      }

      const employerMatch = ownerStillWorking
        ? calculateEmployerMatch({ ...account, annualContribution: currentContribution })
        : 0;
      const totalContribution = ownerStillWorking ? currentContribution + employerMatch : 0;

      // Update balance
      balances[account.id] = balanceAfterReturn + totalContribution;

      // 3. Grow contribution for next year (only matters while owner is working)
      if (ownerStillWorking) {
        contributions[account.id] = currentContribution * (1 + account.contributionGrowthRate);
      }
    });

    // Snapshot finalBalances when the primary retires
    if (i === primaryYearsToRetirement) {
      finalBalancesAtPrimaryRetirement = { ...balances };
    }

    const totalBalance = Object.values(balances).reduce((sum, b) => sum + b, 0);

    yearlyBalances.push({
      age,
      year,
      balances: { ...balances },
      totalBalance,
      contributions: { ...contributions },
    });
  }

  // Calculate breakdown by country-specific groupings
  const breakdownByGroup: Record<string, number> = {};
  const accountGroupings = countryConfig.getAccountGroupings();

  // Initialize all groups to 0
  accountGroupings.forEach(group => {
    breakdownByGroup[group.id] = 0;
  });

  // Sum up balances for each group — use the primary-retirement snapshot so the
  // composition pie reflects what's available at the start of the withdrawal phase.
  const breakdownSource = finalBalancesAtPrimaryRetirement ?? balances;
  accounts.forEach(account => {
    const accountType = account.type;
    const group = accountGroupings.find(g => g.accountTypes.includes(accountType));
    if (group) {
      breakdownByGroup[group.id] += breakdownSource[account.id];
    }
  });

  // Use the primary-retirement snapshot for the withdrawal simulation.
  // Falls back to the end-of-loop balances when spouse retires first (or at same time).
  const withdrawalStartBalances = finalBalancesAtPrimaryRetirement ?? { ...balances };

  return {
    yearlyBalances,
    finalBalances: withdrawalStartBalances,
    totalAtRetirement: Object.values(withdrawalStartBalances).reduce((sum, b) => sum + b, 0),
    breakdownByGroup,
  };
}

/**
 * Get the balance of an account at a specific age
 */
export function getBalanceAtAge(
  result: AccumulationResult,
  accountId: string,
  age: number
): number {
  const yearData = result.yearlyBalances.find(y => y.age === age);
  if (!yearData) return 0;
  return yearData.balances[accountId] || 0;
}

/**
 * Calculate total contributions made over accumulation phase
 */
export function calculateTotalContributions(
  accounts: Account[],
  profile: Profile
): Record<string, number> {
  const yearsToRetirement = profile.retirementAge - profile.currentAge;
  const totals: Record<string, number> = {};

  accounts.forEach(account => {
    let totalContribution = 0;
    let yearlyContribution = account.annualContribution;

    for (let i = 0; i < yearsToRetirement; i++) {
      const employerMatch = calculateEmployerMatch({
        ...account,
        annualContribution: yearlyContribution,
      });
      totalContribution += yearlyContribution + employerMatch;
      yearlyContribution *= (1 + account.contributionGrowthRate);
    }

    totals[account.id] = totalContribution;
  });

  return totals;
}
