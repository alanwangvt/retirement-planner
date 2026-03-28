import { useState } from 'react';
import { Account, Profile, Assumptions, AccumulationResult } from '../types';
import { runSsOptimizer, SsOptimizerResult } from '../utils/ssOptimizer';
import type { CountryConfig } from '../countries';

interface SsOptimizerPanelProps {
  accounts: Account[];
  profile: Profile;
  assumptions: Assumptions;
  accumulationResult: AccumulationResult;
  onApply: (startAge: number, monthlyBenefit: number) => void;
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
  onApply,
  countryConfig,
}: SsOptimizerPanelProps) {
  const [result, setResult] = useState<SsOptimizerResult | null>(null);
  const [running, setRunning] = useState(false);
  const [applied, setApplied] = useState<number | null>(null); // index of applied option

  const options = profile.ssBenefitOptions ?? [];
  const canRun = options.length >= 2;

  const handleRun = () => {
    setRunning(true);
    setResult(null);
    setApplied(null);
    // Use setTimeout to yield to the browser before the heavy computation
    setTimeout(() => {
      try {
        const r = runSsOptimizer(accounts, profile, assumptions, accumulationResult, countryConfig);
        setResult(r);
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  const handleApply = (startAge: number, monthlyBenefit: number, idx: number) => {
    onApply(startAge, monthlyBenefit);
    setApplied(idx);
  };

  return (
    <div className="mt-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h5 className="font-medium text-blue-900 dark:text-blue-200 text-sm">SS Start Age Optimizer</h5>
          {!canRun && (
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
              Add at least 2 SS options above to enable the optimizer.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun || running}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {running ? 'Running…' : 'Find Optimal SS Start Age'}
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
                  <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-300">Lifetime Income</th>
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
                        {formatCurrency(opt.totalAfterTaxIncome)}
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
