import { memo, useEffect, useState } from '../../../lib/teact/teact';

import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';

import Button from '../../ui/Button';
import InputText from '../../ui/InputText';
import Modal from '../../ui/Modal';

import styles from './PromptDialog.module.scss';

export type OwnProps = {
  isOpen: boolean;
  title: string;
  subtitle?: React.ReactNode;
  placeholder: string;
  submitText?: string;
  maxLength?: number;
  initialValue?: string;
  onClose: NoneToVoidFunction;
  onSubmit: (text: string) => void;
};

const PromptDialog = ({
  isOpen,
  title,
  subtitle,
  placeholder,
  submitText,
  maxLength,
  initialValue = '',
  onClose,
  onSubmit,
}: OwnProps) => {
  const lang = useOldLang();

  const [text, setText] = useState(initialValue);

  useEffect(() => {
    if (isOpen) {
      setText(initialValue || '');
    }
  }, [isOpen, initialValue]);

  const handleTextChange = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
  });

  const handleSubmit = useLastCallback(() => {
    onSubmit(text);
  });

  return (
    <Modal
      className="narrow"
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      isSlim
    >
      {Boolean(subtitle) && (
        <div className={styles.subtitle}>
          {subtitle}
        </div>
      )}
      <InputText
        placeholder={placeholder}
        value={text}
        onChange={handleTextChange}
        onInput={(e: any) => {
          setText(e?.currentTarget?.value ?? e?.target?.value ?? '');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
        }}
        maxLength={maxLength}
        autoFocus
      />
      <div className="dialog-buttons mt-2">
        <Button className="confirm-dialog-button" style="text-transform: none !important;" onClick={handleSubmit}>
          {submitText || lang('Save')}
        </Button>
        <Button className="confirm-dialog-button" isText style="text-transform: none !important;" onClick={onClose}>
          {lang('Cancel')}
        </Button>
      </div>
    </Modal>
  );
};

export default memo(PromptDialog);
