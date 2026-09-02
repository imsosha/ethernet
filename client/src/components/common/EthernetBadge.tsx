import type { FC } from '../../lib/teact/teact';
import {
  memo,
  useCallback,
  useEffect,
  useState,
} from '../../lib/teact/teact';
import { getActions } from '../../global';

import type { ApiPeer } from '../../api/types';
import type { CustomPeer } from '../../types';
import type { EthernetBadgeType } from '../../util/ethernetBadges';
import {
  addBadgesChangeListener,
  calculatePeerBadge,
  getEthernetBadgeType,
} from '../../util/ethernetBadges';
import { selectPeer, selectTheme } from '../../global/selectors';
import useSelector from '../../hooks/data/useSelector';
import usePeerColor from '../../hooks/usePeerColor';
import buildClassName from '../../util/buildClassName';
import stopEvent from '../../util/stopEvent';

import Modal from '../ui/Modal';
import Button from '../ui/Button';

import styles from './EthernetBadge.module.scss';

type OwnProps = {
  peer?: ApiPeer | CustomPeer;
  peerId?: string | number;
  className?: string;
  size?: number;
};

// SVG иконка Ethernet из /docs/ethernet-svg-logo-without-backdrop
export const EthernetIconSvg: FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg
    viewBox="0 0 133 133"
    className={buildClassName(styles.icon, className)}
    style={style}
    xmlns="http://www.w3.org/2000/svg"
  >
    <g transform="matrix(0.04392,0,0,0.04392,66.666667,66.666667)">
      <g transform="matrix(1,0,0,1,-1333.333333,-1333.333333)">
        <g transform="matrix(4.166667,0,0,4.166667,0,0)">
          <path
            d="M236,161.5C234.45,160.73 232.26,159.39 230.5,159.38C220.9,159.3 205.51,171.97 197.97,177.47C188.39,184.46 179.6,192.55 170.03,199.53C166.8,201.89 164.27,205.17 161.03,207.53C157.44,210.15 154.97,214.24 151.5,217C143.8,223.12 135.19,230.71 129,238.5C123.8,245.05 117.93,251.57 112,257.5C103.94,265.56 98.08,275.59 90.5,284C86.81,288.1 82.34,291.64 76.69,288.81C68.76,284.85 70.45,278.15 71.81,271.31C73.98,260.48 76.29,249.87 79.81,239.31C95.75,191.5 121.8,148.62 163.03,118.53C195.12,95.12 234.21,76.19 273.53,70.03C287.62,67.82 302.05,68 316.5,68C333.25,68 350.13,67.47 366.47,70.03C374.34,71.26 381.95,73.9 389.69,75.81C445.23,89.52 495.96,126.11 529.47,172.03C544.4,192.49 556.13,217.77 562.19,242.31C562.88,245.13 564.24,247.84 564.81,250.69C566.53,259.3 568.61,267.89 569.97,276.53C570.95,282.82 570.99,289.26 571.97,295.53C572.86,301.22 572,307.73 572,313.5C572,326.16 574.63,340.96 562.97,349.47C555.46,354.95 547.44,354 538.5,354L288.5,354C281.27,354 272.77,352.77 265.69,354.19C257.49,355.83 250.07,364.26 249.03,372.53C248.74,374.84 249.65,378.16 250.03,380.47C254.14,405.6 269.9,432.36 294.69,441.81C303.42,445.14 312.41,446.54 321.53,447.97C329.81,449.27 344.23,446.15 352.31,443.81C365.17,440.1 378.69,428.63 386.47,417.97C392.31,409.96 395.54,400.59 404.03,394.53C414.61,386.97 428.21,389 440.5,389L517.5,389C525.95,389 546.56,386.96 552.97,391.53C557.79,394.97 561.67,401.59 561.63,407.5C561.6,411.05 558.43,415.42 557.19,418.69C553.91,427.28 549.49,436.29 544.53,444.03C543.33,445.9 542.67,448.1 541.47,449.97C534.6,460.68 526.93,470.74 519.47,480.97C517.81,483.24 515.19,484.76 513.53,487.03C497.72,508.69 469.7,526.82 447.34,540.84C443.41,543.31 438.81,545.08 434.66,547.16C410.79,559.09 385.47,566.9 359.47,570.97C356.87,571.38 354.13,570.62 351.53,571.03C343.03,572.36 334.24,572 325.5,572C308.1,572 290.51,572.63 273.53,569.97C239.76,564.68 206.81,550.02 177.97,531.53C160.78,520.51 138.65,503.72 126.47,487.03C123.56,483.05 119.44,479.96 116.53,475.97C106.2,461.81 96.76,447.49 88.84,431.66C82.61,419.18 77.47,406.82 80.19,392.69C81.76,384.51 86.49,377.69 89.5,370C93.83,358.94 99.53,347.41 105.84,337.34C109.38,331.71 111.63,325.28 115.16,319.66C125.14,303.74 134.45,287.22 145.53,272.03C153.4,261.25 161.68,250.8 169.53,240.03C172.59,235.83 176.47,232.23 179.53,228.03C183.69,222.33 189.61,218.03 194,212.5C201.69,202.83 211.2,194.3 220,185.5C226.58,178.92 235.35,171.29 236,161.5ZM313.69,193.19C286.44,198.43 265.15,211.19 254.81,238.31C250.61,249.34 246.28,260.09 257.5,269C265.92,275.69 279.41,273 289.5,273L364.5,273C376.96,273 388.28,275.44 396.47,263.97C403.5,254.13 396.93,240.88 392.16,231.34C379.24,205.52 356.02,193 327.5,193C323.07,193 318.04,192.35 313.69,193.19Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="0.25px"
          />
        </g>
      </g>
    </g>
  </svg>
);

const EthernetBadge: FC<OwnProps> = ({ peer, peerId, className, size }) => {
  const { openChatByUsername } = getActions();
  const effectivePeerId = peer && 'id' in peer ? peer.id : peerId;
  const peerFromState = useSelector((global) => (effectivePeerId ? selectPeer(global, String(effectivePeerId)) : undefined));
  const theme = useSelector(selectTheme);

  const resolvedPeer = peer || peerFromState;
  const { className: peerColorClassName, style: peerColorStyle } = usePeerColor({
    peer: resolvedPeer,
    color: resolvedPeer && 'color' in resolvedPeer ? resolvedPeer.color : undefined,
    theme,
  });

  const [badgeType, setBadgeType] = useState<EthernetBadgeType | undefined>(() => getEthernetBadgeType(effectivePeerId));
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const check = async () => {
      if (!effectivePeerId) {
        if (isMounted) setBadgeType(undefined);
        return;
      }
      const type = await calculatePeerBadge(effectivePeerId);
      if (isMounted) {
        setBadgeType(type);
      }
    };

    check();
    const unsubscribe = addBadgesChangeListener(check);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [effectivePeerId]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    stopEvent(e);
    if (badgeType === 'support') {
      setIsModalOpen(true);
    }
  }, [badgeType]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleChannelClick = useCallback((e: React.MouseEvent) => {
    stopEvent(e);
    setIsModalOpen(false);
    openChatByUsername({ username: 'ethernetgram' });
  }, [openChatByUsername]);

  if (!badgeType) {
    return null;
  }

  const tooltip = badgeType === 'development'
    ? 'Разработчик Ethernet'
    : 'Саппортер Ethernet';

  const iconStyle = size ? { width: `${size}px`, height: `${size}px` } : undefined;

  return (
    <>
      <span
        className={buildClassName(
          styles.badge,
          styles[badgeType],
          peerColorClassName,
          className,
        )}
        style={peerColorStyle}
        data-tooltip={tooltip}
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        <EthernetIconSvg style={iconStyle} />
      </span>

      {badgeType === 'support' && (
        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          className={styles.supporterModal}
        >
          <div
            className={buildClassName(styles.modalIconWrapper, peerColorClassName)}
            style={peerColorStyle}
          >
            <EthernetIconSvg />
          </div>
          <div className={styles.modalTitle}>Ethernet Supporter</div>
          <div className={styles.modalText}>
            За поддержку проекта ethernet.{' '}
            <a
              href="https://t.me/ethernetgram"
              onClick={handleChannelClick}
              className={peerColorClassName}
              style={peerColorStyle}
            >
              @ethernetgram
            </a>
          </div>
          <Button onClick={handleCloseModal} isText>
            Закрыть
          </Button>
        </Modal>
      )}
    </>
  );
};

export default memo(EthernetBadge);
