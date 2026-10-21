import { memo } from '../../lib/teact/teact';

import buildClassName from '../../util/buildClassName';

import useLastCallback from '../../hooks/useLastCallback';

import './Switcher.scss';

type OwnProps = {
  id?: string;
  name?: string;
  value?: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  inactive?: boolean;
  noAnimation?: boolean;
  onCheck?: (isChecked: boolean) => void;
  onChange?: (isChecked: boolean) => void;
};

const Switcher = ({
  id,
  name,
  value,
  label,
  checked = false,
  disabled,
  inactive,
  noAnimation,
  onCheck,
  onChange,
}: OwnProps) => {
  const handleChange = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.currentTarget.checked;
    onCheck?.(isChecked);
    onChange?.(isChecked);
  });

  const className = buildClassName(
    'Switcher',
    disabled && 'disabled',
    inactive && 'inactive',
    noAnimation && 'no-animation',
  );

  return (
    <label className={className} title={label}>
      <input
        type="checkbox"
        id={id}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
      />
      <span className="widget" />
    </label>
  );
};

export default memo(Switcher);
