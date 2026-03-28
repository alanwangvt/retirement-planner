// Country code
export type CountryCode = 'US' | 'CA';

// US Account Types
export type USAccountType =
  | 'traditional_401k_403b'
  | 'traditional_457b'
  | 'roth_401k'
  | 'traditional_ira'
  | 'roth_ira'
  | 'taxable'
  | 'hsa';

// Canadian Account Types
export type CAAccountType =
  | 'rrsp'
  | 'tfsa'
  | 'rrif'
  | 'lira'
  | 'lif'
  | 'fhsa'
  | 'non_registered'
  | 'employer_rrsp';

// Combined account type (union of all countries)
export type AccountType = USAccountType | CAAccountType;

export type FilingStatus = 'single' | 'married_filing_jointly';

export type RothConversionStrategy = 'off' | 'auto';

export type TaxTreatment = 'pretax' | 'roth' | 'taxable' | 'hsa';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  annualContribution: number;
  contributionGrowthRate: number; // as decimal, e.g., 0.03
  returnRate: number; // as decimal
  employerMatchPercent?: number; // 401k only, as decimal
  employerMatchLimit?: number; // 401k only, dollar amount
}

export interface SsBenefitOption {
  startAge: number;
  monthlyBenefit: number;
}

export interface Profile {
  country: CountryCode;
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  region: string; // State code (US) or Province code (CA)
  filingStatus?: FilingStatus; // US only
  stateTaxRate?: number; // US only (as decimal), CA uses province
  annualIncome?: number; // For CA RRSP contribution room calculation
  socialSecurityBenefit?: number; // CPP for CA, Social Security for US (monthly at start age)
  socialSecurityStartAge?: number; // CPP/SS start age
  ssBenefitOptions?: SsBenefitOption[]; // Multiple (startAge, monthlyBenefit) scenarios for optimizer
  secondaryBenefitStartAge?: number; // OAS for CA
  secondaryBenefitAmount?: number; // OAS amount for CA
}

export interface Assumptions {
  inflationRate: number; // as decimal
  safeWithdrawalRate: number; // as decimal
  retirementReturnRate: number; // as decimal
  rothConversionStrategy?: RothConversionStrategy; // 'off' or 'auto' - auto fills to bracket/IRMAA limit
  rothConversionTargetRate?: number; // target marginal tax rate (e.g., 0.12, 0.22, 0.24)
  annualSpendingAtRetirement?: number; // user-specified annual spending at retirement start
  withdrawalBracketFillTarget?: number; // target bracket for traditional withdrawal fill (default 0.12)
  taxableFirstSpendingAge?: number;     // use taxable brokerage for spending before this age (reduces ordinary income)
}

export interface YearlyAccountBalance {
  age: number;
  year: number;
  balances: Record<string, number>; // accountId -> balance
  totalBalance: number;
  contributions: Record<string, number>; // accountId -> contribution that year
}

export interface AccumulationResult {
  yearlyBalances: YearlyAccountBalance[];
  finalBalances: Record<string, number>;
  totalAtRetirement: number;
  breakdownByGroup: Record<string, number>; // Flexible groupings defined by country
}

export interface YearlyWithdrawal {
  age: number;
  year: number;
  withdrawals: Record<string, number>; // accountId -> withdrawal
  remainingBalances: Record<string, number>; // accountId -> remaining balance
  totalWithdrawal: number;
  traditionalWithdrawal: number;
  rothWithdrawal: number;
  taxableWithdrawal: number;
  hsaWithdrawal: number;
  socialSecurityIncome: number;
  grossIncome: number;
  magi: number; // MAGI for tax/IRMAA = traditional withdrawals + taxable SS + Roth conversions
  federalTax: number;
  stateTax: number;
  totalTax: number;
  afterTaxIncome: number;
  targetSpending: number;
  rmdAmount: number;
  rothConversionAmount: number;
  rothConversionFromAccountId: string | null;
  rothConversionToAccountId: string | null;
  rothConversionReason?: string; // explanation of why this amount was chosen
  irmaaThresholdDistance?: number; // how close to next IRMAA threshold
  effectiveMarginalRate?: number; // marginal rate including IRMAA impact
  totalRemainingBalance: number;
}

export interface RetirementResult {
  yearlyWithdrawals: YearlyWithdrawal[];
  portfolioDepletionAge: number | null; // null if never depletes
  lifetimeTaxesPaid: number;
  sustainableMonthlyWithdrawal: number;
  sustainableAnnualWithdrawal: number;
  accountDepletionAges: Record<string, number | null>; // accountId -> age when depleted
}

export interface AppState {
  accounts: Account[];
  profile: Profile;
  assumptions: Assumptions;
}

// Tax bracket structure
export interface TaxBracket {
  min: number;
  max: number;
  rate: number;
}

// RMD table entry
export interface RMDEntry {
  age: number;
  divisor: number;
}

// IRMAA threshold structure
export interface IRMAAThreshold {
  min: number;
  max: number;
  partBSurcharge: number;
  partDSurcharge: number;
}

// Helper function type for getting tax treatment
export function getTaxTreatment(accountType: AccountType): TaxTreatment {
  switch (accountType) {
    // US accounts
    case 'traditional_401k_403b':
    case 'traditional_457b':
    case 'traditional_ira':
      return 'pretax';
    case 'roth_401k':
    case 'roth_ira':
      return 'roth';
    case 'taxable':
      return 'taxable';
    case 'hsa':
      return 'hsa';
    // Canadian accounts
    case 'rrsp':
    case 'rrif':
    case 'lira':
    case 'lif':
    case 'fhsa':
    case 'employer_rrsp':
      return 'pretax';
    case 'tfsa':
      return 'roth';
    case 'non_registered':
      return 'taxable';
    default:
      return 'taxable';
  }
}

export function getAccountTypeLabel(type: AccountType): string {
  switch (type) {
    // US accounts
    case 'traditional_401k_403b':
      return 'Traditional 401(k)/403(b)';
    case 'traditional_457b':
      return 'Traditional 457(b)';
    case 'roth_401k':
      return 'Roth 401(k)';
    case 'traditional_ira':
      return 'Traditional IRA';
    case 'roth_ira':
      return 'Roth IRA';
    case 'taxable':
      return 'Taxable Brokerage';
    case 'hsa':
      return 'HSA';
    // Canadian accounts
    case 'rrsp':
      return 'RRSP';
    case 'tfsa':
      return 'TFSA';
    case 'rrif':
      return 'RRIF';
    case 'lira':
      return 'LIRA';
    case 'lif':
      return 'LIF';
    case 'fhsa':
      return 'FHSA';
    case 'non_registered':
      return 'Non-Registered';
    case 'employer_rrsp':
      return 'Employer RRSP';
    default:
      return type;
  }
}

export function is401k(type: AccountType): boolean {
  return type === 'traditional_401k_403b' || type === 'roth_401k';
}

export function isTraditional(type: string): boolean {
  return type === 'traditional_401k_403b' || type === 'traditional_ira';
}
