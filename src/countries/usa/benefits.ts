import type { Profile } from '../../types';
import type { BenefitCalculation } from '../index';

/**
 * Calculate Social Security benefits
 * Simplified: assumes benefit starts at specified age with specified amount
 * In reality, Social Security has complex early/late claiming adjustments
 */
export function calculateSocialSecurityBenefits(
  profile: Profile,
  currentAge: number,
  _grossIncome: number // Not used for SS, but part of the interface
): BenefitCalculation[] {
  const benefits: BenefitCalculation[] = [];

  // Check if Social Security has started
  if (
    profile.socialSecurityBenefit &&
    profile.socialSecurityStartAge &&
    currentAge >= profile.socialSecurityStartAge
  ) {
    const monthlyBenefit = profile.socialSecurityBenefit; // stored as monthly at start age
    const annualBenefit = monthlyBenefit * 12;
    benefits.push({
      age: currentAge,
      monthlyAmount: monthlyBenefit,
      annualAmount: annualBenefit,
      startAge: profile.socialSecurityStartAge,
    });
  }

  if (
    profile.filingStatus === 'married_filing_jointly' &&
    profile.spouseCurrentAge !== undefined &&
    profile.spouseSocialSecurityBenefit &&
    profile.spouseSocialSecurityStartAge
  ) {
    const spouseAge = profile.spouseCurrentAge + (currentAge - profile.currentAge);

    if (spouseAge >= profile.spouseSocialSecurityStartAge) {
      const monthlyBenefit = profile.spouseSocialSecurityBenefit;
      const annualBenefit = monthlyBenefit * 12;
      benefits.push({
        age: currentAge,
        monthlyAmount: monthlyBenefit,
        annualAmount: annualBenefit,
        startAge: profile.spouseSocialSecurityStartAge,
      });
    }
  }

  return benefits;
}

/**
 * Calculate taxable portion of Social Security
 * US has up to 85% of SS taxable depending on income
 * Simplified: assumes 85% taxable
 */
export function getTaxableSocialSecurity(socialSecurityBenefit: number): number {
  return socialSecurityBenefit * 0.85;
}
