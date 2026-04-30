/**
 * Retirement Calculator Math Tests
 *
 * This file tests all the core financial calculations to ensure accuracy.
 * Run with: npx tsx src/tests/calculations.test.ts
 */

import { calculateAccumulation } from '../utils/projections';
import { calculateWithdrawals } from '../utils/withdrawals';
import {
  calculateFederalIncomeTax,
  calculateTotalFederalTax,
  calculateStateTax,
  calculateCapitalGainsTax,
  getStandardDeduction,
} from '../utils/taxes';
import { getRMDDivisor } from '../utils/constants';
import { Account, Profile, Assumptions } from '../types';
import { getCountryConfig } from '../countries';

// Get US config for tests
const usConfig = getCountryConfig('US');

// Test utilities
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ ${message}`);
    failedTests++;
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  ✓ ${message} (got ${actual.toFixed(2)}, expected ${expected.toFixed(2)})`);
    passedTests++;
  } else {
    console.error(`  ✗ ${message} (got ${actual.toFixed(2)}, expected ${expected.toFixed(2)}, diff: ${diff.toFixed(2)})`);
    failedTests++;
  }
}

function section(name: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${name}`);
  console.log('='.repeat(60));
}

// =============================================================================
// TAX CALCULATION TESTS
// =============================================================================

function testTaxCalculations(): void {
  section('TAX CALCULATIONS');

  console.log('\n--- Federal Income Tax (Married Filing Jointly) ---');

  // Standard deduction is $31,500 for MFJ in 2025
  // So taxable income = gross - 31500

  // Test 1: Income fully covered by standard deduction
  const tax1 = calculateFederalIncomeTax(0, 'married_filing_jointly');
  assertApprox(tax1, 0, 0.01, 'Zero taxable income = $0 tax');

  // Test 2: Income in 10% bracket only
  // 10% bracket: $0 - $23,850
  // Tax on $20,000 = $20,000 * 0.10 = $2,000
  const tax2 = calculateFederalIncomeTax(20000, 'married_filing_jointly');
  assertApprox(tax2, 2000, 0.01, '$20k taxable income = $2,000 tax (10% bracket)');

  // Test 3: Income spanning 10% and 12% brackets
  // 10% on first $23,850 = $2,385
  // 12% on next $26,150 = $3,138
  // Total = $5,523
  const tax3 = calculateFederalIncomeTax(50000, 'married_filing_jointly');
  assertApprox(tax3, 5523, 0.01, '$50k taxable income = $5,523 tax (10% + 12% brackets)');

  // Test 4: Income in 22% bracket
  // 10% on $23,850 = $2,385
  // 12% on $73,100 ($96,950 - $23,850) = $8,772
  // 22% on $3,050 ($100,000 - $96,950) = $671
  // Total = $11,828
  const tax4 = calculateFederalIncomeTax(100000, 'married_filing_jointly');
  assertApprox(tax4, 11828, 0.01, '$100k taxable income = $11,828 tax');

  console.log('\n--- Federal Income Tax (Single) ---');

  // Single 10% bracket: $0 - $11,925
  // Single 12% bracket: $11,925 - $48,475
  const tax5 = calculateFederalIncomeTax(30000, 'single');
  // 10% on $11,925 = $1,192.50
  // 12% on $18,075 = $2,169.00
  // Total = $3,361.50
  assertApprox(tax5, 3361.5, 0.01, '$30k taxable income (single) = $3,361.50 tax');

  console.log('\n--- Standard Deduction ---');

  const stdMFJ = getStandardDeduction('married_filing_jointly');
  assertApprox(stdMFJ, 31500, 0.01, 'MFJ standard deduction = $31,500');

  const stdSingle = getStandardDeduction('single');
  assertApprox(stdSingle, 15750, 0.01, 'Single standard deduction = $15,750');

  console.log('\n--- State Tax ---');
  const stateTax1 = calculateStateTax(50000, 0.05);
  assertApprox(stateTax1, 2500, 0.01, '$50k at 5% state tax = $2,500');

  const stateTax2 = calculateStateTax(-1000, 0.05);
  assertApprox(stateTax2, 0, 0.01, 'Negative taxable income = $0 state tax');

  console.log('\n--- Capital Gains Tax (MFJ) ---');

  // 0% up to $96,700
  // 15% from $96,700 to $600,050
  const cgTax1 = calculateCapitalGainsTax(50000, 0, 'married_filing_jointly');
  assertApprox(cgTax1, 0, 0.01, '$50k capital gains with $0 other income = $0 (0% bracket)');

  const cgTax2 = calculateCapitalGainsTax(50000, 100000, 'married_filing_jointly');
  // With $100k ordinary income, taxable = $68,500 after standard deduction
  // Room in 0% bracket ($96,700): $28,200 of gains at 0%
  // Remaining $21,800 at 15% = $3,270.00
  assertApprox(cgTax2, 3270, 0.01, '$50k cap gains with $100k income (partial 0% bracket)');
}

// =============================================================================
// RMD TESTS
// =============================================================================

function testRMDCalculations(): void {
  section('RMD CALCULATIONS');

  assert(usConfig.isTraditionalAccount('pension'), 'Pension is recognized as traditional in US config');

  // RMD starts at age 73
  const divisor72 = getRMDDivisor(72);
  assertApprox(divisor72, 0, 0.01, 'No RMD at age 72 (divisor = 0)');

  const divisor73 = getRMDDivisor(73);
  assertApprox(divisor73, 26.5, 0.01, 'RMD divisor at age 73 = 26.5');

  const divisor80 = getRMDDivisor(80);
  assertApprox(divisor80, 20.2, 0.01, 'RMD divisor at age 80 = 20.2');

  const divisor90 = getRMDDivisor(90);
  assertApprox(divisor90, 12.2, 0.01, 'RMD divisor at age 90 = 12.2');

  // Test RMD calculation
  const balance = 1000000;
  const rmd73 = balance / 26.5;
  assertApprox(rmd73, 37735.85, 0.01, '$1M balance at 73 → RMD = $37,735.85');
}

// =============================================================================
// ACCUMULATION PHASE TESTS
// =============================================================================

function testAccumulationPhase(): void {
  section('ACCUMULATION PHASE');

  console.log('\n--- Simple Growth Test ---');

  // Single account, no contributions, just growth
  const account1: Account = {
    id: 'test1',
    name: 'Test 401k',
    type: 'traditional_401k_403b',
    balance: 100000,
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0.07,
  };

  const profile1: Profile = {
    currentAge: 30,
    retirementAge: 31, // 1 year
    lifeExpectancy: 90,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const result1 = calculateAccumulation([account1], profile1, usConfig);

  // After 1 year at 7%: $100,000 * 1.07 = $107,000
  assertApprox(result1.totalAtRetirement, 107000, 0.01, '$100k at 7% for 1 year = $107,000');

  console.log('\n--- Compound Growth Test (10 years) ---');

  const profile2: Profile = {
    ...profile1,
    retirementAge: 40, // 10 years
  };

  const result2 = calculateAccumulation([account1], profile2, usConfig);

  // After 10 years at 7%: $100,000 * (1.07)^10 = $196,715.14
  const expected10yr = 100000 * Math.pow(1.07, 10);
  assertApprox(result2.totalAtRetirement, expected10yr, 0.01, '$100k at 7% for 10 years = $196,715');

  console.log('\n--- Growth with Contributions ---');

  const account2: Account = {
    ...account1,
    annualContribution: 10000,
    contributionGrowthRate: 0,
  };

  const profile3: Profile = {
    ...profile1,
    retirementAge: 31, // 1 year
  };

  const result3 = calculateAccumulation([account2], profile3, usConfig);

  // Year 1: $100,000 * 1.07 + $10,000 = $117,000
  assertApprox(result3.totalAtRetirement, 117000, 0.01, '$100k + $10k contribution at 7% = $117,000');

  console.log('\n--- Employer Match Test ---');

  const account3: Account = {
    ...account2,
    employerMatchPercent: 0.5, // 50% match
    employerMatchLimit: 3000, // Up to $3000
  };

  const result4 = calculateAccumulation([account3], profile3, usConfig);

  // Match = min($10,000 * 0.5, $3000) = $3,000
  // Year 1: $100,000 * 1.07 + $10,000 + $3,000 = $120,000
  assertApprox(result4.totalAtRetirement, 120000, 0.01, 'With 50% match up to $3k = $120,000');

  console.log('\n--- Contribution Growth Test ---');

  const account4: Account = {
    id: 'test4',
    name: 'Test',
    type: 'traditional_401k_403b',
    balance: 0, // Start with $0
    annualContribution: 10000,
    contributionGrowthRate: 0.03, // 3% growth
    returnRate: 0.07,
  };

  const profile4: Profile = {
    ...profile1,
    currentAge: 30,
    retirementAge: 32, // 2 years
  };

  const result5 = calculateAccumulation([account4], profile4, usConfig);

  // Year 1: $0 * 1.07 + $10,000 = $10,000
  // Year 2: $10,000 * 1.07 + $10,300 = $21,000
  assertApprox(result5.totalAtRetirement, 21000, 1, '2 years of contributions with growth');

  console.log('\n--- Tax Treatment Breakdown ---');

  const accounts: Account[] = [
    {
      id: 'trad',
      name: 'Traditional',
      type: 'traditional_401k_403b',
      balance: 100000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
    {
      id: 'roth',
      name: 'Roth',
      type: 'roth_ira',
      balance: 50000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
  ];

  const result6 = calculateAccumulation(accounts, profile3, usConfig);

  assertApprox(result6.breakdownByGroup.traditional, 100000, 0.01, 'Traditional = $100,000');
  assertApprox(result6.breakdownByGroup.roth, 50000, 0.01, 'Roth = $50,000');
  assertApprox(result6.totalAtRetirement, 150000, 0.01, 'Total = $150,000');
}

// =============================================================================
// WITHDRAWAL PHASE TESTS
// =============================================================================

function testWithdrawalPhase(): void {
  section('WITHDRAWAL PHASE');

  console.log('\n--- Basic Withdrawal Test ---');

  const account: Account = {
    id: 'test',
    name: 'Traditional 401k',
    type: 'traditional_401k_403b',
    balance: 1000000,
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0,
  };

  const profile: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 66, // Just 1 year of retirement
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const assumptions: Assumptions = {
    inflationRate: 0,
    safeWithdrawalRate: 0.04,
    retirementReturnRate: 0,
  };

  const accumulation = calculateAccumulation([account], profile, usConfig);
  const result = calculateWithdrawals([account], profile, assumptions, accumulation, usConfig);

  // 4% of $1M = $40,000 annual withdrawal
  assertApprox(result.sustainableAnnualWithdrawal, 40000, 0.01, '4% SWR on $1M = $40,000/year');
  assertApprox(result.sustainableMonthlyWithdrawal, 40000 / 12, 0.01, 'Monthly = $3,333.33');

  console.log('\n--- Withdrawal Order Test (Pre-RMD) ---');

  // Before age 73, should fill tax brackets with traditional, then use Roth
  const accounts: Account[] = [
    {
      id: 'trad',
      name: 'Traditional',
      type: 'traditional_401k_403b',
      balance: 500000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
    {
      id: 'roth',
      name: 'Roth',
      type: 'roth_ira',
      balance: 500000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
  ];

  const profile2: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 66,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const accumulation2 = calculateAccumulation(accounts, profile2, usConfig);
  const result2 = calculateWithdrawals(accounts, profile2, assumptions, accumulation2, usConfig);

  assert(result2.yearlyWithdrawals.length > 0, 'Has withdrawal data');

  const firstYear = result2.yearlyWithdrawals[0];
  assert(firstYear.totalWithdrawal > 0, 'Has withdrawals in first year');

  console.log('\n--- Social Security Integration ---');

  const profileSS: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 68,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
    socialSecurityBenefit: 2500,
    socialSecurityStartAge: 67,
  };

  const assumptionsSS: Assumptions = {
    inflationRate: 0, // No inflation for simpler testing
    safeWithdrawalRate: 0.04,
    retirementReturnRate: 0,
  };

  const accumulationSS = calculateAccumulation([account], profileSS, usConfig);
  const resultSS = calculateWithdrawals([account], profileSS, assumptionsSS, accumulationSS, usConfig);

  // At age 65-66: No SS, full withdrawal needed
  // At age 67: SS kicks in, withdrawal should decrease
  const age65 = resultSS.yearlyWithdrawals.find(y => y.age === 65);
  const age67 = resultSS.yearlyWithdrawals.find(y => y.age === 67);

  assert(age65 !== undefined, 'Has data for age 65');
  assert(age67 !== undefined, 'Has data for age 67');

  if (age65 && age67) {
    assertApprox(age65.socialSecurityIncome, 0, 0.01, 'No SS income at age 65');
    assertApprox(age67.socialSecurityIncome, 30000, 0.01, 'SS income at age 67 = $30,000');

    // Total withdrawal should decrease when SS starts
    assert(
      age67.totalWithdrawal < age65.totalWithdrawal,
      `Withdrawal decreases when SS starts ($${age67.totalWithdrawal.toFixed(0)} < $${age65.totalWithdrawal.toFixed(0)})`
    );

    // Spendable income should stay near the target even though gross income drops.
    const incomeDiff = Math.abs(age67.afterTaxIncome - age65.afterTaxIncome);
    assert(
      incomeDiff < 1000,
      `Spendable income stays roughly constant ($${age65.afterTaxIncome.toFixed(0)} vs $${age67.afterTaxIncome.toFixed(0)})`
    );
  }

  console.log('\n--- Spouse Social Security Integration ---');

  const spouseProfileSS: Profile = {
    currentAge: 65,
    spouseCurrentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 68,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
    socialSecurityBenefit: 2500,
    socialSecurityStartAge: 67,
    spouseSocialSecurityBenefit: 2000,
    spouseSocialSecurityStartAge: 65,
  };

  const spouseAccumulationSS = calculateAccumulation([account], spouseProfileSS, usConfig);
  const spouseResultSS = calculateWithdrawals([account], spouseProfileSS, assumptionsSS, spouseAccumulationSS, usConfig);

  const spouseAge65 = spouseResultSS.yearlyWithdrawals.find(y => y.age === 65);
  const spouseAge67 = spouseResultSS.yearlyWithdrawals.find(y => y.age === 67);

  assert(spouseAge65 !== undefined, 'Has spouse data for age 65');
  assert(spouseAge67 !== undefined, 'Has spouse data for age 67');

  if (spouseAge65 && spouseAge67) {
    assertApprox(spouseAge65.socialSecurityIncome, 24000, 0.01, 'Spouse SS is included at age 65');
    assertApprox(spouseAge67.socialSecurityIncome, 54000, 0.01, 'Primary and spouse SS are both included at age 67');
  }

  console.log('\n--- Pension Integration ---');

  const pensionProfile: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 69,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
    pensionBenefit: 3000,
    pensionStartAge: 67,
    pensionCola: 0.03,
  };

  const pensionAccumulation = calculateAccumulation([account], pensionProfile, usConfig);
  const pensionResult = calculateWithdrawals([account], pensionProfile, assumptionsSS, pensionAccumulation, usConfig);

  const pensionAge65 = pensionResult.yearlyWithdrawals.find(y => y.age === 65);
  const pensionAge67 = pensionResult.yearlyWithdrawals.find(y => y.age === 67);
  const pensionAge68 = pensionResult.yearlyWithdrawals.find(y => y.age === 68);

  assert(pensionAge65 !== undefined, 'Has pension data for age 65');
  assert(pensionAge67 !== undefined, 'Has pension data for age 67');
  assert(pensionAge68 !== undefined, 'Has pension data for age 68');

  if (pensionAge65 && pensionAge67 && pensionAge68) {
    assertApprox(pensionAge65.pensionIncome, 0, 0.01, 'No pension income before pension start age');
    assertApprox(pensionAge67.pensionIncome, 36000, 0.01, 'Pension starts at age 67 ($3,000/month)');
    assertApprox(pensionAge68.pensionIncome, 36000 * 1.03, 0.1, 'Pension COLA grows income after start age');
    assert(
      pensionAge67.totalWithdrawal < pensionAge65.totalWithdrawal,
      `Portfolio withdrawals drop when pension starts ($${pensionAge67.totalWithdrawal.toFixed(0)} < $${pensionAge65.totalWithdrawal.toFixed(0)})`
    );
  }

  console.log('\n--- Spouse Pension Integration ---');

  const spousePensionProfile: Profile = {
    currentAge: 65,
    spouseCurrentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 68,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
    pensionBenefit: 2500,
    pensionStartAge: 67,
    spousePensionBenefit: 1000,
    spousePensionStartAge: 65,
  };

  const spousePensionAccumulation = calculateAccumulation([account], spousePensionProfile, usConfig);
  const spousePensionResult = calculateWithdrawals([account], spousePensionProfile, assumptionsSS, spousePensionAccumulation, usConfig);

  const spousePensionAge65 = spousePensionResult.yearlyWithdrawals.find(y => y.age === 65);
  const spousePensionAge67 = spousePensionResult.yearlyWithdrawals.find(y => y.age === 67);

  assert(spousePensionAge65 !== undefined, 'Has spouse pension data for age 65');
  assert(spousePensionAge67 !== undefined, 'Has spouse pension data for age 67');

  if (spousePensionAge65 && spousePensionAge67) {
    assertApprox(spousePensionAge65.pensionIncome, 12000, 0.01, 'Spouse pension included at age 65');
    assertApprox(spousePensionAge67.pensionIncome, 42000, 0.01, 'Primary + spouse pension included at age 67');
  }

  console.log('\n--- RMD Enforcement Test ---');

  const profileRMD: Profile = {
    currentAge: 72,
    retirementAge: 72,
    lifeExpectancy: 75,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const assumptionsRMD: Assumptions = {
    inflationRate: 0,
    safeWithdrawalRate: 0.01, // Very low SWR to test RMD floor
    retirementReturnRate: 0,
  };

  const accumulationRMD = calculateAccumulation([account], profileRMD, usConfig);
  const resultRMD = calculateWithdrawals([account], profileRMD, assumptionsRMD, accumulationRMD, usConfig);

  const age73 = resultRMD.yearlyWithdrawals.find(y => y.age === 73);

  if (age73) {
    // RMD at 73 = $1M / 26.5 = $37,735.85
    // 1% SWR = $10,000, but RMD forces higher
    assert(
      age73.rmdAmount > 30000,
      `RMD at 73 is enforced ($${age73.rmdAmount.toFixed(0)})`
    );
    assert(
      age73.totalWithdrawal >= age73.rmdAmount,
      `Total withdrawal >= RMD ($${age73.totalWithdrawal.toFixed(0)} >= $${age73.rmdAmount.toFixed(0)})`
    );
  }
}

// =============================================================================
// INCOME CONTINUITY TEST (FOR THE BUG)
// =============================================================================

function testIncomeContinuity(): void {
  section('INCOME CONTINUITY TEST (BUG INVESTIGATION)');

  console.log('\n--- Testing income around SS start and RMD start ---');

  const account: Account = {
    id: 'test',
    name: 'Traditional 401k',
    type: 'traditional_401k_403b',
    balance: 2000000,
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0,
  };

  const profile: Profile = {
    currentAge: 35,
    retirementAge: 65,
    lifeExpectancy: 90,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
    socialSecurityBenefit: 2500,
    socialSecurityStartAge: 67,
  };

  const assumptions: Assumptions = {
    inflationRate: 0.03,
    safeWithdrawalRate: 0.04,
    retirementReturnRate: 0.05,
  };

  const mockAccumulation = {
    yearlyBalances: [],
    finalBalances: { test: 2000000 },
    totalAtRetirement: 2000000,
    breakdownByTaxTreatment: { pretax: 2000000, roth: 0, taxable: 0, hsa: 0 },
  };

  const result = calculateWithdrawals([account], profile, assumptions, mockAccumulation);

  console.log('\n  Year-by-year income analysis (ages 65-75):');
  console.log('  Age | Target   | SS       | Withdrawal | Gross    | Taxes    | After-Tax');
  console.log('  ' + '-'.repeat(75));

  let previousAfterTax = 0;
  let anomalyDetected = false;

  for (const year of result.yearlyWithdrawals) {
    if (year.age >= 65 && year.age <= 75) {
      const row = [
        year.age.toString().padStart(3),
        `$${(year.targetSpending / 1000).toFixed(1)}k`.padStart(8),
        `$${(year.socialSecurityIncome / 1000).toFixed(1)}k`.padStart(8),
        `$${(year.totalWithdrawal / 1000).toFixed(1)}k`.padStart(10),
        `$${(year.grossIncome / 1000).toFixed(1)}k`.padStart(8),
        `$${(year.totalTax / 1000).toFixed(1)}k`.padStart(8),
        `$${(year.afterTaxIncome / 1000).toFixed(1)}k`.padStart(8),
      ].join(' | ');
      console.log(`  ${row}`);

      if (previousAfterTax > 0) {
        const drop = (previousAfterTax - year.afterTaxIncome) / previousAfterTax;
        if (drop > 0.1) {
          anomalyDetected = true;
          console.log(`  ⚠️  ANOMALY: After-tax income at age ${year.age} dropped unexpectedly!`);
        }
      }

      previousAfterTax = year.afterTaxIncome;
    }
  }

  console.log('\n--- Social Security Inflation Analysis ---');

  const ssAt67YearsFromNow = 67 - profile.currentAge;
  const ssAt67Inflated = (profile.socialSecurityBenefit || 0) * 12 * Math.pow(1.03, ssAt67YearsFromNow);
  console.log(`  SS at 67 (years from now: ${ssAt67YearsFromNow}): $${ssAt67Inflated.toFixed(0)}`);

  const targetAt65 = 2000000 * 0.04;
  const targetAt67 = targetAt65 * Math.pow(1.03, 2);
  console.log(`  Target spending at 65: $${targetAt65.toFixed(0)}`);
  console.log(`  Target spending at 67: $${targetAt67.toFixed(0)}`);
  console.log(`  Difference (what needs to be withdrawn): $${(targetAt67 - ssAt67Inflated).toFixed(0)}`);

  if (anomalyDetected) {
    console.log('\n  ⚠️  Income anomalies detected in ages 65-75');
  } else {
    console.log('  ✓ No major income anomalies detected in ages 65-75');
  }
}

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

function testEdgeCases(): void {
  section('EDGE CASES');

  console.log('\n--- Zero Balance Accounts ---');

  const emptyAccount: Account = {
    id: 'empty',
    name: 'Empty',
    type: 'traditional_401k_403b',
    balance: 0,
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0.07,
  };

  const profile: Profile = {
    currentAge: 30,
    retirementAge: 65,
    lifeExpectancy: 90,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const result = calculateAccumulation([emptyAccount], profile, usConfig);
  assertApprox(result.totalAtRetirement, 0, 0.01, 'Empty account stays at $0');

  console.log('\n--- Very Short Retirement ---');

  const shortProfile: Profile = {
    ...profile,
    retirementAge: 65,
    lifeExpectancy: 66, // 1 year retirement
  };

  const account: Account = {
    id: 'test',
    name: 'Test',
    type: 'traditional_401k_403b',
    balance: 1000000,
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0,
  };

  const assumptions: Assumptions = {
    inflationRate: 0.03,
    safeWithdrawalRate: 0.04,
    retirementReturnRate: 0.05,
  };

  const accumulation = calculateAccumulation([account], shortProfile, usConfig);
  const withdrawal = calculateWithdrawals([account], shortProfile, assumptions, accumulation, usConfig);

  assert(withdrawal.yearlyWithdrawals.length >= 1, 'Has at least 1 year of withdrawals');

  console.log('\n--- Very Long Retirement ---');

  const longProfile: Profile = {
    ...profile,
    retirementAge: 40,
    lifeExpectancy: 100, // 60 years of retirement
  };

  const longResult = calculateWithdrawals([account], longProfile, assumptions, calculateAccumulation([account], longProfile, usConfig), usConfig);

  assert(longResult.yearlyWithdrawals.length === 61, 'Has 61 years of withdrawal data (40-100 inclusive)');

  console.log('\n--- High Return Rate ---');

  const highReturnAccount: Account = {
    ...account,
    returnRate: 0.15, // 15% return
  };

  const highReturnResult = calculateAccumulation([highReturnAccount], profile, usConfig);
  assert(highReturnResult.totalAtRetirement > account.balance, 'High return grows portfolio');

  console.log('\n--- Multiple Account Types ---');

  const mixedAccounts: Account[] = [
    { id: '1', name: 'Trad 401k', type: 'traditional_401k_403b', balance: 100000, annualContribution: 0, contributionGrowthRate: 0, returnRate: 0 },
    { id: '2', name: 'Roth 401k', type: 'roth_401k', balance: 100000, annualContribution: 0, contributionGrowthRate: 0, returnRate: 0 },
    { id: '3', name: 'Trad IRA', type: 'traditional_ira', balance: 100000, annualContribution: 0, contributionGrowthRate: 0, returnRate: 0 },
    { id: '4', name: 'Roth IRA', type: 'roth_ira', balance: 100000, annualContribution: 0, contributionGrowthRate: 0, returnRate: 0 },
    { id: '5', name: 'Taxable', type: 'taxable', balance: 100000, annualContribution: 0, contributionGrowthRate: 0, returnRate: 0 },
    { id: '6', name: 'HSA', type: 'hsa', balance: 100000, annualContribution: 0, contributionGrowthRate: 0, returnRate: 0 },
  ];

  const mixedResult = calculateAccumulation(mixedAccounts, shortProfile, usConfig);

  assertApprox(mixedResult.totalAtRetirement, 600000, 0.01, 'Total of all accounts = $600,000');
  assertApprox(mixedResult.breakdownByGroup.traditional, 200000, 0.01, 'Traditional (trad 401k + IRA) = $200,000');
  assertApprox(mixedResult.breakdownByGroup.roth, 200000, 0.01, 'Roth (roth 401k + IRA) = $200,000');
  assertApprox(mixedResult.breakdownByGroup.taxable, 100000, 0.01, 'Taxable = $100,000');
  assertApprox(mixedResult.breakdownByGroup.hsa, 100000, 0.01, 'HSA = $100,000');
}

// =============================================================================
// CAPITAL GAINS TAX EDGE CASES
// =============================================================================

function testCapitalGainsEdgeCases(): void {
  section('CAPITAL GAINS TAX EDGE CASES');

  console.log('\n--- Capital gains with income below 0% bracket ---');

  // MFJ: 0% rate up to $96,700
  // With standard deduction of $31,500, ordinary income of $29,200 means $0 taxable
  // All $50k of gains should be at 0%
  const cgTax1 = calculateCapitalGainsTax(50000, 29200, 'married_filing_jointly');
  assertApprox(cgTax1, 0, 0.01, '$50k gains with income = std deduction should be 0%');

  // Income at $50,000 means taxable = $18,500
  // Room in 0% bracket = $96,700 - $18,500 = $78,200
  // $50k gains all at 0%
  const cgTax2 = calculateCapitalGainsTax(50000, 50000, 'married_filing_jointly');
  assertApprox(cgTax2, 0, 0.01, '$50k gains with $50k income (all gains in 0% bracket)');

  console.log('\n--- Capital gains spanning multiple brackets ---');

  // Income of $120,000 (taxable = $88,500)
  // Room in 0% bracket = $96,700 - $88,500 = $8,200
  // $100k gains: $8,200 at 0%, $91,800 at 15%
  // Expected: $91,800 * 0.15 = $13,770.00
  const cgTax3 = calculateCapitalGainsTax(100000, 120000, 'married_filing_jointly');
  assertApprox(cgTax3, 13770, 0.01, '$100k gains with $120k income (spanning 0%/15%)');

  console.log('\n--- Capital gains at high income (20% bracket) ---');

  // Income of $600,000 (taxable = $568,500)
  // This is in the 15% bracket ($96,700 to $600,050)
  // Room in 15% = $600,050 - $568,500 = $31,550
  // $50k gains: $31,550 at 15%, $18,450 at 20%
  // Expected: $31,550 * 0.15 + $18,450 * 0.20 = $8,422.50
  const cgTax4 = calculateCapitalGainsTax(50000, 600000, 'married_filing_jointly');
  assertApprox(cgTax4, 8422.50, 0.01, '$50k gains with $600k income (spanning 15%/20%)');

  console.log('\n--- Single filer capital gains ---');

  // Single: 0% up to $48,350, 15% to $533,400, 20% above
  // Income $50k, taxable = $34,250
  // Room in 0% = $48,350 - $34,250 = $14,100
  // $30k gains: $14,100 at 0%, $15,900 at 15%
  // Expected: $15,900 * 0.15 = $2,385.00
  const cgTax5 = calculateCapitalGainsTax(30000, 50000, 'single');
  assertApprox(cgTax5, 2385, 0.01, '$30k gains with $50k income (single filer)');

  console.log('\n--- Zero capital gains ---');

  const cgTax6 = calculateCapitalGainsTax(0, 100000, 'married_filing_jointly');
  assertApprox(cgTax6, 0, 0.01, 'Zero capital gains = $0 tax');

  console.log('\n--- Edge case: income exactly at bracket boundary ---');

  // With $123,250 ordinary income, taxable ordinary = $91,750.
  // That leaves $4,950 in the 0% gains bracket; the remaining $5,050 is taxed at 15%.
  const cgTax7 = calculateCapitalGainsTax(10000, 123250, 'married_filing_jointly');
  assertApprox(cgTax7, 757.5, 0.01, '$10k gains at current bracket boundary = $757.50');
}

// =============================================================================
// WITHDRAWAL STRATEGY DETAILED TESTS
// =============================================================================

function testWithdrawalStrategyDetails(): void {
  section('WITHDRAWAL STRATEGY DETAILED TESTS');

  console.log('\n--- Tax bracket filling test ---');

  // Setup: Traditional account with enough to fill brackets
  // At retirement, should fill 12% bracket optimally
  const account: Account = {
    id: 'trad',
    name: 'Traditional',
    type: 'traditional_401k_403b',
    balance: 500000,
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0,
  };

  const profile: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 66,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const assumptions: Assumptions = {
    inflationRate: 0,
    safeWithdrawalRate: 0.04, // $20k needed
    retirementReturnRate: 0,
  };

  const accumulation = calculateAccumulation([account], profile, usConfig);
  const result = calculateWithdrawals([account], profile, assumptions, accumulation, usConfig);

  const year1 = result.yearlyWithdrawals[0];

  // Target spending is $20k (4% of $500k)
  // The solver should gross up withdrawals enough to cover taxes too.
  assert(
    year1.afterTaxIncome >= year1.targetSpending - 1,
    'Spendable income meets target spending after taxes'
  );
  assert(
    year1.totalWithdrawal >= 20000,
    'Gross withdrawal can exceed target spending to cover taxes'
  );

  console.log('\n--- Roth before taxable test ---');

  // Setup: Mix of Roth and Taxable, should use Roth first (after traditional bracket filling)
  const mixedAccounts: Account[] = [
    {
      id: 'trad',
      name: 'Traditional',
      type: 'traditional_401k_403b',
      balance: 50000, // Small traditional
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
    {
      id: 'roth',
      name: 'Roth',
      type: 'roth_ira',
      balance: 200000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
    {
      id: 'taxable',
      name: 'Taxable',
      type: 'taxable',
      balance: 200000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
  ];

  const mixedProfile: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 66,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const mixedAssumptions: Assumptions = {
    inflationRate: 0,
    safeWithdrawalRate: 0.10, // 10% = $45k needed
    retirementReturnRate: 0,
  };

  const mixedAccum = calculateAccumulation(mixedAccounts, mixedProfile, usConfig);
  const mixedResult = calculateWithdrawals(mixedAccounts, mixedProfile, mixedAssumptions, mixedAccum, usConfig);

  const mixedYear1 = mixedResult.yearlyWithdrawals[0];

  // Strategy should:
  // 1. Fill 12% bracket with traditional (up to need or bracket, whichever less)
  // 2. Use Roth for remaining
  // 3. Only use taxable if needed
  assert(
    mixedYear1.withdrawals['roth'] > 0 || mixedYear1.withdrawals['trad'] >= 45000,
    'Uses Roth or enough traditional to meet needs'
  );

  console.log('\n--- HSA as last resort test ---');

  const hsaAccounts: Account[] = [
    {
      id: 'hsa',
      name: 'HSA',
      type: 'hsa',
      balance: 100000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
    {
      id: 'roth',
      name: 'Roth',
      type: 'roth_ira',
      balance: 50000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
  ];

  const hsaProfile: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 66,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const hsaAssumptions: Assumptions = {
    inflationRate: 0,
    safeWithdrawalRate: 0.40, // 40% = $60k needed
    retirementReturnRate: 0,
  };

  const hsaAccum = calculateAccumulation(hsaAccounts, hsaProfile, usConfig);
  const hsaResult = calculateWithdrawals(hsaAccounts, hsaProfile, hsaAssumptions, hsaAccum, usConfig);

  const hsaYear1 = hsaResult.yearlyWithdrawals[0];

  // Should use all Roth ($50k) before touching HSA ($10k)
  assertApprox(hsaYear1.withdrawals['roth'], 50000, 1, 'Uses all Roth first');
  assertApprox(hsaYear1.withdrawals['hsa'], 10000, 1, 'HSA used only for remainder');
}

// =============================================================================
// COST BASIS TRACKING TESTS
// =============================================================================

function testCostBasisTracking(): void {
  section('COST BASIS TRACKING TESTS');

  console.log('\n--- Taxable account gains calculation ---');

  // Setup: Taxable account, verify gains are calculated correctly
  const taxableAccount: Account = {
    id: 'taxable',
    name: 'Taxable',
    type: 'taxable',
    balance: 100000, // Will be treated as 50% cost basis by default
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0,
  };

  const profile: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 66,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0,
  };

  const assumptions: Assumptions = {
    inflationRate: 0,
    safeWithdrawalRate: 0.10, // $10k withdrawal
    retirementReturnRate: 0,
  };

  const accumulation = calculateAccumulation([taxableAccount], profile, usConfig);
  const result = calculateWithdrawals([taxableAccount], profile, assumptions, accumulation, usConfig);

  const year1 = result.yearlyWithdrawals[0];

  // With $100k balance and 50% cost basis ($50k), gain ratio = 50%
  // $10k withdrawal should have $5k gains
  // Capital gains tax at 0% bracket (income below threshold) = $0
  assert(year1.federalTax >= 0, 'Federal tax calculated for taxable account withdrawal');

  console.log('\n--- Cost basis depletion over time ---');

  // Multi-year test to ensure cost basis is tracked correctly
  const longProfile: Profile = {
    ...profile,
    lifeExpectancy: 70, // 5 years
  };

  const longAssumptions: Assumptions = {
    inflationRate: 0,
    safeWithdrawalRate: 0.20, // High withdrawal rate
    retirementReturnRate: 0,
  };

  const longAccum = calculateAccumulation([taxableAccount], longProfile, usConfig);
  const longResult = calculateWithdrawals([taxableAccount], longProfile, longAssumptions, longAccum, usConfig);

  // Verify withdrawals continue until depleted
  let totalWithdrawn = 0;
  for (const year of longResult.yearlyWithdrawals) {
    totalWithdrawn += year.withdrawals['taxable'] || 0;
  }

  assert(totalWithdrawn <= 100000, `Total withdrawn ($${totalWithdrawn.toFixed(0)}) <= initial balance`);
}

// =============================================================================
// RMD INTERACTION TESTS
// =============================================================================

function testRMDInteractions(): void {
  section('RMD INTERACTION TESTS');

  console.log('\n--- RMD forces withdrawal above target ---');

  // Large traditional balance at age 73 should force RMD even if SWR is low
  const largeTraditional: Account = {
    id: 'trad',
    name: 'Traditional',
    type: 'traditional_401k_403b',
    balance: 2000000,
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0,
  };

  const profile: Profile = {
    currentAge: 73,
    retirementAge: 73,
    lifeExpectancy: 75,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const assumptions: Assumptions = {
    inflationRate: 0,
    safeWithdrawalRate: 0.02, // Only 2% = $40k
    retirementReturnRate: 0,
  };

  const accumulation = calculateAccumulation([largeTraditional], profile, usConfig);
  const result = calculateWithdrawals([largeTraditional], profile, assumptions, accumulation, usConfig);

  const year73 = result.yearlyWithdrawals[0];

  // RMD at 73 with $2M = $2M / 26.5 = $75,471.70
  // Target spending = $40k
  // RMD should force withdrawal of ~$75,472
  assertApprox(year73.rmdAmount, 75471.70, 1, 'RMD calculated correctly for $2M at age 73');
  assert(
    year73.totalWithdrawal >= year73.rmdAmount - 1,
    `Withdrawal ($${year73.totalWithdrawal.toFixed(0)}) >= RMD ($${year73.rmdAmount.toFixed(0)})`
  );

  console.log('\n--- RMD with mixed account types ---');

  // Traditional + Roth, RMD only applies to traditional
  const mixedAccounts: Account[] = [
    {
      id: 'trad',
      name: 'Traditional',
      type: 'traditional_401k_403b',
      balance: 1000000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
    {
      id: 'roth',
      name: 'Roth',
      type: 'roth_ira',
      balance: 1000000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0,
    },
  ];

  const mixedResult = calculateWithdrawals(mixedAccounts, profile, assumptions, calculateAccumulation(mixedAccounts, profile, usConfig), usConfig);

  const mixedYear73 = mixedResult.yearlyWithdrawals[0];

  // RMD only on $1M traditional = $1M / 26.5 = $37,735.85
  assertApprox(mixedYear73.rmdAmount, 37735.85, 1, 'RMD only on traditional balance');
}

// =============================================================================
// INFLATION CONSISTENCY TESTS
// =============================================================================

function testInflationConsistency(): void {
  section('INFLATION CONSISTENCY TESTS');

  console.log('\n--- Target spending grows with inflation ---');

  const account: Account = {
    id: 'trad',
    name: 'Traditional',
    type: 'traditional_401k_403b',
    balance: 1000000,
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0,
  };

  const profile: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 70,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const assumptions: Assumptions = {
    inflationRate: 0.03,
    safeWithdrawalRate: 0.04,
    retirementReturnRate: 0,
  };

  const accumulation = calculateAccumulation([account], profile, usConfig);
  const result = calculateWithdrawals([account], profile, assumptions, accumulation, usConfig);

  // Year 1: $40k target
  // Year 2: $40k * 1.03 = $41,200
  // Year 3: $41,200 * 1.03 = $42,436
  const year1 = result.yearlyWithdrawals[0];
  const year2 = result.yearlyWithdrawals[1];
  const year3 = result.yearlyWithdrawals[2];

  assertApprox(year1.targetSpending, 40000, 1, 'Year 1 target = $40,000');
  assertApprox(year2.targetSpending, 41200, 1, 'Year 2 target = $41,200 (3% inflation)');
  assertApprox(year3.targetSpending, 42436, 1, 'Year 3 target = $42,436 (compound inflation)');

  console.log('\n--- Social Security inflated correctly ---');

  const ssProfile: Profile = {
    currentAge: 60,
    retirementAge: 65,
    lifeExpectancy: 70,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
    socialSecurityBenefit: 2500,
    socialSecurityStartAge: 67,
  };

  const ssAccum = calculateAccumulation([account], ssProfile, usConfig);
  const ssResult = calculateWithdrawals([account], ssProfile, assumptions, ssAccum, usConfig);

  // SS starts at age 67.
  // The configured monthly benefit is interpreted as the amount at the start age,
  // then inflated only in years after benefits begin.
  const age67 = ssResult.yearlyWithdrawals.find(y => y.age === 67);

  if (age67) {
    const expectedSS = 2500 * 12;
    assertApprox(age67.socialSecurityIncome, expectedSS, 1, 'SS equals the configured start-age benefit at age 67');
  }
}

// =============================================================================
// PORTFOLIO DEPLETION TESTS
// =============================================================================

function testPortfolioDepletion(): void {
  section('PORTFOLIO DEPLETION TESTS');

  console.log('\n--- Portfolio depletion detection ---');

  const smallAccount: Account = {
    id: 'small',
    name: 'Small Account',
    type: 'traditional_401k_403b',
    balance: 50000,
    annualContribution: 0,
    contributionGrowthRate: 0,
    returnRate: 0,
  };

  const profile: Profile = {
    currentAge: 65,
    retirementAge: 65,
    lifeExpectancy: 80,
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const assumptions: Assumptions = {
    inflationRate: 0.03,
    safeWithdrawalRate: 0.10, // High 10% rate = $5k/year
    retirementReturnRate: 0, // No growth
  };

  const accumulation = calculateAccumulation([smallAccount], profile, usConfig);
  const result = calculateWithdrawals([smallAccount], profile, assumptions, accumulation, usConfig);

  // $50k at 10% = $5k/year, plus 3% inflation
  // Year 1: $5,000
  // Year 2: $5,150
  // ...should deplete within ~9 years
  assert(
    result.portfolioDepletionAge !== null && result.portfolioDepletionAge < 80,
    `Portfolio depletes at age ${result.portfolioDepletionAge} (before life expectancy)`
  );

  console.log('\n--- Sustainable portfolio (no depletion) ---');

  const largeAccount: Account = {
    ...smallAccount,
    balance: 2000000,
  };

  const sustainableAssumptions: Assumptions = {
    inflationRate: 0.03,
    safeWithdrawalRate: 0.04, // Conservative 4%
    retirementReturnRate: 0.05, // 5% returns beat inflation
  };

  const largeAccum = calculateAccumulation([largeAccount], profile, usConfig);
  const largeResult = calculateWithdrawals([largeAccount], profile, sustainableAssumptions, largeAccum, usConfig);

  assert(
    largeResult.portfolioDepletionAge === null,
    'Large portfolio with good returns does not deplete'
  );
}

// =============================================================================
// TOTAL FEDERAL TAX INTEGRATION TESTS
// =============================================================================

function testTotalFederalTaxIntegration(): void {
  section('TOTAL FEDERAL TAX INTEGRATION');

  console.log('\n--- Combined ordinary income and capital gains ---');

  // MFJ: std deduction $31,500
  // $50k ordinary income -> taxable = $18,500 -> tax = $1,850 (10% bracket)
  // Capital gains: $50k stacks on top
  // Income base = $18,500, gains start here
  // 0% bracket goes to $96,700, so $78,200 at 0%
  // All $50k gains at 0%
  // Total = $1,850 + $0 = $1,850
  const tax1 = calculateTotalFederalTax(50000, 50000, 'married_filing_jointly');
  assertApprox(tax1, 1850, 0.01, 'Ordinary $50k + Cap gains $50k (gains in 0% bracket)');

  console.log('\n--- High income scenario ---');

  // $200k ordinary income -> taxable = $168,500
  // Tax: $23,850 @ 10% = $2,385
  //      $73,100 @ 12% = $8,772
  //      $71,550 @ 22% = $15,741
  // Total ordinary tax = $26,898
  // Capital gains $100k starts at $168,500
  // 0% bracket ends at $96,700 (already passed)
  // All $100k at 15% = $15,000
  // Total = $26,898 + $15,000 = $41,898
  const tax2 = calculateTotalFederalTax(200000, 100000, 'married_filing_jointly');
  assertApprox(tax2, 41898, 1, 'Ordinary $200k + Cap gains $100k');

  console.log('\n--- Only capital gains (no ordinary income) ---');

  // $0 ordinary income, $100k capital gains
  // Taxable ordinary = $0
  // Gains start at $0
  // 0% bracket: $96,700 at 0%
  // 15% bracket: $3,300 at 15% = $495.00
  const tax3 = calculateTotalFederalTax(0, 100000, 'married_filing_jointly');
  assertApprox(tax3, 495, 0.01, 'Only $100k capital gains, no ordinary income');

  console.log('\n--- Standard deduction covers all ordinary ---');

  // $31,500 ordinary (exactly std deduction), $50k gains
  // Taxable ordinary = $0
  // All gains at 0% (under $96,700 threshold)
  const tax4 = calculateTotalFederalTax(31500, 50000, 'married_filing_jointly');
  assertApprox(tax4, 0, 0.01, 'Ordinary = std deduction, gains in 0% bracket');
}

// =============================================================================
// CANADIAN CALCULATION TESTS
// =============================================================================

const caConfig = getCountryConfig('CA');

function testCanadianCalculations(): void {
  section('CANADIAN CALCULATIONS');

  console.log('\n--- Canadian Federal Tax Brackets ---');

  // Canadian federal tax on $50,000 income
  // Basic personal amount: $15,705
  // Taxable: $50,000 - $15,705 = $34,295
  // 15% on first $53,359 = $34,295 * 0.15 = $5,144.25
  const caTax1 = caConfig.calculateFederalTax(50000);
  assert(caTax1 > 0 && caTax1 < 10000, `CA federal tax on $50k is reasonable (got $${caTax1.toFixed(2)})`);

  // Higher income bracket test
  const caTax2 = caConfig.calculateFederalTax(100000);
  assert(caTax2 > caTax1, `CA federal tax on $100k (${caTax2.toFixed(0)}) > $50k (${caTax1.toFixed(0)})`);

  console.log('\n--- Canadian Account Type Recognition ---');

  // Test traditional account recognition
  assert(caConfig.isTraditionalAccount('rrsp'), 'RRSP is recognized as traditional');
  assert(caConfig.isTraditionalAccount('rrif'), 'RRIF is recognized as traditional');
  assert(caConfig.isTraditionalAccount('lira'), 'LIRA is recognized as traditional');
  assert(caConfig.isTraditionalAccount('lif'), 'LIF is recognized as traditional');
  assert(!caConfig.isTraditionalAccount('tfsa'), 'TFSA is NOT traditional');
  assert(!caConfig.isTraditionalAccount('non_registered'), 'Non-registered is NOT traditional');

  console.log('\n--- Canadian RRIF Minimum Withdrawals ---');

  // RRIF minimums at age 71 = 5.28%
  const rrifMin71 = caConfig.getMinimumWithdrawal(71, 100000, 'rrif');
  assertApprox(rrifMin71, 5280, 10, 'RRIF min at 71 = 5.28% of $100k');

  // RRIF minimums at age 80 = 6.82%
  const rrifMin80 = caConfig.getMinimumWithdrawal(80, 100000, 'rrif');
  assertApprox(rrifMin80, 6820, 10, 'RRIF min at 80 = 6.82% of $100k');

  // No minimum before 71 for RRSP
  const rrspMin65 = caConfig.getMinimumWithdrawal(65, 100000, 'rrsp');
  assertApprox(rrspMin65, 0, 0.01, 'No RRSP minimum at age 65');

  console.log('\n--- Canadian Accumulation with RRSP ---');

  const rrspAccount: Account = {
    id: 'rrsp1',
    name: 'RRSP',
    type: 'rrsp',
    balance: 100000,
    annualContribution: 10000,
    contributionGrowthRate: 0,
    returnRate: 0.07,
  };

  const caProfile: Profile = {
    country: 'CA',
    currentAge: 30,
    retirementAge: 31,
    lifeExpectancy: 90,
    region: 'ON',
  };

  const caResult = calculateAccumulation([rrspAccount], caProfile, caConfig);

  // After 1 year at 7%: $100,000 * 1.07 + $10,000 = $117,000
  assertApprox(caResult.totalAtRetirement, 117000, 0.01, 'CA RRSP growth calculation');

  console.log('\n--- Canadian Account Groupings ---');

  const caGroups = caConfig.getAccountGroupings();
  assert(caGroups.length > 0, 'CA has account groupings defined');

  const rrifGroup = caGroups.find(g => g.accountTypes.includes('rrif'));
  assert(rrifGroup !== undefined, 'RRIF has a grouping');
}

// =============================================================================
// DYNAMIC LOW-MAGI WITHDRAWAL REORDERING TESTS
// =============================================================================

function testDynamicLowMagiReordering(): void {
  section('DYNAMIC LOW-MAGI WITHDRAWAL REORDERING');

  console.log('\n--- Scenario: Age 73 with RMD and multiple account types ---');

  // Create accounts for someone already at retirement age 73
  const accounts: Account[] = [
    {
      id: 'trad401k',
      name: 'Traditional 401k',
      type: 'traditional_401k_403b',
      balance: 500000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0.05,
    },
    {
      id: 'roth_ira',
      name: 'Roth IRA',
      type: 'roth_ira',
      balance: 200000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0.05,
    },
    {
      id: 'taxable',
      name: 'Taxable Brokerage',
      type: 'taxable',
      balance: 100000,
      annualContribution: 0,
      contributionGrowthRate: 0,
      returnRate: 0.05,
      costBasis: 50000,
    },
  ];

  const profile: Profile = {
    country: 'US',
    currentAge: 73,
    retirementAge: 73, // Already retired
    lifeExpectancy: 95,
    region: 'CA',
    filingStatus: 'married_filing_jointly',
    stateTaxRate: 0.05,
  };

  const assumptions: Assumptions = {
    inflationRate: 0.03,
    safeWithdrawalRate: 0.04,
    retirementReturnRate: 0.05,
    withdrawalBracketFillTarget: 0.12,
    rothConversionStrategy: 'dynamic_low_magi',
  };

  // First calculate accumulation (should be just the current balances since we're at retirement age)
  const accumulation = calculateAccumulation(accounts, profile, usConfig);

  // Get withdrawals with dynamic_low_magi strategy
  const resultDynamic = calculateWithdrawals(accounts, profile, assumptions, accumulation, usConfig);

  // Get withdrawals with auto strategy for comparison
  const assumptionsAuto: Assumptions = {
    ...assumptions,
    rothConversionStrategy: 'auto',
  };

  const resultAuto = calculateWithdrawals(accounts, profile, assumptionsAuto, accumulation, usConfig);

  console.log('\n--- Comparing dynamic_low_magi vs auto strategy at age 73 (RMD required) ---');

  assert(resultDynamic.yearlyWithdrawals.length > 0, 'Dynamic strategy produces withdrawal data');
  assert(resultAuto.yearlyWithdrawals.length > 0, 'Auto strategy produces withdrawal data');

  const year1Dynamic = resultDynamic.yearlyWithdrawals[0];
  const year1Auto = resultAuto.yearlyWithdrawals[0];

  if (year1Dynamic && year1Auto) {
    console.log(`  - Auto strategy:    Traditional=$${year1Auto.traditionalWithdrawal.toFixed(0)}, Roth=$${year1Auto.rothWithdrawal.toFixed(0)}, Taxable=$${year1Auto.taxableWithdrawal.toFixed(0)}`);
    console.log(`  - Dynamic strategy: Traditional=$${year1Dynamic.traditionalWithdrawal.toFixed(0)}, Roth=$${year1Dynamic.rothWithdrawal.toFixed(0)}, Taxable=$${year1Dynamic.taxableWithdrawal.toFixed(0)}`);

    // Both should have positive withdrawals
    assert(year1Dynamic.totalWithdrawal > 0, 'Dynamic strategy has withdrawals');
    assert(year1Auto.totalWithdrawal > 0, 'Auto strategy has withdrawals');

    // RMD should be enforced (age 73 with $500k traditional)
    // RMD divisor at 73 = 26.5, so RMD ≈ $500k / 26.5 ≈ $18,868
    assert(
      year1Dynamic.traditionalWithdrawal >= 18000,
      'Dynamic strategy includes RMD from traditional accounts'
    );

    assert(
      year1Auto.traditionalWithdrawal >= 18000,
      'Auto strategy includes RMD from traditional accounts'
    );

    console.log(`  - Dynamic total: $${year1Dynamic.totalWithdrawal.toFixed(0)} (tax: $${year1Dynamic.totalTax.toFixed(0)})`);
    console.log(`  - Auto total: $${year1Auto.totalWithdrawal.toFixed(0)} (tax: $${year1Auto.totalTax.toFixed(0)})`);

    // Key insight: In high-MAGI years (RMD present), dynamic strategy may use different withdrawal mix
    // to minimize SS torpedo effect and IRMAA exposure
    assert(
      year1Dynamic.totalTax <= year1Auto.totalTax * 1.1,
      'Dynamic strategy tax is comparable to auto (within 10%)'
    );
  } else {
    assert(false, 'Withdrawal year data available');
  }
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

function runAllTests(): void {
  console.log('\n' + '🧪 RETIREMENT CALCULATOR MATH TESTS '.padEnd(60, '='));
  console.log('Running comprehensive tests on all calculations...\n');

  testTaxCalculations();
  testRMDCalculations();
  testAccumulationPhase();
  testWithdrawalPhase();
  testIncomeContinuity();
  testEdgeCases();
  testCapitalGainsEdgeCases();
  testWithdrawalStrategyDetails();
  testCostBasisTracking();
  testRMDInteractions();
  testInflationConsistency();
  testPortfolioDepletion();
  testTotalFederalTaxIntegration();
  testCanadianCalculations();
  testDynamicLowMagiReordering();

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`  ✓ Passed: ${passedTests}`);
  console.log(`  ✗ Failed: ${failedTests}`);
  console.log(`  Total: ${passedTests + failedTests}`);
  console.log('='.repeat(60) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests();
