import type { FC } from '../../../lib/teact/teact';
import { memo, useMemo } from '../../../lib/teact/teact';

import type { ApiMessage } from '../../../api/types';

import { getEthernetString } from '../../../util/ethernetLang';
import { formatDateTimeToString } from '../../../util/dates/oldDateFormat';
import renderText from '../../common/helpers/renderText';
import useLang from '../../../hooks/useLang';

import Button from '../../ui/Button';
import Modal from '../../ui/Modal';

import styles from './EditHistoryModal.module.scss';

export type OwnProps = {
  isOpen: boolean;
  onClose: () => void;
  message?: ApiMessage;
};

type HistoryRevision = {
  label: string;
  dateStr: string;
  text: string;
  isCurrent?: boolean;
};

const EditHistoryModal: FC<OwnProps> = ({ isOpen, onClose, message }) => {
  const lang = useLang();

  const revisions = useMemo<HistoryRevision[]>(() => {
    if (!message) return [];

    const list: HistoryRevision[] = [];
    const editHistory = message.editHistory || [];

    // Historical revisions
    editHistory.forEach((item, index) => {
      const dateStr = formatDateTimeToString(item.date * 1000, lang.code, true);
      list.push({
        label: index === 0
          ? (getEthernetString(lang, 'EthernetOriginalMessage') || 'Original')
          : `${getEthernetString(lang, 'EthernetRevision') || 'Revision'} ${index + 1}`,
        dateStr,
        text: item.text?.text || '',
      });
    });

    // Current version
    const currentDate = message.editDate || message.date;
    const currentDateStr = formatDateTimeToString(currentDate * 1000, lang.code, true);
    list.push({
      label: getEthernetString(lang, 'EthernetCurrentVersion') || 'Current',
      dateStr: currentDateStr,
      text: message.content?.text?.text || '',
      isCurrent: true,
    });

    return list.reverse();
  }, [lang, message]);

  if (!message) return undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getEthernetString(lang, 'EthernetEditHistory') || 'Edit History'}
      className={styles.modal}
    >
      <div className={styles.container}>
        {revisions.map((rev, i) => (
          <div key={i} className={rev.isCurrent ? styles.currentCard : styles.revisionCard}>
            <div className={styles.cardHeader}>
              <span className={styles.revisionLabel}>
                {rev.label}
                {rev.isCurrent && <span className={styles.currentBadge}>✓</span>}
              </span>
              <span className={styles.revisionDate}>{rev.dateStr}</span>
            </div>
            <div className={styles.cardBody}>
              {renderText(rev.text, ['emoji', 'links', 'simple_markdown'])}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <Button onClick={onClose} size="smaller">
          {lang('Close')}
        </Button>
      </div>
    </Modal>
  );
};

export default memo(EditHistoryModal);
