import { useState } from 'react';
import { Account, RetirementResult, Profile, getTaxTreatment } from '../types';
import { getAnnualIRMAASurcharge } from '../utils/taxes';
import { STANDARD_DEDUCTION_MFJ, STANDARD_DEDUCTION_SINGLE } from '../utils/constants';
import { Tooltip } from './Tooltip';

interface DataTableWithdrawalProps {
  accounts: Account[];
  result: RetirementResult;
  profile: Profile;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}


type ViewMode = 'income' | 'withdrawals' | 'balances' | 'conversions';

export function DataTableWithdrawal({ accounts, result, profile }: DataTableWithdrawalProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('income');

  if (!result.yearlyWithdrawals.length) return null;

  // Get color class based on tax treatment
  const getColorClass = (accountType: Account['type']): string => {
    const treatment = getTaxTreatment(accountType);
    switch (treatment) {
      case 'pretax': return 'text-blue-600 dark:text-blue-400';
      case 'roth': return 'text-green-600 dark:text-green-400';
      case 'taxable': return 'text-amber-600 dark:text-amber-400';
      case 'hsa': return 'text-purple-600 dark:text-purple-400';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-gray-500 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="font-medium text-gray-900 dark:text-white">Year-by-Year Data</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          {/* View Mode Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            <button
              onClick={() => setViewMode('income')}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                viewMode === 'income'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Income & Spending
            </button>
            <button
              onClick={() => setViewMode('withdrawals')}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                viewMode === 'withdrawals'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Withdrawals by Account
            </button>
            <button
              onClick={() => setViewMode('balances')}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                viewMode === 'balances'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Remaining Balances
            </button>
            <button
              onClick={() => setViewMode('conversions')}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                viewMode === 'conversions'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Roth Conversions
            </button>
          </div>

          <div className="overflow-x-auto">
            {viewMode === 'income' && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800">Age</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Target Spending</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Portfolio Drawdown<Tooltip text="Tax-deferred withdrawals excluding Roth conversions" /></th>
                    <th className="text-right py-2 px-2 font-medium text-indigo-600 dark:text-indigo-400">Social Security</th>
                    <th className="text-right py-2 px-2 font-medium text-sky-600 dark:text-sky-400">Pension</th>
                    <th className="text-right py-2 px-2 font-medium text-purple-600 dark:text-purple-400" title="MAGI minus standard deduction">Taxable Income</th>
                    <th className="text-right py-2 px-2 font-medium text-red-600 dark:text-red-400">Federal Tax</th>
                    <th className="text-right py-2 px-2 font-medium text-orange-600 dark:text-orange-400">State Tax</th>
                    <th className="text-right py-2 px-2 font-medium text-red-600 dark:text-red-400">Total Tax</th>
                    <th className="text-right py-2 px-2 font-medium text-violet-600 dark:text-violet-400">MAGI</th>
                    <th className="text-right py-2 px-2 font-medium text-rose-600 dark:text-rose-400" title="Based on MAGI from 2 years prior (SSA lookback)">IRMAA</th>
                    <th className="text-right py-2 px-2 font-medium text-teal-600 dark:text-teal-400">Spendable Income</th>
                  </tr>
                </thead>
                <tbody>
                  {result.yearlyWithdrawals.map((yearData) => {
                    const filingStatus = profile.filingStatus || 'single';
                    const stdDed = filingStatus === 'married_filing_jointly' ? STANDARD_DEDUCTION_MFJ : STANDARD_DEDUCTION_SINGLE;
                    const taxableIncome = Math.max(0, yearData.magi - stdDed);
                    // IRMAA uses MAGI from 2 years prior (SSA lookback rule)
                    const priorYearData = result.yearlyWithdrawals.find(y => y.age === yearData.age - 2);
                    const irmaaMagi = priorYearData?.magi ?? yearData.magi;
                    const irmaaSurcharge = yearData.age >= 65
                      ? getAnnualIRMAASurcharge(irmaaMagi, filingStatus)
                      : null;
                    return (
                      <tr key={yearData.age} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-2 px-2 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800">{yearData.age}</td>
                        <td className="py-2 px-2 text-right font-mono text-gray-600 dark:text-gray-400">{formatCurrency(yearData.targetSpending)}</td>
                        <td className="py-2 px-2 text-right font-mono text-gray-900 dark:text-white">{formatCurrency(yearData.totalWithdrawal)}</td>
                        <td className="py-2 px-2 text-right font-mono text-indigo-600 dark:text-indigo-400">
                          {yearData.socialSecurityIncome > 0 ? formatCurrency(yearData.socialSecurityIncome) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-sky-600 dark:text-sky-400">
                          {yearData.pensionIncome > 0 ? formatCurrency(yearData.pensionIncome) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-purple-600 dark:text-purple-400">
                          {taxableIncome > 0 ? formatCurrency(taxableIncome) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-red-600 dark:text-red-400">
                          {yearData.federalTax > 0 ? formatCurrency(yearData.federalTax) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-orange-600 dark:text-orange-400">
                          {yearData.stateTax > 0 ? formatCurrency(yearData.stateTax) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-red-600 dark:text-red-400">
                          {yearData.totalTax > 0 ? formatCurrency(yearData.totalTax) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-violet-600 dark:text-violet-400">{formatCurrency(yearData.magi)}</td>
                        <td className="py-2 px-2 text-right font-mono text-rose-600 dark:text-rose-400">
                          {irmaaSurcharge == null ? '-' : irmaaSurcharge > 0 ? formatCurrency(irmaaSurcharge) : '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-teal-600 dark:text-teal-400">{formatCurrency(yearData.afterTaxIncome)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
                    <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900">Lifetime Total</td>
                    <td className="py-2 px-2 text-right font-mono text-gray-600 dark:text-gray-400">-</td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                      {formatCurrency(result.yearlyWithdrawals.reduce((sum, y) => sum + y.totalWithdrawal, 0))}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(result.yearlyWithdrawals.reduce((sum, y) => sum + y.socialSecurityIncome, 0))}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-sky-600 dark:text-sky-400">
                      {formatCurrency(result.yearlyWithdrawals.reduce((sum, y) => sum + y.pensionIncome, 0))}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-gray-500 dark:text-gray-400">-</td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-red-600 dark:text-red-400">
                      {formatCurrency(result.yearlyWithdrawals.reduce((sum, y) => sum + y.federalTax, 0))}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-orange-600 dark:text-orange-400">
                      {formatCurrency(result.yearlyWithdrawals.reduce((sum, y) => sum + y.stateTax, 0))}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-red-600 dark:text-red-400">
                      {formatCurrency(result.lifetimeTaxesPaid)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-gray-500 dark:text-gray-400">-</td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-rose-600 dark:text-rose-400">
                      {formatCurrency(result.yearlyWithdrawals
                        .filter(y => y.age >= 65)
                        .reduce((sum, y) => {
                          const priorY = result.yearlyWithdrawals.find(p => p.age === y.age - 2);
                          const irmaaMagi = priorY?.magi ?? y.magi;
                          return sum + getAnnualIRMAASurcharge(irmaaMagi, profile.filingStatus || 'single');
                        }, 0))}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-teal-600 dark:text-teal-400">
                      {formatCurrency(result.yearlyWithdrawals.reduce((sum, y) => sum + y.afterTaxIncome, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {viewMode === 'withdrawals' && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800">Age</th>
                    <th className="text-right py-2 px-2 font-medium text-blue-600 dark:text-blue-400">RMD</th>
                    {accounts.map(acc => (
                      <th key={acc.id} className={`text-right py-2 px-2 font-medium ${getColorClass(acc.type)}`}>
                        {acc.name}
                      </th>
                    ))}
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.yearlyWithdrawals.map((yearData) => (
                    <tr key={yearData.age} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-2 px-2 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800">{yearData.age}</td>
                      <td className="py-2 px-2 text-right font-mono text-blue-600 dark:text-blue-400">
                        {yearData.rmdAmount > 0 ? formatCurrency(yearData.rmdAmount) : '-'}
                      </td>
                      {accounts.map(acc => (
                        <td key={acc.id} className="py-2 px-2 text-right font-mono text-gray-600 dark:text-gray-400">
                          {(yearData.withdrawals[acc.id] || 0) > 0 ? formatCurrency(yearData.withdrawals[acc.id] || 0) : '-'}
                        </td>
                      ))}
                      <td className="py-2 px-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                        {formatCurrency(yearData.totalWithdrawal + yearData.rothConversionAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {viewMode === 'balances' && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800">Age</th>
                    {accounts.map(acc => (
                      <th key={acc.id} className={`text-right py-2 px-2 font-medium ${getColorClass(acc.type)}`}>
                        {acc.name}
                      </th>
                    ))}
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.yearlyWithdrawals.map((yearData) => (
                    <tr key={yearData.age} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-2 px-2 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800">{yearData.age}</td>
                      {accounts.map(acc => (
                        <td key={acc.id} className="py-2 px-2 text-right font-mono text-gray-600 dark:text-gray-400">
                          {formatCurrency(yearData.remainingBalances[acc.id] || 0)}
                        </td>
                      ))}
                      <td className="py-2 px-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                        {formatCurrency(yearData.totalRemainingBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {viewMode === 'conversions' && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800">Age</th>
                    <th className="text-right py-2 px-2 font-medium text-purple-600 dark:text-purple-400">Conversion Amount</th>
                    <th className="text-left py-2 px-2 font-medium text-blue-600 dark:text-blue-400">From Account</th>
                    <th className="text-left py-2 px-2 font-medium text-green-600 dark:text-green-400">To Account</th>
                  </tr>
                </thead>
                <tbody>
                  {result.yearlyWithdrawals.map((yearData) => {
                    const fromAccount = yearData.rothConversionFromAccountId
                      ? accounts.find(a => a.id === yearData.rothConversionFromAccountId)
                      : null;
                    const toAccount = yearData.rothConversionToAccountId
                      ? accounts.find(a => a.id === yearData.rothConversionToAccountId)
                      : null;
                    const hasConversion = yearData.rothConversionAmount > 0;

                    return (
                      <tr key={yearData.age} className={`border-b border-gray-100 dark:border-gray-800 ${
                        hasConversion ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50' : 'opacity-50'
                      }`}>
                        <td className="py-2 px-2 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800">{yearData.age}</td>
                        <td className="py-2 px-2 text-right font-mono text-purple-600 dark:text-purple-400">
                          {hasConversion ? formatCurrency(yearData.rothConversionAmount) : '-'}
                        </td>
                        <td className="py-2 px-2 text-left text-blue-600 dark:text-blue-400">
                          {fromAccount ? fromAccount.name : '-'}
                        </td>
                        <td className="py-2 px-2 text-left text-green-600 dark:text-green-400">
                          {toAccount ? toAccount.name : (hasConversion ? '(No Roth account)' : '-')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
                    <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900">Lifetime Total</td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-purple-600 dark:text-purple-400">
                      {formatCurrency(result.yearlyWithdrawals.reduce((sum, y) => sum + y.rothConversionAmount, 0))}
                    </td>
                    <td className="py-2 px-2 text-left text-gray-600 dark:text-gray-400">
                      {/* Get unique from accounts */}
                      {Array.from(new Set(
                        result.yearlyWithdrawals
                          .filter(y => y.rothConversionFromAccountId)
                          .map(y => accounts.find(a => a.id === y.rothConversionFromAccountId)?.name)
                      )).filter(Boolean).join(', ') || '-'}
                    </td>
                    <td className="py-2 px-2 text-left text-gray-600 dark:text-gray-400">
                      {/* Get unique to accounts */}
                      {Array.from(new Set(
                        result.yearlyWithdrawals
                          .filter(y => y.rothConversionToAccountId)
                          .map(y => accounts.find(a => a.id === y.rothConversionToAccountId)?.name)
                      )).filter(Boolean).join(', ') || '-'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-blue-500"></span>
              <span className="text-gray-600 dark:text-gray-400">Pre-tax (RMD required)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-500"></span>
              <span className="text-gray-600 dark:text-gray-400">Roth (tax-free)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-500"></span>
              <span className="text-gray-600 dark:text-gray-400">Taxable (capital gains)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-purple-500"></span>
              <span className="text-gray-600 dark:text-gray-400">HSA</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-indigo-500"></span>
              <span className="text-gray-600 dark:text-gray-400">Social Security</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
