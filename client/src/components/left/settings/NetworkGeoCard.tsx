import type { FC } from '../../../lib/teact/teact';
import {
  memo, useCallback, useEffect, useState,
} from '../../../lib/teact/teact';
import buildClassName from '../../../util/buildClassName';
import { getEthernetString } from '../../../util/ethernetLang';
import useOldLang from '../../../hooks/useOldLang';

import Island from '../../gili/layout/Island';

import styles from './NetworkGeoCard.module.scss';

export interface GeoNetworkInfo {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  org: string;
  mode: 'bypass' | 'custom' | 'direct';
}

function getCountryFlag(code?: string): string {
  if (!code || code.length !== 2 || code === 'UN') return '🌐';
  const upper = code.toUpperCase();
  const first = 127397 + upper.charCodeAt(0);
  const second = 127397 + upper.charCodeAt(1);
  try {
    return String.fromCodePoint(first, second);
  } catch {
    return '🌐';
  }
}

const NetworkGeoCard: FC<{ className?: string }> = ({ className }) => {
  const lang = useOldLang();
  const hermes = (window as any).hermesDesktop;

  const [geoInfo, setGeoInfo] = useState<GeoNetworkInfo | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchGeoInfo = useCallback(async () => {
    if (!hermes?.networkGeoInfo) return;
    setIsLoading(true);
    try {
      const data = await hermes.networkGeoInfo();
      if (data) {
        setGeoInfo(data);
      }
    } catch (err) {
      console.error('[GeoCard] Failed to fetch geo info:', err);
    } finally {
      setIsLoading(false);
    }
  }, [hermes]);

  useEffect(() => {
    fetchGeoInfo();
    const handleNetworkChange = () => {
      setTimeout(fetchGeoInfo, 300);
    };
    window.addEventListener('hermes-network-changed', handleNetworkChange);
    return () => {
      window.removeEventListener('hermes-network-changed', handleNetworkChange);
    };
  }, [fetchGeoInfo]);

  const handleToggleSpoiler = () => {
    setIsRevealed((prev) => !prev);
  };

  return (
    <Island className={buildClassName(styles.geoCardIsland, className)}>
      <div className={styles.geoCardContent}>
        {/* Анимация network.gif перекрашенная в акцентный цвет через mask */}
        <div className={styles.animWrapper}>
          <div className={styles.animGif} />
        </div>

        <div className={styles.infoCol}>
          <div className={styles.headerRow}>
            <span className={styles.countryTitle}>
              <span className={styles.flag}>
                {getCountryFlag(geoInfo?.countryCode)}
              </span>
              <span>
                {geoInfo?.country || (isLoading ? getEthernetString(lang, 'Checking') : 'Локальная сеть')}
              </span>
            </span>
          </div>

          <div className={styles.cityOrg}>
            {[geoInfo?.city, geoInfo?.org].filter(Boolean).join(' • ') || getEthernetString(lang, 'NetworkLocationDesc')}
          </div>

          <div className={styles.ipRow}>
            <div
              className={styles.spoilerButton}
              onClick={handleToggleSpoiler}
              title={isRevealed ? getEthernetString(lang, 'GeoSpoilerClickToHide') : getEthernetString(lang, 'GeoSpoilerClickToShow')}
            >
              {isRevealed ? (
                <span className={styles.spoilerRevealed}>
                  {geoInfo?.ip || '127.0.0.1'}
                </span>
              ) : (
                <span className={styles.spoilerMask}>
                  ••••••••••••••••
                </span>
              )}
            </div>

            <button
              type="button"
              className={buildClassName(styles.refreshBtn, isLoading && styles.spinning)}
              onClick={fetchGeoInfo}
              title={getEthernetString(lang, 'GeoRefresh')}
            >
              <i className="icon icon-sync" />
            </button>
          </div>
        </div>
      </div>
    </Island>
  );
};

export default memo(NetworkGeoCard);
