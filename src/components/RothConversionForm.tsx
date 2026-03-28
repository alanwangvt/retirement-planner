import { Assumptions, RothConversionStrategy } from '../types';
import { NumberInput } from './NumberInput';
import { Tooltip } from './Tooltip';
import { DEFAULT_ASSUMPTIONS } from '../utils/constants';

interface RothConversionFormProps {
  assumptions: Assumptions;
  onChange: (assumptions: Assumptions) => void;
}

const inputClassName = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

export function RothConversionForm({ assumptions, onChange }: RothConversionFormProps) {
  const handleChange = (field: keyof Assumptions, value: number | RothConversionStrategy | undefined) => {
    onChange({
      ...assumptions,
      [field]: value,
    });
  };

  const strategy = assumptions.rothConversionStrategy ?? DEFAULT_ASSUMPTIONS.rothConversionStrategy;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Conversion Strategy
          <Tooltip text="Auto strategy uses a two-pass algorithm to find the optimal conversion amount each year — projecting future RMD income to determine what bracket to fill, up to your chosen ceiling." />
        </label>
        <div className="space-y-2">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="rothConversionStrategy"
              value="off"
              checked={strategy === 'off'}
              onChange={(e) => handleChange('rothConversionStrategy', e.target.value as RothConversionStrategy)}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-900 dark:text-white">Off - No conversions</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="rothConversionStrategy"
              value="auto"
              checked={strategy === 'auto'}
              onChange={(e) => handleChange('rothConversionStrategy', e.target.value as RothConversionStrategy)}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-900 dark:text-white">Auto - Bracket-optimized conversions</span>
          </label>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Auto uses a two-pass algorithm each year: it first projects future forced income (RMDs + Social Security) to identify your peak future marginal rate, then converts up to the highest bracket that is both justified by that future rate and within your Max Conversion Bracket ceiling. The standard deduction floor is always filled at 0% cost. IRMAA tiers are only crossed when the resulting tax savings exceed the Medicare surcharge.
        </p>
      </div>

      {strategy === 'auto' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Max Conversion Bracket (%)
            <Tooltip text="The algorithm will never convert income into a bracket above this rate. Acts as a ceiling on how aggressive conversions can be." />
          </label>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[0.12, 0.22, 0.24, 0.32].map(rate => (
              <button
                key={rate}
                onClick={() => handleChange('rothConversionTargetRate', rate)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  (assumptions.rothConversionTargetRate ?? DEFAULT_ASSUMPTIONS.rothConversionTargetRate) === rate
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {(rate * 100).toFixed(0)}%
              </button>
            ))}
          </div>
          <NumberInput
            value={assumptions.rothConversionTargetRate ?? DEFAULT_ASSUMPTIONS.rothConversionTargetRate}
            onChange={(val) => handleChange('rothConversionTargetRate', val)}
            min={0}
            max={0.37}
            isPercentage
            decimals={2}
            defaultValue={DEFAULT_ASSUMPTIONS.rothConversionTargetRate}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            22% is a common ceiling. The algorithm may convert less if future rates don't justify a higher bracket.
          </p>
        </div>
      )}
    </div>
  );
}
