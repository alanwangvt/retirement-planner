import { useState } from 'react';
import { Account, Profile, Assumptions, AccumulationResult } from '../types';
import { runSsOptimizer, SsOptimizerResult, SsOptimizerTarget } from '../utils/ssOptimizer';
import type { CountryConfig } from '../countries';

interface SsOptimizerPanelProps {
  accounts: Account[];
  profile: Profile;
  assumptions: Assumptions;
  accumulationResult: AccumulationResult;
  onApplyPrimary: (startAge: number, monthlyBenefit: number) => void;
  onApplySpouse?: (startAge: number, monthlyBenefit: number) => void;
  isMFJ: boolean;
  countryConfig?: CountryConfig;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function SsOptimizerPanel({
  accounts,
  profile,
  assumptions,
  accumulationResult,
  onApplyPrimary,
  onApplySpouse,
  isMFJ,
  countryConfig,
}: SsOptimizerPanelProps) {
  const [result, setResult] = useState<SsOptimizerResult | null>(null);
  const [running, setRunning] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);
  const [target, setTarget] = useState<SsOptimizerTarget>('primary');

  const activeOptions = target === 'primary'
    ? (profile.ssBenefitOptions ?? [])
    : (profile.spouseSsBenefitOptions ?? []);
  const canRun = activeOptions.length >= 2;

  const handleTargetChange = (newTarget: SsOptimizerTarget) => {
    setTarget(newTarget);
    setResult(null);
    setApplied(null);
  };

  const handleRun = () => {
    setRunning(true);
    setResult(null);
    setApplied(null);
    setTimeout(() => {
      try {
        const r = runSsOptimizer(accounts, profile, assumptions, accumulationResult, countryConfig, target);
        setResult(r);
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  const handleApply = (startAge: number, monthlyBenefit: number, idx: number) => {
    if (target === 'spouse' && onApplySpouse) {
      onApplySpouse(startAge, monthlyBenefit);
    } else {
      onApplyPrimary(startAge, monthlyBenefit);
    }
    setApplied(idx);
  };

  const whoLabel = target === 'spouse' ? 'Spouse' : 'Primary';

  return (
    <div className="mt-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
      {/* Header row: title + Primary/Spouse toggle */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h5 className="font-medium text-blue-900 dark:text-blue-200 text-sm">SS Start Age Optimizer</h5>
        {isMFJ && (
          <div className="flex rounded-md overflow-hidden border border-blue-300 dark:border-blue-600 text-xs flex-shrink-0">
            <button
              type="button"
              onClick={() => handleTargetChange('primary')}
              className={`px-2.5 py-1 font-medium transition-colors ${
                target === 'primary'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-gray-600'
              }`}
            >
              Primary
            </button>
            <button
              type="button"
              onClick={() => handleTargetChange('spouse')}
              className={`px-2.5 py-1 font-medium transition-colors border-l border-blue-300 dark:border-blue-600 ${
                target === 'spouse'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-gray-600'
              }`}
            >
              Spouse
            </button>
          </div>
        )}
      </div>

      {/* Hint + Run button row */}
      <div className="flex items-center justify-between gap-2">
        {!canRun ? (
          <p className="text-xs text-blue-700 dark:text-blue-400">
            {isMFJ
              ? `Add at least 2 SS options for ${whoLabel} above to enable.`
              : 'Add at least 2 SS options above to enable.'}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun || running}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {running ? 'Running…' : 'Find Optimal Age'}
        </button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          {/* Recommendation */}
          <div className="rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-3 text-sm text-green-800 dark:text-green-200">
            ✓ {result.explanation}
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-blue-200 dark:border-blue-700">
                  <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-300">Start Age</th>
                  <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-300">Monthly Benefit</th>
                  <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-300">Lifetime SS</th>
                  <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-300">Spendable Income</th>
                  <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-300">Terminal Balance</th>
                  <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-300">Total Wealth</th>
                  <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-300">Taxes Paid</th>
                  <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-300">Portfolio Depletes</th>
                  <th className="py-1.5 px-2" />
                </tr>
              </thead>
              <tbody>
                {result.options.map((opt, i) => {
                  const isBest = i === 0;
                  const deltaVsBest = opt.totalWealth - result.options[0].totalWealth;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-blue-100 dark:border-blue-800 ${
                        isBest ? 'bg-green-50 dark:bg-green-900/20' : ''
                      }`}
                    >
                      <td className="py-1.5 px-2 font-medium text-gray-900 dark:text-white">
                        {isBest && <span className="mr-1 text-green-600 dark:text-green-400">★</span>}
                        Age {opt.option.startAge}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-700 dark:text-gray-300">
                        ${opt.option.monthlyBenefit.toLocaleString()}/mo
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-700 dark:text-gray-300">
                        {formatCurrency(opt.lifetimeSocialSecurityIncome)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-700 dark:text-gray-300">
                        {formatCurrency(opt.totalSpendableIncome)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-700 dark:text-gray-300">
                        {formatCurrency(opt.terminalBalance)}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-mono font-semibold ${
                        isBest ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {formatCurrency(opt.totalWealth)}
                        {!isBest && (
                          <span className="ml-1 text-red-500 dark:text-red-400 font-normal">
                            ({formatCurrency(deltaVsBest)})
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-700 dark:text-gray-300">
                        {formatCurrency(opt.lifetimeTaxesPaid)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-700 dark:text-gray-300">
                        {opt.portfolioDepletionAge ? `Age ${opt.portfolioDepletionAge}` : 'Never'}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleApply(opt.option.startAge, opt.option.monthlyBenefit, i)}
                          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                            applied === i
                              ? 'bg-green-600 text-white cursor-default'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                          disabled={applied === i}
                        >
                          {applied === i ? 'Applied ✓' : 'Apply'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
