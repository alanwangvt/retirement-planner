import { Assumptions } from '../types';
import { NumberInput } from './NumberInput';
import { Tooltip } from './Tooltip';

interface AssumptionsFormProps {
  assumptions: Assumptions;
  onChange: (assumptions: Assumptions) => void;
}

const inputClassName = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

export function AssumptionsForm({ assumptions, onChange }: AssumptionsFormProps) {
  const handleChange = (field: keyof Assumptions, value: number | undefined) => {
    onChange({
      ...assumptions,
      [field]: value,
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-600 pb-2">Economic Assumptions</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Inflation Rate (%)
            <Tooltip text="Expected annual inflation rate" />
          </label>
          <NumberInput
            value={assumptions.inflationRate}
            onChange={(val) => handleChange('inflationRate', val)}
            min={0}
            max={10}
            isPercentage
            decimals={1}
            defaultValue={0.03}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Historical average: ~3%</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Safe Withdrawal Rate (%)
            <Tooltip text="Percentage of portfolio to withdraw annually in retirement" />
          </label>
          <NumberInput
            value={assumptions.safeWithdrawalRate}
            onChange={(val) => handleChange('safeWithdrawalRate', val)}
            min={1}
            max={10}
            isPercentage
            decimals={1}
            defaultValue={0.04}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Traditional rule: 4%</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Retirement Return Rate (%)
            <Tooltip text="Expected annual return during retirement (typically more conservative)" />
          </label>
          <NumberInput
            value={assumptions.retirementReturnRate}
            onChange={(val) => handleChange('retirementReturnRate', val)}
            min={0}
            max={15}
            isPercentage
            decimals={1}
            defaultValue={0.05}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Conservative assumption: 5%</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Annual Spending at Retirement ($)
            <Tooltip text="Your desired annual spending amount at retirement start. Leave blank to auto-calculate based on portfolio value and safe withdrawal rate." />
          </label>
          <NumberInput
            value={assumptions.annualSpendingAtRetirement || 0}
            onChange={(val) => handleChange('annualSpendingAtRetirement', val > 0 ? val : undefined)}
            min={0}
            step={1000}
            isPercentage={false}
            decimals={0}
            defaultValue={0}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Optional: Overrides safe withdrawal rate calculation. Leave at $0 for automatic calculation.
          </p>
        </div>
        {(assumptions.rothConversionStrategy ?? 'off') === 'off' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Traditional Withdrawal Fill Target (%)
              <Tooltip text="Fill traditional account withdrawals up to this tax bracket each year. Higher targets reduce large pre-tax balances earlier, smoothing lifetime taxes." />
            </label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[0.10, 0.12, 0.22, 0.24].map(rate => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handleChange('withdrawalBracketFillTarget', rate)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    (assumptions.withdrawalBracketFillTarget ?? 0.12) === rate
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {(rate * 100).toFixed(0)}%
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              12% (default) works well for most. Use 22% if you have a large pre-tax balance to spread tax liability before RMDs force higher brackets.
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Traditional withdrawal fill target is controlled by the Roth Conversion target bracket.
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Use Taxable Accounts for Spending Before Age
            <Tooltip text="Before this age, spending comes from taxable brokerage (capital gains) instead of traditional accounts. Keeps ordinary income low, leaving more bracket room for Roth conversions. Leave blank to disable." />
          </label>
          <NumberInput
            value={assumptions.taxableFirstSpendingAge ?? 0}
            onChange={(val) => handleChange('taxableFirstSpendingAge', val > 0 ? val : undefined)}
            min={0}
            max={100}
            isPercentage={false}
            decimals={0}
            defaultValue={0}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            e.g. set to 62 to use taxable brokerage for spending until Social Security begins. Leave at 0 to disable.
          </p>
        </div>
      </div>
    </div>
  );
}
