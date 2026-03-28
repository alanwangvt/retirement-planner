import { Profile, FilingStatus, SsBenefitOption } from '../types';
import { NumberInput } from './NumberInput';
import { Tooltip } from './Tooltip';
import { useCountry } from '../contexts/CountryContext';

interface ProfileFormProps {
  profile: Profile;
  onChange: (profile: Profile) => void;
}

const inputClassName = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

export function ProfileForm({ profile, onChange }: ProfileFormProps) {
  const { country } = useCountry();

  const handleChange = (field: keyof Profile, value: number | string) => {
    onChange({
      ...profile,
      [field]: value,
    });
  };

  // Sync ssBenefitOptions changes and keep the active socialSecurityStartAge/Benefit
  // in sync with the first row so the main simulation always has a valid scenario.
  const handleSsOptionChange = (index: number, field: keyof SsBenefitOption, value: number) => {
    const updated = (profile.ssBenefitOptions ?? []).map((opt, i) =>
      i === index ? { ...opt, [field]: value } : opt
    );
    const first = updated[0];
    onChange({
      ...profile,
      ssBenefitOptions: updated,
      socialSecurityStartAge: first?.startAge ?? profile.socialSecurityStartAge,
      socialSecurityBenefit: first?.monthlyBenefit ?? profile.socialSecurityBenefit,
    });
  };

  const handleSsOptionAdd = () => {
    const existing = profile.ssBenefitOptions ?? [];
    const newOption: SsBenefitOption = {
      startAge: country === 'CA' ? 65 : 67,
      monthlyBenefit: 0,
    };
    const updated = [...existing, newOption];
    onChange({
      ...profile,
      ssBenefitOptions: updated,
      socialSecurityStartAge: updated[0].startAge,
      socialSecurityBenefit: updated[0].monthlyBenefit,
    });
  };

  const handleSsOptionRemove = (index: number) => {
    const updated = (profile.ssBenefitOptions ?? []).filter((_, i) => i !== index);
    onChange({
      ...profile,
      ssBenefitOptions: updated,
      socialSecurityStartAge: updated[0]?.startAge ?? profile.socialSecurityStartAge,
      socialSecurityBenefit: updated[0]?.monthlyBenefit ?? profile.socialSecurityBenefit,
    });
  };

  // Initialize ssBenefitOptions from existing single-field values on first render
  const ssOptions: SsBenefitOption[] = profile.ssBenefitOptions ?? (
    (profile.socialSecurityStartAge || profile.socialSecurityBenefit)
      ? [{ startAge: profile.socialSecurityStartAge ?? (country === 'CA' ? 65 : 67), monthlyBenefit: profile.socialSecurityBenefit ?? 0 }]
      : []
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-600 pb-2">Personal Information</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Current Age
          </label>
          <NumberInput
            value={profile.currentAge}
            onChange={(val) => handleChange('currentAge', val)}
            min={18}
            max={100}
            defaultValue={35}
            className={inputClassName}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Retirement Age
          </label>
          <NumberInput
            value={profile.retirementAge}
            onChange={(val) => handleChange('retirementAge', val)}
            min={18}
            max={100}
            defaultValue={65}
            className={inputClassName}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Life Expectancy
          </label>
          <NumberInput
            value={profile.lifeExpectancy}
            onChange={(val) => handleChange('lifeExpectancy', val)}
            min={18}
            max={120}
            defaultValue={90}
            className={inputClassName}
          />
        </div>

        {country === 'US' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Filing Status
            </label>
            <select
              value={profile.filingStatus}
              onChange={(e) => handleChange('filingStatus', e.target.value as FilingStatus)}
              className={inputClassName}
            >
              <option value="single">Single</option>
              <option value="married_filing_jointly">Married Filing Jointly</option>
            </select>
          </div>
        )}

        {country === 'CA' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Province
            </label>
            <select
              value={profile.region || 'ON'}
              onChange={(e) => handleChange('region', e.target.value)}
              className={inputClassName}
            >
              <option value="AB">Alberta</option>
              <option value="BC">British Columbia</option>
              <option value="MB">Manitoba</option>
              <option value="NB">New Brunswick</option>
              <option value="NL">Newfoundland and Labrador</option>
              <option value="NS">Nova Scotia</option>
              <option value="NT">Northwest Territories</option>
              <option value="NU">Nunavut</option>
              <option value="ON">Ontario</option>
              <option value="PE">Prince Edward Island</option>
              <option value="QC">Quebec</option>
              <option value="SK">Saskatchewan</option>
              <option value="YT">Yukon</option>
            </select>
          </div>
        )}

        {country === 'US' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              State Income Tax Rate (%)
            </label>
            <NumberInput
              value={profile.stateTaxRate || 0}
              onChange={(val) => handleChange('stateTaxRate', val)}
              min={0}
              max={15}
              isPercentage
              decimals={1}
              defaultValue={0.05}
              className={inputClassName}
            />
          </div>
        )}
      </div>

      <h4 className="text-md font-medium text-gray-800 dark:text-gray-200 mt-6 mb-3">
        {country === 'CA' ? 'CPP (Canada Pension Plan)' : 'Social Security'}
        <Tooltip text={country === 'CA'
          ? 'Enter one or more (start age, monthly benefit) scenarios to compare with the optimizer.'
          : 'Enter one or more (start age, monthly benefit) scenarios to compare with the SS optimizer. The first row is used in the main simulation.'}
        />
      </h4>

      <div className="space-y-2">
        {ssOptions.length > 0 && (
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center mb-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Start Age</span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Monthly Benefit ($)</span>
            <span />
          </div>
        )}
        {ssOptions.map((opt, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <NumberInput
              value={opt.startAge}
              onChange={(val) => handleSsOptionChange(i, 'startAge', val)}
              min={country === 'CA' ? 60 : 62}
              max={70}
              defaultValue={country === 'CA' ? 65 : 67}
              className={inputClassName}
            />
            <NumberInput
              value={opt.monthlyBenefit}
              onChange={(val) => handleSsOptionChange(i, 'monthlyBenefit', val)}
              min={0}
              placeholder="0"
              defaultValue={0}
              className={inputClassName}
            />
            <button
              type="button"
              onClick={() => handleSsOptionRemove(i)}
              className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleSsOptionAdd}
          className="mt-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          + Add option
        </button>
        {ssOptions.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            First row is used in the main simulation. Add more rows to enable the SS optimizer.
          </p>
        )}
      </div>

      {/* OAS Section - Canada Only */}
      {country === 'CA' && (
        <>
          <h4 className="text-md font-medium text-gray-800 dark:text-gray-200 mt-6 mb-3">
            OAS (Old Age Security)
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Annual Benefit ($ at start age)
                <Tooltip text="Your estimated annual OAS benefit in today's dollars. Max is ~$9,000/year in 2024." />
              </label>
              <NumberInput
                value={profile.secondaryBenefitAmount || 0}
                onChange={(val) => handleChange('secondaryBenefitAmount', val)}
                min={0}
                placeholder="0"
                defaultValue={0}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Age
              </label>
              <NumberInput
                value={profile.secondaryBenefitStartAge || 65}
                onChange={(val) => handleChange('secondaryBenefitStartAge', val)}
                min={65}
                max={70}
                defaultValue={65}
                className={inputClassName}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
